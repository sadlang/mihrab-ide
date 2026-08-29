// @ts-check
"use strict";
// AR-01: لوحة مخرجات عربيّة واعية بالاتّجاه (bidi). طرفيّة xterm لا تدعم bidi (قيد منبع
// موثَّق في docs/rtl/rtl-inventory.md)، وبرامج ص تطبع عربيّةً ⇒ مخرجات المستخدم تُشوَّه في
// الطرفيّة. هذه اللوحة (webview) تلتقط stdout/stderr من sad-run وتعرض **كلّ سطر** بـ
// «unicode-bidi: plaintext»: السطر يأخذ اتّجاهه من أوّل محرف قويّ فيه (عربيّ ⇐ يمين،
// لاتينيّ/أرقام ⇐ يسار) — وهو ما تعجز شبكة الطرفيّة عنه. تصبح وجهة runSadFile [AR-01].
//
// مقايضة صادقة: لوحة عرض مكمّلة لا بديل كامل للطرفيّة (تفقد ANSI/التفاعليّة؛ و\r المجرّد داخل
// السطر — أشرطة التقدّم — يبقى حرفيًّا) — تُقدَّم بهذا الوصف. أمان webview: CSP صارم + nonce،
// بلا موارد خارجيّة، والمخرجات تُمرَّر نصًّا (textContent) لا HTML.
//
// كلّ literal منطقيّ ثابت مسمّى؛ نصوص COPY (وعناوين الأزرار المضمّنة في الـHTML) نسخة واجهة
// عربيّة-أوّلًا (استثناء مقبول، أسوة بـchat.js). منطق تقطيع الأسطر (takeLines) نقيّ قابل للاختبار.

const vscode = require("vscode");
const cp = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { loadFontDataUri, BUNDLED_MEDIA_DIR, FONT_FILE, FONT_FAMILY } = require("./bundled-font");
const { StringDecoder } = require("string_decoder");

// معرّف/عنوان اللوحة (مفردة — تُعاد استعمالها لكلّ تشغيل).
const PANEL_TYPE = "mihrab.sadOutput";
// [VA-06] العنوانُ يخضع للمسرد كغيره — وكان الشيءَ الوحيدَ الذي تراه العينُ
// ويخالف اللفظَ المعتمَد الذي وحّدناه في كلّ نصٍّ آخر.
const PANEL_TITLE = "لوحة مخرجات محراب";

// خطّ ص العربيّ المحزوم [AR-02] داخل اللوحة: الـwebview إطارٌ معزول عن وثيقة الـworkbench، فلا
// يرث @font-face المحقون هناك. لذا نُضمِّن الخطّ نفسه في هذه اللوحة كـdata: URI (إن شُحن مع
// الامتداد في media/) كي تعرض المخرجات بالخطّ المحزوم عينه لا بخطّ نظاميّ. سقوط رشيق: غيابه ⇒
// اللوحة تسقط لمكدّس خطّ عربيّ نظاميّ (كما قبلُ). أسوة بحزم أدوات ص، المصدر يُحقَن وقت البناء.
// المسارُ واسمُ الملفّ **لا يُعادان هنا**: صارا في `bundled-font.js` مصدرًا واحدًا للمُحمِّلَين.
// وإبقاءُ نسختين منهما هو **السيناريو الحرفيّ** الذي وُجد ذلك الملفُّ ليمنعه (إعادةُ تسمية
// `media/` تُصلَح في مكانٍ وتبقى في آخر)، فحملُ ثابتٍ ميّتٍ مُصدَّرٍ يُبقي البابَ مفتوحًا.
// (‏تُستورَد أعلاه مع `loadFontDataUri` — سطرُ استيرادٍ واحدٌ لملفٍّ واحد.)
// [TY-02] ارتفاع سطر هذه اللوحة — **القيمة المشتقّة نفسها** التي يضبطها mihrab-shell للمحرّر،
// لا رقمًا آخر. هذه لوحة مخرجات ص العربيّة (وجهة AR-01 وDR-03)، أي أشدّ أسطحنا امتلاءً
// بالتشكيل — وكانت عند 1.5، أي دون الأرضيّة المشتقّة 1.88 ⇒ تُقصّ قمّة الهمزة وذيل التنوين
// في السطح الذي بُني ليعرض العربيّة صحيحةً. الاشتقاق الكامل: patches/fonts/README.md.
// ‏[TY-02] الأرضيّةُ المقيسة `tests/dx/arabic_ink.measured.json` = ‎2.683em‎ (حبرٌ مركَّبٌ
// ‏لا كونتوراتٌ منفردة)، والقيمةُ ‎2.8‎ = ‎42px‎ عند حجم ‎15‎ بلا انجرافِ تقريب. لوحةُ العرض
// لا تقرأ JSON، فالرقمُ منسوخٌ هنا **ويحرسه** `lint_patchers._line_height_and_gpu`.
const ARABIC_LINE_HEIGHT = 2.8;

// أنواع رسائل الجسر — ثوابت السلك.
const MSG_START = "start"; // ext→web: بدء تشغيل جديد (label = سطر «يشغّل: …»)
const MSG_LINES = "lines"; // ext→web: دفعة أسطر مخرجات (stream = out/err) — دفعة واحدة لكلّ حدث data
const MSG_EXIT = "exit"; // ext→web: انتهاء (label + ok)
const MSG_CLEAR = "clear"; // ext→web: تفريغ السجلّ
// ext→web: **سطرٌ حيٌّ مفتوح** — بقيّةٌ لم يصلها فاصلُ سطرٍ بعدُ وسكت عنها البرنامج [م٧].
// يُلحَق نصُّه بعنصرٍ واحدٍ يُحدَّث في مكانه، ولا يُضاف سطرًا جديدًا: الطردُ كسطرٍ جديدٍ يُشظّي
// السطرَ العربيَّ الواحدَ إلى شظايا يستقلّ كلٌّ منها باتّجاهه تحت `unicode-bidi: plaintext`،
// أي **يهدم AR-01 نفسَه** الذي وُجدت اللوحةُ له — ويُفسِد النسخَ (سطرٌ واحدٌ يُنسَخ ثلاثةً).
const MSG_PARTIAL = "partial";
// ext→web: سطرُ نظامٍ خبريّ (ليس مخرَجَ البرنامج) — يُعرَض بنمط `sys`.
const MSG_NOTE = "note";
const MSG_STOP = "stop"; // web→ext: طلب إيقاف التشغيل الجاري
const MSG_READY = "ready"; // web→ext: الـwebview حمّل واستمع (مصافحة تمنع فقدان أوّل رسائل)
// web→ext: قياسُ عرض المحارف الفعليّ [TY-03]. عيّنةُ القياس تُستورَد من `font-probe.js`
// (مصدرُ حقيقةٍ واحد: مَن يقيس ومَن يحكم على القياس يتشاركان القائمةَ نفسَها).
const MSG_FONT_PROBE = "fontProbe";
// ext→web: أعِد القياس (بعد ضبطِ خطّ) — كي يُتحقَّق من الأثر لا يُدَّعى.
const MSG_REMEASURE = "remeasure";
const FONT_PROBE_SAMPLES = require("./font-probe.js").SAMPLES;
// [TY-06] تحويلُ أرقام **رسائلنا** وحدَها (رمزُ الخروج، عددُ الأسطر) — لا مخرَجِ
// البرنامج ولا مواضعِ الأخطاء: تلك أرقامُ تعاملٍ تُنسَخ وتُطابَق بأدواتٍ أخرى.
const { formatDigits, SETTING: DIGITS_SETTING } = require("./digits.js");

// وسما مجرى الإخراج (يحدّدان لون/نمط السطر في اللوحة).
const STREAM_OUT = "out";
const STREAM_ERR = "err";

// نوعا الإجراء (يحدّدان عنوان البدء ووسم الانتهاء: تشغيل مقابل بناء) [SAD-04].
const ACTION_RUN = "run";
const ACTION_BUILD = "build";

// إشارة إنهاء العمليّة عند الإيقاف أو الاستبدال بتشغيل أحدث. (ملاحظة منصّة: على ويندوز يقتل
// TerminateProcess العمليّة لا أحفادها — لو أطلق sad-run عمليّات فرعيّة قد تُيتَّم؛ قيد مقبول.)
const KILL_SIGNAL = "SIGTERM";

// [م٧] مجاري العمليّة صراحةً: **الدخلُ مُغلَق**، والمخرجان أنبوبان. الافتراضُ (`pipe` للثلاثة)
// كان يترك أنبوبَ دخلٍ مفتوحًا لا يُكتَب فيه ولا يُغلَق ⇒ برنامجٌ يستدعي «اقرأ» يعلّق **أبدًا**
// واللوحةُ تعرض «يشغّل: …» بلا نهاية. بالإغلاق يصل EOF فترجع القراءةُ نصًّا فارغًا وينتهي
// البرنامجُ برمزِ خروج. ولأنّ «انتهى بنجاح» فوق قراءةٍ لم تقع كذبٌ أهدأُ صوتًا لا إصلاح،
// يرافقه سطرُ نظامٍ يقول ما جرى (`COPY.noStdin`) حين يكشف المسحُ الساكنُ استدعاءَ «اقرأ».
const STDIO = ["ignore", "pipe", "pipe"];

// [م٧] مهلةُ خمولٍ (م.ث) يُطرَد بعدها السطرُ الجزئيُّ إلى اللوحة سطرًا حيًّا مفتوحًا. تُصفَّر
// وتُعاد عند **كلّ** دفعة، ولا تُسلَّح إلّا إذا بقيت بقيّةٌ ⇒ تدفّقٌ منتهٍ بأسطرٍ لا يُسلّحها
// أصلًا، وتدفّقٌ متّصلٌ لا يبلغ الخمولَ فلا تُطلَق: لا إبطاءَ ولا تشظٍّ تحت الفيضان.
// الرقمُ مشتقٌّ من ميزانيّة `docs/rtl/typography-decisions.md` (‏١٠٠ م.ث = تُحسّ فوريّة،
// ١ ثانية = حدُّ بقاء الانتباه): ١٥٠ تقع في العَشْر الأوّل من الميزانيّة، والمتلقّي إنسانٌ
// يستغرق قراءةَ السؤال أضعافَها. ولا داعيَ لأكثر: تحت «السطر الحيّ» الطردُ المبكِّر بلا كلفة.
const IDLE_FLUSH_MS = 150;

// أكواد أخطاء «فشل الإطلاق» في حدث child 'error' (لم تبدأ العمليّة أصلًا) — تُميَّز عن أخطاء
// ما-بعد-التشغيل: حدث 'error' مُهيمَن عليه بهذه (الأداة محذوفة/ممنوعة بين الفحص والإطلاق = TOCTOU).
const SPAWN_FAIL_CODES = new Set(["ENOENT", "EACCES", "EPERM"]);

// سقف احترازيّ لطابور الرسائل قبل مصافحة ready (لو لم يُنفَّذ سكربت الـwebview إطلاقًا) — backstop
// ذاكرة فقط؛ في الحالة الطبيعيّة يصل ready فورًا فلا يُبلَغ.
const MAX_PENDING = 10000;

// سقف أسطر السجلّ في الـwebview: برنامج يطبع بلا حدّ ⇒ نقصّ الأقدم كي لا يتضخّم DOM بلا حدّ
// (اللوحة مُبقاة في الذاكرة بـretainContextWhenHidden). حماية أداء لا حدّ منطقيّ للمخرجات.
const MAX_LOG_LINES = 5000;

// سقف طول السطر الواحد قبل قطعه قسرًا: مخرجات بلا فاصل سطر إطلاقًا (شريط تقدّم بـ\r، أو تدفّق
// ثنائيّ) تُراكِم في «rest» بلا حدّ ⇒ نموّ ذاكرة عمليّة الامتداد بلا سقف (backstop مفقود قبلَه).
// عند تجاوز السقف نُخرِج القطعة كسطرٍ ونُبقي الفائض للتالي. حماية ذاكرة لا حدّ منطقيّ (السطر
// الطبيعيّ أقصر بمراحل)؛ يبقى «rest» مقيّدًا بـMAX_LINE_LEN دومًا.
const MAX_LINE_LEN = 10000;

// هامش «لصق» التمرير بالبكسل: إن كان السجلّ عند أسفله (ضمن هذا الهامش) نتبع المخرجات الجديدة
// تلقائيًّا؛ وإلّا (المستخدم يقرأ سجلًّا أعلى) لا نخطف تمريره للأسفل. صغيرٌ يمتصّ تقريب البكسل فقط.
const SCROLL_STICK_PX = 4;

// نصوص الواجهة (عربيّة-أوّلًا = بيانات واجهة).
const COPY = {
  running: (f) => `يشغّل: ${f}`,
  building: (f) => `يبني: ${f}`,
  exitOk: "انتهى البرنامج بنجاح (رمز الخروج ٠).",
  exitFail: (c) => `انتهى البرنامج برمز خروج ${c}.`,
  buildOk: "تمّت الترجمة بنجاح.",
  buildFail: (c) => `فشلت الترجمة برمز ${c}.`,
  exitSignal: (s) => `أُنهي التشغيل بالإشارة ${s}.`,
  exitError: "توقّف التشغيل بخطأ.",
  stopped: "أُوقِف التشغيل.",
  replacedPrev: "(أُوقِف التشغيل السابق)",
  spawnFail: (e) => `تعذّر بدء التشغيل: ${e}`,
  procError: (e) => `خطأ في التشغيل: ${e}`,
  notStarted: "لم يبدأ التشغيل.",
  // [م٧] الجملةُ الوحيدةُ التي تمنع «انتهى بنجاح» من أن يُقرأ حكمًا على برنامجٍ لم يُعطَ دخلَه.
  // صياغتُها **شرطيّةٌ صادقة**: «كلُّ قراءةٍ نُفِّذت» — لا ندّعي أنّ القراءةَ وقعت (لا سبيلَ
  // لرصدها من خارج العمليّة)، بل ما يلزم عنها حتمًا لو وقعت. وتُعطي المخرَجَ لا التصنيف.
  noStdin:
    "اللوحةُ لا تستقبل دخلًا. وهذا الملفّ يستدعي «اقرأ» — فكلُّ قراءةٍ نُفِّذت أعادت نصًّا " +
    "فارغًا. لتشغيلٍ بدخلٍ حقيقيّ: شغّله في الطرفيّة.",
};

// ───────────────────────── منطق نقيّ (بلا vscode) ─────────────────────────

/**
 * يقطّع نصًّا متدفّقًا إلى أسطر كاملة + بقيّة (السطر الجزئيّ الأخير بلا فاصل سطر بعدُ).
 * يُمرَّر إليه ما تبقّى من الدفعة السابقة (prev) فيصل الأجزاء المقسومة عبر حدود الدفعات.
 * يُزال CR الزائد (\r) من نهايات ويندوز كي لا يظهر محرفًا شاذًّا في اللوحة.
 * backstop اختياريّ: إن تجاوزت البقيّة maxLineLen (سطر بلا فاصل يتضخّم بلا حدّ) نقطعها قسرًا
 * إلى أسطر بطول السقف كي تبقى «rest» مقيّدة ولا تنمو ذاكرة العمليّة بلا حدّ. صفر/غياب ⇒ بلا قطع.
 * @param {string} prev @param {string} chunk @param {number} [maxLineLen]
 * @returns {{ lines: string[], rest: string }}
 */
function takeLines(prev, chunk, maxLineLen) {
  const combined = prev + chunk;
  const parts = combined.split("\n");
  let rest = parts.pop() || ""; // آخر جزء: بقيّة (فارغ إن انتهى النصّ بـ\n)
  const lines = parts.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  // قطع قسريّ للسطر المتضخّم بلا فاصل (backstop ذاكرة) — يبقى «rest» ≤ maxLineLen دومًا.
  while (maxLineLen && rest.length > maxLineLen) {
    lines.push(rest.slice(0, maxLineLen));
    rest = rest.slice(maxLineLen);
  }
  return { lines, rest };
}

// [م٧] استدعاءٌ **حرٌّ** لدالّة القراءة `اقرأ(` — لا مسبوقًا بنقطةٍ (`إ2.اقرأ(...)` استدعاءُ
// عضوٍ مختلفٌ موجودٌ فعلًا في الدروس) ولا بحرفِ مُعرِّف (فلا يُلتقط ذيلُ اسمٍ أطول).
const READ_CALL_RE = /(?:^|[^.\wء-ي])اقرأ\s*\(/;

/**
 * هل يستدعي نصُّ برنامجِ ص قراءةَ الدخل؟ مسحٌ ساكنٌ نقيٌّ — **لا يدّعي أنّ القراءةَ ستقع**،
 * بل يجيب: أينبغي أن نُخبر المستخدمَ أنّ اللوحةَ لا تستقبل دخلًا؟ نافذةٌ خاطئةٌ موجبةٌ هنا
 * تكلّف سطرَ نظامٍ زائدًا، والخاطئةُ السالبةُ تكلّف «انتهى بنجاح» فوق برنامجٍ لم يُسأل.
 * تُطرَح النصوصُ والتعليقاتُ أوّلًا كي لا يُحسَب `اقرأ(` داخل نصٍّ حرفيٍّ أو شرحٍ استدعاءً.
 * @param {string} [text] @returns {boolean}
 */
function usesStdinRead(text) {
  if (!text) return false;
  const stripped = String(text)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""') // نصوص حرفيّة
    .replace(/#[^\n]*/g, "") // تعليق #
    .replace(/\/\/[^\n]*/g, ""); // تعليق //
  return READ_CALL_RE.test(stripped);
}

// ───────────────────────── طبقة webview/العمليّة ─────────────────────────

/** يولّد nonce تشفيريًّا لسياسة CSP (لا يُخمَّن) — أسوة بـchat.js. */
function makeNonce() {
  return crypto.randomBytes(16).toString("base64");
}

/**
 * يقرأ الخطّ العربيّ المحزوم من media/ داخل الامتداد ويُرجعه data: URI (base64) لتضمينه في
 * @font-face اللوحة، أو null إن غاب (سقوط رشيق). يُقرأ مرّةً عند إنشاء اللوحة لا لكلّ رسم.
 * @param {vscode.ExtensionContext} [context] @returns {string|null}
 */
function loadBundledFontDataUri(context) {
  if (!context || !context.extensionPath) return null;
  // المسارُ والقراءةُ وفحصُ البصمة في `bundled-font.js` — مصدرُ حقيقةٍ واحدٌ يشترك فيه هذا
  // السطحُ وتصديرُ الطباعة [PR-01]. ونسختان لمسارِ ملفٍّ واحدٍ تنجرفان: يُعاد تسميةُ
  // ‏`media/` فتُصلَح واحدةٌ وتبقى الأخرى تسقط سقوطًا رشيقًا بلا أن يلاحظ أحد.
  // وهنا `required: false` **عن عمد**: اللوحةُ أمام المستخدم فيرى السقوطَ ويُصلحه —
  // بخلاف ملفٍّ يُصدَّر للطباعة فيذهب حيث لا تصحيح. التعليلُ كاملًا في `bundled-font.js`.
  return loadFontDataUri(context.extensionPath, { required: false });
}

/**
 * يبني HTML اللوحة (RTL، CSP صارم، nonce). الهيكل فقط: كلّ نصّ مخرجات يصل عبر رسائل ويُدرَج
 * كـtextContent (لا حقن HTML من مخرجات البرنامج). جوهر AR-01 في CSS: «.line { unicode-bidi:
 * plaintext; text-align: start }» — لكلّ سطر اتّجاهه المستقلّ حسب محتواه. يبثّ «ready» عند
 * التحميل كي لا تُفقَد أوّل رسائل (START/CLEAR) قبل تسجيل المستمع.
 * fontDataUri (إن مُرِّر) ⇒ @font-face للخطّ المحزوم داخل اللوحة + font-src data: في CSP.
 * @param {string|null} [fontDataUri]
 */
function buildHtml(fontDataUri) {
  const nonce = makeNonce();
  const csp = [
    "default-src 'none'",
    // نسمح بمصدر خطّ data: فقط حين نُضمِّن الخطّ المحزوم (وإلّا لا مصدر خطّ خارجيّ إطلاقًا).
    fontDataUri ? "font-src data:" : "font-src 'none'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");
  // @font-face للخطّ المحزوم (Kawkab Mono) مُضمَّن كـdata: URI — يجعل اللوحة تعرض بالخطّ المحزوم
  // عينه لا بخطّ نظاميّ (الـwebview معزول عن @font-face وثيقة الـworkbench). فارغ عند غيابه.
  const fontFace = fontDataUri
    ? `\n  @font-face { font-family: "${FONT_FAMILY}"; font-style: normal; font-weight: 400; font-display: swap; src: url("${fontDataUri}") format("woff2"); }`
    : "";
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<style nonce="${nonce}">${fontFace}
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 0; height: 100vh; display: flex; flex-direction: column;
         color: var(--vscode-foreground); background: var(--vscode-panel-background, var(--vscode-editor-background)); }
  #head { display: flex; align-items: center; gap: 8px; padding: 6px 12px;
          border-bottom: 1px solid var(--vscode-panel-border); font-size: 12px; }
  #file { flex: 1; opacity: 0.85; unicode-bidi: plaintext; text-align: start;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #stop { font-family: inherit; padding: 3px 12px; border: none; border-radius: 6px; cursor: pointer;
          background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  #stop[hidden] { display: none; }
  /* الخطّ: الخطّ المحزوم (Kawkab Mono) أوّلًا حين يُضمَّن @font-face أعلاه (اللوحة تعرض
     بالخطّ المحزوم عينه)، ثمّ إعداد محرّر AR-02 (يكشف VSCode --vscode-editor-font-family
     للـwebview)، ثمّ احتياطيّ واعٍ بالعربيّة (Segoe UI/Noto Sans Arabic) لئلّا تسقط لخطّ
     لاتينيّ صرف لو غاب الخطّ المحزوم والمتغيّر معًا. */
  #log { flex: 1; overflow: auto; margin: 0; padding: 8px 12px;
         font-family: "${FONT_FAMILY}", var(--vscode-editor-font-family, ui-monospace, "Cascadia Mono", Consolas, "Segoe UI", "Noto Sans Arabic", monospace);
         font-size: var(--vscode-editor-font-size, 13px); line-height: ${ARABIC_LINE_HEIGHT}; }
  /* جوهر AR-01: كلّ سطر يأخذ اتّجاهه من أوّل محرف قويّ فيه (عربيّ⇐يمين، لاتينيّ/أرقام⇐يسار). */
  .line { unicode-bidi: plaintext; text-align: start; white-space: pre-wrap; word-break: break-word; min-height: 1.2em; }
  .line.err { color: var(--vscode-errorForeground); }
  /* [ON-02] الحالة الفارغة: نبرة خبريّة لا اعتذاريّة، وموجّهة للفعل لا للوصف. */
  #empty { padding: 32px 16px; text-align: center; opacity: .8; }
  #empty p { margin: 0 0 6px; }
  #empty .hint { font-size: .92em; opacity: .8; }
  .sys { opacity: 0.85; font-style: italic; }
  .sys.ok { color: var(--vscode-testing-iconPassed, var(--vscode-charts-green, inherit)); }
  .sys.bad { color: var(--vscode-errorForeground); }
</style>
</head>
<body>
  <div id="head"><span id="file"></span><button id="stop" hidden>أوقِف</button></div>
  <!-- ‏[م٧] السجلُّ منطقةُ بثٍّ حيٍّ مُعلَنة: دورُ log وصفٌ **صادقٌ** لِما هو (سجلٌّ يُلحَق
       به زمنيًّا)، لا إعلانٌ مُجازف. والسطرُ الحيُّ المفتوحُ يُستثنى منها بـaria-live=off
       لأنّه يتحوّر مع كلّ طردة؛ يُعلَن مرّةً واحدةً حين يُغلَق سطرًا مكتملًا. وما يسمعه قارئُ
       شاشةٍ فعلًا يبقى دعوى SR-01 — لا تُدَّعى هنا لأنّها تُقاس بجلسةٍ بشريّةٍ لا بحارس.
       (بلا شواهدَ خلفيّةٍ هنا: نحن داخل قالبٍ نصّيّ، والشاهدةُ تُنهيه فتُسقِط الملفّ.) -->
  <div id="log" role="log" aria-live="polite" aria-label="سجلّ مخرجات البرنامج"></div>
  <!-- [ON-02] الحالةُ الفارغة: اللحظاتُ التي يكون فيها المستخدمُ عالقًا وحاضرَ الذهن.
       جملةُ حالٍ + فعلٌ واحدٌ بزرّ — لا فراغٌ صامتٌ يُقرأ عطبًا. -->
  <div id="empty">
    <p>لم يُشغَّل شيءٌ بعد.</p>
    <p class="hint">افتح ملفَّ ص واضغط F5 — تظهر مخرجاتُ برنامجك هنا باتّجاهها الصحيح.</p>
  </div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const log = document.getElementById('log');
  const emptyEl = document.getElementById('empty');
  const fileEl = document.getElementById('file');
  const stop = document.getElementById('stop');
  const MAX = ${MAX_LOG_LINES};
  const STICK_PX = ${SCROLL_STICK_PX};

  // هل السجلّ عند أسفله (ضمن الهامش)؟ يُقاس **قبل** الإضافة كي نقرّر لصق التمرير.
  function nearBottom() {
    return log.scrollHeight - log.scrollTop - log.clientHeight <= STICK_PX;
  }

  // يضيف دفعة أسطر بصنف واحد: تمريرة تخطيط واحدة (لا خطف تمرير لكلّ سطر)، ولصق تمرير لاصق —
  // نتبع الأسفل تلقائيًّا فقط إن كان المستخدم عنده، وإلّا نحترم موضع قراءته أعلى.
  function append(texts, cls) {
    // أوّلُ سطرٍ يُخفي الحالةَ الفارغة — لا حاجةَ لرسالةٍ ثانيةٍ تقول إنّ التشغيل بدأ.
    if (emptyEl) { emptyEl.hidden = true; }
    const stick = nearBottom();
    for (const t of texts) {
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = t; // نصّ فقط — لا حقن HTML من مخرجات البرنامج
      log.appendChild(d);
    }
    // قصّ الأقدم فوق السقف (حماية أداء من مخرجات لا حدّ لها).
    while (log.childElementCount > MAX) log.removeChild(log.firstChild);
    if (stick) log.scrollTop = log.scrollHeight;
  }

  // [م٧] السطرُ الحيُّ المفتوحُ لكلّ مجرى: عنصرٌ واحدٌ يُحدَّث في مكانه حتّى يصل فاصلُ السطر.
  // حين تصل الأسطرُ المكتملةُ للمجرى نفسِه يُزال أوّلًا — لأنّ أوّلَ سطرٍ مكتملٍ **يحوي**
  // نصَّه أصلًا (takeLines يصل البقيّةَ بالدفعة التالية)، فلا تكرار.
  const openEls = { '${STREAM_OUT}': null, '${STREAM_ERR}': null };
  function closeOpen(stream) {
    const el = openEls[stream];
    if (el) { el.remove(); openEls[stream] = null; }
  }
  function setOpen(stream, text, cls) {
    if (emptyEl) { emptyEl.hidden = true; }
    const stick = nearBottom();
    let el = openEls[stream];
    if (!el) {
      el = document.createElement('div');
      el.className = cls;
      el.setAttribute('aria-live', 'off');
      log.appendChild(el);
      openEls[stream] = el;
    }
    el.textContent = text; // نصّ فقط — لا حقن HTML من مخرجات البرنامج
    if (stick) log.scrollTop = log.scrollHeight;
  }

  stop.addEventListener('click', () => vscode.postMessage({ type: '${MSG_STOP}' }));

  window.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === '${MSG_CLEAR}') {
      if (emptyEl) { emptyEl.hidden = false; }
      log.textContent = '';
      openEls['${STREAM_OUT}'] = null;
      openEls['${STREAM_ERR}'] = null;
    } else if (m.type === '${MSG_START}') {
      fileEl.textContent = m.label || '';
      stop.hidden = false;
    } else if (m.type === '${MSG_LINES}') {
      const cls = 'line ' + (m.stream === '${STREAM_ERR}' ? 'err' : 'out');
      closeOpen(m.stream);
      append(m.lines, cls);
    } else if (m.type === '${MSG_PARTIAL}') {
      setOpen(m.stream, m.text, 'line ' + (m.stream === '${STREAM_ERR}' ? 'err' : 'out'));
    } else if (m.type === '${MSG_NOTE}') {
      append([m.label], 'line sys');
    } else if (m.type === '${MSG_EXIT}') {
      append([m.label], 'line sys ' + (m.ok ? 'ok' : 'bad'));
      stop.hidden = true;
    }
  });
  // [TY-03] قياسُ أحاديّة العرض **حيًّا**، حيث توجد شاشةٌ وخطٌّ مُحلَّلٌ فعلًا. مُضيفُ الامتداد
  // بلا DOM فلا يستطيع هذا القياس، وحارسا L0/L2 يفحصان الإعدادَ والحزمةَ لا ما يُرسَم على
  // جهاز المستخدم. وهذه اللوحةُ **أنسبُ موضعٍ**: هي السطحُ الذي يظهر فيه خرجُ ص العربيّ،
  // وهي تُفتَح في أوّل تشغيل — قياسٌ بلا سطحٍ جديدٍ ولا مقاطعةٍ للمستخدم.
  //
  // **ولا نقيس خطَّ اللوحة نفسِها.** مكدَّسُ سجلّ اللوحة يبدأ بالوجه المحزوم، ووجهُه
  // مُضمَّنٌ في هذه الوثيقة، فقياسُه يعطي «أحاديُّ العرض» **دائمًا** — أي أنّ الكاشفَ يعمى
  // بالضبط عن الحالة التي بُني لها (مستخدمٌ ضبط خطَّ المحرّر إلى وجهٍ متناسب).
  // فنقيس على عنصرٍ مخصَّصٍ خطُّه **خطُّ المحرّر وحدَه**، بلا وجهنا في مقدّمة المكدّس.
  // (بلا شواهدَ خلفيّةٍ هنا: نحن داخل قالبٍ نصّيّ، والشاهدةُ تُنهيه فتُسقِط الملفَّ.)
  function probeEditorFont() {
    const el = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;top:-9999px;' +
      'font-family:var(--vscode-editor-font-family);font-size:var(--vscode-editor-font-size,14px)';
    document.body.appendChild(el);
    try {
      const cs = getComputedStyle(el);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = cs.fontSize + ' ' + cs.fontFamily;
      const widths = {};
      for (const ch of ${JSON.stringify(FONT_PROBE_SAMPLES)}) {
        widths[ch] = ctx.measureText(ch).width;
      }
      vscode.postMessage({ type: '${MSG_FONT_PROBE}', fontFamily: cs.fontFamily, widths: widths });
    } finally {
      el.remove();
    }
  }
  // ننتظر تحميلَ الوجوه: القياسُ قبلها يقع على الاحتياطيّ المتناسب ⇒ **إنذارٌ كاذبٌ في
  // أوّل فتحة**. وdocument.fonts.ready موجودةٌ في كلّ متصفّحٍ يشغّل هذه اللوحة.
  try {
    const run = () => { try { probeEditorFont(); } catch (e) {} };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run, run);
    else run();
  } catch (e) {
    // القياسُ تحسينيّ: فشلُه لا يمنع اللوحةَ من عرض المخرجات.
  }
  // يُعاد القياسُ عند الطلب (بعد ضبطِ خطٍّ) كي يُتحقَّق من الأثر لا يُدَّعى.
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === '${MSG_REMEASURE}') { try { probeEditorFont(); } catch (err) {} }
  });
  // مصافحة: أبلِغ الامتداد أنّ المستمع جاهز كي يبثّ الرسائل المؤجّلة (START/CLEAR أوّل تشغيل).
  vscode.postMessage({ type: '${MSG_READY}' });
</script>
</body>
</html>`;
}

/**
 * لوحة مخرجات ص العربيّة: تملك webview مفردًا وتبثّ إليه مخرجات عمليّة sad-run حيًّا. تُنشأ
 * كسولًا عند أوّل تشغيل، وتُعاد استعمالها. دورة الحياة يديرها المُستدعِي (extension.activate)
 * عبر context.subscriptions (dispose يقتل أيّ عمليّة ويغلق اللوحة).
 */
class SadOutputPanel {
  /** @param {vscode.ExtensionContext} [context] لقراءة الخطّ العربيّ المحزوم من media/ (اختياريّ). */
  constructor(context) {
    /** @type {vscode.WebviewPanel | null} */
    this._panel = null;
    /** @type {import('child_process').ChildProcess | null} */
    this._proc = null;
    /** @type {vscode.Disposable | undefined} */
    this._msgSub = undefined;
    // مصافحة التحميل: قبل «ready» تُصفّ الرسائل في _pending كي لا تُفقَد.
    this._ready = false;
    /** @type {object[]} */
    this._pending = [];
    // [م٧] مؤقّتا طردِ السطر الجزئيّ (واحدٌ لكلّ مجرًى) — انظر `_armIdle`.
    /** @type {{ out: any, err: any }} */
    this._idle = { [STREAM_OUT]: null, [STREAM_ERR]: null };
    // [م٧] هل يستدعي الملفُّ المُشغَّلُ «اقرأ»؟ يُحسَب مرّةً عند الإطلاق (مسحٌ ساكن) ويُقرأ
    // عند الخروج ليُرافَق «انتهى بنجاح» بسطرِ نظامٍ يقول إنّ اللوحةَ لا تستقبل دخلًا.
    this._interactive = false;
    // الخطّ المحزوم كـdata: URI (يُقرأ مرّةً؛ null إن غاب ⇒ سقوط رشيق لمكدّس الخطّ النظاميّ).
    this._fontDataUri = loadBundledFontDataUri(context);
    // [TY-03] مستقبِلُ قياس عرض المحارف — يُحقَن من `activate` ولا تعرفه اللوحة.
    /** @type {((m:{fontFamily:string, widths:Record<string,number>}) => void) | null} */
    this._onFontProbe = null;
    this._disposed = false;
  }

  /** يسجّل مستقبِلَ قياس الخطّ [TY-03]. يُستدعى مرّةً لكلّ فتحةِ لوحة. */
  onFontProbe(fn) {
    this._onFontProbe = fn;
  }

  /** يطلب إعادةَ القياس [TY-03] — بعد ضبطِ خطٍّ، كي يُتحقَّق من الأثر لا يُدَّعى. */
  requestRemeasure() {
    if (this._panel && this._ready) void this._panel.webview.postMessage({ type: MSG_REMEASURE });
  }

  /** يُنشئ اللوحة عند الحاجة (كسولًا) ويربط جسر الرسائل ودورة الإغلاق. */
  _ensurePanel() {
    if (this._panel) return this._panel;
    this._ready = false;
    this._pending = [];
    const panel = vscode.window.createWebviewPanel(
      PANEL_TYPE,
      PANEL_TITLE,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      // localResourceRoots: [] تشديد دفاعيّ — لا موارد محلّيّة تُحمَّل إطلاقًا (CSP أصلًا
      // default-src 'none'، والهيكل بلا src خارجيّ)؛ يمنع أيّ تحميل ملفّ محلّيّ لو تسرّب مرجع.
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
    );
    panel.webview.html = buildHtml(this._fontDataUri);
    this._msgSub = panel.webview.onDidReceiveMessage((m) => {
      if (!m || typeof m !== "object") return;
      if (m.type === MSG_READY) {
        this._ready = true;
        const queued = this._pending;
        this._pending = [];
        for (const msg of queued) void panel.webview.postMessage(msg);
      } else if (m.type === MSG_STOP) {
        this.stop();
      } else if (m.type === MSG_FONT_PROBE) {
        // [TY-03] القياسُ يُرفَع إلى مَن حقنه، ولا تحكم عليه اللوحة: فصلُ القياس عن الحكم
        // يُبقي اللوحةَ لوحةَ مخرجاتٍ ويجعل القرارَ قابلًا للاختبار وحدَه.
        if (this._onFontProbe) {
          try {
            this._onFontProbe({ fontFamily: m.fontFamily, widths: m.widths });
          } catch {
            /* تحسينيّ — لا يُفشِل اللوحة */
          }
        }
      }
    });
    panel.onDidDispose(() => {
      this._panel = null;
      this._ready = false;
      this._pending = [];
      if (this._msgSub) this._msgSub.dispose();
      this._killProc(); // إغلاق اللوحة يقتل التشغيل الجاري (لا عمليّة يتيمة بلا وجهة عرض)
    });
    this._panel = panel;
    return panel;
  }

  /** يرسل رسالةً للّوحة، ويصفّها قبل جاهزيّة الـwebview (مصافحة ready) كي لا تُفقَد. */
  _post(message) {
    if (!this._panel) return;
    if (!this._ready) {
      this._pending.push(message);
      if (this._pending.length > MAX_PENDING) this._pending.shift();
      return;
    }
    void this._panel.webview.postMessage(message);
  }

  /** [م٧] يُلغي مؤقّتَي الخمول (كلاهما أو أحدهما) — لا طردَ متأخّرًا لعمليّةٍ ماتت. */
  _clearIdle(stream) {
    const slots = stream ? [stream] : [STREAM_OUT, STREAM_ERR];
    for (const s of slots) {
      if (this._idle && this._idle[s]) {
        clearTimeout(this._idle[s]);
        this._idle[s] = null;
      }
    }
  }

  /**
   * [م٧] يُسلّح مؤقّتَ طردِ السطر الجزئيّ لمجرًى واحد: يُصفَّر ويُعاد عند **كلّ** دفعة، ولا
   * يُسلَّح إن لم تبقَ بقيّة. فالتدفّقُ المنتهي بأسطرٍ لا يُسلّحه أصلًا، والمتّصلُ لا يبلغ
   * الخمولَ فلا يُطلقه — وهذا ما يفرّقه عن `setInterval` دوريٍّ يُطلِق **وسطَ** الفيضان فيشظّي.
   */
  _armIdle(proc, stream, ref) {
    this._clearIdle(stream);
    if (!ref.rest) return;
    this._idle[stream] = setTimeout(() => {
      this._idle[stream] = null;
      if (this._proc !== proc || !ref.rest) return;
      this._post({ type: MSG_PARTIAL, stream, text: ref.rest });
    }, IDLE_FLUSH_MS);
  }

  /** يقتل العمليّة الجارية (إن وُجدت) ويصفّر المرجع. */
  _killProc() {
    this._clearIdle();
    if (this._proc) {
      try {
        this._proc.kill(KILL_SIGNAL);
      } catch {
        // العمليّة انتهت أصلًا — تجاهل.
      }
      this._proc = null;
    }
  }

  /** يوقف التشغيل الجاري بطلب المستخدم (زرّ «أوقِف»). */
  stop() {
    if (!this._proc) return;
    this._killProc(); // يصفّر _proc ⇒ حرّاس close/data أدناه يتجاهلون أحداث العمليّة المقتولة
    this._post({ type: MSG_EXIT, label: COPY.stopped, ok: false });
  }

  /**
   * يشغّل الأمر ويبثّ مخرجاته للّوحة (بديل الطرفيّة، bidi صحيح لكلّ سطر). يستبدل أيّ تشغيل
   * سابق. يفكّ ترميز UTF-8 عبر حدود الدفعات (StringDecoder) ويقطّع الأسطر نقيًّا (takeLines).
   * action ∈ {run, build} يحدّد عنوان البدء ووسم الانتهاء (تشغيل مقابل ترجمة) [SAD-04].
   * @param {string} cmd @param {string[]} args @param {string} cwd @param {string} fileLabel
   * @param {"run"|"build"} [action]
   * @param {string} [sourceText] نصُّ برنامج ص — يُمسَح ساكنًا بحثًا عن «اقرأ» [م٧]. يُمرَّر
   *        نصًّا لا مسارًا: الوثيقةُ محفوظةٌ للتوّ فالنصُّ عينُه، وبلا قراءةِ قرصٍ ولا ترميز.
   */
  run(cmd, args, cwd, fileLabel, action, sourceText) {
    if (this._disposed) return;
    const isBuild = action === ACTION_BUILD;
    // البناءُ لا يشغّل البرنامج، فلا قراءةَ دخلٍ فيه مهما كان نصُّه.
    this._interactive = !isBuild && usesStdinRead(sourceText);
    const hadLive = !!this._proc; // كان تشغيلٌ جارٍ سيُستبدَل ⇒ نُعلِم بدل مسح/قتل صامت [تدقيق #3]
    this._killProc(); // استبدل أيّ تشغيل سابق قبل بدء الجديد
    const panel = this._ensurePanel();
    panel.reveal(vscode.ViewColumn.Beside, true);
    this._post({ type: MSG_CLEAR });
    this._post({ type: MSG_START, label: (isBuild ? COPY.building : COPY.running)(fileLabel) });
    if (hadLive) this._post({ type: MSG_LINES, stream: STREAM_OUT, lines: [COPY.replacedPrev] });

    let proc;
    try {
      proc = cp.spawn(cmd, args, { cwd, windowsHide: true, stdio: STDIO });
    } catch (e) {
      this._post({ type: MSG_LINES, stream: STREAM_ERR, lines: [COPY.spawnFail(errText(e))] });
      this._post({ type: MSG_EXIT, label: COPY.notStarted, ok: false });
      return;
    }
    this._proc = proc;

    const outDec = new StringDecoder("utf8");
    const errDec = new StringDecoder("utf8");
    const outRef = { rest: "" };
    const errRef = { rest: "" };

    // يفكّ الترميز، يقطّع الأسطر الكاملة، ويبثّها دفعةً واحدة؛ يحتفظ بالسطر الجزئيّ للدفعة
    // التالية. حارس `_proc !== proc`: أسطر عمليّة استُبدلت/أُوقِفت وصلت متأخّرةً لا تُلوّث تشغيلًا آخر.
    const pump = (buf, dec, stream, ref) => {
      if (this._proc !== proc) return;
      const { lines, rest } = takeLines(ref.rest, dec.write(buf), MAX_LINE_LEN);
      ref.rest = rest;
      if (lines.length) this._post({ type: MSG_LINES, stream, lines });
      this._armIdle(proc, stream, ref); // [م٧] يُصفَّر ويُعاد مع كلّ دفعة
    };
    // يبثّ ما تبقّى (سطر أخير بلا فاصل) عند انتهاء العمليّة.
    const flushTail = (dec, stream, ref) => {
      const tail = ref.rest + dec.end();
      ref.rest = "";
      const line = tail.endsWith("\r") ? tail.slice(0, -1) : tail;
      if (line) this._post({ type: MSG_LINES, stream, lines: [line] });
    };

    if (proc.stdout) proc.stdout.on("data", (b) => pump(b, outDec, STREAM_OUT, outRef));
    if (proc.stderr) proc.stderr.on("data", (b) => pump(b, errDec, STREAM_ERR, errRef));

    proc.on("error", (e) => {
      if (this._proc !== proc) return; // استُبدل/أُوقِف ⇒ تجاهل
      // حدث 'error' مُهيمَن عليه بفشل الإطلاق (ENOENT/EACCES) ⇒ «لم يبدأ»؛ وإلّا خطأ ما-بعد-التشغيل.
      const failedToStart = !!(e && SPAWN_FAIL_CODES.has(e.code));
      this._post({
        type: MSG_LINES,
        stream: STREAM_ERR,
        lines: [(failedToStart ? COPY.spawnFail : COPY.procError)(errText(e))],
      });
      this._post({ type: MSG_EXIT, label: failedToStart ? COPY.notStarted : COPY.exitError, ok: false });
      this._proc = null;
    });
    proc.on("close", (code, signal) => {
      if (this._proc !== proc) return; // استُبدل بتشغيل أحدث أو أُوقِف يدويًّا ⇒ تجاهل
      this._clearIdle(); // [م٧] لا طردَ متأخّرًا بعد الخروج — flushTail أدناه يُغلق المفتوح
      flushTail(outDec, STREAM_OUT, outRef);
      flushTail(errDec, STREAM_ERR, errRef);
      // [م٧] سطرُ النظام قبل حكمِ الخروج: البرنامجُ طلب دخلًا واللوحةُ لا تعطيه، فلولاه
      // يُقرأ «انتهى بنجاح» حكمًا على البرنامج — فيُصلِح المستخدمُ شيفرتَه وليست عاطلة.
      // لا يظهر لبرنامجٍ لم يستدعِ «اقرأ»، ولا لبناء، ولا لتشغيلٍ أُنهيَ بإشارة (لم يكمل).
      if (this._interactive && !signal) {
        this._post({ type: MSG_NOTE, label: COPY.noStdin });
      }
      let label;
      if (signal) label = COPY.exitSignal(signal);
      else if (isBuild) label = code === 0 ? COPY.buildOk : COPY.buildFail(code);
      else label = code === 0 ? COPY.exitOk : COPY.exitFail(code);
      this._post({ type: MSG_EXIT, label, ok: code === 0 && !signal });
      this._proc = null;
    });
  }

  /** إغلاق: يقتل العمليّة ويغلق اللوحة. */
  dispose() {
    this._disposed = true;
    this._killProc();
    if (this._panel) this._panel.dispose();
    this._panel = null;
  }
}

/** يستخلص نصّ خطأ مقروءًا من كائن خطأ (رسالة إن وُجدت). */
function errText(e) {
  return String(e && e.message ? e.message : e);
}

module.exports = {
  SadOutputPanel,
  takeLines,
  usesStdinRead,
  IDLE_FLUSH_MS,
  buildHtml,
  loadBundledFontDataUri,
  COPY,
  MAX_LOG_LINES,
  MAX_LINE_LEN,
  FONT_FAMILY,
  FONT_FILE,
  BUNDLED_MEDIA_DIR,
  ACTION_RUN,
  ACTION_BUILD,
};
