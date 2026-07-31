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
// اختيار جذر عمل الوكيل للملفّ (إعادة توجيه الجذر — نفس سياسة «وكيل»/«أصلِح بنِبراس»).
const { resolveAgentRoot } = require("./agent.js");

const SAD_LANG_ID = "sad";
const SAD_EXT = ".ص";
// عقد السلك (صنف المهمّة + الأدوار) من مصدر الحقيقة المولَّد (يعكس @nebras/protocol).
const {
  TASK_EXPLAIN,
  ROLE_USER,
  ROLE_ASSISTANT,
} = require("./contract/protocol-contract.generated.js");
// سقف أدوار المحادثة المحفوظة محلّيًّا (الخادم يقصّها لنافذته أيضًا؛ نحدّ نموّ الذاكرة هنا كذلك).
const MAX_LOCAL_HISTORY = 40;

// حالة الجلسة (التاريخ/خطّ الأساس/الحِقبة/اللوحة/المهمّة الجارية) مُغلَّفة في صنف ChatSession
// أدناه (لا حالة عامّة على مستوى الوحدة) — يتيح لوحاتٍ مستقلّة مستقبلًا واختبارًا وحدويًّا.

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
  // توحيد سلوك التوجيه مع «وكيل»/«أصلِح بنِبراس» [توصية Amelia]: ملفّ السياق خارج جذر الخادم الجاري
  // يستلزم إعادة توجيه (إعادة تشغيل)؛ مع مهمّةٍ جاريةٍ لا نقطعها من لوحة دردشة — نطلب المعاودة.
  busyRetargeting: "ثمّة مهمّة نِبراس جارية والملفّ خارج جذر العمل الحاليّ — أعِد المحاولة بعد اكتمالها.",
};

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

// (سطر السياق ومعالجة رسالة المستخدم صارا طريقتَي ChatSession أدناه.)

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
  /* مكدّس بوجه عربيّ صريح على المنصّات الثلاث — النظير المقصود لـ[AR-03] في القشرة:
     ‏system-ui وحده لا يضمن محارف عربيّة على لينكس. */
  body { font-family: system-ui, "Segoe UI", Tahoma, "SF Arabic", "Noto Sans Arabic", sans-serif; margin: 0; padding: 0; display: flex; flex-direction: column; height: 100vh; color: var(--vscode-foreground); background: var(--vscode-editor-background); }
  /* اسم ملفّ السياق لاتينيّ داخل لوحة RTL ⇒ محايداته الطرفيّة (نقطة الامتداد، الشُّرَط)
     تقفز للطرف الخاطئ. plaintext يشتقّ اتّجاه الفقرة من محتواها. */
  #ctx { padding: 6px 12px; font-size: 12px; opacity: 0.75; border-bottom: 1px solid var(--vscode-panel-border); unicode-bidi: plaintext; }
  #log { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
  /* **جوهر الإصلاح:** ردّ نِبراس نصٌّ مختلط بطبيعته — شرحٌ عربيّ تتخلّله أسطر شيفرة لاتينيّة.
     وفقاعةٌ واحدة بفقرة RTL واحدة تُبعثر كلّ سطر شيفرة: تقفز الأقواس والنقاط والفواصل
     المنقوطة إلى الطرف المقابل فتصير الشيفرة غير قابلة للنسخ بصريًّا.
     مع white-space:pre-wrap يُنشئ كلّ فاصل سطر **فقرة bidi مستقلّة**، فـplaintext
     يمنح كلّ سطر اتّجاهه من أوّل محرف قويّ فيه: سطر الشرح RTL، وسطر الشيفرة LTR.
     وtext-align:start (لا right) كي تتبع محاذاة السطر اتّجاهَه الخاصّ لا اتّجاه اللوحة.
     ⚠️ لا شواهد خلفيّة (backtick) في تعليقات هذه الورقة: الـHTML كلّه قالبٌ نصّيّ في JS،
     وأيّ شاهدة هنا تُنهيه فيسقط الملفّ بـSyntaxError (أمسكه اختبار الوحدة). */
  .msg { padding: 8px 12px; border-radius: 10px; white-space: pre-wrap; word-wrap: break-word; max-width: 90%; line-height: 1.6; unicode-bidi: plaintext; text-align: start; }
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
    <!-- dir="auto": السؤال قد يكون لصقةَ شيفرة لاتينيّة؛ المتصفّح يشتقّ اتّجاه الصندوق من
         أوّل محرف قويّ يكتبه المستخدم بدل فرض RTL على شيفرة. -->
    <textarea id="q" rows="2" dir="auto" placeholder="اسأل نِبراس عن الملفّ… (Ctrl+Enter للإرسال)"></textarea>
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

/**
 * جلسة دردشة نِبراس: تغلّف حالة لوحةٍ واحدة (تاريخ الأدوار، خطّ أساس فرق المصدر، عدّاد الحِقبة،
 * المهمّة الجارية) بدل حالةٍ عامّة على مستوى الوحدة. تُفتح لوحةً كسولًا، وتُصفَّر عند تبديل الملفّ
 * أو الإغلاق. عدّاد الحِقبة يُلتقَط عند إطلاق المهمّة ويُفحَص بعد اكتمالها قبل كتابة أيّ حالة —
 * فمهمّةٌ تكتمل بعد تصفيرٍ لا تُلوّث جلسةً أخرى (يمنع سباق الاكتمال-بعد-التبديل: تسريب ق6 + فرق فاسد).
 */
class ChatSession {
  /**
   * @param {any} proc خادم نِبراس المقيم
   * @param {() => any} getConfig قارئ الإعدادات الحاليّة
   * @param {() => void} onDispose يُستدعى عند إغلاق اللوحة (لتصفير المرجع المفرد)
   */
  constructor(proc, getConfig, onDispose) {
    this._proc = proc;
    this._getConfig = getConfig;
    /** @type {{role: string, text: string}[]} تاريخ المحادثة (يُمرَّر مع كلّ مهمّة). */
    this._conversation = [];
    /** خطّ أساس فرق المصدر (sourceEcho الدور السابق)؛ null = أرسِل المصدر كاملًا. @type {string|null} */
    this._baselineSource = null;
    /** عدّاد حِقبة الجلسة (يزداد كلّ تصفير). @type {number} */
    this._sessionEpoch = 0;
    /** آخر معرّف مهمّة جارية (للإلغاء). */
    this._activeTaskId = undefined;
    this._disposed = false;

    this._panel = vscode.window.createWebviewPanel(
      PANEL_TYPE,
      PANEL_TITLE,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this._panel.webview.html = buildHtml(this._panel.webview);

    this._sub = this._panel.webview.onDidReceiveMessage((m) => {
      if (!m || typeof m !== "object") return;
      if (m.type === MSG_SEND && typeof m.text === "string") {
        void this.onUserMessage(m.text);
      } else if (m.type === MSG_CANCEL) {
        if (this._activeTaskId !== undefined) this._proc.cancel(this._activeTaskId);
      }
    });
    // عند تبديل الملفّ النشط: حدّث السياق **وصفّر المحادثة** — تاريخ أسئلة/أجوبة ملفٍّ سابق يُربك
    // مهمّة الملفّ الجديد ويسرّب محتواه في طلبه (ق6). كلّ ملفّ محادثةٌ نظيفة.
    this._lastCtxFile = activeSadFile();
    this._edSub = vscode.window.onDidChangeActiveTextEditor(() => {
      const now = activeSadFile();
      if (now !== this._lastCtxFile) {
        this._lastCtxFile = now;
        this._resetSession(); // مصدر جديد ⇒ أرسِله كاملًا، وأبطِل أيّ مهمّة جارية للملفّ السابق.
      }
      this.pushContext();
    });

    this._panel.onDidDispose(() => {
      this._disposed = true;
      this._sub.dispose();
      this._edSub.dispose();
      if (this._activeTaskId !== undefined) this._proc.cancel(this._activeTaskId);
      // أبطِل أيّ مهمّة جارية تكتمل بعد الإغلاق (لا ترث جلسةٌ لاحقة حالتها).
      this._resetSession();
      onDispose();
    });
    this.pushContext();
  }

  /** يكشف اللوحة القائمة ويحدّث سياقها. */
  reveal() {
    this._panel.reveal(vscode.ViewColumn.Beside);
    this.pushContext();
  }

  /** يصفّر حالة الجلسة ويقدّم الحِقبة (تبديل ملفّ/إغلاق). */
  _resetSession() {
    this._conversation = [];
    this._baselineSource = null;
    this._sessionEpoch++;
  }

  /** يرسل رسالةً للّوحة ما لم تكن مُغلَقة (يقابل حرّاس `if (panel)` السابقة). */
  _post(message) {
    if (this._disposed) return;
    void this._panel.webview.postMessage(message);
  }

  /** يحدّث سطر السياق في اللوحة من الملفّ النشط. */
  pushContext() {
    const file = activeSadFile();
    this._post({
      type: MSG_CONTEXT,
      text: file ? COPY.contextFile(path.basename(file)) : COPY.noContext,
    });
  }

  /** يعالج رسالة مستخدم: يشغّل «اشرح» ويبثّ للّوحة. */
  async onUserMessage(text) {
    const file = activeSadFile();
    if (!file) {
      this._post({ type: MSG_ERROR, text: COPY.noContext });
      return;
    }
    // التقط الجلسة والملفّ اللذين تنطلق المهمّة لأجلهما **قبل أيّ await** (التوجيه أدناه await) —
    // يُفحَصان بعد الاكتمال قبل كتابة أيّ حالة، كي لا تُلوّث مهمّةٌ اكتملت متأخّرةً (أو تصفيرٌ وقع
    // أثناء انتظار التوجيه) جلسةً صُفِّرت لملفٍّ آخر (سباق ق6).
    const epoch = this._sessionEpoch;
    const forFile = file;
    // وجّه جذر الخادم إلى المجلّد المالك لملفّ السياق (نفس سياسة «وكيل»/«أصلِح بنِبراس» —
    // يفتح الدردشة عن ملفٍّ مفرد/جذرٍ غير أوّل). لا نقطع مهمّةً جارية من لوحة الدردشة (لا حوار
    // نمطيّ هنا) — نطلب المعاودة بعد اكتمالها. [توصية Amelia — توحيد سلوك التوجيه]
    const desiredRoot = resolveAgentRoot(file);
    if (this._proc.retargetNeedsRestart(desiredRoot) && this._proc.hasActiveTasks()) {
      this._post({ type: MSG_ERROR, text: COPY.busyRetargeting });
      return;
    }
    if (!(await this._proc.retargetRoot(desiredRoot))) {
      this._post({ type: MSG_ERROR, text: COPY.notReady });
      return;
    }
    // تصفيرٌ أثناء انتظار التوجيه (إغلاق اللوحة/تبديل الملفّ) ⇒ لا تُطلق المهمّة أصلًا.
    if (epoch !== this._sessionEpoch) return;
    const cfg = this._getConfig();
    const params = {
      kind: TASK_EXPLAIN,
      target: file,
      instruction: text,
      // طور المحادثة: مرّر الأدوار السابقة (لا يشمل الرسالة الحاليّة — هي في instruction).
      history: this._conversation.slice(),
      // تحسين توكنز: بعد أوّل دور مرّر خطّ أساس المصدر ⇒ العقل يرسل الفرق لا المصدر الكامل.
      ...(this._baselineSource !== null ? { baselineSource: this._baselineSource } : {}),
      permission: cfg.permissionMode,
      locale: cfg.locale,
    };
    let answer = "";
    try {
      const result = await this._proc.runTask(
        params,
        (delta) => {
          answer += delta;
          this._post({ type: MSG_DELTA, text: delta });
        },
        (id) => {
          this._activeTaskId = id;
        },
      );
      // الفشل يصل كرفض (JsonRpcError) فيُعالَج في catch — لا فرع ok===false (ميت بعقد الخادم).
      // حارس الحِقبة/الملفّ: إن تبدّلت الجلسة (تبديل ملفّ/إغلاق لوحة) أو الملفّ النشط أثناء المهمّة،
      // لا تكتب حالة هذا الدور في جلسةٍ صُفِّرت (يمنع تسريب ق6 + فرقًا فاسدًا). تجاهل التبادل كلّه إن
      // كان الجواب فارغًا (بثّ صفريّ) كي لا يبقى سؤالٌ بلا جواب في التاريخ.
      if (epoch === this._sessionEpoch && activeSadFile() === forFile && answer.trim()) {
        this._conversation.push({ role: ROLE_USER, text }, { role: ROLE_ASSISTANT, text: answer });
        if (this._conversation.length > MAX_LOCAL_HISTORY) {
          this._conversation = this._conversation.slice(-MAX_LOCAL_HISTORY);
        }
        // خطّ أساس الدور التالي = صورة المصدر التي أرّض عليها الخادم فعلًا (sourceEcho)، لا نصّ
        // المحرّر — يسدّ تباعد المحرّر/القرص، ويجعل الفرق تدرّجيًّا مقابل الدور السابق.
        if (result && typeof result.sourceEcho === "string") {
          this._baselineSource = result.sourceEcho;
        }
      }
      this._post({ type: MSG_DONE });
    } catch (err) {
      this._post({
        type: MSG_ERROR,
        text: COPY.failed(String(err && err.message ? err.message : err)),
      });
    } finally {
      this._activeTaskId = undefined;
    }
  }
}

/** @type {ChatSession | null} اللوحة المفردة الحاليّة (تصميم لوحة واحدة). */
let current = null;

const registerChat = {
  /** يفتح لوحة الدردشة (أو يكشف القائمة القائمة). */
  open(context, proc, getConfig) {
    if (current) {
      current.reveal();
      return;
    }
    current = new ChatSession(proc, getConfig, () => {
      current = null;
    });
  },
};

module.exports = { registerChat, ChatSession, COPY };
