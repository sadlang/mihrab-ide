"use strict";
const test = require("node:test");
const assert = require("node:assert");
const {
  FSI,
  PDI,
  isolate,
  stripIsolates,
  formatLocation,
  formatDiagnostic,
} = require("./error-format.js");

test("[DX-04] العزلُ يحفّ النصَّ ولا يغيّره", () => {
  const out = isolate("SYN001");
  assert.strictEqual(out, FSI + "SYN001" + PDI);
  assert.strictEqual(stripIsolates(out), "SYN001");
});

test("[DX-04] عزلٌ مكرَّرٌ لا يُضاعَف — النصُّ يُنسَخ ويُقارَن", () => {
  const once = isolate("SYN001");
  assert.strictEqual(isolate(once), once);
});

test("[DX-04] الفارغُ لا يُعزَل (محرفان بلا مشهودٍ عليهما ضجيج)", () => {
  assert.strictEqual(isolate(""), "");
  assert.strictEqual(isolate(null), "");
});

test("[DX-04] الموضعُ كتلةٌ واحدةٌ معزولة لا أجزاءٌ فرادى", () => {
  const loc = formatLocation({ file: "مثال.ص", line: 19, column: 1 });
  // العزلُ مرّةً واحدة: النقطتان بين الأجزاء داخلَه لا خارجَه.
  assert.strictEqual(loc.split(FSI).length - 1, 1);
  assert.strictEqual(stripIsolates(loc), "مثال.ص:19:1");
});

test("[DX-04] موضعٌ ناقصٌ يُبنى ممّا وُجد، وموضعٌ معدومٌ يعطي فراغًا", () => {
  assert.strictEqual(stripIsolates(formatLocation({ line: 7 })), "7");
  assert.strictEqual(formatLocation({}), "");
  assert.strictEqual(formatLocation(null), "");
});

test("[DX-04] القالبُ بترتيبه: ما وقع · أين · لماذا · ما العمل", () => {
  const msg = formatDiagnostic({
    what: "لم أجد تعريفًا لهذا الاسم",
    code: "SYN001",
    at: { file: "مثال.ص", line: 19, column: 1 },
    why: "الاسمُ مستعمَلٌ قبل تعريفه",
    fix: "عرّفه قبل هذا السطر أو صحّح إملاءه",
  });
  const lines = msg.split("\n");
  assert.strictEqual(lines.length, 4);
  assert.ok(lines[0].startsWith("لم أجد تعريفًا"));
  assert.ok(lines[1].startsWith("الموضع: "));
  assert.ok(lines[2].startsWith("السبب: "));
  assert.ok(lines[3].startsWith("ما العمل: "));
});

test("[DX-04] الرمزُ لاحقٌ لا بادئة — البادئةُ اللاتينيّةُ هي عينُ العطب المقيس", () => {
  const msg = formatDiagnostic({ what: "خطأٌ نحويّ", code: "SYN001" });
  assert.ok(!msg.startsWith(FSI), "الرمزُ صدَّر الجملةَ — وهو ما أنتج «error [SYN001]» مقلوبًا");
  assert.ok(msg.startsWith("خطأٌ نحويّ"));
  assert.ok(msg.includes(FSI + "SYN001" + PDI));
});

test("[DX-04] الحقلُ الغائبُ يُحذَف ولا يُملأ بعبارةٍ عامّة", () => {
  const msg = formatDiagnostic({ what: "خطأ", at: { line: 3 } });
  assert.ok(!msg.includes("السبب"));
  assert.ok(!msg.includes("ما العمل"));
  assert.strictEqual(msg.split("\n").length, 2);
});

test("[DX-04] كلُّ محرفٍ لاتينيٍّ أو رقميٍّ في الرسالة يقع داخل عزل", () => {
  const msg = formatDiagnostic({
    what: "لم أجد تعريفًا لهذا الاسم",
    code: "SYN001",
    at: { file: "مثال.ص", line: 19, column: 1 },
  });
  // مسحٌ حرفًا حرفًا: نتتبّع عمقَ العزل ونطالب بأن يكون كلُّ لاتينيٍّ/رقميٍّ داخله.
  // (‏«الموضع:» و«السبب:» عربيّتان، ونقطتاهما محايدتان لا تنقلبان في فقرةٍ عربيّة.)
  let depth = 0;
  for (const ch of msg) {
    if (ch === FSI) { depth++; continue; }
    if (ch === PDI) { depth--; continue; }
    if (/[A-Za-z0-9]/.test(ch)) {
      assert.ok(depth > 0, `محرفٌ خارجَ العزل: ${ch} في «${msg}»`);
    }
  }
  assert.strictEqual(depth, 0, "عزلٌ غيرُ متوازن — وهو نفسُه ما يُشخِّصه حارسُ الاتّجاه خطأً حرجًا");
});

const { isolateEmbeddedRefs } = require("./error-format.js");

test("[DX-04] العطبُ المقيس بعينه: رمزٌ وموضعٌ مضمَّنان يُعزَلان", () => {
  const raw = "خطأ [SYN001]: مثال.ص:19:1 اسمٌ غيرُ معرَّف";
  const out = isolateEmbeddedRefs(raw);
  assert.ok(out.includes(FSI + "SYN001" + PDI));
  assert.ok(out.includes(FSI + "مثال.ص:19:1" + PDI));
  assert.strictEqual(stripIsolates(out), raw, "العزلُ لا يغيّر حرفًا من النصّ");
});

test("[DX-04] موضعٌ بسطرٍ بلا عمود يُعزَل كذلك", () => {
  const out = isolateEmbeddedRefs("راجع مثال.ص:19 من فضلك");
  assert.ok(out.includes(FSI + "مثال.ص:19" + PDI));
});

test("[DX-04] النمطُ مقيَّدٌ: كلمةٌ إنجليزيّةٌ عاديّةٌ لا تُعزَل", () => {
  const out = isolateEmbeddedRefs("استعمل الدالّة println هنا");
  assert.ok(!out.includes(FSI), "نمطٌ أوسعُ من اللازم يبتلع كلماتٍ عاديّة");
});

test("[DX-04] نصٌّ معزولٌ سلفًا لا يُعاد عزلُه", () => {
  const once = isolateEmbeddedRefs("خطأ SYN001");
  assert.strictEqual(isolateEmbeddedRefs(once), once);
});
