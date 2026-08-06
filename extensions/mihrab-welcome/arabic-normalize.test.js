"use strict";
/** اختباراتُ تطبيع البحث العربيّ [DX-01] — وحدةٌ نقيّة، فلا بديلَ ولا محرّر. */
const test = require("node:test");
const assert = require("node:assert");
const N = require("./arabic-normalize.js");

test("يجرّد التشكيلَ ولا يمسّ الحروف", () => {
  assert.strictEqual(N.normalizeArabic("نِصابُ الفِضَّة"), "نصاب الفضه");
  assert.strictEqual(N.normalizeArabic("مُرقَّعٌ"), "مرقع");
});

test("يجرّد التطويل (الكشيدة)", () => {
  assert.strictEqual(N.normalizeArabic("الـــتـــطـــويل"), "التطويل");
});

test("يوحّد عائلةَ الألف", () => {
  assert.strictEqual(N.normalizeArabic("أحمد إبراهيم آمال ٱسم"), "احمد ابراهيم امال اسم");
});

test("يوحّد التاءَ المربوطةَ والألفَ المقصورة وحاملَي الهمزة", () => {
  assert.strictEqual(N.normalizeArabic("مكتبة"), N.normalizeArabic("مكتبه"));
  assert.strictEqual(N.normalizeArabic("على"), N.normalizeArabic("علي"));
  assert.strictEqual(N.normalizeArabic("مسؤول"), "مسوول");
  assert.strictEqual(N.normalizeArabic("مسئول"), "مسيول");
});

test("يحوّل الأرقامَ الهنديّةَ والفارسيّةَ إلى لاتينيّة", () => {
  assert.strictEqual(N.normalizeArabic("١٢٣٤٥٦٧٨٩٠"), "1234567890");
  assert.strictEqual(N.normalizeArabic("۴۵"), "45");
});

test("يصغّر اللاتينيّةَ ويترك ما عداها", () => {
  assert.strictEqual(N.normalizeArabic("Main_دالة"), "main_داله");
  assert.strictEqual(N.normalizeArabic("_-/"), "_-/");
});

test("يجرّد علاماتِ الاتّجاه الخفيّة (فلا تكسر المطابقة)", () => {
  const RLM = String.fromCharCode(0x200f);
  const FSI = String.fromCharCode(0x2068);
  const PDI = String.fromCharCode(0x2069);
  assert.strictEqual(N.normalizeArabic("ا" + RLM + "ب" + FSI + "ج" + PDI), "ابج");
});

test("مدخلٌ فارغٌ أو غيرُ نصٍّ يعيد سلسلةً فارغة (لا يرمي)", () => {
  assert.strictEqual(N.normalizeArabic(""), "");
  assert.strictEqual(N.normalizeArabic(null), "");
  assert.strictEqual(N.normalizeArabic(undefined), "");
  assert.strictEqual(N.normalizeArabic(42), "");
});

test("matchesNormalized يطابق في الاتّجاهين", () => {
  assert.ok(N.matchesNormalized("فضه", "نصاب_الفِضَّة"));
  assert.ok(N.matchesNormalized("فضة", "نصاب_الفضه"));
  assert.ok(N.matchesNormalized("", "أيّ شيء"), "استعلامٌ فارغٌ يطابق كلَّ شيء");
  assert.ok(!N.matchesNormalized("ذهب", "نصاب_الفضة"));
});

test("dualFilterText يحمل الرسمَين، ولا يكرّر بلا فائدة", () => {
  const dual = N.dualFilterText("نصاب_الفضة");
  assert.ok(dual.includes("نصاب_الفضة"), "الأصلُ حاضر");
  assert.ok(dual.includes("نصاب_الفضه"), "المطبَّعُ حاضر");
  // لاتينيٌّ صِرفٌ صغيرٌ أصلًا ⇒ لا شقَّ ثانيًا (لا تضخيمَ بلا فائدة).
  assert.strictEqual(N.dualFilterText("main"), "main");
  assert.strictEqual(N.dualFilterText(null), "");
});

test("يحلّ صيغَ العرض العربيّة واللامألف (أشيعُ ما يُلصَق من PDF ومن الشابكة)", () => {
  // U+FE8D..U+FEFC وغيرُها: صورُ الحرف حسب موضعه. من لصقها ثمّ بحث بها يجب أن يجد.
  assert.strictEqual(N.normalizeArabic("ﺍﻟﻜﺘﺎﺏ"), N.normalizeArabic("الكتاب"));
  assert.strictEqual(N.normalizeArabic("ﻻ"), N.normalizeArabic("لا"));
  assert.strictEqual(N.normalizeArabic("ﻷ"), N.normalizeArabic("لأ"));
  assert.strictEqual(N.normalizeArabic("ﮐﺘﺎﺏ"), N.normalizeArabic("كتاب"));
  assert.ok(N.matchesNormalized("الكتاب", "ﺍﻟﻜﺘﺎﺏ"), "البحثُ بالمكتوب يجد الملصوق");
});

test("التاءُ المربوطةُ الأردويّة (U+06C3) توحَّد أيضًا", () => {
  assert.strictEqual(N.normalizeArabic("ۃ"), "ه");
});

test("عقدُ «لا تحفظ الإزاحات» معلَنٌ في الاتّجاهين: النقصُ بالحذف والزيادةُ بالتفكيك", () => {
  for (const s of ["نِصابُ الفِضَّة", "الـتطويل", "١٢٣", "Main", ""]) {
    assert.ok(N.normalizeArabic(s).length <= s.length, "الحذفُ يُقصِّر: " + s);
  }
  // وNFKC **يزيد** الطول: «ﻻ» محرفٌ واحدٌ يصير حرفين. ولذلك لا تُشتَقّ مديات من الناتج.
  assert.ok(N.normalizeArabic("ﻻ").length > "ﻻ".length);
});
