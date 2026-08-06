"use strict";
/** اختباراتُ شارة الطرفيّة ورسالتها [DR-03] — ببديلِ vscode متحكَّمٍ فيه. */
const test = require("node:test");
const assert = require("node:assert");
const T = require("./terminal-notice.js");

const RUN_CMD = "mihrab.runSadFile";

/** محرّرُ ص نشطٌ هو **شرطُ** الرسالة: اللحظةُ المقصودةُ «فتحتُ طرفيّةً وأنا أعمل على ص». */
const SAD_EDITOR = { document: { languageId: "sad" } };

function fakeVscode(opts = {}) {
  const state = { shown: 0, hidden: 0, info: [], executed: [], item: null };
  const listeners = {};
  const on = (name) => (cb) => { listeners[name] = cb; return { dispose() {} }; };
  const vscode = {
    StatusBarAlignment: { Right: 2 },
    ThemeColor: class { constructor(id) { this.id = id; } },
    window: {
      activeTextEditor: "activeEditor" in opts ? opts.activeEditor : SAD_EDITOR,
      terminals: opts.terminals || [],
      createStatusBarItem: () => {
        state.item = {
          show: () => state.shown++,
          hide: () => state.hidden++,
          dispose() {},
        };
        return state.item;
      },
      onDidOpenTerminal: on("open"),
      onDidCloseTerminal: on("close"),
      showInformationMessage: async (m, ...items) => {
        state.info.push(m);
        return opts.answer === undefined ? undefined : items[opts.answer];
      },
    },
    commands: { executeCommand: async (...a) => { state.executed.push(a); } },
  };
  return { vscode, state, listeners };
}

/** ذاكرةُ حالةٍ زائفةٌ بسلوك `Memento`. */
function fakeMemento(initial = {}) {
  const store = { ...initial };
  return { get: (k) => store[k], update: async (k, v) => { store[k] = v; }, _store: store };
}

test("الشارةُ مخفيّةٌ بلا طرفيّة، وتظهر عند فتحِ واحدة", async () => {
  const { vscode, state, listeners } = fakeVscode({ terminals: [] });
  const h = T.activateTerminalNotice(vscode, fakeMemento(), RUN_CMD);
  assert.strictEqual(state.hidden, 1, "بدأت مخفيّة");
  assert.strictEqual(state.shown, 0);
  vscode.window.terminals = [{}];
  await listeners.open();
  assert.strictEqual(state.shown, 1);
  h.dispose();
});

test("إغلاقُ آخر طرفيّةٍ يُخفي الشارة", async () => {
  const { vscode, state, listeners } = fakeVscode({ terminals: [{}] });
  const h = T.activateTerminalNotice(vscode, fakeMemento(), RUN_CMD);
  assert.strictEqual(state.shown, 1);
  vscode.window.terminals = [];
  listeners.close();
  assert.ok(state.hidden >= 1);
  h.dispose();
});

test("الشارةُ تنقل إلى أمر التشغيل المُمرَّر لا إلى معرّفٍ مكتوبٍ هنا", () => {
  const { vscode, state } = fakeVscode();
  const h = T.activateTerminalNotice(vscode, fakeMemento(), RUN_CMD);
  assert.strictEqual(state.item.command, RUN_CMD);
  h.dispose();
});

test("الرسالةُ تُسمّي القيدَ منبعيًّا ولا تُحمِّل ص وزرَ غيرها", async () => {
  const { vscode, state, listeners } = fakeVscode({ terminals: [{}] });
  const h = T.activateTerminalNotice(vscode, fakeMemento(), RUN_CMD);
  await listeners.open();
  assert.strictEqual(state.info.length, 1);
  assert.ok(state.info[0].includes("xterm"), "المكتبةُ المنبعيّةُ مسمّاة");
  assert.ok(state.info[0].includes("لا في لغة ص"), "البراءةُ مُعلَنة");
  h.dispose();
});

test("لا رسالةَ بلا سياق ص — الفرصةُ واحدةٌ للأبد فلا تُحرَق لأمرِ git", async () => {
  const memento = fakeMemento();
  const a = fakeVscode({ terminals: [{}], activeEditor: { document: { languageId: "markdown" } } });
  const h = T.activateTerminalNotice(a.vscode, memento, RUN_CMD);
  await a.listeners.open();
  assert.strictEqual(a.state.info.length, 0, "لا رسالةَ خارج ص");
  assert.strictEqual(memento.get(T.STATE_KEY), undefined, "ولم تُحرَق الفرصة");
  h.dispose();

  // وحين يعود إلى ملفّ ص وتُفتَح طرفيّة ⇒ تظهر الرسالةُ في محلّها.
  const b = fakeVscode({ terminals: [{}] });
  const h2 = T.activateTerminalNotice(b.vscode, memento, RUN_CMD);
  await b.listeners.open();
  assert.strictEqual(b.state.info.length, 1);
  h2.dispose();
});

test("لا رسالةَ بلا محرّرٍ نشطٍ إطلاقًا", async () => {
  const { vscode, state, listeners } = fakeVscode({ terminals: [{}], activeEditor: undefined });
  const h = T.activateTerminalNotice(vscode, fakeMemento(), RUN_CMD);
  await listeners.open();
  assert.strictEqual(state.info.length, 0);
  h.dispose();
});

test("زرُّ «أخفِ هذا التنبيه» يفعل ما يقول: يُخفي الشارةَ ويُبقي مقبضَ العودة", async () => {
  const memento = fakeMemento();
  const { vscode, state, listeners } = fakeVscode({ terminals: [{}], answer: 1 });
  const h = T.activateTerminalNotice(vscode, memento, RUN_CMD);
  const shownBefore = state.shown;
  await listeners.open();
  assert.strictEqual(memento.get(T.BADGE_HIDDEN_KEY), true, "أُخفيت فعلًا");
  assert.ok(state.hidden >= 1, "الشارةُ اختفت");
  assert.ok(state.info.some((m) => m.includes("أظهِر تنبيه اتّجاه الطرفيّة")),
    "قيل للمستخدم كيف يعيدها — إخفاءٌ بلا مقبضٍ بابٌ مغلَق");
  assert.ok(state.shown >= shownBefore);
  h.dispose();
});

test("الإخفاءُ يصمد عبر الجلسات، وأمرُ الإعادة يبطله", async () => {
  const memento = fakeMemento({ [T.BADGE_HIDDEN_KEY]: true });
  const { vscode, state } = fakeVscode({ terminals: [{}] });
  const h = T.activateTerminalNotice(vscode, memento, RUN_CMD);
  assert.strictEqual(state.shown, 0, "لم تظهر رغم وجود طرفيّة");
  await h.showAgain();
  assert.strictEqual(memento.get(T.BADGE_HIDDEN_KEY), undefined);
  assert.strictEqual(state.shown, 1, "عادت فورًا");
  h.dispose();
});

test("طرفيّتان تُفتَحان بالتوازي ⇒ رسالةٌ واحدة", async () => {
  const { vscode, state, listeners } = fakeVscode({ terminals: [{}] });
  const h = T.activateTerminalNotice(vscode, fakeMemento(), RUN_CMD);
  await Promise.all([listeners.open(), listeners.open()]);
  assert.strictEqual(state.info.length, 1);
  h.dispose();
});

test("الشارةُ تُسمّي نفسَها وتُعلِن دورَها لقارئ الشاشة", () => {
  const { vscode, state } = fakeVscode();
  const h = T.activateTerminalNotice(vscode, fakeMemento(), RUN_CMD);
  assert.ok(state.item.name, "لها اسمٌ في «إدارة عناصر شريط الحالة» — مخرَجُ الخبير");
  assert.strictEqual(state.item.accessibilityInformation.role, "button");
  assert.ok(state.item.accessibilityInformation.label.length > 20);
  // لا خلفيّةَ تحذيرٍ دائمة: هذا **حدٌّ ثابتٌ معروف** لا عطلٌ جارٍ.
  assert.strictEqual(state.item.backgroundColor, undefined);
  h.dispose();
});

test("الرسالةُ مرّةٌ واحدةٌ لكلّ ملفٍّ شخصيّ", async () => {
  const memento = fakeMemento();
  const { vscode, state, listeners } = fakeVscode({ terminals: [{}] });
  const h = T.activateTerminalNotice(vscode, memento, RUN_CMD);
  await listeners.open();
  await listeners.open();
  assert.strictEqual(state.info.length, 1);
  assert.strictEqual(memento.get(T.STATE_KEY), true);
  h.dispose();

  // جلسةٌ جديدةٌ بالذاكرة نفسِها ⇒ لا رسالة.
  const b = fakeVscode({ terminals: [{}] });
  const h2 = T.activateTerminalNotice(b.vscode, memento, RUN_CMD);
  await b.listeners.open();
  assert.strictEqual(b.state.info.length, 0);
  h2.dispose();
});

test("زرُّ «شغّل في لوحة محراب» ينفّذ أمرَ التشغيل", async () => {
  const { vscode, state, listeners } = fakeVscode({ terminals: [{}], answer: 0 });
  const h = T.activateTerminalNotice(vscode, fakeMemento(), RUN_CMD);
  await listeners.open();
  assert.deepStrictEqual(state.executed, [[RUN_CMD]]);
  h.dispose();
});

test("بيئةٌ بلا ThemeColor لا تُفشِل التفعيل (سقوطٌ لطيف)", () => {
  const { vscode } = fakeVscode();
  delete vscode.ThemeColor;
  assert.doesNotThrow(() => T.activateTerminalNotice(vscode, fakeMemento(), RUN_CMD).dispose());
});
