// L3 حيّ [م-١٦]: اتّجاهُ لوحِ شرحِ الجولة — على الحزمة المشحونة لا على المصدر.
//
// **لماذا حيًّا، ولماذا لا تكفي الطبقاتُ الأدنى:**
//   • ‏L0 يقرأ نصَّ المرقِّع، وL1 يثبت أنّ المرساةَ تُطابِق، وL2 يعدّ الشظيّةَ في الحزمة.
//     ولا واحدةٌ منها تُثبت أنّ **مستندَ الـwebview الفعليّ** خرج بالاتّجاه — وهو
//     مستندٌ مستقلٌّ عن القشرة، يُبنى نصًّا ويُحمَّل عبر حدٍّ لا تعبره ورقةُ أنماطنا.
//   • والعطبُ الأصليّ نفسُه أفلت من كلّ حارسٍ ساكنٍ عندنا حتّى رآه مستخدمٌ بعينه.
//
// **المقاسُ ثلاثةُ ادّعاءاتٍ لا واحد** (كلٌّ منها يفشل وحدَه):
//   ١) `documentElement.dir` في مستند اللوح = `dir` مستندِ القشرة (اشتقاقٌ لا تثبيت).
//   ٢) الاتّجاهُ **المحسوب** على فقرةٍ حقيقيّةٍ فيه `rtl` — لا الوسمُ وحدَه.
//   ٣) الفجوةُ منطقيّةٌ: `padding-inline-end` على `<html>` ⇒ في RTL تقع يسارًا.
//      (بلا هذا يبقى نصفُ العطب ويخضرّ التأكيدان الأوّلان.)
//
// **العزل:** ملفُّ تعريفٍ مؤقّت — إعداداتُ المستخدم لا تُمسّ.
//
// الاستعمال: node tests/runtime/walkthrough_dir.live.mjs [--keep]
// خرج 0 = نجح · 1 = فشل تأكيد · 2 = خطأ تشغيليّ (لا حزمة/لا إقلاع/لا جولة).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CDP, sleep } from "./harness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const EXE = join(ROOT, ".upstream", "VSCode-win32-x64", "Mihrab.exe");
const PORT = 9335;
const KEEP = process.argv.includes("--keep");

const log = m => console.log(`▶ ${m}`);
let failed = 0;
const ok = (cond, name, detail = "") => {
  if (cond) console.log(`  ✅ ${name}`);
  else { failed++; console.log(`  ❌ ${name}${detail ? "\n       " + detail : ""}`); }
};

if (!existsSync(EXE)) { console.error(`❌ لا حزمة مشحونة: ${EXE}`); process.exit(2); }

const tmp = mkdtempSync(join(tmpdir(), "mihrab-m16-"));
const userData = join(tmp, "user-data");
mkdirSync(join(userData, "User"), { recursive: true });
writeFileSync(join(userData, "User", "settings.json"),
  JSON.stringify({ "window.restoreWindows": "none" }, null, 2), "utf8");

// نفسُ فخّ البيئة الموثَّق في launch.mjs: `ELECTRON_RUN_AS_NODE` الموروثُ من طرفيّةٍ
// مدمجة يجعل Electron يعمل بوضع Node ⇒ لا نافذةَ ولا منفذَ تنقيح، والعَرَضُ الظاهر
// «fetch failed» يبدو عطبَ حزمةٍ لا تلوّثَ بيئة.
function cleanEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  for (const k of Object.keys(env)) if (k.startsWith("VSCODE_")) delete env[k];
  return env;
}

let proc = null;
const kill = () => { try { proc && proc.kill(); } catch { /* */ } };

/**
 * حذفُ الملفّ المؤقّت **لا يجوز أن يُسقِط الاختبار**: على ويندوز يُبقي Electron مقابضَ
 * كاشٍ مفتوحةً لحظاتٍ بعد الإنهاء ⇒ `EBUSY` من `rimraf`. وقعنا فيه فعلًا: كلُّ التأكيدات
 * مرّت ثمّ خرج السكربتُ بمكدّسِ استثناءٍ يبدو فشلًا وليس منه.
 */
async function safeRm(p) {
  for (let i = 0; i < 5; i++) {
    try { rmSync(p, { recursive: true, force: true }); return; } catch { await sleep(1200); }
  }
  console.log(`  ⚠️ بقي ملفٌّ مؤقّتٌ لم يُحذَف (مقابضُ ويندوز): ${p}`);
}

async function attach(timeoutMs = 150000) {
  const t0 = Date.now();
  for (;;) {
    try { return await CDP.attach(PORT); } catch (e) {
      if (Date.now() - t0 > timeoutMs) throw new Error(`تعذّر الاتّصال بـCDP: ${e.message}`);
      await sleep(1500);
    }
  }
}

/**
 * يتّصل بهدفِ إطار الجولة. **هدفٌ مستقلٌّ لا `contentDocument`**: مستندُ الـwebview
 * على أصلٍ آخر (`vscode-webview:`)، فقراءتُه من صفحة القشرة تعيد `null` — وهذا هو
 * الحدُّ نفسُه الذي يمنع ورقةَ أنماطنا من الوصول، أي أنّ الاختبارَ يعبره كما يعبره
 * المستخدمُ بعينه لا كما نتمنّى.
 */
async function attachWebview(tries = 20) {
  for (let i = 0; i < tries; i++) {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const f = list.find(x => x.type === "iframe" && /^vscode-webview:/.test(x.url));
    if (f) {
      const cdp = new CDP(f.webSocketDebuggerUrl);
      await new Promise((res, rej) => { cdp.ws.onopen = res; cdp.ws.onerror = () => rej(new Error("WS فشل")); });
      cdp.ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.id && cdp._pend[m.id]) { cdp._pend[m.id](m); delete cdp._pend[m.id]; }
      };
      await cdp.cmd("Runtime.enable", {}, 30000);
      return cdp;
    }
    await sleep(1500);
  }
  return null;
}

/** يفتح جولةَ محراب. يعيد صحيحًا حين تُصيَّر قائمةُ الخطوات. */
async function openWalkthrough(cdp, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const state = await cdp.evaluate(`(() => {
      if (document.querySelector(".gettingStartedSlideDetails .step-list-container")) return "opened";
      const cats = [...document.querySelectorAll(".gettingStartedContainer button.getting-started-category")];
      const mine = cats.find(b => (b.textContent || "").includes("محراب"));
      if (mine) { mine.click(); return "clicked"; }
      return cats.length ? "no-mihrab" : "no-categories";
    })()`, 30000);
    if (state === "opened") return true;
    await sleep(1500);
  }
  return false;
}

/** يوسّع الخطوةَ رقم `n` (‏0-مبدوءة). الوسائطُ لا تُحمَّل إلّا للخطوة المُوسَّعة. */
const expandStep = (cdp, n) => cdp.evaluate(`(() => {
  const list = document.querySelector(".gettingStartedSlideDetails .step-list-container");
  if (!list) return 0;
  const steps = [...list.querySelectorAll(".getting-started-step")];
  if (!steps[${n}]) return 0;
  const hit = steps[${n}].querySelector("button, .codicon, h3") || steps[${n}];
  hit.click();
  return steps.length;
})()`, 30000);

try {
  log("إطلاق النسخة المشحونة بملفّ تعريفٍ معزول…");
  proc = spawn(EXE, [
    `--remote-debugging-port=${PORT}`, "--remote-allow-origins=*",
    `--user-data-dir=${userData}`, "--skip-release-notes", "--disable-updates",
    "--disable-workspace-trust", "--new-window",
  ], { detached: false, stdio: "ignore", env: cleanEnv() });

  const shell = await attach();
  await sleep(9000);   // تنشيطُ الامتدادات ثمّ تصيير صفحة الترحيب

  const hostDir = await shell.evaluate(`document.documentElement.getAttribute("dir")`, 30000);
  ok(hostDir === "rtl", "مستندُ القشرة المضيفة rtl (شرطُ صحّة بقيّة التأكيدات)", `dir=${hostDir}`);

  log("فتحُ جولة محراب وتوسيعُ خطوةٍ لتحميل لوح الشرح…");
  const opened = await openWalkthrough(shell);
  if (!opened) throw new Error("تعذّر فتحُ جولة محراب — لا فئةَ تحمل «محراب» في صفحة الترحيب.");

  // القراءةُ من داخل الإطار الخارجيّ: مستندُ المحتوى إطارٌ متداخلٌ فيه (‏active-frame).
  // **حلقةٌ لا محاولةٌ واحدة**: تحميلُ الوسيط غيرُ متزامنٍ (قراءةُ ملفٍّ ثمّ تصييرُ markdown
  // ثمّ إنشاءُ الإطار)، ولا كلَّ خطوةٍ تحمل وسيطًا. وبلاغٌ كاذبٌ من سباقٍ أسوأُ من الفشل.
  const PANE_PROBE = `(() => {
    const f = document.querySelector("iframe");
    const d = f && f.contentDocument;
    if (!d || !d.documentElement) return { ready: false };
    const html = d.documentElement;
    const cs = getComputedStyle(html);
    const p = [...d.querySelectorAll("p, li, td")]
      .find(e => /[\\u0621-\\u064A]/.test(e.textContent || ""));
    // الجاهزيّةُ وجودُ المحتوى لا وجودُ المستند: إطارُ الـwebview يُنشأ فارغًا
    // (‏about:blank) قبل أن يُحقَن فيه القالب، ومستندُ الفراغ يستوفي كلَّ شرطٍ بنيويّ
    // وينقصه الشاهد — فيخرج التأكيدُ أحمرَ على سباقٍ لا على عطب. قِسناه: أوّلُ تشغيلةٍ
    // أبلغت اتّجاهًا معدومًا وحشوةً صفرًا من مستندٍ فارغ، والرقعةُ في الحزمة سليمة.
    // (‏لا شَولةً مائلةً في هذا التعليق: الكتلةُ كلُّها داخل قالبٍ نصّيّ.)
    if (!p) return { ready: false };
    return {
      ready: true,
      dir: html.getAttribute("dir"),
      lang: html.getAttribute("lang"),
      computed: cs.direction,
      padStart: cs.paddingInlineStart,
      padEnd: cs.paddingInlineEnd,
      padLeft: cs.paddingLeft,
      padRight: cs.paddingRight,
      sample: p ? (p.textContent || "").trim().slice(0, 40) : null,
      sampleDir: p ? getComputedStyle(p).direction : null,
    };
  })()`;

  let pane = null, r = null;
  outer:
  for (let step = 0; step < 4; step++) {
    const count = await expandStep(shell, step);
    if (!count) break;
    for (let i = 0; i < 8; i++) {
      await sleep(1500);
      if (!pane) pane = await attachWebview(1);
      if (!pane) continue;
      try { r = await pane.evaluate(PANE_PROBE, 30000); } catch { r = null; }
      if (r && r.ready) break outer;
    }
    // خطوةٌ بلا وسيطٍ أو أبطأُ من صبرنا: أغلِق الاتّصالَ وجرّب التالية.
    if (pane) { pane.close(); pane = null; }
  }

  if (!r || !r.ready) throw new Error("مستندُ لوح الشرح غيرُ جاهز داخل الإطار (لا خطوةَ حمّلت وسيطًا).");

  ok(r.dir === hostDir, "اتّجاهُ اللوح مشتقٌّ من مضيفه لا مثبَّت", `اللوح=${r.dir} · المضيف=${hostDir}`);
  ok(r.computed === "rtl", "الاتّجاهُ المحسوب على مستند اللوح rtl", `computed=${r.computed}`);
  ok(r.sampleDir === "rtl", "الفقرةُ العربيّةُ نفسُها تُصيَّر rtl",
    `«${r.sample}» ⇐ ${r.sampleDir}`);
  // الحشوةُ المنطقيّة: في RTL يقع `inline-end` **يسارًا**. مقارنةُ الجانبين الفيزيائيّين
  // أصدقُ من قراءة اسم الخاصّيّة — فهي تشهد بأين وقعت الفجوةُ فعلًا لا بما كُتِب.
  ok(parseFloat(r.padLeft) > 0 && parseFloat(r.padRight) === 0,
    "فجوةُ الـ32px وقعت في الجهة التابعة (يسارًا في RTL) لا الفيزيائيّة",
    `يسار=${r.padLeft} · يمين=${r.padRight} · inline-end=${r.padEnd}`);

  pane.close();
  if (!KEEP) { shell.close(); kill(); }
} catch (e) {
  console.error(`❌ خطأ تشغيليّ: ${e.message}`);
  kill();
  if (!KEEP) await safeRm(tmp);
  process.exit(2);
}

await sleep(1000);
if (!KEEP) await safeRm(tmp);
console.log(failed ? `─── ${failed} تأكيدًا فشل ───` : "─── كلّ تأكيدات م-١٦ الحيّة نجحت ───");
process.exit(failed ? 1 : 0);
