// @ts-check
"use strict";
// اختبار وحدة لمحوّلات LSP ⇄ VS Code في عميل ص (extension.js): درجات الخطورة، المدى، التشخيص،
// محتوى التحويم، مواقع التعريف، عناصر الإكمال. بديل vscode أدنى (Module._load) — لا محرّر حقيقيّ.

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

// ── بديل vscode: أصناف/تعدادات تستعملها المحوّلات (قيم DiagnosticSeverity تطابق vscode الحقيقيّة) ──
class Range {
  constructor(sl, sc, el, ec) {
    this.start = { line: sl, character: sc };
    this.end = { line: el, character: ec };
  }
}
class Diagnostic {
  constructor(range, message, severity) {
    this.range = range;
    this.message = message;
    this.severity = severity;
  }
}
class DiagnosticRelatedInformation {
  constructor(location, message) {
    this.location = location;
    this.message = message;
  }
}
class Location {
  constructor(uri, range) {
    this.uri = uri;
    this.range = range;
  }
}
class MarkdownString {
  constructor(value) {
    this.value = value || "";
    this.isCodeblock = false;
  }
  appendCodeblock(code, lang) {
    this.value = code;
    this.lang = lang;
    this.isCodeblock = true;
  }
}
class Hover {
  constructor(contents, range) {
    this.contents = contents;
    this.range = range;
  }
}
class CompletionItem {
  constructor(label, kind) {
    this.label = label;
    this.kind = kind;
  }
}
const vscodeStub = {
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Range,
  Diagnostic,
  DiagnosticRelatedInformation,
  Location,
  MarkdownString,
  Hover,
  CompletionItem,
  Uri: { parse: (s) => ({ toString: () => s, _s: s }) },
};

const _origLoad = Module._load;
// @ts-ignore
Module._load = function (request, parent, isMain) {
  if (request === "vscode") return vscodeStub;
  return _origLoad.call(this, request, parent, isMain);
};

const ext = require("./extension.js");

test.after(() => {
  // @ts-ignore
  Module._load = _origLoad;
});

// ═══════════════════════════ درجات الخطورة ═══════════════════════════

test("toVscodeSeverity: 1..4 ⇒ Error/Warning/Information/Hint، والمجهول ⇒ Hint", () => {
  assert.equal(ext.toVscodeSeverity(1), 0); // Error
  assert.equal(ext.toVscodeSeverity(2), 1); // Warning
  assert.equal(ext.toVscodeSeverity(3), 2); // Information
  assert.equal(ext.toVscodeSeverity(4), 3); // Hint
  assert.equal(ext.toVscodeSeverity(undefined), 3); // افتراضيّ Hint
});

// ═══════════════════════════ المدى ═══════════════════════════

test("toVscodeRange: يبني مدى صحيحًا، والمدى الناقص ⇒ صفر", () => {
  const r = ext.toVscodeRange({ start: { line: 2, character: 5 }, end: { line: 2, character: 9 } });
  assert.deepEqual(r.start, { line: 2, character: 5 });
  assert.deepEqual(r.end, { line: 2, character: 9 });
  const z = ext.toVscodeRange(null);
  assert.deepEqual(z.start, { line: 0, character: 0 });
});

// ═══════════════════════════ التشخيص ═══════════════════════════

test("toVscodeDiagnostic: رسالة/خطورة/مصدر افتراضيّ/كود/معلومات مرتبطة", () => {
  const d = ext.toVscodeDiagnostic({
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 3 } },
    message: "تعريف مكرر",
    severity: 2,
    code: "ص-ت١٠٢",
    relatedInformation: [
      { location: { uri: "file:///a.ص", range: { start: { line: 5, character: 0 }, end: { line: 5, character: 2 } } }, message: "الأوّل هنا" },
    ],
  });
  assert.equal(d.message, "تعريف مكرر");
  assert.equal(d.severity, 1); // Warning
  assert.equal(d.source, "ص");
  assert.equal(d.code, "ص-ت١٠٢");
  assert.equal(d.relatedInformation.length, 1);
  assert.equal(d.relatedInformation[0].message, "الأوّل هنا");
});

test("toVscodeDiagnostic: يحترم المصدر المُصرَّح من الخادم", () => {
  const d = ext.toVscodeDiagnostic({ range: null, message: "x", severity: 1, source: "ص-تحليل" });
  assert.equal(d.source, "ص-تحليل");
});

// ═══════════════════════════ التحويم ═══════════════════════════

test("toHoverContents: سلسلة، MarkupContent، MarkedString (code)، ومصفوفة", () => {
  const s = ext.toHoverContents("مرحبا");
  assert.equal(s.length, 1);
  assert.equal(s[0].value, "مرحبا");

  const mc = ext.toHoverContents({ kind: "markdown", value: "### دالة" });
  assert.equal(mc[0].value, "### دالة");

  const ms = ext.toHoverContents({ language: "sad", value: "دالة رئيسية()" });
  assert.equal(ms[0].isCodeblock, true);
  assert.equal(ms[0].value, "دالة رئيسية()");

  const arr = ext.toHoverContents(["أ", { value: "ب" }]);
  assert.equal(arr.length, 2);
});

// ═══════════════════════════ التعريف ═══════════════════════════

test("toDefinitionLocations: Location مفرد، مصفوفة، LocationLink، وفارغ", () => {
  const one = ext.toDefinitionLocations({ uri: "file:///a.ص", range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } } });
  assert.equal(one.length, 1);
  assert.equal(one[0].uri.toString(), "file:///a.ص");

  const many = ext.toDefinitionLocations([
    { uri: "file:///a.ص", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } },
    { uri: "file:///b.ص", range: { start: { line: 2, character: 0 }, end: { line: 2, character: 1 } } },
  ]);
  assert.equal(many.length, 2);

  const link = ext.toDefinitionLocations([
    { targetUri: "file:///c.ص", targetRange: { start: { line: 3, character: 0 }, end: { line: 3, character: 5 } }, targetSelectionRange: { start: { line: 3, character: 1 }, end: { line: 3, character: 3 } } },
  ]);
  assert.equal(link.length, 1);
  assert.equal(link[0].uri.toString(), "file:///c.ص");
  assert.deepEqual(link[0].range.start, { line: 3, character: 1 }); // يفضّل selectionRange

  assert.deepEqual(ext.toDefinitionLocations(null), []);
});

// ═══════════════════════════ الإكمال ═══════════════════════════

test("toCompletionItems: مصفوفة و CompletionList، وإزاحة النوع (LSP−1)", () => {
  const fromArray = ext.toCompletionItems([
    { label: "اطبع_سطر", kind: 3, detail: "دالة مدمجة", insertText: "اطبع_سطر" },
  ]);
  assert.equal(fromArray.length, 1);
  assert.equal(fromArray[0].label, "اطبع_سطر");
  assert.equal(fromArray[0].kind, 2); // LSP kind 3 ⇒ vscode 2
  assert.equal(fromArray[0].detail, "دالة مدمجة");
  assert.equal(fromArray[0].insertText, "اطبع_سطر");

  const fromList = ext.toCompletionItems({ isIncomplete: false, items: [{ label: "دالة" }] });
  assert.equal(fromList.length, 1);
  assert.equal(fromList[0].label, "دالة");

  assert.deepEqual(ext.toCompletionItems(null), []);
});

test("toCompletionItems: documentation ككائن MarkupContent يصبح MarkdownString", () => {
  const items = ext.toCompletionItems([{ label: "x", documentation: { kind: "markdown", value: "شرح" } }]);
  assert.equal(items[0].documentation.value, "شرح");
});

// ═══════════════════════════ DocumentSync (مزامنة Full) ═══════════════════════════

/** مدير عمليّة وهميّ يلتقط إشعارات notify (method, params). */
function makeFakeProc() {
  return { sent: [], notify(method, params) { this.sent.push({ method, params }); } };
}

/** مستند ص وهميّ: مخطَّط file افتراضًا، مع نصّ ونسخة. */
function fakeDoc(uri, text, { languageId = "sad", scheme = "file", version = 1 } = {}) {
  return {
    languageId,
    version,
    uri: { scheme, toString: () => uri },
    getText: () => text,
  };
}

test("DocumentSync.open: يرسل didOpen بالنصّ الكامل ويتتبّع المستند", () => {
  const proc = makeFakeProc();
  const sync = new ext.DocumentSync(proc);
  sync.open(fakeDoc("file:///a.ص", "دالة رئيسية()\nنهاية\n"));
  assert.equal(proc.sent.length, 1);
  assert.equal(proc.sent[0].method, "textDocument/didOpen");
  assert.equal(proc.sent[0].params.textDocument.uri, "file:///a.ص");
  assert.equal(proc.sent[0].params.textDocument.languageId, "sad");
  assert.match(proc.sent[0].params.textDocument.text, /دالة رئيسية/);
});

test("DocumentSync.change بعد open: يرسل didChange بالنصّ الكامل (مزامنة Full)", () => {
  const proc = makeFakeProc();
  const sync = new ext.DocumentSync(proc);
  const doc = fakeDoc("file:///a.ص", "نصّ ١");
  sync.open(doc);
  const doc2 = fakeDoc("file:///a.ص", "نصّ ٢ معدَّل", { version: 2 });
  sync.change(doc2);
  const change = proc.sent.find((m) => m.method === "textDocument/didChange");
  assert.ok(change, "أُرسِل didChange");
  assert.equal(change.params.contentChanges.length, 1);
  assert.equal(change.params.contentChanges[0].text, "نصّ ٢ معدَّل", "النصّ الكامل لا تغييرًا جزئيًّا");
  assert.equal(change.params.textDocument.version, 2);
});

test("DocumentSync.change بلا open سابق: يُطلق open (لا يفقد المستند)", () => {
  const proc = makeFakeProc();
  const sync = new ext.DocumentSync(proc);
  sync.change(fakeDoc("file:///b.ص", "محتوى"));
  assert.equal(proc.sent.length, 1);
  assert.equal(proc.sent[0].method, "textDocument/didOpen", "change على مستند غير مفتوح ⇒ didOpen");
});

test("DocumentSync.close: يرسل didClose ويُزيل التتبّع", () => {
  const proc = makeFakeProc();
  const sync = new ext.DocumentSync(proc);
  const doc = fakeDoc("file:///c.ص", "x");
  sync.open(doc);
  sync.close(doc);
  const close = proc.sent.find((m) => m.method === "textDocument/didClose");
  assert.ok(close, "أُرسِل didClose");
  // إغلاق ثانٍ لا يرسل شيئًا (أُزيل من التتبّع).
  const before = proc.sent.length;
  sync.close(doc);
  assert.equal(proc.sent.length, before, "لا didClose مكرّر لمستند غير متتبَّع");
});

test("DocumentSync: يتجاهل غير ملفّات ص (لغة أخرى أو مخطَّط untitled)", () => {
  const proc = makeFakeProc();
  const sync = new ext.DocumentSync(proc);
  sync.open(fakeDoc("file:///a.txt", "x", { languageId: "plaintext" }));
  sync.open(fakeDoc("untitled:Untitled-1", "x", { scheme: "untitled" }));
  assert.equal(proc.sent.length, 0, "لا مزامنة لغير ملفّات ص المحفوظة");
});
