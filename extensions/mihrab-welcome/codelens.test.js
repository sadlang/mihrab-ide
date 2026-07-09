// @ts-check
"use strict";
// اختبار وحدة لعدسات كود «شغّل/ابنِ» [SAD-04]: نمط كشف دالّة رئيسية (MAIN_FN_RE)، وموفّر العدسات
// (SadMainCodeLensProvider) بمستند وهميّ، واشتقاق مسار المخرَج (outputPath). vscode مُبدَّل (Module._load).

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const npath = require("node:path");

// بديل vscode أدنى ما يلزم: Range وCodeLens بانِيان بسيطان (المزوّد يستعملهما فقط).
const vscodeStub = {
  Range: class {
    constructor(sl, sc, el, ec) {
      this.startLine = sl;
      this.startCol = sc;
      this.endLine = el;
      this.endCol = ec;
    }
  },
  CodeLens: class {
    constructor(range, command) {
      this.range = range;
      this.command = command;
    }
  },
};

const _origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "vscode") return vscodeStub;
  return _origLoad.call(this, request, ...rest);
};

const { SadMainCodeLensProvider, MAIN_FN_RE, outputPath, COPY } = require("./extension.js");

// مستند وهميّ من أسطر نصّيّة.
function fakeDoc(lines) {
  return {
    lineCount: lines.length,
    lineAt(i) {
      return { text: lines[i] };
    },
  };
}

// ─────────── MAIN_FN_RE (نمط دالّة رئيسية) ───────────

test("MAIN_FN_RE: يطابق «دالة رئيسية()» و«دالة رقم رئيسية()» (نوع اختياريّ)", () => {
  assert.ok(MAIN_FN_RE.test("دالة رئيسية()"));
  assert.ok(MAIN_FN_RE.test("دالة رقم رئيسية()"));
  assert.ok(MAIN_FN_RE.test("\tدالة رئيسية ()")); // مسافة قبل القوس + إزاحة
});

test("MAIN_FN_RE: لا يطابق دالّة أخرى ولا «رئيسية» وحدها", () => {
  assert.ok(!MAIN_FN_RE.test("دالة جمع(أ، ب)"));
  assert.ok(!MAIN_FN_RE.test("رئيسية()")); // بلا «دالة»
  assert.ok(!MAIN_FN_RE.test("متغير رئيسية = 1"));
});

// ─────────── SadMainCodeLensProvider ───────────

test("provideCodeLenses: مستند فيه دالّة رئيسية ⇒ عدستا «شغّل» و«ابنِ»", () => {
  const p = new SadMainCodeLensProvider();
  const lenses = p.provideCodeLenses(fakeDoc(["# تعليق", "دالة رئيسية()", "\tاطبع(\"مرحبا\")", "نهاية"]));
  assert.equal(lenses.length, 2);
  assert.equal(lenses[0].command.title, COPY.lensRun);
  assert.equal(lenses[0].command.command, "mihrab.runSadFile");
  assert.equal(lenses[1].command.title, COPY.lensBuild);
  assert.equal(lenses[1].command.command, "mihrab.buildSadFile");
  // كلتاهما على سطر دالّة رئيسية (الفهرس 1).
  assert.equal(lenses[0].range.startLine, 1);
  assert.equal(lenses[1].range.startLine, 1);
});

test("provideCodeLenses: بلا دالّة رئيسية ⇒ لا عدسات", () => {
  const p = new SadMainCodeLensProvider();
  assert.equal(p.provideCodeLenses(fakeDoc(["دالة جمع(أ، ب)", "\tارجع أ + ب", "نهاية"])).length, 0);
});

test("provideCodeLenses: عدّة نقاط دخول ⇒ يكتفي بالأولى (زوج واحد)", () => {
  const p = new SadMainCodeLensProvider();
  const lenses = p.provideCodeLenses(fakeDoc(["دالة رئيسية()", "نهاية", "دالة رئيسية()", "نهاية"]));
  assert.equal(lenses.length, 2, "زوج عدسات واحد لأوّل نقطة دخول");
  assert.equal(lenses[0].range.startLine, 0);
});

// ─────────── outputPath (اشتقاق مسار المخرَج) ───────────

test("outputPath: يزيل لاحقة ص ويُبقي المسار بجوار المصدر", () => {
  const out = outputPath(npath.join("/dir", "مرحبا.ص"));
  assert.equal(out, npath.join("/dir", "مرحبا"));
  assert.ok(!out.endsWith(".ص"));
});
