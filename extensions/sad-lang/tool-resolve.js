// @ts-check
"use strict";
// حلّ الثنائيّ المدمج لخادم ص LSP (sad-lsp): المدمج مع محراب في bin/ أوّلًا (يعمل دون تثبيت)،
// ثمّ اسم PATH احتياطًا (تدهور رشيق). يعكس نمط mihrab-welcome/tool-resolve.js (أدوات run/build/check)
// — امتداد مستقلّ لا يعتمد على غيره. يطابقه حارس L0 (_sad_lsp_ext).

const cp = require("child_process");
const fs = require("fs");
const path = require("path");

// مجلّد الثنائيّات المدمجة داخل الامتداد (يحقنه build.sh؛ يطابقه حارس L0).
const BUNDLED_BIN_DIR = "bin";
// أداة فحص مسار النظام (where على ويندوز، which على غيره).
const PATH_PROBE = process.platform === "win32" ? "where" : "which";
// مهلة فحص التوفّر (لا يعلّق المحرّر على مسار مرضيّ).
const PROBE_TIMEOUT_MS = 4000;

/** يحلّ مسار أداة ص المدمجة: bin/<exe> المدمج مع محراب أوّلًا، ثمّ اسم PATH احتياطًا. */
function resolveBundledTool(context, exeName, fallbackName) {
  const bundled = path.join(context.extensionPath, BUNDLED_BIN_DIR, exeName);
  try {
    // ملفّ فعليّ لا مجلّد (accessSync/X_OK على ويندوز = وجود فقط، ينجح على مجلّد أيضًا).
    if (fs.statSync(bundled).isFile()) {
      fs.accessSync(bundled, fs.constants.X_OK);
      return bundled; // مسار مطلق للثنائيّ المدمج
    }
  } catch {
    // لا ثنائيّ مدمج — يسقط إلى PATH.
  }
  return fallbackName; // اسم PATH (قد يُرقّى لمسار مطلق عبر probeTool).
}

/**
 * يفحص توفّر الأمر: مسار مطلق ⇒ تحقّق وجود؛ وإلا فحص PATH عبر where/which ⇒ يُرجع المسار
 * المطلق الأوّل أو null. فائدته: تحقّق مسبق من التوفّر لعرض تلميح تثبيت واضح قبل محاولة الإطلاق.
 * نقيّ: لا يمسّ حالة عامّة.
 * @param {string} cmd @returns {Promise<string|null>}
 */
function probeTool(cmd) {
  if (path.isAbsolute(cmd)) {
    try {
      return Promise.resolve(fs.statSync(cmd).isFile() ? cmd : null);
    } catch {
      return Promise.resolve(null);
    }
  }
  return new Promise((resolve) => {
    try {
      const child = cp.execFile(PATH_PROBE, [cmd], { timeout: PROBE_TIMEOUT_MS }, (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const first = String(stdout || "")
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)[0];
        resolve(first || null);
      });
      child.on("error", () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

module.exports = { BUNDLED_BIN_DIR, PATH_PROBE, resolveBundledTool, probeTool };
