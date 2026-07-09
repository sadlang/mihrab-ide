// @ts-check
"use strict";
// اختبار وحدة للوحة المخرجات العربيّة [AR-01]: تقطيع الأسطر النقيّ (takeLines)، وبناء الـHTML
// (CSP + unicode-bidi:plaintext + سقف السجلّ)، وسلوك SadOutputPanel ببديلَي vscode وchild_process
// متحكَّمين (Module._load). لا vscode/عمليّة حقيقيّة. العمليّة الوهميّة EventEmitter حقيقيّ لمحاكاة البثّ.

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const { EventEmitter } = require("node:events");

// ── بديل vscode: لوحة webview تلتقط الرسائل المبثوثة والمشترِكين ──
// autoReady=true يحاكي webview محمَّلًا فورًا (يبثّ ready عند تسجيل المستمع) كي تُبثّ الرسائل
// مباشرةً؛ اختبار المصافحة يطفئه ليتحكّم بلحظة ready يدويًّا.
const S = { panels: [], autoReady: true };

function makeFakePanel() {
  const panel = {
    posted: [], // رسائل postMessage (بعد ready)
    revealed: 0,
    disposed: false,
    _msgHandler: null,
    _disposeHandler: null,
    webview: {
      html: "",
      postMessage(m) {
        panel.posted.push(m);
        return Promise.resolve(true);
      },
      onDidReceiveMessage(h) {
        panel._msgHandler = h;
        if (S.autoReady) h({ type: "ready" }); // webview محمَّل ⇒ مصافحة فوريّة
        return { dispose() {} };
      },
    },
    reveal() {
      panel.revealed++;
    },
    onDidDispose(h) {
      panel._disposeHandler = h;
      return { dispose() {} };
    },
    dispose() {
      panel.disposed = true;
      if (panel._disposeHandler) panel._disposeHandler();
    },
    // محاكاة رسالة من الـwebview (زرّ أوقِف / مصافحة ready).
    emitMessage(m) {
      if (panel._msgHandler) panel._msgHandler(m);
    },
  };
  return panel;
}

const vscodeStub = {
  ViewColumn: { Beside: -2 },
  window: {
    createWebviewPanel(type, title, showOptions, options) {
      const p = makeFakePanel();
      p.createOptions = options; // نلتقط خيارات اللوحة (localResourceRoots…) للتحقّق
      S.panels.push(p);
      return p;
    },
  },
};

// ── بديل child_process: spawn يُرجع عمليّة وهميّة يتحكّم بها الاختبار ──
const CP = { spawns: [], throwOnSpawn: null };

function makeFakeProc() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.killed = false;
  proc.killSignal = null;
  proc.kill = (sig) => {
    proc.killed = true;
    proc.killSignal = sig;
    return true;
  };
  return proc;
}

const cpStub = {
  spawn(cmd, args, opts) {
    if (CP.throwOnSpawn) throw CP.throwOnSpawn;
    const proc = makeFakeProc();
    CP.spawns.push({ cmd, args, opts, proc });
    return proc;
  },
};

const _origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "vscode") return vscodeStub;
  if (request === "child_process") return cpStub;
  return _origLoad.call(this, request, ...rest);
};

const fs = require("node:fs");
const os = require("node:os");
const npath = require("node:path");
const {
  SadOutputPanel,
  takeLines,
  buildHtml,
  loadBundledFontDataUri,
  COPY,
  MAX_LOG_LINES,
  MAX_LINE_LEN,
  FONT_FAMILY,
} = require("./output-panel.js");

// يُنشئ سياق امتداد وهميّ بمجلّد media يحوي (أو لا) ملفّ خطّ وهميّ؛ يُرجع {context, dir}.
function fakeCtxWithFont(withFont) {
  const dir = fs.mkdtempSync(npath.join(os.tmpdir(), "mihrab-font-"));
  if (withFont) {
    fs.mkdirSync(npath.join(dir, "media"), { recursive: true });
    fs.writeFileSync(npath.join(dir, "media", "kawkab-mono.woff2"), Buffer.from("wOFF-fake-bytes"));
  }
  return { context: { extensionPath: dir }, dir };
}

function reset() {
  S.panels = [];
  S.autoReady = true;
  CP.spawns = [];
  CP.throwOnSpawn = null;
}
function lastProc() {
  return CP.spawns[CP.spawns.length - 1].proc;
}
function lastPanel() {
  return S.panels[S.panels.length - 1];
}
/** الرسائل المبثوثة للّوحة الأخيرة من نوع معيّن. */
function messagesOfType(panel, type) {
  return panel.posted.filter((m) => m.type === type);
}
/** كلّ نصوص الأسطر المبثوثة لمجرى معيّن (رسائل «lines» مسطَّحة). */
function lineTexts(panel, stream) {
  return panel.posted.filter((m) => m.type === "lines" && m.stream === stream).flatMap((m) => m.lines);
}

// ─────────── takeLines (نقيّ) ───────────

test("takeLines: يقطّع الأسطر الكاملة ويحتفظ بالجزئيّ", () => {
  const r = takeLines("", "سطر١\nسطر٢\nجزء");
  assert.deepEqual(r.lines, ["سطر١", "سطر٢"]);
  assert.equal(r.rest, "جزء");
});

test("takeLines: يصل الجزء السابق مع الدفعة الجديدة عبر حدود الدفعات", () => {
  const r1 = takeLines("", "مرح");
  assert.deepEqual(r1.lines, []);
  assert.equal(r1.rest, "مرح");
  const r2 = takeLines(r1.rest, "با\n");
  assert.deepEqual(r2.lines, ["مرحبا"]);
  assert.equal(r2.rest, "");
});

test("takeLines: يزيل CR الزائد (نهايات ويندوز)", () => {
  const r = takeLines("", "a\r\nb\r\n");
  assert.deepEqual(r.lines, ["a", "b"]);
  assert.equal(r.rest, "");
});

test("takeLines: نصّ بلا فاصل سطر ⇒ لا أسطر، الكلّ بقيّة", () => {
  const r = takeLines("", "بلا فاصل");
  assert.deepEqual(r.lines, []);
  assert.equal(r.rest, "بلا فاصل");
});

test("takeLines: أسطر فارغة متتالية تُحفَظ", () => {
  const r = takeLines("", "أ\n\nب\n");
  assert.deepEqual(r.lines, ["أ", "", "ب"]);
  assert.equal(r.rest, "");
});

test("takeLines: CRLF مقسوم عبر حدود الدفعات ⇒ يُوصَل ويُزال CR (لا محرف شاذّ)", () => {
  // دفعة تنتهي بـ\r ودفعة تالية تبدأ بـ\n — يجب ألّا يبقى \r في السطر.
  const r1 = takeLines("", "سطر\r");
  assert.deepEqual(r1.lines, []);
  assert.equal(r1.rest, "سطر\r");
  const r2 = takeLines(r1.rest, "\nتالٍ");
  assert.deepEqual(r2.lines, ["سطر"]);
  assert.equal(r2.rest, "تالٍ");
});

test("takeLines: سطر بلا فاصل يتضخّم ⇒ يُقطع قسرًا عند السقف (backstop ذاكرة)", () => {
  const big = "x".repeat(MAX_LINE_LEN * 2 + 5); // ضعف السقف + فائض، بلا أيّ \n
  const r = takeLines("", big, MAX_LINE_LEN);
  assert.equal(r.lines.length, 2, "قطعتان بطول السقف");
  assert.equal(r.lines[0].length, MAX_LINE_LEN);
  assert.equal(r.lines[1].length, MAX_LINE_LEN);
  assert.equal(r.rest.length, 5, "البقيّة مقيّدة ≤ السقف");
  assert.ok(r.rest.length <= MAX_LINE_LEN);
});

test("takeLines: بلا سقف (الافتراض) لا قطع — سلوك متوافق مع النداءات ثنائيّة الوسائط", () => {
  const big = "y".repeat(MAX_LINE_LEN + 100);
  const r = takeLines("", big);
  assert.deepEqual(r.lines, []);
  assert.equal(r.rest.length, MAX_LINE_LEN + 100);
});

// ─────────── buildHtml ───────────

test("buildHtml: يحوي CSP صارمًا وnonce وجوهر bidi (unicode-bidi: plaintext) وسقف السجلّ", () => {
  const html = buildHtml();
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /nonce-/);
  assert.match(html, /unicode-bidi:\s*plaintext/);
  assert.match(html, /dir="rtl"/);
  assert.match(html, /childElementCount > /); // قصّ السقف موجود
  assert.ok(html.includes(String(MAX_LOG_LINES)));
  // لا موارد خارجيّة (لا http/src خارجيّ في الهيكل).
  assert.doesNotMatch(html, /src="https?:/);
});

test("buildHtml: كلّ استدعاء nonce مختلف (تشفيريّ)", () => {
  const a = buildHtml().match(/nonce-([^']+)'/)[1];
  const b = buildHtml().match(/nonce-([^']+)'/)[1];
  assert.notEqual(a, b);
});

test("buildHtml: يحوي meta viewport وتمريرًا لاصقًا دفعيًّا (nearBottom + STICK_PX)", () => {
  const html = buildHtml();
  assert.match(html, /name="viewport"/);
  assert.match(html, /nearBottom/); // منطق اللصق موجود
  assert.match(html, /STICK_PX/);
});

test("buildHtml: بلا خطّ محزوم ⇒ لا قاعدة @font-face وfont-src 'none'", () => {
  const html = buildHtml();
  assert.doesNotMatch(html, /@font-face\s*\{/); // قاعدة فعليّة لا مجرّد ذكرها في تعليق
  assert.match(html, /font-src 'none'/);
});

test("buildHtml: مع خطّ محزوم (data:URI) ⇒ @font-face + font-src data: + الخطّ أوّل #log", () => {
  const uri = "data:font/woff2;base64,AAAABBBB";
  const html = buildHtml(uri);
  assert.match(html, /@font-face\s*\{/);
  assert.ok(html.includes(FONT_FAMILY), "اسم العائلة المحزومة موجود");
  assert.ok(html.includes(uri), "الـdata:URI مُضمَّن في src");
  assert.match(html, /font-src data:/);
  // #log يبدأ بالخطّ المحزوم (يُفضَّل حين توفّره).
  assert.match(html, new RegExp('#log[^}]*font-family:\\s*"' + FONT_FAMILY + '"'));
});

// ─────────── loadBundledFontDataUri ───────────

test("loadBundledFontDataUri: بلا context ⇒ null", () => {
  assert.equal(loadBundledFontDataUri(undefined), null);
  assert.equal(loadBundledFontDataUri({}), null);
});

test("loadBundledFontDataUri: خطّ غائب ⇒ null (سقوط رشيق)", () => {
  const { context, dir } = fakeCtxWithFont(false);
  try {
    assert.equal(loadBundledFontDataUri(context), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadBundledFontDataUri: خطّ حاضر ⇒ data:font/woff2;base64 من بايتات الملفّ", () => {
  const { context, dir } = fakeCtxWithFont(true);
  try {
    const uri = loadBundledFontDataUri(context);
    assert.ok(uri && uri.startsWith("data:font/woff2;base64,"));
    // البايتات المُرمَّزة تطابق الملفّ.
    assert.ok(uri.includes(Buffer.from("wOFF-fake-bytes").toString("base64")));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SadOutputPanel(context): مع خطّ محزوم ⇒ HTML اللوحة يحوي @font-face المُضمَّن", () => {
  reset();
  const { context, dir } = fakeCtxWithFont(true);
  try {
    const panel = new SadOutputPanel(context);
    panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
    assert.match(lastPanel().webview.html, /@font-face\s*\{/);
    panel.dispose();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("SadOutputPanel(): بلا context ⇒ HTML بلا @font-face (سقوط رشيق)", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
  assert.doesNotMatch(lastPanel().webview.html, /@font-face\s*\{/);
  panel.dispose();
});

// ─────────── SadOutputPanel (ببديل vscode + child_process) ───────────

test("run: يفتح لوحةً ويبثّ start ثمّ أسطر stdout ثمّ exit ناجح", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
  const p = lastPanel();
  assert.equal(S.panels.length, 1, "أُنشئت لوحة واحدة");
  assert.equal(messagesOfType(p, "clear").length, 1);
  assert.equal(messagesOfType(p, "start")[0].label, COPY.running("f.ص"));

  const proc = lastProc();
  proc.stdout.emit("data", Buffer.from("مرحبا يا عالم\n", "utf8"));
  proc.emit("close", 0, null);

  assert.deepEqual(lineTexts(p, "out"), ["مرحبا يا عالم"]);
  const exit = messagesOfType(p, "exit");
  assert.equal(exit.length, 1);
  assert.equal(exit[0].ok, true);
  assert.equal(exit[0].label, COPY.exitOk);
  panel.dispose();
});

test("run: اللوحة تُنشأ بـlocalResourceRoots فارغ (تشديد: لا موارد محلّيّة)", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
  const opts = lastPanel().createOptions;
  assert.ok(opts, "التُقِطت خيارات اللوحة");
  assert.deepEqual(opts.localResourceRoots, [], "localResourceRoots = [] (لا مورد محلّيّ)");
  assert.equal(opts.enableScripts, true);
  assert.equal(opts.retainContextWhenHidden, true);
  panel.dispose();
});

test("run: سطر stdout يصل بعد close الطبيعيّ ⇒ يُتجاهَل (لا exit/سطر ثانٍ)", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
  const proc = lastProc();
  proc.stdout.emit("data", Buffer.from("أوّل\n", "utf8"));
  proc.emit("close", 0, null);
  const p = lastPanel();
  const outAfter = lineTexts(p, "out").length;
  const exitAfter = messagesOfType(p, "exit").length;
  // حدث data متأخّر بعد close (ترتيب متأخّر) — حارس _proc=null في pump يُسقِطه.
  proc.stdout.emit("data", Buffer.from("متأخّر بعد الإغلاق\n", "utf8"));
  assert.equal(lineTexts(p, "out").length, outAfter, "لا سطر بعد close");
  assert.equal(messagesOfType(p, "exit").length, exitAfter, "لا exit ثانٍ");
  panel.dispose();
});

test("run: يمرّر المسار المحلول ووسائطه ومجلّد العمل لـspawn", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("/abs/sad-run.exe", ["/f.ص"], "/dir", "f.ص");
  const s = CP.spawns[0];
  assert.equal(s.cmd, "/abs/sad-run.exe");
  assert.deepEqual(s.args, ["/f.ص"]);
  assert.equal(s.opts.cwd, "/dir");
  panel.dispose();
});

test("run: يفكّ ترميز UTF-8 المقسوم عبر دفعتين إلى محرف عربيّ سليم", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
  const proc = lastProc();
  // «ص» = 0xD8 0xB5 بـUTF-8؛ نقسمها بين دفعتين لنتحقّق من StringDecoder.
  const full = Buffer.from("ص\n", "utf8");
  proc.stdout.emit("data", full.slice(0, 1));
  proc.stdout.emit("data", full.slice(1));
  proc.emit("close", 0, null);
  assert.deepEqual(lineTexts(lastPanel(), "out"), ["ص"]);
  panel.dispose();
});

test("run: stderr يُبثّ كمجرى خطأ، ورمز خروج غير صفريّ ⇒ exit فاشل", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
  const proc = lastProc();
  proc.stderr.emit("data", Buffer.from("خطأ ما\n", "utf8"));
  proc.emit("close", 2, null);
  const p = lastPanel();
  assert.deepEqual(lineTexts(p, "err"), ["خطأ ما"]);
  const exit = messagesOfType(p, "exit")[0];
  assert.equal(exit.ok, false);
  assert.equal(exit.label, COPY.exitFail(2));
  panel.dispose();
});

test("run: إشارة إنهاء ⇒ exit بوسم الإشارة (لا نجاح)", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
  const proc = lastProc();
  proc.emit("close", null, "SIGKILL");
  const exit = messagesOfType(lastPanel(), "exit")[0];
  assert.equal(exit.ok, false);
  assert.equal(exit.label, COPY.exitSignal("SIGKILL"));
  panel.dispose();
});

test("run(build): عنوان «يبني» + exit «تمّت الترجمة» عند النجاح [SAD-04]", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-build", ["/f.ص", "-o", "/f"], "/dir", "f.ص", "build");
  const p = lastPanel();
  assert.equal(messagesOfType(p, "start")[0].label, COPY.building("f.ص"));
  lastProc().emit("close", 0, null);
  const exit = messagesOfType(p, "exit")[0];
  assert.equal(exit.label, COPY.buildOk);
  assert.equal(exit.ok, true);
  panel.dispose();
});

test("run(build): فشل الترجمة (رمز≠0) ⇒ exit «فشلت الترجمة» [SAD-04]", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-build", ["/f.ص"], "/dir", "f.ص", "build");
  lastProc().emit("close", 3, null);
  const exit = messagesOfType(lastPanel(), "exit")[0];
  assert.equal(exit.label, COPY.buildFail(3));
  assert.equal(exit.ok, false);
  panel.dispose();
});

test("run(بلا action): يبقى «يشغّل»/«انتهى البرنامج» (توافق خلفيّ)", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص"); // لا action ⇒ تشغيل
  assert.equal(messagesOfType(lastPanel(), "start")[0].label, COPY.running("f.ص"));
  lastProc().emit("close", 0, null);
  assert.equal(messagesOfType(lastPanel(), "exit")[0].label, COPY.exitOk);
  panel.dispose();
});

test("run: السطر الأخير بلا فاصل يُبثّ عند الإغلاق (flush)", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
  const proc = lastProc();
  proc.stdout.emit("data", Buffer.from("بلا سطر جديد", "utf8"));
  proc.emit("close", 0, null);
  assert.deepEqual(lineTexts(lastPanel(), "out"), ["بلا سطر جديد"]);
  panel.dispose();
});

test("run: تشغيل ثانٍ يقتل الأوّل ويعيد استعمال اللوحة نفسها", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/a.ص"], "/dir", "a.ص");
  const first = lastProc();
  panel.run("sad-run", ["/b.ص"], "/dir", "b.ص");
  assert.equal(first.killed, true, "قُتلت العمليّة الأولى");
  assert.equal(first.killSignal, "SIGTERM");
  assert.equal(S.panels.length, 1, "أُعيد استعمال اللوحة");
  // إغلاق العمليّة الأولى المتأخّر يُتجاهَل (استُبدلت) — لا exit ثانٍ منها.
  first.emit("close", 0, null);
  assert.equal(messagesOfType(lastPanel(), "exit").length, 0, "لا exit من عمليّة مستبدَلة");
  panel.dispose();
});

test("سباق: أسطر عمليّة مستبدَلة تصل متأخّرةً ⇒ تُتجاهَل (لا تلوّث التشغيل الجديد)", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/a.ص"], "/dir", "a.ص");
  const first = lastProc();
  panel.run("sad-run", ["/b.ص"], "/dir", "b.ص"); // يستبدل ويقتل الأوّل
  const p = lastPanel();
  const before = lineTexts(p, "out").length;
  first.stdout.emit("data", Buffer.from("سطر متأخّر من A\n", "utf8")); // بعد الاستبدال
  assert.equal(lineTexts(p, "out").length, before, "لم يُبثّ سطر العمليّة المستبدَلة");
  panel.dispose();
});

test("stop: زرّ الإيقاف يقتل العمليّة ويبثّ exit «أُوقِف»، وأسطر لاحقة تُتجاهَل", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
  const proc = lastProc();
  lastPanel().emitMessage({ type: "stop" });
  assert.equal(proc.killed, true);
  const p = lastPanel();
  const exit = messagesOfType(p, "exit")[0];
  assert.equal(exit.label, COPY.stopped);
  assert.equal(exit.ok, false);
  // سطر يصل بعد الإيقاف ⇒ يُتجاهَل (حارس _proc في pump).
  const n = lineTexts(p, "out").length;
  proc.stdout.emit("data", Buffer.from("متأخّر\n", "utf8"));
  assert.equal(lineTexts(p, "out").length, n, "لا سطر بعد الإيقاف");
  // إغلاق العمليّة المقتولة لاحقًا لا يُنتج exit ثانيًا.
  proc.emit("close", null, "SIGTERM");
  assert.equal(messagesOfType(p, "exit").length, 1);
  panel.dispose();
});

test("run: فشل spawn تزامنيًّا ⇒ سطر خطأ + exit «لم يبدأ»", () => {
  reset();
  CP.throwOnSpawn = new Error("EACCES");
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
  const p = lastPanel();
  assert.ok(lineTexts(p, "err").some((t) => t.includes("EACCES")));
  assert.equal(messagesOfType(p, "exit")[0].label, COPY.notStarted);
  panel.dispose();
});

test("run: حدث error بكود فشل إطلاق (ENOENT) ⇒ «لم يبدأ» (لا «توقّف بخطأ»)", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
  const proc = lastProc();
  const e = new Error("spawn ENOENT");
  // @ts-ignore
  e.code = "ENOENT";
  proc.emit("error", e);
  const p = lastPanel();
  assert.ok(lineTexts(p, "err").some((t) => t.includes("ENOENT")));
  assert.equal(messagesOfType(p, "exit")[0].label, COPY.notStarted, "فشل الإطلاق = لم يبدأ");
  panel.dispose();
});

test("run: حدث error بكود ما-بعد-التشغيل (EPIPE) ⇒ «توقّف بخطأ»", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
  const proc = lastProc();
  const e = new Error("write EPIPE");
  // @ts-ignore
  e.code = "EPIPE";
  proc.emit("error", e);
  const p = lastPanel();
  assert.ok(lineTexts(p, "err").some((t) => t.includes("EPIPE")));
  assert.equal(messagesOfType(p, "exit")[0].label, COPY.exitError, "خطأ بعد البدء = توقّف بخطأ");
  panel.dispose();
});

test("مصافحة ready: الرسائل قبل الجاهزيّة تُصفّ ثمّ تُبثّ بالترتيب", () => {
  reset();
  S.autoReady = false; // نتحكّم بلحظة ready يدويًّا
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
  const p = lastPanel();
  assert.equal(p.posted.length, 0, "لا بثّ قبل ready (مصفوف)");
  p.emitMessage({ type: "ready" });
  assert.equal(p.posted[0].type, "clear");
  assert.equal(p.posted[1].type, "start");
  panel.dispose();
});

test("dispose: يقتل العمليّة الجارية ويغلق اللوحة، ولا تشغيل بعده", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
  const proc = lastProc();
  panel.dispose();
  assert.equal(proc.killed, true);
  assert.equal(lastPanel().disposed, true);
  panel.run("sad-run", ["/g.ص"], "/dir", "g.ص"); // بعد dispose: لا شيء
  assert.equal(CP.spawns.length, 1, "لا spawn جديد بعد dispose");
});

test("onDidDispose (إغلاق المستخدم للّوحة) يقتل العمليّة الجارية", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
  const proc = lastProc();
  lastPanel().dispose(); // يحاكي إغلاق المستخدم ⇒ يُطلق onDidDispose
  assert.equal(proc.killed, true, "قُتلت العمليّة عند إغلاق اللوحة");
  panel.dispose();
});
