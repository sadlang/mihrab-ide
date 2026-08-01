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

console.log('\n  عيّنة:');
for (const r of parsed.rows.slice(0, 12)) {
	console.log(`    ${r.cat} : ${r.lab}`);
}

await wait(50);
ws.close();
console.log(failed ? `─── ${failed} إخفاق ───` : '─── نجح ───');
process.exit(failed ? 1 : 0);
