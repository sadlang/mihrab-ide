// مشغّل اختبارات RTL الوقتيّة (L3) — يتّصل بنسخة Mihrab مُطلَقة بالمنفذ ويشغّل التأكيدات.
//
// **العائق (موثَّق):** صدفة الأتمتة لا تُطلق GUI؛ يُطلقه المستخدم/عدّاء ذو جلسة سطح مكتب:
//   Mihrab.exe --remote-debugging-port=9222 --remote-allow-origins=* tests/runtime/fixtures/rtl_fixture.sad
// ثمّ: node tests/runtime/run.mjs [المنفذ]
//
// الخرج: TAP-ish + ملخّص. خرج 0 = لا فشل (التخطّي غير حاجب)، 1 = فشل تأكيد (انحدار).
import { CDP } from "./harness.mjs";
import { runAll } from "./rtl.spec.mjs";

const PORT = parseInt(process.argv[2] || process.env.MIHRAB_CDP_PORT || "9222", 10);

const ICON = { pass: "✅", fail: "❌", skip: "⏭️ " };

async function main() {
  console.log(`═══ L3: اختبارات RTL الوقتيّة (CDP :${PORT}) ═══`);
  let cdp;
  try {
    cdp = await CDP.attach(PORT);
  } catch (e) {
    console.log(`  ⏭️  تعذّر الاتّصال: ${e.message}`);
    console.log("     أطلق Mihrab بـ--remote-debugging-port=" + PORT + " وافتح fixtures/rtl_fixture.sad، ثمّ أعِد.");
    return 0; // لا نسخة = تخطٍّ غير حاجب (لا فشل زائف في CI بلا سطح مكتب)
  }
  let results;
  try {
    results = await runAll(cdp);
  } finally {
    cdp.close();
  }
  let p = 0, f = 0, s = 0;
  for (const r of results) {
    console.log(`  ${ICON[r.status]} ${r.name}${r.detail ? " — " + r.detail : ""}`);
    if (r.status === "pass") p++; else if (r.status === "fail") f++; else s++;
  }
  console.log(`─── ${p} نجح، ${f} فشل، ${s} تخطٍّ ───`);
  return f ? 1 : 0;
}

main().then(c => process.exit(c)).catch(e => { console.error("خطأ فادح:", e); process.exit(2); });
