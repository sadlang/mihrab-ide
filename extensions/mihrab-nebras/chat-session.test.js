// @ts-check
"use strict";
// اختبار وحدة لصنف ChatSession — يركّز على **حارس الحِقبة** (سباق الاكتمال-بعد-التبديل، ق6):
// مهمّةٌ تكتمل بعد تبديل الملفّ/إغلاق اللوحة يجب ألّا تكتب حالتها في جلسةٍ صُفِّرت. نحمّل chat.js
// ببديل vscode متحكَّم عبر Module._load (لا vscode حقيقيّ)، وproc وهميّ بمهمّة قابلة للحسم يدويًّا.

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// حالة البديل المتحكَّم بها من الاختبارات.
const S = { editorFile: null, edCb: null, panels: [] };

function fakeDoc(fileName) {
  return { languageId: "sad", fileName, isUntitled: false, uri: { scheme: "file" } };
}

const vscodeStub = {
  ViewColumn: { Beside: 2 },
  window: {
    get activeTextEditor() {
      return S.editorFile ? { document: fakeDoc(S.editorFile) } : undefined;
    },
    createWebviewPanel() {
      const panel = {
        posts: [],
        _disp: null,
        webview: {
          html: "",
          postMessage(m) { panel.posts.push(m); return true; },
          onDidReceiveMessage() { return { dispose() {} }; },
        },
        reveal() { panel.revealed = true; },
        onDidDispose(cb) { panel._disp = cb; return { dispose() {} }; },
      };
      S.panels.push(panel);
      return panel;
    },
    onDidChangeActiveTextEditor(cb) { S.edCb = cb; return { dispose() {} }; },
  },
  // chat.js يستورد resolveAgentRoot من agent.js (توحيد سياسة التوجيه) وهي تقرأ workspaceFolders.
  workspace: { workspaceFolders: undefined },
};

const _origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "vscode") return vscodeStub;
  return _origLoad.call(this, request, ...rest);
};

const { ChatSession, registerChat, COPY } = require("./chat.js");
const { ROLE_USER, ROLE_ASSISTANT } = require("./contract/protocol-contract.generated.js");

/** مهمّة قابلة للحسم يدويًّا (لمحاكاة توقيت الاكتمال). */
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const cfg = () => ({ permissionMode: "آمن", locale: "ar" });
function lastPanel() { return S.panels[S.panels.length - 1]; }

test("حارس الحِقبة: مهمّة تكتمل بعد تبديل الملفّ لا تُكتب في الجلسة (منع تسريب ق6)", async () => {
  S.editorFile = "/w/a.ص";
  const d = deferred();
  const proc = {
    isReady: () => true, start() {}, cancel() {},
    retargetNeedsRestart: () => false, hasActiveTasks: () => false, retargetRoot: async () => true,
    runTask(_p, onDelta, onId) { onId(1); onDelta("جواب"); return d.promise; },
  };
  const s = new ChatSession(proc, cfg, () => {});
  const pending = s.onUserMessage("سؤال");
  // بدّل الملفّ النشط أثناء جريان المهمّة ⇒ تصفير + حِقبة جديدة.
  S.editorFile = "/w/b.ص";
  S.edCb();
  d.resolve({ sourceEcho: "x" });
  await pending;
  assert.equal(s._conversation.length, 0, "لا تُكتب حالة الدور في جلسة صُفِّرت");
  assert.equal(s._baselineSource, null);
});

test("حارس الحِقبة معزولًا: مهمّة تكتمل بعد الإغلاق (نفس الملفّ النشط) لا تُكتب", async () => {
  // يعزل حارس الحِقبة عن حارس الملفّ: الإغلاق يقدّم الحِقبة بينما يبقى activeSadFile ثابتًا،
  // فالشرط الوحيد الذي يمنع الكتابة هو `epoch === this._sessionEpoch`.
  S.editorFile = "/w/a.ص";
  const d = deferred();
  const proc = {
    isReady: () => true, start() {}, cancel() {},
    retargetNeedsRestart: () => false, hasActiveTasks: () => false, retargetRoot: async () => true,
    runTask(_p, onDelta, onId) { onId(9); onDelta("جواب"); return d.promise; },
  };
  const s = new ChatSession(proc, cfg, () => {});
  const pending = s.onUserMessage("سؤال");
  lastPanel()._disp(); // إغلاق ⇒ _resetSession يقدّم الحِقبة (الملفّ النشط لم يتغيّر)
  d.resolve({ sourceEcho: "x" });
  await pending;
  assert.equal(s._conversation.length, 0, "الحِقبة وحدها تمنع الكتابة");
});

test("الدور الناجح يُدوَّن (مستخدم+مساعد) ويحدّث خطّ الأساس", async () => {
  S.editorFile = "/w/a.ص";
  const d = deferred();
  const proc = {
    isReady: () => true, start() {}, cancel() {},
    retargetNeedsRestart: () => false, hasActiveTasks: () => false, retargetRoot: async () => true,
    runTask(_p, onDelta, onId) { onId(2); onDelta("الشرح"); return d.promise; },
  };
  const s = new ChatSession(proc, cfg, () => {});
  const pending = s.onUserMessage("اشرح");
  d.resolve({ sourceEcho: "المصدر" });
  await pending;
  assert.equal(s._conversation.length, 2);
  assert.deepEqual(s._conversation[0], { role: ROLE_USER, text: "اشرح" });
  assert.deepEqual(s._conversation[1], { role: ROLE_ASSISTANT, text: "الشرح" });
  assert.equal(s._baselineSource, "المصدر");
});

test("جواب فارغ (بثّ صفريّ) لا يُدوَّن", async () => {
  S.editorFile = "/w/a.ص";
  const d = deferred();
  const proc = {
    isReady: () => true, start() {}, cancel() {},
    retargetNeedsRestart: () => false, hasActiveTasks: () => false, retargetRoot: async () => true,
    runTask(_p, _onDelta, onId) { onId(3); return d.promise; }, // لا بثّ
  };
  const s = new ChatSession(proc, cfg, () => {});
  const pending = s.onUserMessage("سؤال");
  d.resolve({});
  await pending;
  assert.equal(s._conversation.length, 0);
});

test("لا ملفّ ص نشط ⇒ رسالة «افتح ملفّ» بلا مهمّة", async () => {
  S.editorFile = null;
  let ran = false;
  const proc = {
    isReady: () => true, start() {}, cancel() {},
    retargetNeedsRestart: () => false, hasActiveTasks: () => false, retargetRoot: async () => true,
    runTask() { ran = true; return Promise.resolve({}); },
  };
  const s = new ChatSession(proc, cfg, () => {});
  await s.onUserMessage("س");
  assert.equal(ran, false);
  assert.ok(lastPanel().posts.some((m) => m.text === COPY.noContext));
});

test("فشل التوجيه/الخادم غير جاهز ⇒ رسالة «غير جاهز»، بلا مهمّة", async () => {
  S.editorFile = "/w/a.ص";
  let retargeted = false, ran = false;
  const proc = {
    isReady: () => false, start() {}, cancel() {},
    retargetNeedsRestart: () => false, hasActiveTasks: () => false,
    retargetRoot: async () => { retargeted = true; return false; }, // التوجيه يتولّى محاولة الإقلاع داخليًّا
    runTask() { ran = true; return Promise.resolve({}); },
  };
  const s = new ChatSession(proc, cfg, () => {});
  await s.onUserMessage("س");
  assert.equal(retargeted, true);
  assert.equal(ran, false);
  assert.ok(lastPanel().posts.some((m) => m.text === COPY.notReady));
});

test("توجيهٌ يستلزم إعادة تشغيل ومهمّةٌ جارية ⇒ رسالة انشغال بلا قطعٍ ولا مهمّة", async () => {
  S.editorFile = "/w/a.ص";
  let retargeted = false, ran = false;
  const proc = {
    isReady: () => true, start() {}, cancel() {},
    retargetNeedsRestart: () => true, hasActiveTasks: () => true,
    retargetRoot: async () => { retargeted = true; return true; },
    runTask() { ran = true; return Promise.resolve({}); },
  };
  const s = new ChatSession(proc, cfg, () => {});
  await s.onUserMessage("س");
  assert.equal(retargeted, false, "لا قطع لمهمّة جارية من لوحة الدردشة");
  assert.equal(ran, false);
  assert.ok(lastPanel().posts.some((m) => m.text === COPY.busyRetargeting));
});

test("الإغلاق يستدعي onDispose ويمنع النشر بعده", () => {
  S.editorFile = "/w/a.ص";
  let disposed = false;
  const proc = { isReady: () => true, start() {}, cancel() {}, retargetNeedsRestart: () => false, hasActiveTasks: () => false, retargetRoot: async () => true, runTask() { return Promise.resolve({}); } };
  const s = new ChatSession(proc, cfg, () => { disposed = true; });
  const panel = lastPanel();
  panel._disp(); // أطلق onDidDispose
  assert.equal(disposed, true);
  const before = panel.posts.length;
  s.pushContext(); // بعد الإغلاق: يجب ألّا ينشر (حارس _disposed)
  assert.equal(panel.posts.length, before);
});

test("registerChat: نسخة مفردة — الفتح الثاني يكشف القائمة لا ينشئ لوحة", () => {
  S.editorFile = "/w/a.ص";
  const before = S.panels.length;
  const proc = { isReady: () => true, start() {}, cancel() {}, retargetNeedsRestart: () => false, hasActiveTasks: () => false, retargetRoot: async () => true, runTask() { return Promise.resolve({}); } };
  registerChat.open({}, proc, cfg);
  registerChat.open({}, proc, cfg); // الثاني يكشف
  assert.equal(S.panels.length, before + 1, "لوحة واحدة فقط");
  assert.equal(lastPanel().revealed, true, "الفتح الثاني كشف القائمة");
  lastPanel()._disp(); // نظّف المرجع المفرد
});
