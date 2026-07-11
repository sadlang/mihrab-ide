// @ts-check
"use strict";
// اختبار وحدة لتجهيز الوكيل (ensureDocReadyForAgent) وإعادة توجيه الجذر: الخادم أحاديّ الجذر
// (workspaceRoot = cwd)، فبدل رفض هدفٍ خارج جذره الجاري يُعاد تشغيله بالجذر المالك (retargetRoot).
// resolveAgentRoot يحدّد الجذر: أوّل مجلّد مساحة عمل قرصيّ يحوي الملفّ (احتواء مسار isUnderRoot —
// لا getWorkspaceFolder الذي يُرجع الأضيق)، وإلّا مجلّد الملفّ نفسه (ملفّ مفرد/خارج كلّ الجذور).

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

// بديل vscode قابل للتعديل لكلّ اختبار.
const warnings = [];
/** السلوك الافتراضيّ: سجّل التحذير وأعِد undefined (المستخدم أغلق الحوار). يُستبدَل لكلّ اختبار حوار. */
const defaultShowWarning = (m) => {
  warnings.push(typeof m === "string" ? m : "");
  return Promise.resolve(undefined);
};
const vscodeStub = {
  window: {
    showWarningMessage: defaultShowWarning,
  },
  workspace: {
    workspaceFolders: undefined,
  },
};
const _origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "vscode") return vscodeStub;
  return _origLoad.call(this, request, ...rest);
};

const { ensureDocReadyForAgent, isUnderRoot, resolveAgentRoot, COPY } = require("./agent.js");

// مسارات بأسلوب المنصّة الجارية (path.relative حسّاس للمنصّة).
const R = (...seg) => path.resolve(path.sep === "\\" ? "C:\\" : "/", ...seg);

/** مستند ص محفوظ على القرص تحت المسار المعطى. */
function makeDoc(fsPath, dirty) {
  return {
    languageId: "sad",
    fileName: fsPath,
    isUntitled: false,
    isDirty: !!dirty,
    uri: { scheme: "file", fsPath, toString: () => "file:///" + fsPath.replace(/\\/g, "/") },
  };
}
/** عمليّة وهميّة تُسجِّل استدعاءات retargetRoot وتُرجع النتيجة المضبوطة.
 * الافتراض: لا إعادة تشغيل مطلوبة ولا مهامّ جارية (لا حوار قطع) — تُستبدلان في اختبارات الحوار. */
function makeProc(retargetResult, opts) {
  const o = opts || {};
  return {
    retargets: /** @type {string[]} */ ([]),
    async retargetRoot(root) {
      this.retargets.push(root);
      return retargetResult;
    },
    retargetNeedsRestart: () => o.needsRestart === true,
    hasActiveTasks: () => o.activeTasks === true,
  };
}
const folder = (name, fsPath, scheme) => ({
  name,
  uri: { scheme: scheme || "file", fsPath, toString: () => (scheme || "file") + ":///" + fsPath.replace(/\\/g, "/") },
});

function reset() {
  warnings.length = 0;
  vscodeStub.workspace.workspaceFolders = undefined;
  vscodeStub.window.showWarningMessage = defaultShowWarning; // أزل أيّ استبدال حواريّ من اختبار سابق
}

// ═══════════ isUnderRoot (نقيّة — دلالة احتواء الخادم) ═══════════

test("isUnderRoot: ملفّ داخل الجذر/متداخل ⇒ true؛ خارجه/الجذر نفسه/هروب .. ⇒ false", () => {
  const root = R("ws");
  assert.equal(isUnderRoot(R("ws", "a.ص"), root), true);
  assert.equal(isUnderRoot(R("ws", "sub", "a.ص"), root), true, "جذر متداخل تحت الأوّل يُقبل");
  assert.equal(isUnderRoot(R("other", "a.ص"), root), false);
  assert.equal(isUnderRoot(root, root), false, "الجذر نفسه ليس ملفًّا تحته");
  assert.equal(isUnderRoot(R("ws-sibling", "a.ص"), root), false, "بادئة اسمٍ شقيقة لا تُخلَط بالاحتواء");
});

test("isUnderRoot حواف: جذر بفاصل نهائيّ، حالة حرف السوّاقة، UNC، وسوّاقة/جذر مغاير", () => {
  const root = R("ws");
  // جذر بفاصل نهائيّ (كما قد يصل من إعداد يدويّ): الاحتواء لا يتأثّر.
  assert.equal(isUnderRoot(R("ws", "a.ص"), root + path.sep), true, "فاصل نهائيّ في الجذر لا يكسر الاحتواء");
  // جذر نظام الملفّات نفسه ("/" أو "C:\\") جذرًا: كلّ ملفّ تحته يُقبل.
  const fsRoot = path.parse(root).root;
  assert.equal(isUnderRoot(R("ws", "a.ص"), fsRoot), true, "جذر نظام الملفّات يحتوي كلّ شيء تحته");
  if (path.sep === "\\") {
    // Windows: path.relative غير حسّاس لحالة الأحرف ⇒ سوّاقة/مسار بحالة مغايرة يبقى محتوًى.
    assert.equal(isUnderRoot("c:\\ws\\a.ص", "C:\\WS"), true, "اختلاف حالة الأحرف لا يُسقط الاحتواء على Windows");
    // سوّاقة مختلفة ⇒ relative يُرجع مسارًا مطلقًا ⇒ خارج الجذر.
    assert.equal(isUnderRoot("D:\\ws\\a.ص", "C:\\ws"), false, "سوّاقة مغايرة خارج الجذر");
    // مسارات UNC: الاحتواء داخل نفس المشاركة يُقبل، وعبر مشاركة أخرى يُرفَض.
    assert.equal(isUnderRoot("\\\\srv\\share\\ws\\a.ص", "\\\\srv\\share\\ws"), true, "UNC داخل نفس المشاركة");
    assert.equal(isUnderRoot("\\\\srv\\other\\a.ص", "\\\\srv\\share\\ws"), false, "UNC عبر مشاركة أخرى خارج الجذر");
  }
});

// ═══════════ resolveAgentRoot (اختيار جذر عمل الوكيل) ═══════════

test("resolveAgentRoot: ملفّ داخل الجذر الأوّل ⇒ الجذر الأوّل", () => {
  reset();
  vscodeStub.workspace.workspaceFolders = [folder("ws", R("ws"))];
  assert.equal(resolveAgentRoot(R("ws", "a.ص")), R("ws"));
});

test("resolveAgentRoot: ملفّ في جذرٍ غير الأوّل ⇒ ذلك الجذر (متعدّد الجذور يعمل)", () => {
  reset();
  vscodeStub.workspace.workspaceFolders = [folder("أ", R("a")), folder("ب", R("b"))];
  assert.equal(resolveAgentRoot(R("b", "x.ص")), R("b"));
});

test("resolveAgentRoot: جذر متداخل داخل الأوّل ⇒ الأوّل (الأسبق ترتيبًا، لا الأضيق)", () => {
  reset();
  vscodeStub.workspace.workspaceFolders = [folder("ws", R("ws")), folder("sub", R("ws", "sub"))];
  assert.equal(resolveAgentRoot(R("ws", "sub", "a.ص")), R("ws"), "أولويّة الجذر الأوّل محفوظة");
});

test("resolveAgentRoot: ملفّ مفرد بلا مجلّد/خارج كلّ الجذور ⇒ مجلّد الملفّ نفسه", () => {
  reset();
  assert.equal(resolveAgentRoot(R("tmp", "a.ص")), R("tmp"), "بلا مجلّدات ⇒ dirname");
  vscodeStub.workspace.workspaceFolders = [folder("ws", R("ws"))];
  assert.equal(resolveAgentRoot(R("elsewhere", "b.ص")), R("elsewhere"), "خارج كلّ الجذور ⇒ dirname");
});

test("resolveAgentRoot: جذر بمخطّط غير قرصيّ يُتخطّى (لا جذر زائف)", () => {
  reset();
  vscodeStub.workspace.workspaceFolders = [folder("بعيد", "/remote/x", "vscode-remote"), folder("ws", R("ws"))];
  assert.equal(resolveAgentRoot(R("ws", "a.ص")), R("ws"), "يتخطّى غير القرصيّ للقرصيّ الحاوي");
});

// ═══════════ ensureDocReadyForAgent (التجهيز + إعادة التوجيه) ═══════════

test("ملفّ مفرد بلا مجلّد ⇒ إعادة توجيه لجذر مجلّد الملفّ ثمّ متابعة (لا رفض)", async () => {
  reset();
  const proc = makeProc(true);
  const ok = await ensureDocReadyForAgent(proc, makeDoc(R("tmp", "a.ص")));
  assert.equal(ok, true, "الملفّ المفرد يعمل الآن عبر إعادة توجيه الجذر");
  assert.deepEqual(proc.retargets, [R("tmp")]);
  assert.equal(warnings.length, 0);
});

test("ملفّ في جذرٍ غير الأوّل ⇒ إعادة توجيه لذلك الجذر ثمّ متابعة (متعدّد الجذور يعمل)", async () => {
  reset();
  vscodeStub.workspace.workspaceFolders = [folder("أ", R("a")), folder("ب", R("b"))];
  const proc = makeProc(true);
  const ok = await ensureDocReadyForAgent(proc, makeDoc(R("b", "x.ص")));
  assert.equal(ok, true);
  assert.deepEqual(proc.retargets, [R("b")]);
});

test("ملفّ داخل الجذر الأوّل ⇒ توجيه للجذر الأوّل (retargetRoot يتولّى «لا شيء إن صحّ الجذر»)", async () => {
  reset();
  vscodeStub.workspace.workspaceFolders = [folder("ws", R("ws"))];
  const proc = makeProc(true);
  const ok = await ensureDocReadyForAgent(proc, makeDoc(R("ws", "a.ص")));
  assert.equal(ok, true);
  assert.deepEqual(proc.retargets, [R("ws")]);
  assert.equal(warnings.length, 0);
});

test("فشل إعادة التوجيه (الخادم لم يجهز) ⇒ رفض برسالة retargetFailed", async () => {
  reset();
  const proc = makeProc(false);
  const ok = await ensureDocReadyForAgent(proc, makeDoc(R("tmp", "a.ص")));
  assert.equal(ok, false);
  assert.equal(warnings[0], COPY.retargetFailed(R("tmp")));
});

test("مستند متّسخ: إغلاق حوار الحفظ (إلغاء) ⇒ رفض بلا حفظ ولا إعادة توجيه", async () => {
  reset();
  vscodeStub.workspace.workspaceFolders = [folder("ws", R("ws"))];
  const doc = makeDoc(R("ws", "a.ص"), true);
  let saved = false;
  doc.save = async () => { saved = true; return true; };
  const proc = makeProc(true);
  const ok = await ensureDocReadyForAgent(proc, doc);
  assert.equal(ok, false);
  assert.equal(saved, false, "لا حفظ عند إلغاء الحوار");
  assert.equal(proc.retargets.length, 0, "لا إعادة توجيه لمستندٍ رفضه المستخدم");
});

test("مستند متّسخ: «احفظ وتابع» والحفظ ينجح ⇒ متابعة", async () => {
  reset();
  vscodeStub.workspace.workspaceFolders = [folder("ws", R("ws"))];
  vscodeStub.window.showWarningMessage = () => Promise.resolve(COPY.dirtySave);
  const doc = makeDoc(R("ws", "a.ص"), true);
  doc.save = async () => true;
  const ok = await ensureDocReadyForAgent(makeProc(true), doc);
  assert.equal(ok, true);
});

test("توجيهٌ سيقطع مهمّةً جارية: إغلاق حوار القطع ⇒ إلغاء صامت (لا توجيه ولا رسالة فشل)", async () => {
  reset();
  const proc = makeProc(true, { needsRestart: true, activeTasks: true });
  const ok = await ensureDocReadyForAgent(proc, makeDoc(R("tmp", "a.ص")));
  assert.equal(ok, false);
  assert.equal(proc.retargets.length, 0, "لا إعادة تشغيل تقطع المهمّة دون إذن");
  assert.equal(warnings[0], COPY.retargetInterruptsTitle, "الحوار عُرض");
  assert.equal(warnings.length, 1, "لا رسالة retargetFailed فوق إلغاء المستخدم");
});

test("توجيهٌ سيقطع مهمّةً جارية: «اقطعها وتابِع» ⇒ يمضي التوجيه", async () => {
  reset();
  vscodeStub.window.showWarningMessage = (m) =>
    Promise.resolve(m === COPY.retargetInterruptsTitle ? COPY.retargetInterruptsProceed : undefined);
  const proc = makeProc(true, { needsRestart: true, activeTasks: true });
  const ok = await ensureDocReadyForAgent(proc, makeDoc(R("tmp", "a.ص")));
  assert.equal(ok, true);
  assert.deepEqual(proc.retargets, [R("tmp")]);
});

test("توجيهٌ بلا إعادة تشغيل (الجذر صحيح) ومهامّ جارية ⇒ لا حوار قطع (لا إزعاج بلا خطر)", async () => {
  reset();
  const proc = makeProc(true, { needsRestart: false, activeTasks: true });
  const ok = await ensureDocReadyForAgent(proc, makeDoc(R("tmp", "a.ص")));
  assert.equal(ok, true);
  assert.equal(warnings.length, 0, "لا حوار — التوجيه لا يقطع شيئًا");
});

test("مستند متّسخ: «احفظ وتابع» لكنّ الحفظ يفشل ⇒ رفض برسالة فشل الحفظ (fail-safe)", async () => {
  reset();
  vscodeStub.workspace.workspaceFolders = [folder("ws", R("ws"))];
  const dialogs = [];
  vscodeStub.window.showWarningMessage = (m) => {
    dialogs.push(typeof m === "string" ? m : "");
    return Promise.resolve(m === COPY.dirtyTitle ? COPY.dirtySave : undefined);
  };
  const doc = makeDoc(R("ws", "a.ص"), true);
  doc.save = async () => false;
  const ok = await ensureDocReadyForAgent(makeProc(true), doc);
  assert.equal(ok, false);
  assert.equal(dialogs.includes(COPY.saveFailed), true, "يُبلَّغ فشل الحفظ صراحةً");
});
