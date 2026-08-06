"use strict";
/**
 * تسميةُ محارف الاتّجاه في المحرّر [BS-02] — «سمِّ الشيءَ لتُمكِّن من الفعل».
 *
 * ## الفجوة
 * المحرفُ الخفيُّ يُبرَز بمستطيلٍ يقول «هنا شيءٌ ما» ولا يقول **ما هو**. وهذا يترك المستخدمَ
 * أمام معضلةٍ لا يستطيع حلَّها: يرى علامةً، ولا يعرف أهي `RLM` وضعها محرِّرُه من نفسِه لضبط
 * سطرٍ مختلط، أم `RLO` وضعها مهاجم. **وقرارٌ لا يملك معلومتَه قرارٌ عشوائيّ.**
 *
 * ## التصميم
 * زخرفةٌ مضمَّنة (`after`) تعرض رقاقةً باسم المحرف — `⟪RLO⟫` — عند موضعه بالضبط. ومعها
 * تلميحٌ عربيٌّ يصف **أثرَه** لا آليّتَه (الأسماءُ من `bidi-scan.js`، مصدرُ حقيقةٍ واحد).
 *
 * ## وثلاثةُ قيودٍ تجعلها نافعةً لا ثرثارة
 *   ‏(١) **مُطفأةٌ افتراضيًّا.** نصُّ العربيّة السويُّ مليءٌ بـ`RLM` مشروعة (٣١٢ منها في نواة
 *       نهلة)، فإظهارُها دائمًا يملأ الشاشةَ برقاقاتٍ على محارفَ سليمة — وهو الضجيجُ الذي
 *       بُني `BS-01` كلُّه لتفاديه. تُفتَح بأمرٍ حين يسأل المستخدمُ «ما هذا؟».
 *   ‏(٢) **الأسطرُ المرئيّةُ وحدَها** تُزخرَف: ملفٌّ فيه ألوفُ العلامات لا يبني ألوفَ زخارف.
 *   ‏(٣) **المستندُ النشطُ وحدَه**، وتُنظَّف عند الإطفاء.
 */

const scan = require("./bidi-scan.js");

/** أمرُ التبديل — يُصدَّر كي لا يُكتَب المعرّفُ حرفيًّا في مكانين. */
const TOGGLE_CMD = "mihrab.toggleBidiMarkers";
/** أقصى عددِ زخارفَ في المرّة (سقفُ أداءٍ لا حدٌّ منطقيّ). */
const MAX_DECORATIONS = 500;
/** عزلٌ اتّجاهيّ (`FSI…PDI`) — يُطبَّق على الرقاقة ورموزِ المحارف في التلميح. */
const ISO_OPEN = "⁦";
const ISO_CLOSE = "⁩";

const COPY = {
  on: "كلُّ محرفِ اتّجاهٍ في الجزء الظاهر صار مسمًّى برقاقةٍ عند موضعه. مرِّر المؤشّرَ فوقها لتعرف أثرَه.",
  truncated: (n) => `عُرِض أوّلُ ${n} محرفًا — وثمّة المزيدُ في هذا الملفّ.`,
  off: "أُخفيت أسماءُ محارف الاتّجاه.",
  noEditor: "لا محرّر نشط.",
  none: "لا محارفَ اتّجاهٍ في الجزء الظاهر من هذا الملفّ.",
  /** تلميحٌ يصف الأثرَ ثمّ الحكم — والحكمُ هو ما يحتاجه القارئُ ليقرّر. */
  hover: (c) =>
    (c.isMark
      ? `${c.nameAr} (${ISO_OPEN}${c.code}${ISO_CLOSE}) — علامةُ ترتيبٍ شائعةٌ ومشروعةٌ في النصّ العربيّ: ` +
        "تضبط موضعَ محرفٍ محايدٍ ولا تقلب شيئًا بعدها."
      : `${c.nameAr} (${ISO_OPEN}${c.code}${ISO_CLOSE}) — يفتح أو يغلق مقطعًا يقلب اتّجاهَ العرض. ` +
        "إن لم يُغلَق داخل مقطعه فسيُعرَض السطرُ بغير ترتيب تنفيذه."),
};

/**
 * يبني وصفَ الزخارف من نصٍّ ومدًى مرئيّ. **دالّةٌ نقيّةٌ** — لا `vscode` — فتُختبَر وحدَها.
 *
 * @param {string} text نصُّ المستند.
 * @param {number} fromLine أوّلُ سطرٍ مرئيّ (بادئٌ بصفر).
 * @param {number} toLine آخرُ سطرٍ مرئيّ (شامل).
 * @returns {{line:number, column:number, code:string, nameAr:string, isMark:boolean,
 *            label:string, hover:string}[]}
 */
function decorationsFor(text, fromLine, toLine) {
  const out = [];
  for (const c of scan.listBidiChars(text)) {
    if (c.line < fromLine || c.line > toLine) continue;
    if (out.length >= MAX_DECORATIONS) break;
    // **عزلٌ حول الرقاقة**: القوسان ⟪⟫ محايدان و**مرآتيّان**، فيُرسَمان مقلوبَين في سطرٍ
    // عربيّ — وميزةٌ اسمُها «سمِّ الشيء» لا يليق أن يُرسَم اسمُها بقوسَين مقلوبَين.
    out.push({ ...c, label: ISO_OPEN + `⟪${c.code}⟫` + ISO_CLOSE, hover: COPY.hover(c) });
  }
  return out;
}

/**
 * مبدِّلُ عرضِ أسماء محارف الاتّجاه. يُدار كـ`Disposable` واحد.
 * حالتُه **لكلّ جلسة** لا محفوظة: هذا سؤالُ «ما هذا؟» لا تفضيلٌ دائم.
 */
class BidiMarkerDecorator {
  constructor(vscode) {
    this.vscode = vscode;
    this.enabled = false;
    // الرقاقةُ تتبع سمةَ المستخدم لا لونًا ثابتًا — فتصمد في سمتَي التباين العالي.
    this.type = vscode.window.createTextEditorDecorationType({
      after: {
        margin: "0 0.15em",
        color: new vscode.ThemeColor("editorGhostText.foreground"),
        backgroundColor: new vscode.ThemeColor("editorWidget.background"),
        border: "1px solid",
        borderColor: new vscode.ThemeColor("editorWidget.border"),
      },
    });
    this.disposables = [
      this.type,
      vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
      vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
        if (e.textEditor === vscode.window.activeTextEditor) this.refresh();
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        const ed = vscode.window.activeTextEditor;
        if (ed && e.document === ed.document) this.refresh();
      }),
    ];
  }

  /** يبدّل الحالة ويقول ما وقع. يعيد الحالةَ الجديدة. */
  toggle() {
    const vscode = this.vscode;
    const ed = vscode.window.activeTextEditor;
    if (!ed) {
      vscode.window.showWarningMessage(COPY.noEditor);
      return this.enabled;
    }
    this.enabled = !this.enabled;
    const n = this.refresh();
    if (!this.enabled) vscode.window.showInformationMessage(COPY.off);
    // **لا نقول «ظهرت» وليس ثمّة ما يظهر.** رسالةُ نجاحٍ بلا أثرٍ تُنهي بحثَ المستخدم.
    else if (!n) vscode.window.showInformationMessage(COPY.none);
    // **الاقتطاعُ يُعلَن**: بلوغُ السقف صامتًا يجعل المستخدمَ يظنّ أنّه رأى كلَّ شيء.
    else vscode.window.showInformationMessage(
      n >= MAX_DECORATIONS ? COPY.on + " " + COPY.truncated(MAX_DECORATIONS) : COPY.on);
    return this.enabled;
  }

  /** يعيد رسمَ الزخارف على المحرّر النشط. يعيد عددَ ما رُسِم. */
  refresh() {
    const vscode = this.vscode;
    // **تُمسَح الزخارفُ عن كلّ محرّرٍ ظاهر** لا عن النشط وحدَه: `DecorationType` يبقى
    // مطبَّقًا على كلّ محرّرٍ ضُبط عليه، فتبديلُ المحرّر كان يترك رقاقاتٍ في النصف الآخر
    // من الشاشة المقسومة — وعند الإطفاء تبقى بلا سبيلٍ لإزالتها إلّا بإعادة تشغيل.
    for (const other of vscode.window.visibleTextEditors || []) {
      other.setDecorations(this.type, []);
    }
    const ed = vscode.window.activeTextEditor;
    if (!ed || !this.enabled) return 0;
    const ranges = ed.visibleRanges && ed.visibleRanges.length
      ? ed.visibleRanges
      : [new vscode.Range(0, 0, ed.document.lineCount - 1, 0)];
    const from = Math.min(...ranges.map((r) => r.start.line));
    const to = Math.max(...ranges.map((r) => r.end.line));
    let items;
    try {
      items = decorationsFor(ed.document.getText(), from, to);
    } catch {
      return 0; // زخرفةٌ تحسينيّة — فشلُها لا يمسّ المحرّر
    }
    ed.setDecorations(
      this.type,
      items.map((d) => ({
        range: new vscode.Range(d.line, d.column, d.line, d.column + 1),
        renderOptions: { after: { contentText: d.label } },
        hoverMessage: d.hover,
      }))
    );
    return items.length;
  }

  dispose() {
    this.enabled = false;
    try {
      for (const e of this.vscode.window.visibleTextEditors || []) e.setDecorations(this.type, []);
    } catch {
      /* الإغلاقُ قد يسبق التنظيف — لا يُفشِل */
    }
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        /* تجاهُلٌ مقصود عند الإغلاق */
      }
    }
  }
}

module.exports = { BidiMarkerDecorator, decorationsFor, TOGGLE_CMD, MAX_DECORATIONS, COPY };
