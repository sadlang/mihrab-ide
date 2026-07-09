// @ts-check
"use strict";
// اختبار وحدة لعميل RPC المحرابيّ (node --test) — نقيّ بلا vscode. يغطّي: جولة تأطير
// Content-Length، حسم الطلب بالردّ، توجيه الإشعارات، معالجة طلب خادم→عميل والردّ عليه،
// MethodNotFound عند غياب المعالِج، ورفض المعلَّقات عند dispose.
//
// أسماء الطرائق ورموز JSON-RPC تُستورَد من مصدر الحقيقة المولَّد (لا حرفيّة) كي يمسك الاختبار
// أيّ تباعد عن العقد: إعادة تسمية طريقة في المصدر ⇒ يفشل الاختبار بدل مروره صامتًا (F6).

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { RpcClient, encodeFrame, FrameDecoder } = require("./rpc-client.js");
const {
  JSONRPC_VERSION,
  JSONRPC_METHOD_NOT_FOUND,
  METHOD_INITIALIZE,
  METHOD_TASK,
  METHOD_TASK_PROGRESS,
  METHOD_REQUEST_PERMISSION,
} = require("./contract/protocol-contract.generated.js");

/** مجرى كتابة وهميّ يلتقط الأطر المكتوبة ويفكّكها لرسائل. */
function fakeWritable() {
  const messages = [];
  const decoder = new FrameDecoder((m) => messages.push(m));
  return {
    messages,
    write(buf) {
      decoder.push(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
      return true;
    },
  };
}

/** مجرى قراءة وهميّ (EventEmitter) نغذّيه أطرًا مؤطَّرة. */
function fakeReadable() {
  const em = new EventEmitter();
  return {
    stream: em,
    feed(msg) {
      em.emit("data", encodeFrame(msg));
    },
  };
}

test("جولة تأطير: encodeFrame ثمّ FrameDecoder تعيد الرسالة", () => {
  const out = [];
  const dec = new FrameDecoder((m) => out.push(m));
  dec.push(encodeFrame({ jsonrpc: JSONRPC_VERSION, id: 1, method: "س", params: { ن: "قيمة عربيّة" } }));
  assert.equal(out.length, 1);
  assert.equal(out[0].params.ن, "قيمة عربيّة");
});

test("request: يُحسَم بالردّ المطابق للمعرّف", async () => {
  const w = fakeWritable();
  const r = fakeReadable();
  const rpc = new RpcClient(w, r.stream);
  const p = rpc.request(METHOD_INITIALIZE, { x: 1 });
  const sent = w.messages[0];
  assert.equal(sent.method, METHOD_INITIALIZE);
  r.feed({ jsonrpc: JSONRPC_VERSION, id: sent.id, result: { ok: true } });
  assert.deepEqual(await p, { ok: true });
});

test("request: يُرفَض بخطأ يحمل الرمز الدلاليّ", async () => {
  const w = fakeWritable();
  const r = fakeReadable();
  const rpc = new RpcClient(w, r.stream);
  const p = rpc.request(METHOD_TASK, {});
  const id = w.messages[0].id;
  // -32001 رمز خطأ خادم مخصّص (بيانات اختبار عشوائيّة، لا ثابت عقديّ).
  r.feed({ jsonrpc: JSONRPC_VERSION, id, error: { code: -32001, message: "غير مصرَّح" } });
  await assert.rejects(p, (e) => e.message === "غير مصرَّح" && e.code === -32001);
});

test("notify + onNotification: توجيه إشعار بثّ", () => {
  const w = fakeWritable();
  const r = fakeReadable();
  const rpc = new RpcClient(w, r.stream);
  const seen = [];
  rpc.onNotification(METHOD_TASK_PROGRESS, (p) => seen.push(p));
  r.feed({ jsonrpc: JSONRPC_VERSION, method: METHOD_TASK_PROGRESS, params: { taskId: 5, delta: "ن" } });
  assert.deepEqual(seen, [{ taskId: 5, delta: "ن" }]);
});

test("onRequest: يعالج طلب خادم→عميل ويردّ result", async () => {
  const w = fakeWritable();
  const r = fakeReadable();
  const rpc = new RpcClient(w, r.stream);
  rpc.onRequest(METHOD_REQUEST_PERMISSION, () => ({ approved: true }));
  r.feed({ jsonrpc: JSONRPC_VERSION, id: -1, method: METHOD_REQUEST_PERMISSION, params: {} });
  // الردّ غير متزامن (Promise.resolve) — انتظر دورة.
  await new Promise((res) => setImmediate(res));
  const reply = w.messages.find((m) => m.id === -1);
  assert.ok(reply, "يوجد ردّ على الطلب الوارد");
  assert.deepEqual(reply.result, { approved: true });
});

test("طلب خادم بلا معالِج ⇒ MethodNotFound (لا يعلّق الخادم)", async () => {
  const w = fakeWritable();
  const r = fakeReadable();
  const rpc = new RpcClient(w, r.stream);
  // طريقة غير مسجَّلة عمدًا (بيانات اختبار) ⇒ يجب أن يردّ العميل MethodNotFound العقديّ.
  r.feed({ jsonrpc: JSONRPC_VERSION, id: -2, method: "nebras/غير-معروف", params: {} });
  await new Promise((res) => setImmediate(res));
  const reply = w.messages.find((m) => m.id === -2);
  assert.ok(reply && reply.error, "ردّ خطأ");
  assert.equal(reply.error.code, JSONRPC_METHOD_NOT_FOUND);
});

test("dispose: يرفض كلّ طلب معلّق", async () => {
  const w = fakeWritable();
  const r = fakeReadable();
  const rpc = new RpcClient(w, r.stream);
  const p = rpc.request(METHOD_TASK, {});
  rpc.dispose("أُغلق");
  await assert.rejects(p, (e) => /أُغلق/.test(e.message));
});
