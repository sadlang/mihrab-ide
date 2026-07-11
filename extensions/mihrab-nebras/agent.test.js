// @ts-check
"use strict";
// اختبار وحدة لتحقّق احتواء مجلّد العمل في ensureDocReadyForAgent: نِبراس (الخادم) مقيَّد بجذرٍ واحد
// (أوّل مجلّد file = cwd)، فهدفٌ خارجه يُرفَض. نتحقّق مسبقًا برسالةٍ واضحة بدل رفض الخادم المضلّل
// «خارج مجلّد العمل» — والمطابقة **احتواء مسار** (isUnderRoot يطابق دلالة isInside في الخادم)، لا
// هويّة المجلّد الحاوي: getWorkspaceFolder يُرجع الأضيق فجذرٌ متداخل كان يُرفَض زورًا [مراجعة Amelia].

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

// بديل vscode قابل للتعديل لكلّ اختبار.
const warnings = [];
const vscodeStub = {
  window: {
    showWarningMessage: (m) => {
      warnings.push(typeof m === "string" ? m : "");
      return Promise.resolve(undefined);
    },
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

const { ensureDocReadyForAgent, isUnderRoot, COPY } = require("./agent.js");

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
const readyProc = { isReady: () => true, start: () => {} };
const folder = (name, fsPath, scheme) => ({
  name,
  uri: { scheme: scheme || "file", fsPath, toString: () => (scheme || "file") + ":///" + fsPath.replace(/\\/g, "/") },
});

function reset() {
  warnings.length = 0;
  vscodeStub.workspace.workspaceFolders = undefined;
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

// ═══════════ ensureDocReadyForAgent (الاحتواء + الرسائل) ═══════════

test("ملفّ مفرد بلا مجلّد ⇒ يُرفَض برسالة «افتح مجلّدًا» (لا رفض خادم مضلّل)", async () => {
  reset();
  const ok = await ensureDocReadyForAgent(readyProc, makeDoc(R("tmp", "a.ص")));
  assert.equal(ok, false);
  assert.equal(warnings[0], COPY.noWorkspaceFolder);
});

test("جذر أوّل بمخطّط غير قرصيّ ⇒ كأنْ لا مجلّد (رسالة «افتح مجلّدًا» لا اسم جذرٍ افتراضيّ)", async () => {
  reset();
  vscodeStub.workspace.workspaceFolders = [folder("بعيد", "/remote/x", "vscode-remote")];
  const ok = await ensureDocReadyForAgent(readyProc, makeDoc(R("tmp", "a.ص")));
  assert.equal(ok, false);
  assert.equal(warnings[0], COPY.noWorkspaceFolder);
});

test("ملفّ خارج الجذر الأوّل ⇒ رسالة «خارج الجذر الأوّل» (لا تشغيل ضائع)", async () => {
  reset();
  vscodeStub.workspace.workspaceFolders = [folder("أ", R("a")), folder("ب", R("b"))];
  const ok = await ensureDocReadyForAgent(readyProc, makeDoc(R("b", "x.ص")));
  assert.equal(ok, false);
  assert.equal(warnings[0], COPY.outsidePrimaryRoot("أ"));
});

test("جذر متداخل داخل الأوّل: الملفّ يُقبل (احتواء مسارٍ لا هويّة المجلّد الأضيق) [Amelia]", async () => {
  reset();
  vscodeStub.workspace.workspaceFolders = [folder("ws", R("ws")), folder("sub", R("ws", "sub"))];
  const ok = await ensureDocReadyForAgent(readyProc, makeDoc(R("ws", "sub", "a.ص")));
  assert.equal(ok, true, "الخادم (cwd=ws) يقبل ws/sub/a.ص — العميل يجب ألّا يرفضه زورًا");
  assert.equal(warnings.length, 0);
});

test("ملفّ داخل الجذر الأوّل + محفوظ + الخادم جاهز ⇒ يجوز (true، لا تحذير)", async () => {
  reset();
  vscodeStub.workspace.workspaceFolders = [folder("ws", R("ws"))];
  const ok = await ensureDocReadyForAgent(readyProc, makeDoc(R("ws", "a.ص")));
  assert.equal(ok, true);
  assert.equal(warnings.length, 0);
});

test("داخل الجذر لكنّ الخادم غير جاهز ⇒ رسالة «غير جاهز» + محاولة إقلاع", async () => {
  reset();
  vscodeStub.workspace.workspaceFolders = [folder("ws", R("ws"))];
  let started = false;
  const notReady = { isReady: () => false, start: () => { started = true; } };
  const ok = await ensureDocReadyForAgent(notReady, makeDoc(R("ws", "a.ص")));
  assert.equal(ok, false);
  assert.equal(warnings[0], COPY.notReady);
  assert.equal(started, true);
});
