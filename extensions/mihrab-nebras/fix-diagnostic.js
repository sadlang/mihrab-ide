// @ts-check
"use strict";
// «أصلِح بنِبراس» (SAD-11): يربط تشخيصات المحرّر (من عميل ص LSP أو جسر الفحص) بحلقة نِبراس
// الوكيليّة عبر إجراء كودٍ سريع (Quick Fix). المستخدم يرى مصباح الإصلاح فوق الخطأ، يختار «أصلِح
// بنِبراس» فتُبنى تعليمةٌ من التشخيص (الرسالة + السطر + نصّ الكود) ويشغّلها الوكيل تحت الأذونات
// (ق5/ق12، permission.js) — فيتّصل الذكاء بحلقة الإصلاح بدل أن يكون منفصلًا عنها.
//
// كلّ نصّ ظاهر ثابت مسمّى (عربيّ-أوّلًا = بيانات واجهة). لا سلاسل منطقيّة خام.

const vscode = require("vscode");
const { runAgentTask, ensureDocReadyForAgent } = require("./agent.js");

// معرّف لغة ص (يطابق بقيّة الامتداد) واسم أمر الإصلاح ونوع الإجراء.
const SAD_LANG_ID = "sad";
const FIX_COMMAND = "mihrab.nebras.fixDiagnostic";
// محدِّد المستندات لمزوّد الإجراءات (ملفّات ص على القرص).
const SAD_SELECTOR = { language: SAD_LANG_ID, scheme: "file" };
// حدّ طول مقتطف رسالة التشخيص في عنوان الإجراء (كي لا يطول المصباح).
const MAX_TITLE_MSG = 60;
// شدّات التشخيص القابلة للإصلاح: أخطاء وتحذيرات فقط (لا معلومات/تلميحات — ليست أعطالًا). [مراجعة Amelia م4]
const FIXABLE_SEVERITIES = [vscode.DiagnosticSeverity.Error, vscode.DiagnosticSeverity.Warning];

const COPY = {
  actionTitle: (msg) => `أصلِح بنِبراس: ${msg}`,
  actionTitleGeneric: "أصلِح بنِبراس",
  noDiagnostic: "لا يوجد تشخيص لإصلاحه في هذا الموضع.",
  // تعليمة الإصلاح المبنيّة من التشخيص (هدف الحلقة الوكيليّة).
  fixInstruction: (line, message, code, snippet) =>
    `أصلِح الخطأ التالي في ملفّ ص عند السطر ${line}${code ? ` (رمز ${code})` : ""}: «${message}».` +
    (snippet ? `\nالسطر المعنيّ:\n${snippet}` : "") +
    `\nاقترح أقلّ تعديلٍ يُصلح الخطأ ثمّ طبّقه، وتحقّق أنّ الملفّ صار سليمًا.`,
};

/** يقصّ رسالة التشخيص لعنوان الإجراء (سطر واحد، طول محدود). */
function shortMessage(message) {
  const firstLine = String(message || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || "";
  return firstLine.length > MAX_TITLE_MSG ? firstLine.slice(0, MAX_TITLE_MSG - 1) + "…" : firstLine;
}

/** نصّ التشخيص من كود+رمز (String|Number|{value}). */
function diagnosticCode(code) {
  if (code === undefined || code === null) return "";
  if (typeof code === "object") return String(code.value !== undefined ? code.value : "");
  return String(code);
}

/**
 * مزوّد إجراءات كود «أصلِح بنِبراس»: لكلّ تشخيصٍ في المدى يقترح إصلاحًا سريعًا (QuickFix) يستدعي
 * أمر الإصلاح بوسيطَي (uri، تشخيص). نقيّ إزاء غياب التشخيصات (يُرجع مصفوفة فارغة).
 */
class NebrasFixCodeActionProvider {
  provideCodeActions(document, _range, context) {
    const diagnostics = (context && Array.isArray(context.diagnostics)) ? context.diagnostics : [];
    const actions = [];
    for (const d of diagnostics) {
      // اقصُر على الأخطاء/التحذيرات (لا معلومات/تلميحات). [مراجعة Amelia م4]
      if (d.severity !== undefined && !FIXABLE_SEVERITIES.includes(d.severity)) continue;
      const short = shortMessage(d.message);
      const title = short ? COPY.actionTitle(short) : COPY.actionTitleGeneric; // فارغة ⇒ العامّ [Amelia م2]
      const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
      action.diagnostics = [d];
      action.command = {
        command: FIX_COMMAND,
        title: COPY.actionTitleGeneric,
        arguments: [document.uri, d],
      };
      actions.push(action);
    }
    return actions;
  }
}

/**
 * ينشئ أمر «أصلِح بنِبراس»: يفتح المستند، يبني تعليمةً من التشخيص، ويشغّل الحلقة الوكيليّة عليه.
 * يُستدعى بوسيطَي (uri، تشخيص) من مزوّد إجراءات الكود.
 * @param {import('./nebras-process.js').NebrasProcess} proc
 * @param {vscode.OutputChannel} channel قناة إخراج الوكيل العربيّة
 * @param {() => {permissionMode: string, locale: string}} getConfig
 */
function makeFixCommand(proc, channel, getConfig) {
  return async function fixDiagnostic(uri, diagnostic) {
    // يُستدعى بوسائط من الإجراء فقط؛ استدعاؤه من لوحة الأوامر (بلا وسائط) يُبلّغ لا ينهار.
    if (!uri || !diagnostic) {
      vscode.window.showWarningMessage(COPY.noDiagnostic);
      return;
    }
    let doc;
    try {
      doc = await vscode.workspace.openTextDocument(uri);
    } catch {
      vscode.window.showWarningMessage(COPY.noDiagnostic);
      return;
    }
    // نفس تحضير الوكيل (ملفّ ص محفوظ + حفظ المتّسخ + جاهزيّة الخادم).
    if (!(await ensureDocReadyForAgent(proc, doc))) return;

    const line = (diagnostic.range && diagnostic.range.start ? diagnostic.range.start.line : 0) + 1;
    const code = diagnosticCode(diagnostic.code);
    const snippet = lineSnippet(doc, diagnostic.range);
    const instruction = COPY.fixInstruction(line, String(diagnostic.message || ""), code, snippet);
    await runAgentTask(proc, channel, getConfig, doc, instruction);
  };
}

/** يستخرج نصّ سطر التشخيص من المستند (سياقٌ للوكيل)، أو "" إن تعذّر. */
function lineSnippet(doc, range) {
  try {
    const line = range && range.start ? range.start.line : 0;
    if (line >= 0 && line < doc.lineCount) return doc.lineAt(line).text;
  } catch {
    /* تجاهل */
  }
  return "";
}

/**
 * يسجّل ميزة «أصلِح بنِبراس»: مزوّد إجراءات الكود + أمر الإصلاح. يُدرَج في context.subscriptions.
 * @param {vscode.ExtensionContext} context
 * @param {import('./nebras-process.js').NebrasProcess} proc
 * @param {vscode.OutputChannel} channel
 * @param {() => {permissionMode: string, locale: string}} getConfig
 */
function registerFixDiagnostic(context, proc, channel, getConfig) {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(SAD_SELECTOR, new NebrasFixCodeActionProvider(), {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
    vscode.commands.registerCommand(FIX_COMMAND, makeFixCommand(proc, channel, getConfig)),
  );
}

module.exports = {
  registerFixDiagnostic,
  makeFixCommand,
  NebrasFixCodeActionProvider,
  shortMessage,
  diagnosticCode,
  FIX_COMMAND,
  COPY,
};
