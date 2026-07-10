// @ts-check
"use strict";
// عميل ص LSP (SAD-01، الطبقة الأولى): يُفعّل الذكاء اللغويّ البنيويّ للغة ص داخل محراب عبر
// خادم sad-lsp المدمج. اليوم الأوّل: تشخيصات حيّة (publishDiagnostics → لوحة المشاكل + تموّجات)،
// مزامنة مستند كاملة (Full — تفادي حساب إزاحات UTF-16 التزايديّة)، وإكمال/تحويم/تعريف عند الطلب.
// ميزات الخادم الأخرى (مراجع/تسمية/تنسيق/رموز دلاليّة…) تُوصَل تدريجيًّا خلف فحص القدرات.
//
// مواضع VS Code بوحدات UTF-16 (سطر، حرف) = مواضع LSP نفسها (تفاوضنا positionEncoding=utf-16) ⇒
// تحويل مباشر بلا حساب إزاحات. مزوّدات الميزات تُرجع undefined عندما لا يكون الخادم جاهزًا/قادرًا.

const vscode = require("vscode");
const { SadLspProcess } = require("./sad-lsp-process.js");
const {
  M_DID_OPEN,
  M_DID_CHANGE,
  M_DID_SAVE,
  M_DID_CLOSE,
  M_COMPLETION,
  M_HOVER,
  M_DEFINITION,
  M_SEMANTIC_TOKENS_FULL,
  SEMANTIC_TOKEN_TYPES,
  SEMANTIC_TOKEN_MODIFIERS,
  M_PUBLISH_DIAGNOSTICS,
  SEVERITY_ERROR,
  SEVERITY_WARNING,
  SEVERITY_INFORMATION,
} = require("./lsp-protocol.js");

// معرّف لغة ص (يطابق contributes.languages[].id) واسم الأمر والقناة.
const SAD_LANGUAGE_ID = "sad";
const RESTART_COMMAND = "sad.lsp.restart";
const OUTPUT_CHANNEL_NAME = "ص — خادم اللغة";
const DIAGNOSTICS_SOURCE = "ص";
// قسم الإعدادات ومفتاح تفعيل تشخيصات LSP الحيّة. عند التفعيل (الافتراضيّ) يملك الخادمُ التشخيصَ،
// ويتنحّى جسر فحص-الحفظ (SAD-02) عبر API الامتداد المُصدَّر (isDiagnosticsActive) لتفادي الازدواج.
const CFG_SECTION = "sad.lsp";
const DIAGNOSTICS_KEY = "diagnostics";
// مخطَّط مستندات الملفّات (نزامن ملفّات ص المحفوظة فقط؛ untitled لا مسار له للخادم). [C9]
const FILE_SCHEME = "file";
// مهلة طلبات الميزات (إكمال/تحويم/تعريف/تلوين): خادم حيّ عالِق لا يُعلّق المزوّد للأبد، والطلب
// المعلّق يُلغى فلا يتراكم في _pending (proc.requestWithTimeout ⇒ rpc.cancelPending). [S5 / تدقيق كليّ #4]
const REQUEST_TIMEOUT_MS = 5000;

/** نصوص واجهة (عربيّة-أوّلًا = بيانات واجهة، استثناء مقبول لقاعدة السلاسل الحرفيّة). */
const COPY = {
  restarted: "أُعيد تشغيل خادم ص اللغويّ.",
};

/** محدِّد مستندات ص (للمزوّدات ومزامنة المستند). */
const SAD_SELECTOR = { language: SAD_LANGUAGE_ID, scheme: FILE_SCHEME };

// ── تحويلات LSP ⇄ VS Code (مواضع UTF-16 متطابقة، تحويل مباشر) ──

/** {line, character} من موضع VS Code. */
function toLspPosition(pos) {
  return { line: pos.line, character: pos.character };
}

/** vscode.Range من مدى LSP. */
function toVscodeRange(r) {
  if (!r || !r.start || !r.end) return new vscode.Range(0, 0, 0, 0);
  return new vscode.Range(r.start.line, r.start.character, r.end.line, r.end.character);
}

/** vscode.DiagnosticSeverity من درجة LSP. */
function toVscodeSeverity(sev) {
  switch (sev) {
    case SEVERITY_ERROR:
      return vscode.DiagnosticSeverity.Error;
    case SEVERITY_WARNING:
      return vscode.DiagnosticSeverity.Warning;
    case SEVERITY_INFORMATION:
      return vscode.DiagnosticSeverity.Information;
    default:
      return vscode.DiagnosticSeverity.Hint;
  }
}

/** vscode.Diagnostic من تشخيص LSP. */
function toVscodeDiagnostic(d) {
  const diag = new vscode.Diagnostic(
    toVscodeRange(d.range),
    String(d.message || ""),
    toVscodeSeverity(d.severity),
  );
  diag.source = d.source || DIAGNOSTICS_SOURCE;
  if (d.code !== undefined && d.code !== null) diag.code = d.code;
  if (Array.isArray(d.relatedInformation) && d.relatedInformation.length > 0) {
    diag.relatedInformation = d.relatedInformation
      .filter((ri) => ri && ri.location)
      .map(
        (ri) =>
          new vscode.DiagnosticRelatedInformation(
            new vscode.Location(vscode.Uri.parse(ri.location.uri), toVscodeRange(ri.location.range)),
            String(ri.message || ""),
          ),
      );
  }
  return diag;
}

/** vscode.MarkdownString/string من محتوى تحويم LSP (MarkupContent | string | array). */
function toHoverContents(contents) {
  const out = [];
  const push = (c) => {
    if (c === null || c === undefined) return;
    if (typeof c === "string") {
      out.push(new vscode.MarkdownString(c));
    } else if (typeof c === "object" && typeof c.value === "string") {
      // MarkupContent {kind, value} أو {language, value} (MarkedString قديم).
      if (c.language) {
        const md = new vscode.MarkdownString();
        md.appendCodeblock(c.value, c.language);
        out.push(md);
      } else {
        out.push(new vscode.MarkdownString(c.value));
      }
    }
  };
  if (Array.isArray(contents)) contents.forEach(push);
  else push(contents);
  return out;
}

/** vscode.Location[] من نتيجة تعريف LSP (Location | Location[] | LocationLink[]). */
function toDefinitionLocations(result) {
  if (!result) return [];
  const arr = Array.isArray(result) ? result : [result];
  const locs = [];
  for (const item of arr) {
    if (!item) continue;
    if (item.targetUri && item.targetRange) {
      // LocationLink
      locs.push(new vscode.Location(vscode.Uri.parse(item.targetUri), toVscodeRange(item.targetSelectionRange || item.targetRange)));
    } else if (item.uri && item.range) {
      // Location
      locs.push(new vscode.Location(vscode.Uri.parse(item.uri), toVscodeRange(item.range)));
    }
  }
  return locs;
}

/** vscode.CompletionItem[] من نتيجة إكمال LSP (CompletionItem[] | CompletionList). */
function toCompletionItems(result) {
  if (!result) return [];
  const items = Array.isArray(result) ? result : Array.isArray(result.items) ? result.items : [];
  return items.map((it) => {
    const item = new vscode.CompletionItem(
      String(it.label || ""),
      it.kind ? it.kind - 1 : undefined, // LSP CompletionItemKind يبدأ من 1، vscode من 0.
    );
    if (it.detail) item.detail = String(it.detail);
    if (it.documentation) {
      item.documentation =
        typeof it.documentation === "string"
          ? it.documentation
          : new vscode.MarkdownString(String(it.documentation.value || ""));
    }
    if (it.insertText) item.insertText = String(it.insertText);
    if (it.filterText) item.filterText = String(it.filterText);
    if (it.sortText) item.sortText = String(it.sortText);
    return item;
  });
}

/**
 * vscode.SemanticTokens من نتيجة LSP semanticTokens/full [SAD-07]. ترميز البيانات في LSP (خماسيّات
 * نسبيّة: [ΔسطR، Δعمود، طول، نوع، معدّلات]) **مطابق** لترميز VS Code ⇒ تمرير مباشر لمصفوفة الأعداد.
 * يُرجع undefined عند غياب البيانات. resultId (إن وُجد) يُمرَّر لدعم التحديثات المتزايدة مستقبلًا.
 */
function toSemanticTokens(result) {
  if (!result || !Array.isArray(result.data)) return undefined;
  return new vscode.SemanticTokens(new Uint32Array(result.data), result.resultId);
}

/**
 * هل يطابق مفتاح الرموز الدلاليّة (legend) الذي يعلنه الخادم مفتاحَنا الثابت **ترتيبًا**؟ فهارس
 * البيانات تشير إلى المفتاح، فأيّ تباعد ترتيب ⇒ تلوين خاطئ. عند عدم التطابق نمتنع عن التلوين
 * الدلاليّ (نتركه لإبراز TextMate) بدل تلوين مضلِّل. [SAD-07، خطر مراجعة]
 */
function serverLegendMatches(caps) {
  const legend = caps && caps.semanticTokensProvider && caps.semanticTokensProvider.legend;
  if (!legend || !Array.isArray(legend.tokenTypes) || !Array.isArray(legend.tokenModifiers)) return false;
  const sameOrder = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  return sameOrder(legend.tokenTypes, SEMANTIC_TOKEN_TYPES) &&
    sameOrder(legend.tokenModifiers, SEMANTIC_TOKEN_MODIFIERS);
}

/**
 * منسّق مزامنة المستند: يرسل didOpen/didChange(Full)/didSave/didClose لمستندات ص فقط.
 * يتتبّع المستندات المفتوحة كي يُعيد فتحها بعد إعادة تشغيل الخادم.
 */
class DocumentSync {
  /** @param {SadLspProcess} proc */
  constructor(proc) {
    this._proc = proc;
    /** @type {Set<string>} URIs المفتوحة لدى الخادم */
    this._open = new Set();
  }

  _isSad(doc) {
    return doc && doc.languageId === SAD_LANGUAGE_ID && doc.uri.scheme === FILE_SCHEME;
  }

  open(doc) {
    if (!this._isSad(doc)) return;
    const uri = doc.uri.toString();
    this._proc.notify(M_DID_OPEN, {
      textDocument: { uri, languageId: SAD_LANGUAGE_ID, version: doc.version, text: doc.getText() },
    });
    this._open.add(uri);
  }

  change(doc) {
    if (!this._isSad(doc)) return;
    const uri = doc.uri.toString();
    if (!this._open.has(uri)) {
      this.open(doc);
      return;
    }
    // مزامنة كاملة: النصّ الكامل في كلّ تغيير (لا contentChanges جزئيّة).
    this._proc.notify(M_DID_CHANGE, {
      textDocument: { uri, version: doc.version },
      contentChanges: [{ text: doc.getText() }],
    });
  }

  save(doc) {
    if (!this._isSad(doc)) return;
    this._proc.notify(M_DID_SAVE, { textDocument: { uri: doc.uri.toString() } });
  }

  close(doc) {
    if (!this._isSad(doc)) return;
    const uri = doc.uri.toString();
    if (!this._open.has(uri)) return;
    this._proc.notify(M_DID_CLOSE, { textDocument: { uri } });
    this._open.delete(uri);
  }

  /** يُعيد فتح كلّ مستندات ص المفتوحة حاليًّا (بعد إطلاق/إعادة تشغيل الخادم). */
  reopenAll() {
    this._open.clear();
    for (const doc of vscode.workspace.textDocuments) this.open(doc);
  }
}

/** @param {vscode.ExtensionContext} context */
function activate(context) {
  const output = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
  const diagnostics = vscode.languages.createDiagnosticCollection(SAD_LANGUAGE_ID);
  const proc = new SadLspProcess(context, output);
  const sync = new DocumentSync(proc);

  context.subscriptions.push(output, diagnostics, {
    dispose: () => {
      void proc.dispose();
    },
  });

  // هل تشخيصات LSP الحيّة مفعَّلة؟ (الافتراضيّ نعم). عند الإطفاء يتنحّى الخادم عن التشخيص فيعود
  // جسر فحص-الحفظ (SAD-02) مالكًا — فلا ازدواج ولا فراغ.
  const diagnosticsEnabled = () =>
    vscode.workspace.getConfiguration(CFG_SECTION).get(DIAGNOSTICS_KEY) !== false;

  // هل بثّ الخادم تشخيصًا فعلًا هذه الدورة؟ ملكيّة التشخيص تشترطه (لا مجرّد proc.ready): خادمٌ يوفّر
  // إكمالًا/تلوينًا لكن لا يبثّ تشخيصًا يجب ألّا يُسكِت جسر SAD-02 (وإلّا فراغ تشخيص دائم). يُصفَّر عند
  // فقدان الجاهزيّة كي تُعاد المطالبة بالملكيّة فقط بعد بثٍّ حقيقيّ من الخادم الجديد. [تدقيق كليّ #3]
  let hasPublished = false;

  // تشخيصات: publishDiagnostics → لوحة المشاكل + تموّجات سطريّة (فقط حين تكون تشخيصات LSP مفعَّلة).
  proc.onNotification(M_PUBLISH_DIAGNOSTICS, (params) => {
    if (!params || typeof params.uri !== "string") return;
    const uri = vscode.Uri.parse(params.uri);
    if (!diagnosticsEnabled()) {
      diagnostics.delete(uri); // الخادم لا يملك التشخيص الآن — لا تُصيّر بثّه.
      return;
    }
    hasPublished = true; // بثّ حقيقيّ ⇒ يملك LSP التشخيص فعليًّا (يفعّل تنحّي SAD-02). [#3]
    const list = Array.isArray(params.diagnostics) ? params.diagnostics : [];
    diagnostics.set(uri, list.map(toVscodeDiagnostic));
  });

  // تبديل إعداد تشخيصات LSP أثناء الجلسة: [تدقيق كليّ #2]
  //   • إطفاء ⇒ امسح ما صيّرناه كي لا يبقى قديمًا ويتسلّم جسر SAD-02.
  //   • تفعيل ⇒ أعِد المزامنة لتُجبِر الخادمَ على إعادة البثّ (وإلّا تبقى مجموعة LSP فارغة والجسر
  //     يتنحّى ⇒ فراغ تشخيص حتى أوّل تحرير). reopenAll يُرسِل didOpen فيبثّ الخادم فيُرفَع hasPublished.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(`${CFG_SECTION}.${DIAGNOSTICS_KEY}`)) return;
      if (!diagnosticsEnabled()) {
        diagnostics.clear();
      } else if (proc.ready) {
        sync.reopenAll();
      }
    }),
  );

  // مُصدِر تغيّر الرموز الدلاليّة: يُطلَق عند جاهزيّة الخادم كي تُعيد VS Code طلب التلوين لمستندات
  // مفتوحة لم تُحرَّر بعد. بدونه، أوّل طلب تلوين (عند الفتح البارد) يقع قبل جاهزيّة الخادم فيُرجع
  // undefined فتُكاش VS Code «لا رموز» ولا تُعيد الطلب حتى أوّل تعديل ⇒ لا تلوين دلاليّ على الفتح. [SAD-07]
  const semanticTokensChanged = new vscode.EventEmitter();
  context.subscriptions.push(semanticTokensChanged);

  // عند جاهزيّة الخادم (أوّل مرّة أو بعد إعادة تشغيل): أعِد فتح مستندات ص المفتوحة لإعادة المزامنة،
  // وحفّز إعادة طلب التلوين الدلاليّ (المزوّد يُسحب بمبادرة VS Code لا بفعل المستخدم).
  proc.onReadyChanged((ready) => {
    if (ready) {
      sync.reopenAll();
      semanticTokensChanged.fire();
    } else {
      hasPublished = false; // خادمٌ جديد لم يبثّ بعد ⇒ لا يملك التشخيص حتى يبثّ فعلًا. [#3]
    }
  });

  // مزامنة المستند (مستندات ص فقط).
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => sync.open(doc)),
    vscode.workspace.onDidChangeTextDocument((e) => sync.change(e.document)),
    vscode.workspace.onDidSaveTextDocument((doc) => sync.save(doc)),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      sync.close(doc);
      // امسح تشخيصات المستند المُغلَق (الخادم لا يبثّ مسحًا دائمًا).
      if (doc.languageId === SAD_LANGUAGE_ID) diagnostics.delete(doc.uri);
    }),
  );

  // ── مزوّدات الميزات (تُرجع undefined عندما لا يكون الخادم جاهزًا/قادرًا) ──
  const hasCap = (key) => {
    const caps = proc.serverCapabilities;
    return proc.ready && caps && !!caps[key];
  };

  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(SAD_SELECTOR, {
      async provideCompletionItems(doc, position, token) {
        if (!hasCap("completionProvider")) return undefined;
        try {
          const result = await proc.requestWithTimeout(M_COMPLETION, {
            textDocument: { uri: doc.uri.toString() },
            position: toLspPosition(position),
          }, REQUEST_TIMEOUT_MS);
          if (token.isCancellationRequested) return undefined;
          return toCompletionItems(result);
        } catch {
          return undefined;
        }
      },
    }),

    vscode.languages.registerHoverProvider(SAD_SELECTOR, {
      async provideHover(doc, position, token) {
        if (!hasCap("hoverProvider")) return undefined;
        try {
          const result = await proc.requestWithTimeout(M_HOVER, {
            textDocument: { uri: doc.uri.toString() },
            position: toLspPosition(position),
          }, REQUEST_TIMEOUT_MS);
          if (token.isCancellationRequested || !result || !result.contents) return undefined;
          return new vscode.Hover(toHoverContents(result.contents), result.range ? toVscodeRange(result.range) : undefined);
        } catch {
          return undefined;
        }
      },
    }),

    vscode.languages.registerDefinitionProvider(SAD_SELECTOR, {
      async provideDefinition(doc, position, token) {
        if (!hasCap("definitionProvider")) return undefined;
        try {
          const result = await proc.requestWithTimeout(M_DEFINITION, {
            textDocument: { uri: doc.uri.toString() },
            position: toLspPosition(position),
          }, REQUEST_TIMEOUT_MS);
          if (token.isCancellationRequested) return undefined;
          return toDefinitionLocations(result);
        } catch {
          return undefined;
        }
      },
    }),
  );

  // ── تلوين دلاليّ (semantic tokens) [SAD-07] ──
  // يُلوّن حسب الدور الحقيقيّ (أنواع/دوالّ/معاملات/أوسمة تعداد/كلمات مفتاحية) عبر الخادم، فوق إبراز
  // TextMate الساكن. المفتاح (legend) ثابت يطابق الخادم؛ حارس المطابقة (serverLegendMatches) يمنع
  // التلوين حين يختلف ترتيب الخادم (تلوين خاطئ) ⇒ سقوط رشيق إلى TextMate. سمتا محراب تعرّفان
  // semanticTokenColors أصلًا فتُلوَّن الرموز بلا تعديل سمة.
  const semanticLegend = new vscode.SemanticTokensLegend(SEMANTIC_TOKEN_TYPES, SEMANTIC_TOKEN_MODIFIERS);
  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      SAD_SELECTOR,
      {
        // يُخبِر VS Code أنّ التلوين قد تغيّر (عند جاهزيّة الخادم) فتُعيد طلبه. [SAD-07، S1]
        onDidChangeSemanticTokens: semanticTokensChanged.event,
        async provideDocumentSemanticTokens(doc, token) {
          if (!hasCap("semanticTokensProvider") || !serverLegendMatches(proc.serverCapabilities)) {
            return undefined;
          }
          try {
            const result = await proc.requestWithTimeout(
              M_SEMANTIC_TOKENS_FULL, { textDocument: { uri: doc.uri.toString() } },
              REQUEST_TIMEOUT_MS,
            );
            if (token.isCancellationRequested) return undefined;
            return toSemanticTokens(result);
          } catch {
            return undefined;
          }
        },
      },
      semanticLegend,
    ),
  );

  // أمر إعادة تشغيل الخادم.
  context.subscriptions.push(
    vscode.commands.registerCommand(RESTART_COMMAND, async () => {
      await proc.restart();
      vscode.window.showInformationMessage(COPY.restarted);
    }),
  );

  // أطلق الخادم (تدهور رشيق: غيابه ⇒ تحذير + بقاء الإبراز/التهيئة/المقتطفات).
  void proc.start();

  // API عامّ للامتدادات الشقيقة: هل يملك خادمُ LSP التشخيصَ الآن؟ (مفعَّل + الخادم جاهز يبثّ فعلًا).
  // يستعمله جسر فحص-الحفظ (SAD-02 في mihrab-welcome) ليتنحّى فيتفادى ازدواج التشخيص. [تكامل SAD-01/02]
  return {
    // يملك LSP التشخيصَ فقط إن كان مفعَّلًا + الخادم جاهزًا + بثّ فعلًا مرّةً هذه الدورة. اشتراط
    // البثّ الفعليّ (لا مجرّد الجاهزيّة) يمنع فراغ تشخيص دائم مع خادمٍ لا يبثّ تشخيصًا. [تدقيق كليّ #3]
    isDiagnosticsActive: () => diagnosticsEnabled() && proc.ready && hasPublished,
  };
}

function deactivate() {
  // التنظيف عبر context.subscriptions (proc.dispose).
}

module.exports = {
  activate,
  deactivate,
  // مُصدَّرة للاختبار (node --test):
  toVscodeSeverity,
  toVscodeRange,
  toVscodeDiagnostic,
  toHoverContents,
  toDefinitionLocations,
  toCompletionItems,
  toSemanticTokens,
  serverLegendMatches,
  DocumentSync,
  SAD_LANGUAGE_ID,
  RESTART_COMMAND,
};
