// @ts-check
"use strict";
// وحدة مشتركة لحلّ أدوات ص المدمجة (sad-run/sad-check/sad-build): مصدر حقيقة واحد لاسم مجلّد
// bin/ وسلوك الحلّ (المدمج مع محراب أوّلًا ثمّ PATH). يستهلكها extension.js (تشغيل/بناء) و
// diagnostics.js (فحص) — فلا يتباعد سلوك أدوات متطابقة الدور ولا يتكرّر ثابت المجلّد. [تدقيق #2]

const cp = require("child_process");
const fs = require("fs");
const path = require("path");

// مجلّد الثنائيّات المدمجة داخل الامتداد (يحقنه build.sh؛ يطابقه حارس L0).
const BUNDLED_BIN_DIR = "bin";
// أداة فحص مسار النظام (where على ويندوز، which على غيره).
const PATH_PROBE = process.platform === "win32" ? "where" : "which";
// مهلة فحص التوفّر (لا يعلّق المحرّر على مسار مرضيّ).
const PROBE_TIMEOUT_MS = 4000;

/** يحلّ مسار أداة ص المدمجة: bin/<exe> المدمج مع محراب أوّلًا (يعمل دون تثبيت)، ثمّ اسم PATH احتياطًا. */
function resolveBundledTool(context, exeName, fallbackName) {
  const bundled = path.join(context.extensionPath, BUNDLED_BIN_DIR, exeName);
  try {
    // ملفّ فعليّ لا مجلّد (accessSync/X_OK على ويندوز = وجود فقط، ينجح على مجلّد أيضًا). [L8]
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
 * يفحص توفّر الأمر: مسار مطلق ⇒ تحقّق وجود (يمسك حذفًا بين التنشيط والتشغيل [N3]). وإلا فحص PATH
 * عبر where/which ⇒ يُرجع المسار المطلق الأوّل أو null. فائدته: **تحقّق مسبق من التوفّر** لعرض
 * تلميح تثبيت واضح قبل محاولة التشغيل، وترقية الاسم المجرّد لمسار محلول. نقيّ: لا يمسّ حالة عامّة.
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
