// @ts-check
"use strict";
// اختبار وحدة لتفاوض توافق الإصدار (isCompatible) — منطق SemVer نقيّ. نحمّل الوحدة مع بديل
// وهميّ لـ`vscode` (غير متوفّر خارج مضيف الامتداد) عبر اعتراض Module._load، إذ لا استعمال
// لـvscode على مستوى الوحدة (كلّه داخل الدوال) فالبديل الفارغ يكفي.

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// بديل vscode قابل للتعديل: تُضبَط workspaceFolders لكلّ اختبار (resolveWorkspaceCwd يقرؤها داخل الدالّة).
const vscodeStub = { workspace: { workspaceFolders: undefined, getConfiguration: () => ({ get: () => "" }) } };
const _origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "vscode") return vscodeStub;
  return _origLoad.call(this, request, ...rest);
};

const { NebrasProcess, isCompatible, resolveWorkspaceCwd } = require("./nebras-process.js");
const { PROTOCOL_VERSION } = require("./contract/protocol-contract.generated.js");

test("مصافحة حقيقيّة: نسخة البروتوكول متوافقة مع نفسها", () => {
  assert.equal(isCompatible(PROTOCOL_VERSION, PROTOCOL_VERSION), true);
});

test("ما قبل 1.0 (0.x): يتطلّب تطابق الأصغر (كسر عند اختلافه)", () => {
  assert.equal(isCompatible("0.1.0", "0.1.0"), true);
  assert.equal(isCompatible("0.1.0", "0.2.0"), false);
  assert.equal(isCompatible("0.2.0", "0.1.0"), false);
});

test("1.x فأعلى: تطابق الأكبر يكفي مهما اختلف الأصغر", () => {
  assert.equal(isCompatible("1.2.0", "1.5.0"), true);
  assert.equal(isCompatible("2.9.9", "2.0.0"), true);
});

test("اختلاف الأكبر ⇒ غير متوافق", () => {
  assert.equal(isCompatible("1.0.0", "2.0.0"), false);
  assert.equal(isCompatible("0.1.0", "1.1.0"), false);
});

test("لاحقةُ ما قبل الإصدار والبناء تُقتطَع قبل المقارنة", () => {
  // الشيفرةُ تقتطع بـ`split(/[-+]/)` — ولم تصل العيّنةُ نسخةً فيها لاحقةٌ قطّ، فالفرعُ
  // لم يُنفَّذ ولا مرّة. والخادمُ يُصدِر نسخًا كهذه في البناءات التجريبيّة [PF-02].
  assert.equal(isCompatible("1.2.0", "1.5.0-rc.1"), true);
  assert.equal(isCompatible("1.2.0-alpha", "1.5.0"), true);
  assert.equal(isCompatible("1.2.0+build.7", "1.5.0"), true);
  assert.equal(isCompatible("1.0.0-rc.1", "2.0.0"), false, "اللاحقةُ تُقتطَع ولا تُخفي اختلافَ الأكبر");
});

test("تُتجاهَل لاحقة ما قبل الإصدار/البناء (-/+)", () => {
  assert.equal(isCompatible("0.1.0-beta", "0.1.0"), true);
  assert.equal(isCompatible("1.2.0", "1.9.0+build.7"), true);
});

test("الأصغر الغائب = 0", () => {
  assert.equal(isCompatible("1", "1.0.0"), true); // ماجور 1، الأصغر 0
  assert.equal(isCompatible("0", "0.0.9"), true); // 0.0 = 0.0
  assert.equal(isCompatible("0", "0.1.0"), false); // 0.0 ≠ 0.1
});

test("نسخة غير صالحة/فارغة ⇒ غير متوافق (fail-safe لا انهيار)", () => {
  assert.equal(isCompatible("", "0.1.0"), false);
  assert.equal(isCompatible("0.1.0", ""), false);
  assert.equal(isCompatible("سين", "0.1.0"), false);
  assert.equal(isCompatible("0.1.0", "x.y.z"), false);
  assert.equal(isCompatible("-1.0", "0.1.0"), false);
});

// ── جذر مساحة العمل = cwd الخادم (منع «المسار خارج مجلّد العمل» عند إطلاق المحرّر من مجلّد آخر) ──

test("resolveWorkspaceCwd: مجلّد مشروع مفتوح ⇒ مساره المطلق (يصير cwd الخادم = workspaceRoot)", () => {
  vscodeStub.workspace.workspaceFolders = [
    { uri: { scheme: "file", fsPath: "C:\\s_lang\\تقارير_مؤقته\\محراب\\تجربة_L3" } },
  ];
  assert.equal(resolveWorkspaceCwd(), "C:\\s_lang\\تقارير_مؤقته\\محراب\\تجربة_L3");
});

test("resolveWorkspaceCwd: أوّل مجلّد في مساحة متعدّدة الجذور", () => {
  vscodeStub.workspace.workspaceFolders = [
    { uri: { scheme: "file", fsPath: "/proj/أ" } },
    { uri: { scheme: "file", fsPath: "/proj/ب" } },
  ];
  assert.equal(resolveWorkspaceCwd(), "/proj/أ");
});

test("resolveWorkspaceCwd: لا مجلّد مفتوح (ملفّ مفرد) ⇒ undefined (يرث cwd الافتراضيّ)", () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  assert.equal(resolveWorkspaceCwd(), undefined);
  vscodeStub.workspace.workspaceFolders = [];
  assert.equal(resolveWorkspaceCwd(), undefined);
});

test("resolveWorkspaceCwd: مجلّد بمخطّط غير قرصيّ (لا file) ⇒ undefined (لا cwd زائف)", () => {
  vscodeStub.workspace.workspaceFolders = [
    { uri: { scheme: "vscode-remote", fsPath: "/remote/x" } },
  ];
  assert.equal(resolveWorkspaceCwd(), undefined);
});

// ── restartIfWorkspaceChanged: إعادة التشغيل فقط عند تبدّل جذر cwd الفعليّ (لا عبث بمهامّ جارية بلا داعٍ) ──

/** نسخة NebrasProcess بأدنى تبعيّات + restart مرصود (لا spawn حقيقيّ في اختبار وحدة). */
function makeProcWithSpiedRestart() {
  const proc = new NebrasProcess(
    /** @type {any} */ ({ extensionPath: "" }),
    /** @type {any} */ ({ appendLine: () => {} }),
    async () => false,
  );
  const calls = { restarts: 0 };
  proc.restart = async () => {
    calls.restarts += 1;
  };
  return { proc, calls };
}

test("restartIfWorkspaceChanged: الجذر لم يتغيّر (قبل الإقلاع: undefined=undefined) ⇒ لا إعادة تشغيل", async () => {
  vscodeStub.workspace.workspaceFolders = undefined;
  const { proc, calls } = makeProcWithSpiedRestart();
  await proc.restartIfWorkspaceChanged();
  assert.equal(calls.restarts, 0);
});

test("restartIfWorkspaceChanged: تبدّل الجذر عمّا أُقلع به ⇒ إعادة تشغيل واحدة", async () => {
  const { proc, calls } = makeProcWithSpiedRestart();
  proc._startedCwd = "/proj/قديم";
  vscodeStub.workspace.workspaceFolders = [{ uri: { scheme: "file", fsPath: "/proj/جديد" } }];
  await proc.restartIfWorkspaceChanged();
  assert.equal(calls.restarts, 1);
});

test("restartIfWorkspaceChanged: نفس الجذر الذي أُقلع به ⇒ لا إعادة تشغيل (لا قطع مهامّ بلا سبب)", async () => {
  const { proc, calls } = makeProcWithSpiedRestart();
  proc._startedCwd = "/proj/نفسه";
  vscodeStub.workspace.workspaceFolders = [{ uri: { scheme: "file", fsPath: "/proj/نفسه" } }];
  await proc.restartIfWorkspaceChanged();
  assert.equal(calls.restarts, 0);
});

test("restartIfWorkspaceChanged: بعد dispose ⇒ لا إعادة تشغيل (مستمع متأخّر بعد التعطيل)", async () => {
  const { proc, calls } = makeProcWithSpiedRestart();
  await proc.dispose();
  proc._startedCwd = "/proj/قديم";
  vscodeStub.workspace.workspaceFolders = [{ uri: { scheme: "file", fsPath: "/proj/جديد" } }];
  await proc.restartIfWorkspaceChanged();
  assert.equal(calls.restarts, 0);
});

// ═══════════ retargetRoot (إعادة توجيه الجذر: ملفّ مفرد/جذر غير أوّل) ═══════════

test("retargetRoot: جذر مغاير ⇒ يضبط التوجيه ويعيد التشغيل", async () => {
  const { proc, calls } = makeProcWithSpiedRestart();
  proc._startedCwd = "/proj/أ";
  proc._ready = true;
  await proc.retargetRoot("/proj/ب");
  assert.equal(calls.restarts, 1);
  assert.equal(proc._cwdOverride, "/proj/ب", "التوجيه محفوظ ليستعمله start التالي");
});

test("retargetRoot: الجذر الجاري نفسه والخادم جاهز ⇒ لا شيء (true فورًا)", async () => {
  const { proc, calls } = makeProcWithSpiedRestart();
  proc._startedCwd = "/proj/أ";
  proc._ready = true;
  const ok = await proc.retargetRoot("/proj/أ");
  assert.equal(ok, true);
  assert.equal(calls.restarts, 0, "لا إعادة تشغيل بلا سبب (لا قطع مهامّ)");
});

test("retargetRoot: بعد dispose ⇒ false بلا إعادة تشغيل", async () => {
  const { proc, calls } = makeProcWithSpiedRestart();
  await proc.dispose();
  const ok = await proc.retargetRoot("/proj/ب");
  assert.equal(ok, false);
  assert.equal(calls.restarts, 0);
});

test("restartIfWorkspaceChanged يُسقِط توجيه retargetRoot (الجذور الرسميّة تعود هي الحكم)", async () => {
  const { proc } = makeProcWithSpiedRestart();
  proc._cwdOverride = "/ملف/مفرد";
  proc._startedCwd = "/ملف/مفرد";
  vscodeStub.workspace.workspaceFolders = [{ uri: { scheme: "file", fsPath: "/proj/جديد" } }];
  await proc.restartIfWorkspaceChanged();
  assert.equal(proc._cwdOverride, undefined, "تغيّر المجلّدات يمسح التوجيه الصريح");
});

test("retargetRoot سباق: توجيهٌ منافس فاز بجذرٍ آخر أثناء إعادة التشغيل ⇒ false (لا نجاح زائف للخاسر)", async () => {
  const { proc } = makeProcWithSpiedRestart();
  proc._startedCwd = "/proj/أ";
  // يحاكي فوز متنافسٍ متزامن: بنهاية restart الخاصّ بنا صار الخادم جاهزًا لكن على جذرٍ ثالث.
  proc.restart = async () => {
    proc._startedCwd = "/proj/ج";
    proc._ready = true;
  };
  const ok = await proc.retargetRoot("/proj/ب");
  assert.equal(ok, false, "الجاهزيّة على جذرٍ غير المطلوب ليست نجاحًا — الوكيل كان سيُرفَض «خارج مجلّد العمل»");
});

test("retargetRoot: نفس الجذر لكن غير جاهز ⇒ محاولة إقلاع (لا إعادة تشغيل تقطع شيئًا) ونجاح بجاهزيّته", async () => {
  const { proc, calls } = makeProcWithSpiedRestart();
  proc._startedCwd = "/proj/أ";
  let starts = 0;
  proc.start = async () => {
    starts += 1;
    proc._ready = true;
  };
  const ok = await proc.retargetRoot("/proj/أ");
  assert.equal(ok, true);
  assert.equal(starts, 1, "إقلاع لا إعادة تشغيل");
  assert.equal(calls.restarts, 0);
});

test("start متزامن: نداءٌ ثانٍ أثناء مصافحةٍ جارية ينتظر وعد الإقلاع نفسه (لا عودة فوريّة قبل الجاهزيّة)", async () => {
  const { proc } = makeProcWithSpiedRestart();
  let finishBoot = () => {};
  // بديل جسم الإقلاع: يضبط _child فورًا (كما يفعل spawn) ثمّ يعلّق حتى «اكتمال المصافحة».
  proc._startImpl = () => {
    proc._child = /** @type {any} */ ({});
    return new Promise((resolve) => {
      finishBoot = () => {
        proc._ready = true;
        resolve(undefined);
      };
    });
  };
  const first = proc.start();
  let secondSettled = false;
  const second = proc.start().then(() => {
    secondSettled = true;
  });
  await new Promise((r) => setImmediate(r)); // أفسِح للمهامّ الدقيقة — الثاني يجب أن يبقى معلّقًا
  assert.equal(secondSettled, false, "الثاني لا يعود قبل اكتمال المصافحة (كان يعود فوريًّا فيُقرأ «غير جاهز»)");
  finishBoot();
  await first;
  await second;
  assert.equal(secondSettled, true);
  assert.equal(proc.isReady(), true);
  assert.equal(proc._startPromise, null, "وعد الإقلاع يُمسَح بعد الحسم");
});

// ═══════════ dedup التوجيهات المتزامنة (وعد مشترك لنفس الجذر) ═══════════

/** بديل restart قابل للتحكّم: يعلّق حتى يُستدعى release() — يحاكي إعادة تشغيلٍ طائرة. */
function makeProcWithGatedRestart() {
  const { proc, calls } = makeProcWithSpiedRestart();
  /** @type {(() => void)[]} */
  const gates = [];
  proc.restart = async () => {
    calls.restarts += 1;
    await new Promise((resolve) => gates.push(() => resolve(undefined)));
  };
  const release = () => {
    while (gates.length) /** @type {() => void} */ (gates.shift())();
  };
  return { proc, calls, release };
}

test("dedup: نداءان متزامنان لنفس الجذر يتقاسمان وعدًا واحدًا ⇒ إعادة تشغيل واحدة", async () => {
  const { proc, calls, release } = makeProcWithGatedRestart();
  proc._startedCwd = "/proj/أ";
  const p1 = proc.retargetRoot("/proj/ب");
  const p2 = proc.retargetRoot("/proj/ب");
  await new Promise((r) => setImmediate(r)); // كلاهما طائر — لم يبدأ سوى restart واحد
  assert.equal(calls.restarts, 1, "الثاني شارك وعد الأوّل بدل إعادة تشغيلٍ ثانية");
  proc._ready = true;
  proc._startedCwd = "/proj/ب"; // يحاكي نجاح إعادة التشغيل بالجذر الموجَّه
  release();
  assert.equal(await p1, true);
  assert.equal(await p2, true);
  assert.equal(proc._retargetPromise, null, "الوعد المشترك يُمسَح بعد الحسم");
  assert.equal(proc._retargetTo, undefined);
});

test("dedup: بعد حسم التوجيه، نداءٌ لاحق لنفس الجذر يبدأ توجيهًا جديدًا (لا وعد بائت)", async () => {
  const { proc, calls } = makeProcWithSpiedRestart();
  proc._startedCwd = "/proj/أ";
  await proc.retargetRoot("/proj/ب");
  proc._startedCwd = "/proj/أ"; // يحاكي عودة الجذر (مثلًا restartToWorkspaceRoot)
  await proc.retargetRoot("/proj/ب");
  assert.equal(calls.restarts, 2, "كلّ نداءٍ بعد الحسم توجيهٌ مستقلّ");
});

test("dedup تعاقُب ر١←ر٢←ر١: اكتمال الأوّل لا يمسح وعد الثالث الجاري (تنظيف بهويّة الوعد)", async () => {
  const { proc, calls, release } = makeProcWithGatedRestart();
  proc._startedCwd = "/proj/س";
  const p1 = proc.retargetRoot("/proj/ر١"); // طائر
  const p2 = proc.retargetRoot("/proj/ر٢"); // ينافس — يستبدل النيّة
  const p3 = proc.retargetRoot("/proj/ر١"); // نيّة ر١ جديدة (وعد جديد)
  const third = proc._retargetPromise;
  assert.equal(calls.restarts, 3);
  proc._ready = true;
  proc._startedCwd = "/proj/ر١";
  release(); // يُحسَم الجميع — تنظيف الأوّل يجب ألّا يمسّ وعد الثالث قبل حسمه هو
  await Promise.all([p1, p3]);
  await p2;
  assert.notEqual(third, null, "وعد الثالث أُنشئ فعلًا (لا مشاركة مع الأوّل عبر نيّة ر٢)");
  // رابعٌ قبل حسم الثالث كان — بمقارنة الجذر القديمة — يفقد الـdedup إن مسح الأوّلُ الحالةَ مبكّرًا.
  assert.equal(proc._retargetPromise, null, "بعد حسم الكلّ تُمسَح الحالة");
});

test("dedup: رابعٌ لنفس الجذر أثناء طيران الثالث يشاركه رغم اكتمال الأوّل قبله", async () => {
  const { proc, calls, release } = makeProcWithGatedRestart();
  proc._startedCwd = "/proj/س";
  const p1 = proc.retargetRoot("/proj/ر١");
  const p2 = proc.retargetRoot("/proj/ر٢");
  // أكمِل الأوّل والثاني فقط، ثمّ أطلق ر١ ثالثًا وهو وحده الطائر.
  proc._ready = true;
  proc._startedCwd = "/proj/ر٢";
  release();
  await p1;
  await p2;
  const p3 = proc.retargetRoot("/proj/ر١"); // طائر (بوّابة جديدة)
  await new Promise((r) => setImmediate(r));
  const restartsBefore = calls.restarts;
  const p4 = proc.retargetRoot("/proj/ر١"); // يجب أن يشارك وعد الثالث
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.restarts, restartsBefore, "الرابع شارك الثالث — لا إعادة تشغيل زائدة");
  proc._ready = true;
  proc._startedCwd = "/proj/ر١";
  release();
  assert.equal(await p3, true);
  assert.equal(await p4, true);
});

test("restartToWorkspaceRoot: يمسح التوجيه الصريح ونيّة التوجيه الطائر ثمّ يعيد التشغيل", async () => {
  const { proc, calls, release } = makeProcWithGatedRestart();
  proc._startedCwd = "/proj/أ";
  const inflight = proc.retargetRoot("/proj/ب"); // توجيه طائر (override مضبوط)
  assert.equal(proc._cwdOverride, "/proj/ب");
  const manual = proc.restartToWorkspaceRoot();
  assert.equal(proc._cwdOverride, undefined, "إعادة التشغيل اليدويّة تعود للجذر الرسميّ");
  assert.equal(proc._retargetPromise, null, "نيّة التوجيه الطائر أُبطلت — لاحقٌ لنفس الجذر لا يشارك وعدًا بائتًا");
  proc._ready = true;
  proc._startedCwd = "/proj/رسمي";
  release();
  await manual;
  assert.equal(await inflight, false, "التوجيه الملغى يبلّغ فشله (الجذر النهائيّ ليس المطلوب)");
  assert.equal(calls.restarts, 2);
});

test("retargetNeedsRestart/hasActiveTasks: استعلامان خالصان لحوار «قطع مهمّة جارية» في تجهيز الوكيل", async () => {
  const { proc } = makeProcWithSpiedRestart();
  proc._startedCwd = "/proj/أ";
  assert.equal(proc.retargetNeedsRestart("/proj/أ"), false, "نفس الجذر ⇒ لا إعادة تشغيل");
  assert.equal(proc.retargetNeedsRestart("/proj/ب"), true, "جذر مغاير ⇒ إعادة تشغيل");
  assert.equal(proc.hasActiveTasks(), false);
  proc._activeTasks.set(1, {});
  assert.equal(proc.hasActiveTasks(), true);
  proc._activeTasks.clear();
  await proc.dispose();
  assert.equal(proc.retargetNeedsRestart("/proj/ب"), false, "بعد dispose لا توجيه أصلًا (لا حوار زائف)");
});
