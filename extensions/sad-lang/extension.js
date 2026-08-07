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
  M_DOCUMENT_SYMBOL,
  COMPLETION_TRIGGER_CHARACTERS,
  SEMANTIC_TOKEN_TYPES,
  SEMANTIC_TOKEN_MODIFIERS,
  M_PUBLISH_DIAGNOSTICS,
  SEVERITY_ERROR,
  SEVERITY_WARNING,
  SEVERITY_INFORMATION,
} = require("./lsp-protocol.js");
// [DX-01] تطبيعُ البحث العربيّ — نسخةٌ **مطابقةٌ بايتًا ببايت** لنظيرتها في `mihrab-welcome`
// (امتدادٌ مستقلّ لا يعتمد على غيره، كـ`tool-resolve.js`)، ويحرس تطابقَهما فحصُ L0 ببصمة.
const { dualFilterText } = require("./arabic-normalize.js");
const { createEncodingOracle, dropDegenerateSymbols } = require("./position-encoding.js");

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
  // تقول ما يراه المستخدم وما يفعله، لا مصطلحَ البروتوكول: «مديات غير متّسقة» لا تعني
  // له شيئًا، و«يكسر شكل الكلمات العربيّة» هو ما رآه على الشاشة فعلًا.
  // ‏**كانت تلوم المستخدمَ على ما لا نسخةَ تُصلحه.** قِيس خادمُ ص المشحون (2.1.0)
  // فوُجد يرسل الأطوالَ بالبايتات — وهي **أحدثُ** نسخة، فـ«حدِّث خادم ص» توصيةٌ
  // لا مرجعَ لها. والصياغةُ الآن تقول ما نعرفه: العطبُ في الخادم، والحدُّ عندنا،
  // وليس على المستخدم فعلٌ. (‏وسببُ الامتناع هنا خاصّ: الخادم يخلط الترميزين داخل
  // الرسالة الواحدة — `deltaStart` بوحدات UTF-16 و`length` بالبايتات — فلا يُرمَّم
  // بقياس، بخلاف مديات التحويم والتعريف. انظر `position-encoding.js`.)
  semanticGuardWarn:
    "خادمُ ص يرسل أطوالَ رموزٍ بالبايتات لا بوحدات النصّ، فتنكسر أشكالُ الكلمات " +
    "العربيّة وتلوينُها. أوقفتُ التلوين الدلاليّ حمايةً للنصّ — والإبرازُ الساكن يعمل، " +
    "ولا يلزمك فعلٌ. العيبُ مرفوعٌ إلى فريق ص.",
  semanticGuardLog:
    "[تلوين دلاليّ] مديات الرموز غير متّسقة مع النصّ (الأرجح: أطوالٌ بالبايتات بدل " +
    "وحدات UTF-16 — نسخةُ خادمٍ قديمة). أُوقف التلوين الدلاليّ لهذه الجلسة.",
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

/**
 * vscode.Location[] من نتيجة تعريف LSP (Location | Location[] | LocationLink[]).
 *
 * ‏`fix` اختياريّةٌ عمدًا: بدونها يبقى السلوكُ حرفيًّا كما كان (تحويلٌ مباشر)، فتُبقي
 * اختباراتِ المحوّل قائمةً على ما تقيسه. ومعها يُرمَّم المدى **بنصّ الملفّ الهدف** —
 * وقد يكون غيرَ المفتوح، فتردّ `fix` المدى كما ورد ونمتنع. [SAD-08]
 */
function toDefinitionLocations(result, fix) {
  if (!result) return [];
  const arr = Array.isArray(result) ? result : [result];
  const at = (uri, r) => toVscodeRange(typeof fix === "function" ? fix(uri, r) : r);
  const locs = [];
  for (const item of arr) {
    if (!item) continue;
    if (item.targetUri && item.targetRange) {
      // LocationLink
      locs.push(new vscode.Location(vscode.Uri.parse(item.targetUri), at(item.targetUri, item.targetSelectionRange || item.targetRange)));
    } else if (item.uri && item.range) {
      // Location
      locs.push(new vscode.Location(vscode.Uri.parse(item.uri), at(item.uri, item.range)));
    }
  }
  return locs;
}

/**
 * vscode.DocumentSymbol[] من نتيجة `documentSymbol` (‏DocumentSymbol[] الهرميّ أو
 * SymbolInformation[] المسطَّح). [SAD-08]
 *
 * ‏`fix` ترمّم المدى، و`dropDegenerateSymbols` تُسقِط ما لا يُتنقَّل إليه. والمخطَّطُ
 * وفتاتُ الخبز **فارغان اليومَ في كلّ ملفّ ص** — لا لأنّ الخادمَ لا يعلن المزوّد
 * (يعلنه: `documentSymbolProvider: true`) بل لأنّنا لم نسجّله.
 */
function toDocumentSymbols(result, fix) {
  if (!Array.isArray(result)) return [];
  const conv = (list) =>
    dropDegenerateSymbols(list)
      .map((s) => {
        const full = fix(s.range || (s.location && s.location.range));
        const sel = fix(s.selectionRange || s.range || (s.location && s.location.range));
        if (!full || !sel) return null;
        const sym = new vscode.DocumentSymbol(
          String(s.name || ""),
          String(s.detail || ""),
          // LSP SymbolKind يبدأ من 1، vscode من 0 — كنظيرتها في toCompletionItems.
          typeof s.kind === "number" && s.kind > 0 ? s.kind - 1 : 0,
          toVscodeRange(full),
          toVscodeRange(sel),
        );
        if (Array.isArray(s.children)) sym.children = conv(s.children);
        return sym;
      })
      .filter(Boolean);
  return conv(result);
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
    // [DX-01] نصُّ الترشيح يحمل **الرسمَين**: ما كتبه الخادمُ (أو التسمية)، وصورتَه المطبَّعة.
    // فمن كتب «الفضه» يجد ما سُمّي «الفِضَّة» والعكس — والهمزةُ والتاءُ المربوطةُ والتشكيلُ
    // والتطويلُ تبادلٌ يوميٌّ في العربيّة لا شذوذ. لا يُعرَض هذا النصُّ للمستخدم (يُعرَض `label`).
    item.filterText = dualFilterText(it.filterText ? String(it.filterText) : item.label);
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
 * هل مديات الرموز الدلاليّة **متّسقة** مع نصّ المستند؟ [SAD-07، حارس مقيس]
 *
 * البروتوكول يوجب أن يكون `length` بوحدات UTF-16 (تفاوضنا عليه صراحةً). وخادمٌ يرسله
 * **بالبايتات** يضاعف طولَ كلّ رمزٍ عربيّ تقريبًا (حرفٌ عربيٌّ = بايتان) — وقِسنا هذا
 * على خادمٍ حقيقيّ: «متغير» خمسةُ محارف ورد طولُها ١٠، و«نصاب_الفضة» عشرةٌ ورد ١٩.
 *
 * والعطبُ الناتج **مضاعَف**، وهو سببُ وجود هذا الحارس:
 *   ‏(١) تلوينٌ خاطئ: المدى يبتلع ما بعده فيُلوَّن نصفُ الكلمة بلونٍ ونصفُها بآخر.
 *   ‏(٢) **كسرُ الوصل العربيّ**: المحرّر يرسم كلَّ رمزٍ في عنصرٍ مستقلّ، والتشكيلُ لا
 *       يعبر حدَّ العنصر. فحدٌّ يقع داخلَ كلمةٍ يُظهر ةً منفصلةً وصادًا وعينًا معزولتين.
 *       أي أنّ خطأً حسابيًّا في الخادم يُخرج **نصًّا عربيًّا مكسورَ الشكل**.
 *
 * فنمتنع عن التلوين الدلاليّ كلَّه ونترك TextMate — على نهج `serverLegendMatches`
 * نفسِه: الامتناعُ أصدقُ من تلوينٍ مضلِّل. ولا نحاول التصحيح تخمينًا (بايتات أم محارف؟)
 * لأنّ التخمين يُنتج حدودًا أخرى خاطئة بصمت.
 *
 * @param {number[]} data خماسيّات LSP النسبيّة [Δسطر، Δعمود، طول، نوع، معدّلات]
 * @param {string[]} lines أسطر المستند
 * @returns {boolean} true إن كان كلُّ رمزٍ داخلَ سطره ولا يتداخل مع تاليه
 */
function semanticRangesAreSane(data, lineLength) {
  if (data.length % 5 !== 0) return false;   // خماسيّةٌ ناقصة = بياناتٌ مخالفةٌ للبروتوكول
  let line = 0;
  let char = 0;
  let prevEnd = -1;
  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaChar = data[i + 1];
    const length = data[i + 2];
    // أعدادٌ صحيحةٌ غير سالبة: الترميز النسبيّ لا معنى فيه لسالبٍ ولا لكسر، وطولٌ سالب
    // كان يمرّ الفحصَين أدناه صامتًا ويُقهقر `prevEnd` فيُبطِل كشفَ التداخل.
    if (!Number.isInteger(deltaLine) || deltaLine < 0) return false;
    if (!Number.isInteger(deltaChar) || deltaChar < 0) return false;
    if (!Number.isInteger(length) || length < 0) return false;
    if (deltaLine > 0) { prevEnd = -1; }
    line += deltaLine;
    char = deltaLine === 0 ? char + deltaChar : deltaChar;
    const len = lineLength(line);
    if (len === undefined) return false;      // سطرٌ خارج المستند
    if (char + length > len) return false;    // مدًى يتجاوز طول السطر
    if (char < prevEnd) return false;         // تداخلٌ مع الرمز السابق
    prevEnd = char + length;
  }
  return true;
}

/**
 * حارسُ جلسةٍ للتلوين الدلاليّ: **قرارٌ واحدٌ لكلّ جلسةِ خادم** لا قرارٌ لكلّ استجابة.
 *
 * لماذا مزلاجٌ لا فحصٌ متكرّر — رصدته المراجعتان معًا:
 *   ‏(١) الكشفُ عَرَضيّ بطبعه: الأطوالُ الخاطئة لا تُكشَف إلّا حين تتجاوز طولَ السطر أو
 *       تتداخل. فسطرٌ فيه فراغٌ كافٍ («متغير س = ١») يمرّ سليمًا وسطرٌ آخرُ يُرفَض ⇒ لو
 *       قرّرنا لكلّ استجابةٍ **لومض** الملفّ بين ملوَّنٍ وغيرِ ملوَّنٍ مع كلّ ضغطة مفتاح.
 *       والوميضُ أسوأ على العين من فقدٍ ثابتٍ معلَن.
 *   ‏(٢) الخادمُ لا يتغيّر أثناء الجلسة: العطبُ خاصّيّةُ نسخته لا خاصّيّةُ السطر.
 *
 * ويُبلَّغ المستخدم **مرّةً واحدة**: العلّةُ خارج قدرته على التخمين، والدواءُ محدّد.
 *
 * @param {(msg: string) => void} log كتابةٌ في قناة الإخراج
 * @param {(msg: string) => void} warn إشعارٌ مرئيّ (مرّةً واحدةً لكلّ جلسة)
 */
function createSemanticGuard(log, warn) {
  let disabled = false;
  return {
    get disabled() { return disabled; },
    /** يُصفَّر عند إعادة تشغيل الخادم: النسخة قد تكون تغيّرت. */
    reset() { disabled = false; },
    /**
     * @returns {boolean} هل نثق بهذه الاستجابة؟
     */
    accept(data, lineLength) {
      if (disabled) return false;
      if (semanticRangesAreSane(data, lineLength)) return true;
      disabled = true;
      log(COPY.semanticGuardLog);
      warn(COPY.semanticGuardWarn);
      return false;
    },
  };
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
  // حارسُ التلوين الدلاليّ: مزلاجٌ لجلسة الخادم (انظر createSemanticGuard). الإشعارُ
  // مرّةً واحدة، والسطرُ في القناة دائمًا لا خلفَ راية تتبُّعٍ لا يفعّلها أحدٌ قبل العطب.
  const semanticGuard = createSemanticGuard(
    (msg) => output.appendLine(msg),
    (msg) => vscode.window.showWarningMessage(msg),
  );

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

  // ── عرّافُ ترميز المواضع [SAD-08] ──
  // الخادمُ المشحون (2.1.0) لا يعلن `positionEncoding` ويرسل **بايتات**، فمداه على
  // سطرٍ عربيّ يقع في غير موضعه — و«اذهب إلى التعريف» يقفز إلى ما بعد نهاية السطر.
  // العرّافُ **يقيس** الترميزَ من حمولة `documentSymbol` (تحمل `name`) أو من مدًى
  // يتجاوز سطرَه، ولا يمسّ شيئًا قبل أن يُقرَّر. انظر `position-encoding.js`.
  const oracle = createEncodingOracle();

  /** قارئُ أسطرِ مستندٍ **مفتوح** بمعرِّفه؛ وغيرُ المفتوح ⇒ لا نصَّ ⇒ امتناع. */
  const linesOf = (uri) => (n) => {
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri);
    if (!doc || !Number.isInteger(n) || n < 0 || n >= doc.lineCount) return undefined;
    return doc.lineAt(n).text;
  };
  const fixRange = (uri, range) => oracle.repair(range, linesOf(uri));

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
    }, ...COMPLETION_TRIGGER_CHARACTERS),

    vscode.languages.registerHoverProvider(SAD_SELECTOR, {
      async provideHover(doc, position, token) {
        if (!hasCap("hoverProvider")) return undefined;
        try {
          const result = await proc.requestWithTimeout(M_HOVER, {
            textDocument: { uri: doc.uri.toString() },
            position: toLspPosition(position),
          }, REQUEST_TIMEOUT_MS);
          if (token.isCancellationRequested || !result || !result.contents) return undefined;
          const range = result.range ? fixRange(doc.uri.toString(), result.range) : undefined;
          return new vscode.Hover(toHoverContents(result.contents), range ? toVscodeRange(range) : undefined);
        } catch {
          return undefined;
        }
      },
    }),

    // مخطَّطُ الرموز [SAD-08] — ويؤدّي دورًا ثانيًا: حمولتُه وحدَها تحمل `name`، فمنها
    // **يُقاس** ترميزُ مواضع الخادم. ولذلك يُغذّى العرّافُ بالحمولة **الخام** قبل أيّ
    // ترميم: الترميمُ بعد القرار لا قبله، وإلّا قِسنا أثرَنا لا أثرَ الخادم.
    vscode.languages.registerDocumentSymbolProvider(SAD_SELECTOR, {
      async provideDocumentSymbols(doc, token) {
        if (!hasCap("documentSymbolProvider")) return undefined;
        try {
          const result = await proc.requestWithTimeout(M_DOCUMENT_SYMBOL, {
            textDocument: { uri: doc.uri.toString() },
          }, REQUEST_TIMEOUT_MS);
          if (token.isCancellationRequested || !Array.isArray(result)) return undefined;
          const lines = linesOf(doc.uri.toString());
          oracle.learnFromSymbols(result, lines);
          return toDocumentSymbols(result, (r) => (r ? oracle.repair(r, lines) : null));
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
          return toDefinitionLocations(result, fixRange);
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
          if (!hasCap("semanticTokensProvider") || !serverLegendMatches(proc.serverCapabilities)
            || semanticGuard.disabled) {
            return undefined;
          }
          // نسخةُ المستند قبل الطلب: الرموزُ تُحسَب على النصّ وقتَ الطلب، فإن حُرِّر
          // المستند قبل وصول الردّ صارت المقارنةُ بلا معنًى — وقد تُخرِج «تجاوزَ طول
          // سطر» لمستندٍ سليمٍ تمامًا. لا نحكم عندئذٍ ولا نُغلِق المزلاج.
          const version = doc.version;
          try {
            const result = await proc.requestWithTimeout(
              M_SEMANTIC_TOKENS_FULL, { textDocument: { uri: doc.uri.toString() } },
              REQUEST_TIMEOUT_MS,
            );
            if (token.isCancellationRequested) return undefined;
            if (doc.version !== version) return undefined;
            // حارسُ الاتّساق: خادمٌ يرسل الأطوالَ بالبايتات يكسر التلوين **ووصلَ الحروف
            // العربيّة** معًا (انظر createSemanticGuard). الامتناعُ أصدقُ من التشويه.
            // طولُ السطر عبر lineAt لا بنسخِ المستند كلِّه: يُنادى مع كلّ تحرير.
            const lineLength = (n) =>
              (n >= 0 && n < doc.lineCount) ? doc.lineAt(n).text.length : undefined;
            if (Array.isArray(result?.data) && !semanticGuard.accept(result.data, lineLength)) {
              return undefined;
            }
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
      // نسخةُ الخادم قد تكون تغيّرت ⇒ يُعاد فتحُ باب التلوين الدلاليّ.
      semanticGuard.reset();
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
  toDocumentSymbols,
  toCompletionItems,
  toSemanticTokens,
  serverLegendMatches,
  semanticRangesAreSane,
  createSemanticGuard,
  DocumentSync,
  SAD_LANGUAGE_ID,
  RESTART_COMMAND,
};
