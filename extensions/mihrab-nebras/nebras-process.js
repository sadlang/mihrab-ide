// @ts-check
"use strict";
// مدير عمليّة خادم نِبراس المقيمة (م2ب): يُطلق `nebras خادم --نقل stdio` كعمليّة فرعيّة
// حيّة طوال جلسة محراب (لا دورة حياة لكلّ استعلام)، يجري مصافحة Initialize مرّةً، ويعيد
// التشغيل عند التعطّل بتراجع أسّيّ محدود. يوجّه طلبات الموافقة (RequestPermission) وبثّ
// المهامّ (TaskProgress) للمستهلكين.
//
// أمان (ق3/ق6/ق12): المفاتيح ليست هنا — الخادم يتصل بوسيط نِبراس عبر NEBRAS_PROXY_URL
// (فارغ ⇒ مزوّد وهميّ). لا خروج شبكيّ من الخادم إلّا عبر الوسيط.

const vscode = require("vscode");
const cp = require("child_process");
const fs = require("fs");
const path = require("path");
const { RpcClient } = require("./rpc-client.js");

// ── عقد السلك (يعكس @nebras/protocol) — الامتداد CommonJS خارج شجرة بناء TypeScript ──
const PROTOCOL_VERSION = "0.1.0";
const METHOD_INITIALIZE = "nebras/initialize";
const METHOD_TASK = "nebras/task";
const METHOD_TASK_PROGRESS = "nebras/taskProgress";
const METHOD_REQUEST_PERMISSION = "nebras/requestPermission";
const METHOD_CANCEL = "nebras/cancel";
const METHOD_SHUTDOWN = "nebras/shutdown";

// وسائط تشغيل الخادم المرجعيّ (يطابق CLI: `nebras خادم --نقل stdio`).
const SERVE_COMMAND = "خادم";
const TRANSPORT_FLAG = "--نقل";
const TRANSPORT_STDIO = "stdio";

// مجلّد الخادم المدمج (يُحقَن وقت البناء إن توفّر) ونقطة الدخول.
const BUNDLED_SERVER_DIR = "server";
const BUNDLED_SERVER_ENTRY = "index.js";
// متغيّر بيئة احتياطيّ لمسار نقطة دخول CLI (تطوير).
const ENV_NEBRAS_CLI = "NEBRAS_CLI";
const ENV_PROXY_URL = "NEBRAS_PROXY_URL";
// سلسلة أدوات ص: تفعّل أدوات «ابنِ/شغّل» في الحلقة الوكيليّة (بغيابها تُسقَط الأداتان — تدهور رشيق).
const ENV_SAD_BUILD = "NEBRAS_SAD_BUILD";
const ENV_SAD_RUN = "NEBRAS_SAD_RUN";

// إعادة التشغيل: تراجع أسّيّ محدود كي لا يدور خادم منهار بلا نهاية.
const RESTART_BASE_MS = 1000;
const RESTART_MAX_MS = 30_000;
const RESTART_MAX_ATTEMPTS = 5;
// نافذة استقرار: بقاء الخادم حيًّا هذه المدّة يصفّر عدّاد المحاولات.
const STABLE_UPTIME_MS = 15_000;
// مهلة مصافحة Initialize (ms) — خادم لا يجيب ضمنها يُعدّ فاشلًا.
const INIT_TIMEOUT_MS = 20_000;

const CFG_SECTION = "mihrab.nebras";

/** نصوص الحالة (عربيّة-أوّلًا = بيانات واجهة، استثناء مقبول لقاعدة السلاسل الحرفيّة). */
const COPY = {
  serverNotFound:
    "لم يُعثَر على خادم نِبراس. اضبط «mihrab.nebras.serverPath» إلى ملفّ packages/cli/dist/index.js، أو ثبّت النسخة المدمجة.",
  nodeMissing: (node) => `تعذّر تشغيل Node («${node}») لخادم نِبراس — تحقّق من «mihrab.nebras.nodePath».`,
  initFailed: (e) => `فشلت مصافحة خادم نِبراس: ${e}`,
  incompatible: (c, s) => `عدم توافق إصدار العقد: العميل ${c}، الخادم ${s}.`,
  crashed: (n) => `تعطّل خادم نِبراس (المحاولة ${n}) — يُعاد التشغيل…`,
  gaveUp: "توقّف خادم نِبراس بعد محاولات إعادة تشغيل متكرّرة. استعمل «نِبراس: أعِد تشغيل الخادم».",
  starting: "يُشغَّل خادم نِبراس…",
  ready: "خادم نِبراس جاهز",
};

/** تفاوض توافق الإصدار الدلاليّ (نسخة عميل من isCompatible في البروتوكول). */
function isCompatible(clientVersion, serverVersion) {
  const parse = (v) => {
    const core = String(v).split(/[-+]/, 1)[0];
    const parts = core.split(".");
    if (parts[0] === "" || (parts.length > 1 && parts[1] === "")) return undefined;
    const maj = Number(parts[0]);
    const min = parts.length > 1 ? Number(parts[1]) : 0;
    if (!Number.isInteger(maj) || !Number.isInteger(min) || maj < 0 || min < 0) return undefined;
    return [maj, min];
  };
  const c = parse(clientVersion);
  const s = parse(serverVersion);
  if (!c || !s) return false;
  if (c[0] !== s[0]) return false;
  if (s[0] === 0) return c[1] === s[1];
  return true;
}

/** يقرأ إعدادات نِبراس الحاليّة. */
function readConfig() {
  const cfg = vscode.workspace.getConfiguration(CFG_SECTION);
  return {
    serverPath: (cfg.get("serverPath") || "").trim(),
    nodePath: (cfg.get("nodePath") || "node").trim() || "node",
    proxyUrl: (cfg.get("proxyUrl") || "").trim(),
    permissionMode: cfg.get("permissionMode") || "آمن",
    locale: cfg.get("locale") || "ar",
    inlineCompletion: cfg.get("inlineCompletion") === true,
    // مسارا سلسلة أدوات ص (اختياريّان): يفعّلان «ابنِ/شغّل» في الحلقة الوكيليّة عبر بيئة الخادم.
    sadBuildPath: (cfg.get("sadBuildPath") || "").trim(),
    sadRunPath: (cfg.get("sadRunPath") || "").trim(),
  };
}

/** يحلّ نقطة دخول الخادم: الإعداد الصريح ⇒ المدمج ⇒ متغيّر البيئة. يُرجع مسارًا أو null. */
function resolveServerEntry(context, serverPathCfg) {
  const candidates = [];
  if (serverPathCfg) candidates.push(serverPathCfg);
  candidates.push(path.join(context.extensionPath, BUNDLED_SERVER_DIR, BUNDLED_SERVER_ENTRY));
  if (process.env[ENV_NEBRAS_CLI]) candidates.push(String(process.env[ENV_NEBRAS_CLI]));
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      /* التالي */
    }
  }
  return null;
}

/**
 * مدير خادم نِبراس المقيم. يبثّ حالة الجاهزيّة عبر onReadyChanged، ويوجّه طلبات الموافقة
 * عبر permissionHandler المحقون. المهامّ عبر runTask.
 */
class NebrasProcess {
  /**
   * @param {vscode.ExtensionContext} context
   * @param {vscode.OutputChannel} log
   * @param {(taskId: any, step: any, reason: string) => Promise<boolean>} permissionHandler
   */
  constructor(context, log, permissionHandler) {
    this._context = context;
    this._log = log;
    this._permissionHandler = permissionHandler;
    /** @type {cp.ChildProcess | null} */
    this._child = null;
    /** @type {RpcClient | null} */
    this._rpc = null;
    this._caps = null; // ServerCapabilities بعد المصافحة
    this._ready = false;
    this._restartAttempts = 0;
    this._disposed = false;
    /** @type {Map<any, {onDelta?: (delta: string) => void, onToolStep?: (step: any) => void}>} taskId → مستهلكات البثّ (نصّ + خطوات) للمهامّ الجارية */
    this._activeTasks = new Map();
    /** @type {(ready: boolean) => void} */
    this._onReadyChanged = () => {};
    /** @type {NodeJS.Timeout | null} */
    this._stableTimer = null;
    /** @type {(() => void) | null} مؤجَّل إعادة تشغيل، لإلغائه عند dispose */
    this._pendingRestart = null;
    /** @type {string | null} رسالة خطأ spawn (ENOENT) — تُقرأ في catch المصافحة */
    this._spawnErrorMsg = null;
  }

  onReadyChanged(cb) {
    this._onReadyChanged = cb;
  }

  isReady() {
    return this._ready;
  }

  /** قدرات الخادم بعد المصافحة (tasks[]، streaming) أو null. */
  capabilities() {
    return this._caps;
  }

  /** يبدأ الخادم (idempotent): إن كان حيًّا فلا شيء. يُرجع وعدًا بالجاهزيّة. */
  async start() {
    if (this._disposed || this._child) return;
    const cfg = readConfig();
    const entry = resolveServerEntry(this._context, cfg.serverPath);
    if (!entry) {
      vscode.window.showErrorMessage(COPY.serverNotFound);
      return;
    }
    this._log.appendLine(`[نِبراس] ${COPY.starting} (${cfg.nodePath} ${entry})`);

    const env = Object.assign({}, process.env);
    // مرّر عنوان الوسيط إن ضُبط (فارغ ⇒ الخادم يستعمل المزوّد الوهميّ Mock).
    if (cfg.proxyUrl) env[ENV_PROXY_URL] = cfg.proxyUrl;
    else delete env[ENV_PROXY_URL];
    // مسارا سلسلة أدوات ص: الإعداد **مصدر الحقيقة** (كـproxyUrl) — مضبوطٌ ⇒ يفعّل «ابنِ/شغّل»، فارغٌ
    // ⇒ **يُسقِط** ما ورّثته البيئة كي يطابق السلوكُ التوثيقَ («فارغ ⇒ تُسقَط الأداة») ولا يفعّلها متغيّرٌ
    // بيئيّ خفيّ. تدهور رشيق: بلا مسارٍ تُسقَط الأداة (الوكيل يقرأ/يكتب/يكتشف بلا بناء/تشغيل).
    if (cfg.sadBuildPath) env[ENV_SAD_BUILD] = cfg.sadBuildPath;
    else delete env[ENV_SAD_BUILD];
    if (cfg.sadRunPath) env[ENV_SAD_RUN] = cfg.sadRunPath;
    else delete env[ENV_SAD_RUN];

    let child;
    try {
      child = cp.spawn(cfg.nodePath, [entry, SERVE_COMMAND, TRANSPORT_FLAG, TRANSPORT_STDIO], {
        env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (err) {
      vscode.window.showErrorMessage(COPY.nodeMissing(cfg.nodePath));
      this._log.appendLine(`[نِبراس] spawn فشل: ${err}`);
      return;
    }
    this._child = child;

    // بدء نظيف: صفّر أعلام الفشل (تُقرأ في catch المصافحة و_onExit).
    this._spawnErrorMsg = null;
    child.on("error", (err) => {
      this._log.appendLine(`[نِبراس] خطأ عمليّة: ${err && err.message ? err.message : err}`);
      // ENOENT (Node/مسار خاطئ) = خطأ غير متزامن لا يلتقطه try/catch حول spawn ⇒ أبلِغ صراحةً
      // بدل تركه يعلّق حتّى مهلة Initialize (20s)، وأيقظ وعد المصافحة بتفكيك العميل.
      if (err && err.code === "ENOENT") this._spawnErrorMsg = COPY.nodeMissing(cfg.nodePath);
      if (this._rpc) this._rpc.dispose("تعذّر تشغيل الخادم");
    });
    // stderr للخادم = سجلّ تشخيصيّ (تحذيرات إقلاع، أسباب رفض) — نستنزفه كي لا يجمّد الأنبوب.
    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (d) => this._log.appendLine(`[نِبراس:خادم] ${String(d).trimEnd()}`));
    }
    child.on("exit", (code, signal) => this._onExit(code, signal));

    if (!child.stdin || !child.stdout) {
      this._log.appendLine("[نِبراس] لا stdin/stdout للخادم.");
      this._teardownChild();
      return;
    }
    const rpc = new RpcClient(child.stdin, child.stdout);
    this._rpc = rpc;

    // وجّه بثّ المهامّ (TaskProgress) لمستهلك المهمّة المطابق لـtaskId: قطعة نصّ (delta) أو خطوة
    // أداةٍ منفَّذة (toolStep، حلقة «وكيل» خطوةً خطوة). قد يحمل الإشعار أحدهما.
    rpc.onNotification(METHOD_TASK_PROGRESS, (params) => {
      if (!params || typeof params !== "object") return;
      const consumer = this._activeTasks.get(params.taskId);
      if (!consumer) return;
      if (typeof params.delta === "string" && consumer.onDelta) consumer.onDelta(params.delta);
      if (params.toolStep && consumer.onToolStep) consumer.onToolStep(params.toolStep);
    });
    // وجّه طلبات الموافقة خادم→عميل للمعالِج المحقون (fail-safe: رفض عند غياب/خطأ).
    rpc.onRequest(METHOD_REQUEST_PERMISSION, async (params) => {
      try {
        const approved = await this._permissionHandler(
          params && params.taskId,
          params && params.step,
          (params && params.reason) || "",
        );
        return { approved: approved === true };
      } catch {
        return { approved: false };
      }
    });

    // مصافحة Initialize بمهلة.
    try {
      const caps = await this._withTimeout(
        rpc.request(METHOD_INITIALIZE, {
          protocolVersion: PROTOCOL_VERSION,
          streaming: true,
          locale: cfg.locale,
        }),
        INIT_TIMEOUT_MS,
      );
      if (!caps || !isCompatible(PROTOCOL_VERSION, caps.protocolVersion)) {
        vscode.window.showErrorMessage(
          COPY.incompatible(PROTOCOL_VERSION, caps ? caps.protocolVersion : "?"),
        );
        // عدم التوافق نهائيّ: الخادم حيّ لكن غير صالح ⇒ أوقفه (يقتل العمليّة، لا إعادة تشغيل).
        await this._stop();
        return;
      }
      this._caps = caps;
      this._ready = true;
      this._onReadyChanged(true);
      this._log.appendLine(`[نِبراس] ${COPY.ready} — مهامّ: ${(caps.tasks || []).join("، ")}`);
      // صفّر عدّاد المحاولات بعد بقاء مستقرّ.
      this._stableTimer = setTimeout(() => {
        this._restartAttempts = 0;
      }, STABLE_UPTIME_MS);
      if (this._stableTimer.unref) this._stableTimer.unref();
    } catch (err) {
      // ميّز سبب فشل المصافحة كي لا نُزعج بحوار مكرّر:
      //  • خطأ spawn (ENOENT): اعرض رسالة Node المخصّصة، أوقف (لا إعادة تشغيل — فاشلة حتمًا).
      //  • تعطّل الخادم (فكّكه _onExit سلفًا ⇒ _child=null): إعادة التشغيل التلقائيّة تكفي، اكتفِ بالسجلّ.
      //  • فشل حقيقيّ آخر (مهلة): اعرض initFailed وأوقف.
      if (this._spawnErrorMsg) {
        vscode.window.showErrorMessage(this._spawnErrorMsg);
        await this._stop();
      } else if (this._child === null) {
        this._log.appendLine(`[نِبراس] فشلت المصافحة بتعطّل الخادم — تُعالجه إعادة التشغيل.`);
      } else {
        vscode.window.showErrorMessage(COPY.initFailed(String(err && err.message ? err.message : err)));
        await this._stop();
      }
    }
  }

  /**
   * يشغّل مهمّة نِبراس ويبثّ القطع عبر onDelta والخطوات عبر onToolStep. يُرجع TaskResult أو يرمي.
   * onStart(id) اختياريّ: يُستدعى بمعرّف المهمّة فور إرسالها (يتيح الإلغاء أثناء البثّ).
   * onToolStep(step) اختياريّ: يُستدعى لكلّ خطوةِ أداةٍ منفَّذة في مهمّة «وكيل» (بثّ حيّ).
   */
  async runTask(params, onDelta, onStart, onToolStep) {
    if (!this._rpc || !this._ready) {
      throw new Error("خادم نِبراس غير جاهز");
    }
    const { id, promise } = this._rpc.sendRequest(METHOD_TASK, params);
    if (typeof onDelta === "function" || typeof onToolStep === "function") {
      this._activeTasks.set(id, {
        onDelta: typeof onDelta === "function" ? onDelta : undefined,
        onToolStep: typeof onToolStep === "function" ? onToolStep : undefined,
      });
    }
    if (typeof onStart === "function") {
      try {
        onStart(id);
      } catch {
        /* لا يُسقِط المهمّة */
      }
    }
    try {
      return await promise;
    } finally {
      this._activeTasks.delete(id);
    }
  }

  /** يلغي مهمّة بثّ جارية (إشعار Cancel، ق13). */
  cancel(taskId) {
    if (this._rpc) this._rpc.notify(METHOD_CANCEL, { taskId });
  }

  /** يعيد تشغيل الخادم فورًا (أمر المستخدم). */
  async restart() {
    this._restartAttempts = 0;
    await this._stop();
    if (!this._disposed) await this.start();
  }

  /** مهلة على وعد: يرفض إن لم يُحسَم ضمن ms. */
  _withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`مهلة ${ms}ms`)), ms);
      if (t.unref) t.unref();
      promise.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });
  }

  _onExit(code, signal) {
    this._log.appendLine(`[نِبراس] انتهى الخادم (code=${code}, signal=${signal}).`);
    const wasReady = this._ready;
    const spawnFailed = this._spawnErrorMsg !== null;
    this._teardownChild();
    if (this._disposed) return;
    // خطأ spawn (Node/مسار خاطئ) ⇒ إعادة التشغيل عبثيّة (ستفشل بنفس السبب) — لا تُجدوِلها.
    if (spawnFailed) return;
    // إعادة تشغيل بتراجع أسّيّ محدود.
    if (this._restartAttempts >= RESTART_MAX_ATTEMPTS) {
      vscode.window.showErrorMessage(COPY.gaveUp);
      return;
    }
    this._restartAttempts += 1;
    const delay = Math.min(RESTART_BASE_MS * 2 ** (this._restartAttempts - 1), RESTART_MAX_MS);
    if (wasReady) this._log.appendLine(`[نِبراس] ${COPY.crashed(this._restartAttempts)}`);
    const timer = setTimeout(() => {
      this._pendingRestart = null;
      void this.start();
    }, delay);
    if (timer.unref) timer.unref();
    this._pendingRestart = () => clearTimeout(timer);
  }

  /** يفكّك العمليّة الفرعيّة والعميل (بلا إعادة تشغيل). */
  _teardownChild() {
    if (this._stableTimer) {
      clearTimeout(this._stableTimer);
      this._stableTimer = null;
    }
    if (this._rpc) {
      this._rpc.dispose("انتهى خادم نِبراس");
      this._rpc = null;
    }
    this._activeTasks.clear();
    if (this._child) {
      const child = this._child;
      this._child = null;
      try {
        child.removeAllListeners("exit");
      } catch {
        /* تجاهل */
      }
      // اقتل العمليّة إن كانت حيّة: مسارات المصافحة (مهلة/عدم توافق/لا أنابيب) تصل هنا والخادم
      // قد يكون حيًّا ⇒ عدم القتل يترك عمليّة node يتيمة تحمل اتّصال الوسيط (تسريب موارد).
      if (!child.killed) {
        try {
          child.kill();
        } catch {
          /* تجاهل */
        }
      }
    }
    if (this._ready) {
      this._ready = false;
      this._onReadyChanged(false);
    }
    this._caps = null;
  }

  /** إطفاء رشيق: Shutdown ثمّ قتل، بلا إعادة تشغيل. */
  async _stop() {
    if (this._pendingRestart) {
      this._pendingRestart();
      this._pendingRestart = null;
    }
    const child = this._child;
    if (this._rpc && child) {
      try {
        this._rpc.notify(METHOD_SHUTDOWN, {});
      } catch {
        /* تجاهل */
      }
    }
    this._teardownChild();
    if (child && !child.killed) {
      try {
        child.kill();
      } catch {
        /* تجاهل */
      }
    }
  }

  /** إغلاق نهائيّ عند تعطيل الامتداد. */
  async dispose() {
    this._disposed = true;
    await this._stop();
  }
}

module.exports = { NebrasProcess, isCompatible, readConfig, COPY };
