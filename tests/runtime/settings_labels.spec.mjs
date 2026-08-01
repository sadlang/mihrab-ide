// L3: قياسُ تعريب عناوين لوحة الإعدادات على نسخةٍ حيّة.
//
// لماذا لا يكفي ما قبله: L0 يفحص نصَّ المعجم، والاختبارُ السلوكيّ يشغّل الدالّةَ معزولةً،
// وL2 يثبت وصولَ السلاسل إلى الحزمة. ولا شيءَ منها يثبت أنّ العنوانَ **يظهر معرَّبًا على
// الشاشة**: قد يُستدعى `wordifyKey` من مسارٍ آخر، أو يُستبدَل العنوانُ بعد اشتقاقه، أو
// تُلتقط النتيجةُ من ذاكرةٍ مؤقّتةٍ بُنيت قبل الرقعة. هذا الملفّ يقرأ DOM اللوحة نفسَه.
//
// الاستعمال (تحتاج نسخةً مُطلَقةً بالمنفذ — صدفةُ الأتمتة لا تُطلق نافذة):
//   Mihrab.exe --remote-debugging-port=9222 --remote-allow-origins=*
//   node tests/runtime/settings_labels.spec.mjs [منفذ]

import { pickPage } from './harness.mjs';

const port = Number(process.argv[2] || 9222);
const page = await pickPage(port);
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', e => {
	const m = JSON.parse(e.data);
	if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise(r => ws.addEventListener('open', r));
const send = (method, params = {}) => new Promise(r => {
	const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async expr => (await send('Runtime.evaluate', {
	expression: expr, returnByValue: true, awaitPromise: true,
})).result?.result?.value;
const wait = ms => new Promise(r => setTimeout(r, ms));

let failed = 0;
const check = (ok, msg) => { if (ok) { console.log('  ✅ ' + msg); } else { failed++; console.log('  ❌ ' + msg); } };

console.log('═══ L3: عناوين لوحة الإعدادات ═══');

// نفتح اللوحةَ بالأمر لا بالمفاتيح: ضغطاتُ المفاتيح لا تصل نافذةً غيرَ مقدَّمةٍ فعليًّا
// (مقيس: Input.insertText يصل وInput.dispatchKeyEvent لا يصل)، أمّا تنفيذُ الأمر فيصل.
await ev(`(() => {
	const el = document.querySelector('.monaco-workbench');
	if (!el) { return 'no-workbench'; }
	return 'ok';
})()`);

// المسارُ الموثوق: خدمةُ الأوامر عبر عنصر الاختبار الذي يعرضه المنبع في وضع التطوير
// غيرُ متاحٍ في بناءٍ مشحون. فنعتمد على أنّ اللوحة **مفتوحةٌ سلفًا** (يفتحها المشغّل
// أو المستخدم بـCtrl+,) ونقرأ ما فيها. الغيابُ يُبلَّغ صراحةً لا يُفسَّر نجاحًا.
const state = await ev(`(() => {
	const rows = [...document.querySelectorAll('.settings-editor .setting-item-contents')];
	const out = rows.slice(0, 400).map(r => {
		const c = r.querySelector('.setting-item-category');
		const l = r.querySelector('.setting-item-label');
		return { cat: c ? c.textContent.trim() : '', lab: l ? l.textContent.trim() : '' };
	}).filter(x => x.lab);
	return JSON.stringify({ count: out.length, rows: out.slice(0, 60) });
})()`);

const parsed = state ? JSON.parse(state) : { count: 0, rows: [] };
if (!parsed.count) {
	console.log('  ⚠️  لوحةُ الإعدادات ليست مفتوحة — افتحها بـCtrl+, ثمّ أعد التشغيل.');
	console.log('      (لا أُفسّر الغياب نجاحًا.)');
	ws.close();
	process.exit(2);
}

const AR = /[؀-ۿ]/;
const ISO = /[⁦-⁩]/;
const arabicRows = parsed.rows.filter(r => AR.test(r.lab));
const arabicCats = parsed.rows.filter(r => AR.test(r.cat));

console.log(`  بنودٌ مقروءة: ${parsed.count}`);
check(arabicRows.length > 0,
	`عناوينُ معرَّبةٌ على الشاشة: ${arabicRows.length}/${parsed.rows.length}`);
check(arabicCats.length > 0,
	`فئاتٌ معرَّبة: ${arabicCats.length}/${parsed.rows.length}`);

// لا نصفَ ترجمةٍ داخل المقطع الواحد: مقطعٌ فيه عربيّةٌ ولاتينيّةٌ معًا خرقٌ للقاعدة
// (عدا أسماء الأعلام التي تبقى لاتينيّةً بكاملها — وتلك بلا حرفٍ عربيّ أصلًا).
const mixed = parsed.rows.filter(r => AR.test(r.lab) && /[A-Za-z]{3,}/.test(r.lab));
check(mixed.length === 0,
	mixed.length ? `خلطٌ داخل المقطع: ${mixed.slice(0, 3).map(m => m.lab).join(' | ')}`
		: 'لا خلطَ داخل المقطع الواحد');

// عزلُ الاتّجاه وصل النصَّ المعروض. هذا **الفحصُ الوحيدُ الممكن** له: المحرفان بلا
// عرضٍ ولا صورة، فلا لقطةُ شاشةٍ تُظهرهما ولا عينٌ تراهما — ولا يظهر أثرُهما إلّا في
// ترتيبِ ما حولهما. وجودُهما في DOM يثبت أنّ المعالجةَ جرت على النصّ المعروض نفسِه.
// **كلُّ** صفٍّ لا «صفٌّ ما»: `some` كان يمرّ خضراءَ ولو انحسر ٩٩٪ من الصفوف.
const isoLab = parsed.rows.filter(r => ISO.test(r.lab)).length;
const withCat = parsed.rows.filter(r => r.cat);
const isoCat = withCat.filter(r => ISO.test(r.cat)).length;
check(isoLab === parsed.rows.length, `عزلُ التسميات: ${isoLab}/${parsed.rows.length}`);
check(isoCat === withCat.length, `عزلُ الفئات: ${isoCat}/${withCat.length}`);

// ── القياسُ الذي يمسك العطبَ الحقيقيّ: موضعُ المحايد ──
// العزلُ لا يُرى، وأثرُه كلُّه في **ترتيب ما حولَه**. وقد أوقعنا العزلُ نفسُه في انحسار:
// جمعُه مع `unicode-bidi: plaintext` يُسقِط اتّجاهَ الفقرة إلى LTR (القاعدة P2 تتخطّى
// ما بين FSI وPDI فلا يبقى حرفٌ قويٌّ خارجَ العزل). ولا يكشف ذلك إلّا قياسُ الإحداثيّات:
// المنبعُ يُلحِق «: » بالفئة، ففي فقرةٍ RTL يجب أن تقع **يسارَ** نصّها.
const geom = await ev(`(() => {
	const el = [...document.querySelectorAll('.settings-editor .setting-item-category')]
		.find(e => /[\\u0600-\\u06FF]/.test(e.textContent));
	if (!el) { return null; }
	const node = [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
	if (!node || node.textContent.length < 3) { return null; }
	const t = node.textContent;
	const at = (a, b) => { const r = document.createRange(); r.setStart(node, a); r.setEnd(node, b); return r.getBoundingClientRect().left; };
	const colon = t.lastIndexOf(':');
	if (colon < 1) { return null; }
	return JSON.stringify({ text: t, colonLeft: at(colon, colon + 1), headLeft: at(0, 1) });
})()`);

if (!geom) {
	console.log('  ⚠️  لم نجد فئةً عربيّةً بنقطتين — لم يُقَس موضعُ المحايد.');
	failed++;
} else {
	const g = JSON.parse(geom);
	check(g.colonLeft < g.headLeft,
		`النقطتان يسارَ نصّ الفئة (فقرة RTL): «${g.text.trim()}» ${g.colonLeft.toFixed(0)} < ${g.headLeft.toFixed(0)}`);
}

console.log('\n  عيّنة:');
for (const r of parsed.rows.slice(0, 12)) {
	console.log(`    ${r.cat} : ${r.lab}`);
}

await wait(50);
ws.close();
console.log(failed ? `─── ${failed} إخفاق ───` : '─── نجح ───');
process.exit(failed ? 1 : 0);
