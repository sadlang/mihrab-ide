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
class DocumentSymbol {
  constructor(name, detail, kind, range, selectionRange) {
    this.name = name;
    this.detail = detail;
    this.kind = kind;
    this.range = range;
    this.selectionRange = selectionRange;
    this.children = [];
  }
}
class SemanticTokens {
  constructor(data, resultId) {
    this.data = data;
    this.resultId = resultId;
  }
}
class SemanticTokensLegend {
  constructor(tokenTypes, tokenModifiers) {
    this.tokenTypes = tokenTypes;
    this.tokenModifiers = tokenModifiers;
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
  DocumentSymbol,
  SemanticTokens,
  SemanticTokensLegend,
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

// ═══════════════════════════ الرموز الدلاليّة [SAD-07] ═══════════════════════════

test("toSemanticTokens: بيانات LSP تُمرَّر مباشرةً كـUint32Array (نفس الترميز)", () => {
  // «دالة»(نوع 15=keyword) ثمّ «رئيسية»(نوع 12=function): خماسيّان نسبيّان.
  const st = ext.toSemanticTokens({ data: [0, 0, 4, 15, 0, 0, 5, 6, 12, 0], resultId: "1" });
  assert.ok(st.data instanceof Uint32Array);
  assert.equal(st.data.length, 10);
  assert.equal(st.data[3], 15); // نوع الرمز الأوّل = keyword
  assert.equal(st.data[8], 12); // نوع الرمز الثاني = function
  assert.equal(st.resultId, "1");
});

test("toSemanticTokens: غياب البيانات ⇒ undefined", () => {
  assert.equal(ext.toSemanticTokens(null), undefined);
  assert.equal(ext.toSemanticTokens({}), undefined);
  assert.equal(ext.toSemanticTokens({ data: "ليست مصفوفة" }), undefined);
});

test("toSemanticTokens: data فارغة [] ⇒ رموز فارغة صالحة (لا undefined)", () => {
  const st = ext.toSemanticTokens({ data: [] });
  assert.ok(st.data instanceof Uint32Array);
  assert.equal(st.data.length, 0);
});

test("serverLegendMatches: مطابقة الترتيب ⇒ true، اختلاف الترتيب/غياب ⇒ false", () => {
  const good = {
    semanticTokensProvider: {
      legend: {
        tokenTypes: ["namespace", "type", "class", "enum", "interface", "struct", "typeParameter", "parameter", "variable", "property", "enumMember", "event", "function", "method", "macro", "keyword", "modifier", "comment", "string", "number", "regexp", "operator", "decorator"],
        tokenModifiers: ["declaration", "definition", "readonly", "static", "deprecated", "abstract", "async", "modification", "documentation", "defaultLibrary"],
      },
    },
  };
  assert.equal(ext.serverLegendMatches(good), true);

  // ترتيب مختلف (type وnamespace متبادلان) ⇒ false (يمنع التلوين الخاطئ).
  const reordered = JSON.parse(JSON.stringify(good));
  [reordered.semanticTokensProvider.legend.tokenTypes[0], reordered.semanticTokensProvider.legend.tokenTypes[1]] =
    [reordered.semanticTokensProvider.legend.tokenTypes[1], reordered.semanticTokensProvider.legend.tokenTypes[0]];
  assert.equal(ext.serverLegendMatches(reordered), false);

  // اختلاف المعدّلات وحدها (طول مختلف) ⇒ false.
  const badMods = JSON.parse(JSON.stringify(good));
  badMods.semanticTokensProvider.legend.tokenModifiers.pop();
  assert.equal(ext.serverLegendMatches(badMods), false, "طول معدّلات مختلف");

  assert.equal(ext.serverLegendMatches(null), false);
  assert.equal(ext.serverLegendMatches({ semanticTokensProvider: {} }), false);
});


// ── حارسُ اتّساق مديات الرموز الدلاليّة [SAD-07] ──
// الأرقامُ أدناه **مقيسةٌ من خادمٍ حقيقيّ** لا مؤلَّفة: خادم ص المثبَّت (‏sad-lsp.exe
// بتاريخ ١٢ آذار ٢٠٢٦، أقدمُ من إصلاح UTF-16 في مصدر اللغة) ردّ على السطر
// «متغير نصاب_الفضة = ٥٩٥» بأطوالٍ ١٠ و١٩ — أي بالبايتات (‏«متغير» ٥ محارف = ١٠
// بايتات، و«نصاب_الفضة» ١٠ محارف = ١٩ بايتًا). ونسخةُ dev المبنيّة ردّت ٥ و١٠.
// والأثرُ ليس تلوينًا خاطئًا فحسب بل **كسرُ وصل الحروف العربيّة**: حدُّ الرمز يصير
// حدَّ عنصرٍ في DOM، والتشكيلُ لا يعبره.

/** طولُ سطرٍ من مصفوفة سطور (توقيع الحارس: دالّةٌ لا نسخةُ نصّ). */
const lens = (lines) => (n) => (n >= 0 && n < lines.length ? lines[n].length : undefined);

test("semanticRangesAreSane: أطوالٌ بوحدات UTF-16 (نسخة dev المقيسة) ⇒ تُقبل", () => {
  const lines = ["متغير نصاب_الفضة = ٥٩٥"];
  //            Δسطر Δعمود طول نوع معدّلات
  const data = [0, 0, 5, 15, 0, 0, 6, 10, 8, 0, 0, 11, 1, 21, 0];
  assert.equal(ext.semanticRangesAreSane(data, lens(lines)), true);
});

test("semanticRangesAreSane: أطوالٌ بالبايتات (العطب المقيس) ⇒ تُرفض", () => {
  const lines = ["متغير نصاب_الفضة = ٥٩٥"];
  assert.equal(ext.semanticRangesAreSane([0, 0, 10, 15, 0, 0, 6, 19, 8, 0], lens(lines)), false);
});

test("semanticRangesAreSane: تداخلٌ مع الرمز السابق ⇒ يُرفض", () => {
  assert.equal(ext.semanticRangesAreSane([0, 0, 4, 8, 0, 0, 2, 2, 8, 0], lens(["ابجد هوز"])), false);
});

test("semanticRangesAreSane: سطرٌ خارج المستند ⇒ يُرفض", () => {
  assert.equal(ext.semanticRangesAreSane([5, 0, 1, 8, 0], lens(["سطر"])), false);
});

test("semanticRangesAreSane: سطرٌ جديد يُصفّر عدّاد التداخل", () => {
  assert.equal(ext.semanticRangesAreSane([0, 0, 4, 8, 0, 1, 0, 3, 8, 0], lens(["ابجد", "هوز"])), true);
});

test("semanticRangesAreSane: بلا رموز ⇒ مقبول (لا شيء يُشوَّه)", () => {
  assert.equal(ext.semanticRangesAreSane([], lens(["ابجد"])), true);
});

test("semanticRangesAreSane: خماسيّةٌ ناقصة ⇒ تُرفض (‏Uint32Array مشوَّه)", () => {
  assert.equal(ext.semanticRangesAreSane([0, 0, 4, 8], lens(["ابجد"])), false);
});

test("semanticRangesAreSane: طولٌ سالب ⇒ يُرفض (كان يمرّ ويُبطل كشف التداخل)", () => {
  assert.equal(ext.semanticRangesAreSane([0, 0, -4, 8, 0], lens(["ابجد"])), false);
});

test("semanticRangesAreSane: عددٌ كسريّ أو Δسطر سالب ⇒ يُرفض", () => {
  assert.equal(ext.semanticRangesAreSane([0, 0, 1.5, 8, 0], lens(["ابجد"])), false);
  assert.equal(ext.semanticRangesAreSane([-1, 0, 1, 8, 0], lens(["ابجد"])), false);
});

test("semanticRangesAreSane: رمزٌ بطول صفرٍ مقبول (لا يشوّه شيئًا)", () => {
  assert.equal(ext.semanticRangesAreSane([0, 0, 0, 8, 0], lens(["ابجد"])), true);
});

test("semanticRangesAreSane: أزواجٌ بديلة — الطول بوحدات UTF-16 كما يوجب البروتوكول", () => {
  // «😀س» = ٣ وحدات UTF-16. رمزٌ يغطّيها كلَّها مقبول، وواحدٌ يتجاوزها مرفوض.
  assert.equal(ext.semanticRangesAreSane([0, 0, 3, 8, 0], lens(["😀س"])), true);
  assert.equal(ext.semanticRangesAreSane([0, 0, 4, 8, 0], lens(["😀س"])), false);
});

test("createSemanticGuard: مزلاجُ جلسة — يُبلّغ مرّةً ويُطفئ حتّى إعادة التشغيل", () => {
  const logs = [];
  const warns = [];
  const g = ext.createSemanticGuard((m) => logs.push(m), (m) => warns.push(m));
  // البيانات المقيسة نفسُها: «متغير»=١٠ و«نصاب_الفضة»=١٩ بالبايتات ⇒ ٦+١٩ يتجاوز ٢٢.
  // ‏(ولاحِظ: رمزٌ واحدٌ بطول ١٠ على سطرٍ طولُه ١٠ **يمرّ** — الكشفُ عَرَضيٌّ بطبعه،
  // وهو سببُ المزلاج: قرارٌ واحدٌ للجلسة بدل قرارٍ يومض مع كلّ سطر.)
  const bad = [0, 0, 10, 15, 0, 0, 6, 19, 8, 0];
  const good = [0, 0, 5, 15, 0, 0, 6, 10, 8, 0];
  const L = lens(["متغير نصاب_الفضة = ٥٩٥"]);

  assert.equal(g.accept(good, L), true, "السليم يُقبل قبل الرفض");
  assert.equal(g.disabled, false);
  assert.equal(g.accept(bad, L), false, "المعطوب يُرفض");
  assert.equal(g.disabled, true, "المزلاج أُغلِق");
  // لا وميض: بعد الإغلاق يُرفض حتّى السليم — الوميضُ أسوأ من فقدٍ ثابتٍ معلَن.
  assert.equal(g.accept(good, L), false, "لا عودةَ للتلوين في الجلسة نفسها");
  assert.equal(logs.length, 1, "سطرُ قناةٍ واحدٌ لا سطرٌ لكلّ ضغطة مفتاح");
  assert.equal(warns.length, 1, "إشعارٌ واحدٌ لكلّ جلسة");

  g.reset();
  assert.equal(g.disabled, false, "إعادةُ تشغيل الخادم تفتح الباب (قد تكون النسخة تغيّرت)");
  assert.equal(g.accept(good, L), true);
});

// ───────────────── [DX-01] ترشيحُ الإكمال بالرسمَين ─────────────────
// الوصلُ الجديد يمسّ **كلّ** بندِ إكمالٍ يعود من الخادم، فيلزمه توكيدٌ لا قراءة.

test("toCompletionItems: تسميةٌ عربيّةٌ ⇒ filterText يحمل الأصلَ والمطبَّع", () => {
  const [item] = ext.toCompletionItems([{ label: "نصاب_الفضة" }]);
  assert.strictEqual(item.label, "نصاب_الفضة", "المعروضُ لا يتغيّر");
  assert.ok(item.filterText.includes("نصاب_الفضة"), "الأصلُ حاضر");
  assert.ok(item.filterText.includes("نصاب_الفضه"), "المطبَّعُ حاضر — «الفضه» تجد «الفضة»");
});

test("toCompletionItems: تسميةٌ لاتينيّةٌ ⇒ لا تضخيمَ بلا فائدة", () => {
  const [item] = ext.toCompletionItems([{ label: "main" }]);
  assert.strictEqual(item.filterText, "main");
});

test("toCompletionItems: filterText من الخادم يُحترَم ويُوسَّع لا يُدهَس", () => {
  const [item] = ext.toCompletionItems([{ label: "عرض", filterText: "الفِضَّة" }]);
  assert.ok(item.filterText.startsWith("الفِضَّة"), "أصلُ الخادم في المقدّمة");
  assert.ok(item.filterText.includes("الفضه"), "ومعه المطبَّع");
});

// ═══════════════ [SAD-08] ترميزُ المواضع: قياسٌ لا تخمين ═══════════════
//
// ‏**الحمولاتُ أدناه مسجَّلةٌ حرفيًّا من خادم ص المشحون** (`sad-lsp.exe` 2.1.0،
// ‏`serverInfo = {"name":"خادم لغة ص","version":"2.1.0"}`) لا مصنوعةً بأيدينا —
// درسُ `richness-poor-sample`: تأكيدٌ صحيحٌ فوق عيّنةٍ فقيرةٍ لا يقيس شيئًا. وخادمٌ
// زائفٌ نكتبه هنا كان سيقيس **زيفَنا**: `toLspPosition` دالّةُ هُويّة، فلا قرارَ
// تطبيعٍ ولا حسابَ مدًى في شجرتنا أصلًا.

const PE = require("./position-encoding.js");

// السطرُ المقيس: 15 وحدةَ UTF-16 · 27 بايتًا.
const LINE_DAALA = "دالة مُعلِّم(س)";
// السطرُ المقيس: 14 وحدة · 24 بايتًا.
const LINE_MUTAGHAYYIR = "متغير معلم = ٥";

/** حمولةُ `documentSymbol` كما وردت من الخادم على الملفّ المكوَّن من السطرين وبينهما جسمُ الدالّة. */
const SYMBOLS_MEASURED = [
  { kind: 12, name: "مُعلِّم",
    range: { start: { line: 0, character: 0 }, end: { line: 0, character: 27 } },
    selectionRange: { start: { line: 0, character: 9 }, end: { line: 0, character: 23 } } },
  { kind: 13, name: "معلم",
    range: { start: { line: 3, character: 0 }, end: { line: 3, character: 24 } },
    selectionRange: { start: { line: 3, character: 11 }, end: { line: 3, character: 19 } } },
  // رمزان زائفان: الخادمُ طوى «مُعلِّم» إلى «معلم» فأصدر لكلٍّ مدخلًا **صفريَّ العرض**.
  { kind: 12, name: "معلم", detail: "(س: غير_محدد) ← غير_محدد",
    range: { start: { line: 0, character: 5 }, end: { line: 0, character: 5 } },
    selectionRange: { start: { line: 0, character: 5 }, end: { line: 0, character: 5 } } },
  { kind: 13, name: "معلم", detail: "رقم",
    range: { start: { line: 3, character: 6 }, end: { line: 3, character: 6 } },
    selectionRange: { start: { line: 3, character: 6 }, end: { line: 3, character: 6 } } },
];

const LINES_MEASURED = [LINE_DAALA, "    ارجع س", "نهاية", LINE_MUTAGHAYYIR];
const lineOfMeasured = (n) => LINES_MEASURED[n];

test("[SAD-08] byteToUtf16: يقف على حدود المحارف، ويمتنع داخلها وبعد نهاية السطر", () => {
  assert.equal(LINE_DAALA.length, 15);
  assert.equal(Buffer.byteLength(LINE_DAALA, "utf8"), 27);
  assert.equal(PE.byteToUtf16(LINE_DAALA, 0), 0);
  assert.equal(PE.byteToUtf16(LINE_DAALA, 9), 5); // «دالة » = 9 بايتات = 5 وحدات
  assert.equal(PE.byteToUtf16(LINE_DAALA, 23), 12); // نهايةُ «مُعلِّم»
  assert.equal(PE.byteToUtf16(LINE_DAALA, 27), 15); // نهايةُ السطر
  // إزاحةٌ تقع **داخل** محرفٍ عربيٍّ (بايتٌ واحدٌ من اثنين) ⇒ امتناعٌ لا تقريب.
  assert.equal(PE.byteToUtf16(LINE_DAALA, 1), null);
  assert.equal(PE.byteToUtf16(LINE_DAALA, 28), null); // بعد نهاية السطر
});

test("[SAD-08] decideFromSymbol: يقرّر «بايتات» من الحمولة المقيسة", () => {
  assert.equal(PE.decideFromSymbol("مُعلِّم", LINE_DAALA, 9, 23), PE.ENC_BYTES);
  assert.equal(PE.decideFromSymbol("معلم", LINE_MUTAGHAYYIR, 11, 19), PE.ENC_BYTES);
});

test("[SAD-08] decideFromSymbol: ملاحظةٌ لا تُميّز ⇒ لا قرار (سياجُ العيّنة الفقيرة)", () => {
  // سطرٌ لاتينيٌّ محض: البايتاتُ والوحداتُ سواء، فالمطابقةُ لا تدلّ على ترميز.
  // ولو قُبلت لثُبِّت `utf-16` من عيّنةٍ فقيرةٍ ولَما رُمِّم شيءٌ بعدها في الجلسة.
  assert.equal(PE.decideFromSymbol("abc", "let abc = 1", 4, 7), null);
});

test("[SAD-08] decideFromSymbol: اسمٌ مطبَّعٌ لا يطابق أيَّ فرع ⇒ امتناع", () => {
  // الخادمُ يطوي فيسمّي «مُعلِّم» باسم «معلم» — لا الوحداتُ ولا البايتاتُ تُنتجه.
  assert.equal(PE.decideFromSymbol("معلم", LINE_DAALA, 9, 23), null);
});

test("[SAD-08] rangeProvesBytes: مدًى يتجاوز نهايةَ سطره لا يمكن أن يكون UTF-16", () => {
  // المدى المقيس من `definition`: 11..21 على سطرٍ طولُه 20 وحدة.
  const line = 'متغير مرحبا = "أهلا"';
  assert.equal(line.length, 20);
  assert.equal(Buffer.byteLength(line, "utf8"), 34);
  assert.ok(PE.rangeProvesBytes(
    { start: { line: 0, character: 11 }, end: { line: 0, character: 21 } }, () => line));
  // ومدًى سليمٌ لا يُثبِت شيئًا — البرهانُ من طرفٍ واحدٍ فقط.
  assert.equal(PE.rangeProvesBytes(
    { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } }, () => line), false);
});

test("[SAD-08] العرّاف: لا يمسّ مدًى قبل أن يُقرَّر الترميز", () => {
  const oracle = PE.createEncodingOracle();
  assert.equal(oracle.encoding(), PE.ENC_UNKNOWN);
  const line = "اطبع(مرحبا)"; // 11 وحدة · 20 بايتًا
  const asIs = { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } };
  // 8 ≤ 11 فلا برهانَ فيه ⇒ يُردّ **كما ورد**: سلوكُنا هو سلوكُ اليوم بالضبط.
  assert.deepEqual(oracle.repair(asIs, () => line), asIs);
  assert.equal(oracle.encoding(), PE.ENC_UNKNOWN);
});

test("[SAD-08] العرّاف: يتعلّم من المخطَّط ثمّ يرمّم مدى التحويم المقيس", () => {
  const oracle = PE.createEncodingOracle();
  assert.equal(oracle.learnFromSymbols(SYMBOLS_MEASURED, lineOfMeasured), PE.ENC_BYTES);
  // المدى المقيس من `hover` لـ«اطبع»: 0..8 بالبايتات ⇒ 0..4 بالوحدات.
  const line = "اطبع(مرحبا)";
  const fixed = oracle.repair(
    { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } }, () => line);
  assert.deepEqual(fixed.end, { line: 0, character: 4 });
  assert.equal(line.slice(fixed.start.character, fixed.end.character), "اطبع");
});

test("[SAD-08] العرّاف: يتعلّم من مدًى يتجاوز سطرَه بلا مخطَّط", () => {
  const oracle = PE.createEncodingOracle();
  const line = 'متغير مرحبا = "أهلا"';
  const fixed = oracle.repair(
    { start: { line: 0, character: 11 }, end: { line: 0, character: 21 } }, () => line);
  assert.equal(oracle.encoding(), PE.ENC_BYTES);
  assert.deepEqual(fixed, { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } });
  assert.equal(line.slice(6, 11), "مرحبا");
});

test("[SAD-08] dropDegenerateSymbols: يُسقِط الرمزين الزائفين ويُبقي الحقيقيَّين", () => {
  const kept = PE.dropDegenerateSymbols(SYMBOLS_MEASURED);
  assert.equal(kept.length, 2);
  assert.deepEqual(kept.map((s) => s.name), ["مُعلِّم", "معلم"]);
  // والزائفُ المُسقَط هو **الطيُّ نفسُه يتسرّب إلى الواجهة**: «معلم» على سطر «مُعلِّم».
  assert.ok(SYMBOLS_MEASURED.some((s) => s.name === "معلم" && s.range.start.line === 0));
  assert.ok(!kept.some((s) => s.name === "معلم" && s.range.start.line === 0));
});

test("[SAD-08] toDocumentSymbols: مخطَّطٌ مرمَّمُ المديات، والاسمُ يُقتطع من موضعه", () => {
  const oracle = PE.createEncodingOracle();
  oracle.learnFromSymbols(SYMBOLS_MEASURED, lineOfMeasured);
  const syms = ext.toDocumentSymbols(SYMBOLS_MEASURED, (r) => (r ? oracle.repair(r, lineOfMeasured) : null));
  assert.equal(syms.length, 2);
  assert.deepEqual(syms.map((s) => s.name), ["مُعلِّم", "معلم"]);
  // كلُّ مدًى مختارٍ يقتطع **اسمَه** من سطره — وهذا هو معنى «مقيس».
  for (const s of syms) {
    const line = LINES_MEASURED[s.selectionRange.start.line];
    assert.equal(line.slice(s.selectionRange.start.character, s.selectionRange.end.character), s.name);
  }
});

test("[SAD-08] toDefinitionLocations: بلا `fix` يبقى السلوكُ حرفيًّا كما كان", () => {
  const raw = { uri: "file:///a.ص", range: { start: { line: 0, character: 11 }, end: { line: 0, character: 21 } } };
  const [loc] = ext.toDefinitionLocations(raw);
  assert.deepEqual(loc.range.end, { line: 0, character: 21 });
});
