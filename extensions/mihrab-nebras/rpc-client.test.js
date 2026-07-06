// @ts-check
"use strict";
// اختبار وحدة لعميل RPC المحرابيّ (node --test) — نقيّ بلا vscode. يغطّي: جولة تأطير
// Content-Length، حسم الطلب بالردّ، توجيه الإشعارات، معالجة طلب خادم→عميل والردّ عليه،
// MethodNotFound عند غياب المعالِج، ورفض المعلَّقات عند dispose.

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { RpcClient, encodeFrame, FrameDecoder } = require("./rpc-client.js");

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
  dec.push(encodeFrame({ jsonrpc: "2.0", id: 1, method: "س", params: { ن: "قيمة عربيّة" } }));
  assert.equal(out.length, 1);
  assert.equal(out[0].params.ن, "قيمة عربيّة");
});

test("request: يُحسَم بالردّ المطابق للمعرّف", async () => {
  const w = fakeWritable();
  const r = fakeReadable();
  const rpc = new RpcClient(w, r.stream);
  const p = rpc.request("nebras/initialize", { x: 1 });
  const sent = w.messages[0];
  assert.equal(sent.method, "nebras/initialize");
  r.feed({ jsonrpc: "2.0", id: sent.id, result: { ok: true } });
  assert.deepEqual(await p, { ok: true });
});

test("request: يُرفَض بخطأ يحمل الرمز الدلاليّ", async () => {
  const w = fakeWritable();
  const r = fakeReadable();
  const rpc = new RpcClient(w, r.stream);
  const p = rpc.request("nebras/task", {});
  const id = w.messages[0].id;
  r.feed({ jsonrpc: "2.0", id, error: { code: -32001, message: "غير مصرَّح" } });
  await assert.rejects(p, (e) => e.message === "غير مصرَّح" && e.code === -32001);
});

test("notify + onNotification: توجيه إشعار بثّ", () => {
  const w = fakeWritable();
  const r = fakeReadable();
  const rpc = new RpcClient(w, r.stream);
  const seen = [];
  rpc.onNotification("nebras/taskProgress", (p) => seen.push(p));
  r.feed({ jsonrpc: "2.0", method: "nebras/taskProgress", params: { taskId: 5, delta: "ن" } });
  assert.deepEqual(seen, [{ taskId: 5, delta: "ن" }]);
});

test("onRequest: يعالج طلب خادم→عميل ويردّ result", async () => {
  const w = fakeWritable();
  const r = fakeReadable();
  const rpc = new RpcClient(w, r.stream);
  rpc.onRequest("nebras/requestPermission", () => ({ approved: true }));
  r.feed({ jsonrpc: "2.0", id: -1, method: "nebras/requestPermission", params: {} });
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
  r.feed({ jsonrpc: "2.0", id: -2, method: "nebras/غير-معروف", params: {} });
  await new Promise((res) => setImmediate(res));
  const reply = w.messages.find((m) => m.id === -2);
  assert.ok(reply && reply.error, "ردّ خطأ");
  assert.equal(reply.error.code, -32601);
});

test("dispose: يرفض كلّ طلب معلّق", async () => {
  const w = fakeWritable();
  const r = fakeReadable();
  const rpc = new RpcClient(w, r.stream);
  const p = rpc.request("nebras/task", {});
  rpc.dispose("أُغلق");
  await assert.rejects(p, (e) => /أُغلق/.test(e.message));
});
