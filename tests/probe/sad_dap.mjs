#!/usr/bin/env node
// @ts-check
/**
 * ‏**قياسٌ لا حارس** — فرضيّةُ الإغلاق السلبيّ [DAP-01].
 *
 * يخرج **بـ0 دائمًا** ولا يُدرَج في `tests/run.sh`. وهذا مقصودٌ لا تهاون:
 *
 *   ‏(أ) **الشيءُ المقيسُ ليس شيفرتَنا** بل ثنائيٌّ خارجيٌّ في مسارٍ مطلق
 *       (`C:\Program Files\SadLang\bin`) غيرِ مثبَّتِ الإصدار — والتثبيتةُ الواحدة
 *       تحمل إصدارَين متضاربَين: `sad.exe` يقول ‎1.0.0‎ و`sad-lsp.exe` يردّ ‎2.1.0‎.
 *   ‏(ب) و**حارسٌ يؤكّد أنّ الشيءَ لا يعمل يصير أحمرَ كاذبًا يومَ يُصلَح المنبع** —
 *       فيُفشِل بناءَنا على خبرٍ سارّ، ثمّ يُعطَّل. والقاعدةُ مكتوبةٌ في `run.sh`:
 *       «حارسٌ متذبذبٌ يُعطَّل، والمعطَّلُ أسوأُ من الغائب».
 *
 * فالقالبُ هنا هو قالبُ `startup.mjs` و`completion_rank.mjs`: **يطبع الرقمَ ولا يحكم**.
 * والحكمُ نفسُه يحرسه `lint_patchers.py` (لا مساهمةَ `debuggers` ما دام الحكمُ قائمًا)،
 * وهو فحصٌ **لا يستطيع أن يحمرَّ كذبًا** ولا يحتاج هذا الثنائيَّ أصلًا.
 *
 * التشغيل: `node tests/probe/sad_dap.mjs`
 */

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

const SAD = process.env.SAD_EXE || "C:/Program Files/SadLang/bin/sad.exe";

/** الوقائعُ الأربعُ التي يقوم عليها الحكم — مثبَّتةٌ بقيمها المقيسة يوم كُتب. */
const PINNED = {
  dap_framed_content_length: false,
  dap_answers_while_running: false,
  dap_emits_stopped: false,
  dap_program_output_out_of_band: false,
};

const say = (s) => process.stdout.write(s + "\n");

if (!existsSync(SAD)) {
  say("‏⏭️ [DAP-01] لا سلسلةَ أدوات ص على هذا الجهاز — لم يُقَس شيء.");
  say("   وهذا **إعلانُ فجوةٍ لا نجاح**: القياسُ لم يجرِ، فلا يُستشهَد بصمته.");
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "dap-probe-"));
const prog = join(dir, "مِجَسّ.ص");
writeFileSync(
  prog,
  "دالة رئيسية()\n    متغير المجموع = 40 + 2\n    اطبع(\"قبل\")\n    اطبع(المجموع)\n    اطبع(\"بعد\")\nنهاية\n",
  "utf8",
);

const facts = { ...PINNED };
const p = spawn(SAD, ["--debug-server", prog], { stdio: ["pipe", "pipe", "pipe"] });
let out = "";
p.stdout.on("data", (d) => { out += d.toString("utf8"); });

const send = (o) => p.stdin.write(JSON.stringify(o) + "\n");
send({ seq: 1, type: "request", command: "initialize", arguments: { adapterID: "sad", linesStartAt1: true } });
send({ seq: 2, type: "request", command: "setBreakpoints", arguments: { source: { path: prog }, breakpoints: [{ line: 4 }], lines: [4] } });
send({ seq: 3, type: "request", command: "configurationDone" });

const done = () => {
  facts.dap_framed_content_length = /Content-Length:\s*\d+/.test(out);
  facts.dap_answers_while_running = /"type"\s*:\s*"response"/.test(out);
  facts.dap_emits_stopped = /"event"\s*:\s*"stopped"/.test(out);
  // خرجُ البرنامج «خارجَ الإطار» = ظهورُ نصِّه خامًا لا داخلَ حدث `output`.
  const raw = out.replace(/\{"type"[^\n]*\n?/g, "");
  facts.dap_program_output_out_of_band = !raw.includes("قبل");

  const bin = createHash("sha256").update(readFileSync(SAD)).digest("hex").slice(0, 16);
  say("╔══ [DAP-01] قياسُ خادم التصحيح — قياسٌ لا حارس ══╗");
  say(`  الثنائيّ: ${SAD}`);
  say(`  بصمتُه (sha256/16): ${bin}`);
  say("");
  let drift = 0;
  for (const k of Object.keys(PINNED)) {
    const same = facts[k] === PINNED[k];
    if (!same) drift++;
    say(`  ${same ? "  " : "🔔"} ${k}: ${facts[k]}   (المسنون: ${PINNED[k]})`);
  }
  say("");
  if (drift === 0) {
    say("  الفرضيّةُ قائمة: المُهايئُ يجيب ويُصادِق ولا يقف. الحكمُ DAP-01 على حاله.");
  } else {
    say(`  🔔 ${drift} واقعةً انحرفت عن المسنون — **أعِد قراءة docs/dap-01-تنقيح-ص.md**.`);
    say("     هذه رسالةُ «انتظرْ سقطت» لا رسالةُ فشل، ولذلك لا يُرجِع هذا المِجَسُّ رمزًا غيرَ صفر.");
  }
  say("╚════════════════════════════════════════════════╝");
  try { p.kill(); } catch { /* لا شيء */ }
  process.exit(0);
};

p.on("exit", () => setTimeout(done, 150));
setTimeout(done, 6000);
