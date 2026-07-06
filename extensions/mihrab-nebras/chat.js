// @ts-check
"use strict";
// الميزة 2 (م2ب): لوحة دردشة نِبراس (webview عربيّة RTL). كلّ رسالة تُشغَّل كمهمّة «اشرح»
// على الملفّ النشط (سياق حقيقيّ عبر جسرَي القلب) والسؤال تعليمةً، ويُبثّ الجواب حيًّا للّوحة.
//
// طور المحادثة (م2ب+): يحمل العميل تاريخ الأدوار ويمرّره مع كلّ مهمّة (الخادم عديم الحالة)
// فيُبقي النموذج السياق عبر الأدوار. أمان webview: CSP صارم + nonce، بلا موارد خارجيّة،
// والمحتوى يُمرَّر كنصّ (لا HTML من النموذج).

const vscode = require("vscode");
const path = require("path");
const crypto = require("crypto");

const SAD_LANG_ID = "sad";
const SAD_EXT = ".ص";
const TASK_EXPLAIN = "اشرح";
// أدوار المحادثة — تعكس ROLE_USER/ROLE_ASSISTANT في @nebras/protocol (مصدر الحقيقة)؛ تُعاد
// إعلانها هنا لأنّ الامتداد CommonJS خارج شجرة بناء TypeScript (كنمط أسماء الطرائق في rpc-client).
const ROLE_USER = "مستخدم";
const ROLE_ASSISTANT = "مساعد";
// سقف أدوار المحادثة المحفوظة محلّيًّا (الخادم يقصّها لنافذته أيضًا؛ نحدّ نموّ الذاكرة هنا كذلك).
const MAX_LOCAL_HISTORY = 40;

/** @type {{role: string, text: string}[]} تاريخ المحادثة (يُمرَّر مع كلّ مهمّة). */
let conversation = [];
/**
 * خطّ أساس فرق المصدر (م2ب+): صورة المصدر المعياريّة التي أرّض عليها الخادم في الدور السابق
 * (result.sourceEcho، لا نصّ المحرّر — يسدّ تباعد المحرّر/القرص). تُحدَّث كلّ دور ناجح فيصير
 * الفرق تدرّجيًّا مقابل الدور السابق. تُصفَّر مع المحادثة (تبديل الملفّ/إغلاق اللوحة).
 * null = لا أساس بعد ⇒ الخادم يرسل المصدر كاملًا (أوّل دور).
 * @type {string | null}
 */
let baselineSource = null;
/**
 * عدّاد حِقبة الجلسة: يزداد في كلّ تصفير (تبديل الملفّ/إغلاق اللوحة). تلتقطه المهمّة عند إطلاقها،
 * ويُفحَص قبل كتابة نتيجتها في الحالة العامّة — فمهمّةٌ تكتمل بعد تصفيرٍ لا تُلوّث جلسةً أخرى
 * (تمنع سباق الاكتمال-بعد-التبديل: تسريب سياق ق6 + فرق أساسٍ فاسد).
 * @type {number}
 */
let sessionEpoch = 0;

// معرّف/عنوان اللوحة.
const PANEL_TYPE = "mihrab.nebras.chat";
const PANEL_TITLE = "دردشة نِبراس";

// أنواع رسائل الجسر webview↔الامتداد (ثوابت السلك).
const MSG_SEND = "send"; // webview → ext: نصّ المستخدم
const MSG_CANCEL = "cancel"; // webview → ext: إلغاء الجاري
const MSG_DELTA = "delta"; // ext → webview: قطعة بثّ
const MSG_DONE = "done"; // ext → webview: انتهى الدور
const MSG_ERROR = "error"; // ext → webview: خطأ
const MSG_CONTEXT = "context"; // ext → webview: اسم ملفّ السياق الحاليّ

const COPY = {
  noContext: "افتح ملفّ ص لتدرْدش عن سياقه.",
  contextFile: (f) => `السياق: ${f}`,
  failed: (e) => `تعذّر: ${e}`,
  notReady: "خادم نِبراس غير جاهز بعد.",
};

/** @type {vscode.WebviewPanel | null} */
let panel = null;
/** آخر معرّف مهمّة جارية في اللوحة (للإلغاء). */
let activeTaskId;

/** يولّد nonce تشفيريًّا لسياسة CSP (لا يُخمَّن). */
function makeNonce() {
  return crypto.randomBytes(16).toString("base64");
}

/** يحلّ ملفّ ص النشط لسياق الدردشة (أو null). */
function activeSadFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return null;
  const doc = editor.document;
  const isSad = doc.languageId === SAD_LANG_ID || doc.fileName.endsWith(SAD_EXT);
  if (!isSad || doc.isUntitled || doc.uri.scheme !== "file") return null;
  return doc.fileName;
}

/** يحدّث سطر السياق في اللوحة من الملفّ النشط. */
function pushContext() {
  if (!panel) return;
  const file = activeSadFile();
  void panel.webview.postMessage({
    type: MSG_CONTEXT,
    text: file ? COPY.contextFile(path.basename(file)) : COPY.noContext,
  });
}

/** يعالج رسالة مستخدم: يشغّل «اشرح» ويبثّ للّوحة. */
async function onUserMessage(proc, getConfig, text) {
  if (!panel) return;
  if (!proc.isReady()) {
    void panel.webview.postMessage({ type: MSG_ERROR, text: COPY.notReady });
    void proc.start();
    return;
  }
  const file = activeSadFile();
  if (!file) {
    void panel.webview.postMessage({ type: MSG_ERROR, text: COPY.noContext });
    return;
  }
  // التقط الجلسة والملفّ اللذين تنطلق المهمّة لأجلهما — يُفحَصان بعد الاكتمال (await) قبل كتابة
  // أيّ حالة عامّة، كي لا تُلوّث مهمّةٌ اكتملت متأخّرةً جلسةً صُفِّرت لملفٍّ آخر (سباق ق6).
  const epoch = sessionEpoch;
  const forFile = file;
  const cfg = getConfig();
  const params = {
    kind: TASK_EXPLAIN,
    target: file,
    instruction: text,
    // طور المحادثة: مرّر الأدوار السابقة (لا يشمل الرسالة الحاليّة — هي في instruction).
    history: conversation.slice(),
    // تحسين توكنز: بعد أوّل دور مرّر خطّ أساس المصدر ⇒ العقل يرسل الفرق لا المصدر الكامل.
    ...(baselineSource !== null ? { baselineSource } : {}),
    permission: cfg.permissionMode,
    locale: cfg.locale,
  };
  let answer = "";
  try {
    const result = await proc.runTask(
      params,
      (delta) => {
        answer += delta;
        if (panel) void panel.webview.postMessage({ type: MSG_DELTA, text: delta });
      },
      (id) => {
        activeTaskId = id;
      },
    );
    // الفشل يصل كرفض (JsonRpcError) فيُعالَج في catch — لا فرع ok===false (ميت بعقد الخادم).
    // حارس الحِقبة/الملفّ: إن تبدّلت الجلسة (تبديل ملفّ/إغلاق لوحة) أو الملفّ النشط أثناء المهمّة،
    // لا تكتب حالة هذا الدور في وحدةٍ عامّة صُفِّرت لجلسةٍ أخرى (يمنع تسريب ق6 + فرقًا فاسدًا).
    // دوّن الدورين (المستخدم ثمّ المساعد) للسياق التالي — لكن تجاهل التبادل كلّه إن كان الجواب
    // فارغًا (بثّ صفريّ) كي لا يبقى سؤالٌ بلا جواب في التاريخ (يطابق حذف الفقاعة الفارغة عرضًا).
    if (epoch === sessionEpoch && activeSadFile() === forFile && answer.trim()) {
      conversation.push({ role: ROLE_USER, text }, { role: ROLE_ASSISTANT, text: answer });
      if (conversation.length > MAX_LOCAL_HISTORY) {
        conversation = conversation.slice(-MAX_LOCAL_HISTORY);
      }
      // خطّ أساس الدور التالي = صورة المصدر التي أرّض عليها الخادم فعلًا (sourceEcho)، لا نصّ
      // المحرّر — يسدّ تباعد المحرّر/القرص، ويجعل الفرق تدرّجيًّا مقابل الدور السابق (يُحدَّث كلّ دور).
      if (result && typeof result.sourceEcho === "string") {
        baselineSource = result.sourceEcho;
      }
    }
    if (panel) void panel.webview.postMessage({ type: MSG_DONE });
  } catch (err) {
    if (panel) {
      void panel.webview.postMessage({
        type: MSG_ERROR,
        text: COPY.failed(String(err && err.message ? err.message : err)),
      });
    }
  } finally {
    activeTaskId = undefined;
  }
}

/** يبني HTML اللوحة (RTL، CSP صارم، nonce). */
function buildHtml(webview) {
  const nonce = makeNonce();
  const csp = [
    "default-src 'none'",
    `style-src 'nonce-${nonce}'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");
  // النصوص كلّها من طرف الامتداد عبر رسائل؛ الـHTML هيكل فقط (لا حقن نموذج في DOM كـHTML).
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="${csp}" />
<style nonce="${nonce}">
  body { font-family: system-ui, "Segoe UI", Tahoma, sans-serif; margin: 0; padding: 0; display: flex; flex-direction: column; height: 100vh; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  #ctx { padding: 6px 12px; font-size: 12px; opacity: 0.75; border-bottom: 1px solid var(--vscode-panel-border); }
  #log { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
  .msg { padding: 8px 12px; border-radius: 10px; white-space: pre-wrap; word-wrap: break-word; max-width: 90%; line-height: 1.6; }
  .user { align-self: flex-start; background: var(--vscode-input-background); border: 1px solid var(--vscode-panel-border); }
  .bot { align-self: flex-end; background: var(--vscode-textBlockQuote-background); }
  .err { align-self: center; color: var(--vscode-errorForeground); font-size: 12px; }
  #bar { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--vscode-panel-border); }
  #q { flex: 1; resize: none; font-family: inherit; font-size: 13px; padding: 8px; border-radius: 8px; border: 1px solid var(--vscode-input-border); background: var(--vscode-input-background); color: var(--vscode-input-foreground); }
  button { font-family: inherit; padding: 6px 14px; border: none; border-radius: 8px; cursor: pointer; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button:disabled { opacity: 0.5; cursor: default; }
</style>
</head>
<body>
  <div id="ctx"></div>
  <div id="log"></div>
  <div id="bar">
    <textarea id="q" rows="2" placeholder="اسأل نِبراس عن الملفّ… (Ctrl+Enter للإرسال)"></textarea>
    <button id="send">أرسِل</button>
    <button id="cancel" hidden>أوقِف</button>
  </div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const log = document.getElementById('log');
  const q = document.getElementById('q');
  const send = document.getElementById('send');
  const cancel = document.getElementById('cancel');
  const ctx = document.getElementById('ctx');
  let botBubble = null;
  let busy = false;

  function bubble(cls, text) {
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }
  function setBusy(b) { busy = b; send.disabled = b; send.textContent = b ? 'يكتب…' : 'أرسِل'; cancel.hidden = !b; }
  // يزيل فقاعة الـbot إن بقيت فارغة (خطأ مبكّر قبل أيّ بثّ) كي لا يبقى صندوق فارغ في السجلّ.
  function dropEmptyBot() { if (botBubble && botBubble.textContent === '') { botBubble.remove(); } botBubble = null; }

  function doSend() {
    const text = q.value.trim();
    if (!text || busy) return;
    bubble('user', text);
    q.value = '';
    botBubble = bubble('bot', '');
    setBusy(true);
    vscode.postMessage({ type: '${MSG_SEND}', text });
  }
  send.addEventListener('click', doSend);
  cancel.addEventListener('click', () => { if (busy) vscode.postMessage({ type: '${MSG_CANCEL}' }); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doSend(); }
  });

  window.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === '${MSG_DELTA}') {
      if (!botBubble) botBubble = bubble('bot', '');
      botBubble.textContent += m.text;
      log.scrollTop = log.scrollHeight;
    } else if (m.type === '${MSG_DONE}') {
      dropEmptyBot(); setBusy(false);
    } else if (m.type === '${MSG_ERROR}') {
      dropEmptyBot(); bubble('err', m.text); setBusy(false);
    } else if (m.type === '${MSG_CONTEXT}') {
      ctx.textContent = m.text;
    }
  });
</script>
</body>
</html>`;
}

const registerChat = {
  /** تهيئة (لا حالة عامّة تحتاج تسجيلًا حاليًّا — محجوز للتوسّع). */
  init(_context) {},

  /** يفتح لوحة الدردشة (أو يكشف القائمة). */
  open(context, proc, getConfig) {
    if (panel) {
      panel.reveal(vscode.ViewColumn.Beside);
      pushContext();
      return;
    }
    panel = vscode.window.createWebviewPanel(
      PANEL_TYPE,
      PANEL_TITLE,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.webview.html = buildHtml(panel.webview);

    const sub = panel.webview.onDidReceiveMessage((m) => {
      if (!m || typeof m !== "object") return;
      if (m.type === MSG_SEND && typeof m.text === "string") {
        void onUserMessage(proc, getConfig, m.text);
      } else if (m.type === MSG_CANCEL) {
        if (activeTaskId !== undefined) proc.cancel(activeTaskId);
      }
    });
    // عند تبديل الملفّ النشط: حدّث السياق **وصفّر المحادثة** — تاريخ أسئلة/أجوبة ملفٍّ سابق
    // يُربك مهمّة الملفّ الجديد ويسرّب محتواه في طلبه (ق6). كلّ ملفّ محادثةٌ نظيفة.
    let lastCtxFile = activeSadFile();
    const edSub = vscode.window.onDidChangeActiveTextEditor(() => {
      const now = activeSadFile();
      if (now !== lastCtxFile) {
        lastCtxFile = now;
        conversation = [];
        baselineSource = null; // مصدر جديد ⇒ أرسِله كاملًا أوّل دور.
        sessionEpoch++; // أبطِل أيّ مهمّة جارية للملفّ السابق (لا تكتب حالتها بعد الاكتمال).
      }
      pushContext();
    });

    panel.onDidDispose(() => {
      sub.dispose();
      edSub.dispose();
      if (activeTaskId !== undefined) proc.cancel(activeTaskId);
      conversation = []; // جلسة جديدة عند إعادة الفتح (لا تسرّب سياق قديم).
      baselineSource = null;
      sessionEpoch++; // أبطِل أيّ مهمّة جارية تكتمل بعد الإغلاق (لا ترث جلسةٌ لاحقة حالتها).
      panel = null;
    });
    pushContext();
  },
};

module.exports = { registerChat, COPY };
