"use strict";
/**
 * الخطُّ المحزوم — مُحمِّلٌ واحدٌ بسياستَي فشلٍ مختلفتين عمدًا [PR-01].
 *
 * ## لماذا وُجد هذا الملفّ
 * كان `output-panel.js` يملك `loadBundledFontDataUri` وحدَه. ولمّا احتاجه تصديرُ الطباعة
 * كان البديلُ نسخَه — ونسختان لمسارِ ملفٍّ واحدٍ تنجرفان: يُعاد تسميةُ `media/` فتُصلَح
 * واحدةٌ وتبقى الأخرى تسقط سقوطًا رشيقًا **بلا أن يلاحظ أحد**.
 *
 * ## وسياستا الفشل ليستا سهوًا
 * غيابُ الخطّ حدثٌ واحدٌ وأثرُه مختلفٌ باختلاف السطح:
 *
 *   • **لوحةٌ حيّة** (`optional`): تسقط إلى مكدّس الخطّ النظاميّ. المستخدمُ أمام الشاشة،
 *     يرى النتيجةَ فورًا، ويستطيع أن يُصلح. فالسقوطُ الرشيقُ صحيحٌ هنا.
 *
 *   • **ملفٌّ يُصدَّر للطباعة** (`required`): يذهب حيث **لا تصحيح** — يُطبَع، يُرفَق بمراجعة،
 *     يُرسَل. وملفٌّ يبدو سليمًا عند مُصدِّره ويُطبَع بخطٍّ لاتينيٍّ عند غيره **أسوأُ من
 *     فشلٍ صريح**، لأنّ الفشلَ يُصلَح والانحرافُ الصامتُ يُوقَّع عليه. فيرمي.
 *
 * وهذا **استثناءٌ معلَنٌ** من قاعدة السقوط الرشيق في المستودع، لا مخالفةٌ لها: القاعدةُ
 * تسقط رشيقًا حين يبقى للمستخدم سبيلٌ إلى الرؤية والتصحيح — وهو المفقودُ في الورق.
 *
 * وحدةٌ **شبهُ نقيّة**: لا `vscode` — تأخذ مسارَ جذرِ الامتداد نصًّا فتُختبَر وحدويًّا.
 */
const fs = require("node:fs");
const path = require("node:path");

const BUNDLED_MEDIA_DIR = "media";
const FONT_FILE = "kawkab-mono.woff2";
const FONT_FAMILY = "Kawkab Mono";

/** بصمةُ صيغة WOFF2 في أوّل أربعةِ بايتات. ملفٌّ مقتطعٌ أو مبدَّلٌ يسقط عليها. */
const WOFF2_MAGIC = "wOF2";

/** الأثرُ ثمّ ما يُفعَل — لا شكوى ومسارٌ. الحالةُ الغالبةُ تشغيلٌ من المصدر (F5): `media/`
 *  مصنوعُ بناءٍ مُتجاهَلٌ في git، فهذا المسارُ يُطرَق **دائمًا** في التطوير لا نادرًا. */
const FIX_HINT =
  "الحلّ: شغّل «bash build/build.sh» لينسخ الخطَّ إلى media/، أو استعمل نسخةً مبنيّةً من محراب.\n" +
  "(‏media/ مصنوعُ بناءٍ غيرُ متتبَّعٍ في git — فهو غائبٌ دائمًا عند التشغيل من المصدر.)";

const COPY = {
  missing: (p) =>
    "لا خطَّ عربيًّا محزومًا في النسخة — لا يمكن التصدير للطباعة.\n" +
    "الملفُّ المطبوع يذهب حيث لا تصحيح، فتصديرُه بخطٍّ لاتينيٍّ ساقطٍ يُخفي العطبَ ولا يمنعه.\n" +
    FIX_HINT + "\nالمتوقَّع: " + p,
  corrupt: (p) =>
    "الخطُّ المحزوم ليس ملفَّ WOFF2 سليمًا (بصمةُ الصيغة لا تطابق) — لا يمكن التصدير.\n" +
    FIX_HINT + "\nالمتوقَّع: " + p,
};

/** مسارُ الخطّ داخل الامتداد. مصدرُ حقيقةٍ واحدٌ للمُحمِّلَين ولاختباراتهما. */
function fontPath(extensionPath) {
  return path.join(extensionPath, BUNDLED_MEDIA_DIR, FONT_FILE);
}

/**
 * يقرأ الخطّ ويُرجعه `data:` URI.
 * @param {string|null|undefined} extensionPath جذرُ الامتداد
 * @param {{ required?: boolean }} [opts] `required` ⇒ يرمي بدل أن يُرجع null
 * @returns {string|null}
 */
function loadFontDataUri(extensionPath, opts = {}) {
  const required = opts.required === true;
  const p = extensionPath ? fontPath(extensionPath) : null;
  let buf = null;
  try {
    if (p && fs.statSync(p).isFile()) buf = fs.readFileSync(p);
  } catch { /* يُعالَج أدناه — الفرقُ بين «غائب» و«معطوب» يُقال بالرسالة لا بالصمت */ }
  if (!buf) {
    if (required) throw new Error(COPY.missing(p || "(لا مسارَ امتداد)"));
    return null;
  }
  // بصمةُ الصيغة: `readFileSync` ينجح على ملفٍّ مقتطعٍ أو على كعبٍ فارغ، و«الحمولةُ موجودة»
  // تأكيدٌ ينجح عليهما معًا. فيُفحَص **ما قُرئ** لا أنّه قُرئ.
  if (buf.length < 4 || buf.toString("latin1", 0, 4) !== WOFF2_MAGIC) {
    if (required) throw new Error(COPY.corrupt(p));
    return null;
  }
  return "data:font/woff2;base64," + buf.toString("base64");
}

module.exports = { loadFontDataUri, fontPath, BUNDLED_MEDIA_DIR, FONT_FILE, FONT_FAMILY, WOFF2_MAGIC, COPY };
