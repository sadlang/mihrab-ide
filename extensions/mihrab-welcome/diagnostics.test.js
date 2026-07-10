// @ts-check
"use strict";
// اختبار وحدة لجسر تشخيص ص [SAD-02]: منطق التحويل النقيّ (mapCheckOutput/conciseMessage) +
// سلوك SadDiagnostics ببديلَي vscode وchild_process متحكَّمين (Module._load). لا vscode/أداة حقيقيّة.

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// ── بدائل متحكَّم بها ──
const S = { collections: [], warnings: [], infos: [], fakeExt: undefined };
const CP = { calls: [], stdout: "", err: null, spawnErr: null };

function resetState() {
  S.collections = [];
  S.warnings = [];
  S.infos = [];
  S.fakeExt = undefined; // امتداد sad-lang الوهميّ (getExtension) — تضبطه اختبارات التنحّي.
  CP.calls = [];
  CP.stdout = "";
  CP.err = null;
  CP.spawnErr = null;
}

const vscodeStub = {
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Range: class {
    constructor(sl, sc, el, ec) {
      this.startLine = sl;
      this.startCol = sc;
      this.endLine = el;
      this.endCol = ec;
    }
  },
  Diagnostic: class {
    constructor(range, message, severity) {
      this.range = range;
      this.message = message;
      this.severity = severity;
    }
  },
  languages: {
    createDiagnosticCollection(name) {
      const c = {
        name,
        items: new Map(),
        disposed: false,
        set(uri, diags) {
          this.items.set(uri.fsPath, diags);
        },
        delete(uri) {
          this.items.delete(uri.fsPath);
        },
        clear() {
          this.items.clear();
        },
        dispose() {
          this.disposed = true;
        },
      };
      S.collections.push(c);
      return c;
    },
  },
  window: {
    showWarningMessage(m) {
      S.warnings.push(m);
    },
    showInformationMessage(m) {
      S.infos.push(m);
    },
  },
  // بديل vscode.extensions: يُرجع امتداد sad-lang الوهميّ (لاختبار تنحّي الجسر لخادم LSP).
  extensions: {
    getExtension(_id) {
      return S.fakeExt;
    },
  },
};

const cpStub = {
  // بديل execFile: يسجّل النداء ثمّ يستدعي رد النداء (أو معالِج error) على دورة تالية.
  execFile(cmd, args, _opts, cb) {
    CP.calls.push({ cmd, args });
    const child = {
      on(ev, h) {
        if (ev === "error") child._errH = h;
      },
    };
    setImmediate(() => {
      if (CP.spawnErr) {
        // يحاكي Node بدقّة: فشل الإطلاق (ENOENT) يُطلق ردّ النداء وحدث 'error' كليهما
        // (رُصد تجريبيًّا) — يجب ألّا تتكرّر الرسالة التفاعليّة رغم ذلك.
        cb(CP.spawnErr, "");
        if (child._errH) child._errH(CP.spawnErr);
      } else {
        cb(CP.err, CP.stdout);
      }
    });
    return child;
  },
};

const _origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "vscode") return vscodeStub;
  if (request === "child_process") return cpStub;
  return _origLoad.call(this, request, ...rest);
};

const { SadDiagnostics, mapCheckOutput, conciseMessage, lspOwnsDiagnostics, COPY } = require("./diagnostics.js");

// مستند ص وهميّ.
function fakeDoc(fsPath) {
  return { uri: { fsPath }, languageId: "sad", fileName: fsPath, isUntitled: false };
}
// سياق امتداد وهميّ (مسار غير موجود ⇒ حلّ الأداة يسقط إلى PATH «sad-check»).
const fakeCtx = { extensionPath: "/no/such/ext", subscriptions: [] };
const sadPred = { isSadFile: () => true };
function lastCollection() {
  return S.collections[S.collections.length - 1];
}
function tick() {
  return new Promise((r) => setImmediate(r));
}

// بنية ناتج sad-check --json (مصفوفة results، حقول قديمة + diagnostics الموحَّدة).
function checkJson(file, diagnostics) {
  return JSON.stringify({
    results: [{ file, clean: diagnostics.length === 0, readOk: true, parseOk: true, ownershipOk: true, diagnostics }],
  });
}

// ─────────── conciseMessage (نقيّ) ───────────

test("conciseMessage: يزيل بادئة ⛔/(AR) ويأخذ أوّل سطر", () => {
  assert.equal(conciseMessage("⛔ (AR) خطأ نحوي: الكتلة غير مغلقة!\nسطر ثانٍ", "x"), "خطأ نحوي: الكتلة غير مغلقة!");
});

test("conciseMessage: يفضّل العربيّة، ويسقط للإنجليزيّة إن غابت", () => {
  assert.equal(conciseMessage("", "Expected '}' here"), "Expected '}' here");
  assert.equal(conciseMessage(null, "(EN) Unexpected token"), "Unexpected token");
});

test("conciseMessage: يقصّ الرسائل الطويلة جدًّا (بإضافة …)", () => {
  const long = "أ".repeat(500);
  const out = conciseMessage(long, "");
  assert.ok(out.length <= 300, "لا يتجاوز الحدّ");
  assert.ok(out.endsWith("…"), "يُختم بعلامة القصّ");
});

// ─────────── mapCheckOutput (نقيّ) ───────────

test("mapCheckOutput: يحوّل السطر/العمود من أساس 1 إلى 0 ويضمن عرض تموّج ≥1", () => {
  const out = mapCheckOutput(
    checkJson("a.ص", [{ severity: "error", code: "SYN001", line: 3, column: 5, length: 0, messageAr: "خطأ" }]),
  );
  assert.equal(out.length, 1);
  const d = out[0].diagnostics[0];
  assert.equal(d.line0, 2);
  assert.equal(d.col0, 4);
  assert.equal(d.endCol0, 5); // عرض 1 عند length=0
  assert.equal(d.severity, "error");
  assert.equal(d.code, "SYN001");
});

test("mapCheckOutput: length>0 ⇒ نهاية العمود = العمود + الطول", () => {
  const out = mapCheckOutput(checkJson("a.ص", [{ severity: "warning", line: 1, column: 2, length: 4, messageAr: "ت" }]));
  const d = out[0].diagnostics[0];
  assert.equal(d.col0, 1);
  assert.equal(d.endCol0, 5); // 1 + 4
});

test("mapCheckOutput: يُزيل التكرار بنفس (سطر:عمود:رسالة)", () => {
  const dup = { severity: "error", line: 4, column: 1, length: 0, messageAr: "نفس" };
  const out = mapCheckOutput(checkJson("a.ص", [dup, { ...dup }, { ...dup, messageAr: "مختلف" }]));
  assert.equal(out[0].diagnostics.length, 2); // متطابقان يُدمجان، الثالث مختلف يبقى
});

test("mapCheckOutput: يتجاهل الإدخالات المشوَّهة والملفّات بلا مسار", () => {
  const raw = JSON.stringify({
    results: [
      { file: "a.ص", diagnostics: [null, 5, { line: 1, column: 1, messageAr: "ص" }] },
      { diagnostics: [] }, // بلا file ⇒ يُتجاهَل
    ],
  });
  const out = mapCheckOutput(raw);
  assert.equal(out.length, 1);
  assert.equal(out[0].diagnostics.length, 1);
});

test("mapCheckOutput: نتائج فارغة ⇒ مصفوفة فارغة", () => {
  assert.deepEqual(mapCheckOutput(JSON.stringify({ results: [] })), []);
});

test("mapCheckOutput: JSON غير صالح ⇒ يرمي (يلتقطه المستدعي)", () => {
  assert.throws(() => mapCheckOutput("Regular map literal\n{bad"));
});

// ─────────── SadDiagnostics (ببديل vscode + child_process) ───────────

test("checkNow: مستند ليس ملفّ ص ⇒ تحذير، بلا تشغيل الأداة", async () => {
  resetState();
  const d = new SadDiagnostics(fakeCtx, { isSadFile: () => false });
  await d.checkNow(fakeDoc("x.txt"));
  assert.equal(CP.calls.length, 0);
  assert.equal(S.warnings.length, 1);
  d.dispose();
});

test("checkNow: ملفّ به أخطاء ⇒ يضبط تشخيصات بمدى 0-based على المجموعة", async () => {
  resetState();
  CP.stdout = checkJson("f.ص", [{ severity: "error", code: "SYN001", line: 2, column: 3, length: 0, messageAr: "⛔ خطأ" }]);
  CP.err = new Error("rc=1"); // execFile يمرّر err عند rc≠0 — يجب تجاهله والاعتماد على stdout
  const d = new SadDiagnostics(fakeCtx, sadPred);
  const doc = fakeDoc("f.ص");
  await d.checkNow(doc);
  const set = lastCollection().items.get("f.ص");
  assert.ok(set && set.length === 1, "ضُبط تشخيص واحد");
  assert.equal(set[0].range.startLine, 1);
  assert.equal(set[0].range.startCol, 2);
  assert.equal(set[0].severity, 0); // Error
  assert.equal(set[0].message, "خطأ");
  assert.equal(set[0].code, "SYN001");
  d.dispose();
});

test("checkNow: ملفّ نظيف ⇒ يضبط [] ويعرض «لا مشكلات»", async () => {
  resetState();
  CP.stdout = checkJson("clean.ص", []);
  const d = new SadDiagnostics(fakeCtx, sadPred);
  await d.checkNow(fakeDoc("clean.ص"));
  assert.deepEqual(lastCollection().items.get("clean.ص"), []);
  assert.equal(S.infos.length, 1);
  d.dispose();
});

test("checkNow: الأداة غير موجودة (ENOENT) ⇒ تحذير «غير متوفّرة»، لا تعطّل", async () => {
  resetState();
  const e = new Error("spawn ENOENT");
  // @ts-ignore
  e.code = "ENOENT";
  CP.spawnErr = e;
  const d = new SadDiagnostics(fakeCtx, sadPred);
  await d.checkNow(fakeDoc("f.ص"));
  assert.equal(S.warnings.length, 1, "تحذير واحد فقط رغم إطلاق Node لردّ النداء وحدث error معًا");
  assert.equal(S.warnings[0], COPY.checkUnavailable);
  d.dispose();
});

test("scheduleCheck (حفظ): أداة غائبة ⇒ تحذير مرّة واحدة في الجلسة لا صمت تامّ [تدقيق #4]", async (t) => {
  resetState();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const e = new Error("spawn ENOENT");
  // @ts-ignore
  e.code = "ENOENT";
  CP.spawnErr = e;
  const d = new SadDiagnostics(fakeCtx, { isSadFile: () => true });
  d.scheduleCheck(fakeDoc("a.ص"));
  t.mock.timers.tick(400);
  await tick();
  d.scheduleCheck(fakeDoc("b.ص"));
  t.mock.timers.tick(400);
  await tick();
  assert.equal(S.warnings.length, 1, "تحذير واحد رغم حفظين (لا صمت، ولا إزعاج كلّ حفظ)");
  assert.equal(S.warnings[0], COPY.checkUnavailable);
  d.dispose();
});

test("checkNow: ناتج غير صالح ⇒ لا يمسّ المجموعة (لا يمسح تشخيصات سابقة)", async () => {
  resetState();
  CP.stdout = "Regular map literal\n{not json";
  const d = new SadDiagnostics(fakeCtx, sadPred);
  await d.checkNow(fakeDoc("f.ص"));
  assert.equal(lastCollection().items.has("f.ص"), false, "لم تُضبط تشخيصات على ناتج فاسد");
  d.dispose();
});

test("scheduleCheck: غير ملفّ ص لا يجدول شيئًا؛ ملفّ ص يجدول ثمّ يفحص بعد التهدئة", async (t) => {
  resetState();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  CP.stdout = checkJson("s.ص", []);
  const d = new SadDiagnostics(fakeCtx, { isSadFile: (doc) => doc.fileName.endsWith(".ص") });

  d.scheduleCheck(fakeDoc("nope.txt"));
  t.mock.timers.tick(400);
  await tick();
  assert.equal(CP.calls.length, 0, "غير ملفّ ص لا يُشغّل الأداة");

  d.scheduleCheck(fakeDoc("s.ص"));
  t.mock.timers.tick(400);
  await tick();
  assert.equal(CP.calls.length, 1, "ملفّ ص يُفحَص مرّةً بعد التهدئة");
  assert.deepEqual(CP.calls[0].args, ["--json", "s.ص"]);
  d.dispose();
});

test("scheduleCheck: حفظان متتاليان سريعان ⇒ فحص واحد (تهدئة)", async (t) => {
  resetState();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  CP.stdout = checkJson("s.ص", []);
  const d = new SadDiagnostics(fakeCtx, { isSadFile: () => true });
  const doc = fakeDoc("s.ص");
  d.scheduleCheck(doc);
  t.mock.timers.tick(200); // قبل انقضاء التهدئة
  d.scheduleCheck(doc); // يُعيد ضبط المؤقّت
  t.mock.timers.tick(400);
  await tick();
  assert.equal(CP.calls.length, 1, "فحص واحد فقط رغم حفظين");
  d.dispose();
});

test("dispose: يفكّك المجموعة ويمنع الفحص اللاحق", async () => {
  resetState();
  const d = new SadDiagnostics(fakeCtx, sadPred);
  d.dispose();
  assert.equal(lastCollection().disposed, true);
  CP.stdout = checkJson("f.ص", []);
  await d.checkNow(fakeDoc("f.ص")); // بعد dispose: يخرج مبكّرًا بلا تشغيل الأداة
  assert.equal(lastCollection().items.has("f.ص"), false);
  assert.equal(CP.calls.length, 0, "لا يُشغَّل sad-check بعد dispose");
});

// ─────────── تنحّي الجسر لخادم ص LSP [تكامل SAD-01/02] ───────────

/** يضبط امتداد sad-lang وهميًّا بحالة API معطاة. */
function setFakeSadLang({ isActive = true, isDiagnosticsActive = true } = {}) {
  S.fakeExt = { isActive, exports: { isDiagnosticsActive: () => isDiagnosticsActive } };
}

test("lspOwnsDiagnostics: غياب الامتداد ⇒ false (الجسر يعمل، تدهور رشيق)", () => {
  resetState(); // S.fakeExt = undefined
  assert.equal(lspOwnsDiagnostics(), false);
});

test("lspOwnsDiagnostics: امتداد نشط + isDiagnosticsActive()===true ⇒ true", () => {
  resetState();
  setFakeSadLang({ isActive: true, isDiagnosticsActive: true });
  assert.equal(lspOwnsDiagnostics(), true);
});

test("lspOwnsDiagnostics: امتداد غير نشط أو API يُرجع false ⇒ false", () => {
  resetState();
  setFakeSadLang({ isActive: false, isDiagnosticsActive: true });
  assert.equal(lspOwnsDiagnostics(), false, "غير نشط");
  setFakeSadLang({ isActive: true, isDiagnosticsActive: false });
  assert.equal(lspOwnsDiagnostics(), false, "API يُرجع false");
});

test("_runCheck يتنحّى: خادم LSP يملك التشخيص ⇒ لا sad-check + مسح المجموعة", async () => {
  resetState();
  setFakeSadLang({ isActive: true, isDiagnosticsActive: true });
  CP.stdout = checkJson("f.ص", [{ severity: "error", code: "SYN001", line: 1, column: 1, messageAr: "خطأ" }]);
  const d = new SadDiagnostics(fakeCtx, sadPred);
  const doc = fakeDoc("f.ص");
  await d.checkNow(doc);
  assert.equal(CP.calls.length, 0, "لم يُشغَّل sad-check (الجسر تنحّى)");
  assert.equal(lastCollection().items.has("f.ص"), false, "مُسِحت مجموعة الجسر");
  assert.ok(S.infos.includes(COPY.lspOwns), "أُعلِم المستخدم بالتنحّي (أمر يدويّ)");
  d.dispose();
});

test("_runCheck لا يتنحّى: لا خادم LSP ⇒ sad-check يعمل كالمعتاد", async () => {
  resetState(); // لا امتداد sad-lang
  CP.stdout = checkJson("f.ص", [{ severity: "error", code: "SYN001", line: 1, column: 1, messageAr: "خطأ" }]);
  const d = new SadDiagnostics(fakeCtx, sadPred);
  await d.checkNow(fakeDoc("f.ص"));
  assert.equal(CP.calls.length, 1, "شُغِّل sad-check (لا خادم LSP مالك)");
  d.dispose();
});
