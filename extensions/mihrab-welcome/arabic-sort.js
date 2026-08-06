"use strict";
/**
 * ترتيبٌ لغويٌّ للعربيّة [DX-06] — وحدةٌ نقيّةٌ بلا `vscode`.
 *
 * ## الفجوة
 * بحثٌ عن `Intl.Collator` و`localeCompare` في شيفرة محرابٍ المكتوبةِ يدويًّا: **صفرُ نتائج**.
 * فكلُّ فرزٍ في إضافاتنا كان مقارنةَ سلاسلَ خام.
 *
 * ## لماذا يضرّ
 * المقارنةُ الخامُ ترتّب بنقطةِ الكود، فتفرّق بين «أ» (‏U+0623) و«ا» (‏U+0627) و«إ» (‏U+0625)
 * وتضعها متباعدة، وتضع الهمزةَ المفردةَ في مكانٍ لا يتوقّعه أحد. وأثرُ ذلك مباشر: **قائمةُ
 * أسماءٍ عربيّةٍ تبدو غيرَ مرتّبة**، ولا يُعثَر فيها على الاسم بالتصفّح. وهو نوعُ الخلل الذي
 * لا يُبلَّغ عنه ويُشعَر به — «هذا المحرّرُ فوضويٌّ قليلًا».
 *
 * ## الخيارات ولماذا
 *   • `sensitivity: 'base'` — يوحّد الهمزاتِ والتشكيل، فيقع «أحمد» بجوار «احمد» لا بعيدًا
 *     عنه. وهو `DX-01` نفسُه من بابِ الفرز لا البحث.
 *   • `numeric: true` — «ملفّ2» قبل «ملفّ10» لا بعدها (ترتيبٌ طبيعيٌّ للأرقام داخل الأسماء).
 *   • `caseFirst: 'false'` — لا أفضليّةَ لحالةٍ لاتينيّة؛ محرابٌ عربيٌّ-أوّلًا.
 *
 * ## حدٌّ معلَن
 * فرزُ **مستكشف المنبع** ليس من هذا: يعيش في المنبع ولا نملكه. وهل هو معطوبٌ فعلًا للعربيّة؟
 * **لم نقِسه** — وإن ثبت خللُه فهو بندٌ منبعيٌّ يصيب كلَّ لغةٍ غيرِ لاتينيّة، لا رقعةٌ عندنا.
 */

const LOCALE = "ar";
const OPTIONS = { numeric: true, sensitivity: "base", caseFirst: "false" };

/**
 * مُقارِنٌ عربيٌّ واحدٌ يُنشأ مرّةً — إنشاءُ `Intl.Collator` مكلفٌ نسبيًّا، وإنشاؤه داخل
 * `sort` يعني إنشاءَه لكلّ مقارنة. وسقوطٌ لطيفٌ إن غاب `Intl` (بيئةٌ مقلَّمة).
 */
let _collator = null;
function collator() {
  if (_collator) return _collator;
  try {
    const c = new Intl.Collator(LOCALE, OPTIONS);
    _collator = (a, b) => c.compare(String(a), String(b));
  } catch {
    // بلا `Intl`: مقارنةٌ خامٌّ صريحةٌ خيرٌ من رمي — والحدُّ معلَنٌ لا مخفيّ.
    _collator = (a, b) => String(a).localeCompare(String(b));
  }
  return _collator;
}

/** يقارن نصَّين ترتيبًا عربيًّا. صالحٌ مباشرةً لـ`Array.prototype.sort`. */
function compareArabic(a, b) {
  return collator()(a, b);
}

/**
 * يفرز مصفوفةً **بنسخةٍ جديدة** (لا يعدّل الأصل — دالّةٌ نقيّة).
 * @param {any[]} items @param {(x:any)=>string} [keyOf] مستخرِجُ المفتاح النصّيّ.
 */
function sortArabic(items, keyOf) {
  const key = keyOf || ((x) => x);
  return [...items].sort((a, b) => compareArabic(key(a), key(b)));
}

module.exports = { compareArabic, sortArabic, LOCALE, OPTIONS };
