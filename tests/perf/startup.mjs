// [PF-01] زمنُ الإقلاع — **قياسٌ لا حارس**.
//
// لماذا ليس حارسًا: الزمنُ رهنُ العتاد والحِمل. عتبةٌ مطلقةٌ تُخفق دائمًا على عدّاءٍ بطيءٍ
// ولا تُخفق أبدًا على جهازِ مطوّرٍ سريع — وحارسٌ متذبذبٌ يُعطَّل، والمعطَّلُ **أسوأُ من
// الغائب** لأنّه يبدو موجودًا. فهذا الملفُّ يُبلِّغ الرقمَ المتّصلَ بلا عتبةٍ مخترَعة،
// ولا يُفشِل إلّا على **وقائعَ قاطعةٍ** لا رأيَ فيها:
//   (١) لم تُنتج أيُّ تشغيلةٍ قياسًا،
//   (٢) القياسُ جاء من **ثنائيٍّ غير محراب** (تلوّثُ بيئةٍ يوجّه الطفلَ إلى نسخةِ المضيف)،
//   (٣) العلامةُ المطلوبةُ غائبةٌ من الخرج (⇐ اسمُها خطأٌ، والرقمُ الذي يُقرأ ليس المطلوب).
// وله سابقةٌ في المستودع: `tests/dx/completion_rank.mjs` مُعلَنٌ «قياسٌ لا حارس»، بلا عتبة،
// ولا يُفشِل إلّا على «لا تظهر إطلاقًا».
//
// ── لماذا لا يُقاس بـ`launch.mjs` ────────────────────────────────────────────────
// `waitForWorkbench` هناك يستفسر **كلَّ 1500 مللي** ويرجع حين **يوجد** هدفُ CDP لا حين
// يُرسَم، ويليه استقرارٌ ثابتٌ 4000 مللي. أي أنّ **كمَّ القياس أكبرُ من الأثرِ المُقاس**
// ونصفَه ثابت — رقمٌ من هذا الطريق لا يمكن أن يتحرّك بما يكفي ليعبر عتبةً، أي **لا يمكن
// أن يفشل**. فنستعمل آليّةَ VS Code نفسِها لقياس إقلاعها في CI:
//     --prof-append-timers --prof-duration-markers --prof-duration-markers-file
// (‏`contrib/performance/electron-browser/startupTimings.ts:68`) — تبدأ من `code/timeOrigin`
// الحقيقيّ للعمليّة لا من لحظةِ ارتباطنا، و**تُنهي التطبيقَ ذاتيًّا** (`_nativeHostService.exit(0)`)
// فلا حاجةَ لـtaskkill.
//
// ── العلامةُ الدالّةُ على «المنضدةُ جاهزة» ───────────────────────────────────────
// `code/didStartWorkbench` (‏`workbench/browser/workbench.ts:489`). قِيست فوُجدت متزامنةً
// تمامًا مع `code/didRestoreEditors` و`code/LifecyclePhase/Restored`.
// و**لا** تُستعمل `code/LifecyclePhase/Eventually`: قِيست عند 3647 مللي مقابل 1146 للجاهزيّة —
// تتأخّر ٢٫٥ث لأنّها عملٌ خلفيٌّ مؤجَّلٌ **عمدًا**، فقياسُها يقيس التأجيلَ لا الإقلاع.
//
// ── فخُّ التحليل: الأعمدةُ ليست ثابتة ────────────────────────────────────────────
// في المنبع (`startupTimings.ts:110`) لا يُكتب زوجُ العلامةِ إلّا `if (duration)`. فعلامةٌ
// اسمُها خطأٌ **لا تترك عمودًا فارغًا — تختفي**، وتنزلق بقيّةُ الأعمدة. فمُحلِّلٌ موضعيٌّ
// يقرأ رقمًا حقيقيًّا في المكان الخطأ ويُبلِّغ نجاحًا. لذلك يُقرأ الملفُّ **أزواجًا
// (اسم، قيمة)** ويُؤكَّد حضورُ كلِّ علامةٍ طُلبت بالاسم.
//
// ── الإحماء: مقيسٌ لا مُقدَّر ─────────────────────────────────────────────────────
// أربعُ تشغيلاتٍ متتالية بملفِّ مستخدمٍ حُذف قبل الأولى: 2037 · 1515 · 1269 · 1240 مللي.
// الباردةُ +64% فوق المستقرّ و**الثانيةُ ما تزال +22%** ⇒ تُهمَل **اثنتان** لا واحدة.
//
// ── الوسيطُ لا المتوسّط ──────────────────────────────────────────────────────────
// التوزيعُ ملتوٍ يمينًا بأرضيّةٍ صلبة: قفزةُ جامعِ قمامةٍ أو مسحةُ مضادِّ فيروساتٍ واحدةٌ
// تُزحزح المتوسّطَ عشراتِ البالمئة. المتوسّطُ يقيس الذيل، والوسيطُ يقيس التشغيلةَ النموذجيّة.
// و`perfBaseline` (معيارُ سرعةِ الآلة في عمود المنبع) **يُسجَّل ولا يُطبَّع به**: قِيس
// 30·25·27·46 مللي بين تشغيلاتٍ متطابقة — ±80%، فقسمةٌ عليه تُدخِل ضجيجًا أكثرَ ممّا تُزيل.
//
// ── ما لا يقيسه هذا الملفّ ───────────────────────────────────────────────────────
// **لا يصلح لبند IN-02/أ.** `editor.wrappingStrategy: advanced` يبدّل حاسبَ كسرِ السطر
// ⇒ الكلفةُ في **تخطيط المحرّر** لا في بناء القشرة. ميزانيّةُ إقلاعٍ ستبقى خضراءَ والمحرّرُ
// صار أبطأَ أضعافًا على عيّنةٍ طويلةِ الأسطر. لذلك بندُ الالتفاف له مِجَسُّه المستقلّ.
//
// الاستعمال:
//   node tests/perf/startup.mjs                  # ٧ تشغيلات، تُهمَل الأوّليان
//   node tests/perf/startup.mjs --runs 5
//   node tests/perf/startup.mjs --label before   # احفظ في tests/perf/.runs/ (غيرُ متتبَّع)
//   node tests/perf/startup.mjs --compare before after
//
// الخروج: 0 قِيس (بلا حكم) · 1 واقعةٌ قاطعة · 2 لا بناء.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const DIST = join(ROOT, ".upstream", "VSCode-win32-x64");
const EXE = join(DIST, "Mihrab.exe");
const RUNS_DIR = join(HERE, ".runs");

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const TOTAL_RUNS = parseInt(val("--runs", "7"), 10);
const WARMUP = 2;                    // مقيسٌ أعلاه: الأولى +64%، الثانية +22%
const RUN_TIMEOUT_MS = 90_000;       // المنبعُ ينتظر `timeout(15000)` ثابتةً قبل الكتابة

// العلاماتُ المطلوبة. `ellapsed` = code/timeOrigin → code/didStartWorkbench (المقياسُ الرسميّ).
const MARKERS = ["ellapsed", "code/willStartWorkbench-code/didStartWorkbench"];

const log = m => console.log(m);
const median = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil(p / 100 * s.length) - 1)]; };

// ── المقارنة (لا تحتاج بناءً) ─────────────────────────────────────────────────────
if (has("--compare")) {
  const i = argv.indexOf("--compare");
  const [a, b] = [argv[i + 1], argv[i + 2]];
  const load = n => { const p = join(RUNS_DIR, `${n}.json`); if (!existsSync(p)) { console.error(`❌ لا تشغيلةَ باسم «${n}» في ${RUNS_DIR}`); process.exit(1); } return JSON.parse(readFileSync(p, "utf8")); };
  const A = load(a), B = load(b);
  log(`╔══ [PF-01] مقارنةُ إقلاع: ${a} ⇄ ${b} ══╗\n`);
  if (A.host !== B.host) log(`⚠️ التشغيلتان من جهازين مختلفين (${A.host} · ${B.host}) — المقارنةُ لاغية.`);
  for (const m of MARKERS) {
    const x = A.markers[m], y = B.markers[m];
    if (!x?.length || !y?.length) { log(`  ${m}: علامةٌ غائبةٌ في إحدى التشغيلتين`); continue; }
    const mx = median(x), my = median(y);
    log(`  ${m}\n      ${a}: وسيط ${mx} مللي (تشتّت ${Math.max(...x) - Math.min(...x)})`
      + `\n      ${b}: وسيط ${my} مللي (تشتّت ${Math.max(...y) - Math.min(...y)})`
      + `\n      النسبة: ×${(my / mx).toFixed(3)}`);
    // بوّابةُ ثقةٍ: أثرٌ أصغرُ من ضجيجِ أيٍّ من الذراعين ليس أثرًا.
    const noise = Math.max(Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y));
    if (Math.abs(my - mx) < noise)
      log(`      ⚠️ الفرقُ (${Math.abs(my - mx).toFixed(0)} مللي) **دون** تشتّتِ القياس (${noise}) — لا يُبنى عليه قرار.`);
  }
  process.exit(0);
}

// ── القياس ────────────────────────────────────────────────────────────────────────
log("╔══ [PF-01] زمنُ الإقلاع (قياسٌ لا حارس) ══╗");
if (!existsSync(EXE)) {
  log("mode=skipped — لا مخرَجَ بناءٍ في .upstream/VSCode-win32-x64");
  log("   (‏هذا ليس نجاحًا: لم تُقَس تشغيلةٌ واحدة.)");
  process.exit(has("--require-measured") ? 2 : 0);
}
log("mode=measured");

const work = join(tmpdir(), "mihrab-perf-" + process.pid);
const userData = join(work, "user-data");
const extDir = join(work, "extensions");
const emptyFolder = join(work, "folder");
const timersFile = join(work, "timers.txt");
const markersFile = join(work, "markers.txt");
rmSync(work, { recursive: true, force: true });
for (const d of [userData, extDir, emptyFolder]) mkdirSync(d, { recursive: true });

/**
 * البيئةُ **تُنظَّف** لا تُورَث. حين يعمل هذا المِجَسُّ داخل مضيف امتدادات VS Code تكون
 * البيئةُ موروثةً من Electron آخر: `ELECTRON_RUN_AS_NODE=1` يجعل الطفلَ يعمل بوضع Node
 * فينهار، و`VSCODE_CODE_CACHE_PATH` يوجّهه إلى **ذاكرةِ نسخةٍ أخرى** فيُقاس إقلاعُ غيرِنا.
 * (نفسُ العلاج الموثَّق في `tests/runtime/launch.mjs:47`.)
 */
function cleanEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  for (const k of Object.keys(env)) if (k.startsWith("VSCODE_")) delete env[k];
  return env;
}

/**
 * وسائطُ العزل — كلُّ واحدٍ منها يزيل متغيّرًا يُفسِد الرقم، لا تجميلًا:
 *  • `--user-data-dir` معزول ⇒ لا استعادةَ نوافذَ ولا تبويبات (وإلّا قِيس فتحُ ملفّاتك).
 *  • `--disable-extensions` ⇒ لا امتدادَ طرفٍ ثالثٍ في نافذة القياس.
 *  • `--disable-workspace-trust` **لازم**: بدونه تظهر مشروطيّةُ الثقة فتحرّف `_isStandardStartup`.
 *  • `--disable-updates` **لازم**: `_isStandardStartup` يستدعي `isLatestVersion()` — نداءُ
 *    شبكةٍ **داخل نافذة القياس**، وزمنُه زمنُ شبكتك لا زمنُ محراب.
 *  • مجلّدٌ فارغٌ ثابت (لا ملفّ) ⇒ عملٌ مُستعادٌ ثابتٌ بين التشغيلات.
 */
function runArgs() {
  return [
    emptyFolder,
    `--user-data-dir=${userData}`, `--extensions-dir=${extDir}`,
    "--disable-extensions", "--disable-workspace-trust",
    "--skip-release-notes", "--skip-welcome", "--disable-updates",
    `--prof-append-timers=${timersFile}`,
    ...MARKERS.map(m => `--prof-duration-markers=${m}`),
    `--prof-duration-markers-file=${markersFile}`,
  ];
}

function onceRun() {
  return new Promise(res => {
    const p = spawn(EXE, runArgs(), { env: cleanEnv(), stdio: "ignore", windowsHide: true });
    const t = setTimeout(() => { try { p.kill(); } catch { /* */ } res("timeout"); }, RUN_TIMEOUT_MS);
    p.on("exit", () => { clearTimeout(t); res("exit"); });
    p.on("error", e => { clearTimeout(t); res("error:" + e.message); });
  });
}

/** يقرأ آخرَ سطرٍ أُضيف. الأزواجُ **اسمًا فقيمة** — انظر فخَّ الأعمدة في الرأس. */
function readLast(file) {
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, "utf8").split("\n").filter(l => l.trim());
  return lines.length ? lines[lines.length - 1].split("\t") : null;
}

const samples = Object.fromEntries(MARKERS.map(m => [m, []]));
const meta = [];
log(`\n${TOTAL_RUNS} تشغيلات، تُهمَل الأوّليان (إحماءٌ مقيس). كلُّ تشغيلةٍ ≈٢٧ث — المنبعُ ينتظر 15ث ثابتةً قبل الكتابة.\n`);

for (let i = 1; i <= TOTAL_RUNS; i++) {
  const before = existsSync(markersFile) ? readFileSync(markersFile, "utf8").split("\n").filter(l => l.trim()).length : 0;
  process.stdout.write(`  تشغيلة ${i}/${TOTAL_RUNS}${i <= WARMUP ? " (إحماء — تُهمَل)" : ""} … `);
  const how = await onceRun();
  const after = existsSync(markersFile) ? readFileSync(markersFile, "utf8").split("\n").filter(l => l.trim()).length : 0;

  // شاهدُ تفعيلٍ موجب: التشغيلةُ **أضافت سطرًا**. بلا هذا يكون «لا انحدار» مقيسًا على
  // ملفٍّ لم يُكتَب فيه شيءٌ منذ تشغيلةٍ سابقة.
  if (after !== before + 1) { console.log(`⚠️ لا قياس (${how}) — لم يُضَف سطر`); continue; }

  const pairs = readLast(markersFile) || [];
  const got = {};
  for (let k = 0; k + 1 < pairs.length; k += 2) got[pairs[k]] = Number(pairs[k + 1]);

  const timers = readLast(timersFile) || [];
  const [ell, nameShort, commit, , standard, baseline] = timers;

  // واقعةٌ قاطعة (٢): قِسنا ثنائيًّا ليس ثنائيَّنا.
  //
  // **وغيابُ العمود ليس براءة.** رأسُ هذا الملفّ يشرح فخَّ الأعمدة المنزلقة ثمّ يُطبّق
  // علاجَه (الأزواجُ اسمًا فقيمة) على ملفِّ العلامات وحدَه؛ وهذا السطرُ موضعيٌّ مصمت.
  // فلو توقّف المنبعُ عن كتابة `--prof-append-timers` أو أُعيدت تسميةُ الراية لصار
  // `timers` فارغًا و`nameShort` غيرَ معرَّف، فيُتخطّى الشرطُ بصمت: **الواقعةُ القاطعةُ
  // لا تستطيع أن تُطلَق**، ويُبلَّغ الرقمُ من ملفِّ العلامات كأنّ الحارسَ عمل. فيُقال ذلك.
  if (!timers.length) {
    console.error(`\n❌ لم يُكتَب سطرُ المؤقّتات — تعذّر التحقّق من أنّ المقيسَ هو محرابٌ لا ثنائيٌّ آخر.`
      + `\n   القياسُ بلا هذا الحارس لا يُقرأ (راجع --prof-append-timers في المنبع).`);
    process.exit(1);
  }
  if (nameShort !== "Mihrab") {
    console.error(`\n❌ القياسُ جاء من «${nameShort ?? "(عمودٌ غائب)"}» لا من محراب`
      + ` — إمّا بيئةٌ ملوّثةٌ توجّه الطفلَ إلى نسخةٍ أخرى، وإمّا انزاحت أعمدةُ المنبع.`
      + `\n   السطرُ كما قُرئ: ${JSON.stringify(timers.slice(0, 6))}`);
    process.exit(1);
  }
  meta.push({ nameShort, commit, standard, baseline, ellapsed: Number(ell) });

  const shown = MARKERS.map(m => `${m.split("-").pop().split("/").pop()}=${got[m] ?? "—"}`).join("  ");
  console.log(shown);
  if (i > WARMUP) for (const m of MARKERS) if (Number.isFinite(got[m])) samples[m].push(got[m]);
}

// ── الحكم على القياس نفسِه ───────────────────────────────────────────────────────
log("");
if (!samples[MARKERS[0]].length) { console.error("❌ لم تُنتج أيُّ تشغيلةٍ قياسًا — راجع أعلاه."); process.exit(1); }

let rc = 0;
for (const m of MARKERS) {
  const s = samples[m];
  // واقعةٌ قاطعة (٣): علامةٌ طُلبت ولم تظهر ⇒ اسمُها خطأ. صمتُها ليس صفرًا.
  if (!s.length) { console.error(`❌ العلامةُ «${m}» غائبةٌ من خرج كلِّ التشغيلات — الاسمُ خطأ، لا القيمةُ صفر.`); rc = 1; continue; }
  const med = median(s), spread = Math.max(...s) - Math.min(...s);
  const ratio = spread / med;
  log(`  ${m}`);
  log(`      وسيط ${med} مللي · p90 ${pct(s, 90)} · تشتّت ${spread} مللي (${(ratio * 100).toFixed(0)}% من الوسيط) · ${s.length} عيّنة`);
  log(`      العيّنات: ${s.join(", ")}`);
  // ليست فشلًا في المنتج — بل إعلانُ أنّ **هذا القياس** لا يُبنى عليه قرار.
  if (ratio > 0.25) log(`      ⚠️ قياسٌ غيرُ موثوق: التشتّتُ يتجاوز رُبعَ الوسيط. أيُّ أثرٍ أصغرُ من ${spread} مللي غيرُ قابلٍ للتمييز هنا.`);
}

const base = meta.map(m => m.baseline).filter(Boolean);
log(`\n  perfBaseline (معيارُ سرعةِ الآلة): ${base.join(" ")}  — **يُسجَّل ولا يُطبَّع به** (قِيس ±80% بين تشغيلاتٍ متطابقة)`);
const nonStandard = meta.filter(m => m.standard && !m.standard.startsWith("standard_start"));
if (nonStandard.length) log(`  وسمُ الإقلاع: ${nonStandard[0].standard}\n      (وسمٌ لا رفض — المجلّدُ فارغٌ عمدًا فلا محرّرَ نصّيًّا نشطًا. القياسُ يُكتَب كاملًا؛ المهمُّ الثباتُ على وضعٍ واحد.)`);

if (has("--label")) {
  mkdirSync(RUNS_DIR, { recursive: true });
  const name = val("--label", "run");
  writeFileSync(join(RUNS_DIR, `${name}.json`), JSON.stringify({
    label: name, host: process.env.COMPUTERNAME || "?", at: new Date().toISOString(),
    runs: TOTAL_RUNS, warmup: WARMUP, markers: samples, meta,
  }, null, 2) + "\n", "utf8");
  log(`\n  حُفظت باسم «${name}» في tests/perf/.runs/ (غيرُ متتبَّعٍ في git — المقارنةُ صالحةٌ على الجهاز نفسِه وحدَه)`);
}

rmSync(work, { recursive: true, force: true });
log(rc === 0 ? "\n╚══ ✅ قِيس (بلا حكمٍ على الرقم — لا عتبةَ مخترَعة) ══╝" : "\n╚══ ❌ القياسُ نفسُه غيرُ سليم ══╝");
process.exit(rc);
