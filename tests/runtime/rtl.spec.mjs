// تأكيدات RTL الوقتيّة (L3) — مشتقّة من docs/rtl/rtl-inventory.md، هندسيّة حتميّة بسماحية.
import { editorGeometry, suggestGap, findWidget } from "./harness.mjs";

const TOL = 3;         // سماحية بكسل للمحاذاة
const GAP_TOL = 3;     // فجوة الاقتراحات المقبولة (0 مثاليّ)

// نتيجة موحّدة
const pass = (name, detail) => ({ name, status: "pass", detail });
const fail = (name, detail) => ({ name, status: "fail", detail });
// bestEffort: تخطٍّ لا يُحجَب حتى في الوضع الصارم (مِجَسّ هشّ بطبيعته — إدخال CDP في RTL).
const skip = (name, detail, bestEffort = false) => ({ name, status: "skip", detail, bestEffort });

// تأكيدات هندسيّة (بلا إدخال) — من قراءة تخطيط واحدة.
export function geometryAssertions(geo) {
  const out = [];
  const ed = geo.editor;
  const mid = ed ? ed.l + ed.w / 2 : 0;

  out.push(geo.dir === "rtl"
    ? pass("قشرة RTL", "workbench dir=rtl")
    : fail("قشرة RTL", `dir=${geo.dir} (متوقَّع rtl)`));

  if (!ed) return [...out, fail("المحرّر موجود", "لا .monaco-editor — هل فُتِح ملفّ؟")];
  out.push(pass("المحرّر موجود", `[${ed.l},${ed.r}] عرض ${ed.w}`));

  // الخريطة المصغّرة يسارًا (م2)
  out.push(geo.minimap && geo.minimap.l <= ed.l + TOL
    ? pass("الخريطة المصغّرة يسارًا", `الحافّة اليسرى ${geo.minimap.l}`)
    : fail("الخريطة المصغّرة يسارًا", geo.minimap ? `left=${geo.minimap.l} (متوقَّع ≈${ed.l})` : "لا خريطة"));

  // المزراب/الأرقام يمينًا (م1)
  out.push(geo.gutter && geo.gutter.l > mid && geo.gutter.r >= ed.r - TOL
    ? pass("المزراب يمينًا", `[${geo.gutter.l},${geo.gutter.r}]`)
    : fail("المزراب يمينًا", geo.gutter ? `[${geo.gutter.l},${geo.gutter.r}] (متوقَّع أقصى اليمين)` : "لا مزراب"));

  out.push(geo.lineNumbers
    ? (geo.lineNumbers.l > mid
      ? pass("أرقام الأسطر يمينًا", `left=${geo.lineNumbers.l}`)
      : fail("أرقام الأسطر يمينًا", `left=${geo.lineNumbers.l} (متوقَّع > ${Math.round(mid)})`))
    : skip("أرقام الأسطر يمينًا", "لا عنصر أرقام مرئيّ"));

  // الشريط العموديّ يمينًا بجانب الأرقام (تعديل المستخدم م5)
  out.push(geo.scrollbarV
    ? (geo.scrollbarV.l > mid
      ? pass("الشريط العموديّ يمينًا", `[${geo.scrollbarV.l},${geo.scrollbarV.r}]`)
      : fail("الشريط العموديّ يمينًا", `left=${geo.scrollbarV.l} (متوقَّع يمينًا)`))
    : skip("الشريط العموديّ يمينًا", "غير مرئيّ (لا تمرير عموديّ)"));

  // مسطرة النظرة يسارًا (م2، CSS13)
  out.push(geo.overviewRuler
    ? (geo.overviewRuler.l < mid
      ? pass("مسطرة النظرة يسارًا", `left=${geo.overviewRuler.l}`)
      : fail("مسطرة النظرة يسارًا", `left=${geo.overviewRuler.l} (متوقَّع < ${Math.round(mid)})`))
    : skip("مسطرة النظرة يسارًا", "غير مرئيّة"));

  // منطقة المحتوى بين الخريطة (يسارًا) والمزراب (يمينًا)
  out.push(geo.content
    ? ((geo.minimap ? geo.content.l >= geo.minimap.r - TOL : true) && geo.gutter && geo.content.l < geo.gutter.l
      ? pass("المحتوى بين الخريطة والمزراب", `[${geo.content.l},${geo.content.r}]`)
      : fail("المحتوى بين الخريطة والمزراب", `المحتوى ${geo.content.l} لا يقع بين الخريطة ${geo.minimap?.r} والمزراب ${geo.gutter?.l}`))
    : skip("المحتوى بين الخريطة والمزراب", "لا view-lines"));

  // شريط الأنشطة يمينًا (القشرة RTL)
  out.push(geo.activityBar
    ? (geo.activityBar.l > mid
      ? pass("شريط الأنشطة يمينًا", `left=${geo.activityBar.l}`)
      : fail("شريط الأنشطة يمينًا", `left=${geo.activityBar.l} (متوقَّع > ${Math.round(mid)})`))
    : skip("شريط الأنشطة يمينًا", "غير مرئيّ"));

  // اتّجاه السطر RTL (م1، Monaco per-line)
  out.push(geo.firstLineDir === "rtl"
    ? pass("اتّجاه السطر RTL", "view-line direction=rtl")
    : fail("اتّجاه السطر RTL", `direction=${geo.firstLineDir} (متوقَّع rtl)`));

  return out;
}

// تأكيدات تفاعليّة (تحتاج إدخالًا) — الاقتراحات والبحث.
export async function interactionAssertions(cdp) {
  const out = [];

  // فجوة الاقتراحات = صفر (الإصلاح الحاسم rtl19)
  try {
    let s = await suggestGap(cdp);
    if (!s || !s.visible) s = await suggestGap(cdp); // إعادة محاولة واحدة (تقلّل تخطّي التذبذب)
    if (!s || !s.visible) out.push(skip("فجوة الاقتراحات = صفر", "لم تظهر الودجة (لا إكمالات؟)", true));
    else if (s.caretLeft == null) out.push(skip("فجوة الاقتراحات = صفر", "الودجة غير مُجاورة للمؤشّر (إدخال CDP هشّ) — مضمونة أيضًا بعلامة L2", true));
    else if (Math.abs(s.gap) <= GAP_TOL) out.push(pass("فجوة الاقتراحات = صفر", `يمين الودجة ${s.widgetRight} = المؤشّر ${s.caretLeft} (فجوة ${s.gap})`));
    else out.push(fail("فجوة الاقتراحات = صفر", `فجوة ${s.gap}px (يمين ${s.widgetRight} ≠ مؤشّر ${s.caretLeft}) — انحدار!`));
  } catch (e) { out.push(skip("فجوة الاقتراحات = صفر", "تعذّر: " + e.message, true)); }

  // ودجة البحث لأعلى-اليسار (مرآة rtl20)
  try {
    let f = await findWidget(cdp);
    if (!f || !f.visible) f = await findWidget(cdp); // إعادة محاولة واحدة
    if (!f || !f.visible) out.push(skip("البحث أعلى-اليسار", "لم تظهر ودجة البحث"));
    else {
      // قرب الحافّة اليسرى فعلًا (المرآة تضعه عند maxRight≈2×شريط+خريطة ≈ 11% من العرض)، لا
      // مجرّد النصف الأيسر — عتبة 25% تمسك المرآة الجزئيّة (مثلًا left=400) دون false-pass.
      const bound = f.editorLeft + f.editorWidth * 0.25;
      if (f.left < bound) out.push(pass("البحث أعلى-اليسار", `left=${f.left} (< ${Math.round(bound)}، قرب الحافّة اليسرى)`));
      else out.push(fail("البحث أعلى-اليسار", `left=${f.left} (≥ ${Math.round(bound)}) — لم يُعكَس لأعلى-اليسار!`));
    }
  } catch (e) { out.push(skip("البحث أعلى-اليسار", "تعذّر: " + e.message)); }

  return out;
}

export async function runAll(cdp) {
  const geo = await editorGeometry(cdp);
  const results = geometryAssertions(geo);
  const inter = await interactionAssertions(cdp);
  return [...results, ...inter];
}
