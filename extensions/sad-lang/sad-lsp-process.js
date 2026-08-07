// @ts-check
"use strict";
// مدير عمليّة خادم ص LSP المقيمة: يُطلق sad-lsp.exe كعمليّة فرعيّة حيّة طوال جلسة محراب،
// يجري مصافحة LSP (initialize → initialized) مرّةً، ويعيد التشغيل عند التعطّل بتراجع أسّيّ محدود.
// يوجّه إشعارات البثّ (publishDiagnostics) للمستهلكين، ويكشف قدرات الخادم للمزوّدات المشروطة.
//
// الخادم تنفيذيّ أصليّ (لا Node) ⇒ إطلاق مباشر. مقتبَس نمطه من extensions/mihrab-nebras/nebras-process.js.

const vscode = require("vscode");
const cp = require("child_process");
const { RpcClient } = require("./lsp-rpc.js");
const { resolveBundledTool, probeTool } = require("./tool-resolve.js");
const {
  M_INITIALIZE,
  M_INITIALIZED,
  M_SHUTDOWN,
  M_EXIT,
  M_REGISTER_CAPABILITY,
  M_UNREGISTER_CAPABILITY,
  M_WORK_DONE_CREATE,
  M_CONFIGURATION,
  POSITION_ENCODING_UTF16,
  SEMANTIC_TOKEN_TYPES,
  SEMANTIC_TOKEN_MODIFIERS,
} = require("./lsp-protocol.js");

// اسم الثنائيّ المدمج واسم PATH الاحتياطيّ.
const SAD_LSP_EXE = "sad-lsp.exe";
const SAD_LSP_CMD = "sad-lsp";

// إعادة التشغيل: تراجع أسّيّ محدود كي لا يدور خادم منهار بلا نهاية.
const RESTART_BASE_MS = 1000;
const RESTART_MAX_MS = 30_000;
const RESTART_MAX_ATTEMPTS = 5;
// نافذة استقرار: بقاء الخادم حيًّا هذه المدّة يصفّر عدّاد المحاولات.
const STABLE_UPTIME_MS = 15_000;
// مهلة مصافحة initialize (ms) — خادم لا يجيب ضمنها يُعدّ فاشلًا.
const INIT_TIMEOUT_MS = 20_000;

const CFG_SECTION = "sad.lsp";
// اسم العميل ونسخته في مصافحة initialize (بيانات وصفيّة، لا منطق).
const CLIENT_NAME = "محراب — عميل ص LSP";
const CLIENT_VERSION = "0.1.0";

/** نصوص الحالة (عربيّة-أوّلًا = بيانات واجهة، استثناء مقبول لقاعدة السلاسل الحرفيّة). */
const COPY = {
  serverNotFound:
    "لم يُعثَر على خادم ص LSP (sad-lsp). اضبط «sad.lsp.serverPath»، أو ثبّت النسخة المدمجة، أو أضِف sad-lsp إلى PATH — الذكاء اللغويّ (إكمال/تحويم/تشخيص) معطَّل حتّى ذلك.",
  initFailed: (e) => `فشلت مصافحة خادم ص LSP: ${e}`,
  crashed: (n) => `تعطّل خادم ص LSP (المحاولة ${n}) — يُعاد التشغيل…`,
  gaveUp: "توقّف خادم ص LSP بعد محاولات إعادة تشغيل متكرّرة. استعمل «ص: أعِد تشغيل خادم اللغة».",
  ready: "خادم ص اللغويّ جاهز",
};

/** يقرأ إعدادات خادم ص LSP الحاليّة. */
function readConfig() {
  const cfg = vscode.workspace.getConfiguration(CFG_SECTION);
  return {
    serverPath: (cfg.get("serverPath") || "").trim(),
    trace: cfg.get("trace") === true,
  };
}

/**
 * قدرات العميل المُعلَنة في `initialize`.
 *
 * ‏**نُعلن ما نستهلك.** كان `extension.js` يسجّل مزوّدًا دلاليًّا ويشترط
 * `semanticTokensProvider` بينما لا تُعلَن `semanticTokens` هنا إطلاقًا — مخالفةُ
 * مواصفةٍ قائمة. و**التعليلُ الذي كُتب لها أوّلَ مرّة كان خاطئًا**: قيل إنّ خادمًا
 * ملتزمًا «قد لا يعلن المزوّدَ فتموت الميزةُ صامتة». **قِيس فبطل**: خادمُ ص المشحون
 * (‏2.1.0) يعلن `semanticTokensProvider` و`documentSymbolProvider` كاملَين
 * **بهذه القدرات نفسِها قبل الإصلاح**. فالإعلانُ لا يُحيي ميزةً ميّتة.
 *
 * ويُصلَح مع ذلك، **بالحجّة الصحيحة**: خادمٌ ثانٍ ملتزمٌ بالمواصفة يشتقّ ما يعلنه من
 * قدرات العميل، فيكتم القدرةَ **بحقّ** — والاعتمادُ على تسامح خادمٍ بعينه دَينٌ صامت.
 */
function clientCapabilities() {
  return {
    general: { positionEncodings: [POSITION_ENCODING_UTF16] },
    textDocument: {
      synchronization: { dynamicRegistration: false, didSave: true },
      publishDiagnostics: { relatedInformation: true },
      completion: { completionItem: { snippetSupport: false } },
      hover: { contentFormat: ["markdown", "plaintext"] },
      definition: { linkSupport: false },
      documentSymbol: { hierarchicalDocumentSymbolSupport: true },
      semanticTokens: {
        requests: { full: true, range: false },
        tokenTypes: SEMANTIC_TOKEN_TYPES,
        tokenModifiers: SEMANTIC_TOKEN_MODIFIERS,
        formats: ["relative"],
      },
    },
    workspace: { configuration: true, workspaceFolders: true },
  };
}

/** يبني معاملات initialize من مساحة العمل الحاليّة. */
function initializeParams() {
  const folders = vscode.workspace.workspaceFolders || [];
  const rootUri = folders.length > 0 ? folders[0].uri.toString() : null;
  return {
    processId: process.pid,
    clientInfo: { name: CLIENT_NAME, version: CLIENT_VERSION },
    locale: "ar",
    rootUri,
    capabilities: clientCapabilities(),
    workspaceFolders: folders.map((f) => ({ uri: f.uri.toString(), name: f.name })),
  };
}

/**
 * مدير خادم ص LSP المقيم. يبثّ حالة الجاهزيّة عبر onReadyChanged، والتشخيصات عبر معالِج إشعار
 * publishDiagnostics المُسجَّل من المستهلك (extension.js).
 */
class SadLspProcess {
  /** @param {vscode.ExtensionContext} context */
  constructor(context, output) {
    this._context = context;
    this._output = output; // vscode.OutputChannel للتتبّع/الأخطاء
    /** @type {cp.ChildProcess|null} */
    this._proc = null;
    /** @type {RpcClient|null} */
    this._rpc = null;
    this._serverCapabilities = null;
    this._ready = false;
    this._disposed = false;
    this._restartAttempts = 0;
    this._startedAt = 0;
    // علَم التتبّع (sad.lsp.trace): يُقرأ عند كلّ إطلاق ويحكم تسجيل stderr المطوَّل. [M1]
    this._traceEnabled = false;
    /** @type {Map<string, (params:any)=>void>} إشعارات مُسجَّلة مسبقًا تُعاد ربطها عند كلّ إطلاق */
    this._notificationHandlers = new Map();
    /** @type {Array<(ready:boolean)=>void>} */
    this._readyListeners = [];
    /** @type {NodeJS.Timeout|null} */
    this._restartTimer = null;
    /** @type {NodeJS.Timeout|null} مؤقّت نافذة الاستقرار (يُلغى عند الإغلاق كي لا يشرد). [S8] */
    this._stabilityTimer = null;
  }

  get ready() {
    return this._ready;
  }

  get serverCapabilities() {
    return this._serverCapabilities;
  }

  /** يسجّل مستمعًا لتغيّر الجاهزيّة (يُستدعى فورًا بالحالة الراهنة). */
  onReadyChanged(listener) {
    this._readyListeners.push(listener);
    try {
      listener(this._ready);
    } catch {
      /* تجاهل */
    }
  }

  /** يسجّل معالِج إشعار بثّ (publishDiagnostics). يُعاد ربطه تلقائيًّا بعد كلّ إعادة تشغيل. */
  onNotification(method, handler) {
    this._notificationHandlers.set(method, handler);
    if (this._rpc) this._rpc.onNotification(method, handler);
  }

  /** يرسل طلبًا للخادم (يرفض إن لم يكن جاهزًا). */
  request(method, params) {
    if (!this._rpc || !this._ready) {
      return Promise.reject(new Error("خادم ص LSP غير جاهز"));
    }
    return this._rpc.request(method, params);
  }

  /**
   * كـrequest لكن بمهلة تُلغي الطلب المعلّق عند انقضائها (فلا يتراكم في _pending على خادمٍ عالِق).
   * تُستعمَل في مزوّدات الميزات (إكمال/تحويم/تعريف/تلوين). [تدقيق كليّ #4]
   */
  requestWithTimeout(method, params, ms) {
    if (!this._rpc || !this._ready) {
      return Promise.reject(new Error("خادم ص LSP غير جاهز"));
    }
    const rpc = this._rpc;
    const { id, promise } = rpc.requestWithId(method, params);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        rpc.cancelPending(id, "انتهت مهلة الطلب"); // يحذف المدخل ويرفض الوعد أدناه.
      }, ms);
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

  /** يرسل إشعارًا للخادم (يُتجاهَل بصمت إن لم يكن جاهزًا). */
  notify(method, params) {
    if (this._rpc && this._ready) this._rpc.notify(method, params);
  }

  _emitReady(value) {
    if (this._ready === value) return;
    this._ready = value;
    for (const l of this._readyListeners) {
      try {
        l(value);
      } catch {
        /* تجاهل */
      }
    }
  }

  _trace(msg) {
    if (this._output) {
      try {
        this._output.appendLine(msg);
      } catch {
        /* تجاهل */
      }
    }
  }

  /** يحلّ مسار الخادم: الإعداد الصريح ⇒ المدمج bin/ ⇒ PATH. يُرجع مسارًا/اسمًا أو null. */
  async _resolveServer() {
    const cfg = readConfig();
    if (cfg.serverPath) {
      const abs = await probeTool(cfg.serverPath);
      return abs || cfg.serverPath; // نحترم الإعداد الصريح ولو تعذّر التحقّق المسبق
    }
    const resolved = resolveBundledTool(this._context, SAD_LSP_EXE, SAD_LSP_CMD);
    // مدمج (مسار مطلق) ⇒ استعمله؛ وإلا رقِّ اسم PATH لمسار مطلق إن وُجد، وإلا null.
    const probed = await probeTool(resolved);
    return probed;
  }

  /** يبدأ الخادم ويجري المصافحة. آمن للاستدعاء المتكرّر (يتجاهل إن كان حيًّا). */
  async start() {
    if (this._disposed || this._proc) return;
    const server = await this._resolveServer();
    if (!server) {
      vscode.window.showWarningMessage(COPY.serverNotFound);
      this._trace("[sad-lsp] لم يُعثَر على الخادم — الذكاء اللغويّ معطَّل.");
      return;
    }
    await this._spawn(server);
  }

  async _spawn(server) {
    this._traceEnabled = readConfig().trace; // [M1] اقرأ علَم التتبّع عند كلّ إطلاق.
    let child;
    try {
      child = cp.spawn(server, [], { stdio: ["pipe", "pipe", "pipe"] });
    } catch (err) {
      this._trace(`[sad-lsp] فشل الإطلاق: ${err}`);
      this._scheduleRestart(false); // [M3] لم يبلغ الجاهزيّة.
      return;
    }
    this._proc = child;
    this._startedAt = Date.now();

    child.on("error", (err) => {
      this._trace(`[sad-lsp] خطأ العمليّة: ${err}`);
      this._onExit();
    });
    child.on("exit", (code, signal) => {
      this._trace(`[sad-lsp] خرج الخادم (code=${code}, signal=${signal}).`);
      this._onExit();
    });
    if (child.stderr) {
      // استنزاف stderr دائمًا (يمنع امتلاء الأنبوب)، لكن تسجيله المطوَّل مشروط بعلَم التتبّع. [M1]
      child.stderr.resume();
      if (this._traceEnabled) {
        child.stderr.on("data", (d) => this._trace(`[sad-lsp:stderr] ${String(d).trimEnd()}`));
      }
    }

    if (!child.stdin || !child.stdout) {
      this._trace("[sad-lsp] لا مجاري stdio — يُعاد التشغيل.");
      this._onExit();
      return;
    }

    const rpc = new RpcClient(child.stdin, child.stdout);
    this._rpc = rpc;
    // fail-safe لطلبات خادم→عميل الشائعة كي لا يعلّق الخادم بانتظار ردّ.
    rpc.onRequest(M_REGISTER_CAPABILITY, () => null);
    rpc.onRequest(M_UNREGISTER_CAPABILITY, () => null);
    rpc.onRequest(M_WORK_DONE_CREATE, () => null);
    // workspace/configuration: نُرجع null لكلّ عنصر مطلوب (لا إعدادات مخصّصة نمرّرها بعد).
    rpc.onRequest(M_CONFIGURATION, (params) => {
      const items = (params && Array.isArray(params.items)) ? params.items : [];
      return items.map(() => null);
    });
    // أعِد ربط إشعارات المستهلك المُسجَّلة مسبقًا (publishDiagnostics).
    for (const [method, handler] of this._notificationHandlers) {
      rpc.onNotification(method, handler);
    }

    await this._handshake(rpc);
  }

  async _handshake(rpc) {
    try {
      const result = await this._withTimeout(
        rpc.request(M_INITIALIZE, initializeParams()),
        INIT_TIMEOUT_MS,
      );
      this._serverCapabilities = (result && result.capabilities) || {};
      // [S4/SAD-08] تفاوضُ ترميز المواضع.
      //
      // ‏**العطبُ ليس أنّ التحذيرَ مكتومٌ** — `_trace` يكتب في قناة الخرج دائمًا،
      // و`_traceEnabled` يحكم تسجيلَ stderr المطوَّل وحدَه (‏:277) لا هذا السطر.
      // العطبُ أنّ الشرطَ `if (enc && …)` **لا يصدق أبدًا على الخادم المشحون**:
      // `positionEncoding` عنده `undefined` بالقياس. فالسطرُ يُنفَّذ ولا يُطلَق —
      // شرطٌ مكتوبٌ لحالةٍ لا تقع، بينما الحالةُ الواقعةُ تمرّ من تحته صامتة.
      //
      // ولا يُحوَّل مع ذلك إلى **فشل**: غيابُ الحقل **مطابقٌ للمواصفة** (‏الافتراضُ عند
      // غيابه هو `utf-16` نصًّا)، فإفشالُ الجلسة عليه أحمرُ كاذبٌ يُعطِّل كلَّ خادمٍ
      // ملتزمٍ يحذفه. البديلُ أن يصير الإعلانُ **مُدخَلًا للقياس**: ما يُعلَن صراحةً
      // يُصدَّق ويُسلَّم للعرّاف، وما يُسكَت عنه يُقاس من الحمولة (`position-encoding.js`).
      const enc = this._serverCapabilities.positionEncoding;
      this._declaredPositionEncoding = typeof enc === "string" ? enc : null;
      if (enc && enc !== POSITION_ENCODING_UTF16) {
        this._trace(`⚠️ الخادم يعلن ترميز مواضع «${enc}» لا ${POSITION_ENCODING_UTF16} — تُرمَّم المديات.`);
      }
      rpc.notify(M_INITIALIZED, {});
      this._emitReady(true);
      this._trace(`[sad-lsp] ${COPY.ready}`);
      // صفّر عدّاد المحاولات بعد نافذة استقرار (المؤقّت متتبَّع كي يُلغى عند الإغلاق). [S8]
      const startedAt = this._startedAt;
      this._stabilityTimer = setTimeout(() => {
        this._stabilityTimer = null;
        if (this._startedAt === startedAt && this._proc) this._restartAttempts = 0;
      }, STABLE_UPTIME_MS);
    } catch (err) {
      this._trace(`[sad-lsp] ${COPY.initFailed(err && err.message ? err.message : err)}`);
      this._onExit();
    }
  }

  _withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("انتهت مهلة المصافحة")), ms);
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

  /** يُنظّف الحالة عند موت الخادم ويجدول إعادة تشغيل (ما لم يكن مُغلَقًا عمدًا). */
  _onExit() {
    const wasReady = this._ready;
    this._emitReady(false);
    if (this._stabilityTimer) {
      clearTimeout(this._stabilityTimer);
      this._stabilityTimer = null;
    }
    if (this._rpc) {
      this._rpc.dispose("خرج خادم ص LSP");
      this._rpc = null;
    }
    if (this._proc) {
      try {
        this._proc.removeAllListeners();
      } catch {
        /* تجاهل */
      }
      this._proc = null;
    }
    this._serverCapabilities = null;
    if (this._disposed) return;
    // إعادة تشغيل فقط إن كان قد عمل ثمّ سقط (لا حلقة على «غير موجود»).
    this._scheduleRestart(wasReady);
  }

  _scheduleRestart(wasReady) {
    if (this._disposed) return;
    if (this._restartTimer) return;
    // [M3] خادم لم يبلغ الجاهزيّة قطّ (فشل إطلاق/مصافحة متكرّر: ثنائيّ معطوب/معماريّة خاطئة) ⇒
    //      توقّف بعد محاولة واحدة بدل خمس حوارات خطأ متصاعدة على عيب لن يزول بإعادة التشغيل.
    if (!wasReady && this._restartAttempts >= 1) {
      vscode.window.showErrorMessage(COPY.gaveUp);
      this._trace(`[sad-lsp] ${COPY.gaveUp}`);
      return;
    }
    this._restartAttempts++;
    if (this._restartAttempts > RESTART_MAX_ATTEMPTS) {
      vscode.window.showErrorMessage(COPY.gaveUp);
      this._trace(`[sad-lsp] ${COPY.gaveUp}`);
      return;
    }
    const delay = Math.min(RESTART_BASE_MS * 2 ** (this._restartAttempts - 1), RESTART_MAX_MS);
    this._trace(`[sad-lsp] ${COPY.crashed(this._restartAttempts)} (بعد ${delay}ms)`);
    this._restartTimer = setTimeout(() => {
      this._restartTimer = null;
      if (!this._disposed) void this.start();
    }, delay);
  }

  /** إعادة تشغيل يدويّة (أمر «ص: أعِد تشغيل خادم اللغة»): يصفّر العدّاد ويعيد الإطلاق. */
  async restart() {
    this._restartAttempts = 0;
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }
    await this._stopProc(true);
    await this.start();
  }

  async _stopProc(graceful) {
    // [M2] انزع مستمعي exit/error أوّلًا: إيقاف مقصود يجب ألّا يشعل _onExit فيجدول إعادة تشغيل
    //      زائفة (خادم قد يخرج استجابةً لـshutdown قبل انتهاء هذا المتدرّج ⇒ سباق إعادة تشغيل مزدوجة).
    if (this._proc) {
      try {
        this._proc.removeAllListeners();
        // مستمع خطأ فارغ يبقى طوال نافذة الإيقاف المتدرّج: حدث "error" بلا مستمع يُرمى غير مُلتقَط
        // في Node. [تصلُّب مراجعة Amelia]
        this._proc.on("error", () => {});
      } catch {
        /* تجاهل */
      }
    }
    // [S8] ألغِ مؤقّت نافذة الاستقرار كي لا يشرد بعد الإيقاف.
    if (this._stabilityTimer) {
      clearTimeout(this._stabilityTimer);
      this._stabilityTimer = null;
    }
    if (this._rpc && graceful && this._ready) {
      try {
        await this._withTimeout(this._rpc.request(M_SHUTDOWN, null), 2000);
        this._rpc.notify(M_EXIT, null);
      } catch {
        /* تجاهل — سنقتل العمليّة على أيّ حال */
      }
    }
    this._emitReady(false);
    if (this._rpc) {
      this._rpc.dispose("إيقاف خادم ص LSP");
      this._rpc = null;
    }
    if (this._proc) {
      try {
        this._proc.removeAllListeners();
        this._proc.kill();
      } catch {
        /* تجاهل */
      }
      this._proc = null;
    }
    this._serverCapabilities = null;
  }

  /** إغلاق نهائيّ (deactivate): لا إعادة تشغيل بعده. */
  async dispose() {
    this._disposed = true;
    if (this._restartTimer) {
      clearTimeout(this._restartTimer);
      this._restartTimer = null;
    }
    await this._stopProc(true);
  }
}

module.exports = { SadLspProcess, readConfig, COPY };
