// @ts-check
"use strict";
// ثوابت بروتوكول خادم اللغة (LSP) المستعملة في عميل ص: أسماء الطرق والتعدادات القياسيّة.
// معرّفة كثوابت مسمّاة (لا سلاسل حرفيّة منطقيّة مبعثرة). المرجع: مواصفة LSP 3.17.

// ── دورة الحياة ──
const M_INITIALIZE = "initialize";
const M_INITIALIZED = "initialized";
const M_SHUTDOWN = "shutdown";
const M_EXIT = "exit";

// ── مزامنة المستند ──
const M_DID_OPEN = "textDocument/didOpen";
const M_DID_CHANGE = "textDocument/didChange";
const M_DID_SAVE = "textDocument/didSave";
const M_DID_CLOSE = "textDocument/didClose";

// ── ميزات عند الطلب (اليوم الأوّل) ──
const M_COMPLETION = "textDocument/completion";
const M_HOVER = "textDocument/hover";
const M_DEFINITION = "textDocument/definition";

// ── إشعار بثّ خادم→عميل ──
const M_PUBLISH_DIAGNOSTICS = "textDocument/publishDiagnostics";

// ── طلبات خادم→عميل شائعة (نردّ عليها fail-safe في العميل) ──
const M_REGISTER_CAPABILITY = "client/registerCapability";
const M_UNREGISTER_CAPABILITY = "client/unregisterCapability";
const M_WORK_DONE_CREATE = "window/workDoneProgress/create";
const M_CONFIGURATION = "workspace/configuration";

// ملاحظة: مزامنة المستند تستعمل نمط Full ضمنيًّا (النصّ الكامل في كلّ didChange، انظر DocumentSync
// في extension.js) تفاديًا لحساب إزاحات UTF-16 التزايديّة يدويًّا — فلا حاجة لثوابت TextDocumentSyncKind.

// ── ترميز المواضع الذي يفترضه العميل (أعمدة LSP بوحدات UTF-16، وهو افتراض VS Code) ──
const POSITION_ENCODING_UTF16 = "utf-16";

// ── درجات خطورة التشخيص (LSP DiagnosticSeverity) المستعملة في المحوّل. الافتراض (Hint) يُعالَج
//    في toVscodeSeverity دون ثابت مسمّى، فلا نُصدّر قيمة غير مستعملة. ──
const SEVERITY_ERROR = 1;
const SEVERITY_WARNING = 2;
const SEVERITY_INFORMATION = 3;

module.exports = {
  M_INITIALIZE,
  M_INITIALIZED,
  M_SHUTDOWN,
  M_EXIT,
  M_DID_OPEN,
  M_DID_CHANGE,
  M_DID_SAVE,
  M_DID_CLOSE,
  M_COMPLETION,
  M_HOVER,
  M_DEFINITION,
  M_PUBLISH_DIAGNOSTICS,
  M_REGISTER_CAPABILITY,
  M_UNREGISTER_CAPABILITY,
  M_WORK_DONE_CREATE,
  M_CONFIGURATION,
  POSITION_ENCODING_UTF16,
  SEVERITY_ERROR,
  SEVERITY_WARNING,
  SEVERITY_INFORMATION,
};
