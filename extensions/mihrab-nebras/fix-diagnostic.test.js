// @ts-check
"use strict";
// اختبار وحدة لـ«أصلِح بنِبراس» [SAD-11]: مزوّد إجراءات الكود (provideCodeActions) والمساعدات
// النقيّة (shortMessage/diagnosticCode) ببديل vscode أدنى (Module._load). لا vscode/خادم حقيقيّ.

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// ── بديل vscode: أصناف الإجراءات المستعملة في المزوّد ──
class CodeAction {
  constructor(title, kind) {
    this.title = title;
    this.kind = kind;
    this.diagnostics = [];
    this.command = undefined;
  }
}
const W = { warnings: [], opened: [] };
const vscodeStub = {
  CodeAction,
  CodeActionKind: { QuickFix: "quickfix" },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  languages: { registerCodeActionsProvider() { return { dispose() {} }; } },
  commands: { registerCommand() { return { dispose() {} }; } },
  window: { showWarningMessage(m) { W.warnings.push(m); } },
  workspace: {
    openTextDocument(uri) {
      W.opened.push(uri);
      return Promise.resolve({ languageId: "sad", isUntitled: false, uri: { scheme: "file" }, isDirty: false });
    },
  },
};

const _origLoad = Module._load;
// @ts-ignore
Module._load = function (request, ...rest) {
  if (request === "vscode") return vscodeStub;
  // agent.js يستورد vscode أيضًا؛ نمرّره البديل نفسه (لا نستدعي دواله هنا).
  return _origLoad.call(this, request, ...rest);
};

const fix = require("./fix-diagnostic.js");

test.after(() => {
  // @ts-ignore
  Module._load = _origLoad;
});

/** تشخيص وهميّ. */
function diag(message, { line = 0, code } = {}) {
  return { message, code, range: { start: { line, character: 0 }, end: { line, character: 5 } } };
}

// ═══════════════════════════ المساعدات النقيّة ═══════════════════════════

test("shortMessage: سطر واحد، وقصّ الطويل بإهليلج", () => {
  assert.equal(fix.shortMessage("خطأ نحويّ"), "خطأ نحويّ");
  assert.equal(fix.shortMessage("السطر الأوّل\nالسطر الثاني"), "السطر الأوّل");
  const long = "أ".repeat(80);
  const s = fix.shortMessage(long);
  assert.ok(s.length <= 60 && s.endsWith("…"), "قُصّ الطويل بإهليلج");
  assert.equal(fix.shortMessage(""), "");
});

test("diagnosticCode: سلسلة/رقم/كائن{value}/غياب", () => {
  assert.equal(fix.diagnosticCode("SYN001"), "SYN001");
  assert.equal(fix.diagnosticCode(42), "42");
  assert.equal(fix.diagnosticCode({ value: "ص-ت١٠٢", target: "x" }), "ص-ت١٠٢");
  assert.equal(fix.diagnosticCode(undefined), "");
  assert.equal(fix.diagnosticCode(null), "");
});

// ═══════════════════════════ مزوّد إجراءات الكود ═══════════════════════════

test("provideCodeActions: إجراء «أصلِح بنِبراس» لكلّ تشخيص، بوسيطَي (uri، تشخيص)", () => {
  const provider = new fix.NebrasFixCodeActionProvider();
  const uri = { toString: () => "file:///a.ص", _u: "a" };
  const d1 = diag("تعريف مكرر للاسم 'س'", { line: 2, code: "ص-ت١٠٢" });
  const d2 = diag("خطأ نحويّ", { line: 5 });
  const actions = provider.provideCodeActions({ uri }, {}, { diagnostics: [d1, d2] });

  assert.equal(actions.length, 2, "إجراء لكلّ تشخيص");
  assert.match(actions[0].title, /أصلِح بنِبراس/);
  assert.equal(actions[0].kind, "quickfix");
  assert.deepEqual(actions[0].diagnostics, [d1], "الإجراء مربوط بتشخيصه (يظهر في مصباح الخطأ)");
  assert.equal(actions[0].command.command, fix.FIX_COMMAND);
  assert.equal(actions[0].command.arguments[0], uri);
  assert.equal(actions[0].command.arguments[1], d1);
});

test("provideCodeActions: لا تشخيصات ⇒ مصفوفة فارغة (لا إجراء)", () => {
  const provider = new fix.NebrasFixCodeActionProvider();
  assert.deepEqual(provider.provideCodeActions({ uri: {} }, {}, { diagnostics: [] }), []);
  assert.deepEqual(provider.provideCodeActions({ uri: {} }, {}, {}), []);
});

test("provideCodeActions: يتخطّى المعلومات/التلميحات (خطأ/تحذير فقط) [Amelia م4]", () => {
  const provider = new fix.NebrasFixCodeActionProvider();
  const info = { ...diag("معلومة"), severity: 2 }; // Information
  const hint = { ...diag("تلميح"), severity: 3 }; // Hint
  const err = { ...diag("خطأ"), severity: 0 }; // Error
  const actions = provider.provideCodeActions({ uri: {} }, {}, { diagnostics: [info, hint, err] });
  assert.equal(actions.length, 1, "إجراء واحد للخطأ فقط");
});

test("provideCodeActions: رسالة فارغة ⇒ عنوان عامّ لا نقطتين متدلّيتين [Amelia م2]", () => {
  const provider = new fix.NebrasFixCodeActionProvider();
  const actions = provider.provideCodeActions({ uri: {} }, {}, { diagnostics: [diag("", { line: 0 })] });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].title, fix.COPY.actionTitleGeneric, "العنوان العامّ لا «أصلِح بنِبراس: »");
});

test("makeFixCommand: بلا وسائط ⇒ يبلّغ ولا يفتح مستندًا (لا يشغّل مهمّة) [Amelia م5]", async () => {
  W.warnings = [];
  W.opened = [];
  const fakeProc = { isReady: () => true };
  const cmd = fix.makeFixCommand(fakeProc, { clear() {}, append() {}, show() {} }, () => ({ permissionMode: "آمن", locale: "ar" }));
  await cmd(undefined, undefined);
  assert.equal(W.opened.length, 0, "لم يُفتَح مستند (خرج عند الحارس)");
  assert.equal(W.warnings.length, 1, "أُبلِغ المستخدم");
});

test("COPY.fixInstruction: تبني تعليمة الإصلاح من السطر والرسالة والرمز والمقتطف", () => {
  const instr = fix.COPY.fixInstruction(3, "تعريف مكرر", "ص-ت١٠٢", "دالة رئيسية()");
  assert.match(instr, /السطر 3/);
  assert.match(instr, /ص-ت١٠٢/);
  assert.match(instr, /تعريف مكرر/);
  assert.match(instr, /دالة رئيسية/);
  // بلا رمز/مقتطف: لا يكسر.
  const bare = fix.COPY.fixInstruction(1, "خطأ", "", "");
  assert.match(bare, /السطر 1/);
  assert.doesNotMatch(bare, /رمز/);
});
