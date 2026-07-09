// @ts-check
"use strict";
// جسر تشخيص ص (SAD-02): يشغّل «sad-check --json» على ملفّ ص عند الحفظ (مع تهدئة) أو بأمر
// يدويّ، ويحوّل التشخيصات المهيكلة (سطر/عمود/شدّة/رمز/رسالة عربيّة) إلى DiagnosticCollection
// ⇒ تموّجات + لوحة مشاكل بالعربية. sad-check لا يبني (تحليل + فحص ملكيّة فقط) فيناسب الحفظ
// المتكرّر. stdout قناة JSON نظيفة (المصرّف يوجّه آثاره التشخيصيّة لـstderr) — نقرأ stdout فقط.
//
// كلّ literal منطقيّ ثابت مسمّى؛ نصوص COPY نسخة واجهة (استثناء مقبول). منطق التحليل (mapCheckOutput/
// conciseMessage) نقيّ بلا vscode — قابل للاختبار وحدويًّا.

const vscode = require("vscode");
const cp = require("child_process");
const fs = require("fs");
const path = require("path");

// اسم أداة الفحص (المدمجة داخل الامتداد أوّلًا ثمّ على PATH) ولاحقة المنصّة.
const SAD_CHECK = "sad-check";
const SAD_CHECK_EXE = process.platform === "win32" ? SAD_CHECK + ".exe" : SAD_CHECK;
const BUNDLED_BIN_DIR = "bin";
// وسيط الإخراج الآليّ لـsad-check.
const JSON_FLAG = "--json";
// اسم مجموعة التشخيص (يظهر مصدرًا في لوحة المشاكل).
const DIAG_COLLECTION = "ص";
// تهدئة الحفظ: نؤجّل الفحص كي لا نُشغّل الأداة على كلّ حفظ متتابع سريع.
const DEBOUNCE_MS = 400;
// مهلة أمان للفحص (لا يعلّق المحرّر على ملفّ مرضيّ).
const CHECK_TIMEOUT_MS = 15000;
// حدّ حجم stdout (حماية من مخرجات شاذّة).
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
// حدّ طول رسالة التموّج (الرسائل المُحسّنة متعدّدة الأسطر — نأخذ سطرًا موجزًا).
const MAX_MSG_LEN = 300;
// بادئات الزخرفة الشائعة في مخرجات المصرّف تُزال من رسالة التموّج الموجزة.
const DECOR_PREFIX_RE = /^(?:⛔\s*|✗\s*|\(AR\)\s*|\(EN\)\s*)+/;

// خريطة الشدّة النصّيّة (من sad-check) إلى شدّة VSCode — تُقرأ **كسولًا** عند التحويل لا وقت
// التحميل، كي لا يلمس تحميلُ الوحدة أعضاءَ vscode (يُبقي الوحدة قابلة للتحميل ببديل مبسّط).
function severityOf(name) {
  const sev = vscode.DiagnosticSeverity;
  switch (name) {
    case "warning":
      return sev.Warning;
    case "info":
      return sev.Information;
    case "note":
    case "hint":
      return sev.Hint;
    case "error":
    default:
      return sev.Error;
  }
}

// نصوص الواجهة (عربيّة-أوّلًا = بيانات واجهة).
const COPY = {
  checkUnavailable: `لم يُعثَر على أداة الفحص (‹${SAD_CHECK}›). ثبّت أدوات ص أو أضِفها إلى PATH.`,
  checkFailed: (e) => `تعذّر فحص الملفّ: ${e}`,
  noSadFile: "افتح ملفّ ص واحفظه على القرص أوّلًا كي يُفحَص.",
  clean: "لا مشكلات في هذا الملفّ.",
};

// ───────────────────────── منطق نقيّ (بلا vscode) ─────────────────────────

/** يحوّل قيمة إلى عدد صحيح آمن (0 عند الفشل). */
function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * يستخلص سطرًا موجزًا للتموّج من رسالة مُحسّنة قد تكون متعدّدة الأسطر: أوّل سطر غير فارغ بعد
 * إزالة زخارف البادئة (⛔ / «(AR)» …). يفضّل العربيّة ثمّ الإنجليزيّة، ويقصّ الطول الطويل.
 * @param {unknown} ar @param {unknown} en @returns {string}
 */
function conciseMessage(ar, en) {
  const src = typeof ar === "string" && ar.trim() ? ar : typeof en === "string" ? en : "";
  const firstLine = src.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || src.trim();
  const cleaned = firstLine.replace(DECOR_PREFIX_RE, "").trim();
  return cleaned.length > MAX_MSG_LEN ? cleaned.slice(0, MAX_MSG_LEN - 1) + "…" : cleaned;
}

/**
 * محلّل نقيّ لناتج «sad-check --json»: يُرجع مصفوفة لكلّ ملفّ {file, diagnostics[]} بشكل محايد
 * قابل للاختبار. تشخيص = {line0, col0, endCol0, severity, code, message}. سطر/عمود sad-check
 * بأساس 1 ⇒ نحوّلها لأساس 0، ونضمن عرض تموّج ≥1، ونُزيل التكرار بنفس (سطر:عمود:رسالة)
 * (المحلّل قد يُصدر عدّة تشخيصات متطابقة الموضع أثناء الاسترداد). يرمي إن كان JSON غير صالح.
 * @param {string} jsonText @returns {Array<{file:string, diagnostics:Array<object>}>}
 */
function mapCheckOutput(jsonText) {
  const data = JSON.parse(jsonText);
  const results = data && Array.isArray(data.results) ? data.results : [];
  const out = [];
  for (const r of results) {
    if (!r || typeof r.file !== "string") continue;
    const raw = Array.isArray(r.diagnostics) ? r.diagnostics : [];
    const diagnostics = [];
    const seen = new Set();
    for (const d of raw) {
      if (!d || typeof d !== "object") continue;
      const line0 = Math.max(0, (toInt(d.line) || 1) - 1);
      const col0 = Math.max(0, (toInt(d.column) || 1) - 1);
      const len = Math.max(0, toInt(d.length));
      const endCol0 = col0 + (len > 0 ? len : 1); // عرض 1 على الأقلّ كي يظهر التموّج
      const message = conciseMessage(d.messageAr, d.message);
      const key = line0 + ":" + col0 + ":" + message;
      if (seen.has(key)) continue;
      seen.add(key);
      diagnostics.push({
        line0,
        col0,
        endCol0,
        severity: typeof d.severity === "string" ? d.severity : "error",
        code: typeof d.code === "string" ? d.code : "",
        message,
      });
    }
    out.push({ file: r.file, diagnostics });
  }
  return out;
}

// ───────────────────────── طبقة vscode ─────────────────────────

/** يحلّ مسار sad-check: المدمج داخل الامتداد أوّلًا (يعمل دون تثبيت)، ثمّ اسم PATH احتياطًا. */
function resolveCheckCmd(context) {
  const bundled = path.join(context.extensionPath, BUNDLED_BIN_DIR, SAD_CHECK_EXE);
  try {
    if (fs.statSync(bundled).isFile()) {
      fs.accessSync(bundled, fs.constants.X_OK);
      return bundled;
    }
  } catch {
    // لا ثنائيّ مدمج — يسقط إلى PATH.
  }
  return SAD_CHECK;
}

/** يبني vscode.Diagnostic من تشخيص محايد. */
function toVscodeDiagnostic(d) {
  const range = new vscode.Range(d.line0, d.col0, d.line0, d.endCol0);
  const diag = new vscode.Diagnostic(range, d.message, severityOf(d.severity));
  diag.source = DIAG_COLLECTION;
  if (d.code) diag.code = d.code;
  return diag;
}

/**
 * جسر التشخيص: يملك DiagnosticCollection ويشغّل sad-check على الطلب (حفظ مهدّأ أو أمر يدويّ).
 * دورة الحياة يديرها المُستدعِي (extension.activate) عبر context.subscriptions.
 */
class SadDiagnostics {
  /**
   * @param {vscode.ExtensionContext} context
   * @param {{ isSadFile: (doc: vscode.TextDocument) => boolean, log?: (m: string) => void }} opts
   */
  constructor(context, opts) {
    this._collection = vscode.languages.createDiagnosticCollection(DIAG_COLLECTION);
    this._checkCmd = resolveCheckCmd(context);
    this._isSadFile = opts.isSadFile;
    this._log = opts.log || (() => {});
    /** @type {Map<string, NodeJS.Timeout>} fsPath → مؤقّت التهدئة */
    this._timers = new Map();
    this._disposed = false;
  }

  /** يجدول فحصًا مهدّأً لمستند (مسار الحفظ). يتجاهل غير ملفّات ص بصمت. */
  scheduleCheck(document) {
    if (this._disposed || !document || !this._isSadFile(document)) return;
    const key = document.uri.fsPath;
    const prev = this._timers.get(key);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      this._timers.delete(key);
      void this._runCheck(document, false);
    }, DEBOUNCE_MS);
    if (t.unref) t.unref();
    this._timers.set(key, t);
  }

  /** فحص فوريّ (الأمر اليدويّ): يبلّغ إن لم يكن ملفّ ص، ويعرض «لا مشكلات» عند النظافة. */
  async checkNow(document) {
    if (this._disposed) return;
    if (!document || !this._isSadFile(document)) {
      vscode.window.showWarningMessage(COPY.noSadFile);
      return;
    }
    await this._runCheck(document, true);
  }

  /** يشغّل sad-check --json على الملفّ ويطبّق النتيجة. interactive ⇒ يعرض رسائل للمستخدم. */
  _runCheck(document, interactive) {
    return new Promise((resolve) => {
      const file = document.uri.fsPath;
      // على فشل الإطلاق (ENOENT/EACCES) يُطلق execFile ردّ النداء وحدث 'error' كليهما؛ نضمن
      // معالجة أوّل حدث فقط كي لا تتكرّر الرسائل التفاعليّة ولا يُعاد تطبيق النتيجة.
      let settled = false;
      const settle = () => (settled ? false : (settled = true));
      let child;
      try {
        child = cp.execFile(
          this._checkCmd,
          [JSON_FLAG, file],
          { timeout: CHECK_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true },
          (err, stdout) => {
            if (!settle()) return;
            // execFile يمرّر err عند rc≠0 (طبيعيّ: الملفّ به أخطاء) — نعتمد على stdout لا rc.
            this._apply(document, String(stdout || ""), err, interactive);
            resolve();
          },
        );
        child.on("error", (e) => {
          if (!settle()) return;
          // ENOENT (الأداة غير موجودة) وغيره — لا نمسّ تشخيصات سابقة صالحة.
          if (interactive) {
            vscode.window.showWarningMessage(
              e && e.code === "ENOENT" ? COPY.checkUnavailable : COPY.checkFailed(e && e.message ? e.message : e),
            );
          }
          this._log(`[ص-فحص] فشل تشغيل الأداة: ${e}`);
          resolve();
        });
      } catch (e) {
        if (!settle()) return;
        if (interactive) vscode.window.showWarningMessage(COPY.checkFailed(String(e)));
        this._log(`[ص-فحص] استثناء: ${e}`);
        resolve();
      }
    });
  }

  /** يحلّل stdout ويضبط تشخيصات الملفّ (فارغة ⇒ تمسح القديمة). */
  _apply(document, stdout, err, interactive) {
    if (this._disposed) return;
    let mapped;
    try {
      mapped = mapCheckOutput(stdout);
    } catch (e) {
      // ناتج غير صالح (أداة غائبة/غير متوقّعة): لا نمسح تشخيصات صالحة سابقة — نكتفي بالسجلّ.
      this._log(`[ص-فحص] ناتج JSON غير صالح: ${e}`);
      if (interactive && err && err.code === "ENOENT") {
        vscode.window.showWarningMessage(COPY.checkUnavailable);
      }
      return;
    }
    // شغّلنا الأداة على ملفّ واحد ⇒ نأخذ نتيجته الأولى (إن وُجدت).
    const first = mapped[0];
    const diags = first ? first.diagnostics : [];
    this._collection.set(document.uri, diags.map(toVscodeDiagnostic));
    if (interactive && diags.length === 0) {
      vscode.window.showInformationMessage(COPY.clean);
    }
  }

  /** إغلاق: يلغي المؤقّتات ويفكّك المجموعة. */
  dispose() {
    this._disposed = true;
    for (const t of this._timers.values()) clearTimeout(t);
    this._timers.clear();
    this._collection.dispose();
  }
}

module.exports = { SadDiagnostics, mapCheckOutput, conciseMessage, DIAG_COLLECTION, COPY };
