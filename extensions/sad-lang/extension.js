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
// مهلة طلبات الميزات (إكمال/تحويم/تعريف): خادم حيّ عالِق لا يُعلّق المزوّد للأبد. [S5]
const REQUEST_TIMEOUT_MS = 5000;

/** يسابق وعدًا مقابل مهلة (يرفض عند تجاوزها) كي لا يتعلّق مزوّد الميزة على خادم عالِق. [S5] */
function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("انتهت مهلة الطلب")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

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

  // تشخيصات: publishDiagnostics → لوحة المشاكل + تموّجات سطريّة (فقط حين تكون تشخيصات LSP مفعَّلة).
  proc.onNotification(M_PUBLISH_DIAGNOSTICS, (params) => {
    if (!params || typeof params.uri !== "string") return;
    const uri = vscode.Uri.parse(params.uri);
    if (!diagnosticsEnabled()) {
      diagnostics.delete(uri); // الخادم لا يملك التشخيص الآن — لا تُصيّر بثّه.
      return;
    }
    const list = Array.isArray(params.diagnostics) ? params.diagnostics : [];
    diagnostics.set(uri, list.map(toVscodeDiagnostic));
  });

  // عند إطفاء تشخيصات LSP أثناء الجلسة: امسح ما صيّرناه كي لا يبقى قديمًا ويتسلّم جسر SAD-02.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(`${CFG_SECTION}.${DIAGNOSTICS_KEY}`) && !diagnosticsEnabled()) {
        diagnostics.clear();
      }
    }),
  );

  // عند جاهزيّة الخادم (أوّل مرّة أو بعد إعادة تشغيل): أعِد فتح مستندات ص المفتوحة لإعادة المزامنة.
  proc.onReadyChanged((ready) => {
    if (ready) sync.reopenAll();
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
          const result = await withTimeout(proc.request(M_COMPLETION, {
            textDocument: { uri: doc.uri.toString() },
            position: toLspPosition(position),
          }), REQUEST_TIMEOUT_MS);
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
          const result = await withTimeout(proc.request(M_HOVER, {
            textDocument: { uri: doc.uri.toString() },
            position: toLspPosition(position),
          }), REQUEST_TIMEOUT_MS);
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
          const result = await withTimeout(proc.request(M_DEFINITION, {
            textDocument: { uri: doc.uri.toString() },
            position: toLspPosition(position),
          }), REQUEST_TIMEOUT_MS);
          if (token.isCancellationRequested) return undefined;
          return toDefinitionLocations(result);
        } catch {
          return undefined;
        }
      },
    }),
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
    isDiagnosticsActive: () => diagnosticsEnabled() && proc.ready,
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
  DocumentSync,
  SAD_LANGUAGE_ID,
  RESTART_COMMAND,
};
