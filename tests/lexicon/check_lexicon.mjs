// اختبارٌ سلوكيّ لمعجم عناوين الإعدادات — يستدعي الدالّة فعلًا.
//
// لماذا وُجد: الحارسُ الساكن (L0) يفحص نصَّ المعجم — تكرارَ المفاتيح والوصلَ والإملاء —
// **ولا يستدعي `arabizeSettingText` أبدًا**. فمرّ عطبان خضراوَين حتّى كشفتهما المراجعة
// الهندسيّة: صفةٌ مذكّرةٌ تُلحَق برأسٍ مؤنّث («الاقتراحات الذكيّ»)، ورأسٌ فعليٌّ يسبق
// ذيلًا اسميًّا («دفع المهلة» بدل «مهلة الدفع»). كلاهما نصٌّ سليمُ الشكل، فلا يمسّه فحصٌ نصّيّ.
//
// يصرّف الوحدةَ بـtsc المحلّيّ ثمّ يشغّلها. الاستعمال:
//   node tests/lexicon/check_lexicon.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SRC = join(ROOT, 'patches', 'core', 'mihrabSettingsLexicon.ts');
const TSC = join(ROOT, '.upstream', 'vscode', 'node_modules', 'typescript', 'lib', 'tsc.js');

// أزواجٌ ذهبيّة: مدخلٌ ⇐ مخرجٌ متوقَّع بالضبط.
// `null` تعني «يجب أن يبقى إنجليزيًّا كما هو» — وهي حالةٌ يجب اختبارُها كالترجمة سواءً:
// ترجمةُ اسمِ علمٍ تشويهٌ، وقاعدةٌ تُنتج عربيّةً مكسورةً يجب أن تسقط لا أن تُخرِج ركامًا.
const GOLDEN = [
	// أساسيّاتٌ يراها كلُّ مستخدم
	['Editor', 'المحرّر'],
	['Editor › Suggest', 'المحرّر › الاقتراحات'],
	['Format On Save', 'التنسيق عند الحفظ'],
	['Font Size', 'حجم الخطّ'],
	['Word Wrap', 'التفاف الكلمات'],
	['Tab Size', 'حجم علامة الجدولة'],
	['Auto Save', 'الحفظ التلقائيّ'],
	['Files › Exclude', 'الملفّات › الاستثناءات'],
	['Workbench › Editor', 'بيئة العمل › المحرّر'],

	// ترتيبُ القواعد: الكمّ على المركّب كلِّه، والذيلُ الاسميّ قبل الصفة
	['Max File Size', 'أقصى حجم الملفّ'],
	['Auto Accept Delay', 'مهلة القبول التلقائيّ'],

	// مطابقةُ التذكير والتأنيث — العطب الذي كشفته المراجعة
	['Smart Suggestions', 'الاقتراحات الذكيّة'],
	['Default Font Family', 'عائلة الخطّ الافتراضيّة'],
	['Auto Detect Indentation', 'كشف المسافة البادئة التلقائيّ'],

	// إملاءُ حرف الجرّ
	['Allow Force Push', 'السماح بالدفع القسريّ'],

	// الإضافة
	['Terminal Bell', 'جرس الطرفيّة'],
	['Diff Line Inserted', 'إدراج سطر المقارنة'],

	// أفعالٌ وحروفُ ربط
	['Show Files', 'إظهار الملفّات'],
	['Confirm Before Close', 'التأكيد قبل الإغلاق'],
	['Focus Editor On Break', 'التركيز على المحرّر عند التوقّف'],
	['Line Has Error', 'السطر فيه الخطأ'],

	// Render ≠ Show: عنوانان مختلفان يجب ألّا يتطابقا
	['Render Whitespace', 'إظهار الفراغ'],
	['Render Control Characters', 'إظهار محارف التحكّم'],

	// أسماءُ أعلامٍ لا تُترجَم
	['Git', null],
	['Vite', null],
	['Webpack', null],
	['Npm', null],

	// صفةٌ لا تُركَّب: الإنجليزيّة أصدقُ من عربيّةٍ غيرِ مطابِقة
	['Collapse Identical Lines', null],
	['Show Empty Decorations', null],
	['Max Visible Suggestions', null],

	// إطلاقٌ كاذب: مقاطعُ من معرّفات حزم
	['Io', null],
	['Org', null],
	['Snap', null],

	// أيقونةُ وسم اللغة تبقى كما هي
	['$(bracket) [javascript]', null],
];

// مدخلاتٌ يجب ألّا ترمي استثناءً ولا تُنتج نصفَ تركيب.
const ROBUST = [
	'', ' ', ' › ', 'Editor ›  › X', '$(bracket)', '$(', '›››',
	Array.from({ length: 200 }, (_, i) => 'Word' + i).join(' '),
];

function compile() {
	const out = mkdtempSync(join(tmpdir(), 'mihrab-lex-'));
	copyFileSync(SRC, join(out, 'mihrabSettingsLexicon.ts'));
	execFileSync(process.execPath, [
		TSC, '--strict', '--target', 'ES2022', '--module', 'ES2022',
		'--moduleResolution', 'bundler', '--outDir', join(out, 'js'),
		join(out, 'mihrabSettingsLexicon.ts'),
	], { stdio: 'pipe' });
	return { dir: out, js: join(out, 'js', 'mihrabSettingsLexicon.js') };
}

let failed = 0;
const fail = (msg) => { failed++; console.log('  ❌ ' + msg); };

console.log('═══ معجم عناوين الإعدادات: اختبار سلوكيّ ═══');

let built;
try {
	built = compile();
	console.log('  ✅ تصريفٌ نظيف (tsc --strict)');
} catch (e) {
	console.log('  ❌ التصريف أخفق:\n' + (e.stdout || e.message).toString().slice(0, 2000));
	process.exit(1);
}

const { arabizeSettingText: A } = await import(pathToFileURL(built.js).href);

// ── الأزواج الذهبيّة ──
let goldOk = 0;
for (const [input, expected] of GOLDEN) {
	let got;
	try {
		got = A(input);
	} catch (e) {
		fail(`«${input}» رمى استثناءً: ${e.message}`);
		continue;
	}
	const want = expected === null ? input : expected;
	if (got === want) {
		goldOk++;
	} else {
		fail(`«${input}»\n       أُنتِج : ${got}\n       المتوقَّع: ${want}`);
	}
}
console.log(`  ${goldOk === GOLDEN.length ? '✅' : '⚠️'} أزواج ذهبيّة: ${goldOk}/${GOLDEN.length}`);

// ── المتانة: لا استثناء على أيّ مدخل ──
let robustOk = 0;
for (const input of ROBUST) {
	try {
		const got = A(input);
		if (typeof got !== 'string') {
			fail(`«${input.slice(0, 30)}» أعاد ${typeof got} لا نصًّا`);
		} else {
			robustOk++;
		}
	} catch (e) {
		fail(`«${input.slice(0, 30)}» رمى استثناءً: ${e.message}`);
	}
}
console.log(`  ${robustOk === ROBUST.length ? '✅' : '❌'} متانةُ المدخلات: ${robustOk}/${ROBUST.length}`);

// ── الثبات: تطبيقٌ ثانٍ لا يغيّر شيئًا ──
// لولا هذا لأمكن لقاعدةٍ أن تلتقط مخرَجًا عربيًّا فتضاعف الوصف.
const unstable = GOLDEN.map(([i]) => i).filter(i => A(A(i)) !== A(i));
if (unstable.length) {
	fail(`تطبيقٌ متكرّرٌ غيرُ ثابت: ${unstable.slice(0, 3).join(' | ')}`);
} else {
	console.log('  ✅ ثباتُ التطبيق المتكرّر A(A(x)) === A(x)');
}

// ── مطابقةُ الصفة: اختبارٌ توليديّ ──
// مسحُ كلّ المخرجات بحثًا عن «صفةٍ مذكّرةٍ بعد رأسٍ مؤنّث» تقريبٌ يكذب: في «مهلة القبول
// التلقائيّ» الصفةُ تصف «القبول» لا «المهلة»، والتركيبُ صحيح. فنولّد بدلًا من ذلك
// مدخلاتٍ **الصفةُ فيها رأسُ العبارة قطعًا** (صفةٌ + مركّبٌ معروفُ الجنس)، ونتحقّق
// أنّ اللاحقةَ تُطابِق. هكذا تُغطّى كلُّ صفةٍ تُضاف مستقبلًا بلا كتابةِ زوجٍ يدويّ.
const ADJ_FORMS = [
	['Smart', 'الذكيّ', 'الذكيّة'],
	['Custom', 'المخصّص', 'المخصّصة'],
	['Native', 'الأصليّ', 'الأصليّة'],
	['Inline', 'السطريّ', 'السطريّة'],
	['Silent', 'الصامت', 'الصامتة'],
	['Multiple', 'المتعدّد', 'المتعدّدة'],
	['Alternative', 'البديل', 'البديلة'],
	['Experimental', 'التجريبيّ', 'التجريبيّة'],
	['Default', 'الافتراضيّ', 'الافتراضيّة'],
];
// رؤوسٌ معروفةُ الجنس: (الإنجليزيّة، مؤنّثةٌ؟)
const HEADS = [['Font Family', true], ['Suggestions', true], ['Editor', false], ['Path', false]];
const mismatches = [];
for (const [adj, masc, fem] of ADJ_FORMS) {
	for (const [head, isFem] of HEADS) {
		const got = A(`${adj} ${head}`);
		if (got === `${adj} ${head}`) { continue; }   // لم يُحَلّ — مقبول
		const want = isFem ? fem : masc;
		const wrong = isFem ? masc : fem;
		if (got.endsWith(' ' + wrong)) {
			mismatches.push(`${adj} ${head} ⇐ ${got} (المتوقَّع ينتهي بـ${want})`);
		}
	}
}
if (mismatches.length) {
	fail(`مطابقةُ الصفة مكسورة:\n       ${mismatches.join('\n       ')}`);
} else {
	console.log(`  ✅ مطابقةُ الصفة في التأنيث (${ADJ_FORMS.length}×${HEADS.length} تركيبًا)`);
}

// ── الأداء: تُستدعى لكلّ إعدادٍ معروض ──
const sample = GOLDEN.map(([i]) => i);
const t0 = performance.now();
for (let i = 0; i < 2000; i++) { A(sample[i % sample.length]); }
const ms = performance.now() - t0;
if (ms > 1500) {
	fail(`بطيئة: ${ms.toFixed(0)}ms لـ2000 استدعاء`);
} else {
	console.log(`  ✅ الأداء: ${ms.toFixed(0)}ms لـ2000 استدعاء`);
}

// ── لا محرفَ غيرَ ASCII داخل تعبيرٍ نمطيّ ──
// بناءُ المنبع (build/lib/optimize.ts) يرفض غيرَ ASCII في المخرَج المصغَّر، وesbuild
// يهرّب السلاسلَ ولا يهرّب التعابيرَ النمطيّة. أسقط هذا بناءً كاملًا فعلًا.
const { readFileSync } = await import('node:fs');
const tsSource = readFileSync(SRC, 'utf8');
const badRegex = [...tsSource.matchAll(/\/\^[^\n]*?\/[gimsuy]*[,;)\]]/g)]
	.map(m => m[0])
	.filter(r => /[؀-ۿ]/.test(r));
if (badRegex.length) {
	fail(`محرفٌ عربيٌّ داخل تعبيرٍ نمطيّ (يُسقِط البناء): ${badRegex.join(' | ')}`);
} else {
	console.log('  ✅ لا عربيّةَ حرفيّةً داخل تعبيرٍ نمطيّ');
}

rmSync(built.dir, { recursive: true, force: true });
console.log(failed ? `─── ${failed} إخفاق ───` : '─── كلّ الفحوص نجحت ───');
process.exit(failed ? 1 : 0);
