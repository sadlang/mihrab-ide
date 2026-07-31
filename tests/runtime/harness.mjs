// حزام CDP لاختبارات محراب الوقتيّة (L3) — مساعدات اتّصال وإدخال وقياس.
// يتّصل بنسخة Mihrab **مُطلَقة مسبقًا** بـ--remote-debugging-port (لا يُطلقها: صدفة الأتمتة
// معزولة عن سطح المكتب). دروس مُدمَجة من جلسات التحقّق: bringToFront أوّلًا، insertText لا
// مفاتيح للنصّ، Escape قبل كلّ محفّز، انتظار استقرار الودجة، إحداثيّات CSS-px.
// Node ≥ 22 (WebSocket مدمج).
//
// ⚠️ **قاعدةٌ ملزِمة في هذا الملفّ: لا شاهدة خلفيّة (`) داخل تعليقٍ داخل قالبٍ نصّيّ.**
// مِجَسّاتنا كلُّها نصوصُ JS داخل قوالب نصّيّة، والشاهدةُ في تعليقٍ عربيٍّ داخلها **تُنهي
// القالب** فيسقط الملفّ كلّه بـSyntaxError — وهو خطأٌ يشير إلى سطرٍ بعيد عن موضعه فيُضلّل.
// أوقعنا هذا الفخّ خمس مرّات في جلسةٍ واحدة (وفي chat.js مرّةً قبلها). البديل: علامة
// الاتّجاه اليسرى U+200E حول الرمز — ‎مثل هذا‎ — تُعطي التمييز البصريّ نفسه بلا خطر.
// وحارسٌ في L0 يمنع الانحدار: «لا شاهدة خلفيّة في تعليقٍ داخل قالب نصّيّ».
//
// ⚠️ **وقاعدةٌ ثانية ألزم: كلُّ هروبٍ نمطيّ داخل قالبٍ نصّيّ يُضاعَف — ‎\\p‎ لا ‎\p‎.**
// الشيفرة هنا تمرّ **بمرحلتَي تأويل** (قالبُنا، ثمّ الصفحة)، فالشرطةُ الواحدة يبتلعها
// القالب. والفرق عن الفخّ الأوّل أنّ هذا **لا يصرخ**: لا خطأ نحويّ ولا تحذير، بل تعبيرٌ
// صحيحٌ يطابق شيئًا آخر. أوقعنا مرّتين: ‎\s‎ ⇒ ‎s‎ فشُطِرت أسماءُ الأصناف على حرف «s»
// (‏25 بلاغًا كاذبًا)، و‎\p{L}‎ ⇒ ‎p{L}‎ فمات **فرعُ كشفٍ كامل** والفحص أخضر.
// حارسُ L0: «لا هروب نمطيّ بشرطةٍ واحدة داخل قالب نصّيّ».

export async function listTargets(port = 9222) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  return res.json();
}

// يختار صفحة الـworkbench (يفضّل ذات ملفّ ‎.ص‎ مفتوح).
export async function pickPage(port = 9222) {
  const targets = await listTargets(port);
  // وضع التطوير يقدّم `workbench-dev.html` بينما الحزمة المشحونة تقدّم `workbench.html`؛
  // نطابق الاثنين كي يعمل نفس الحزام على المسارين (اكتُشف حيًّا: التطوير كان لا يُطابَق أصلًا).
  const pages = targets.filter(t => t.type === "page" && /workbench(-dev)?\.html/.test(t.url));
  if (!pages.length) throw new Error("لا صفحة workbench — هل Mihrab مُطلَق بالمنفذ وبملفّ مفتوح؟");
  // **امتداد لغة ص هو `.ص` لا `.sad`** (‏contributes.languages في sad-lang). كانت العيّنة
  // تُسمّى `rtl_fixture.sad` فتُفتَح **نصًّا عاديًّا**: لا تلوين ص، ولا أيقونة ص، ولا سلوك
  // ‏wordPattern العربيّ — أي أنّ كلّ مِجَسّ خاصّ باللغة كان يقيس ملفًّا مجهول اللغة أو
  // يُبلَّغ تخطّيًا. صحّحنا اسم العيّنة، وهذا المُطابِق يقبل الاثنين لأجل عيّنات قديمة.
  // ⚠️ لا `\b` بعد «ص»: حدود الكلمة في JS مبنيّة على `[A-Za-z0-9_]`، والحرف العربيّ **ليس**
  // منها — فلا حدَّ بينه وبين المسافة التالية، و`/\.ص\b/` **لا يطابق أبدًا**. أوقعنا هذا
  // فعلًا: مع نافذتين مفتوحتين اختار الحزامُ نافذةَ الترحيب الفارغة بدل نافذة الملفّ،
  // فتخطّى أحد عشر مِجَسًّا. الحدُّ يبقى لـ`sad` اللاتينيّة وحدها.
  //
  // الترتيب: عيّنة ص أوّلًا، ثمّ **أيّ نافذة فيها ملفّ/مجلّد مفتوح** (عنوانها يحوي « - »
  // فاصلًا بين الملفّ والمساحة والمنتج)، ثمّ الأولى. البند الأوسط أضفناه بعد قياس: مع
  // نافذة ترحيب فارغة عنوانها «محراب Dev» وحده، كان `pages[0]` يقع عليها فيتخطّى الحزام
  // أحد عشر مِجَسًّا — والنافذة العاملة بجانبها.
  return pages.find(p => /\.(?:ص|sad\b)/i.test(p.title))
      || pages.find(p => / - /.test(p.title))
      || pages[0];
}

/**
 * كلّ صفحات الـworkbench المفتوحة (نافذة لكلّ صفحة) لا الأولى وحدها.
 *
 * **لماذا:** أسطحٌ كثيرة لا تُصيَّر إلّا حين تكون المحرّرَ النشط — صفحة الترحيب مثلًا
 * تُستبدَل بالملفّ فور فتحه، فتُبلَّغ مِجَسّاتها «غير مفتوحة» بينما هي مفتوحة في نافذة أخرى.
 * فبدل قبول تخطٍّ دائم، نفتح نافذةً ثانية (‏`--welcome` في launch.mjs) ونسأل الصفحتين.
 */
export async function attachAllPages(port = 9222) {
  const targets = await listTargets(port);
  const pages = targets.filter(t => t.type === "page" && /workbench(-dev)?\.html/.test(t.url));
  const out = [];
  for (const p of pages) {
    try {
      const cdp = new CDP(p.webSocketDebuggerUrl);
      await new Promise((res, rej) => { cdp.ws.onopen = res; cdp.ws.onerror = () => rej(new Error("WS فشل")); });
      cdp.ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.id && cdp._pend[m.id]) { cdp._pend[m.id](m); delete cdp._pend[m.id]; }
      };
      await cdp.cmd("Runtime.enable");
      out.push({ title: p.title, cdp });
    } catch { /* نافذة تُغلَق أثناء الفحص — نتجاوزها */ }
  }
  return out;
}

/**
 * يشغّل مِجَسّ سطحٍ على الصفحة الحاليّة، فإن لم يجد السطح جرّب بقيّة النوافذ.
 * يُعيد `{ result, windowTitle }`، و`result.present === false` فقط إن غاب عن **كلّها**.
 */
export async function onAnyWindow(cdp, probe, port = 9222) {
  const first = await probe(cdp);
  if (first && first.present) return { result: first, windowTitle: null };
  const others = await attachAllPages(port);
  try {
    for (const w of others) {
      // ‏`Page.bringToFront` لازم: النافذة الخلفيّة قد تُصيَّر بلا تخطيط فتبدو أسطحها غائبة.
      try { await w.cdp.cmd("Page.enable"); await w.cdp.cmd("Page.bringToFront"); } catch { /* */ }
      await sleep(400);
      const r = await probe(w.cdp);
      if (r && r.present) return { result: r, windowTitle: w.title };
    }
  } finally {
    for (const w of others) w.cdp.close();
    // أعِد نافذة الفحص الأصليّة إلى المقدّمة كي لا تتأثّر المِجَسّات التالية.
    await bringToFront(cdp);
  }
  return { result: first, windowTitle: null };
}

export class CDP {
  constructor(wsUrl) { this.ws = new WebSocket(wsUrl); this._id = 0; this._pend = {}; }
  static async attach(port = 9222) {
    const page = await pickPage(port);
    const cdp = new CDP(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { cdp.ws.onopen = res; cdp.ws.onerror = () => rej(new Error("WS فشل")); });
    cdp.ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && cdp._pend[m.id]) { cdp._pend[m.id](m); delete cdp._pend[m.id]; }
    };
    await cdp.cmd("Runtime.enable");
    await cdp.cmd("Page.enable");
    return cdp;
  }
  cmd(method, params = {}, timeout = 6000) {
    return new Promise((res, rej) => {
      const id = ++this._id;
      this._pend[id] = m => (m.error ? rej(new Error(m.error.message || JSON.stringify(m.error))) : res(m.result));
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this._pend[id]) { delete this._pend[id]; rej(new Error("مهلة " + method)); } }, timeout);
    });
  }
  // awaitPromise: مِجَسّاتٌ كثيرة في VS Code غير متزامنة (resolveConfiguration مثلًا)؛ بدونه
  // يعود كائن Promise لا قيمته. غير ضارّ للتعابير المتزامنة (يتجاهله CDP حينها).
  async evaluate(expression, timeout = 6000) {
    const r = await this.cmd("Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true }, timeout);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || "استثناء أثناء التقييم");
    return r.result?.value;
  }
  close() { try { this.ws.close(); } catch { /* */ } }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function bringToFront(cdp) { try { await cdp.cmd("Page.bringToFront"); } catch { /* */ } await sleep(200); }

export async function key(cdp, vk, code, mods = 0) {
  await cdp.cmd("Input.dispatchKeyEvent", { type: "rawKeyDown", windowsVirtualKeyCode: vk, code, modifiers: mods });
  await cdp.cmd("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: vk, code, modifiers: mods });
}
export const KEY = { ESC: [27, "Escape"], END: [35, "End"], SPACE: [32, "Space"], F: [70, "KeyF"] };
export const MOD = { ALT: 1, CTRL: 2, SHIFT: 8 };

export async function escape(cdp) { await key(cdp, ...KEY.ESC); await sleep(120); }
/**
 * إدخالُ نصٍّ **بإقرارِ وصوله** لا بإطلاقه ونسيانه.
 *
 * كان هذا سطرًا واحدًا: `Input.insertText` ثمّ مهلةٌ ثابتة. وكان مصدرَ الشذوذة التي
 * لم نفسّرها تشغيلتين: ملفٌّ نظيف يردّ **‎4 فشل · 4 تخطٍّ** بلا سبب. وأمسكناها أخيرًا
 * بأثرٍ تركته: صندوقُ استعلام الامتدادات احتوى «‏ك@builtinتابت» — **نصَّين متشابكين**.
 * أي أنّ الاستعلام حُقن في حقلٍ ما يزال يحمل بقيّةَ استعلامٍ سابق ومؤشّرُه في وسطها.
 * فالحقلُ لم يكن فارغًا، و«‎@builtin» دخل عند موضع المؤشّر لا في أوّله.
 *
 * والعلاجُ ليس مهلةً أطول — المهلةُ الثابتة تُخفي السباق ولا تُزيله، وتشغيلةٌ من أربعٍ
 * ستبقى حمراء بلا سبب، وطقمٌ كهذا يُعلِّم قارئَه تجاهُلَ الأحمر. العلاجُ **إقرارٌ**:
 * نُفرغ الحقلَ أوّلًا (تحديدُ الكلّ ثمّ الحقن يستبدل)، ثمّ نقرأ ما فيه حتّى يطابق
 * المطلوب أو تنفد المحاولات.
 *
 * ‏**والإقرارُ أفضلُ جهد لا شرط.** بعضُ أهدافنا لا قيمةَ لها تُقرأ أصلًا: محرّرُ Monaco
 * يستعمل `native-edit-context` فلا `value` على العنصر المركَّز عليه. هناك نُقرّ بأنّ
 * القياس **غيرُ متاح** ونمضي — لا نزعم إقرارًا لم يقع، ولا نُفشِل مِجَسًّا لعجزٍ عن قراءة.
 * يُعيد: `true` مُقَرًّا، `null` غيرَ قابلٍ للقراءة، `false` أُدخِل ولم يطابق.
 *
 * **والموضعان غيرُ المقروءين مضمونان بأثرهما لا بقراءتهما**، وهو أقوى: الحقنُ في المحرّر
 * (`confirmDialog`، `suggestGap`) يُقاس بما أحدثه — حوارٌ ظهر، وودجةُ اقتراحاتٍ ظهرت —
 * فإن لم يصل النصُّ لم يظهر شيءٌ ويُبلَّغ صراحةً. **ولا `Ctrl+A` هناك بحال**: التفريغُ
 * في محرّرِ المستخدم محوٌ لملفّه، وهو خطرٌ رصدناه حيًّا مرّةً (‏`package.json` موسَّخًا
 * بعد تشغيلة). فالخروجُ المبكر عند `null` قبل أيّ تفريغٍ **شرطُ سلامةٍ لا تفصيلَ تنفيذ**.
 */
export async function insertText(cdp, text, opts = {}) {
  const { selector = null, tries = 6 } = opts;
  // ‏**حقولُ Monaco لا `value` لها.** حقلُ بحث الامتدادات محرّرُ Monaco مُصغَّر، فقراءةُ
  // العنصر المركَّز عليه تعود `null` — وهو **بعينه** الحقل الذي تشابك فيه النصّان.
  // فالإقرارُ فيه يقرأ **النصَّ المُصيَّر** لا خاصّيّةً غيرَ موجودة. و`​` (المسافة
  // الصفريّة) تُحشر في `.view-line` فتُنزَع قبل المقارنة، وإلّا لم يطابق شيءٌ أبدًا.
  const read = () => cdp.evaluate(selector ? `(() => {
    const e = document.querySelector(${JSON.stringify(selector)});
    return e ? (e.textContent || "").replace(/\\u200b/g, "").trim() : null;
  })()` : `(() => {
    const a = document.activeElement;
    if (!a) return null;
    if (typeof a.value === "string") return a.value;
    if (a.isContentEditable) return a.textContent || "";
    return null;
  })()`);
  const before = await read();
  // الحقلُ غيرُ مقروء (‏native-edit-context مثلًا) ⇒ حقنٌ مباشر بلا ادّعاء إقرار.
  if (before === null) { await cdp.cmd("Input.insertText", { text }); return null; }
  // ⚠️ **والتفريغُ الأعمى كان يُغيّر السطحَ المقيس نفسه.** أوّلُ صيغةٍ لهذا الإقرار كانت
  // تُفرِّغ الحقلَ دائمًا ثمّ تحقن. أمسكها شاهدٌ إيجابيّ: لوحةُ الأوامر تُفتَح وفيها
  // «‏>» — **بادئةُ الوضع** لا بقيّةُ استعلام. فمحاها التفريغُ فصار «‏git» بحثًا عن
  // **ملفّات** لا عن أوامر، والتشغيلةُ تبقى خضراء وهي تقيس سطحًا آخر. أي أنّ إصلاحَ
  // السباق كان سيُدخِل عطبًا أخبثَ منه: خضرةٌ صادقةُ الشكل على غير موضوعها.
  // فالمطلوبُ ليس حقلًا فارغًا بل **حقلًا معلومَ المحتوى**: نُبقي ما كان ونُلحق نصَّنا
  // في آخره (‏`End` قبل الحقن)، والمرجعُ `before + text`. والتفريغُ ملاذٌ أخيرًا فقط،
  // وحتّى حينها نُعيد كتابة `before` معه فلا تضيع بادئةُ الوضع.
  // ‏`replace` للحقل الذي **يُقصَد استبدالُ محتواه** (بحثُ الامتدادات: نصُّه السابق
  // استعلامٌ لا بادئةُ وضع). لا يُستعمل إلّا حيث ثبت أنّ الحقل حقلُ بحثٍ لا محرّرُ نصّ.
  const want = opts.replace ? text : before + text;
  for (let i = 0; i < tries; i++) {
    if (i === 0 && !opts.replace) {
      await key(cdp, 35, "End", 0); await sleep(120);
      await cdp.cmd("Input.insertText", { text });
    } else {
      await key(cdp, 65, "KeyA", MOD.CTRL); await sleep(120);
      await cdp.cmd("Input.insertText", { text: want });
    }
    for (let j = 0; j < 6; j++) {
      await sleep(200);
      if ((await read()) === want) return true;
    }
  }
  return false;
}

// نقرة يسار عند إحداثيّة CSS-px (تُسجَّل بعد bringToFront).
export async function click(cdp, x, y) {
  await cdp.cmd("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp.cmd("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(150);
}

/**
 * يُنشِّط تبويبًا يطابق نصُّه `pattern` بالنقر عليه — **حتميّ، مستقلّ عن الحالة المحفوظة.**
 *
 * جرّبنا ترتيب الوسائط أوّلًا فلم يكفِ: محراب يستعيد المحرّر النشط من حالة مساحة العمل،
 * فيبقى ملفٌّ لاتينيّ نشطًا مهما مرّرنا العيّنة أخيرًا (قِسنا عنوان النافذة:
 * «harness.mjs - runtime») فتُبلَّغ مِجَسّات bidi و[AR-04] «لا سطر عربيّ» زورًا.
 * وجرّبنا نافذةً ثانية للترحيب فكانت أسوأ: نافذتان تتنازعان المقدّمة، والخلفيّة تُقاس
 * بلا تخطيط. النقر على التبويب داخل **نافذة واحدة** يحسم الأمرين.
 *
 * يُعيد `true` إن نُشِّط (أو كان نشطًا)، و`false` إن لا تبويب مطابق.
 */
export async function activateTab(cdp, pattern) {
  await bringToFront(cdp);
  const box = await cdp.evaluate(`(() => {
    const re = new RegExp(${JSON.stringify(pattern)});
    const tabs = [...document.querySelectorAll('.tabs-container > .tab')];
    const hit = tabs.find(t => re.test((t.textContent || '').trim()));
    if (!hit) return null;
    if (hit.classList.contains('active')) return { active: true };
    const r = hit.getBoundingClientRect();
    return { active: false, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  })()`);
  if (!box) return false;
  if (box.active) return true;
  await click(cdp, box.x, box.y);
  await sleep(800);
  return true;
}

/** تبويب عيّنة ص (‏`.ص` — لا `\b` بعده، انظر pickPage). */
export const activateSadTab = cdp => activateTab(cdp, "\.\u0635");
/** تبويب الترحيب («مرحبًا» بأيّ صيغة همزة/تنوين، أو Welcome في وضع التطوير غير المخبوز). */
export const activateWelcomeTab = cdp => activateTab(cdp, "مرح|Welcome|Get Started");

// هندسة تخطيط المحرّر (بلا إدخال مُصطنَع) — مصدر معظم تأكيدات RTL.
export async function editorGeometry(cdp) {
  // **أحضِر النافذة للمقدّمة قبل القياس.** مع أكثر من نافذة، النافذة الخلفيّة قد تكون بلا
  // تخطيط: قِسنا `.monaco-editor` بعرض ‎0‎ ومزرابًا ‎[281,281]‎ — أرقامٌ لا معنى لها تُنتِج
  // فشلًا كاذبًا. بقيّة المِجَسّات تفعلها أصلًا؛ هذا كان الاستثناء.
  await bringToFront(cdp);
  return cdp.evaluate(`(() => {
    const wb = document.querySelector('.monaco-workbench');
    // **نختار الأكبر مساحةً لا الأوّل في DOM.** مع أكثر من تبويب تتعايش عدّة نسخ محرّر في
    // المجموعة، والمخفيّة منها بمقاس صفر. أخذُ الأوّل كان يُنتِج قياساتٍ متناقضة (محرّر
    // بعرض ‎0‎ ومزراب ‎[281,281]‎ وأرقام عند ‎801‎) فيفشل ثلاثة تأكيدات لسببٍ واحد.
    // العنصر المرئيّ هو الأكبر مساحةً قطعًا؛ وإن كان واحدًا فالنتيجة نفسها.
    const q = sel => {
      let best = null, area = -1;
      for (const e of document.querySelectorAll(sel)) {
        const r = e.getBoundingClientRect();
        const a = r.width * r.height;
        if (a > area) { area = a; best = r; }
      }
      if (!best) return null;
      return { l: Math.round(best.left), r: Math.round(best.right), w: Math.round(best.width),
               t: Math.round(best.top), b: Math.round(best.bottom) };
    };
    return {
      dir: wb ? wb.getAttribute('dir') : null,
      // هل نحن في تشغيلة ترحيب؟ يُستعمَل لتمييز «لا محرّر» المشروع عن «لا محرّر» الانحدار.
      welcomePresent: !!document.querySelector('.gettingStartedContainer'),
      editor: q('.monaco-editor'),
      minimap: q('.monaco-editor .minimap'),
      content: q('.monaco-editor .view-lines'),
      // **إطار المحتوى المرئيّ** لا طبقةَ المحتوى القابلة للتمرير. عرضُ ‎.view-lines‎ هو
      // عرضُ أطول سطر، فيصير ‎left‎ سالبًا كلّما فاض السطر عن النافذة — وهو **سلوك RTL
      // صحيح** (المحتوى مرسًى يمينًا فيمتدّ يسارًا خارج الإطار). قياس الاحتواء عليها كان
      // يمرّ صدفةً ما دام لا سطر يفيض، ويسقط زورًا بمجرّد تضييق المحرّر (فتحُ مجلّد كفى).
      contentView: q('.monaco-editor .monaco-scrollable-element.editor-scrollable'),
      gutter: q('.monaco-editor .margin'),
      lineNumbers: q('.monaco-editor .line-numbers'),
      scrollbarV: q('.monaco-editor .monaco-scrollable-element > .scrollbar.vertical'),
      overviewRuler: q('.monaco-editor .decorationsOverviewRuler'),
      activityBar: q('.monaco-workbench .activitybar'),
      firstLineDir: (() => { const l = document.querySelector('.monaco-editor .view-line'); return l ? getComputedStyle(l).direction : null; })(),
      // خلفيّة **المحرّر المرئيّ** (الأكبر مساحةً) لا أوّل عقدة: النسخة المخفيّة تعطي لونًا
      // آخر فيبدو أنّ سمةً غير سمة محراب مطبَّقة.
      editorBg: (() => {
        let best = null, area = -1;
        for (const e of document.querySelectorAll('.monaco-editor')) {
          const r = e.getBoundingClientRect(), a = r.width * r.height;
          if (a > area) { area = a; best = e; }
        }
        return best ? getComputedStyle(best).backgroundColor : null;
      })(),
    };
  })()`);
}

// يفتح الاقتراحات ويقيس الفجوة (يسار الـcaret المرساة − يمين الودجة).
// **القياس الحاسم (درس مثبَت): طابِق الودجة بالـcaret المُرسي بالتجاور** لا cs[0] (قد يكون
// مؤشّرًا شبحيًّا/ثانويًّا ⇒ فشل زائف): الودجة تفتح أسفل مرساتها فـ`caret.bottom ≈ widget.top`
// (أو أعلى: `caret.top ≈ widget.bottom`). النقر على سطر كود واضح (لا شريط علويّ).
export async function suggestGap(cdp) {
  await bringToFront(cdp);
  await escape(cdp);
  // أغلق أيّ ودجة اقتراحات عالقة قبل التحفيز (وإلّا نقيس ودجةً بائتة على موضع خاطئ).
  for (let i = 0; i < 6; i++) {
    const n = await cdp.evaluate(`document.querySelectorAll('.suggest-widget.visible').length`);
    if (!n) break;
    await escape(cdp);
  }
  // ⚠️ **الإزاحةُ الثابتة ‎+130‎ كانت تُخطئ الملفّ كلَّه.** كانت النقرة تُحسَب من أعلى
  // ‏`.monaco-editor` زائدًا ‎130‎ بكسل — أي السطر التاسع تقريبًا. على عيّنةٍ أقصر من ذلك
  // تقع النقرةُ تحت آخر سطر: لا caret ولا كلماتٍ تُطابق البادئة، فأبلغ المِجَسّ «لم تظهر
  // الودجة» وتُخطّى — وهو **التخطّي الأخير الباقي** في التشغيلة المشحونة. وقد نقض القياسُ
  // العلّةَ التي علّلناه بها (‏«لا إكمالات؟»): `focusEditor` + `Ctrl+Space` وحدهما يفتحان
  // الودجة على السطر الأوّل. والبادئةُ تبقى محاولةً أولى لأنّها تعطي قائمةً أضيق وأثبت.
  // **وأيُّ محرّرٍ نقيس؟** بلا تنشيطٍ صريح نقع على ما تركته المِجَسّاتُ قبلنا: على ملفّ
  // مستخدمٍ نظيف يكون تبويبُ الترحيب هو النشط (لا `.view-lines` ⇒ تخطٍّ)، وبعد تشغيلةٍ
  // سابقة يكون `README.md` أو محرّرُ الإعدادات (فقِسنا فجوة ‎-41px‎ على محرّرٍ آخر
  // وأُبلِغت «انحدارًا» — إنذارٌ كاذبٌ سببُه هويّةُ المقيس لا هندستُه). ننشّط عيّنة ص.
  await activateSadTab(cdp);
  await sleep(400);
  if (!(await focusEditor(cdp))) return { visible: false };
  await sleep(150);
  await insertText(cdp, " التم");              // بادئة تُطابق كلمات الملفّ
  await sleep(400);
  await key(cdp, ...KEY.SPACE, MOD.CTRL);       // Ctrl+Space
  await sleep(1200);                           // انتظر استقرار الودجة (أوّل إطار انتقاليّ خاطئ)
  // ‏`insertText` لا يبلغ `native-edit-context` في كلّ الحالات؛ فإن لم تظهر الودجة
  // بالبادئة نُعيد المحاولة **بلا كتابة** — الصيغةُ التي قِسناها تفتحها بلا استثناء.
  if (!(await cdp.evaluate(`document.querySelectorAll('.suggest-widget.visible').length`))) {
    await escape(cdp);
    await focusEditor(cdp);
    await key(cdp, ...KEY.SPACE, MOD.CTRL);
    await sleep(1200);
  }
  // **قياس حاسم: زاوِج كلّ ودجة مرئيّة بالـcaret المُجاور لها عموديًّا** (يتجاهل ودجةً بائتة
  // بعيدة عن المؤشّر، ومؤشّرًا شبحيًّا). الفجوة = يسار الـcaret المُجاور − يمين الودجة المُجاورة.
  const result = await cdp.evaluate(`(() => {
    const ws = [...document.querySelectorAll('.suggest-widget')].filter(x => x.classList.contains('visible') && x.getBoundingClientRect().width > 10).map(x => x.getBoundingClientRect());
    const cs = [...document.querySelectorAll('.monaco-editor .cursors-layer .cursor')].map(c => { const b = c.getBoundingClientRect(); return { x: Math.round(b.left), t: Math.round(b.top), b: Math.round(b.bottom), h: Math.round(b.height) }; }).filter(c => c.h > 0);
    if (!ws.length) return { visible: false };
    for (const w of ws) for (const c of cs) {
      const below = Math.abs(c.b - Math.round(w.top)) <= 12;
      const above = Math.abs(c.t - Math.round(w.bottom)) <= 12;
      if (below || above) return { visible: true, widgetRight: Math.round(w.right), widgetLeft: Math.round(w.left), caretLeft: c.x, mode: below ? 'below' : 'above', gap: c.x - Math.round(w.right), cursorCount: cs.length };
    }
    return { visible: true, caretLeft: null, mode: 'none', cursorCount: cs.length, widgetCount: ws.length };
  })()`);
  // نظافة: أغلق الودجة وتراجع عن النصّ المُدخَل كي لا يلوّث المخزن التأكيداتِ/التشغيلاتِ التالية.
  await escape(cdp);
  for (let i = 0; i < 4; i++) await key(cdp, 90, "KeyZ", MOD.CTRL);
  return result;
}

// يقرأ ترويسة صفحة الترحيب (Get Started): شعار القوس (mihrab-welcome-mark) + العنوان الفرعيّ.
// لا يفتح الصفحة (تحتاج أمرًا/بدء تشغيل)؛ يعيد present=false إن لم تكن مفتوحة ⇒ تخطٍّ best-effort.
export async function welcomeHeader(cdp) {
  await bringToFront(cdp);
  return cdp.evaluate(`(() => {
    const mark = document.querySelector('.gettingStartedCategoriesContainer .header .mihrab-welcome-mark');
    // العنوان الفرعيّ من نفس ترويسة الشعار (لا .gettingStartedContainer الأعمّ) فيبقى المِجَسّان متّسقين:
    // لو تغيّر الصنف الخارجيّ في المنبع لا يصير subtitle=null فشلًا كاذبًا بينما الشعار حاضر.
    const sub = document.querySelector('.gettingStartedCategoriesContainer .header .subtitle');
    if (!mark && !sub) return { present: false };
    const mr = mark ? mark.getBoundingClientRect() : null;
    const bg = mark ? getComputedStyle(mark).backgroundImage : '';
    return {
      present: true,
      markVisible: !!mr && mr.width > 4 && mr.height > 4 && /data:image\\/svg/.test(bg),
      markWidth: mr ? Math.round(mr.width) : 0,
      subtitle: sub ? sub.textContent.trim() : null,
    };
  })()`);
}

// يفحص أيقونة ملفّ ص في المستكشف: يبحث عن صفٍّ ينتهي اسمه بـ.ص ويقرأ خلفيّة أيقونته (::before).
// لا يفتح مجلّدًا (يحتاج مساحة عمل)؛ present=false إن لا ملفّ .ص ظاهر ⇒ تخطٍّ best-effort.
export async function explorerSadIcon(cdp) {
  await bringToFront(cdp);
  return cdp.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.monaco-icon-label')];
    const sad = rows.find(r => ((r.querySelector('.label-name') || {}).textContent || '').trim().endsWith('.ص'));
    if (!sad) return { present: false, rows: rows.length };
    const el = sad.classList.contains('file-icon') ? sad : (sad.closest('.file-icon') || sad);
    const bg = getComputedStyle(el, '::before').backgroundImage || getComputedStyle(el).backgroundImage || '';
    return { present: true, bg, isSad: /sad(-light)?\\.svg|mihrab-sad/i.test(bg) };
  })()`);
}

// رأس التطبيق: أيقونة شريط العنوان (.window-appicon) تحمل شعار القوس (code-icon.svg في بناء محراب).
// حاضرة دائمًا مع شريط عنوان مخصّص (custom titlebar). صحّة **المحتوى** (قوس محراب لا VSCodium)
// مضمونة بـL2 (توقيع لونيّ في out/media)؛ هنا نؤكّد الحضور والارتباط والرسم في التطبيق الحيّ.
export async function titlebarAppicon(cdp) {
  await bringToFront(cdp);
  return cdp.evaluate(`(() => {
    const e = document.querySelector('.window-appicon');
    if (!e) return { present: false };
    const bg = getComputedStyle(e).backgroundImage || '';
    const r = e.getBoundingClientRect();
    const at = bg.indexOf('/media/'); return { present: true, wired: bg.includes('/media/code-icon.svg'), visible: r.width > 4 && r.height > 4, bg: at >= 0 ? bg.slice(at) : bg.slice(0, 90) };
  })()`);
}

// خلفية المحرّر الفارغ: عنصر .letterpress يحمل قوس محراب (letterpress-*.svg). مرئيّ فقط حين لا محرّر
// مفتوح (شاشة ترحيب المجموعة الفارغة)؛ best-effort. المحتوى مضمون بـL2؛ هنا الحضور والارتباط.
export async function editorLetterpress(cdp) {
  await bringToFront(cdp);
  return cdp.evaluate(`(() => {
    const e = document.querySelector('.letterpress');
    if (!e) return { present: false };
    const bg = getComputedStyle(e).backgroundImage || '';
    const r = e.getBoundingClientRect();
    const at = bg.indexOf('/media/');
    return { present: true, wired: bg.includes('/media/letterpress-'), visible: r.width > 4 && r.height > 4, bg: at >= 0 ? bg.slice(at) : bg.slice(0, 90) };
  })()`);
}

// تحقّق bidi المحرّر (م3، البند #24 اتّجاه السطر + محاذاة النصّ) — يحتاج rtl_fixture.ص مفتوحًا.
// برهان حتميّ بلا إدخال مُصطنَع: في سطر عربيّ قصير، مدى النصّ يلتصق **بيمين** السطر (RTL)
// لا بيساره. يتجنّب السطر الطويل (يتجاوز النافذة فيمتدّ يسارًا).
export async function editorBidi(cdp) {
  await bringToFront(cdp);
  return cdp.evaluate(`(() => {
    const lines = [...document.querySelectorAll('.monaco-editor .view-line')];
    const arb = lines.find(l => /اطبع/.test(l.textContent) && !/الطويل/.test(l.textContent));
    if (!arb) return { present: false };
    const lr = arb.getBoundingClientRect();
    const dir = getComputedStyle(arb).direction;
    const spans = [...arb.querySelectorAll('span')].filter(s => s.textContent.trim());
    if (!spans.length) return { present: true, dir, hasText: false };
    let l = Infinity, r = -Infinity;
    for (const s of spans) { const b = s.getBoundingClientRect(); l = Math.min(l, b.left); r = Math.max(r, b.right); }
    return { present: true, dir, hasText: true,
      lineLeft: Math.round(lr.left), lineRight: Math.round(lr.right), lineMid: Math.round(lr.left + lr.width / 2),
      textLeft: Math.round(l), textRight: Math.round(r) };
  })()`);
}

// البند #18 (رقعة mihrab-rtl-tabdrop): يتحقّق من حارس اتّجاه إفلات التبويبات حيًّا.
// يقيس (أ) اتّجاه `.tabs-container` المحسوب — عليه تتوقّف الرقعة كلّها؛ (ب) الافتراض الأساس:
// تبويب DOM الأوّل يُصيَّر فيزيائيًّا أقصى اليمين (انعكاس محور الـflex تحت dir=rtl). إن انهار
// الافتراض (المنبع ضبط direction على الحاوية مثلًا) فالرقعة صامتة الخطأ — هذا الحارس يرصده.
export async function tabsDropRtl(cdp) {
  await bringToFront(cdp);
  return cdp.evaluate(`(() => {
    const conts = [...document.querySelectorAll('.tabs-container')]
      .filter(c => c.querySelectorAll('.tab').length >= 2);
    if (!conts.length) return { present: false };
    const c = conts[0];
    const dir = getComputedStyle(c).direction;
    const tabs = [...c.querySelectorAll(':scope > .tab')];
    const first = tabs[0].getBoundingClientRect();
    const last = tabs[tabs.length - 1].getBoundingClientRect();
    return { present: true, dir, tabCount: tabs.length,
      firstLeft: Math.round(first.left), firstRight: Math.round(first.right),
      lastLeft: Math.round(last.left), lastRight: Math.round(last.right),
      // في RTL: تبويب DOM الأوّل فيزيائيًّا يمينَ الأخير (firstLeft > lastLeft).
      firstIsPhysicallyRight: first.left > last.left };
  })()`);
}

/**
 * يركّز المحرّرَ المرئيّ بنقرةٍ **محسوبةٍ وقتَ النداء** على أكبر `.view-lines`.
 *
 * لا إحداثيّةَ ثابتة: الدرسُ المدفوع في `findWidget` أدناه — نقطةٌ ثابتة عند ‎(700,60)‎
 * وقعت داخل شريط التبويبات فأغلقت تبويبَ العيّنة وقلبت خمسةَ تأكيداتٍ إلى تخطٍّ.
 * يُعيد `false` إن لم يوجد محرّرٌ مرئيّ، فيُحتسب السطحُ «لم ينفتح» لا نجاحًا صامتًا.
 */
export async function focusEditor(cdp) {
  await bringToFront(cdp);
  const pt = await cdp.evaluate(`(() => { let b = null, a = -1;
    for (const e of document.querySelectorAll('.monaco-editor .view-lines')) {
      const r = e.getBoundingClientRect(), s = r.width * r.height;
      if (s > a) { a = s; b = r; } }
    return b && b.height >= 8
      ? { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + Math.min(12, b.height / 2)) }
      : null; })()`);
  if (!pt) return false;
  await click(cdp, pt.x, pt.y);
  return true;
}

/**
 * يفتح **محرّرَ المقارنة** بنقر أوّل مَورِدٍ متغيّر في جزء التحكّم بالمصادر.
 *
 * لا اختصارَ يفتح مقارنةً بلا تسميةِ أمرٍ مترجَمة (وأسماءُ الأوامر تختلف بين التطوير
 * والحزمة، فمِجَسٌّ عليها يقيس لغةً لا سطحًا). النقرُ على صفٍّ في الجزء لا يعتمد على
 * لغةٍ إطلاقًا. **مستوى الصفّ مقيسٌ لا مُخمَّن**: ‎1‎ للمستودع، ‎2‎ لصندوق الرسالة وزرّ
 * الإيداع وترويسة «التغييرات»، و‎3‎ للموارد نفسها — أوّلُ ثلاثة صفوفٍ ليست ملفّات، وقد
 * ردّ اختيارُ «الصفّ الأوّل» صندوقَ الرسالة فلم تُفتَح مقارنة. ويشترط مستودعًا ذا تغييرات.
 * يُعيد `false` إن لم يوجد مورِد أو لم يظهر `.monaco-diff-editor` — «لم ينفتح» لا نجاحًا صامتًا.
 */
export async function openDiffFromScm(cdp) {
  await bringToFront(cdp);
  await escape(cdp);
  // **الوترُ مبدِّلٌ لا فاتح — فنُطفئه ونستعمل أيقونةَ شريط الأنشطة.** أوّلُ صيغةٍ أرسلت
  // ‏`Ctrl+Shift+G G` وانتظرت ‎1800ms‎، فتناوبت النتيجةُ بين نجاحٍ وفشل: الوترُ يفتح
  // الجزءَ حين يكون مغلقًا **ويُبدّله حين يكون مفتوحًا**، ومِجَسُّ «التحكّم بالمصادر»
  // قبلنا في القائمة يتركه مفتوحًا — فكانت التشغيلةُ الكاملة تفشل حيث ينجح المِجَسّ
  // منفردًا (قِسنا الاثنين). والأيقونةُ فِعلٌ لا تبديل، وصنفُها `codicon-source-control-
  // view-icon` **لا يتغيّر بتغيّر اللغة** بخلاف `aria-label` المترجَمة.
  // ويبقى التصييرُ على دفعات، فنستطلع الصفوفَ بدل انتظارِ مهلةٍ ثابتة.
  // والأيقونةُ نفسها مبدِّلة: نقرةٌ على الجزء **النشط** تُخفي الشريط الجانبيّ. فلا نقرةَ
  // مسبقة عمياء (جرّبناها فأخفت الشريط وأعادت صفرَ موارد)، بل نقرةٌ **داخل حلقة تحقّق**:
  // كلُّ دورةٍ تسأل أوّلًا، ولا تنقر إلّا إن لم تجد — فتصحّح الحلقةُ إخفاءها بنفسها.
  // ‏(`pt` مصفوفةُ مرشّحين؛ والمصفوفةُ الفارغة **صادقة** في JS — فالشرطُ على طولها.)
  let pt = null;
  for (let i = 0; i < 6 && !(pt && pt.length); i++) {
    if (i) {
      // **الأيقونةُ تُظهِر الجزءَ والوترُ يُركِّزه — والتركيزُ هو ما يُصيّر قائمةَ الموارد.**
      // قِسنا الفرق: بالأيقونة وحدها بقي `.scm-view` واحدًا (رسمُ الإيداعات) و`.resource`
      // صفرًا مهما طال الانتظار؛ ومع الوتر ظهر `.scm-view` ثانٍ بستّةَ عشرَ مورِدًا.
      await cdp.evaluate(`(document.querySelector('.part.activitybar .codicon-source-control-view-icon')
        ?.closest('.action-item')?.querySelector('a, .action-label')?.click(), 1)`);
      await sleep(700);
      await key(cdp, 71, "KeyG", MOD.CTRL | MOD.SHIFT); await sleep(300);
      await key(cdp, 71, "KeyG", 0); await sleep(1400);
    }
    pt = await cdp.evaluate(`(() => {
    // **الصفُّ مورِدٌ لا أيَّ صفٍّ في المستوى الثالث.** جرّبنا «المستوى 3» فأصاب أحيانًا
    // عنصرَ **سِجِلّ** (رسم الإيداعات يسكن المستوى نفسه) والنقرُ عليه لا يفتح مقارنة،
    // فبُلِّغ «لم ينفتح» بلا سببٍ ظاهر. صفُّ المورِد وحده يحوي div.resource.
    //
    // ⚠️ **ومركزُ المستطيل ليس بالضرورة فوق الصفّ.** أوّلُ صفٍّ في القائمة يقع غالبًا
    // **تحت ترويسة اللوحة اللاصقة**، فأعادت ‎elementFromPoint‎ عند مركزه
    // ‏‎pane-header expanded‎ — أي أنّ النقرة كانت تصيب الترويسة وتُبلَّغ «لم تُفتَح
    // مقارنة». نختبر الإصابة قبل النقر ونأخذ أوّلَ صفٍّ **يملك** نقطته فعلًا.
    // ‏(ولا شَولةً مائلةً هنا: الكتلةُ داخل قالبٍ نصّيّ — الدرسُ نفسه المدوَّن في الماسح.)
    const pts = [];
    for (const r of document.querySelectorAll('.scm-view .monaco-list-row')) {
      if (!r.querySelector('.resource .monaco-icon-label')) continue;
      const b = r.getBoundingClientRect();
      if (b.height < 8) continue;
      const x = Math.round(b.left + b.width / 2), y = Math.round(b.top + b.height / 2);
      const at = document.elementFromPoint(x, y);
      if (at && r.contains(at)) pts.push({ x, y });
      if (pts.length >= 8) break;
    }
    return pts; })()`);
  }
  if (!pt || !pt.length) return false;
  // **ليس كلُّ مورِدٍ يفتح مقارنة.** الملفُّ **غير المتتبَّع** يُفتَح محرّرًا عاديًّا لا
  // مقارنة (لا نسخةَ أصليّة تُقارَن بها) — وقائمةُ التغييرات في مستودعٍ عمليّ تبدأ
  // بملفّاتٍ غير متتبَّعة كثيرًا. قِسنا ذلك: النقرةُ نجحت وفُتح تبويبٌ… عاديّ. فنجرّب
  // المرشّحين تِباعًا حتى يظهر `.monaco-diff-editor` فعلًا، ولا نعدّ الفتحَ إلّا به.
  for (const p of pt.slice(0, 8)) {
    await click(cdp, p.x, p.y);
    await sleep(2200);
    if (await cdp.evaluate(`document.querySelectorAll('.monaco-diff-editor').length`)) return true;
  }
  return false;
}

/**
 * يفتح **الحوارَ المشروط** (احفظ/لا تحفظ/إلغاء) على ملفٍّ بلا عنوان مُلوَّث.
 *
 * الملفُّ بلا عنوان مقصود: لا يمسّ ملفًّا حقيقيًّا فلا يخاطر بعملٍ للمستخدم، ويُلوَّث
 * بمحرفٍ واحد. و`Ctrl+W` عليه يستدعي الحوار.
 *
 * ⚠️ **لا يظهر إلّا و`window.dialogStyle` = `custom`.** افتراضُ المنبع `native`، فيعرض
 * ويندوز حوارَه — لا شيءَ منه في DOM، ويحجب النافذة حتى يُجاب: قِسنا ذلك حيًّا (صفرُ
 * ‏`.monaco-dialog-box` والتبويبُ لا يُغلَق، ثمّ تعطّل أوّلُ `Input.dispatchKeyEvent` تالٍ).
 * لذلك رقّعنا الافتراض في `build/patch_dialog_style.py`. وإن غاب الحوار هنا فالسطحُ
 * «لم ينفتح» — وهو **إنذارُ انحدارٍ للرُقعة نفسها** لا مِجَسٌّ هشّ.
 *
 * يُغلق الحوارَ بـ`Escape` (إلغاءُ الإغلاق) قبل أن يعود: مودالٌ متروكٌ مفتوحًا يُعطّل
 * كلَّ مِجَسٍّ بعده.
 */
export async function confirmDialog(cdp) {
  await bringToFront(cdp);
  await escape(cdp);
  await key(cdp, 78, "KeyN", MOD.CTRL); await sleep(1200);
  await insertText(cdp, "س"); await sleep(600);
  await key(cdp, 87, "KeyW", MOD.CTRL); await sleep(2500);
  return !!(await cdp.evaluate(`document.querySelectorAll('.monaco-dialog-box').length`));
}

// يفتح البحث (Ctrl+F) ويقيس موضعه.
/**
 * ⚠️ **الإحداثيّة العمياء كانت تُغلق تبويبًا.** كانت النقرةُ ثابتةً عند ‎(700, 60)‎ بنيّة
 * «انقر داخل المحرّر لتركيزه». قِسنا ما يقع فعلًا عند تلك النقطة: شريطُ التبويبات يمتدّ
 * من ‎35‎ إلى ‎70‎ عموديًّا، فالنقطة **داخله**، و`elementFromPoint` أعادت
 * `monaco-icon-label-container` — أي تسميةَ تبويب. النتيجة أنّ تبويبَ العيّنة كان يختفي
 * أثناء التشغيلة، فتنقلب خمسةُ تأكيداتٍ إلى «تخطٍّ» في التشغيلة التالية بلا سببٍ ظاهر.
 * بحثنا عن الجاني في أوتار المفاتيح أوّلًا (قسّمنا الاثني عشر سطحًا واحدًا واحدًا فنجت
 * التبويبات كلُّها) — الجاني كان النقرةَ نفسها.
 *
 * الآن تُحسَب من `.view-lines` وقتَ النداء؛ والثابتان بقيا احتياطًا إن لم يوجد محرّر.
 */
export async function findWidget(cdp, clickX = 700, clickY = 60) {
  await bringToFront(cdp);
  await escape(cdp);
  const pt = await cdp.evaluate(`(() => {
    let best = null, area = -1;
    for (const e of document.querySelectorAll(".monaco-editor .view-lines")) {
      const b = e.getBoundingClientRect(), a = b.width * b.height;
      if (a > area) { area = a; best = b; }
    }
    if (!best || best.height < 8) return null;
    return { x: Math.round(best.left + best.width / 2),
             y: Math.round(best.top + Math.min(12, best.height / 2)) };
  })()`);
  await click(cdp, pt ? pt.x : clickX, pt ? pt.y : clickY);
  await key(cdp, ...KEY.F, MOD.CTRL);
  await sleep(600);
  return cdp.evaluate(`(() => {
    const f = document.querySelector('.monaco-editor .find-widget');
    if (!f) return { visible: false };
    const r = f.getBoundingClientRect();
    // المحرّر **المرئيّ** (الأكبر مساحةً): مع أكثر من تبويب توجد نسخٌ مخفيّة بمقاس صفر،
    // فتصير عتبة «قرب الحافّة اليسرى» صفرًا ويفشل التأكيد مهما كان الموضع صحيحًا.
    let ed = null, area = -1;
    for (const e of document.querySelectorAll('.monaco-editor')) {
      const b = e.getBoundingClientRect(), a = b.width * b.height;
      if (a > area) { area = a; ed = b; }
    }
    if (!ed) return { visible: false };
    return { visible: true, left: Math.round(r.left), right: Math.round(r.right), editorWidth: Math.round(ed.width), editorLeft: Math.round(ed.left) };
  })()`);
}

// ───────────────────── مِجَسّات التصميم العربيّ (AR-03 وما بعده) ─────────────────────

// [AR-03] يقرأ مكدّسَي خطّ القشرة **كما حلّهما المتصفّح فعليًّا** + لغة المستند + منصّة القشرة.
// يثبت أنّ قاعدة `:lang(ar)` تغلب قاعدة المنبع حيًّا (لا استنتاجًا من التخصيص على الورق).
export async function chromeTypography(cdp) {
  await bringToFront(cdp);
  return cdp.evaluate(`(() => {
    const wb = document.querySelector('.monaco-workbench');
    if (!wb) return { present: false };
    const cs = getComputedStyle(wb);
    const plat = ['windows','mac','linux'].find(p => wb.classList.contains(p)) || null;
    return {
      present: true,
      lang: document.documentElement.lang || null,
      // مخبوز = بناء مشحون (رسائله عربيّة) ⇒ يُتوقَّع lang=ar. غير مخبوز = وضع تطوير
      // (نصّه إنجليزيّ) ⇒ lang=en صحيحٌ لا انحدار؛ الآليّة يبرهنها langRuleProof.
      baked: Array.isArray(globalThis._VSCODE_NLS_MESSAGES) && globalThis._VSCODE_NLS_MESSAGES.length > 0,
      dir: wb.getAttribute('dir'),
      platform: plat,
      // قيم المتغيّرات المخصّصة بعد التتالي (المصدر الحقيقيّ لِما يُرسَم به).
      monacoFont: cs.getPropertyValue('--monaco-font').trim(),
      monospaceFont: cs.getPropertyValue('--monaco-monospace-font').trim(),
      // الوجه المستعمَل فعلًا للقشرة (قد يدوسه إعداد المستخدم عبر --vscode-workbench-font-family).
      usedFontFamily: cs.fontFamily,
      fontSizePx: parseFloat(cs.fontSize),
      lineHeightPx: cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight),
    };
  })()`);
}

// [بند سالي] قياس اقتطاع التشكيل: هل صندوق حبر العربيّة المُشكَّلة يتجاوز صندوق السطر؟
// يقيس بـCanvas TextMetrics (actualBoundingBoxAscent/Descent) بخطّ القشرة وقياسها الفعليَّين —
// رقمٌ حاسم بدل حدس. يقارن حبر العربيّة المُشكَّلة بحبر اللاتينيّة وبارتفاع السطر المتاح.
export async function arabicInkMetrics(cdp) {
  await bringToFront(cdp);
  return cdp.evaluate(`(() => {
    const wb = document.querySelector('.monaco-workbench');
    if (!wb) return { present: false };
    const cs = getComputedStyle(wb);
    const size = parseFloat(cs.fontSize);
    const lh = cs.lineHeight === 'normal' ? size * 1.4 : parseFloat(cs.lineHeight);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = size + 'px ' + cs.fontFamily;
    const ink = s => {
      const m = ctx.measureText(s);
      return {
        ascent: +(m.actualBoundingBoxAscent || 0).toFixed(2),
        descent: +(m.actualBoundingBoxDescent || 0).toFixed(2),
        height: +((m.actualBoundingBoxAscent || 0) + (m.actualBoundingBoxDescent || 0)).toFixed(2),
      };
    };
    // عيّنات من نصوص المشروع الحقيقيّة: مُشكَّلة بكثافة (شدّة+كسرة+فتحة) مقابل مجرّدة مقابل لاتينيّة.
    const tashkeel = ink('نِبراس مُرقَّعٌ الافتتاحيّة لِلمِحرابِ');
    const plain    = ink('نبراس مرقع الافتتاحية للمحراب');
    const latin    = ink('Editing evolved Mihrab gjpqy');
    return {
      present: true, fontSizePx: size, lineHeightPx: +lh.toFixed(2),
      tashkeel, plain, latin,
      // النسبة الحاسمة: حبر المُشكَّلة ÷ ارتفاع السطر. >1 ⇒ اقتطاع مؤكَّد حيث overflow:hidden.
      tashkeelRatio: +(tashkeel.height / lh).toFixed(3),
      latinRatio: +(latin.height / lh).toFixed(3),
      // كم يزيد التشكيل على المجرّدة (تكلفة التشكيل وحدها).
      tashkeelExtraPx: +(tashkeel.height - plain.height).toFixed(2),
    };
  })()`);
}

// [القاعدة 19] الزخرفة النجميّة: حاضرة، خافتة، ومحجوبة سفليًّا فلا تنزّ فوق البطاقات.
export async function welcomePattern(cdp) {
  await bringToFront(cdp);
  return cdp.evaluate(`(() => {
    const p = document.querySelector('.gettingStartedCategoriesContainer .header .mihrab-welcome-pattern');
    const h = document.querySelector('.gettingStartedCategoriesContainer .header');
    if (!p || !h) return { present: false };
    const cs = getComputedStyle(p);
    const pr = p.getBoundingClientRect(), hr = h.getBoundingClientRect();
    return {
      present: true,
      opacity: parseFloat(cs.opacity),
      // مضاعفة الشرطة مقصودة: هذا نصّ داخل قالب JS، فالشرطة المفردة تنهار قبل التقييم
      // وينكسر التعبير النمطيّ (SyntaxError يظهر في CDP كـ«Uncaught» بلا تفصيل).
      // أُمسِك حيًّا لا بالمراجعة الساكنة. ولا تضع علامة قالب داخل هذا القالب.
      hasTile: /data:image\\/svg/.test(cs.backgroundImage),
      hasMask: !!(cs.maskImage && cs.maskImage !== 'none') || !!(cs.webkitMaskImage && cs.webkitMaskImage !== 'none'),
      // الأثر التخطيطيّ يجب أن يكون صفرًا (ارتفاع + هامش سالب مساوٍ) — نقيسه بموضع الشقيق التالي.
      patternBottom: Math.round(pr.bottom), headerBottom: Math.round(hr.bottom),
      bleedPx: Math.round(pr.bottom - hr.bottom),
    };
  })()`);
}

/**
 * [القاعدة 32] محاذاة الجولة — يفتح جولة محراب ويقيس **موضع** النصّ لا ترتيبه.
 *
 * لماذا مِجَسّ منفصل عن مسح bidi: المسحُ يسأل عن ترتيب المحارف داخل الفقرة، وهذا السطح
 * كان يمرّ فيه نظيفًا وهو **ملصَقٌ بالحافّة اليسرى** — `direction: rtl` صحيحة و
 * `text-align: left` من المنبع تغلبها. فالسؤال هنا سؤالُ محاذاة: هل تشترك أوراقُ النصّ
 * في حافّةٍ **يمنى** واحدة (فقرةٌ تبدأ من اليمين)، أم في حافّةٍ يسرى (العطب)؟
 *
 * نقيس بالأثر لا بقراءة `text-align`: نجمع صناديقَ أوراق النصّ متعدّدةِ الأطوال داخل
 * قائمة الخطوات، فإن تطابقت أطرافُها اليمنى وتباينت اليسرى ⇒ محاذاةُ يمين. والعكس عطب.
 * سطرٌ واحد لا يُثبت شيئًا (طرفاه يتطابقان مع نفسه) فنشترط تباينًا حقيقيًّا في الأطوال.
 *
 * يُعيد الصفحة إلى قائمة الفئات بعده (‏`prev-button`) كي لا يترك السطحَ مبدَّلًا لمن بعده.
 */
export async function walkthroughAlign(cdp) {
  await bringToFront(cdp);
  const opened = await cdp.evaluate(`(() => {
    if (document.querySelector('.gettingStartedSlideDetails .step-list-container')) return 1;
    for (const b of document.querySelectorAll('.gettingStartedContainer button.getting-started-category')) {
      if ((b.textContent || '').includes('محراب')) { b.click(); return 1; }
    }
    return 0;
  })()`);
  if (!opened) return { present: false };
  await sleep(1200);
  const r = await cdp.evaluate(`(() => {
    const list = document.querySelector('.gettingStartedSlideDetails .step-list-container');
    if (!list) return { present: false };
    const leaves = [];
    for (const n of list.querySelectorAll('*')) {
      if (![...n.childNodes].some(x => x.nodeType === 3 && x.textContent.trim())) continue;
      const b = n.getBoundingClientRect();
      if (b.width < 8 || b.height < 4) continue;
      if (getComputedStyle(n).textAlign === 'center') continue; // أزرارٌ مُتمركِزة عمدًا
      leaves.push({ l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width) });
    }
    if (leaves.length < 2) return { present: true, leaves: leaves.length };
    const uniq = a => [...new Set(a)];
    return {
      present: true, leaves: leaves.length,
      rights: uniq(leaves.map(x => x.r)).length,
      lefts: uniq(leaves.map(x => x.l)).length,
      widths: uniq(leaves.map(x => x.w)).length,
    };
  })()`);
  await cdp.evaluate(`(() => { const b = document.querySelector('.gettingStartedContainer .prev-button'); if (b) b.click(); return 1; })()`);
  await sleep(600);
  return r;
}

/**
 * [AR-03] إثبات **آليّة** قاعدة `:lang(ar)` مستقلًّا عن حلّ NLS.
 *
 * لماذا لزم مِجَسّ خاصّ: في وضع التطوير لا تُخبَز الرسائل ⇒ `<html lang>` يبقى `en` بحقّ
 * (نصّ التطوير إنجليزيّ فعلًا)، فلا تُطابَق القاعدة ولا يمكن قياسها مباشرةً — بينما في
 * البناء المشحون تُطابَق. فبدل تخطّي الفحص، **نقود** السمة حيًّا: نقرأ المكدّس عند `en`،
 * نضبط `lang=ar`، نقرأ ثانيةً، ثمّ **نُعيد القيمة الأصليّة** (لا نترك المستند مُلوَّثًا).
 * تبدُّل المكدّس بين القراءتين = برهانٌ حيّ أنّ القاعدة تغلب قاعدة المنبع فعلًا.
 */
export async function langRuleProof(cdp) {
  await bringToFront(cdp);
  return cdp.evaluate(`(() => {
    const wb = document.querySelector('.monaco-workbench');
    const html = document.documentElement;
    if (!wb) return { present: false };
    const read = () => {
      const cs = getComputedStyle(wb);
      return { font: cs.getPropertyValue('--monaco-font').trim(),
               mono: cs.getPropertyValue('--monaco-monospace-font').trim() };
    };
    const original = html.getAttribute('lang');
    try {
      // **البرهان ثنائيّ الاتّجاه — لا يفترض حالةً ابتدائيّة.** كان يضبط lang=ar ويتوقّع
      // تبدّلًا؛ وهذا يصحّ في وضع التطوير (يبدأ من en) ويسقط زورًا على البناء المشحون
      // حيث lang=ar **أصلًا** فلا يتبدّل شيء. فنقيس الطرفين: نضبط لغةً غير عربيّة
      // (‎'en'‎) ثمّ العربيّة، ونطالب باختلافهما. صالح مهما كانت نقطة البدء.
      html.setAttribute('lang', 'en');
      // قراءة متزامنة بعد التبديل: تغيير السمة يُبطِل مطابقة المحدِّدات فورًا،
      // وgetComputedStyle يفرض إعادة حساب الأنماط — لا حاجة لانتظار إطار.
      const before = read();
      html.setAttribute('lang', 'ar');
      const after = read();
      return { present: true, originalLang: original, before, after,
               changed: before.font !== after.font || before.mono !== after.mono };
    } finally {
      if (original === null) html.removeAttribute('lang'); else html.setAttribute('lang', original);
    }
  })()`);
}

/**
 * [القاعدة 21] اتّجاه التسميات المحايدة: التسميات المستهدَفة يجب أن تكون `plaintext` حيًّا.
 * تُفحَص المحدِّدات التي **رُصد عطبها بالقياس** لا كلّ ما في الورقة؛ الغائب منها يُبلَّغ
 * تخطّيًا (‏فتات المسار مثلًا تظهر فقط مع ملفّ مفتوح) لا فشلًا.
 */
export async function bidiLabels(cdp) {
  await bringToFront(cdp);
  return cdp.evaluate(`(() => {
    const SELECTORS = [
      '.monaco-icon-label .label-name',
      '.monaco-breadcrumbs .monaco-icon-label',
      '.gettingStartedContainer .button-link > span',
      '.gettingStartedContainer .path.detail',
    ];
    const found = [], missing = [], wrong = [];
    for (const sel of SELECTORS) {
      const e = document.querySelector(sel);
      if (!e) { missing.push(sel); continue; }
      const b = getComputedStyle(e).unicodeBidi;
      (b === 'plaintext' ? found : wrong).push(sel + '=' + b);
    }
    return { checked: SELECTORS.length, found, missing, wrong };
  })()`);
}

/**
 * [القاعدة 22] الرموز الاتّجاهيّة: تُقاس **بالأثر لا بالإعلان**.
 *   • مثلّث الشجرة: نقارن مربّع الرمز عند عمقين ⇒ يجب أن **يتدرّج** مع العمق (كان مثبَّتًا).
 *   • أدلّة التشجير: يجب أن تُرسى على جهة الصفوف نفسها لا الحافّة المقابلة.
 *   • الأسهم المخصَّصة: `transform` معكوس على `::before`.
 * الغائب عن الشاشة (لوحة بحث مغلقة مثلًا) يُبلَّغ **تخطّيًا** لا فشلًا.
 */
export async function directionalGlyphs(cdp) {
  await bringToFront(cdp);
  return cdp.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.monaco-list-row .monaco-tl-twistie')];
    // مربّع الرمز المرئيّ بعد scaleX(-1): انعكاس صندوق المحتوى حول مركز الصندوق.
    const glyph = el => {
      const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
      const cx = (b.left + b.right) / 2;
      const cl = b.left + parseFloat(cs.paddingLeft), cr = b.right - parseFloat(cs.paddingRight);
      const flipped = cs.transform.startsWith('matrix(-1');
      return flipped ? [2 * cx - cr, 2 * cx - cl] : [cl, cr];
    };
    // عمقان مختلفان: نميّزهما بحشوة العمق التي يضبطها abstractTree.
    const byPad = new Map();
    for (const t of rows) {
      const p = parseFloat(getComputedStyle(t).paddingLeft);
      if (!byPad.has(p)) byPad.set(p, glyph(t));
    }
    const pads = [...byPad.keys()].sort((a, b) => a - b);
    let step = null;
    if (pads.length >= 2) {
      const [a, b] = [byPad.get(pads[0]), byPad.get(pads[1])];
      step = Math.round(a[0] - b[0]);   // في RTL يتدرّج الرمز **يسارًا** ⇒ فارق موجب
    }
    const row = document.querySelector('.monaco-list-row .monaco-tl-row');
    const ind = document.querySelector('.monaco-list-row .monaco-tl-indent');
    let indSide = null;
    if (row && ind) {
      const rb = row.getBoundingClientRect(), ib = ind.getBoundingClientRect();
      indSide = Math.round(rb.right - ib.right);   // قربُ الأدلّة من حافّة الصفّ اليمنى
    }
    // **العنصر المخفيّ لا يُقاس.** المتصفّح لا يُنشئ صندوق ‎::before‎ لعنصر ‎display:none‎،
    // فيعود ‎transform‎ بقيمته الابتدائيّة ‎none‎ مهما كانت القاعدة المطابِقة — وهو ما أوقعنا
    // في تقرير فشلٍ كاذب لـ‎suggest-more-info‎ (زرّ «مزيد» مخفيّ حتى يُركَّز الصفّ: 12 عقدة
    // بعرض ‎0px‎). فنعدّ المخفيّ **غائبًا** لا مكسورًا.
    const arrows = {};
    for (const c of ['breadcrumb-separator', 'view-pane-container-collapsed',
                     'search-hide-replace', 'suggest-more-info']) {
      const e = [...document.querySelectorAll('.codicon-' + c)]
        .find(x => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
      arrows[c] = e ? getComputedStyle(e, '::before').transform : null;
    }
    // زرّ «رجوع» في الجولة: صنفه عامّ فنستهدفه بحاويته (كما في الورقة).
    {
      const e = [...document.querySelectorAll('.prev-button > .codicon-chevron-left')]
        .find(x => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0; });
      arrows['walkthrough-back'] = e ? getComputedStyle(e, '::before').transform : null;
    }
    return { depths: pads.length, step, indSide, arrows };
  })()`);
}

/**
 * **مسح bidi شامل** — يُبدِّل التخمين بالقياس. يمشي على كلّ **ورقة نصّ ظاهرة** في القشرة
 * ويُبلِّغ عن كلّ ما يجتمع فيه شرطان: (١) نصُّه **معرَّض** — إمّا مختلط قويّ الاتّجاهين
 * (عربيّ+لاتينيّ) وإمّا ذو محايدٍ طرفيّ (نقطة/قوس/شَرطة) بجوار محرف قويّ؛ (٢) و`unicode-bidi`
 * المحسوب عليه `normal` ⇒ يرث اتّجاه فقرة الحاوية RTL فتقفز محايداته.
 *
 * تُستثنى **مناطق LTR المقصودة**: المحرّر والطرفيّة والفروق — هذه نحميها LTR عمدًا
 * (القاعدتان 1 و2) فاتّجاه فقرتها صحيح أصلًا ولا يعنيها هذا المسح.
 *
 * المخرَج مُجمَّع بتوقيع صنفٍ لا بعنصر: نريد **محدِّدًا نكتبه في الورقة**، لا قائمة عقد.
 */
export async function bidiAudit(cdp) {
  await bringToFront(cdp);
  return cdp.evaluate(`(() => {
    // نستثني مناطق LTR المقصودة، و‎.monaco-aria-container‎: حاوية إعلانات قارئ الشاشة —
    // لها صندوق غير صفريّ لكنّها غير مرئيّة، ونصُّها يُنطَق لا يُرسَم فلا معنى لاتّجاهه.
    const SKIP = '.monaco-editor, .terminal, .xterm, .monaco-diff-editor,' +
                 ' .part.editor > .content .editor-instance, .monaco-aria-container';
    const STRONG_RTL = /[\\u0590-\\u08FF\\uFB1D-\\uFDFF\\uFE70-\\uFEFF]/;
    const STRONG_LTR = /[A-Za-z\\u00C0-\\u024F]/;
    const NEUT_EDGE  = /^[\\s\\p{P}\\p{S}]+|[\\s\\p{P}\\p{S}]+$/u;
    const sig = e => {
      const parts = [];
      for (let n = e, i = 0; n && n !== document.body && i < 3; n = n.parentElement, i++) {
        const cls = (n.className || '').toString().trim().split(/\\s+/).filter(Boolean).slice(0, 2);
        parts.unshift(n.tagName.toLowerCase() + (cls.length ? '.' + cls.join('.') : ''));
      }
      return parts.join(' > ');
    };
    const groups = new Map();
    let scanned = 0, exposed = 0;
    for (const e of document.querySelectorAll('.monaco-workbench *')) {
      if (e.closest(SKIP)) continue;
      // ورقة نصّ: لا ابن عنصريّ يحمل نصًّا (النصّ كلّه لهذا العنصر مباشرةً أو لأبناء فارغين)
      if ([...e.children].some(c => (c.textContent || '').trim())) continue;
      const t = (e.textContent || '').trim();
      if (!t) continue;
      const r = e.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      scanned++;
      const mixed = STRONG_RTL.test(t) && STRONG_LTR.test(t);
      const edge  = NEUT_EDGE.test(t) && (STRONG_RTL.test(t) || STRONG_LTR.test(t));
      if (!mixed && !edge) continue;
      exposed++;
      // **نصعد السلالة، لا نقرأ الورقة وحدها.** الخاصّيّة ‎unicode-bidi‎ ليست وراثيّة، لكنّ أثرها
      // كذلك: ‎plaintext‎ على ‎.label-name‎ يُنشئ فقرةً يشتقّ اتّجاهها من محتواها، فتنتفع
      // بها أبناؤها (‏‎.monaco-highlighted-label‎ مثلًا) وإن بقيت قيمتُهم ‎normal‎.
      // قراءة الورقة وحدها كانت تُبلِّغ ستّ عقدٍ سليمةٍ كأنّها مكسورة — أوقفناها بالقياس.
      let handled = false;
      for (let n = e; n && n !== document.body; n = n.parentElement) {
        if (getComputedStyle(n).unicodeBidi === 'plaintext') { handled = true; break; }
      }
      if (handled) continue;
      const k = sig(e);
      if (!groups.has(k)) groups.set(k, { sig: k, n: 0, mixed: 0, sample: t.slice(0, 48) });
      const g = groups.get(k); g.n++; if (mixed) g.mixed++;
    }
    return {
      scanned, exposed,
      atRisk: [...groups.values()].sort((a, b) => b.n - a.n).slice(0, 25),
    };
  })()`);
}

/**
 * ‏[AR-04] إبراز يونيكود: يجب ألّا يُبرَز حرفٌ واحد في ملفّ ص — **ولو كانت المساحة غير موثوقة**.
 *
 * الخلفيّة المقيسة: `editor.unicodeHighlight.nonBasicASCII` افتراضُه `inUntrustedWorkspace`
 * ويُبرِز كلّ محرف خارج ‎U+0020–U+007E‎، و‎62%‎ من محارف ملفّ ص الواقعيّ كذلك. الإعفاء
 * مقصورٌ على `[sad]` في mihrab-shell، فهذا المِجَسّ يقيس **الأثر** لا الإعلان: عدد عُقَد
 * ‏`.unicode-highlight` في المحرّر النشط (الصنف من unicodeHighlighter.ts:561).
 *
 * يعيد كذلك حالة الثقة، فقياسٌ في مساحةٍ موثوقة لا يُثبت شيئًا (الإبراز مُعطَّل فيها أصلًا).
 */
export async function unicodeHighlight(cdp) {
  await bringToFront(cdp);
  return cdp.evaluate(`(() => {
    // المحرّر **المرئيّ** (الأكبر مساحةً): مع أكثر من تبويب توجد نسخٌ مخفيّة بلا أسطر،
    // فيُبلَّغ «لا سطر عربيّ» بينما العيّنة معروضة (مقيس).
    let ed = null, area = -1;
    for (const e of document.querySelectorAll('.monaco-editor')) {
      const r = e.getBoundingClientRect(), a = r.width * r.height;
      if (a > area) { area = a; ed = e; }
    }
    if (!ed) return { present: false };
    const marks = ed.querySelectorAll('.unicode-highlight').length;
    const arabic = [...ed.querySelectorAll('.view-line')]
      .some(l => /[\u0600-\u06FF]/.test(l.textContent || ''));
    // شارة الثقة في شريط الحالة تظهر فقط في المساحات المقيَّدة (workspace trust).
    const restricted = !!document.querySelector('.statusbar-item[id*="trust" i], .codicon-workspace-untrusted');
    return { present: true, marks, arabic, restricted };
  })()`);
}


/**
 * مِجَسّ القاعدة 24 — **ماسحٌ عامّ** لا قائمةُ أهدافٍ ثابتة.
 *
 * القاعدة 21 وُلدت من فحص أسطحٍ سمّيناها بأنفسنا، فبقيت أسطحُ اللوحات (بحث · امتدادات ·
 * مشاكل · Git · عناوين الأجزاء) بلا قياسٍ أصلًا حتى كتبنا هذا. الفكرة: بدل أن نسأل «هل
 * العنصر س سليم؟» نسأل الصفحةَ نفسها «أيّ ورقةِ نصٍّ فيك معرّضة؟» — فيكشف ما لم نفكّر فيه.
 *
 * ورقةٌ **معرّضة** إن كانت ظاهرة، واتّجاهها RTL، ولا ترث `plaintext` من أيّ سلف، و:
 *   • يبدأ نصّها أو ينتهي بمحايد (‏`@`، `.`، `[`، `<`…) — يقفز إلى الطرف المقابل، أو
 *   • تخلط العربيّة باللاتينيّة — يُعاد ترتيب مقاطعها، أو
 *   • تُقَصّ بـ`ellipsis` ونصّها لاتينيّ — تُقَصّ **بدايتُها** لا نهايتُها.
 *
 * استثناءان مقيسان لا مفترَضان:
 *   • `.monaco-aria-container` — نصُّ قارئ الشاشة، لا يُصيَّر بصريًّا (كان يُبلَّغ زورًا).
 *   • `.editor-instance .view-lines` — **شيفرةُ المستخدم لا واجهة**؛ اتّجاه أسطرها شأنُ
 *     `patch_editor_rtl.py`، وكلُّ رمزٍ فيها محايدٌ بطبعه فيغرق الماسح بضجيجٍ لا معنى له.
 */
export async function bidiPanels(cdp) {
  return cdp.evaluate(`(() => {
    // ‏‎\p{M}‎ (العلامات الجامعة) **ضمن الحروف لا المحايدات.** بدونها تُحسَب كلُّ كلمةٍ
    // عربيّة تنتهي بتشكيل «منتهيةً بمحايد» ⇒ بلاغٌ كاذب. ولم يظهر إلّا على البناء
    // **المشحون** (واجهته مخبوزة عربيّةً): «الأكثر استخداماً» تنتهي بتنوين فتحٍ وهو ‎Mn‎
    // لا ‎L‎. أي أنّ المِجَسّ كان سيُنذر عن الواجهة العربيّة السليمة نفسها — ولم يكن ليظهر
    // في التطوير أبدًا لأنّ رسائله غير مخبوزة. قِسناه على الحزمة لا على شجرة المصدر.
    const NEUTRAL = /^[^\\p{L}\\p{N}\\p{M}]|[^\\p{L}\\p{N}\\p{M}]$/u;
    const AR = /[\\u0600-\\u06ff]/, LAT = /[A-Za-z]/;
    // **الوراثة ليست «هل لسلفٍ ما plaintext؟» بل «هل تصل الورقةَ فعلًا؟»** أثبتنا حيًّا
    // أنّ ‎plaintext‎ على حاويةٍ **لا تفعل شيئًا** إن كان النصّ داخل ابنٍ يعزل بنفسه
    // (‎.monaco-highlighted-label‎ مثلًا): يأخذ الابنُ اتّجاهه من ‎direction‎ الموروث لا من
    // أوّل حرفٍ قويّ. قِسناه على شرط ‎when‎: بلا قاعدة ‎RTL‎، على الحاوية ‎RTL‎، على الذرّيّة
    // ‎LTR‎. فالماسح الأوّل كان **يُبرّئ العنصر زورًا** لمجرّد وجود القاعدة على سلفه.
    // فنمشي صعودًا ونتوقّف عند أوّل عازلٍ يعترض الطريق.
    const ISOLATORS = ["isolate", "isolate-override", "bidi-override"];
    const handled = el => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const b = getComputedStyle(n).unicodeBidi;
        if (b === "plaintext") return true;
        if (n !== el && ISOLATORS.includes(b)) return false;   // عازلٌ يقطع أثر السلف
      }
      return false;
    };
    const path = el => { const p = [];
      for (let n = el; n && n !== document.body && p.length < 5; n = n.parentElement) {
        const c = typeof n.className === "string"
          ? n.className.trim().split(/\\s+/).slice(0, 2).join(".") : "";
        p.push(n.tagName.toLowerCase() + (c ? "." + c : "")); }
      return p.reverse().join(" > "); };
    // **النطاق: الشريط الجانبيّ واللوحة السفلى وحدهما.** مسحنا أوّلًا ‎.monaco-workbench *‎
    // كلَّها فعاد ‎25‎ ورقة، جُلُّها شريطُ العنوان ولوحةُ الدردشة المدمجة — أسطحٌ ليست موضوع
    // هذا المِجَسّ، فأغرقت الإشارةَ بالضجيج وكانت ستُبقي الفحص أحمر أبدًا بلا عطبٍ حقيقيّ.
    // ‏‎auxiliarybar‎ مستثنًى صراحةً: لوحةُ الدردشة المدمجة سطحُ منتجٍ منفصل لم نعرّبه بعد،
    // فإدخالُه هنا يخلط عملًا لم نبدأه بانحدارٍ في عملٍ أنجزناه.
    // ‏‎.quick-input-widget‎ ضمن النطاق: مسحُ الأسطح الطافية (بعد أن ظنّنا الباب مغلقًا)
    // ردّ عطبًا حقيقيًّا فيها — شارةُ العدد «‎83 Results‎» تُعرَض «‎Results 83‎». فما دام سطحٌ
    // ردّ عطبًا مرّة، يدخل الحارس الدائم لا المسح العابر.
    // ‏‎.settings-editor‎ و‎.keybindings-editor‎ سطحان في **جزء المحرّر** لا في اللوحات،
    // فلم يبلغهما النطاق الأوّل. مسحٌ منفصل ردّ منهما عطبين مُثبَتين (وصفُ الإعداد يُقَصّ
    // من بدايته، وشرطُ ‎when‎ يُعاد ترتيبه) ⇒ يدخلان الحارس الدائم.
    // ‏‎.part.statusbar‎ و‎.monaco-hover‎ و‎.notifications-*‎ و‎.context-view‎: أسطحٌ ظاهرةٌ
    // دائمًا أو عابرة لم يبلغها النطاق قطّ. شريطُ الحالة أوضحها إهمالًا — لا يحتاج فتحًا
    // أصلًا وفيه أكثرُ نصوص القشرة اختلاطًا («‎UTF-8‎» · «مسافات: 4» · «س 1، ع 1»).
    // قِسناه فوجدناه نظيفًا، فدخل حارسًا لا إصلاحًا: يمنع انحدارًا لم يقع بعد.
    // ‏‎.context-view‎ يفتحها مِجَسُّ «قائمة السياق» بـ‎Shift+F10‎ فتُمسَح فعلًا.
    //
    // ⚠️ **كنّا نصف ‎.notifications-*‎ و‎.monaco-breadcrumbs‎ بـ«الانتهازيّة» — وكان الوصفُ
    // خطأً.** الأولى: زعمنا «لا محفّز حتميًّا بلا أثرٍ جانبيّ» ولم نبحث عن محفّزٍ **غير
    // لفظيّ** — وزرُّ الجرس ‎#status.notifications‎ موجودٌ ومعرّفُه ثابت. والثانية: قِسناها
    // فارغةً (‏0 بند، عرض 0) واستنتجنا أنّها لا تُملأ، والسببُ أنّ **صفحة الترحيب كانت
    // المحرّرَ النشط** و‎BreadcrumbsControl‎ يُخفي الشريط بلا URI. الاثنتان مفتوحتان
    // ومقيستان الآن، وأعادتا القاعدتين 26 و27. و‎scanned‎ يمنع أن يُحسَب غيابُ سطحٍ
    // «مسحًا نظيفًا» — وهو الحارسُ الذي بقي صحيحًا في الحالتين.
    const SCOPE = [...document.querySelectorAll(".part.sidebar, .part.panel, .quick-input-widget,"
      + " .settings-editor, .keybindings-editor, .part.statusbar, .monaco-hover,"
      + " .notifications-toasts, .notifications-center, .context-view,"
      // الحوارُ المشروط: سطحٌ **يحجب التطبيق كلَّه** حتى يُجاب، ولم يبلغه مِجَسٌّ قطّ.
      // نصُّه كثيفُ الخلط: رسالةٌ وتفصيلٌ وأزرارٌ تسمياتُها محايدةُ الأطراف.
      + " .monaco-dialog-box,"
      // **شريط العنوان: جزءٌ كاملٌ ظلّ خارج النطاق حتى الآن.** حاضرٌ في كلّ لقطة،
      // ومع ذلك لم يمسحه مِجَسّ. أوّلُ مسحةٍ له أعادت ورقةً معرَّضة (القاعدة 29).
      + " .part.titlebar, .part.activitybar, .part.editor .title.tabs,"
      // **سطحُ النثر الكتليّ في جزء المحرّر.** بُعدُ المحاذاة عُمِّم على اللوحات كلِّها،
      // وفيها جُلُّ الأوراق منكمشةٌ على نصّها فلا فسحةَ تُقاس. أمّا صفحةُ الترحيب
      // والجولة فأوراقُها فقراتٌ عريضة — هناك للمحاذاة مقامٌ كبير، وهناك وقع البلاغُ
      // الذي أفلت من ثلاثين تأكيدًا (القاعدة 32). فيدخل السطحُ الحارسَ الدائم لا
      // مِجَسًّا مفردًا: ‎walkthroughAlign‎ يقيس شريحةَ الجولة وحدها، وهذا يقيس السطحَ كلَّه.
      + " .gettingStartedContainer,"
      // ودجاتٌ عائمة **داخل حاوية المحرّر LTR**: نصُّها واجهةٌ مترجَمة لا كود.
      + " .editor-widget.find-widget, .suggest-widget, .action-widget, .zone-widget,"
      // محرّرُ المقارنة: **أوراقُ واجهته وحدها** لا سطورُه. سطورُ المقارنة كودُ المستخدم
      // (مقاطعُ ومساراتٌ ومحايدات) فتُغرِق الماسحَ كما أغرقته ‎.view-lines‎ و‎.xterm-rows‎.
      // ما نمسحه: شريطُ الأسطر المطويّة ومراجعةُ المقارنة الميسورة — نصُّهما واجهةٌ مترجَمة.
      // ⚠️ **لا شَولةً مائلةً (backtick) في تعليقات هذه الكتلة**: الكتلةُ كلُّها داخل قالبٍ
      // نصّيّ يُرسَل إلى ‎cdp.evaluate‎، فأوّلُ شَولةٍ تُنهي القالبَ وتحوّل الماسحَ إلى
      // ‏ReferenceError صامت — تشغيلةٌ كاملة أبلغت «لم يُفتَح أيّ سطح» لهذا السبب وحده.
      + " .monaco-diff-editor .diff-hidden-lines, .monaco-diff-editor .diff-review,"
      + " .monaco-breadcrumbs")]
      .filter(p => p.getBoundingClientRect().width > 40);
    const seen = new Set(), out = [], texts = [], mis = [], misSeen = new Set();
    let alignable = 0;
    // **البُعد الثالث: من أيّ حافّةٍ يبدأ السطر؟** كان الماسحُ يسأل عن ترتيب المحارف
    // وحده، فمرّت جولةُ الترحيب نظيفةً وهي ملصَقةٌ باليسار (محاذاةٌ يسرى صريحة من
    // المنبع تغلب اتّجاه القشرة). فما أفلت مرّةً يُفلت مرّاتٍ ما لم يُسأل عنه صراحةً.
    //
    // الحكمُ **بالحبر لا بالإعلان**: نقيس صندوقَ حبر النصّ (Range على محتوى العنصر)
    // ونقارنه بصندوق المحتوى. الفسحةُ وحدها ليست عطبًا — العطبُ أن يكون الحبرُ ملتصقًا
    // بالحافّة **التابعة** (اليسرى في RTL) وبينه وبين **القائدة** فسحةٌ حقيقيّة.
    // ثلاثةُ قيودٍ تمنع البلاغ الكاذب:
    //   • العنصرُ المُقتطع (ellipsis وفيضٌ فعليّ) يملأ صندوقه فلا محاذاةَ تُقاس.
    //   • المحاذاة الوسطى نيّةٌ صريحة من المصمّم لا عطب.
    //   • عتبةُ ‎8px‎ للفسحة: ما دونها فروقُ قياسٍ لا إزاحةٌ مرئيّة.
    const inkBox = el => {
      const g = document.createRange();
      g.selectNodeContents(el);
      const rs = [...g.getClientRects()].filter(b => b.width > 0.5 && b.height > 0.5);
      if (!rs.length) return null;
      return { l: Math.min(...rs.map(b => b.left)), r: Math.max(...rs.map(b => b.right)) };
    };
    // الحاويات LTR التي نقبل مسحَ نصوصها: ودجات المحرّر العائمة (نصُّها واجهةٌ مترجَمة).
    const LTRHOST = ".find-widget, .suggest-widget, .action-widget, .zone-widget";
    let scanned = 0;
    for (const root of SCOPE) for (const el of root.querySelectorAll("*")) {
      if (el.children.length) continue;
      if (el.closest(".monaco-aria-container")) continue;
      if (el.closest(".editor-instance .view-lines")) continue;
      // ‏‎.xterm-rows‎ **مخرَجُ المستخدم لا واجهة**، بالضبط كسطور المحرّر: كلُّ صفٍّ فيها
      // مقاطعُ محايدةٌ ومسارات، فتُغرِق الماسح. دخلت مع سطح «الطرفيّة» فاستُثنيت معه.
      if (el.closest(".xterm-rows, .xterm-helper-textarea")) continue;
      const t = (el.textContent || "").trim();
      if (t.length < 3 || t.length > 120) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 4) continue;
      const cs = getComputedStyle(el);
      // ⚠️ **بقعةٌ عمياء عمرُها كلُّ الماسح:** كان الشرطُ يُسقِط كلَّ حاويةٍ LTR، فيمسح
      // نصفَ التناقضات فقط (لاتينيٌّ في RTL) ويعمى عن نصفها الآخر (**عربيٌّ في LTR**) —
      // وهو النصف الذي **صنعناه نحن**: حاويةُ المحرّر تبقى LTR لحماية الكود، وفيها
      // ودجاتٌ نصُّها واجهةٌ مترجَمة. القاعدة 30 نجت من كلّ تشغيلاتنا بهذا الشرط وحده.
      if (cs.visibility === "hidden") continue;
      if (cs.direction !== "rtl" && !el.closest(LTRHOST)) continue;
      scanned++;
      if (texts.length < 400) texts.push(t.slice(0, 40));
      // عتبة الفيض ‎4px‎ لا ‎1px‎: الفروق دون البكسل في القياس تجعل نصًّا ظاهرًا كاملًا
      // يُبلَّغ «مقصوصًا». رفعناها بعد أن أعاد المسحُ نصوصًا تُعرَض بتمامها في اللقطة.
      const clipped = cs.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 4;
      // **المحايد الطرفيّ خطرٌ فقط إن خالف اتّجاهُ النصّ اتّجاهَ الحاوية.** جملةٌ عربيّة
      // تنتهي بنقطة في قشرةٍ عربيّة سليمةٌ تمامًا — النقطة تأخذ اتّجاه الفقرة فتقع يسارًا
      // وهو صوابها. رصدنا هذا على البناء المشحون: «لم يتم اكتشاف مشاكل في مساحة العمل.»
      // بُلِّغت في أربعة أسطح وهي صحيحة. فنشترط أن يكون **أوّل حرفٍ قويّ لاتينيًّا**:
      // حينها يقع النصّ في فقرةٍ RTL بخلاف اتّجاهه، وتقفز محايداته فعلًا.
      // ‏**‎\\p‎ لا ‎\p‎.** داخل القالب النصّيّ يُبتلَع الشرطةُ المائلة الواحدة، فيصل إلى
      // الصفحة ‎/[p{L}]/u‎ — صنفُ محارفٍ حرفيّ لا فئةٌ يونيكوديّة. النتيجة أنّ ‎strong‎ كان
      // ‎null‎ في كلّ نصٍّ لا يحوي ‎p‎ أو ‎L‎، فـ‎startsLTR‎ ‎false‎ دائمًا، ففرعُ «المحايد
      // الطرفيّ» **ميّتٌ كلَّه**. قِسناه: «‎Results 83‎» ⇒ ‎null‎ بالخطأ، ‎R‎ بالصواب.
      const strong = t.match(/[\\p{L}]/u);
      const startsLTR = !!strong && !AR.test(strong[0]);
      const startsRTL = !!strong && AR.test(strong[0]);
      // **بوّابةٌ واحدة لكلّ الأنماط: أوّلُ حرفٍ قويٍّ لاتينيّ.** كان الخلطُ عربيّ+لاتينيّ
      // بندًا مستقلًّا فيُبلِّغ عن نصٍّ **سليمٍ تمامًا**: قِسنا تلميح شريط الأنشطة
      // «المستكشف (Ctrl+Shift+E) - ملف واحد غير محفوظ» فوجدنا ترتيبه البصريّ صحيحًا
      // يمينًا-يسارًا (‏المستكشف 1324 ← الاختصار 1252 ← الشرطة 1240 ← ملف 1214) —
      // لأنّ فقرةً اتّجاهُها RTL وأوّلُ حرفٍ قويٍّ فيها عربيّ **متوافقان**، فخوارزميّة
      // ‏bidi تُرتّب المقطع اللاتينيّ ومحايداته على الصواب بلا أيّ قاعدة منّا.
      // الخطرُ الحقيقيّ هو **التناقض**: نصٌّ يبدأ بلاتينيٍّ داخل حاوية RTL.
      // شاهدٌ إيجابيّ قِسناه قبل الاستبدال (إبطال معالجة القاعدة 24 حيًّا على الامتدادات):
      // القديم ‎0 ⇒ 5 ⇒ 0‎ والجديد ‎0 ⇒ 5 ⇒ 0‎ — **صفرُ اختلاف**. أي أنّنا حذفنا ضجيجًا
      // لا كشفًا. ولولا هذا القياس لكان الاستبدالُ إضعافًا صامتًا للماسح.
      // **كشفٌ بالقياس لا بالأمارة.** الشروطُ أعلاه أماراتٌ (محايدٌ في النصّ، خلطُ خطّين،
      // قصٌّ) تدلّ على **احتمال** انقلاب. جرّبنا بديلًا يكشف بالسبب — كلُّ ورقةٍ لاتينيّة
      // الرأس في حاوية RTL بـ‎unicode-bidi: normal‎ — فأعاد اثني عشر اسمَ ملفٍّ في
      // المستكشف («‏.github‎»، «‏.vscode‎») **وكلُّها سليمةُ التصيير**: قِسنا ‎.github‎
      // فوجدنا محارفها ‎1300 → 1332‎ صاعدةً بانتظام. فالسببُ وحده لا يكفي حكمًا.
      //
      // فالحكمُ القاطع هو الترتيبُ البصريّ نفسه: نصٌّ سليمٌ محارفُه **تصعد يسارًا←يمينًا**
      // بترتيبها المنطقيّ. أيُّ تراجعٍ في ‎left‎ انقلابٌ مقيسٌ لا مظنون. وهو ما أمسك
      // القاعدة 29: «‏rtl_fixture.ص‎» أعطت ‎…961‎ ثمّ ‎.‎ عند ‎915‎ ثمّ ‎ص‎ عند ‎899‎.
      // نقصره على ‎60‎ محرفًا وعقدةٍ نصّيّةٍ واحدة (كلفة ‎Range‎ لكلّ محرف)، ونُسقِط
      // الحكمَ على النصّ **الملفوف** — سطرٌ ثانٍ يعيد ‎left‎ إلى أوّله بلا أيّ انقلاب.
      //
      // وللاتّجاه المعاكس (**عربيٌّ في حاوية LTR**، وهو ما كشف القاعدة 30) لا يصلح شرطُ
      // الصعود: التصييرُ السليم هناك **هابط**، ومقاطعُ الأرقام داخله تصعد بحقٍّ («‏146»).
      // فنحكم بالفرق لا بالاتّجاه: نقيس رتبةَ المحارف كما هي، ثمّ نفرض ‎plaintext‎ آنيًّا
      // ونعيد القياس ونستعيد النمط **في المهمّة نفسها** (لا رسمَ بينهما). اختلافُ الرتبة
      // يعني أنّ التصيير الحاليّ غيرُ ما تُنتجه فقرةٌ يشتقّ اتّجاهُها من نصّها = انقلاب.
      let reordered = false;
      const oneText = t.length <= 60 && el.childNodes.length === 1
        && el.firstChild && el.firstChild.nodeType === 3;
      if (oneText && (startsLTR || (startsRTL && cs.direction !== "rtl"))) {
        const n = el.firstChild, s = n.textContent, g = document.createRange();
        const xs = () => { const a = []; let top = null;
          for (let i = 0; i < s.length; i++) {
            g.setStart(n, i); g.setEnd(n, i + 1);
            const b = g.getBoundingClientRect();
            if (!b.width && !b.height) continue;
            if (top === null) top = b.top;
            if (Math.abs(b.top - top) > 2) return null;      // نصٌّ ملفوف: لا حكم
            a.push(b.left);
          }
          return a; };
        // ⚠️ **شرطُ «الصعود المطّرد» كان يُدين تصييرًا صحيحًا.** كان الاتّجاهُ الأوّل
        // (لاتينيٌّ في حاوية RTL) يُحكَم عليه بأنّ كلَّ تراجعٍ في ‎left‎ انقلاب. وهذا
        // صحيحٌ لسلسلةٍ بلا مقطعٍ عربيٍّ طويل، وخطأٌ قاطعٌ لجملةٍ مختلطة: «‏fix(محراب):
        // تشغيل ص…» فقرتُها LTR بحقٍّ (أوّلُ قويٍّ لاتينيّ) ومقطعُها العربيُّ **يهبط
        // بحقٍّ** — وهو ما يعرضه GitHub وكلُّ عارضٍ سليم. قِسناه على عنوان إيداعٍ حقيقيّ
        // في جزء المصادر: أُدين وسلفُه ‎plaintext‎ فعلًا (قِسنا الحوسبة: ‎label-name‎ =
        // ‎plaintext‎)، أي أنّ المِجَسّ كان يطلب ما لا تُنتجه أيُّ قاعدة.
        //
        // فالمعيارُ واحدٌ في الاتّجاهين: **الفرقُ عن فقرةٍ يشتقّ اتّجاهُها من نصّها**.
        // نقيس الرتبة كما هي، ثمّ نفرض ‎plaintext‎ آنيًّا ونعيد القياس ونستعيد النمط في
        // المهمّة نفسها (لا رسمَ بينهما). اختلافُ الرتبة = انقلابٌ قابلٌ للإصلاح بقاعدة.
        // وتساويها = التصييرُ هو التصييرُ المرجعيُّ نفسه، فلا شيءَ يُدان ولا يُصلَح.
        // الثمنُ المصرَّح به: عطبٌ لا يُصلحه ‎plaintext‎ (يحتاج عزلًا مثلًا) لا يُرصَد هنا —
        // ومِجَسٌّ يطلب المستحيل يُبقي الفحصَ أحمرَ أبدًا فيُلغى، وذلك أسوأ.
        const now = xs();
        if (now) {
          const rank = a => a.map((_, i) => i).sort((p, q) => a[p] - a[q]).join(",");
          const before = el.style.unicodeBidi;
          el.style.unicodeBidi = "plaintext";
          const alt = xs();
          el.style.unicodeBidi = before;
          if (alt && alt.length === now.length && rank(alt) !== rank(now)) reordered = true;
        }
      }
      // قياسُ المحاذاة — مستقلٌّ عن حكم الانقلاب أعلاه (بُعدان لا يتداخلان).
      // **العنصرُ المرن النامي مستثنًى — والاستثناءُ مقيسٌ لا مفترَض.** أوّلُ تشغيلةٍ
      // لهذا الفحص ردّت بلاغًا واحدًا: اختصارُ بند القائمة «‏Ctrl+Enter». قِسناه حيًّا
      // فإذا هو ‎flex-grow: 2‎ في أبٍ ‎display: flex‎، وصندوقُه ‎[1110‥1245]‎ وحبرُه
      // ‎[1136‥1175]‎ — أي أنّ الصندوقَ **مُصمَّمٌ ليحمل فسحةً** ويدفع نصَّه إلى الحافّة
      // الخارجيّة للقائمة (المنبع: ‎flex: 2 1 auto‎ مع محاذاةٍ إلى الطرف). وهذا في RTL
      // هو اليسار بحقّ — فالتصييرُ **مرآةٌ صحيحة** لا عطب. فلو أبقينا البلاغَ لأحمرنا
      // الطقمَ على تصميمٍ سليم، ولعلّمنا القارئَ تجاهُلَ الأحمر.
      const grown = el.parentElement
        && getComputedStyle(el.parentElement).display.includes("flex")
        && parseFloat(cs.flexGrow || 0) > 0;
      // **والنصُّ الطافح لا محاذاةَ له تُقاس.** بلاغٌ متقطّع لاحقَنا عبر تشغيلاتٍ عدّة
      // (وصفُ امتدادٍ إنجليزيّ، «فسحة 9px») صرفناه مرّتين بوصفه «أثرَ نسخةٍ متحوّلة».
      // ثمّ قِسناه: «scrollWidth > clientWidth» — النصُّ **يطفح** ويُقصّ بحذفٍ (ellipsis)،
      // وحبرُه يمتدّ خارج الصندوق (‏ink‏ ‎[1109‥1559]‎ في صندوق ‎[1109‥1334]‎). وفسحةٌ
      // تُحسَب من حبرٍ مقصوصٍ ليست فسحة، فالورقةُ ملأى بحقّ. والقياسُ يتقلّب مع عرض
      // القائمة، فيحمرّ الطقمُ تشغيلةً ويخضرّ أخرى بلا تغيّرٍ في المنتج — وذاك أخبثُ من
      // الأحمر الثابت لأنّه يعلّم قارئَه ألّا يصدّق الأحمر.
      const overflowing = el.scrollWidth > el.clientWidth + 1;
      // **ونصٌّ لاتينيٌّ في ورقة plaintext يقف يسارًا بحقّ.** بقي بعد استثناء الطافح بلاغٌ
      // واحدٌ متقطّع: «‏Abyss theme for Visual Studio Code» بفسحة ‎9px‎. وورقتُه
      // ‏«unicode-bidi: plaintext»، ومعناها أنّ اتّجاه الفقرة يُؤخَذ من **أوّل حرفٍ قويّ**
      // فيها — وهو لاتينيّ — فتصير الفقرةُ LTR وتُحاذى إلى اليسار. وهذه هي المعالجةُ التي
      // طلبناها نحن لهذه الأوراق (القاعدة 24)، فلو أدنّاها لأدنّا تصييرًا **نحن سبَبُه**.
      // ‏وظهورُه رهنُ الاستعلام (‏@builtin يُظهر صفًّا وصفُه قصيرٌ لا يطفح)، فبدا «متقطّعًا».
      const firstStrong = (() => {
        const m = /[A-Za-zÀ-ʯ]|[֐-ࣿיִ-﷿ﹰ-﻿]/.exec(t || "");
        return m ? (/[֐-ࣿיִ-﷿ﹰ-﻿]/.test(m[0]) ? "rtl" : "ltr") : null;
      })();
      const plaintextLtr = (cs.unicodeBidi || "").includes("plaintext") && firstStrong === "ltr";
      if (cs.direction === "rtl" && cs.textAlign !== "center" && !clipped && !grown && !overflowing && !plaintextLtr) {
        const ink = inkBox(el);
        if (ink) {
          const cl = r.left + parseFloat(cs.borderLeftWidth || 0) + parseFloat(cs.paddingLeft || 0);
          const cr = r.right - parseFloat(cs.borderRightWidth || 0) - parseFloat(cs.paddingRight || 0);
          const headGap = cr - ink.r;   // الفسحة عند الحافّة القائدة (اليمنى في RTL)
          const tailGap = ink.l - cl;   // الفسحة عند التابعة
          // **المقام قبل البسط.** ورقةٌ صندوقُها بمقاس حبرها لا محاذاةَ فيها تُقاس أصلًا
          // (وجُلُّ أوراق اللوحات كذلك: عناصرُ مرنة أو سطريّة تنكمش على نصّها). فلو
          // اكتفينا بعدّ المخالفات لأعلنّا «‎0 ملصَقة» على سطحٍ لم يكن فيه ما يُقاس —
          // وهو الخطأُ نفسه الذي منعه ‎scanned‎ في بُعد الانقلاب.
          if (headGap + tailGap > 8) alignable++;
          if (headGap > 8 && tailGap <= 2) {
            const km = path(el);
            if (!misSeen.has(km)) {
              misSeen.add(km);
              mis.push({ path: km, ta: cs.textAlign, headGap: Math.round(headGap), text: t.slice(0, 40) });
            }
          }
        }
      }
      const risky = (startsLTR && cs.direction === "rtl"
        && (NEUTRAL.test(t) || (AR.test(t) && LAT.test(t)) || clipped)) || reordered;
      // ‏‎handled‎ إعفاءٌ **بالأمارة**: سلفٌ عليه ‎plaintext‎. أمّا الانقلابُ المقيس
      // فحكمٌ نهائيّ — لو صار رغم القاعدة فالقاعدةُ لم تكفِ، وإخفاؤه أسوأُ من إظهاره.
      if (!reordered && (!risky || handled(el))) continue;
      const k = path(el);
      if (seen.has(k)) continue; seen.add(k);
      out.push({ path: k, bidi: cs.unicodeBidi, clipped, reordered, text: t.slice(0, 46) });
    }
    // ‏‎scanned‎ ليس زينة: بدونه كان «‎0 معرَّضة» يعني أحد أمرين لا يُفرَّق بينهما — سطحٌ
    // نظيف، أو سطحٌ **لم يُفتَح أصلًا** فمُسِح فراغ. اختصارُ مفتاحٍ يبتلعه المحرّر يكفي
    // لصنع الثاني. فنُعيد العدد ونشترط أن يكون موجبًا قبل احتساب السطح مقيسًا.
    //
    // ⚠️ **لكنّ ‎scanned > 0‎ وحده لا يُثبت أنّ السطحَ المقصود انفتح.** في النطاق أسطحٌ
    // حاضرةٌ دائمًا (شريط الحالة، التلميح)، فأيّ محفّزٍ فاشل يُعيد ‎scanned‎ موجبًا من
    // نصوصها ويُحسَب «سطحًا مسحناه». وقعنا فيه حرفيًّا: أضفنا الحوارَ المشروط فأبلغ
    // المُطالِبُ «‎14/14 أسطح» بينما **الحوارُ لم يُفتَح قطّ** (الكتابةُ لم تصل المحرّر
    // فلم يتّسخ فأغلق ‎Ctrl+W‎ التبويبَ بلا سؤال). فنُعيد نصوصَ الأوراق أيضًا: السطح
    // يُحتسَب مفتوحًا فقط إن أضاف نصًّا **لم يكن في القياس الخامل** قبل المحفّز.
    return { scanned, offenders: out, texts, misaligned: mis, alignable };
  })()`, 25000);
}

/**
 * الترتيب **البصريّ** لأوّل محرفٍ وآخره في ورقة نصّ — الشاهد الوحيد على أنّ `plaintext`
 * فعلت شيئًا فعلًا. اضطُررنا إليه لأنّ `getComputedStyle` **كذب علينا**: أعاد `plaintext`
 * على `.view-line` بينما العرض لم يتغيّر قيد بكسل (سمة `dir` من Monaco تغلبها). فمنذئذٍ
 * لا نصدّق الخاصّية المحسوبة في هذا الباب — نقيس مواضع المحارف.
 */
export async function glyphOrder(cdp, selector) {
  return cdp.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const n = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    if (!n) return null;
    const text = n.data.replace(/\\s+$/, "");
    if (text.length < 3) return null;
    const at = i => { const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + 1);
      return g.getBoundingClientRect().left; };
    const a = at(0), b = at(text.length - 1);
    return { text: text.slice(0, 40), ltr: a < b,
             first: Math.round(a), last: Math.round(b) };
  })()`);
}

/**
 * فتاتُ المسار — سطحٌ وسمناه «انتهازيًّا» بناءً على **قياسٍ ملوَّث**.
 *
 * قِسناه مرّةً فأعاد `{bars:1, items:0, w:0}` فاستنتجنا أنّه لا يُملأ ولو فُعِّل في
 * الإعدادات. الحقيقة أنّ `BreadcrumbsControl.update()` يخفيه حين لا يكون للمحرّر النشط
 * ‏URI (‏`breadcrumbsControl.ts:377`)، **وصفحةُ الترحيب كانت هي المحرّر النشط لحظةَ
 * القياس**. بتنشيط تبويب العيّنة صار: 4 بنود، ارتفاع ‎22‎، عرض ‎792‎.
 *
 * درسٌ يتكرّر: «صفرٌ» من ماسحٍ عامّ ليس دليلَ نظافة حتى نُثبت أنّ السطح **مأهول**.
 * لذلك يُعيد هذا المِجَسّ عددَ البنود صراحةً، ويُفشِله المُطالِبُ إن كان صفرًا.
 */
export async function breadcrumbsBar(cdp) {
  return cdp.evaluate(`(() => {
    const c = document.querySelector(".breadcrumbs-control");
    if (!c) return { present: false };
    const box = c.getBoundingClientRect();
    const items = [...c.querySelectorAll(".monaco-breadcrumb-item")].map(el => {
      const n = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
      const t = n ? n.data.trim() : "";
      let ltr = null;
      if (n && t.length > 2) {
        const at = i => { const g = document.createRange(); g.setStart(n, i); g.setEnd(n, i + 1);
          return g.getBoundingClientRect().left; };
        ltr = at(0) < at(n.data.length - 1);
      }
      const leaf = el.querySelector(".monaco-icon-label") || el;
      return { t: t.slice(0, 30), left: Math.round(el.getBoundingClientRect().left),
               ltr, ub: getComputedStyle(leaf).unicodeBidi };
    });
    return { present: true, hidden: c.classList.contains("hidden"),
             w: Math.round(box.width), h: Math.round(box.height), items };
  })()`);
}

/**
 * ينتظر **شرطًا** لا زمنًا. المُهَلُ الثابتة في المِجَسّات كلفتنا مرّتين: مهلةٌ قصيرة ⇒
 * قياسٌ قبل التصيير («‏14/14 · 0 معرَّضة» على لوحةٍ لم تُملأ بعد)، ومهلةٌ طويلة ⇒ تشغيلةٌ
 * تُقارب العشر دقائق فتُغري بألّا تُعاد. والشرطُ يعطي الاثنين: يعود فورَ تحقّقه، ويصبر
 * إلى الحدّ الأقصى إن تأخّر. يعود `true`/`false` لا يرمي: «لم يتحقّق» حالةٌ نُبلِّغها.
 */
export async function waitFor(cdp, expr, ms = 4000, step = 150) {
  const tries = Math.max(1, Math.ceil(ms / step));
  for (let i = 0; i < tries; i++) {
    let v = false;
    try { v = await cdp.evaluate(`(() => { try { return !!(${expr}); } catch { return false; } })()`); } catch { /* */ }
    if (v) return true;
    await sleep(step);
  }
  return false;
}

/**
 * **يُعيد سطحَ العمل إلى حالٍ معلومة قبل كلّ سطح.** كانت الحلقةُ تراكم أثرَها: لوحةٌ سفلى
 * مفتوحة، وودجةُ بحثٍ عالقة، ومحرّرٌ نشطٌ ليس محرّرَنا — فتشغيلةٌ ثانية على النسخة نفسها
 * تقيس حالةً متحوّلة، وقد أهدرنا ثلاثَ تشغيلاتٍ على بلاغاتٍ من هذا الجنس (منها محاذاةٌ
 * «معطوبة» ‎9px‎ ظهرت في الثانية دون الأولى). الإرجاعُ هنا **مشروط لا أعمى**: نطوي اللوحة
 * السفلى إن كانت مفتوحة فقط — و`Ctrl+J` عمياءَ كانت لتفتحها لا أن تغلقها.
 */
export async function resetWorkbench(cdp) {
  await escape(cdp); await sleep(120);
  await escape(cdp); await sleep(120);
  const panelOpen = await cdp.evaluate(`(() => { const p = document.getElementById("workbench.parts.panel");
    return !!(p && p.getBoundingClientRect().height > 40); })()`);
  if (panelOpen) { await key(cdp, 74, "KeyJ", MOD.CTRL); await sleep(400); }
  const find = await cdp.evaluate(`document.querySelectorAll(".find-widget.visible").length`);
  if (find) { await escape(cdp); await sleep(200); }
  return true;
}

/**
 * **التحويم بالمفتاح لا بالفأرة.** كان `.monaco-hover` في نطاق الماسح منذ الجولة الأولى
 * **بلا أن يُفتَح قطّ**: جرّبنا `Input.dispatchMouseEvent` على هدفين مستقلّين فلم يُنتج
 * تحويمًا (المُصطنَع لا يمرّ في مسار Monaco)، فبقي السطحُ «أخضرَ» وهو **مجهول** لا نظيف —
 * وذاك الفخُّ الموثَّق هنا خمسَ مرّات. والمخرجُ أنّ للتحويم أمرًا باختصارٍ ثابت:
 * ‏`editor.action.showHover` = ‏Ctrl+K ثمّ Ctrl+I، لا اسمَ أمرٍ مترجَمًا في الطريق.
 * ويشترط مؤشّرًا على رمزٍ له معلومة: ننقل المؤشّرَ إلى أوّل كلمة (‏Home ثمّ →).
 *
 * ⚠️ **ولم ينجح هذا أيضًا — والنتيجةُ مُبلَّغة لا مكتومة.** قِسنا الوترَ على عيّنة ص وعلى
 * ‏`package.json` (لـJSON مزوّدُ تحويمٍ مدمج) فبقيت `.monaco-hover` **قائمةً بحجم ‎0×0‎** في
 * الحالتين — أي أنّ العنصر في الصفحة دائمًا وفارغٌ دائمًا، وهو ما جعل إدراجَه في نطاق
 * الماسح يُسهم بصفرٍ بينما يُقرأ «نظيفًا». فالسطحُ **غيرُ مقيسٍ بثلاث طرقٍ مجرَّبة**
 * (فأرةٌ مُصطنَعة على هدفين، ووترُ الأمر)، ويُبلَّغ تخطّيًا صريحًا لا خضرةً صامتة.
 */
export async function editorHover(cdp) {
  await bringToFront(cdp);
  await activateSadTab(cdp); await sleep(300);
  if (!(await focusEditor(cdp))) return false;
  await key(cdp, 36, "Home", 0); await sleep(120);
  await key(cdp, 39, "ArrowRight", 0); await sleep(120);
  await key(cdp, 75, "KeyK", MOD.CTRL); await sleep(200);
  await key(cdp, 73, "KeyI", MOD.CTRL);
  return waitFor(cdp, `[...document.querySelectorAll(".monaco-hover")].some(e => e.getBoundingClientRect().height > 10)`, 4000);
}

/**
 * **صفحةُ تفاصيل الامتداد** — آخرُ نثرٍ عريضٍ في جزء المحرّر لم يُسأل سؤالَ المحاذاة.
 * صفحةُ الترحيب علّمتنا أنّ نصفَ ما نقيسه في هذا البُعد يأتي من النثر العريض لا من أوراق
 * اللوحات (تشرنق أوراقُها على محتواها فلا فسحةَ فيها تُقاس).
 *
 * ⚠️ **بالنقر على البطاقة لا بـ`Tab` ثمّ `Enter`.** جرّبنا الملاحةَ بالمفاتيح فقِسنا أنّ
 * ‏`document.activeElement` بقي `native-edit-context` بعد أربع ضغطات Tab — أي أنّ التركيز
 * **لم يغادر المحرّر أصلًا**، فذهبت `Tab` و`Enter` إلى **نصّ المستخدم**. هو بعينه خطرُ
 * ‏`Ctrl+A` الذي رصدناه قبلُ: مفتاحٌ يُرسَل بلا إثباتِ موضع التركيز يكتب حيث لا نريد.
 * النقرُ على العنصر يبلغ هدفَه بلا افتراضٍ عن التركيز، وقِسناه: `.extension-editor` = 1.
 */
export async function openExtensionDetails(cdp) {
  await escape(cdp);
  await key(cdp, 88, "KeyX", MOD.CTRL | MOD.SHIFT);
  if (!(await waitFor(cdp, `document.querySelectorAll(".extension-list-item").length > 0`, 8000))) return false;
  await cdp.evaluate(`(() => {
    const it = document.querySelector(".extension-list-item");
    if (!it) return 0;
    const tgt = it.closest(".monaco-list-row") || it;
    for (const ty of ["mousedown", "mouseup", "click"]) tgt.dispatchEvent(new MouseEvent(ty, { bubbles: true, detail: 1 }));
    return 1;
  })()`);
  return waitFor(cdp, `[...document.querySelectorAll(".extension-editor")].some(e => e.getBoundingClientRect().width > 100)`, 8000);
}

/**
 * **ترتيبُ أزرار الحوار — سؤالٌ ثقافيّ لا زخرفة.** في RTL يبدأ القارئ من اليمين، فالزرُّ
 * الأوّل (الفعلُ المؤكِّد) يجب أن يكون **أيمنَ** إخوته، والتركيزُ عليه ابتداءً. قِسناه
 * بترتيب DOM مقابل الترتيب البصريّ: تطابقٌ عكسيّ = صحيح في RTL.
 */
export async function dialogButtons(cdp) {
  return cdp.evaluate(`(() => {
    const box = document.querySelector(".monaco-dialog-box");
    if (!box) return { present: false };
    const bs = [...box.querySelectorAll(".dialog-buttons-row .monaco-button, .dialog-buttons .monaco-button")]
      .map(b => ({ t: (b.textContent || "").trim().slice(0, 24),
                   left: Math.round(b.getBoundingClientRect().left),
                   focused: b === document.activeElement || b.contains(document.activeElement) }));
    return { present: true, dir: getComputedStyle(box).direction, buttons: bs };
  })()`);
}

/**
 * **شريطُ الحالة: مِرساةٌ لا ترتيبَ نصّ.** الشريطُ يُمسَح خاملًا في كلّ تشغيلة، لكنّ
 * المسحَ يسأل عن اتّجاه **النصّ** داخل كلّ بند ولا يسأل عن **موضع** البنود. وفي RTL
 * البنودُ المُرساةُ `left` منطقيًّا (حالةُ المستودع وما إليها) يجب أن تُصيَّر على
 * **اليمين**، وإلّا انقلبت أولويّةُ القراءة كلُّها وإن كان كلُّ بندٍ سليمَ الاتّجاه.
 */
export async function statusbarOrder(cdp) {
  return cdp.evaluate(`(() => {
    const bar = document.getElementById("workbench.parts.statusbar");
    if (!bar) return { present: false };
    const mid = (el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; };
    const g = { left: [], right: [] };
    for (const el of bar.querySelectorAll(".statusbar-item")) {
      const r = el.getBoundingClientRect();
      if (r.width < 4) continue;
      const side = el.classList.contains("left") ? "left" : el.classList.contains("right") ? "right" : null;
      if (side) g[side].push(mid(el));
    }
    const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
    return { present: true, dir: getComputedStyle(bar).direction,
             nLeft: g.left.length, nRight: g.right.length,
             leftMid: avg(g.left), rightMid: avg(g.right) };
  })()`);
}

/**
 * **يُزيل أثرَ مِجَسّ الحوار.** `confirmDialog` يُنشئ ملفًّا بلا عنوان ويُلوّثه ثمّ يُلغي
 * الإغلاق بـ`Escape` — فيبقى التبويبُ المتّسخ. قِسنا الأثر: تبويبان `سUntitled-1/2` عالقان
 * بعد تشغيلةٍ واحدة، وهما يزاحمان تبويبَ المعاينة فيبتلعان **صفحةَ الترحيب** — أي أنّ
 * أثرَ مِجَسٍّ أسقط سطحَ مِجَسٍّ آخر. `Ctrl+A` هنا آمنٌ **بشرطٍ يُتحقَّق منه**: أن يكون
 * المحرّرُ النشط بلا عنوان (ملفُّنا نحن). وإلّا فلا نلمسه — فذاك ملفُّ المستخدم.
 */
export async function discardUntitled(cdp) {
  for (let i = 0; i < 4; i++) {
    const isUntitled = await cdp.evaluate(`(() => {
      const t = document.querySelector(".tabs-container .tab.active");
      return !!(t && /Untitled/i.test(t.textContent || ""));
    })()`);
    if (!isUntitled) {
      const any = await cdp.evaluate(`(() => {
        const t = [...document.querySelectorAll(".tabs-container .tab")].find(x => /Untitled/i.test(x.textContent || ""));
        if (!t) return 0;
        for (const ty of ["mousedown", "mouseup", "click"]) t.dispatchEvent(new MouseEvent(ty, { bubbles: true }));
        return 1;
      })()`);
      if (!any) return true;
      await sleep(500);
      continue;
    }
    await key(cdp, 65, "KeyA", MOD.CTRL); await sleep(150);
    await key(cdp, 46, "Delete", 0); await sleep(300);
    await key(cdp, 87, "KeyW", MOD.CTRL); await sleep(600);
    await escape(cdp); await sleep(200);
  }
  return true;
}
