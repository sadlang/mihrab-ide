"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { activateDiffNotice, isSadDiff, STATE_KEY, COPY } = require("./diff-notice.js");

/** ذاكرةُ حالةٍ مبسّطة (نظيرُ `context.globalState`). */
function memento(init = {}) {
  const store = { ...init };
  return {
    get: k => store[k],
    update: async (k, v) => { if (v === undefined) delete store[k]; else store[k] = v; },
    _store: store,
  };
}

/** بديلُ `vscode` يسجّل ما عُرِض ويردّ اختيارًا مُعدًّا. */
function fakeVscode({ tabs = [], pick } = {}) {
  const shown = [];
  const executed = [];
  return {
    shown,
    executed,
    window: {
      activeTextEditor: null,
      tabGroups: { all: [{ tabs }], onDidChangeTabs: () => ({ dispose() {} }) },
      showInformationMessage: async (msg, ...btns) => { shown.push({ msg, btns }); return pick; },
    },
    commands: { executeCommand: async (id, arg) => { executed.push([id, arg]); } },
  };
}

const sadDiff = { input: { original: { path: "/م/قديم.ص" }, modified: { path: "/م/جديد.ص" } } };
// الامتدادُ اللاتينيُّ `.sad` **مسنودٌ في الشيفرة** ولم يكن في أيّ عيّنة، فالفرعُ لم
// يُنفَّذ قطّ وتأكيدُ «ليس فرقَ ص» كان يمرّ لخلوّ النطاق [PF-02].
const sadLatinDiff = { input: { original: { path: "/م/old.sad" }, modified: { path: "/م/new.sad" } } };
const jsonDiff = { input: { original: { path: "/م/a.json" }, modified: { path: "/م/b.json" } } };
const plainTab = { input: { uri: { path: "/م/مثال.ص" } } };

test("[DR-04] فرقُ ص يُتعرَّف عليه، وغيرُه لا", () => {
  assert.ok(isSadDiff(sadDiff.input));
  assert.ok(isSadDiff(sadLatinDiff.input), "الامتدادُ اللاتينيُّ .sad مسنودٌ في الشيفرة فيُختبَر");
  assert.ok(!isSadDiff(jsonDiff.input));
  assert.ok(!isSadDiff(plainTab.input), "تبويبٌ عاديٌّ ليس فرقًا وإن كان ملفَّ ص");
  assert.ok(!isSadDiff(null));
});

test("[DR-04] لوحٌ واحدٌ من ص يكفي (مقارنةُ ملفٍّ بنسخةٍ بلا لاحقة)", () => {
  assert.ok(isSadDiff({ original: { path: "/م/قديم.ص" }, modified: { path: "/م/جديد" } }));
});

test("[DR-04] الرسالةُ تقع على أوّل فرقِ ص", async () => {
  const v = fakeVscode({ tabs: [sadDiff] });
  const n = activateDiffNotice(v, memento());
  await n.initial;
  assert.strictEqual(v.shown.length, 1);
  assert.ok(v.shown[0].msg.includes("لوحا المقارنة"));
  // الرسالةُ تسمّي الحدَّ ولا تُحمِّل ص وزرَه — كسابقةِ رسالة الطرفيّة.
  assert.ok(v.shown[0].msg.includes("المنبع"));
  assert.deepStrictEqual(v.shown[0].btns, [COPY.openNormally, COPY.dontRemind]);
});

test("[DR-04] لا رسالةَ على فرقٍ غيرِ ص — الفرصةُ واحدةٌ فلا تُحرَق في غير سياقها", async () => {
  const v = fakeVscode({ tabs: [jsonDiff] });
  const m = memento();
  const n = activateDiffNotice(v, m);
  await n.initial;
  assert.strictEqual(v.shown.length, 0);
  assert.strictEqual(m.get(STATE_KEY), undefined, "لا يجوز أن يُحرَق الوسمُ بلا رسالة");
});

test("[DR-04] مرّةً واحدةً للأبد — والوسمُ يُكتَب قبل الانتظار", async () => {
  const v = fakeVscode({ tabs: [sadDiff] });
  const m = memento();
  const a = activateDiffNotice(v, m);
  await a.initial;
  const b = activateDiffNotice(v, m);
  await b.initial;
  assert.strictEqual(v.shown.length, 1);
  assert.strictEqual(m.get(STATE_KEY), true);
});

test("[DR-04] «افتح في محرّرٍ عاديّ» يفتح الملفَّ النشط", async () => {
  const v = fakeVscode({ tabs: [sadDiff], pick: COPY.openNormally });
  v.window.activeTextEditor = { document: { uri: { path: "/م/جديد.ص" } } };
  const n = activateDiffNotice(v, memento());
  await n.initial;
  assert.deepStrictEqual(v.executed[0][0], "vscode.open");
});

test("[DR-04] الإخفاءُ قرارٌ لا بابٌ مغلَق — والإعادةُ تمسح الوسم", async () => {
  const v = fakeVscode({ tabs: [sadDiff], pick: COPY.dontRemind });
  const m = memento();
  const n = activateDiffNotice(v, m);
  await n.initial;
  assert.ok(v.shown[1].msg.includes("لوحةُ الأوامر"), "الإخفاءُ يقول كيف يُعاد");
  await n.showAgain();
  assert.strictEqual(m.get(STATE_KEY), undefined);
});
