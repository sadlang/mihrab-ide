// @ts-check
"use strict";
// اختبار وحدة لمنطق حلّ مستند ص عالي القيمة في امتداد الترحيب (توصية تغطية Amelia #5):
//   • sadDocError        — نقيّ (لا vscode): تمييز ملفّ ص الصالح عن غير الصالح/غير المحفوظ.
//   • findWorkspaceSadFile — بحث الملفّ الرئيس ثمّ الوحيد/الالتباس (ببديل vscode متحكَّم).
//   • resolveSadDoc       — أولويّة المحرّر النشط ⇒ الظاهر ⇒ ملفّ مساحة العمل (فتح بجانب).
// نحمّل extension.js ببديل vscode عبر Module._load (لا vscode حقيقيّ)، وحالة متحكَّم بها S.

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// حالة البديل المتحكَّم بها من الاختبارات (تُصفَّر قبل كلّ حالة عبر reset).
const S = { active: undefined, visible: [], mains: [], allSad: [], opened: [], shown: [] };
function reset() {
  S.active = undefined;
  S.visible = [];
  S.mains = [];
  S.allSad = [];
  S.opened = [];
  S.shown = [];
}

/** مستند وهميّ بخصائص sadDocError الثلاث (اللغة/المسار/الحالة). */
function fakeDoc({ languageId = "sad", fileName = "مرحبا.ص", isUntitled = false, scheme = "file" } = {}) {
  return { languageId, fileName, isUntitled, uri: { scheme } };
}
/** Uri وهميّ (يكفي fsPath + scheme لمسار الحلّ). */
function fakeUri(fsPath) {
  return { fsPath, scheme: "file" };
}

const vscodeStub = {
  ViewColumn: { Beside: 2 },
  window: {
    get activeTextEditor() {
      return S.active;
    },
    get visibleTextEditors() {
      return S.visible;
    },
    showTextDocument(doc, opts) {
      S.shown.push({ doc, opts });
      return Promise.resolve(doc);
    },
  },
  workspace: {
    // الاستدعاء الأوّل (الرئيس) يمرّر maxResults=1؛ الثاني (كلّ ملفّات ص) يمرّر حدًّا أكبر.
    findFiles(_include, _exclude, maxResults) {
      return Promise.resolve(maxResults === 1 ? S.mains : S.allSad);
    },
    openTextDocument(uri) {
      S.opened.push(uri);
      return Promise.resolve(fakeDoc({ fileName: uri.fsPath }));
    },
  },
};

const _origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "vscode") return vscodeStub;
  return _origLoad.call(this, request, ...rest);
};

const { sadDocError, findWorkspaceSadFile, resolveSadDoc, COPY } = require("./extension.js");

// ── sadDocError (نقيّ) ──

test("sadDocError: ملفّ ص محفوظ على القرص ⇒ null (صالح)", () => {
  assert.equal(sadDocError(fakeDoc()), null);
});

test("sadDocError: يُكتشَف بالامتداد حين تختلف اللغة ⇒ null", () => {
  assert.equal(sadDocError(fakeDoc({ languageId: "plaintext" })), null);
});

test("sadDocError: ملفّ غير ص (لا لغة ولا امتداد) ⇒ notSadFile", () => {
  assert.equal(sadDocError(fakeDoc({ languageId: "javascript", fileName: "a.js" })), COPY.notSadFile);
});

test("sadDocError: مستند untitled ⇒ notOnDisk", () => {
  assert.equal(sadDocError(fakeDoc({ isUntitled: true })), COPY.notOnDisk);
});

test("sadDocError: مخطّط غير file (بعيد/افتراضيّ) ⇒ notOnDisk", () => {
  assert.equal(sadDocError(fakeDoc({ scheme: "untitled" })), COPY.notOnDisk);
});

// ── findWorkspaceSadFile (ببديل vscode) ──

test("findWorkspaceSadFile: يوجد الملفّ الرئيس ⇒ يُرجعه دون بحث موسّع", async () => {
  reset();
  const main = fakeUri("/w/مرحبا.ص");
  S.mains = [main];
  S.allSad = [fakeUri("/w/آخر.ص")]; // لا ينبغي أن يُستشار
  assert.deepEqual(await findWorkspaceSadFile(), { uri: main });
});

test("findWorkspaceSadFile: لا رئيس + ملفّ ص وحيد ⇒ يُرجعه", async () => {
  reset();
  const only = fakeUri("/w/وحيد.ص");
  S.allSad = [only];
  assert.deepEqual(await findWorkspaceSadFile(), { uri: only });
});

test("findWorkspaceSadFile: لا رئيس + تعدّد ⇒ التباس (لا تخمين)", async () => {
  reset();
  S.allSad = [fakeUri("/w/أ.ص"), fakeUri("/w/ب.ص")];
  assert.deepEqual(await findWorkspaceSadFile(), { ambiguous: true });
});

test("findWorkspaceSadFile: لا ملفّ ص إطلاقًا ⇒ null", async () => {
  reset();
  assert.equal(await findWorkspaceSadFile(), null);
});

// ── resolveSadDoc (ببديل vscode) ──

test("resolveSadDoc: محرّر ص نشط ⇒ { doc } (لا فتح)", async () => {
  reset();
  const doc = fakeDoc();
  S.active = { document: doc };
  const res = await resolveSadDoc();
  assert.equal(res.doc, doc);
  assert.equal(S.opened.length, 0);
});

test("resolveSadDoc: محرّر غير-ص نشط ⇒ { error: notSadFile } (سلوك صارم)", async () => {
  reset();
  S.active = { document: fakeDoc({ languageId: "javascript", fileName: "a.js" }) };
  const res = await resolveSadDoc();
  assert.equal(res.error, COPY.notSadFile);
});

test("resolveSadDoc: لا نشط + ملفّ ص ظاهر بجانب ⇒ { doc } (دون فتح جديد)", async () => {
  reset();
  const doc = fakeDoc({ fileName: "ظاهر.ص" });
  S.visible = [{ document: doc }];
  const res = await resolveSadDoc();
  assert.equal(res.doc, doc);
  assert.equal(S.opened.length, 0);
});

test("resolveSadDoc: لا نشط/ظاهر + رئيس بمساحة العمل ⇒ يفتحه بجانب ثمّ { doc }", async () => {
  reset();
  const main = fakeUri("/w/مرحبا.ص");
  S.mains = [main];
  const res = await resolveSadDoc();
  assert.ok(res.doc, "أُرجع مستند");
  assert.deepEqual(S.opened, [main]);
  assert.equal(S.shown.length, 1);
  assert.equal(S.shown[0].opts.viewColumn, vscodeStub.ViewColumn.Beside);
});

test("resolveSadDoc: لا نشط/ظاهر ولا ملفّ ص ⇒ { error: noEditor }", async () => {
  reset();
  const res = await resolveSadDoc();
  assert.equal(res.error, COPY.noEditor);
});

test("resolveSadDoc: لا نشط/ظاهر + تعدّد ملفّات ص ⇒ { error: sadFileAmbiguous }", async () => {
  reset();
  S.allSad = [fakeUri("/w/أ.ص"), fakeUri("/w/ب.ص")];
  const res = await resolveSadDoc();
  assert.equal(res.error, COPY.sadFileAmbiguous);
});
