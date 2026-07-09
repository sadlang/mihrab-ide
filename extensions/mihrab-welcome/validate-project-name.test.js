// @ts-check
"use strict";
// اختبار وحدة لتحقّق اسم مشروع ص (validateProjectName) — منطق نقيّ. نحمّل الامتداد ببديل
// وهميّ لـ`vscode` عبر Module._load (لا استعمال لـvscode على مستوى الوحدة). الدالّة تُرجع
// رسالة خطأ (سلسلة) للاسم غير الصالح، أو null للصالح.
//
// ملاحظة: محارف التحكّم/قلب الاتّجاه في بيانات الاختبار مُهرَّبة (\uXXXX) لا خامّة — التزامًا
// بقاعدة منع المحارف غير المرئيّة، وكي لا يعدّ git الملفّ ثنائيًّا.

const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const _origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "vscode") return {};
  return _origLoad.call(this, request, ...rest);
};

const { validateProjectName } = require("./extension.js");

test("الأسماء الصالحة ⇒ null", () => {
  assert.equal(validateProjectName("مشروعي"), null);
  assert.equal(validateProjectName("my.project"), null); // الجذع «my» غير محجوز
  assert.equal(validateProjectName("a".repeat(255)), null); // الحدّ الأقصى تمامًا
  assert.equal(validateProjectName("  اسم صالح  "), null); // يُقصّ الفراغ المحيط
});

test("الاسم الفارغ ⇒ خطأ", () => {
  assert.ok(validateProjectName(""));
  assert.ok(validateProjectName("   "));
  assert.ok(validateProjectName(null));
  assert.ok(validateProjectName(undefined));
});

test("أطول من الحدّ ⇒ خطأ", () => {
  assert.ok(validateProjectName("a".repeat(256)));
});

test("أسماء النقطة . و.. ⇒ خطأ", () => {
  assert.ok(validateProjectName("."));
  assert.ok(validateProjectName(".."));
});

test("محارف غير صالحة (فواصل مسار/تحكّم/ثنائيّة الاتّجاه) ⇒ خطأ", () => {
  for (const bad of ["a/b", "a\\b", "a:b", "a<b", "a>b", 'a"b', "a|b", "a?b", "a*b"]) {
    assert.ok(validateProjectName(bad), `يجب رفض «${bad}»`);
  }
  assert.ok(validateProjectName("a\u202eb")); // قلب اتّجاه (spoofing)
  assert.ok(validateProjectName("a\u001bb")); // محرف تحكّم (ESC)
});

test("نقطة في النهاية ⇒ خطأ (قيود ويندوز)؛ والفراغ اللاحق يُقصّ فيصير صالحًا", () => {
  assert.ok(validateProjectName("abc.")); // النقطة اللاحقة تبقى بعد القصّ ⇒ خطأ
  assert.equal(validateProjectName("abc "), null); // الفراغ اللاحق يُقصّ ⇒ «abc» صالح
});

test("الأسماء المحجوزة (ويندوز) ⇒ خطأ، بلا حساسيّة لحالة الأحرف", () => {
  assert.ok(validateProjectName("con"));
  assert.ok(validateProjectName("CON"));
  assert.ok(validateProjectName("com1"));
  assert.ok(validateProjectName("LPT9"));
  assert.ok(validateProjectName("nul.txt")); // الجذع «nul» محجوز
});

test("فروع الرفض المختلفة تُرجع رسائل مختلفة (لا فرع واحد يبتلع الكلّ)", () => {
  const empty = validateProjectName("");
  const invalid = validateProjectName("a/b");
  const reserved = validateProjectName("con");
  assert.notEqual(empty, invalid);
  assert.notEqual(invalid, reserved);
  assert.notEqual(empty, reserved);
});
