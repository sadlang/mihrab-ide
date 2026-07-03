// حزام CDP لاختبارات محراب الوقتيّة (L3) — مساعدات اتّصال وإدخال وقياس.
// يتّصل بنسخة Mihrab **مُطلَقة مسبقًا** بـ--remote-debugging-port (لا يُطلقها: صدفة الأتمتة
// معزولة عن سطح المكتب). دروس مُدمَجة من جلسات التحقّق: bringToFront أوّلًا، insertText لا
// مفاتيح للنصّ، Escape قبل كلّ محفّز، انتظار استقرار الودجة، إحداثيّات CSS-px.
// Node ≥ 22 (WebSocket مدمج).

export async function listTargets(port = 9222) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  return res.json();
}

// يختار صفحة الـworkbench (يفضّل ذات ملفّ .sad مفتوح).
export async function pickPage(port = 9222) {
  const targets = await listTargets(port);
  const pages = targets.filter(t => t.type === "page" && t.url.includes("workbench.html"));
  if (!pages.length) throw new Error("لا صفحة workbench — هل Mihrab مُطلَق بالمنفذ وبملفّ مفتوح؟");
  return pages.find(p => /\.sad\b/i.test(p.title)) || pages[0];
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
  async evaluate(expression) {
    const r = await this.cmd("Runtime.evaluate", { expression, returnByValue: true });
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
export async function insertText(cdp, text) { await cdp.cmd("Input.insertText", { text }); }

// نقرة يسار عند إحداثيّة CSS-px (تُسجَّل بعد bringToFront).
export async function click(cdp, x, y) {
  await cdp.cmd("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp.cmd("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await sleep(150);
}

// هندسة تخطيط المحرّر (بلا إدخال مُصطنَع) — مصدر معظم تأكيدات RTL.
export async function editorGeometry(cdp) {
  return cdp.evaluate(`(() => {
    const wb = document.querySelector('.monaco-workbench');
    const q = sel => { const e = document.querySelector(sel); if (!e) return null;
      const r = e.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), t: Math.round(r.top), b: Math.round(r.bottom) }; };
    return {
      dir: wb ? wb.getAttribute('dir') : null,
      editor: q('.monaco-editor'),
      minimap: q('.monaco-editor .minimap'),
      content: q('.monaco-editor .view-lines'),
      gutter: q('.monaco-editor .margin'),
      lineNumbers: q('.monaco-editor .line-numbers'),
      scrollbarV: q('.monaco-editor .monaco-scrollable-element > .scrollbar.vertical'),
      overviewRuler: q('.monaco-editor .decorationsOverviewRuler'),
      activityBar: q('.monaco-workbench .activitybar'),
      firstLineDir: (() => { const l = document.querySelector('.monaco-editor .view-line'); return l ? getComputedStyle(l).direction : null; })(),
      editorBg: (() => { const e = document.querySelector('.monaco-editor'); return e ? getComputedStyle(e).backgroundColor : null; })(),
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
  const pt = await cdp.evaluate(`(() => { const e = document.querySelector('.monaco-editor'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width * 0.5), y: Math.round(r.top + 130) }; })()`);
  if (!pt) return { visible: false };
  await click(cdp, pt.x, pt.y);                // ركّز على سطر كود
  await sleep(150);
  await insertText(cdp, " التم");              // بادئة تُطابق كلمات الملفّ
  await sleep(400);
  await key(cdp, ...KEY.SPACE, MOD.CTRL);       // Ctrl+Space
  await sleep(1200);                           // انتظر استقرار الودجة (أوّل إطار انتقاليّ خاطئ)
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

// تحقّق bidi المحرّر (م3، البند #24 اتّجاه السطر + محاذاة النصّ) — يحتاج rtl_fixture.sad مفتوحًا.
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

// يفتح البحث (Ctrl+F) ويقيس موضعه.
export async function findWidget(cdp, clickX = 700, clickY = 60) {
  await bringToFront(cdp);
  await escape(cdp);
  await click(cdp, clickX, clickY);
  await key(cdp, ...KEY.F, MOD.CTRL);
  await sleep(600);
  return cdp.evaluate(`(() => {
    const f = document.querySelector('.monaco-editor .find-widget');
    if (!f) return { visible: false };
    const r = f.getBoundingClientRect();
    const ed = document.querySelector('.monaco-editor').getBoundingClientRect();
    return { visible: true, left: Math.round(r.left), right: Math.round(r.right), editorWidth: Math.round(ed.width), editorLeft: Math.round(ed.left) };
  })()`);
}
