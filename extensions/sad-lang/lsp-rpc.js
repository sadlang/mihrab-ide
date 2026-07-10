// @ts-check
"use strict";
// عميل JSON-RPC 2.0 عبر stdio لبروتوكول خادم اللغة (LSP) — الطرف المحرابيّ لخادم ص (sad-lsp).
// يُنفّذ «البروتوكول الأساسيّ» لـLSP: تأطير Content-Length ببايتات UTF-8، ثمّ رسائل JSON-RPC 2.0
// (طلب/ردّ عميل→خادم، إشعارات بثّ خادم→عميل مثل textDocument/publishDiagnostics، وطلبات
// خادم→عميل مثل client/registerCapability نردّ عليها fail-safe).
//
// مقتبَس من تصميم نقل نِبراس المُختبَر (extensions/mihrab-nebras/rpc-client.js). لا اقتران بين
// الامتدادين: ثوابت هذا الملفّ هي ثوابت **بروتوكول LSP القياسيّ العامّ** (لا ملكيّة عقد نِبراس)،
// معرّفة محلّيًّا كثوابت مسمّاة (لا سلاسل حرفيّة منطقيّة).

// ── ثوابت البروتوكول الأساسيّ لـLSP / JSON-RPC (معيار عامّ) ──
const CONTENT_LENGTH = "Content-Length";
const HEADER_SEP = "\r\n\r\n";
const JSONRPC_VERSION = "2.0";
// رموز أخطاء JSON-RPC القياسيّة المستعملة في الردّ على طلبات الخادم.
const JSONRPC_METHOD_NOT_FOUND = -32601;
const JSONRPC_INTERNAL_ERROR = -32603;
// سقف حجم الإطار (حارس ضدّ ترويسة تالفة تدّعي طولًا هائلًا). 32 ميبي أوسع من أيّ ردّ LSP واقعيّ.
const MAX_FRAME_BYTES = 32 * 1024 * 1024;

const CONTENT_LENGTH_RE = new RegExp(`${CONTENT_LENGTH}:\\s*(\\d+)`, "i");
const ENC = "utf8";

/** يبني إطار Content-Length لرسالة صادرة (بايتات UTF-8). */
function encodeFrame(msg) {
  const body = Buffer.from(JSON.stringify(msg), ENC);
  return Buffer.concat([
    Buffer.from(`${CONTENT_LENGTH}: ${body.length}${HEADER_SEP}`, "ascii"),
    body,
  ]);
}

/**
 * مُفكِّك تأطير Content-Length تراكميّ: يستقبل قطعًا ويستدعي onMessage لكلّ إطار مكتمل؛
 * يعالج الإطارات المقسومة/المدموجة ويعيد المزامنة عند ترويسة تالفة (لا انهيار على مدخل غير موثوق).
 */
class FrameDecoder {
  constructor(onMessage) {
    this.buffer = Buffer.alloc(0);
    this.onMessage = onMessage;
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const headerEnd = this.buffer.indexOf(HEADER_SEP);
      if (headerEnd < 0) return;
      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const match = header.match(CONTENT_LENGTH_RE);
      if (!match) {
        // ترويسة تالفة ⇒ أعِد المزامنة لأقرب Content-Length تالٍ (غير حسّاس للحالة).
        const hay = this.buffer.toString("latin1").toLowerCase();
        const next = hay.indexOf(CONTENT_LENGTH.toLowerCase(), headerEnd + HEADER_SEP.length);
        if (next < 0) {
          const keep = CONTENT_LENGTH.length - 1;
          if (this.buffer.length > keep) this.buffer = this.buffer.subarray(this.buffer.length - keep);
          return;
        }
        this.buffer = this.buffer.subarray(next);
        continue;
      }
      const len = Number(match[1]);
      if (!Number.isSafeInteger(len) || len > MAX_FRAME_BYTES) {
        this.buffer = this.buffer.subarray(headerEnd + HEADER_SEP.length);
        continue;
      }
      const bodyStart = headerEnd + HEADER_SEP.length;
      if (this.buffer.length < bodyStart + len) return; // إطار غير مكتمل بعد.
      const body = this.buffer.subarray(bodyStart, bodyStart + len).toString(ENC);
      this.buffer = this.buffer.subarray(bodyStart + len);
      try {
        this.onMessage(JSON.parse(body));
      } catch {
        /* جسم تالف — تجاهله وتابع. */
      }
    }
  }
}

/**
 * عميل RPC يلفّ مجرى قراءة/كتابة (stdout/stdin لعمليّة الخادم الفرعيّة). دورة الحياة يديرها
 * المُستدعِي (مدير العمليّة): عند موت الخادم يستدعي dispose.
 */
class RpcClient {
  /**
   * @param {NodeJS.WritableStream} writable مجرى كتابة إلى الخادم (child.stdin)
   * @param {NodeJS.ReadableStream} readable مجرى قراءة من الخادم (child.stdout)
   */
  constructor(writable, readable) {
    this._writable = writable;
    this._nextId = 1;
    /** @type {Map<number, {resolve: (v: any) => void, reject: (e: Error) => void}>} */
    this._pending = new Map();
    /** @type {Map<string, (params: any) => Promise<any> | any>} معالِجات طلبات خادم→عميل */
    this._requestHandlers = new Map();
    /** @type {Map<string, (params: any) => void>} معالِجات الإشعارات (بثّ) */
    this._notificationHandlers = new Map();
    this._disposed = false;

    this._decoder = new FrameDecoder((msg) => this._onMessage(msg));
    readable.on("data", (chunk) => {
      this._decoder.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
  }

  /** يسجّل معالِج طلب خادم→عميل (مثل client/registerCapability). يُرجع result أو يرمي. */
  onRequest(method, handler) {
    this._requestHandlers.set(method, handler);
  }

  /** يسجّل معالِج إشعار (مثل textDocument/publishDiagnostics). */
  onNotification(method, handler) {
    this._notificationHandlers.set(method, handler);
  }

  /** يرسل طلبًا وينتظر الردّ. يرفض إن أُغلق العميل/مات الخادم. */
  request(method, params) {
    if (this._disposed) {
      return Promise.reject(new Error("عميل ص LSP مُغلَق"));
    }
    const id = this._nextId++;
    const message = { jsonrpc: JSONRPC_VERSION, id, method, params };
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      try {
        this._writable.write(encodeFrame(message));
      } catch (err) {
        this._pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** يرسل إشعارًا (بلا معرّف، بلا انتظار ردّ). */
  notify(method, params) {
    if (this._disposed) return;
    try {
      this._writable.write(encodeFrame({ jsonrpc: JSONRPC_VERSION, method, params }));
    } catch {
      /* الكتابة على مقبس مقطوع — يتكفّل مدير العمليّة بإعادة التشغيل. */
    }
  }

  /** يعالج رسالة واردة: ردّ علينا، أو طلب خادم→عميل، أو إشعار بثّ. */
  _onMessage(msg) {
    if (msg === null || typeof msg !== "object") return;
    const hasId = msg.id !== undefined && msg.id !== null;
    const hasMethod = typeof msg.method === "string";

    // (أ) ردّ على طلب صادر منّا: له id + (result|error) وبلا method.
    if (hasId && !hasMethod && ("result" in msg || "error" in msg)) {
      const pending = this._pending.get(msg.id);
      if (!pending) return;
      this._pending.delete(msg.id);
      if ("error" in msg && msg.error) {
        const e = /** @type {any} */ (msg.error);
        const err = new Error(e && e.message ? String(e.message) : "خطأ خادم ص LSP");
        // @ts-ignore — نمرّر رمز الخطأ الدلاليّ للمستهلك.
        err.code = e && typeof e.code === "number" ? e.code : undefined;
        pending.reject(err);
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    // (ب) طلب خادم→عميل: له method + id.
    if (hasMethod && hasId) {
      this._handleServerRequest(msg);
      return;
    }

    // (ج) إشعار بثّ خادم→عميل: له method وبلا id (publishDiagnostics …).
    if (hasMethod && !hasId) {
      const handler = this._notificationHandlers.get(msg.method);
      if (handler) {
        try {
          handler(msg.params);
        } catch {
          /* خطأ في معالِج الإشعار لا يُسقِط العميل. */
        }
      }
    }
  }

  /** يعالج طلب خادم→عميل ويردّ result أو خطأ MethodNotFound (fail-safe). */
  _handleServerRequest(msg) {
    const handler = this._requestHandlers.get(msg.method);
    if (!handler) {
      // لا معالِج ⇒ MethodNotFound صريح (لا يعلّق الخادم بانتظار ردّ).
      this._reply(msg.id, undefined, { code: JSONRPC_METHOD_NOT_FOUND, message: "طريقة غير معروفة" });
      return;
    }
    Promise.resolve()
      .then(() => handler(msg.params))
      .then(
        (result) => this._reply(msg.id, result, undefined),
        (err) => this._reply(msg.id, undefined, { code: JSONRPC_INTERNAL_ERROR, message: String(err && err.message ? err.message : err) }),
      );
  }

  /** يرسل ردًّا على طلب خادم→عميل. */
  _reply(id, result, error) {
    if (this._disposed) return;
    const message = error
      ? { jsonrpc: JSONRPC_VERSION, id, error }
      : { jsonrpc: JSONRPC_VERSION, id, result };
    try {
      this._writable.write(encodeFrame(message));
    } catch {
      /* مقبس مقطوع. */
    }
  }

  /** يُغلق العميل: يرفض كلّ طلب معلّق (كي لا تعلّق وعود المستهلك عند موت الخادم). */
  dispose(reason) {
    if (this._disposed) return;
    this._disposed = true;
    const err = new Error(reason || "أُغلق خادم ص LSP");
    for (const { reject } of this._pending.values()) {
      try {
        reject(err);
      } catch {
        /* تجاهل */
      }
    }
    this._pending.clear();
  }
}

module.exports = {
  RpcClient,
  FrameDecoder,
  encodeFrame,
  CONTENT_LENGTH,
  HEADER_SEP,
  JSONRPC_VERSION,
  MAX_FRAME_BYTES,
};
