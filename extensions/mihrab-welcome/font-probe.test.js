"use strict";
/**
 * اختباراتُ كشف أحاديّة العرض [TY-03].
 *
 * الأرقامُ هنا **مأخوذةٌ من قياسٍ حقيقيّ** لا مخترَعة: عرضُ كلّ محرفٍ أساسيٍّ في
 * ‏Kawkab Mono = ‎700/1000 em‎ (قرأناه من جدول `hmtx`)، أي ‎9.8px‎ عند ‎14px‎.
 * وقيمُ الخطّ المتناسب من `Segoe UI` بالقياس نفسِه.
 */
const test = require("node:test");
const assert = require("node:assert");
const P = require("./font-probe.js");

/** عرضٌ واحدٌ لكلّ العيّنة — ما يفعله خطٌّ أحاديُّ العرض حقًّا. */
const mono = (w = 9.8) => Object.fromEntries(P.SAMPLES.map((c) => [c, w]));

test("خطٌّ أحاديُّ العرض ⇒ لا إنذار", () => {
  const v = P.evaluateWidths(mono());
  assert.strictEqual(v.proportional, false);
  assert.strictEqual(v.spread, 0);
  assert.strictEqual(v.measured, P.SAMPLES.length);
});

test("خطٌّ متناسب ⇒ إنذارٌ مع تسميةِ الأعرض والأضيق", () => {
  // قيمٌ من خطٍّ نظاميٍّ متناسب: «ا» شرطةٌ رفيعة و«م» عريضة، و`i` أرفعُ من `M`.
  const v = P.evaluateWidths({ M: 12.0, i: 3.9, ا: 4.2, م: 11.1, ص: 10.4, ش: 13.8 });
  assert.strictEqual(v.proportional, true);
  assert.strictEqual(v.widest, "ش");
  assert.strictEqual(v.narrowest, "i");
  assert.ok(v.spread > 0.5, "التفاوتُ فادحٌ لا حَدّيّ: " + v.spread);
});

test("تفاوتٌ دون العتبة (ضجيجُ تنعيمٍ) لا يُنذِر", () => {
  // ‎1٪‎ — أقلُّ من عتبة ‎2٪‎: هذا فرقُ تقريبِ بكسلاتٍ لا فرقُ تصميم.
  const w = mono();
  w["م"] = 9.8 * 1.01;
  assert.strictEqual(P.evaluateWidths(w).proportional, false);
});

test("تفاوتٌ فوق العتبة مباشرةً يُنذِر (العتبةُ حدٌّ لا اقتراح)", () => {
  const w = mono();
  w["م"] = 9.8 * (1 + P.TOLERANCE * 2);
  assert.strictEqual(P.evaluateWidths(w).proportional, true);
});

test("قياسٌ ناقصٌ أو فاسدٌ ⇒ **لا حكم** (إنذارٌ على قياسٍ ناقصٍ إنذارٌ كاذب)", () => {
  for (const bad of [null, undefined, {}, { M: 9.8 }, { M: 0, i: 0 },
                     { M: NaN, i: Infinity }]) {
    const v = P.evaluateWidths(bad);
    assert.strictEqual(v.proportional, false, JSON.stringify(bad));
  }
});

test("العرضُ يُقاس نسبةً لا بالبكسل (فيصمد عبر أحجام الخطّ)", () => {
  // خطٌّ متناسبٌ عند ‎12px‎ وآخرُ عند ‎20px‎ بالنِّسَب نفسِها ⇒ الحكمُ واحد.
  const ratios = { M: 1.0, i: 0.33, ا: 0.35, م: 0.93, ص: 0.87, ش: 1.15 };
  const at = (size) => Object.fromEntries(
    Object.entries(ratios).map(([c, r]) => [c, r * size]));
  assert.deepStrictEqual(
    P.evaluateWidths(at(12)).spread,
    P.evaluateWidths(at(20)).spread,
    "النسبةُ لا تتغيّر بحجم الخطّ"
  );
});

// ───────────────── الإنذارُ ودورتُه ─────────────────

function fakeVscode(opts = {}) {
  const state = { warn: [], info: [], error: [], updates: [], executed: [] };
  const vscode = {
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    commands: { executeCommand: async (...a) => { state.executed.push(a); } },
    window: {
      showWarningMessage: async (m, ...items) => {
        state.warn.push(m);
        const idx = state.warn.length === 1 ? opts.answer : opts.answer2;
        return idx === undefined ? undefined : items[idx];
      },
      showInformationMessage: (m) => state.info.push(m),
      showErrorMessage: (m) => state.error.push(m),
    },
    workspace: {
      getConfiguration: () => ({
        update: async (k, v, t) => {
          if (opts.updateThrows) throw new Error("مقفول");
          state.updates.push([k, v, t]);
        },
      }),
    },
  };
  return { vscode, state };
}
const fakeMemento = (init = {}) => {
  const s = { ...init };
  return { get: (k) => s[k], update: async (k, v) => { s[k] = v; }, _s: s };
};

const PROPORTIONAL = { fontFamily: "Segoe UI", widths: { M: 12, i: 3.9, ا: 4.2, م: 11.1, ص: 10.4, ش: 13.8 } };
const MONO = { fontFamily: "Kawkab Mono", widths: mono() };
const STACK = "'Kawkab Mono', Consolas, monospace";
/** إعادةُ قياسٍ **ناجحة**: الخطُّ صار أحاديَّ العرض فعلًا. */
const REMEASURE_OK = async () => MONO;
/** إعادةُ قياسٍ تُثبِت أنّ شيئًا لم يتغيّر (وجهٌ غيرُ مثبَّت، أو نطاقٌ أضيقُ يغلب). */
const REMEASURE_SAME = async () => PROPORTIONAL;
const opts = (o) => ({ bundledStack: STACK, ...o });

test("خطٌّ أحاديٌّ ⇒ لا رسالةَ إطلاقًا", async () => {
  const { vscode, state } = fakeVscode();
  assert.strictEqual(await P.maybeWarnProportional(vscode, fakeMemento(), MONO, opts()), false);
  assert.strictEqual(state.warn.length, 0);
});

test("زرُّ الإصلاح يضبط المكدَّسَ المُمرَّر — ولا يُعلِن نجاحًا إلّا بعد إعادة قياسٍ تُثبِته", async () => {
  const { vscode, state } = fakeVscode({ answer: 0 });
  const ok = await P.maybeWarnProportional(
    vscode, fakeMemento(), PROPORTIONAL, opts({ remeasure: REMEASURE_OK }));
  assert.strictEqual(ok, true);
  assert.deepStrictEqual(state.updates, [[P.FONT_SETTING, STACK, 1]]);
  assert.deepStrictEqual(state.info, [P.COPY.fixed]);
});

test("كُتِب الإعدادُ ولم يتغيّر الخطُّ ⇒ **لا رسالةَ نجاح** بل بيانُ حالٍ ومخرَج", async () => {
  // الحالةُ الواقعيّة: الوجهُ غيرُ مثبَّتٍ على الجهاز، أو قيمةٌ بنطاقٍ أضيقَ تغلب.
  const { vscode, state } = fakeVscode({ answer: 0, answer2: 0 });
  const ok = await P.maybeWarnProportional(
    vscode, fakeMemento(), PROPORTIONAL, opts({ remeasure: REMEASURE_SAME }));
  assert.strictEqual(ok, false);
  assert.strictEqual(state.info.length, 0, "لا «تمّ» إطلاقًا");
  assert.strictEqual(state.warn[1], P.COPY.fixedButUnverified);
  assert.deepStrictEqual(state.executed, [[P.OPEN_SETTINGS_CMD, P.FONT_SETTING]]);
});

test("بلا إعادةِ قياسٍ إطلاقًا ⇒ لا يُدَّعى نجاح (صمتُ السطح ليس برهانَ أثر)", async () => {
  const { vscode, state } = fakeVscode({ answer: 0 });
  const ok = await P.maybeWarnProportional(vscode, fakeMemento(), PROPORTIONAL, opts());
  assert.strictEqual(ok, false);
  assert.strictEqual(state.info.length, 0);
  assert.strictEqual(state.warn[1], P.COPY.fixedButUnverified);
});

test("مكدَّسٌ بلا الوجه المحزوم ⇒ **لا يُعرَض زرُّ إصلاحٍ أصلًا** (إصلاحٌ خطأٌ يثبّت العطب)", async () => {
  for (const bad of [undefined, null, "", "Consolas, 'Courier New', monospace"]) {
    const { vscode, state } = fakeVscode({ answer: 0 });
    const ok = await P.maybeWarnProportional(
      vscode, fakeMemento(), PROPORTIONAL, opts({ bundledStack: bad, remeasure: REMEASURE_OK }));
    assert.strictEqual(ok, false, String(bad));
    assert.strictEqual(state.warn.length, 1, "أُنذِر");
    assert.strictEqual(state.updates.length, 0, "ولم يُكتَب شيء: " + String(bad));
  }
});

test("فشلُ الضبط يُقال كما هو — لا «تمّ» بلا أثر", async () => {
  const { vscode, state } = fakeVscode({ answer: 0, updateThrows: true });
  assert.strictEqual(
    await P.maybeWarnProportional(vscode, fakeMemento(), PROPORTIONAL, opts({ remeasure: REMEASURE_OK })),
    false);
  assert.strictEqual(state.info.length, 0, "لا رسالةَ نجاح");
  assert.strictEqual(state.error.length, 1);
});

test("يُكتَب في **أضيق نطاقٍ تغلب فيه القيمة** لا في العامّ دائمًا", async () => {
  const T = { Global: 1, Workspace: 2, WorkspaceFolder: 3 };
  const v = { ConfigurationTarget: T };
  assert.strictEqual(P.targetFor(v, undefined), T.Global);
  assert.strictEqual(P.targetFor(v, {}), T.Global);
  assert.strictEqual(P.targetFor(v, { workspaceValue: "x" }), T.Workspace);
  assert.strictEqual(P.targetFor(v, { workspaceFolderValue: "x", workspaceValue: "y" }),
    T.WorkspaceFolder, "الأضيقُ يغلب");

  const { vscode, state } = fakeVscode({ answer: 0 });
  await P.maybeWarnProportional(vscode, fakeMemento(), PROPORTIONAL,
    opts({ inspect: { workspaceValue: "Arial" }, remeasure: REMEASURE_OK }));
  assert.strictEqual(state.updates[0][2], 2, "كُتِب في نطاق المشروع لا العامّ");
});

test("«لاحقًا» تُسكِت الإنذارَ لهذه الحالة — ولا تُسكِته لحالٍ جديدة", async () => {
  const memento = fakeMemento();
  const a = fakeVscode({ answer: 1 });
  await P.maybeWarnProportional(a.vscode, memento, PROPORTIONAL, opts());
  assert.strictEqual(a.state.warn.length, 1);

  const b = fakeVscode({ answer: 1 });
  await P.maybeWarnProportional(b.vscode, memento, PROPORTIONAL, opts());
  assert.strictEqual(b.state.warn.length, 0, "سُكِت عن الحالة نفسِها");

  // خطٌّ آخرُ متناسب ⇒ حالةٌ جديدة ⇒ يُنذَر ثانيةً (لا يُخمَد الإنذارُ للأبد).
  const c = fakeVscode({ answer: 1 });
  await P.maybeWarnProportional(
    c.vscode, memento, { fontFamily: "Arial", widths: PROPORTIONAL.widths }, opts());
  assert.strictEqual(c.state.warn.length, 1);
});

test("إغلاقُ الإطار بـ× يُسكِت أيضًا (أشيعُ ردٍّ على الإطارات — وإلّا تكرارٌ بلا تعلُّم)", async () => {
  const memento = fakeMemento();
  const { vscode, state } = fakeVscode(); // answer=undefined ⇒ أُغلِقت
  assert.strictEqual(await P.maybeWarnProportional(vscode, memento, PROPORTIONAL, opts()), false);
  assert.strictEqual(state.updates.length, 0);
  assert.ok(memento.get(P.STATE_KEY), "سُجِّل التوقيعُ فلا يعود الإنذارُ في كلّ فتحة");
});

test("توقيعُ الحالة لا يتغيّر بتذبذب تنعيمٍ ضئيل (وإلّا تكرّر الإنذارُ على الحال نفسِها)", () => {
  const a = P.signatureOf("Segoe UI", { spread: 0.7182 });
  const b = P.signatureOf("Segoe UI", { spread: 0.7184 });
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, P.signatureOf("Segoe UI", { spread: 0.55 }));
});

test("رسائلُ الخطأ تعزل المقاطعَ اللاتينيّة (تصل إلى قارئ الشاشة ولوحة الإشعارات)", () => {
  const msg = P.COPY.fixFailed("EACCES: permission denied (settings.json)");
  assert.ok(msg.includes(P.iso("EACCES: permission denied (settings.json)")));
  assert.ok(msg.includes(P.iso(P.FONT_SETTING)));
});

test("قياسٌ غائبٌ لا يرمي", async () => {
  const { vscode } = fakeVscode();
  assert.strictEqual(await P.maybeWarnProportional(vscode, fakeMemento(), null, opts()), false);
});
