// @ts-check
"use strict";
// عميل JSON-RPC 2.0 عبر stdio لعقد nebras-protocol (ق13) — الطرف المحرابيّ.
// يعكس تأطير Content-Length لخادم نِبراس (core/server/stdio.ts): بايتات UTF-8، لا أحرف.
// يدعم: طلب/ردّ (client→server)، إشعارات بثّ (server→client TaskProgress)، وطلبات
// خادم→عميل (RequestPermission بمعرّفات سالبة) نردّ عليها بموافقة/رفض.
//
// لا سلاسل حرفيّة منطقيّة: ثوابت عقد السلك (الترويسات/الرموز/الحدود) تُستورَد من مصدر
// الحقيقة المولَّد `contract/protocol-contract.generated.js` (يعكس @nebras/protocol).

const {
  HEADER_SEP,
  CONTENT_LENGTH,
  MAX_FRAME_BYTES,
  JSONRPC_VERSION,
  JSONRPC_METHOD_NOT_FOUND,
  JSONRPC_INTERNAL_ERROR,
} = require("./contract/protocol-contract.generated.js");

// مشتقّات/ثوابت محلّيّة غير عقديّة (خاصّة بتطبيق العميل).
const CONTENT_LENGTH_RE = new RegExp(`${CONTENT_LENGTH}:\\s*(\\d+)`, "i");
const ENC = "utf8";
// معرّف حارس يُعاد عند طلب على عميل مُغلَق (الوعد يُرفَض فورًا، لا يُوجَّه — قيمة لا تصطدم بمعرّفات حيّة).
const DISPOSED_SENTINEL_ID = -1;

/** يبني إطار Content-Length لرسالة صادرة (بايتات UTF-8). */
function encodeFrame(msg) {
  const body = Buffer.from(JSON.stringify(msg), ENC);
  return Buffer.concat([
    Buffer.from(`${CONTENT_LENGTH}: ${body.length}${HEADER_SEP}`, "ascii"),
    body,
  ]);
}

/**
 * مُفكِّك تأطير Content-Length تراكميّ (نسخة العميل من FrameDecoder): يستقبل قطعًا ويستدعي
 * onMessage لكلّ إطار مكتمل؛ يعالج الإطارات المقسومة/المدموجة ويعيد المزامنة عند ترويسة تالفة.
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
        /* جسم تالف — تجاهله وتابع (لا انهيار على مدخل غير موثوق). */
      }
    }
  }
}

/**
 * عميل RPC يلفّ مجرى قراءة/كتابة (stdout/stdin لعمليّة الخادم الفرعيّة).
 * دورة الحياة يديرها المُستدعِي (مدير العمليّة): عند موت الخادم يستدعي dispose.
 */
class RpcClient {
  /**
   * @param {NodeJS.WritableStream} writable مجرى كتابة إلى الخادم (child.stdin)
   * @param {NodeJS.ReadableStream} readable مجرى قراءة من الخادم (child.stdout)
   */
  constructor(writable, readable) {
    this._writable = writable;
    /** عدّاد معرّفات الطلبات الصادرة (عميل→خادم) — موجب (الخادم يستعمل السالب لطلباته). */
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

  /** يسجّل معالِج طلب خادم→عميل (مثل RequestPermission). يُرجع result أو يرمي. */
  onRequest(method, handler) {
    this._requestHandlers.set(method, handler);
  }

  /** يسجّل معالِج إشعار (مثل TaskProgress). */
  onNotification(method, handler) {
    this._notificationHandlers.set(method, handler);
  }

  /** يرسل طلبًا وينتظر الردّ. يرفض إن رُفض العميل/مات الخادم. */
  request(method, params) {
    return this.sendRequest(method, params).promise;
  }

  /**
   * يرسل طلبًا ويُرجع {id, promise} معًا — يتيح للمُستدعِي ربط بثّ TaskProgress بمعرّف المهمّة
   * (الخادم يصدّر معرّف الطلب نفسه كـtaskId) قبل وصول أوّل قطعة.
   */
  sendRequest(method, params) {
    if (this._disposed) {
      return { id: DISPOSED_SENTINEL_ID, promise: Promise.reject(new Error("عميل نِبراس مُغلَق")) };
    }
    const id = this._nextId++;
    const message = { jsonrpc: JSONRPC_VERSION, id, method, params };
    const promise = new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      try {
        this._writable.write(encodeFrame(message));
      } catch (err) {
        this._pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
    return { id, promise };
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
        const err = new Error(e && e.message ? String(e.message) : "خطأ نِبراس");
        // @ts-ignore — نمرّر رمز الخطأ الدلاليّ للمستهلك (ErrorCode).
        err.code = e && typeof e.code === "number" ? e.code : undefined;
        pending.reject(err);
      } else {
        pending.resolve(msg.result);
      }
      return;
    }

    // (ب) طلب خادم→عميل: له method + id (RequestPermission بمعرّف سالب).
    if (hasMethod && hasId) {
      this._handleServerRequest(msg);
      return;
    }

    // (ج) إشعار بثّ خادم→عميل: له method وبلا id (TaskProgress).
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
    const err = new Error(reason || "أُغلق خادم نِبراس");
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

module.exports = { RpcClient, FrameDecoder, encodeFrame, MAX_FRAME_BYTES };
