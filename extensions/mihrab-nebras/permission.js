// @ts-check
"use strict";
// معالِج موافقة الأذونات (ق5/ق12): يعرض حوارًا نمطيًّا حين يطلب خادم نِبراس إذنًا على خطوة
// أداة (كتابة/بناء/تشغيل) في الوضع «اقتراح/آمن». الوضع «طيّار» لا يصل هنا (الخادم يقرّر ذاتيًّا
// ضمن حدوده الصلبة). عرض الفرق (diff) اختياريّ في محرّر مؤقّت للقراءة.

const vscode = require("vscode");

// وصف نوع الخطوة للعرض (يطابق ToolStep.kind في العقد).
const KIND_LABEL = {
  "اقرأ": "قراءة",
  "اكتب": "كتابة",
  "ابنِ": "بناء",
  "شغّل": "تشغيل",
};

const COPY = {
  title: (kindLabel) => `نِبراس يطلب إذن ${kindLabel}`,
  allow: "اسمح",
  deny: "ارفض",
  viewDiff: "اعرض الفرق",
  pathLine: (p) => `المسار: ${p}`,
  cmdLine: (c) => `الأمر: ${c}`,
};

// لغة معاينة الفرق (unified diff) في المحرّر المؤقّت.
const DIFF_LANGUAGE = "diff";

/** يعرض الفرق المقترَح في مستند مؤقّت للقراءة (لا يُحفَظ). */
async function showDiffPreview(diff) {
  try {
    const doc = await vscode.workspace.openTextDocument({ content: diff, language: DIFF_LANGUAGE });
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
  } catch {
    /* المعاينة تحسينيّة — فشلها لا يمنع القرار. */
  }
}

/**
 * ينشئ معالِج موافقة يربطه مدير العمليّة. يُرجع دالّة (taskId, step, reason) => Promise<boolean>.
 * fail-safe: أيّ إغلاق/إلغاء للحوار ⇒ رفض (لا كتابة بلا موافقة صريحة).
 */
function makePermissionHandler() {
  return async function handlePermission(_taskId, step, reason) {
    if (!step || typeof step !== "object") return false;
    const kindLabel = KIND_LABEL[step.kind] || step.kind || "";
    const detailParts = [];
    if (step.description) detailParts.push(String(step.description));
    if (reason) detailParts.push(String(reason));
    if (step.path) detailParts.push(COPY.pathLine(step.path));
    if (step.command) detailParts.push(COPY.cmdLine(step.command));
    const detail = detailParts.join("\n");

    const buttons = [COPY.allow, COPY.deny];
    if (step.diff) buttons.splice(1, 0, COPY.viewDiff);

    // حلقة: «اعرض الفرق» يعيد الحوار بعد المعاينة (لا يُحسَم القرار).
    for (;;) {
      const choice = await vscode.window.showWarningMessage(
        COPY.title(kindLabel),
        { modal: true, detail },
        ...buttons,
      );
      if (choice === COPY.viewDiff) {
        await showDiffPreview(step.diff);
        continue;
      }
      return choice === COPY.allow;
    }
  };
}

module.exports = { makePermissionHandler, COPY, KIND_LABEL };
