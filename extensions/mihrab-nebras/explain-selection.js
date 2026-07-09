// @ts-check
"use strict";
// الميزة 1 (م2ب): «اشرح التحديد» — يرسل مهمّة «اشرح» لخادم نِبراس ويبثّ الشرح حيًّا إلى قناة
// إخراج عربيّة. مهمّة قرائيّة (لا كتابة ⇒ لا موافقة). تثبت أنبوب البروتوكول كاملًا end-to-end.

const vscode = require("vscode");
const path = require("path");

// معرّف لغة ص وامتدادها (يطابق sad-lang + mihrab-welcome).
const SAD_LANG_ID = "sad";
const SAD_EXT = ".ص";
// صنف المهمّة من مصدر الحقيقة المولَّد (يعكس TaskKind في @nebras/protocol).
const { TASK_EXPLAIN } = require("./contract/protocol-contract.generated.js");

const COPY = {
  noEditor: "لا يوجد محرّر نشط — افتح ملفّ ص أوّلًا.",
  notSadFile: `الملفّ الحاليّ ليس ملفّ ص (‹${SAD_EXT}›).`,
  notOnDisk: "احفظ الملفّ على القرص أوّلًا كي يفهم نِبراس سياقه.",
  emptySelection: "لا يوجد تحديد ولا محتوى في الملفّ لشرحه.",
  notReady: "خادم نِبراس غير جاهز بعد — انتظر لحظة ثمّ أعِد المحاولة.",
  progress: "نِبراس يشرح…",
  header: (file, hasSel) =>
    `# شرح نِبراس — ${file}${hasSel ? " (التحديد)" : " (الملفّ كامل)"}\n\n`,
  failed: (e) => `\n\n⚠️ تعذّر إكمال الشرح: ${e}\n`,
  done: "\n",
};

/** يبني وصف الهدف/التعليمة من المحرّر: نصّ التحديد أو الملفّ كاملًا. */
function readSelection(editor) {
  const sel = editor.selection;
  if (sel && !sel.isEmpty) {
    return { text: editor.document.getText(sel), hasSelection: true };
  }
  return { text: editor.document.getText(), hasSelection: false };
}

/**
 * ينشئ أمر «اشرح التحديد».
 * @param {import('./nebras-process.js').NebrasProcess} proc
 * @param {vscode.OutputChannel} channel قناة الإخراج العربيّة (تُعرَض للمستخدم)
 * @param {() => {permissionMode: string, locale: string}} getConfig
 */
function makeExplainCommand(proc, channel, getConfig) {
  return async function explainSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage(COPY.noEditor);
      return;
    }
    const doc = editor.document;
    if (doc.languageId !== SAD_LANG_ID && !doc.fileName.endsWith(SAD_EXT)) {
      vscode.window.showWarningMessage(COPY.notSadFile);
      return;
    }
    if (doc.isUntitled || doc.uri.scheme !== "file") {
      vscode.window.showWarningMessage(COPY.notOnDisk);
      return;
    }
    const { text, hasSelection } = readSelection(editor);
    if (!text.trim()) {
      vscode.window.showWarningMessage(COPY.emptySelection);
      return;
    }
    if (!proc.isReady()) {
      vscode.window.showWarningMessage(COPY.notReady);
      // حاول الإقلاع (لعلّه لم يبدأ بعد) دون حجب.
      void proc.start();
      return;
    }

    const cfg = getConfig();
    const params = {
      kind: TASK_EXPLAIN,
      target: doc.fileName,
      instruction: text,
      permission: cfg.permissionMode,
      locale: cfg.locale,
    };

    channel.clear();
    channel.append(COPY.header(path.basename(doc.fileName), hasSelection));
    channel.show(true);

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: COPY.progress, cancellable: true },
      async (_progress, token) => {
        let cancelled = false;
        try {
          // ربط إلغاء المستخدم بإشعار Cancel للخادم — سنمرّر taskId عبر الإغلاق.
          const result = await runWithCancel(proc, params, (delta) => channel.append(delta), token, () => {
            cancelled = true;
          });
          // نجاح: الخادم يبثّ الشرح ثمّ يعيد نتيجةً. الفشل يصل كرفض (JsonRpcError) لا كـresult،
          // فيُعالَج في catch أدناه (لا فرع ok===false — كان ميتًا بحكم عقد الخادم).
          void result;
          if (!cancelled) channel.append(COPY.done);
        } catch (err) {
          if (!cancelled) channel.append(COPY.failed(String(err && err.message ? err.message : err)));
        }
      },
    );
  };
}

/**
 * يشغّل المهمّة مع دعم الإلغاء: يبدأ الطلب، ويربط token بإشعار Cancel. لأنّ runTask يخفي
 * معرّف المهمّة، نلغي عبر واجهة proc.cancelActive (تلغي آخر مهمّة جارية لهذا المستهلك).
 */
async function runWithCancel(proc, params, onDelta, token, onCancel) {
  let taskId;
  const sub = token.onCancellationRequested(() => {
    onCancel();
    if (taskId !== undefined) proc.cancel(taskId);
  });
  try {
    return await proc.runTask(params, onDelta, (id) => {
      taskId = id;
    });
  } finally {
    sub.dispose();
  }
}

module.exports = { makeExplainCommand, COPY };
