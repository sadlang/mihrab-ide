// @ts-check
"use strict";
// ⚠️ ملفّ مولَّد آليًّا — لا تُحرِّره يدويًّا. حرِّر المصدر ثمّ أعِد التوليد.
//   المصدر:  contract/protocol-contract.yaml
//   المولِّد: contract/gen_contract.py   (حارس التطابق: gen_contract.py --check)
//
// عقد سلك نِبراس (يعكس @nebras/protocol): مصدر حقيقة واحد يملكه محراب، يمنع التباعد
// الصامت بين ملفّات الامتداد CommonJS الخارجة عن شجرة بناء TypeScript. كلّ ثابت هنا
// يُستهلَك عبر require، لا يُعاد إعلانه في الملفّات.


// ── protocol: نسخة العقد (SemVer) — تُرسَل في المصافحة Initialize. ──
const PROTOCOL_VERSION = "0.1.0";

// ── methods: طرائق JSON-RPC (client→server ما لم يُذكر خلافه). ──
const METHOD_INITIALIZE         = "nebras/initialize";
const METHOD_TASK               = "nebras/task";
const METHOD_TASK_PROGRESS      = "nebras/taskProgress";  // server→client (بثّ).
const METHOD_REQUEST_PERMISSION = "nebras/requestPermission";  // server→client (طلب موافقة، معرّفات سالبة).
const METHOD_CANCEL             = "nebras/cancel";
const METHOD_SHUTDOWN           = "nebras/shutdown";

// ── jsonrpc: ثوابت JSON-RPC 2.0 القياسيّة (تطابق ErrorCode في العقد) — لا أرقام سحريّة. ──
const JSONRPC_VERSION          = "2.0";
const JSONRPC_METHOD_NOT_FOUND = -32601;
const JSONRPC_INTERNAL_ERROR   = -32603;

// ── framing: تأطير Content-Length عبر stdio (بايتات UTF-8، لا أحرف) — يطابق core/server/stdio. ──
const CONTENT_LENGTH  = "Content-Length";
const HEADER_SEP      = "\r\n\r\n";
const MAX_FRAME_BYTES = 8388608;  // سقف الإطار الواحد = 8 ميغابايت (حماية ذاكرة).

// ── tasks: أصناف المهامّ (TaskKind) — قيم عربيّة عقديّة تطابق الخادم حرفيًّا. ──
const TASK_EXPLAIN  = "اشرح";
const TASK_AGENT    = "وكيل";
const TASK_COMPLETE = "أكمل";  // طبقة خفيفة — تُشحَن خادميًّا لاحقًا.

// ── roles: أدوار المحادثة (ROLE_*) — تُمرَّر مع كلّ مهمّة (الخادم عديم الحالة). ──
const ROLE_USER      = "مستخدم";
const ROLE_ASSISTANT = "مساعد";

// ── outcomes: وسوم حصيلة خطوة الوكيل (OUTCOME_*) — يعرضها الخادم في بثّ التقدّم. ──
const OUTCOME_APPLIED = "طُبِّق";
const OUTCOME_DENIED  = "مرفوض";
const OUTCOME_PENDING = "معلّق";

// ── cli: وسائط تشغيل الخادم المرجعيّ — تطابق واجهة نِبراس السطريّة (`nebras خادم --نقل stdio`). ──
const SERVE_COMMAND   = "خادم";
const TRANSPORT_FLAG  = "--نقل";
const TRANSPORT_STDIO = "stdio";

module.exports = Object.freeze({
  PROTOCOL_VERSION,
  METHOD_INITIALIZE,
  METHOD_TASK,
  METHOD_TASK_PROGRESS,
  METHOD_REQUEST_PERMISSION,
  METHOD_CANCEL,
  METHOD_SHUTDOWN,
  JSONRPC_VERSION,
  JSONRPC_METHOD_NOT_FOUND,
  JSONRPC_INTERNAL_ERROR,
  CONTENT_LENGTH,
  HEADER_SEP,
  MAX_FRAME_BYTES,
  TASK_EXPLAIN,
  TASK_AGENT,
  TASK_COMPLETE,
  ROLE_USER,
  ROLE_ASSISTANT,
  OUTCOME_APPLIED,
  OUTCOME_DENIED,
  OUTCOME_PENDING,
  SERVE_COMMAND,
  TRANSPORT_FLAG,
  TRANSPORT_STDIO,
});
