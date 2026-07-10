// @ts-check
"use strict";
// اختبار وحدة لنقل ص LSP (lsp-rpc.js): تأطير Content-Length (FrameDecoder) وربط طلب↔ردّ
// وإشعارات وطلبات خادم→عميل والإغلاق (RpcClient). مجاري وهميّة (EventEmitter) — لا عمليّة/vscode.

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  RpcClient,
  FrameDecoder,
  encodeFrame,
  CONTENT_LENGTH,
  HEADER_SEP,
  JSONRPC_VERSION,
} = require("./lsp-rpc.js");

/** مجرى كتابة وهميّ يلتقط البايتات المكتوبة (child.stdin). */
function makeWritable() {
  const w = new EventEmitter();
  w.chunks = [];
  // @ts-ignore
  w.write = (buf) => {
    w.chunks.push(Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
    return true;
  };
  // آخر رسالة مكتوبة مفكوكة (نفكّ إطارها لفحص المحتوى).
  w.lastMessage = () => {
    const decoder = new FrameDecoder(() => {});
    let parsed = null;
    const d2 = new FrameDecoder((m) => { parsed = m; });
    d2.push(Buffer.concat(w.chunks));
    void decoder;
    return parsed;
  };
  w.allMessages = () => {
    const out = [];
    const d = new FrameDecoder((m) => out.push(m));
    d.push(Buffer.concat(w.chunks));
    return out;
  };
  return w;
}

// ═══════════════════════════ FrameDecoder ═══════════════════════════

test("FrameDecoder: إطار واحد كامل يُفكّ", () => {
  const got = [];
  const d = new FrameDecoder((m) => got.push(m));
  d.push(encodeFrame({ jsonrpc: JSONRPC_VERSION, id: 1, result: { ok: true } }));
  assert.equal(got.length, 1);
  assert.deepEqual(got[0], { jsonrpc: "2.0", id: 1, result: { ok: true } });
});

test("FrameDecoder: إطار مقسوم على قطعتين", () => {
  const got = [];
  const d = new FrameDecoder((m) => got.push(m));
  const frame = encodeFrame({ id: 2, method: "x" });
  d.push(frame.subarray(0, 10));
  assert.equal(got.length, 0, "لا رسالة قبل اكتمال الإطار");
  d.push(frame.subarray(10));
  assert.equal(got.length, 1);
  assert.equal(got[0].id, 2);
});

test("FrameDecoder: إطاران مدموجان في قطعة واحدة", () => {
  const got = [];
  const d = new FrameDecoder((m) => got.push(m));
  d.push(Buffer.concat([encodeFrame({ id: 1 }), encodeFrame({ id: 2 })]));
  assert.equal(got.length, 2);
  assert.deepEqual(got.map((m) => m.id), [1, 2]);
});

test("FrameDecoder: ترويسة تالفة ⇒ إعادة مزامنة للإطار التالي", () => {
  const got = [];
  const d = new FrameDecoder((m) => got.push(m));
  const good = encodeFrame({ id: 7 });
  const garbage = Buffer.from("رسالة تالفة بلا ترويسة" + HEADER_SEP, "utf8");
  d.push(Buffer.concat([garbage, good]));
  assert.equal(got.length, 1, "يتعافى ويفكّ الإطار السليم التالي");
  assert.equal(got[0].id, 7);
});

test("FrameDecoder: جسم JSON تالف لا يُسقِط المُفكِّك", () => {
  const got = [];
  const d = new FrameDecoder((m) => got.push(m));
  const body = Buffer.from("{ليس JSON", "utf8");
  const frame = Buffer.concat([
    Buffer.from(`${CONTENT_LENGTH}: ${body.length}${HEADER_SEP}`, "ascii"),
    body,
  ]);
  assert.doesNotThrow(() => d.push(frame));
  assert.equal(got.length, 0);
  // يتابع بعد التالف: إطار سليم يليه يُفكّ.
  d.push(encodeFrame({ id: 9 }));
  assert.equal(got.length, 1);
  assert.equal(got[0].id, 9);
});

test("encodeFrame: طول Content-Length بالبايتات لا الأحرف (عربيّة متعدّدة البايت)", () => {
  const msg = { m: "عربي" }; // 4 أحرف = 8 بايتات UTF-8
  const frame = encodeFrame(msg);
  const text = frame.toString("utf8");
  const declared = Number(text.match(/Content-Length:\s*(\d+)/)[1]);
  const bodyBytes = Buffer.byteLength(JSON.stringify(msg), "utf8");
  assert.equal(declared, bodyBytes);
});

// ═══════════════════════════ RpcClient ═══════════════════════════

/** يبني عميلًا مع مجرى قراءة يمكن حقن رسائل الخادم فيه. */
function makeClient() {
  const readable = new EventEmitter();
  const writable = makeWritable();
  const client = new RpcClient(writable, readable);
  // يحقن رسالة خادم→عميل عبر مجرى القراءة (مؤطَّرة).
  readable.feed = (msg) => readable.emit("data", encodeFrame(msg));
  return { client, readable, writable };
}

test("RpcClient: طلب يُحلّ عند وصول الردّ بالمعرّف نفسه", async () => {
  const { client, readable, writable } = makeClient();
  const p = client.request("textDocument/hover", { x: 1 });
  const sent = writable.allMessages()[0];
  assert.equal(sent.method, "textDocument/hover");
  assert.equal(sent.jsonrpc, "2.0");
  readable.feed({ jsonrpc: "2.0", id: sent.id, result: { contents: "مرحبا" } });
  const result = await p;
  assert.deepEqual(result, { contents: "مرحبا" });
});

test("RpcClient: ردّ خطأ يرفض الوعد برمز الخطأ", async () => {
  const { client, readable, writable } = makeClient();
  const p = client.request("x", null);
  const id = writable.allMessages()[0].id;
  readable.feed({ jsonrpc: "2.0", id, error: { code: -32603, message: "فشل" } });
  await assert.rejects(p, (e) => {
    assert.equal(e.message, "فشل");
    assert.equal(e.code, -32603);
    return true;
  });
});

test("RpcClient: إشعار بثّ يُوجَّه للمعالِج المسجَّل", () => {
  const { client, readable } = makeClient();
  let received = null;
  client.onNotification("textDocument/publishDiagnostics", (params) => { received = params; });
  readable.feed({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: { uri: "file:///a.ص", diagnostics: [] } });
  assert.ok(received);
  assert.equal(received.uri, "file:///a.ص");
});

test("RpcClient: طلب خادم→عميل بلا معالِج يُردّ عليه MethodNotFound", () => {
  const { client, readable, writable } = makeClient();
  readable.feed({ jsonrpc: "2.0", id: -5, method: "client/registerCapability", params: {} });
  const reply = writable.allMessages().find((m) => m.id === -5);
  assert.ok(reply, "أُرسِل ردّ على طلب الخادم");
  assert.equal(reply.error.code, -32601, "MethodNotFound");
});

test("RpcClient: معالِج طلب خادم→عميل يُرجع result", async () => {
  const { client, readable, writable } = makeClient();
  client.onRequest("workspace/configuration", () => [null]);
  readable.feed({ jsonrpc: "2.0", id: -3, method: "workspace/configuration", params: { items: [{}] } });
  await new Promise((r) => setImmediate(r)); // المعالِج غير متزامن (Promise.resolve)
  const reply = writable.allMessages().find((m) => m.id === -3);
  assert.ok(reply);
  assert.deepEqual(reply.result, [null]);
});

test("RpcClient: dispose يرفض كلّ طلب معلّق (لا تعليق عند موت الخادم)", async () => {
  const { client } = makeClient();
  const p = client.request("x", null);
  client.dispose("مات الخادم");
  await assert.rejects(p, /مات الخادم/);
});

test("RpcClient: طلب على عميل مُغلَق يُرفَض فورًا", async () => {
  const { client } = makeClient();
  client.dispose();
  await assert.rejects(client.request("x", null), /مُغلَق/);
});
