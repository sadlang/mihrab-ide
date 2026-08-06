"use strict";
/**
 * كشفٌ حيٌّ لأحاديّة العرض [TY-03] — لأنّ السقوطَ يكسر المسطراتِ **بصمت**.
 *
 * ## العطب
 * العربيّةُ ليست أحاديّةَ العرض بطبعها: «ا» شرطةٌ رفيعة و«م» و«ص» عريضتان. وخطُّ محرابٍ
 * المحزوم (Kawkab Mono) يجعلها كذلك عمدًا — قِسنا فوجدنا **كلَّ** محرفٍ أساسيٍّ بعرض
 * `700/1000 em` سواءً: `M` و`i` و«ا» و«م» و«ص» و«ش» و«٥».
 *
 * لكن حين يسقط المكدَّسُ إلى خطِّ نظامٍ متناسب (لغيابِ الوجه المحزوم، أو لإعدادِ مستخدمٍ)،
 * يبقى المحرّرُ يحسب العمودَ بعرضِ محرفٍ لاتينيٍّ واحد — **فتكذب المسطرةُ وتكذب المحاذاةُ
 * ويكذب التحديدُ الكتليّ**، ولا يظهر خطأٌ واحد. وهذا أسوأُ أنواع الأعطاب: صامتٌ ويبدو أنّه يعمل.
 *
 * ## لماذا هنا لا في الحارس
 * حارسُ L0 يفحص **الإعداد**، وحارسُ L2 يفحص **الحزمة**. وكلاهما يمرّ أخضرَ بينما المستخدمُ
 * ضبط `editor.fontFamily` بيده إلى خطٍّ متناسب، أو ثبّت محرابًا على نظامٍ بلا الوجه المحزوم.
 * **القياسُ الوحيدُ الصادقُ يقع على جهازه.**
 *
 * ## قاعدتان تحكمان هذه الوحدة
 *   ‏(١) **يُقاس خطُّ المحرّر لا خطُّ لوحتنا.** لوحةُ المخرجات تُضمِّن الوجهَ المحزوم في
 *       وثيقتها، فقياسُها يعطي «أحاديّ» دائمًا — أي يعمى عن الحالة التي وُجد لها الكاشف.
 *       ولذلك يقيس السطحُ عنصرًا خطُّه `--vscode-editor-font-family` وحدَه.
 *   ‏(٢) **لا يُعلَن نجاحٌ إلّا بعد إعادة قياس.** الكتابةُ قد تُقبَل ولا تُغيّر شيئًا: وجهٌ
 *       غيرُ مثبَّتٍ على الجهاز، أو قيمةٌ في نطاق المشروع أو نطاق اللغة تغلب العامّ. وهو
 *       الدرسُ المدفوعُ ثمنُه مرّتين في `unicode-guard`: «تمّ» والإعدادُ في مكانه.
 *
 * ## الوحدةُ نقيّة
 * لا `vscode` في منطقها: القياسُ يقع في عرضِ ويبٍ (`Canvas.measureText`)، وهذه الوحدةُ
 * تُقيّم **نتيجتَه** وتقرّر. فتُختبَر بأرقامٍ مصنوعةٍ بلا محرّرٍ حيّ.
 */

/** عيّنةُ القياس: محارفُ عربيّةٌ متباعدةُ العرض بطبعها + لاتينيٌّ عريضٌ ورفيع. */
const SAMPLES = ["M", "i", "ا", "م", "ص", "ش"];
/**
 * عتبةُ التفاوت المسموح — **نسبةٌ لا بكسلات**: القياسُ يقع بحجمِ خطّ المستخدم أيًّا كان،
 * فعتبةٌ بالبكسل تصير أشدَّ عند ١٢ وأرخى عند ٢٠. و٢٪ فوق ضجيجِ التنعيم (subpixel) ودون
 * أصغرِ فرقٍ حقيقيٍّ بين محرفَين في خطٍّ متناسب (فرقُ `i`/`M` وحدَه يتجاوز ٥٠٪ عادةً).
 */
const TOLERANCE = 0.02;
/** اسمُ الوجه المحزوم — يُطلَب وجودُه في أيّ مكدَّسٍ نقترحه على المستخدم. */
const BUNDLED_FACE = "Kawkab Mono";

const STATE_KEY = "mihrab.font.proportionalDismissed";
const FONT_SETTING = "editor.fontFamily";
const OPEN_SETTINGS_CMD = "workbench.action.openSettings";

/**
 * يعزل مقطعًا لاتينيًّا داخل جملةٍ عربيّة (`FSI…PDI`) فلا تقفز المحايداتُ حولَه.
 * نظيرُ `iso` في `bidi-guard.js` — والعزلُ **في السلسلة** لا في الورقة، لأنّها تبلغ
 * `aria-label` ولوحةَ الإشعارات والنسخَ واللصق، وثلاثتُها لا تبلغها CSS.
 */
const iso = (s) => "⁨" + s + "⁩";

const COPY = {
  // **الأثرُ بدليلٍ يراه المستخدمُ بعينه**، ثمّ الاسمُ الحقيقيُّ للخطّ (كي يجده لو بحث).
  // «أحاديّ العرض» و«التحديد الرأسيّ» مجرّداتٌ لا يعرفها من وُصِف بأنّه مبتدئٌ في البرمجة كلِّها.
  warn:
    "الخطُّ المعروض الآن يعطي كلَّ حرفٍ عربيٍّ عرضًا مختلفًا: " + iso("«ااااا»") + " أضيقُ على" +
    " الشاشة من " + iso("«ممممم»") + " رغم أنّهما خمسةُ حروفٍ لكلَيهما. في ملفّات ص يعني هذا" +
    " أنّ السطورَ لن تصطفَّ تحت بعضها كما تتوقّع، وأنّ المسافاتِ البادئةَ ستبدو غيرَ منتظمة." +
    " وخطُّ " + iso("«كوكب مونو»") + " المرفقُ مع محراب يعطي كلَّ حرفٍ عربيٍّ العرضَ نفسَه.",
  fix: "اعرِض بخطّ «كوكب مونو»",
  // «أعرف، تابِع» يفترض معرفةً لم تحصل ويجعل الرفضَ اعترافًا؛ «لاحقًا» يُبقي البابَ مفتوحًا.
  dismiss: "لاحقًا",
  fixed: "صار خطُّ المحرّر " + iso("«كوكب مونو»") + " — افتح ملفَّ ص لترى الفرق.",
  // **فشلٌ يُقال كما هو.** الكتابةُ قد تُقبَل بلا أثر: وجهٌ غيرُ مثبَّت، أو نطاقٌ أضيقُ يغلب.
  fixedButUnverified:
    "كُتِب الإعدادُ، لكنّ الخطَّ المعروضَ لم يتغيّر — الأرجحُ أنّ " + iso("«كوكب مونو»") +
    " غيرُ مثبَّتٍ على هذا الجهاز، أو أنّ قيمةً في إعدادات المشروع تغلب الإعدادَ العامّ." +
    " افتح الإعدادات وابحث عن " + iso(FONT_SETTING) + " لترى أيَّ نطاقٍ يغلب.",
  openSettings: "افتح الإعداد",
  fixFailed: (e) =>
    `تعذّر ضبطُ الخطّ: ${iso(e)} — اضبط ${iso(FONT_SETTING)} يدويًّا من الإعدادات.`,
};

/**
 * هل القياسُ يدلّ على خطٍّ **متناسب** (لا أحاديّ العرض)؟
 *
 * @param {Record<string, number>} widths عرضُ كلّ محرفٍ من `SAMPLES` بالبكسل.
 * @returns {{proportional:boolean, min:number, max:number, spread:number, widest:string,
 *            narrowest:string, measured:number}}
 *          `spread` = مدى التفاوت نسبةً إلى الأعرض. قياسٌ ناقصٌ (أقلُّ من محرفَين) يُعتبَر
 *          **غيرَ حاسمٍ** فلا يُنذَر: إنذارٌ على قياسٍ ناقصٍ إنذارٌ كاذب.
 */
function evaluateWidths(widths) {
  const entries = SAMPLES.map((c) => [c, widths && widths[c]]).filter(
    ([, w]) => typeof w === "number" && isFinite(w) && w > 0
  );
  if (entries.length < 2) {
    return { proportional: false, min: 0, max: 0, spread: 0, widest: "", narrowest: "", measured: entries.length };
  }
  let min = entries[0], max = entries[0];
  for (const e of entries) {
    if (e[1] < min[1]) min = e;
    if (e[1] > max[1]) max = e;
  }
  const spread = (max[1] - min[1]) / max[1];
  return {
    proportional: spread > TOLERANCE,
    min: min[1],
    max: max[1],
    spread: +spread.toFixed(4),
    widest: max[0],
    narrowest: min[0],
    measured: entries.length,
  };
}

/**
 * توقيعُ الحالة: خطٌّ + نتيجة. يتغيّر بتغيّر الخطّ فيُنذَر ثانيةً على حالٍ جديدةٍ لا القديمة.
 * و`spread` يُقرَّب إلى منزلتين: تذبذبُ تنعيمٍ بمقدار ‎0.0001‎ ليس حالًا جديدة.
 */
function signatureOf(fontFamily, verdict) {
  return `${fontFamily}|${verdict.spread.toFixed(2)}`;
}

/**
 * أضيقُ نطاقٍ **تغلب فيه** قيمةُ الخطّ اليوم — فنكتب فيه لا في العامّ دائمًا.
 * كتابةٌ في `Global` بينما القيمةَ الغالبةَ في المشروع تُقبَل **ولا تُغيّر شيئًا**.
 * @param {*} vscode @param {*} info ناتجُ `inspect(FONT_SETTING)`
 */
function targetFor(vscode, info) {
  const T = vscode.ConfigurationTarget;
  if (!info) return T.Global;
  if (info.workspaceFolderValue !== undefined) return T.WorkspaceFolder;
  if (info.workspaceValue !== undefined) return T.Workspace;
  return T.Global;
}

/**
 * يقرّر ويُنذِر مرّةً واحدةً لكلّ حالة. **مُحقَّنُ التبعيّات بالكامل** فيُختبَر بلا محرّر.
 *
 * @param {*} vscode واجهةُ المحرّر.
 * @param {*} memento ذاكرةُ الحالة العامّة.
 * @param {{fontFamily:string, widths:Record<string,number>}} measurement ما رُصد حيًّا.
 * @param {object} opts
 * @param {string} opts.bundledStack مكدَّسُ الخطّ المقترَح (يُمرَّر ولا يُكتَب هنا).
 * @param {object} [opts.inspect] ناتجُ `inspect(FONT_SETTING)` لاختيار النطاق الصحيح.
 * @param {() => Promise<{fontFamily:string, widths:Record<string,number>}|null>} [opts.remeasure]
 *        إعادةُ قياسٍ بعد الكتابة — **بدونها لا يُعلَن نجاحٌ بل «كُتِب ولم يُتحقَّق».**
 * @returns {Promise<boolean>} هل تغيّر الخطُّ **فعلًا** (مُتحقَّقًا منه)؟
 */
async function maybeWarnProportional(vscode, memento, measurement, opts) {
  if (!measurement) return false;
  const { bundledStack, inspect, remeasure } = opts || {};
  const verdict = evaluateWidths(measurement.widths);
  if (!verdict.proportional) return false;
  const signature = signatureOf(measurement.fontFamily || "", verdict);
  if (memento && memento.get(STATE_KEY) === signature) return false;

  // **لا نعرض زرَّ إصلاحٍ لا نملكه.** حين يغيب `mihrab-shell` (مضيفُ تطوير، ملفٌّ تعريفيٌّ
  // تالف) يعيد المنبعُ مكدَّسًا لاتينيًّا صرفًا (`Consolas, 'Courier New', monospace`) —
  // فضبطُه «إصلاحٌ» يثبّت العطبَ ويُعلن نجاحًا كاذبًا. الإنذارُ وحدَه أصدقُ من إصلاحٍ خطأ.
  const fixable = typeof bundledStack === "string" && bundledStack.includes(BUNDLED_FACE);
  const actions = fixable ? [COPY.fix, COPY.dismiss] : [COPY.dismiss];
  const pick = await vscode.window.showWarningMessage(COPY.warn, ...actions);
  if (pick !== COPY.fix) {
    // **يُخزَّن التوقيعُ في كلّ مسارٍ لا يُصلِح** — بما فيه إغلاقُ الإطار بـ‏×، وهو أشيعُ
    // ردٍّ على الإطارات. بدونه يعود الإنذارُ في كلّ فتحةٍ: تكرارٌ بلا تعلُّم.
    if (memento) await memento.update(STATE_KEY, signature);
    return false;
  }

  try {
    await vscode.workspace
      .getConfiguration()
      .update(FONT_SETTING, bundledStack, targetFor(vscode, inspect));
  } catch (e) {
    vscode.window.showErrorMessage(COPY.fixFailed((e && e.message) || String(e)));
    return false;
  }

  // **إقرارٌ بالأثر لا بعدم الرمي.** بلا إعادة قياسٍ لا نملك إلّا الظنّ — فلا ندّعي.
  const after = remeasure ? await remeasure() : null;
  if (after && !evaluateWidths(after.widths).proportional) {
    if (memento) await memento.update(STATE_KEY, undefined); // زالت الحالةُ فلا داعي لكتمها
    vscode.window.showInformationMessage(COPY.fixed);
    return true;
  }
  const choice = await vscode.window.showWarningMessage(
    COPY.fixedButUnverified, COPY.openSettings);
  if (choice === COPY.openSettings) {
    await vscode.commands.executeCommand(OPEN_SETTINGS_CMD, FONT_SETTING);
  }
  return false;
}

module.exports = {
  evaluateWidths,
  maybeWarnProportional,
  signatureOf,
  targetFor,
  iso,
  SAMPLES,
  TOLERANCE,
  BUNDLED_FACE,
  STATE_KEY,
  FONT_SETTING,
  OPEN_SETTINGS_CMD,
  COPY,
};
