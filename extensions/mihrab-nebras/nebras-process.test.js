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

const { isCompatible, resolveWorkspaceCwd } = require("./nebras-process.js");
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
