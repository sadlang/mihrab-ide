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
const CP = { spawns: [], throwOnSpawn: null, real: false };

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

// [م٧] `child_process` الحقيقيّ: البادئة `node:` لا يعترضها الخطّافُ أدناه. يُستعمل في وضع
// `CP.real` وحدَه — لأنّ الأنابيبَ والمؤقّتاتِ **هي** المحروس هناك، فبديلٌ يبثّ متى شئنا
// يقيس محاكاتَنا لا سلوكَ العقدة. وما عداه يبقى بديلًا: أسرعُ وأدقُّ تحكّمًا.
const realCp = require("node:child_process");

const cpStub = {
  spawn(cmd, args, opts) {
    if (CP.throwOnSpawn) throw CP.throwOnSpawn;
    if (CP.real) {
      const rp = realCp.spawn(cmd, args, opts);
      CP.spawns.push({ cmd, args, opts, proc: rp });
      return rp;
    }
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
  usesStdinRead,
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
    fs.writeFileSync(npath.join(dir, "media", "kawkab-mono.woff2"), Buffer.from("wOF2-fake-bytes"));
  }
  return { context: { extensionPath: dir }, dir };
}

function reset() {
  S.panels = [];
  S.autoReady = true;
  CP.spawns = [];
  CP.throwOnSpawn = null;
  CP.real = false;
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

// ‏[PR-01] العيّنةُ تبدأ ببصمة «wOF2» لا «wOFF»: صار المُحمِّلُ يفحص بصمةَ الصيغة، لأنّ
// ‏`readFileSync` ينجح على ملفٍّ مقتطعٍ وعلى كعبٍ فارغ، و«الحمولةُ موجودة» تأكيدٌ ينجح
// عليهما معًا. والفحصُ في `bundled-font.js` مشتركٌ بين هذا السطح وتصدير الطباعة.
test("loadBundledFontDataUri: خطّ حاضر ⇒ data:font/woff2;base64 من بايتات الملفّ", () => {
  const { context, dir } = fakeCtxWithFont(true);
  try {
    const uri = loadBundledFontDataUri(context);
    assert.ok(uri && uri.startsWith("data:font/woff2;base64,"));
    // البايتات المُرمَّزة تطابق الملفّ.
    assert.ok(uri.includes(Buffer.from("wOF2-fake-bytes").toString("base64")));
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

test("استبدال تشغيل جارٍ ⇒ سطر «أُوقِف التشغيل السابق» (لا مسح صامت) [تدقيق #3]", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/a.ص"], "/dir", "a.ص");
  panel.run("sad-run", ["/b.ص"], "/dir", "b.ص"); // الأوّل ما زال حيًّا ⇒ استبدال
  assert.ok(lineTexts(lastPanel(), "out").includes(COPY.replacedPrev), "أُعلِم المستخدم بالاستبدال");
  panel.dispose();
});

test("أوّل تشغيل (لا سابق حيّ) ⇒ بلا «أُوقِف التشغيل السابق»", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
  assert.ok(!lineTexts(lastPanel(), "out").includes(COPY.replacedPrev));
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

// ─────────── [م٧] السطرُ الحيُّ المفتوح ومسارُ الدخل ───────────

// ── المسحُ الساكن (نقيّ) ──

test("usesStdinRead: استدعاء «اقرأ» حرٌّ ⇒ صحيح", () => {
  assert.equal(usesStdinRead('متغير أ = اقرأ("العدد: ")'), true);
  assert.equal(usesStdinRead("متغير أ = اقرأ()"), true);
  assert.equal(usesStdinRead("اقرأ ()"), true, "فراغ قبل القوس");
});

test("usesStdinRead: استدعاءُ عضوٍ (نقطة قبله) ⇒ خطأ — «إ2.اقرأ(...)» شيءٌ آخر", () => {
  assert.equal(usesStdinRead("متغير س = إ2.اقرأ(٣)"), false);
});

test("usesStdinRead: داخل نصٍّ حرفيّ أو تعليق ⇒ خطأ (لا سطرَ نظامٍ بلا سبب)", () => {
  assert.equal(usesStdinRead('اطبع("استعمل اقرأ() هنا")'), false, "نصّ حرفيّ");
  assert.equal(usesStdinRead("# في التطبيق الحقيقيّ: لرقم(اقرأ())"), false, "تعليق #");
  assert.equal(usesStdinRead("// اقرأ()"), false, "تعليق //");
});

test("usesStdinRead: بلا نصّ أو بلا استدعاء ⇒ خطأ", () => {
  assert.equal(usesStdinRead(undefined), false);
  assert.equal(usesStdinRead('اطبع_سطر("مرحبا")'), false);
});

// ── مجرى الدخل وسطرُ النظام (ببديل) ──

test("run: يُطلق العمليّة بدخلٍ مُغلَق (stdio) — لا أنبوبَ ينتظر أبدًا [م٧]", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص");
  assert.deepEqual(CP.spawns[0].opts.stdio, ["ignore", "pipe", "pipe"]);
  panel.dispose();
});

test("run: ملفٌّ يستدعي «اقرأ» ⇒ سطرُ نظامٍ قبل حكمِ الخروج (لا «نجاحٌ» صامت) [م٧]", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص", "run", 'متغير أ = اقرأ("الاسم: ")');
  lastProc().emit("close", 0, null);
  const p = lastPanel();
  const notes = messagesOfType(p, "note");
  assert.equal(notes.length, 1);
  assert.equal(notes[0].label, COPY.noStdin);
  assert.ok(
    p.posted.indexOf(notes[0]) < p.posted.indexOf(messagesOfType(p, "exit")[0]),
    "سطرُ النظام يسبق حكمَ الخروج"
  );
  panel.dispose();
});

test("run: ملفٌّ لا يستدعي «اقرأ» ⇒ بلا سطرِ نظام (لا ضجيجَ على من لم يسأل) [م٧]", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص", "run", 'اطبع_سطر("مرحبا")');
  lastProc().emit("close", 0, null);
  assert.equal(messagesOfType(lastPanel(), "note").length, 0);
  panel.dispose();
});

test("run(build): «اقرأ» في النصّ ⇒ بلا سطرِ نظام (البناءُ لا يشغّل) [م٧]", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-build", ["/f.ص"], "/dir", "f.ص", "build", "متغير أ = اقرأ()");
  lastProc().emit("close", 0, null);
  assert.equal(messagesOfType(lastPanel(), "note").length, 0);
  panel.dispose();
});

test("run: إنهاءٌ بإشارة ⇒ بلا سطرِ نظام (لم يكمل، فلا حكمَ على قراءته) [م٧]", () => {
  reset();
  const panel = new SadOutputPanel();
  panel.run("sad-run", ["/f.ص"], "/dir", "f.ص", "run", "متغير أ = اقرأ()");
  lastProc().emit("close", null, "SIGTERM");
  assert.equal(messagesOfType(lastPanel(), "note").length, 0);
  panel.dispose();
});

// ── السطرُ الحيُّ المفتوح (بعمليّةٍ حقيقيّة) ──
//
// هنا **لا يجوز** البديل: المحروسُ مؤقّتُ خمولٍ يقرأ أحداثَ أنبوبٍ حقيقيّ، فبديلٌ نبثّ فيه
// متى شئنا يقيس محاكاتَنا لا سلوكَ العقدة. ولا يصلح L3 حيٌّ أيضًا: لا `sad-run` مدمجٌ ولا
// على المسار، فالحارسُ سيتخطّى نفسَه — والتخطّي يُقرأ نجاحًا، وهو الأخضرُ الكاذبُ عينُه.

// ── مِقياسُ الـDOM: تشغيلُ نصّ الـwebview فعلًا ──
//
// **هذا الحارسُ وُلد من أخضرَ كاذبٍ شُوهد.** أوّلُ صياغةٍ للذراع الضابطة قاست **الرسائلَ**
// المبثوثة، فاخضرّت على تنفيذٍ مُشظٍّ عمدًا — لأنّ التشظّي يقع في نصّ الـwebview لا في
// الرسائل: المُضيفُ يبثّ `partial` نفسَها، والفرقُ كلُّه فيما يفعله المتلقّي بها. فما
// لا يُنفَّذ لا يُحرَس، ولو كان مكتوبًا في ملفٍّ نقرؤه. لذا يُستخرَج البرنامجُ المضمَّنُ
// ويُشغَّل فوق DOM أدنى، ويُقاس **ما يُرسَم**: عدَدُ العناصر ونصوصُها.

/** يستخرج جسمَ البرنامج المضمَّن من HTML اللوحة (البرنامجُ الوحيدُ فيها). */
function extractInlineScript(html) {
  const m = html.match(/<script nonce="[^"]*">([\s\S]*?)<\/script>/);
  assert.ok(m, "وُجد برنامجٌ مضمَّنٌ واحد");
  return m[1];
}

/** عنصرُ DOM أدنى: ما يمسّه برنامجُ اللوحة لا أكثر. */
function makeEl(tag) {
  const el = {
    tagName: tag,
    className: "",
    hidden: false,
    style: {},
    attrs: {},
    children: [],
    _text: "",
    scrollTop: 0,
    clientHeight: 100,
    setAttribute(k, v) {
      el.attrs[k] = v;
    },
    appendChild(c) {
      el.children.push(c);
      c.parent = el;
      return c;
    },
    removeChild(c) {
      el.children = el.children.filter((x) => x !== c);
      return c;
    },
    remove() {
      if (el.parent) el.parent.removeChild(el);
    },
    addEventListener() {},
    get childElementCount() {
      return el.children.length;
    },
    get firstChild() {
      return el.children[0];
    },
    get scrollHeight() {
      return el.children.length * 20;
    },
    get textContent() {
      return el.children.length ? el.children.map((c) => c.textContent).join("") : el._text;
    },
    set textContent(v) {
      el.children = []; // إسنادُ نصٍّ يمسح الأبناء (كما في DOM الحقيقيّ)
      el._text = v;
    },
  };
  return el;
}

/**
 * يبني اللوحةَ في DOM أدنى ويعيد مقابضَها: `send(msg)` يحاكي رسالةً من المُضيف،
 * و`lines()` نصوصُ عناصر السجلّ المرسومة فعلًا.
 */
function mountWebview() {
  const els = { log: makeEl("div"), empty: makeEl("div"), file: makeEl("span"), stop: makeEl("button") };
  const doc = {
    body: makeEl("body"),
    getElementById: (id) => ({ log: els.log, empty: els.empty, file: els.file, stop: els.stop })[id],
    createElement: (t) => (t === "canvas" ? Object.assign(makeEl(t), { getContext: () => null }) : makeEl(t)),
  };
  const handlers = [];
  const win = { addEventListener: (t, h) => t === "message" && handlers.push(h) };
  const posted = [];
  const api = () => ({ postMessage: (m) => posted.push(m) });
  // eslint-disable-next-line no-new-func
  new Function("window", "document", "acquireVsCodeApi", extractInlineScript(buildHtml()))(win, doc, api);
  return {
    els,
    posted,
    send: (m) => handlers.forEach((h) => h({ data: m })),
    lines: () => els.log.children.map((c) => c.textContent),
  };
}

test("[م٧] الـDOM: طردةٌ حيّةٌ تُحدَّث **في مكانها** ثمّ يحلّ محلَّها السطرُ المكتمل", () => {
  const w = mountWebview();
  w.send({ type: "start", label: "يشغّل: f.ص" });
  w.send({ type: "partial", stream: "out", text: "أ" });
  w.send({ type: "partial", stream: "out", text: "أب" });
  w.send({ type: "partial", stream: "out", text: "أبج" });
  assert.deepEqual(w.lines(), ["أبج"], "عنصرٌ واحدٌ يُحدَّث لا ثلاثةُ عناصر");
  w.send({ type: "lines", stream: "out", lines: ["أبج"] });
  assert.deepEqual(w.lines(), ["أبج"], "السطرُ المكتملُ حلّ محلَّ الحيّ — لا تكرار");
});

test("[م٧] الـDOM: السطرُ الحيُّ يُستثنى من البثّ الحيّ (aria-live=off) حتّى يكتمل", () => {
  const w = mountWebview();
  w.send({ type: "partial", stream: "out", text: "س: " });
  assert.equal(w.els.log.children[0].attrs["aria-live"], "off");
  w.send({ type: "lines", stream: "out", lines: ["س: تمّ"] });
  assert.equal(w.els.log.children[0].attrs["aria-live"], undefined, "المكتملُ يُعلَن (لا استثناء)");
});

test("[م٧] الـDOM: تفريغُ السجلّ يُسقِط مرجعَ السطر الحيّ (لا كتابةَ في عنصرٍ مُزال)", () => {
  const w = mountWebview();
  w.send({ type: "partial", stream: "out", text: "قديم" });
  w.send({ type: "clear" });
  w.send({ type: "partial", stream: "out", text: "جديد" });
  assert.deepEqual(w.lines(), ["جديد"]);
});

test("[م٧] الـDOM: سطرُ النظام يُرسَم بنمط sys (لا يُقرأ مخرَجَ برنامج)", () => {
  const w = mountWebview();
  w.send({ type: "note", label: COPY.noStdin });
  assert.deepEqual(w.lines(), [COPY.noStdin]);
  assert.match(w.els.log.children[0].className, /\bsys\b/);
});

test("منطقةُ السجلّ مُعلَنةٌ في الهيكل (role=log + aria-live)", () => {
  const html = buildHtml();
  assert.match(html, /id="log"[^>]*role="log"/);
  assert.match(html, /id="log"[^>]*aria-live="polite"/);
});

/** ينتظر وصولَ رسالة `exit` إلى اللوحة (أو يفشل بمهلة). */
function waitForExit(fakePanel, ms = 8000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (messagesOfType(fakePanel, "exit").length) {
        clearInterval(iv);
        resolve(undefined);
      } else if (Date.now() - t0 > ms) {
        clearInterval(iv);
        reject(new Error("مهلة: لم تصل رسالةُ الخروج"));
      }
    }, 20);
  });
}

test("[م٧] موجِبة: رسالةٌ بلا فاصلِ سطرٍ تُعرَض أثناء التشغيل لا عند نهايته", async () => {
  reset();
  CP.real = true;
  const panel = new SadOutputPanel();
  // يكتب سؤالًا بلا `\n` (كما يفعل «اقرأ» في المفسّر) ثمّ يصمت طويلًا قبل أن يخرج.
  panel.run(process.execPath, ["-e", 'process.stdout.write("س: "); setTimeout(() => {}, 700);'], process.cwd(), "ask.ص");
  const p = lastPanel();
  await waitForExit(p);
  const partials = messagesOfType(p, "partial");
  assert.ok(partials.length >= 1, "وصلت طردةُ سطرٍ حيّ");
  assert.equal(partials[0].text, "س: ");
  assert.ok(
    p.posted.indexOf(partials[0]) < p.posted.indexOf(messagesOfType(p, "exit")[0]),
    "الطردةُ سبقت الخروج — أي أنّ المستخدمَ رأى سؤالَه قبل أن ينتهي البرنامج"
  );
  panel.dispose();
});

test("[م٧] ضابطة: أجزاءٌ متباعدةٌ ٤٠٠ م.ث ⇒ سطرٌ واحدٌ موصول لا ثلاثُ شظايا", async () => {
  reset();
  CP.real = true;
  const panel = new SadOutputPanel();
  // الفواصلُ **فوق** مهلة الخمول عمدًا: هذه هي الحالةُ التي يشظّيها أرخصُ تنفيذ (طردٌ
  // كسطرٍ جديد)، وكلُّ شظيّةٍ تستقلّ باتّجاهها تحت `unicode-bidi: plaintext` ⇒ AR-01 يُهدَم،
  // والنسخُ يعطي ثلاثةَ أسطر. فواصلُ ٢٠ م.ث كانت ستمرّ على التنفيذ الرديء أيضًا.
  const src =
    'const w = ["أ", "ب", "ج"]; let i = 0;' +
    "const t = setInterval(() => { if (i < w.length) process.stdout.write(w[i++]);" +
    ' else { clearInterval(t); process.stdout.write("\\n"); } }, 400);';
  panel.run(process.execPath, ["-e", src], process.cwd(), "slow.ص");
  const p = lastPanel();
  await waitForExit(p);
  assert.deepEqual(lineTexts(p, "out"), ["أبج"], "سطرٌ واحدٌ موصول");
  const partials = messagesOfType(p, "partial");
  assert.ok(partials.length >= 2, "تحدّث السطرُ الحيُّ أثناء الانتظار (لا احتجازَ حتّى النهاية)");
  assert.equal(partials[partials.length - 1].text, "أبج", "آخرُ طردةٍ هي السطرُ كاملًا");
  panel.dispose();
});

test("[م٧] الدخلُ المُغلَق: برنامجٌ يقرأ حتّى EOF ينتهي ولا يعلّق", async () => {
  reset();
  CP.real = true;
  const panel = new SadOutputPanel();
  const src =
    'let d = ""; process.stdin.on("data", (c) => { d += c; });' +
    'process.stdin.on("end", () => { process.stdout.write("قرأتُ:[" + d + "]\\n"); });';
  panel.run(process.execPath, ["-e", src], process.cwd(), "read.ص");
  const p = lastPanel();
  await waitForExit(p); // بلا إغلاقِ الدخل تنتهي المهلةُ هنا — وهو أحمرُ صادق
  assert.deepEqual(lineTexts(p, "out"), ["قرأتُ:[]"]);
  assert.equal(messagesOfType(p, "exit")[0].ok, true);
  panel.dispose();
});
