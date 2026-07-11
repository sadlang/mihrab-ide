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

// ── عقد السلك — يُستورَد من مصدر الحقيقة المولَّد (يعكس @nebras/protocol) ──
const {
  PROTOCOL_VERSION,
  METHOD_INITIALIZE,
  METHOD_TASK,
  METHOD_TASK_PROGRESS,
  METHOD_REQUEST_PERMISSION,
  METHOD_CANCEL,
  METHOD_SHUTDOWN,
  SERVE_COMMAND,
  TRANSPORT_FLAG,
  TRANSPORT_STDIO,
} = require("./contract/protocol-contract.generated.js");

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
// مخطَّط ملفّات القرص (لتمييز مجلّد مساحة عمل حقيقيّ عن مخطّطات افتراضيّة).
const FILE_SCHEME = "file";

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
  retargeting: (root) => `يُعاد توجيه جذر عمل نِبراس إلى «${root}»…`,
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

/**
 * جذر مساحة العمل (أوّل مجلّد مشروع مفتوح على القرص) — يصير **cwd** لعمليّة الخادم، والخادم يشتقّ منه
 * `workspaceRoot` عبر `process.cwd()` (حدّ الوكيل الصلب: يرفض أيّ هدف خارجه). بدونه يرث الخادم cwd
 * مضيف الامتدادات (مجلّد إطلاق المحرّر) فتُرفَض ملفّات المشروع بـ«المسار خارج مجلّد العمل». يُرجع
 * undefined إن لم يُفتَح مجلّد (ملفّ مفرد) ⇒ يرث الخادم cwd الافتراضيّ. ⚠️ الملفّ المفرد حالة تدهور
 * معروفة (لا مسار سليم): «أصلِح بنِبراس» يبقى مرفوضًا حتى يُفتَح المجلّد الحاوي [دَين موثَّق].
 * ⚠️ مساحة متعدّدة الجذور: يُعاد الأوّل فقط، فملفّ جذرٍ آخر يُرفَض [دَين موثَّق].
 * @returns {string | undefined}
 */
function resolveWorkspaceCwd() {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0 && folders[0].uri.scheme === FILE_SCHEME) {
    return folders[0].uri.fsPath;
  }
  return undefined;
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
    /** @type {string | undefined} جذر مساحة العمل الذي أُقلع به الخادم (cwd) — لكشف تبايُته عند تغيّر المجلّد */
    this._startedCwd = undefined;
    /** @type {string | undefined} جذر توجيهٍ صريح (ملفّ مفرد/جذرٌ غير الأوّل): يغلب resolveWorkspaceCwd
     * حتى يتغيّر مجلّد مساحة العمل (حينها تعود الجذور الرسميّة هي الحكم). يصمد عبر restart اليدويّ
     * وإعادة التشغيل التلقائيّة بعد تعطّل (آخر نيّةٍ صريحة تبقى الحكم؛ أيّ توجيهٍ لاحق يصحّحه).
     * [إعادة توجيه الجذر] */
    this._cwdOverride = undefined;
    /** @type {Promise<void> | null} وعد الإقلاع الجاري (spawn + مصافحة): يتقاسمه مستدعو start
     * المتزامنون كي لا يعود نداءٌ ثانٍ فوريًّا قبل الجاهزيّة فيُقرأ زورًا «فشل» (retargetRoot). */
    this._startPromise = null;
  }

  onReadyChanged(cb) {
    this._onReadyChanged = cb;
  }

  /**
   * يعيد تشغيل الخادم إن تغيّر جذر مساحة العمل عمّا أُقلع به (cwd بائت ⇒ الخادم يرفض ملفّات الجذر
   * الجديد بـ«المسار خارج مجلّد العمل»). يُستدعى من مستمع onDidChangeWorkspaceFolders. آمن قبل الإقلاع.
   * تغيّر المجلّدات يُسقِط أيّ توجيه جذرٍ صريح سابق (retargetRoot) — الجذور الرسميّة تعود هي الحكم.
   * مهمّة جارية أثناء إعادة التشغيل تُقطَع بأمان: dispose عميل RPC يرفض وعدها («انتهى خادم نِبراس»)
   * فيبلّغ مسارُ المهمّة فشلَها للمستخدم — لا وعود معلّقة ولا بثّ يتيم (_activeTasks تُمسَح).
   */
  async restartIfWorkspaceChanged() {
    if (this._disposed) return;
    this._cwdOverride = undefined;
    if (resolveWorkspaceCwd() !== this._startedCwd) {
      await this.restart();
    }
  }

  /**
   * يوجّه جذر عمل الخادم إلى مجلّدٍ بعينه (المجلّد المالك للملفّ الهدف، أو مجلّد الملفّ للملفّ المفرد):
   * الخادم أحاديّ الجذر بتصميمه (workspaceRoot = cwd)، فبدل رفض هدفٍ خارج جذره الجاري نعيد تشغيله
   * بالجذر المطلوب — يفتح «أصلِح بنِبراس»/«وكيل» للملفّ المفرد ولجذور مساحة العمل غير الأولى.
   * لا يفعل شيئًا إن كان الجذر الجاري هو المطلوب أصلًا. يُرجع جاهزيّة الخادم بعد التوجيه.
   * التوجيه يُنسَخ (_cwdOverride) فيصمد عبر restart اليدويّ، ويسقط عند تغيّر مجلّدات مساحة العمل.
   * @param {string} desiredRoot مسار مطلق لجذر العمل المطلوب
   * @returns {Promise<boolean>} جاهزيّة الخادم بعد التوجيه
   */
  async retargetRoot(desiredRoot) {
    if (this._disposed) return false;
    if (this._startedCwd === desiredRoot && this._ready) return true;
    if (this._startedCwd !== desiredRoot) {
      this._log.appendLine(`[نِبراس] ${COPY.retargeting(desiredRoot)}`);
      this._cwdOverride = desiredRoot;
      await this.restart();
    } else {
      await this.start(); // الجذر صحيح لكنّ الخادم غير جاهز (متوقّف/مصافحة جارية) ⇒ إقلاع أو انتظاره.
    }
    // سباق التوجيهات: توجيهٌ منافس أثناء انتظارنا (retargetRoot بجذرٍ آخر من ملفٍّ ثانٍ، أو
    // restartIfWorkspaceChanged يمسح التوجيه) قد يكون بدّل الجذر الفائز — الجاهزيّة وحدها إذًا نجاحٌ
    // زائف لجذرٍ خاسر (الوكيل سيُرفَض «خارج مجلّد العمل»)، فنشترط أنّ الجذر المُقلَع به هو المطلوب.
    // المقارنة حرفيّة عمدًا: تبايُنُ تمثيلٍ لنفس المجلّد (حالة أحرف على Windows) يكلّف إعادة تشغيل
    // زائدة لا أكثر، والمصدران (fsPath/dirname من vscode) متّسقا التمثيل عمليًّا.
    return this._ready && this._startedCwd === desiredRoot;
  }

  /**
   * هل توجيه الجذر إلى المجلّد المعطى سيقتضي **إعادة تشغيل** الخادم (قطع مهامّه الجارية)؟
   * يقرؤه تجهيز الوكيل (ensureDocReadyForAgent) ليستأذن المستخدم قبل قطع مهمّةٍ حيّة —
   * مع hasActiveTasks. استعلامٌ خالص: لا يغيّر حالةً ولا يبدأ توجيهًا.
   * @param {string} desiredRoot مسار مطلق لجذر العمل المطلوب
   */
  retargetNeedsRestart(desiredRoot) {
    return !this._disposed && this._startedCwd !== desiredRoot;
  }

  /** هل ثمّة مهامّ بثّ جارية الآن؟ (إعادة التشغيل تقطعها: dispose عميل RPC يرفض وعودها.) */
  hasActiveTasks() {
    return this._activeTasks.size > 0;
  }

  isReady() {
    return this._ready;
  }

  /** قدرات الخادم بعد المصافحة (tasks[]، streaming) أو null. */
  capabilities() {
    return this._caps;
  }

  /**
   * يبدأ الخادم (idempotent): إن كان حيًّا مُصافَحًا فلا شيء، وإن كانت مصافحته جاريةً انتُظر **نفس**
   * وعد الإقلاع (عودةٌ فوريّة هنا كانت تُقرأ زورًا «غير جاهز» في retargetRoot أثناء نافذة المصافحة).
   * يُرجع وعدًا يُحسَم باكتمال محاولة الإقلاع (الجاهزيّة عبر isReady/onReadyChanged).
   */
  async start() {
    if (this._disposed) return;
    if (this._child) {
      // خادم حيّ: مصافحته معلّقة ⇒ انتظرها؛ مُصافَح سلفًا (لا وعد) ⇒ لا شيء.
      if (this._startPromise) await this._startPromise;
      return;
    }
    // وعدٌ بائت (فكّك restart خادمَه أثناء مصافحته) لا يمنع إقلاعًا جديدًا — الشرط _child لا الوعد.
    const boot = this._startImpl();
    this._startPromise = boot;
    try {
      await boot;
    } finally {
      if (this._startPromise === boot) this._startPromise = null;
    }
  }

  /** جسم الإقلاع الفعليّ (spawn + مصافحة Initialize) — يُستدعى حصرًا من start (يضمن عدم التوازي على _child). */
  async _startImpl() {
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

    // cwd الخادم = جذر التوجيه الصريح (retargetRoot: ملفّ مفرد/جذر غير أوّل) وإلّا جذر مساحة العمل:
    // الخادم يشتقّ workspaceRoot منه (process.cwd())، فبدونه يرث مجلّد إطلاق المحرّر وتُرفَض ملفّات
    // المشروع بـ«المسار خارج مجلّد العمل». undefined ⇒ يرث الافتراضيّ. نخزّنه لكشف تبايُته لاحقًا
    // (restartIfWorkspaceChanged/retargetRoot).
    const cwd = this._cwdOverride !== undefined ? this._cwdOverride : resolveWorkspaceCwd();
    this._startedCwd = cwd;

    let child;
    try {
      child = cp.spawn(cfg.nodePath, [entry, SERVE_COMMAND, TRANSPORT_FLAG, TRANSPORT_STDIO], {
        cwd,
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
      // متابعة بائتة: restart (يدويّ/تغيّر مجلّد العمل) فكّك هذا الخادم أثناء انتظار المصافحة
      // وربّما أقلع خادمًا جديدًا — لا تلمس حالته (وإلّا يُضبَط _ready/_caps زورًا لخادم لم يُصافَح).
      if (this._child !== child) return;
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
      //  • متابعة بائتة (خادم **جديد** حيّ حلّ محلّ هذا عبر restart أثناء المصافحة): لا حوار ولا
      //    _stop — _stop هنا كان **يقتل الخادم الجديد** ويعرض حوارًا مضلّلًا (سباق restart×start).
      if (this._child !== null && this._child !== child) return;
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

module.exports = { NebrasProcess, isCompatible, readConfig, resolveWorkspaceCwd, COPY };
