// @ts-check
"use strict";
// امتداد نِبراس في محراب (م2ب): يوصّل عقل نِبراس (طبقة الذكاء الرسميّة للغة ص) بواجهة محراب
// عبر عقد nebras-protocol (JSON-RPC 2.0 على stdio) مع خادم مقيم. المزايا:
//   • mihrab.nebras.explainSelection — اشرح التحديد (بثّ حيّ).
//   • mihrab.nebras.runAgent          — وكيل: الحلقة الوكيليّة الكاملة (اقرأ→نفّذ→تحقّق، بثّ خطوات حيّ).
//   • mihrab.nebras.openChat          — دردشة (لوحة webview).
//   • mihrab.nebras.restart           — إعادة تشغيل الخادم.
//   • mihrab.nebras.toggleInlineCompletion — بدّل الإكمال السطريّ.
// كلّ نصّ ظاهر ثابت مسمّى (عربيّ-أوّلًا = بيانات واجهة).

const vscode = require("vscode");
const { NebrasProcess, readConfig } = require("./nebras-process.js");
const { makePermissionHandler } = require("./permission.js");
const { makeExplainCommand } = require("./explain-selection.js");
const { makeAgentCommand } = require("./agent.js");
const { registerChat } = require("./chat.js");
const { registerInlineCompletion } = require("./inline-completion.js");
const { registerFixDiagnostic } = require("./fix-diagnostic.js");

// معرّفات الأوامر (مصدر حقيقة واحد يطابق package.json).
const CMD_EXPLAIN = "mihrab.nebras.explainSelection";
const CMD_AGENT = "mihrab.nebras.runAgent";
const CMD_CHAT = "mihrab.nebras.openChat";
const CMD_RESTART = "mihrab.nebras.restart";
const CMD_TOGGLE_INLINE = "mihrab.nebras.toggleInlineCompletion";

const CFG_SECTION = "mihrab.nebras";
const CFG_INLINE = "inlineCompletion";

// أسماء قنوات الإخراج.
const LOG_CHANNEL = "نِبراس (سجلّ)";
const EXPLAIN_CHANNEL = "نِبراس";
const AGENT_CHANNEL = "نِبراس (وكيل)";

// نصوص شريط الحالة والإشعارات.
const COPY = {
  statusReady: "$(sparkle) نِبراس",
  statusStarting: "$(loading~spin) نِبراس…",
  statusOffline: "$(circle-slash) نِبراس",
  statusTipReady: "خادم نِبراس جاهز — انقر لفتح الدردشة",
  statusTipOffline: "خادم نِبراس متوقّف — انقر لإعادة التشغيل",
  restarted: "أُعيد تشغيل خادم نِبراس.",
  inlineOn: "فُعِّل الإكمال السطريّ لنِبراس.",
  inlineOff: "أُطفئ الإكمال السطريّ لنِبراس.",
};

/** @type {NebrasProcess | null} */
let proc = null;
/** @type {vscode.StatusBarItem | null} */
let statusItem = null;

/** يحدّث شريط الحالة حسب جاهزيّة الخادم. */
function updateStatus(ready) {
  if (!statusItem) return;
  if (ready) {
    statusItem.text = COPY.statusReady;
    statusItem.tooltip = COPY.statusTipReady;
    statusItem.command = CMD_CHAT;
  } else {
    statusItem.text = COPY.statusOffline;
    statusItem.tooltip = COPY.statusTipOffline;
    statusItem.command = CMD_RESTART;
  }
  statusItem.show();
}

function activate(context) {
  const log = vscode.window.createOutputChannel(LOG_CHANNEL);
  const explainChannel = vscode.window.createOutputChannel(EXPLAIN_CHANNEL);
  const agentChannel = vscode.window.createOutputChannel(AGENT_CHANNEL);
  context.subscriptions.push(log, explainChannel, agentChannel);

  // معالِج الموافقة (ق5/ق12): حوار نمطيّ للكتابة/التشغيل في «اقتراح/آمن».
  const permissionHandler = makePermissionHandler();
  proc = new NebrasProcess(context, log, permissionHandler);
  proc.onReadyChanged(updateStatus);

  // شريط الحالة.
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusItem.text = COPY.statusStarting;
  statusItem.show();
  context.subscriptions.push(statusItem);

  // قرّاء الإعداد المشترك (وضع الأذونات + اللغة) للأوامر.
  const getConfig = () => {
    const c = readConfig();
    return { permissionMode: c.permissionMode, locale: c.locale };
  };

  // الأوامر.
  context.subscriptions.push(
    vscode.commands.registerCommand(CMD_EXPLAIN, makeExplainCommand(proc, explainChannel, getConfig)),
    vscode.commands.registerCommand(CMD_AGENT, makeAgentCommand(proc, agentChannel, getConfig)),
    vscode.commands.registerCommand(CMD_CHAT, () => {
      if (proc) registerChat.open(context, proc, getConfig);
    }),
    vscode.commands.registerCommand(CMD_RESTART, async () => {
      if (!proc) return;
      statusItem && (statusItem.text = COPY.statusStarting);
      await proc.restart();
      vscode.window.showInformationMessage(COPY.restarted);
    }),
    vscode.commands.registerCommand(CMD_TOGGLE_INLINE, async () => {
      const cfg = vscode.workspace.getConfiguration(CFG_SECTION);
      const next = !(cfg.get(CFG_INLINE) === true);
      await cfg.update(CFG_INLINE, next, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(next ? COPY.inlineOn : COPY.inlineOff);
    }),
  );

  // تغيّر مجلّد مساحة العمل أثناء الجلسة: الخادم مقيم بجذر cwd أُقلع به؛ إن تبدّل الجذر يعيد التشغيل
  // كي يشتقّ workspaceRoot الجديد (وإلّا يرفض ملفّات المجلّد الجديد بـ«خارج مجلّد العمل»).
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      if (proc) void proc.restartIfWorkspaceChanged();
    }),
  );

  // «أصلِح بنِبراس» [SAD-11]: إجراء كودٍ سريع على التشخيصات يشغّل الحلقة الوكيليّة بسياق الخطأ
  // (يشارك قناة الوكيل وتحضيره). يربط تشخيصات المحرّر بحلقة الإصلاح.
  registerFixDiagnostic(context, proc, agentChannel, getConfig);

  // الدردشة (لوحة webview) تُفتح كسولًا عبر أمرها (registerChat.open) — لا تهيئة عند التنشيط.
  // الإكمال السطريّ (مطفأ افتراضًا؛ يُفعَّل بالإعداد).
  registerInlineCompletion(context, proc, getConfig, log);

  // أطلق الخادم المقيم عند اكتمال الإقلاع (رفض الوعد مُبتلَع — الفشل يُبلَّغ داخل start).
  void proc.start().catch((e) => log.appendLine(`[نِبراس] بدء فشل: ${e}`));
}

function deactivate() {
  const p = proc;
  proc = null;
  if (p) return p.dispose();
  return undefined;
}

module.exports = { activate, deactivate };
