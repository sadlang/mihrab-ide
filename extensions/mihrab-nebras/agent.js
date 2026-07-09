// @ts-check
"use strict";
// الميزة 4 (م2ب): «وكيل» — يشغّل الحلقة الوكيليّة الكاملة (اقرأ→خطّط→نفّذ→تحقّق) داخل المحرّر.
// المستخدم يصف هدفًا؛ نِبراس يكتشف/يقرأ/يكتب/يبني/يشغّل تحت الأذونات (ق5/ق12)، يبثّ كلَّ خطوةٍ حيًّا
// إلى قناة إخراج عربيّة، ثمّ يعرض الجواب النهائيّ. الكتابة/البناء/التشغيل تُستأذَن (permission.js)
// في «اقتراح/آمن»؛ في «طيّار» يقرّر الخادم ذاتيًّا ضمن حدوده الصلبة. كلّ نصّ ظاهر ثابت مسمّى.

const vscode = require("vscode");
const path = require("path");

// معرّف لغة ص وامتدادها (يطابق explain-selection + sad-lang).
const SAD_LANG_ID = "sad";
const SAD_EXT = ".ص";
// عقد السلك (صنف المهمّة + وسوم الحصيلة) من مصدر الحقيقة المولَّد (يعكس @nebras/protocol).
const {
  TASK_AGENT,
  OUTCOME_APPLIED,
  OUTCOME_DENIED,
  OUTCOME_PENDING,
} = require("./contract/protocol-contract.generated.js");
/** أيقونة لكلّ حصيلة (بصريّة سريعة في القناة). */
const OUTCOME_ICON = {
  [OUTCOME_APPLIED]: "✓",
  [OUTCOME_DENIED]: "✗",
  [OUTCOME_PENDING]: "…",
};
const STEP_BULLET = "•";

const COPY = {
  noEditor: "لا يوجد محرّر نشط — افتح ملفّ ص أوّلًا.",
  notSadFile: `الملفّ الحاليّ ليس ملفّ ص (‹${SAD_EXT}›).`,
  notOnDisk: "احفظ الملفّ على القرص أوّلًا كي يعمل الوكيل على سياقه.",
  dirtyTitle: "الملفّ به تعديلاتٌ غير محفوظة",
  dirtyDetail: "الوكيل يقرأ ويكتب من القرص — سيعمل على النسخة المحفوظة وقد يدوس تعديلاتك غير المحفوظة.",
  dirtySave: "احفظ وتابع",
  dirtyCancel: "ألغِ",
  saveFailed: "تعذّر حفظ الملفّ — أُلغيَ.",
  notReady: "خادم نِبراس غير جاهز بعد — انتظر لحظة ثمّ أعِد المحاولة.",
  goalPrompt: "صف الهدف الذي تريد أن يحقّقه وكيل نِبراس",
  goalPlaceholder: "مثال: أصلِح أخطاء الصياغة في هذا الملفّ ثمّ ابنِه للتأكّد.",
  progress: "وكيل نِبراس يعمل…",
  header: (file, goal) => `# وكيل نِبراس — ${file}\n\nالهدف: ${goal}\n\n## الخطوات\n`,
  answerHeader: "\n## الجواب\n\n",
  failed: (e) => `\n\n⚠️ تعذّر إكمال المهمّة: ${e}\n`,
  cancelled: "\n\n(أُلغيت المهمّة.)\n",
  done: "\n",
};

/** يصوغ سطر خطوةٍ للعرض من ToolStep (kind/description/outcome/reason). */
function formatStep(step) {
  if (!step || typeof step !== "object") return "";
  const desc = step.description || step.kind || "";
  if (!desc) return ""; // خطوةٌ بلا وصفٍ ولا نوع ⇒ لا سطر (تجنّب «•» عارية).
  const icon = OUTCOME_ICON[step.outcome] || STEP_BULLET;
  const reason = step.reason ? ` — ${step.reason}` : "";
  return `${icon} ${desc}${reason}\n`;
}

/**
 * ينشئ أمر «وكيل»: يطلب هدفًا، يشغّل الحلقة الوكيليّة على الملفّ النشط، ويبثّ الخطوات ثمّ الجواب.
 * @param {import('./nebras-process.js').NebrasProcess} proc
 * @param {vscode.OutputChannel} channel قناة الإخراج العربيّة
 * @param {() => {permissionMode: string, locale: string}} getConfig
 */
function makeAgentCommand(proc, channel, getConfig) {
  return async function runAgentCommand() {
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
    // الوكيل يعمل على القرص (يقرأ/يكتب): تعديلاتٌ غير محفوظة ⇒ يعمل على نسخةٍ قديمة وقد يدوسها.
    // اعرِض حفظًا صريحًا قبل المتابعة (fail-safe: أيّ إغلاقٍ للحوار ⇒ إلغاء).
    if (doc.isDirty) {
      const choice = await vscode.window.showWarningMessage(
        COPY.dirtyTitle,
        { modal: true, detail: COPY.dirtyDetail },
        COPY.dirtySave,
      );
      if (choice !== COPY.dirtySave) return;
      if (!(await doc.save())) {
        vscode.window.showWarningMessage(COPY.saveFailed);
        return;
      }
    }
    if (!proc.isReady()) {
      vscode.window.showWarningMessage(COPY.notReady);
      void proc.start(); // حاول الإقلاع دون حجب.
      return;
    }

    // اطلب الهدف الذي يقود الحلقة (تعليمة «وكيل» إلزاميّة — يفرضها الخادم أيضًا).
    const goal = await vscode.window.showInputBox({
      prompt: COPY.goalPrompt,
      placeHolder: COPY.goalPlaceholder,
      ignoreFocusOut: true,
    });
    if (goal === undefined || !goal.trim()) return; // ألغى المستخدم أو هدفٌ فارغ ⇒ لا شيء.

    const cfg = getConfig();
    const params = {
      kind: TASK_AGENT,
      target: doc.fileName,
      instruction: goal,
      permission: cfg.permissionMode,
      locale: cfg.locale,
    };

    channel.clear();
    channel.append(COPY.header(path.basename(doc.fileName), goal.trim()));
    channel.show(true);

    // يُدرَج رأس «الجواب» مرّةً واحدةً عند أوّل قطعة جوابٍ (بعد الخطوات، فالبثّ مُبوَّب للجواب النهائيّ).
    let answerStarted = false;

    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: COPY.progress, cancellable: true },
      async (_progress, token) => {
        let cancelled = false;
        try {
          await runWithCancel(
            proc,
            params,
            (delta) => {
              // بعد الإلغاء لا تكتب شيئًا (الخادم قد يُكمِل الدورة الجارية قبل أن يُسقِطها): وإلّا
              // يظهر «## الجواب» وقطعٌ إضافيّة بعد سطر «(أُلغيت المهمّة.)».
              if (cancelled) return;
              if (!answerStarted) {
                channel.append(COPY.answerHeader);
                answerStarted = true;
              }
              channel.append(delta);
            },
            (step) => {
              if (cancelled) return; // لا تبثّ خطوةً بعد الإلغاء (تتوقّف القناة فورًا).
              channel.append(formatStep(step));
            },
            token,
            () => {
              cancelled = true;
            },
          );
          // نجاح: الخادم يبثّ الخطوات ثمّ الجواب ويعيد نتيجةً. الفشل يصل كرفض (JsonRpcError) لا كـresult،
          // فيُعالَج في catch (لا فرع ok===false — ميتٌ بحكم عقد الخادم).
          // إن حُسِم الوعد بنجاحٍ ثمّ وصل الإلغاء في النافذة الدقيقة بعده، اطبع سطر الإلغاء (لا «تمّ»).
          channel.append(cancelled ? COPY.cancelled : COPY.done);
        } catch (err) {
          if (cancelled) channel.append(COPY.cancelled);
          else channel.append(COPY.failed(String(err && err.message ? err.message : err)));
        }
      },
    );
  };
}

/**
 * يشغّل مهمّة «وكيل» مع دعم الإلغاء وبثّ الخطوات: يبدأ الطلب، يربط token بإشعار Cancel، ويوجّه
 * القطع (onDelta) والخطوات (onToolStep) للمستهلك. الإلغاء عبر proc.cancel(taskId).
 */
async function runWithCancel(proc, params, onDelta, onToolStep, token, onCancel) {
  let taskId;
  let cancelledBeforeStart = false;
  const sub = token.onCancellationRequested(() => {
    onCancel();
    if (taskId !== undefined) proc.cancel(taskId);
    else cancelledBeforeStart = true; // وصل الإلغاء قبل معرفة المعرّف ⇒ أرسِله فور توفّره.
  });
  try {
    return await proc.runTask(
      params,
      onDelta,
      (id) => {
        taskId = id;
        // سباقٌ نادر: أُلغيَ قبل onStart ⇒ لم يُرسَل Cancel بعد؛ أرسِله الآن كي لا يُكمِل الخادمُ عملًا ضائعًا.
        if (cancelledBeforeStart) proc.cancel(id);
      },
      onToolStep,
    );
  } finally {
    sub.dispose();
  }
}

module.exports = { makeAgentCommand, formatStep, COPY };
