// @ts-check
"use strict";
// AR-01: لوحة مخرجات عربيّة واعية بالاتّجاه (bidi). طرفيّة xterm لا تدعم bidi (قيد منبع
// موثَّق في docs/rtl/rtl-inventory.md)، وبرامج ص تطبع عربيّةً ⇒ مخرجات المستخدم تُشوَّه في
// الطرفيّة. هذه اللوحة (webview) تلتقط stdout/stderr من sad-run وتعرض **كلّ سطر** بـ
// «unicode-bidi: plaintext»: السطر يأخذ اتّجاهه من أوّل محرف قويّ فيه (عربيّ ⇐ يمين،
// لاتينيّ/أرقام ⇐ يسار) — وهو ما تعجز شبكة الطرفيّة عنه. تصبح وجهة runSadFile [AR-01].
//
// مقايضة صادقة: لوحة عرض مكمّلة لا بديل كامل للطرفيّة (تفقد ANSI/التفاعليّة؛ و\r المجرّد داخل
// السطر — أشرطة التقدّم — يبقى حرفيًّا) — تُقدَّم بهذا الوصف. أمان webview: CSP صارم + nonce،
// بلا موارد خارجيّة، والمخرجات تُمرَّر نصًّا (textContent) لا HTML.
//
// كلّ literal منطقيّ ثابت مسمّى؛ نصوص COPY (وعناوين الأزرار المضمّنة في الـHTML) نسخة واجهة
// عربيّة-أوّلًا (استثناء مقبول، أسوة بـchat.js). منطق تقطيع الأسطر (takeLines) نقيّ قابل للاختبار.

const vscode = require("vscode");
const cp = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { StringDecoder } = require("string_decoder");

// معرّف/عنوان اللوحة (مفردة — تُعاد استعمالها لكلّ تشغيل).
const PANEL_TYPE = "mihrab.sadOutput";
const PANEL_TITLE = "مخرجات ص";

// خطّ ص العربيّ المحزوم [AR-02] داخل اللوحة: الـwebview إطارٌ معزول عن وثيقة الـworkbench، فلا
// يرث @font-face المحقون هناك. لذا نُضمِّن الخطّ نفسه في هذه اللوحة كـdata: URI (إن شُحن مع
// الامتداد في media/) كي تعرض المخرجات بالخطّ المحزوم عينه لا بخطّ نظاميّ. سقوط رشيق: غيابه ⇒
// اللوحة تسقط لمكدّس خطّ عربيّ نظاميّ (كما قبلُ). أسوة بحزم أدوات ص، المصدر يُحقَن وقت البناء.
const BUNDLED_MEDIA_DIR = "media";
const FONT_FILE = "kawkab-mono.woff2";
const FONT_FAMILY = "Kawkab Mono";

// أنواع رسائل الجسر — ثوابت السلك.
const MSG_START = "start"; // ext→web: بدء تشغيل جديد (label = سطر «يشغّل: …»)
const MSG_LINES = "lines"; // ext→web: دفعة أسطر مخرجات (stream = out/err) — دفعة واحدة لكلّ حدث data
const MSG_EXIT = "exit"; // ext→web: انتهاء (label + ok)
const MSG_CLEAR = "clear"; // ext→web: تفريغ السجلّ
const MSG_STOP = "stop"; // web→ext: طلب إيقاف التشغيل الجاري
const MSG_READY = "ready"; // web→ext: الـwebview حمّل واستمع (مصافحة تمنع فقدان أوّل رسائل)

// وسما مجرى الإخراج (يحدّدان لون/نمط السطر في اللوحة).
const STREAM_OUT = "out";
const STREAM_ERR = "err";

// نوعا الإجراء (يحدّدان عنوان البدء ووسم الانتهاء: تشغيل مقابل بناء) [SAD-04].
const ACTION_RUN = "run";
const ACTION_BUILD = "build";

// إشارة إنهاء العمليّة عند الإيقاف أو الاستبدال بتشغيل أحدث. (ملاحظة منصّة: على ويندوز يقتل
// TerminateProcess العمليّة لا أحفادها — لو أطلق sad-run عمليّات فرعيّة قد تُيتَّم؛ قيد مقبول.)
const KILL_SIGNAL = "SIGTERM";

// أكواد أخطاء «فشل الإطلاق» في حدث child 'error' (لم تبدأ العمليّة أصلًا) — تُميَّز عن أخطاء
// ما-بعد-التشغيل: حدث 'error' مُهيمَن عليه بهذه (الأداة محذوفة/ممنوعة بين الفحص والإطلاق = TOCTOU).
const SPAWN_FAIL_CODES = new Set(["ENOENT", "EACCES", "EPERM"]);

// سقف احترازيّ لطابور الرسائل قبل مصافحة ready (لو لم يُنفَّذ سكربت الـwebview إطلاقًا) — backstop
// ذاكرة فقط؛ في الحالة الطبيعيّة يصل ready فورًا فلا يُبلَغ.
const MAX_PENDING = 10000;

// سقف أسطر السجلّ في الـwebview: برنامج يطبع بلا حدّ ⇒ نقصّ الأقدم كي لا يتضخّم DOM بلا حدّ
// (اللوحة مُبقاة في الذاكرة بـretainContextWhenHidden). حماية أداء لا حدّ منطقيّ للمخرجات.
const MAX_LOG_LINES = 5000;

// سقف طول السطر الواحد قبل قطعه قسرًا: مخرجات بلا فاصل سطر إطلاقًا (شريط تقدّم بـ\r، أو تدفّق
// ثنائيّ) تُراكِم في «rest» بلا حدّ ⇒ نموّ ذاكرة عمليّة الامتداد بلا سقف (backstop مفقود قبلَه).
// عند تجاوز السقف نُخرِج القطعة كسطرٍ ونُبقي الفائض للتالي. حماية ذاكرة لا حدّ منطقيّ (السطر
// الطبيعيّ أقصر بمراحل)؛ يبقى «rest» مقيّدًا بـMAX_LINE_LEN دومًا.
const MAX_LINE_LEN = 10000;

// هامش «لصق» التمرير بالبكسل: إن كان السجلّ عند أسفله (ضمن هذا الهامش) نتبع المخرجات الجديدة
// تلقائيًّا؛ وإلّا (المستخدم يقرأ سجلًّا أعلى) لا نخطف تمريره للأسفل. صغيرٌ يمتصّ تقريب البكسل فقط.
const SCROLL_STICK_PX = 4;

// نصوص الواجهة (عربيّة-أوّلًا = بيانات واجهة).
const COPY = {
  running: (f) => `يشغّل: ${f}`,
  building: (f) => `يبني: ${f}`,
  exitOk: "انتهى البرنامج بنجاح (رمز الخروج ٠).",
  exitFail: (c) => `انتهى البرنامج برمز خروج ${c}.`,
  buildOk: "تمّت الترجمة بنجاح.",
  buildFail: (c) => `فشلت الترجمة برمز ${c}.`,
  exitSignal: (s) => `أُنهي التشغيل بالإشارة ${s}.`,
  exitError: "توقّف التشغيل بخطأ.",
  stopped: "أُوقِف التشغيل.",
  spawnFail: (e) => `تعذّر بدء التشغيل: ${e}`,
  procError: (e) => `خطأ في التشغيل: ${e}`,
  notStarted: "لم يبدأ التشغيل.",
};

// ───────────────────────── منطق نقيّ (بلا vscode) ─────────────────────────

/**
 * يقطّع نصًّا متدفّقًا إلى أسطر كاملة + بقيّة (السطر الجزئيّ الأخير بلا فاصل سطر بعدُ).
 * يُمرَّر إليه ما تبقّى من الدفعة السابقة (prev) فيصل الأجزاء المقسومة عبر حدود الدفعات.
 * يُزال CR الزائد (\r) من نهايات ويندوز كي لا يظهر محرفًا شاذًّا في اللوحة.
 * backstop اختياريّ: إن تجاوزت البقيّة maxLineLen (سطر بلا فاصل يتضخّم بلا حدّ) نقطعها قسرًا
 * إلى أسطر بطول السقف كي تبقى «rest» مقيّدة ولا تنمو ذاكرة العمليّة بلا حدّ. صفر/غياب ⇒ بلا قطع.
 * @param {string} prev @param {string} chunk @param {number} [maxLineLen]
 * @returns {{ lines: string[], rest: string }}
 */
function takeLines(prev, chunk, maxLineLen) {
  const combined = prev + chunk;
  const parts = combined.split("\n");
  let rest = parts.pop() || ""; // آخر جزء: بقيّة (فارغ إن انتهى النصّ بـ\n)
  const lines = parts.map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  // قطع قسريّ للسطر المتضخّم بلا فاصل (backstop ذاكرة) — يبقى «rest» ≤ maxLineLen دومًا.
  while (maxLineLen && rest.length > maxLineLen) {
    lines.push(rest.slice(0, maxLineLen));
    rest = rest.slice(maxLineLen);
  }
  return { lines, rest };
}

// ───────────────────────── طبقة webview/العمليّة ─────────────────────────

/** يولّد nonce تشفيريًّا لسياسة CSP (لا يُخمَّن) — أسوة بـchat.js. */
function makeNonce() {
  return crypto.randomBytes(16).toString("base64");
}

/**
 * يقرأ الخطّ العربيّ المحزوم من media/ داخل الامتداد ويُرجعه data: URI (base64) لتضمينه في
 * @font-face اللوحة، أو null إن غاب (سقوط رشيق). يُقرأ مرّةً عند إنشاء اللوحة لا لكلّ رسم.
 * @param {vscode.ExtensionContext} [context] @returns {string|null}
 */
function loadBundledFontDataUri(context) {
  if (!context || !context.extensionPath) return null;
  try {
    const p = path.join(context.extensionPath, BUNDLED_MEDIA_DIR, FONT_FILE);
    if (!fs.statSync(p).isFile()) return null;
    return "data:font/woff2;base64," + fs.readFileSync(p).toString("base64");
  } catch {
    return null; // لا خطّ محزوم — تسقط اللوحة لمكدّس الخطّ النظاميّ
  }
}

/**
 * يبني HTML اللوحة (RTL، CSP صارم، nonce). الهيكل فقط: كلّ نصّ مخرجات يصل عبر رسائل ويُدرَج
 * كـtextContent (لا حقن HTML من مخرجات البرنامج). جوهر AR-01 في CSS: «.line { unicode-bidi:
 * plaintext; text-align: start }» — لكلّ سطر اتّجاهه المستقلّ حسب محتواه. يبثّ «ready» عند
 * التحميل كي لا تُفقَد أوّل رسائل (START/CLEAR) قبل تسجيل المستمع.
 * fontDataUri (إن مُرِّر) ⇒ @font-face للخطّ المحزوم داخل اللوحة + font-src data: في CSP.
 * @param {string|null} [fontDataUri]
 */
function buildHtml(fontDataUri) {
  const nonce = makeNonce();
  const csp = [
    "default-src 'none'",
    // نسمح بمصدر خطّ data: فقط حين نُضمِّن الخطّ المحزوم (وإلّا لا مصدر خطّ خارجيّ إطلاقًا).
    fontDataUri ? "font-src data:" : "font-src 'none'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");
  // @font-face للخطّ المحزوم (Kawkab Mono) مُضمَّن كـdata: URI — يجعل اللوحة تعرض بالخطّ المحزوم
  // عينه لا بخطّ نظاميّ (الـwebview معزول عن @font-face وثيقة الـworkbench). فارغ عند غيابه.
  const fontFace = fontDataUri
    ? `\n  @font-face { font-family: "${FONT_FAMILY}"; font-style: normal; font-weight: 400; font-display: swap; src: url("${fontDataUri}") format("woff2"); }`
    : "";
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<style nonce="${nonce}">${fontFace}
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 0; height: 100vh; display: flex; flex-direction: column;
         color: var(--vscode-foreground); background: var(--vscode-panel-background, var(--vscode-editor-background)); }
  #head { display: flex; align-items: center; gap: 8px; padding: 6px 12px;
          border-bottom: 1px solid var(--vscode-panel-border); font-size: 12px; }
  #file { flex: 1; opacity: 0.85; unicode-bidi: plaintext; text-align: start;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #stop { font-family: inherit; padding: 3px 12px; border: none; border-radius: 6px; cursor: pointer;
          background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  #stop[hidden] { display: none; }
  /* الخطّ: الخطّ المحزوم (Kawkab Mono) أوّلًا حين يُضمَّن @font-face أعلاه (اللوحة تعرض
     بالخطّ المحزوم عينه)، ثمّ إعداد محرّر AR-02 (يكشف VSCode --vscode-editor-font-family
     للـwebview)، ثمّ احتياطيّ واعٍ بالعربيّة (Segoe UI/Noto Sans Arabic) لئلّا تسقط لخطّ
     لاتينيّ صرف لو غاب الخطّ المحزوم والمتغيّر معًا. */
  #log { flex: 1; overflow: auto; margin: 0; padding: 8px 12px;
         font-family: "${FONT_FAMILY}", var(--vscode-editor-font-family, ui-monospace, "Cascadia Mono", Consolas, "Segoe UI", "Noto Sans Arabic", monospace);
         font-size: var(--vscode-editor-font-size, 13px); line-height: 1.5; }
  /* جوهر AR-01: كلّ سطر يأخذ اتّجاهه من أوّل محرف قويّ فيه (عربيّ⇐يمين، لاتينيّ/أرقام⇐يسار). */
  .line { unicode-bidi: plaintext; text-align: start; white-space: pre-wrap; word-break: break-word; min-height: 1.2em; }
  .line.err { color: var(--vscode-errorForeground); }
  .sys { opacity: 0.85; font-style: italic; }
  .sys.ok { color: var(--vscode-testing-iconPassed, var(--vscode-charts-green, inherit)); }
  .sys.bad { color: var(--vscode-errorForeground); }
</style>
</head>
<body>
  <div id="head"><span id="file"></span><button id="stop" hidden>أوقِف</button></div>
  <div id="log"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const log = document.getElementById('log');
  const fileEl = document.getElementById('file');
  const stop = document.getElementById('stop');
  const MAX = ${MAX_LOG_LINES};
  const STICK_PX = ${SCROLL_STICK_PX};

  // هل السجلّ عند أسفله (ضمن الهامش)؟ يُقاس **قبل** الإضافة كي نقرّر لصق التمرير.
  function nearBottom() {
    return log.scrollHeight - log.scrollTop - log.clientHeight <= STICK_PX;
  }

  // يضيف دفعة أسطر بصنف واحد: تمريرة تخطيط واحدة (لا خطف تمرير لكلّ سطر)، ولصق تمرير لاصق —
  // نتبع الأسفل تلقائيًّا فقط إن كان المستخدم عنده، وإلّا نحترم موضع قراءته أعلى.
  function append(texts, cls) {
    const stick = nearBottom();
    for (const t of texts) {
      const d = document.createElement('div');
      d.className = cls;
      d.textContent = t; // نصّ فقط — لا حقن HTML من مخرجات البرنامج
      log.appendChild(d);
    }
    // قصّ الأقدم فوق السقف (حماية أداء من مخرجات لا حدّ لها).
    while (log.childElementCount > MAX) log.removeChild(log.firstChild);
    if (stick) log.scrollTop = log.scrollHeight;
  }

  stop.addEventListener('click', () => vscode.postMessage({ type: '${MSG_STOP}' }));

  window.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === '${MSG_CLEAR}') {
      log.textContent = '';
    } else if (m.type === '${MSG_START}') {
      fileEl.textContent = m.label || '';
      stop.hidden = false;
    } else if (m.type === '${MSG_LINES}') {
      const cls = 'line ' + (m.stream === '${STREAM_ERR}' ? 'err' : 'out');
      append(m.lines, cls);
    } else if (m.type === '${MSG_EXIT}') {
      append([m.label], 'line sys ' + (m.ok ? 'ok' : 'bad'));
      stop.hidden = true;
    }
  });
  // مصافحة: أبلِغ الامتداد أنّ المستمع جاهز كي يبثّ الرسائل المؤجّلة (START/CLEAR أوّل تشغيل).
  vscode.postMessage({ type: '${MSG_READY}' });
</script>
</body>
</html>`;
}

/**
 * لوحة مخرجات ص العربيّة: تملك webview مفردًا وتبثّ إليه مخرجات عمليّة sad-run حيًّا. تُنشأ
 * كسولًا عند أوّل تشغيل، وتُعاد استعمالها. دورة الحياة يديرها المُستدعِي (extension.activate)
 * عبر context.subscriptions (dispose يقتل أيّ عمليّة ويغلق اللوحة).
 */
class SadOutputPanel {
  /** @param {vscode.ExtensionContext} [context] لقراءة الخطّ العربيّ المحزوم من media/ (اختياريّ). */
  constructor(context) {
    /** @type {vscode.WebviewPanel | null} */
    this._panel = null;
    /** @type {import('child_process').ChildProcess | null} */
    this._proc = null;
    /** @type {vscode.Disposable | undefined} */
    this._msgSub = undefined;
    // مصافحة التحميل: قبل «ready» تُصفّ الرسائل في _pending كي لا تُفقَد.
    this._ready = false;
    /** @type {object[]} */
    this._pending = [];
    // الخطّ المحزوم كـdata: URI (يُقرأ مرّةً؛ null إن غاب ⇒ سقوط رشيق لمكدّس الخطّ النظاميّ).
    this._fontDataUri = loadBundledFontDataUri(context);
    this._disposed = false;
  }

  /** يُنشئ اللوحة عند الحاجة (كسولًا) ويربط جسر الرسائل ودورة الإغلاق. */
  _ensurePanel() {
    if (this._panel) return this._panel;
    this._ready = false;
    this._pending = [];
    const panel = vscode.window.createWebviewPanel(
      PANEL_TYPE,
      PANEL_TITLE,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      // localResourceRoots: [] تشديد دفاعيّ — لا موارد محلّيّة تُحمَّل إطلاقًا (CSP أصلًا
      // default-src 'none'، والهيكل بلا src خارجيّ)؛ يمنع أيّ تحميل ملفّ محلّيّ لو تسرّب مرجع.
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [] },
    );
    panel.webview.html = buildHtml(this._fontDataUri);
    this._msgSub = panel.webview.onDidReceiveMessage((m) => {
      if (!m || typeof m !== "object") return;
      if (m.type === MSG_READY) {
        this._ready = true;
        const queued = this._pending;
        this._pending = [];
        for (const msg of queued) void panel.webview.postMessage(msg);
      } else if (m.type === MSG_STOP) {
        this.stop();
      }
    });
    panel.onDidDispose(() => {
      this._panel = null;
      this._ready = false;
      this._pending = [];
      if (this._msgSub) this._msgSub.dispose();
      this._killProc(); // إغلاق اللوحة يقتل التشغيل الجاري (لا عمليّة يتيمة بلا وجهة عرض)
    });
    this._panel = panel;
    return panel;
  }

  /** يرسل رسالةً للّوحة، ويصفّها قبل جاهزيّة الـwebview (مصافحة ready) كي لا تُفقَد. */
  _post(message) {
    if (!this._panel) return;
    if (!this._ready) {
      this._pending.push(message);
      if (this._pending.length > MAX_PENDING) this._pending.shift();
      return;
    }
    void this._panel.webview.postMessage(message);
  }

  /** يقتل العمليّة الجارية (إن وُجدت) ويصفّر المرجع. */
  _killProc() {
    if (this._proc) {
      try {
        this._proc.kill(KILL_SIGNAL);
      } catch {
        // العمليّة انتهت أصلًا — تجاهل.
      }
      this._proc = null;
    }
  }

  /** يوقف التشغيل الجاري بطلب المستخدم (زرّ «أوقِف»). */
  stop() {
    if (!this._proc) return;
    this._killProc(); // يصفّر _proc ⇒ حرّاس close/data أدناه يتجاهلون أحداث العمليّة المقتولة
    this._post({ type: MSG_EXIT, label: COPY.stopped, ok: false });
  }

  /**
   * يشغّل الأمر ويبثّ مخرجاته للّوحة (بديل الطرفيّة، bidi صحيح لكلّ سطر). يستبدل أيّ تشغيل
   * سابق. يفكّ ترميز UTF-8 عبر حدود الدفعات (StringDecoder) ويقطّع الأسطر نقيًّا (takeLines).
   * action ∈ {run, build} يحدّد عنوان البدء ووسم الانتهاء (تشغيل مقابل ترجمة) [SAD-04].
   * @param {string} cmd @param {string[]} args @param {string} cwd @param {string} fileLabel
   * @param {"run"|"build"} [action]
   */
  run(cmd, args, cwd, fileLabel, action) {
    if (this._disposed) return;
    const isBuild = action === ACTION_BUILD;
    this._killProc(); // استبدل أيّ تشغيل سابق قبل بدء الجديد
    const panel = this._ensurePanel();
    panel.reveal(vscode.ViewColumn.Beside, true);
    this._post({ type: MSG_CLEAR });
    this._post({ type: MSG_START, label: (isBuild ? COPY.building : COPY.running)(fileLabel) });

    let proc;
    try {
      proc = cp.spawn(cmd, args, { cwd, windowsHide: true });
    } catch (e) {
      this._post({ type: MSG_LINES, stream: STREAM_ERR, lines: [COPY.spawnFail(errText(e))] });
      this._post({ type: MSG_EXIT, label: COPY.notStarted, ok: false });
      return;
    }
    this._proc = proc;

    const outDec = new StringDecoder("utf8");
    const errDec = new StringDecoder("utf8");
    const outRef = { rest: "" };
    const errRef = { rest: "" };

    // يفكّ الترميز، يقطّع الأسطر الكاملة، ويبثّها دفعةً واحدة؛ يحتفظ بالسطر الجزئيّ للدفعة
    // التالية. حارس `_proc !== proc`: أسطر عمليّة استُبدلت/أُوقِفت وصلت متأخّرةً لا تُلوّث تشغيلًا آخر.
    const pump = (buf, dec, stream, ref) => {
      if (this._proc !== proc) return;
      const { lines, rest } = takeLines(ref.rest, dec.write(buf), MAX_LINE_LEN);
      ref.rest = rest;
      if (lines.length) this._post({ type: MSG_LINES, stream, lines });
    };
    // يبثّ ما تبقّى (سطر أخير بلا فاصل) عند انتهاء العمليّة.
    const flushTail = (dec, stream, ref) => {
      const tail = ref.rest + dec.end();
      ref.rest = "";
      const line = tail.endsWith("\r") ? tail.slice(0, -1) : tail;
      if (line) this._post({ type: MSG_LINES, stream, lines: [line] });
    };

    if (proc.stdout) proc.stdout.on("data", (b) => pump(b, outDec, STREAM_OUT, outRef));
    if (proc.stderr) proc.stderr.on("data", (b) => pump(b, errDec, STREAM_ERR, errRef));

    proc.on("error", (e) => {
      if (this._proc !== proc) return; // استُبدل/أُوقِف ⇒ تجاهل
      // حدث 'error' مُهيمَن عليه بفشل الإطلاق (ENOENT/EACCES) ⇒ «لم يبدأ»؛ وإلّا خطأ ما-بعد-التشغيل.
      const failedToStart = !!(e && SPAWN_FAIL_CODES.has(e.code));
      this._post({
        type: MSG_LINES,
        stream: STREAM_ERR,
        lines: [(failedToStart ? COPY.spawnFail : COPY.procError)(errText(e))],
      });
      this._post({ type: MSG_EXIT, label: failedToStart ? COPY.notStarted : COPY.exitError, ok: false });
      this._proc = null;
    });
    proc.on("close", (code, signal) => {
      if (this._proc !== proc) return; // استُبدل بتشغيل أحدث أو أُوقِف يدويًّا ⇒ تجاهل
      flushTail(outDec, STREAM_OUT, outRef);
      flushTail(errDec, STREAM_ERR, errRef);
      let label;
      if (signal) label = COPY.exitSignal(signal);
      else if (isBuild) label = code === 0 ? COPY.buildOk : COPY.buildFail(code);
      else label = code === 0 ? COPY.exitOk : COPY.exitFail(code);
      this._post({ type: MSG_EXIT, label, ok: code === 0 && !signal });
      this._proc = null;
    });
  }

  /** إغلاق: يقتل العمليّة ويغلق اللوحة. */
  dispose() {
    this._disposed = true;
    this._killProc();
    if (this._panel) this._panel.dispose();
    this._panel = null;
  }
}

/** يستخلص نصّ خطأ مقروءًا من كائن خطأ (رسالة إن وُجدت). */
function errText(e) {
  return String(e && e.message ? e.message : e);
}

module.exports = {
  SadOutputPanel,
  takeLines,
  buildHtml,
  loadBundledFontDataUri,
  COPY,
  MAX_LOG_LINES,
  MAX_LINE_LEN,
  FONT_FAMILY,
  FONT_FILE,
  BUNDLED_MEDIA_DIR,
  ACTION_RUN,
  ACTION_BUILD,
};
