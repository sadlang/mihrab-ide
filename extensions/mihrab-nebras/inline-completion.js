// @ts-check
"use strict";
// الميزة 3 (م2ب): الإكمال السطريّ عبر نِبراس (InlineCompletionItemProvider للغة ص).
// مطفأ افتراضًا (يستهلك توكنات). مبوَّب بقدرة الخادم: يعمل فقط إن أعلن الخادم مهمّة «أكمل»
// (طبقة خفيفة، بثّ)؛ وإلّا يصمت بلا إزعاج (توافق أماميّ حتى يُشحَن الجانب الخادميّ).
//
// أمان/أداء: تهدئة (debounce) + إلغاء عبر token + طلب واحد جارٍ لكلّ موضع + سقف سياق البادئة.

const vscode = require("vscode");

const SAD_LANG_ID = "sad";
const SAD_EXT = ".ص";
// صنف مهمّة الإكمال (طبقة خفيفة). ليست في SHIPPED_TASKS الحاليّة — تُشحَن خادميًّا لاحقًا.
const TASK_COMPLETE = "أكمل";

const CFG_SECTION = "mihrab.nebras";
const CFG_INLINE = "inlineCompletion";

// سقف أسطر البادئة المُرسَلة كسياق (كي لا نُرسل ملفًّا ضخمًا لكلّ ضغطة).
const MAX_PREFIX_LINES = 60;
// تهدئة قبل إطلاق الطلب (ms) — يمنع طلبًا لكلّ حرف.
const DEBOUNCE_MS = 250;

/** هل مهمّة «أكمل» معلَنة في قدرات الخادم؟ */
function serverSupportsComplete(proc) {
  const caps = proc.capabilities();
  return !!(caps && Array.isArray(caps.tasks) && caps.tasks.includes(TASK_COMPLETE));
}

/** ينتظر ms أو يُلغى عبر token (يُرجع true إن اكتمل الانتظار، false إن أُلغي). */
function debounce(ms, token) {
  return new Promise((resolve) => {
    const sub = token.onCancellationRequested(() => {
      clearTimeout(t);
      sub.dispose(); // تخلّص من المستمع كي لا يتسرّب عبر عمر الرمز.
      resolve(false);
    });
    const t = setTimeout(() => {
      sub.dispose();
      resolve(true);
    }, ms);
    if (t.unref) t.unref();
  });
}

/**
 * يسجّل مزوّد الإكمال السطريّ.
 * @param {vscode.ExtensionContext} context
 * @param {import('./nebras-process.js').NebrasProcess} proc
 * @param {() => {permissionMode: string, locale: string}} getConfig
 * @param {vscode.OutputChannel} log
 */
function registerInlineCompletion(context, proc, getConfig, log) {
  const provider = {
    async provideInlineCompletionItems(document, position, _ctx, token) {
      // مطفأ؟ لغة غير ص؟ خادم غير جاهز/غير داعم؟ ⇒ لا اقتراح.
      const enabled = vscode.workspace.getConfiguration(CFG_SECTION).get(CFG_INLINE) === true;
      if (!enabled) return undefined;
      if (document.languageId !== SAD_LANG_ID && !document.fileName.endsWith(SAD_EXT)) return undefined;
      if (!proc.isReady() || !serverSupportsComplete(proc)) return undefined;
      if (document.isUntitled || document.uri.scheme !== "file") return undefined;

      // تهدئة: إن تحرّك المؤشّر/أُلغي خلالها فلا طلب.
      if (!(await debounce(DEBOUNCE_MS, token))) return undefined;
      if (token.isCancellationRequested) return undefined;

      // بادئة محدودة الأسطر حتّى المؤشّر (سياق الإكمال).
      const startLine = Math.max(0, position.line - MAX_PREFIX_LINES);
      const prefixRange = new vscode.Range(startLine, 0, position.line, position.character);
      const prefix = document.getText(prefixRange);
      if (!prefix.trim()) return undefined;

      const cfg = getConfig();
      const params = {
        kind: TASK_COMPLETE,
        target: document.fileName,
        instruction: prefix,
        permission: cfg.permissionMode,
        locale: cfg.locale,
      };

      let text = "";
      let taskId;
      const sub = token.onCancellationRequested(() => {
        if (taskId !== undefined) proc.cancel(taskId);
      });
      try {
        const result = await proc.runTask(
          params,
          (delta) => {
            text += delta;
          },
          (id) => {
            taskId = id;
          },
        );
        if (token.isCancellationRequested) return undefined;
        // نصّ الإكمال = البثّ المتراكم، أو الملخّص إن لم يُبثّ.
        const completion = text || (result && typeof result.summary === "string" ? result.summary : "");
        if (!completion) return undefined;
        return [new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))];
      } catch (err) {
        log.appendLine(`[نِبراس] إكمال فشل: ${err && err.message ? err.message : err}`);
        return undefined;
      } finally {
        sub.dispose();
      }
    },
  };

  // سجّل للغة ص (المعرّف + نمط الامتداد احتياطًا).
  const selector = [
    { language: SAD_LANG_ID },
    { pattern: `**/*${SAD_EXT}` },
  ];
  context.subscriptions.push(vscode.languages.registerInlineCompletionItemProvider(selector, provider));
}

module.exports = { registerInlineCompletion, TASK_COMPLETE };
