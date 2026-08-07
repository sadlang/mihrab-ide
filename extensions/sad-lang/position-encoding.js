"use strict";

/**
 * ترميزُ مواضع LSP — قياسٌ لا تخمين. [SAD-08]
 *
 * ‏**الوقيعة.** مواصفةُ LSP تجعل `character` بوحدات **UTF-16**، والافتراضُ عند غياب
 * `positionEncoding` من ردّ `initialize` هو `utf-16` نصًّا. وخادمُ ص المشحون
 * (‏`serverInfo = {"name":"خادم لغة ص","version":"2.1.0"}`) **لا يعلن الحقلَ أصلًا**
 * ويرسل **بايتات**. وعلى العربيّة الفرقُ ليس تجميليًّا: الحرفُ بايتان.
 *
 * ‏**قياسٌ على الخادم المشحون** (‏`متغير مرحبا = "أهلا"` / `اطبع(مرحبا)`):
 *   • السطر ‎0‎: ‎20‎ وحدةَ UTF-16 · ‎34‎ بايتًا. و`definition` ردّ `11..21`.
 *     و‎21 > 20‎ ⇒ **مدًى يتجاوز نهايةَ السطر**، والصوابُ `6..11`.
 *   • السطر ‎1‎: ‎11‎ وحدة. و`hover` ردّ `0..8` لـ`اطبع` وطولُها ‎4‎ وحداتٍ / ‎8‎ بايتات.
 * أي أنّ «اذهب إلى التعريف» و«التحويم» **معطوبان في المشحون** على كلّ سطرٍ عربيّ.
 *
 * ‏**ولماذا لا نضرب في اثنين.** الحكمُ المكتوبُ في `extension.js` عند حارس التلوين
 * الدلاليّ يقول: «لا نحاول التصحيح تخمينًا … لأنّ التخمين يُنتج حدودًا أخرى خاطئة
 * بصمت». وهو قائمٌ ولا يُنقَض. والفرقُ أنّ ما هنا **ليس تخمينًا**: حمولةُ
 * `documentSymbol` تحمل `name` — نصَّ الرمز — فنقطّع السطرَ بالمدى المردود مرّةً
 * كوحدات UTF-16 ومرّةً كبايتات، ونقارن الناتجَ بالاسم. **الفرعُ الذي يطابق هو
 * الترميز.** فالقرارُ مقيسٌ من الحمولة لا مفترَضٌ من اللغة.
 *
 * وثلاثةُ أسيجةٍ تمنع هذا القياسَ من أن يصير تخمينًا بابًا خلفيًّا:
 *   ‏(١) **ملاحظةٌ لا تُميّز ⇒ لا قرار.** على سطرٍ لاتينيٍّ محضٍ تتطابق القراءتان،
 *       فالمطابقةُ لا تدلّ على شيء — ولو قبلناها لثبّتنا `utf-16` من عيّنةٍ فقيرة،
 *       وهو درسُ `richness-poor-sample` بعينه.
 *   ‏(٢) **موضعٌ داخل محرفٍ لا يُصلَح.** إزاحةُ بايتٍ لا تقع على حدّ نقطة ترميزٍ
 *       تُردّ `null` فنمتنع — ولا نقرّبها إلى أقرب حدّ.
 *   ‏(٣) **الامتناعُ هو الافتراض.** ما دام الترميزُ مجهولًا لا نمسّ مدًى واحدًا،
 *       فسلوكُنا يبقى ما كان عليه بالضبط.
 *
 * ولا يُستعمل هذا في التلوين الدلاليّ: قياسُ الخادم هناك **متناقضٌ داخل الرسالة
 * الواحدة** (‏`deltaStart` بوحدات UTF-16 و`length` بالبايتات معًا)، فترميمُه يقتضي
 * أن نقرّر أيُّ الحقلين بأيّ ترميزٍ — وذاك تخمينٌ لا قياس. يبقى الامتناعُ هناك،
 * ويُرفَع العيبُ إلى فريق اللغة.
 */

const ENC_UNKNOWN = "unknown";
const ENC_UTF16 = "utf-16";
const ENC_BYTES = "utf-8";

/**
 * إزاحةُ بايتٍ ⇐ إزاحةُ وحدات UTF-16 داخل سطر.
 *
 * تُمشى نقاطُ الترميز لا الوحدات، فلا يُقطَع زوجُ إبدال. وتُردّ `null` في حالتين
 * كلتاهما «لا نعرف» لا «صفر»: إزاحةٌ تقع **داخل** محرف، وإزاحةٌ تتجاوز السطر.
 *
 * @param {string} line نصُّ السطر
 * @param {number} byteOffset إزاحةٌ بالبايتات (UTF-8)
 * @returns {number|null} الإزاحةُ بوحدات UTF-16، أو `null` إن تعذّر التحويل يقينًا
 */
function byteToUtf16(line, byteOffset) {
  if (typeof line !== "string") return null;
  if (!Number.isInteger(byteOffset) || byteOffset < 0) return null;
  if (byteOffset === 0) return 0;
  let bytes = 0;
  let units = 0;
  for (const ch of line) {
    bytes += Buffer.byteLength(ch, "utf8");
    units += ch.length;
    if (bytes === byteOffset) return units;
    if (bytes > byteOffset) return null; // داخلَ محرف
  }
  return null; // تجاوزَ نهايةَ السطر
}

/**
 * هل يُقرَّر الترميزُ من رمزٍ واحدٍ يحمل اسمَه؟
 *
 * @param {string} name اسمُ الرمز كما ورد في الحمولة
 * @param {string} line نصُّ السطر الذي يقع فيه
 * @param {number} start بداية المدى كما وردت
 * @param {number} end نهايتُه كما وردت
 * @returns {string|null} `ENC_UTF16` أو `ENC_BYTES`، أو `null` حين لا تُميّز الملاحظة
 */
function decideFromSymbol(name, line, start, end) {
  if (typeof name !== "string" || name === "") return null;
  if (typeof line !== "string") return null;
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;

  const s2 = byteToUtf16(line, start);
  const e2 = byteToUtf16(line, end);

  // (١) القراءتان متطابقتان (بادئةٌ لاتينيّةٌ محضة) ⇒ الملاحظةُ لا تُميّز، فلا قرار.
  if (s2 === start && e2 === end) return null;

  if (line.slice(start, end) === name) return ENC_UTF16;
  if (s2 !== null && e2 !== null && line.slice(s2, e2) === name) return ENC_BYTES;
  return null; // لا فرعَ يطابق (اسمٌ مطبَّعٌ مثلًا) ⇒ نمتنع ونجرّب رمزًا آخر
}

/**
 * هل يُثبِت هذا المدى وحدَه أنّ الخادمَ يرسل بايتات؟
 *
 * البرهانُ من طرفٍ واحد: طولُ البايتات ≥ طولُ وحدات UTF-16 دائمًا، فمدًى يتجاوز
 * نهايةَ السطر بوحدات UTF-16 **لا يمكن** أن يكون بوحدات UTF-16. والعكسُ لا يُبرهَن
 * أبدًا بهذه الطريقة — ولذلك لا يوجد `rangeProvesUtf16`.
 *
 * @param {{start:{line:number,character:number},end:{line:number,character:number}}} range
 * @param {(line:number)=>(string|undefined)} lineOf
 * @returns {boolean}
 */
function rangeProvesBytes(range, lineOf) {
  if (!range || !range.start || !range.end) return false;
  for (const p of [range.start, range.end]) {
    const line = lineOf(p.line);
    if (typeof line !== "string") return false;
    if (p.character > line.length && byteToUtf16(line, p.character) !== null) return true;
  }
  return false;
}

/**
 * يرمّم مدًى بالبايتات إلى وحدات UTF-16، أو يمتنع.
 *
 * @returns {object|null} المدى المرمَّم، أو `null` إن تعذّر ترميمُ طرفٍ منه يقينًا
 */
function repairByteRange(range, lineOf) {
  if (!range || !range.start || !range.end) return null;
  const out = { start: null, end: null };
  for (const key of ["start", "end"]) {
    const p = range[key];
    const line = lineOf(p.line);
    if (typeof line !== "string") return null;
    const ch = byteToUtf16(line, p.character);
    if (ch === null) return null;
    out[key] = { line: p.line, character: ch };
  }
  return out;
}

/**
 * عرّافُ الترميز: يتعلّم مرّةً ويثبت للجلسة.
 *
 * القرارُ **أحاديُّ الاتّجاه**: ما إن يُقرَّر لا يُراجَع في الجلسة نفسِها. خادمٌ يبدّل
 * ترميزَه بين ردَّين معطوبٌ عطبًا آخر، وملاحقتُه رقعةً تُخفيه.
 */
/**
 * ‏**مفتاحُ الترميم** — وهو موضعُ المُصاب المزروع (`mutants.json`). إطفاؤه يعيد السلوكَ
 * إلى ما كان عليه في المشحون: مديات بالبايتات تُمرَّر كما وردت، فيقفز «اذهب إلى
 * التعريف» إلى ما بعد نهاية السطر. حارسٌ بلا هذا المُصاب يقيس صياغتَنا لا الانزياح.
 */
const REPAIR_MEASURED_BYTE_RANGES = true;

function createEncodingOracle() {
  let encoding = ENC_UNKNOWN;

  return {
    /** @returns {string} `unknown` | `utf-16` | `utf-8` */
    encoding() {
      return encoding;
    },

    /** يتعلّم من حمولة `documentSymbol` (المصدرُ الوحيدُ الذي يحمل نصَّ الرمز). */
    learnFromSymbols(symbols, lineOf) {
      if (encoding !== ENC_UNKNOWN || !Array.isArray(symbols)) return encoding;
      const walk = (list) => {
        for (const s of list) {
          if (encoding !== ENC_UNKNOWN) return;
          if (!s || typeof s !== "object") continue;
          const r = s.selectionRange || s.range || (s.location && s.location.range);
          if (r && r.start && r.end && r.start.line === r.end.line) {
            const line = lineOf(r.start.line);
            if (typeof line === "string") {
              const verdict = decideFromSymbol(s.name, line, r.start.character, r.end.character);
              if (verdict) { encoding = verdict; return; }
            }
          }
          if (Array.isArray(s.children)) walk(s.children);
        }
      };
      walk(symbols);
      return encoding;
    },

    /** يتعلّم من مدًى يتجاوز نهايةَ سطره — برهانٌ من طرفٍ واحد. */
    learnFromRange(range, lineOf) {
      if (encoding === ENC_UNKNOWN && rangeProvesBytes(range, lineOf)) encoding = ENC_BYTES;
      return encoding;
    },

    /**
     * يرمّم مدًى بحسب ما تعلّمه — والامتناعُ عن الترميم يُرجِع المدى **كما ورد**
     * لا `null`: ما دمنا لم نُثبِت عطبًا فسلوكُنا هو سلوكُ اليوم بالضبط.
     */
    repair(range, lineOf) {
      if (!range) return range;
      this.learnFromRange(range, lineOf);
      if (!REPAIR_MEASURED_BYTE_RANGES || encoding !== ENC_BYTES) return range;
      return repairByteRange(range, lineOf) || range;
    },
  };
}

/**
 * ‏**رمزٌ لا يُتنقَّل إليه ليس رمزًا.** [SAD-08]
 *
 * قياسٌ على الخادم المشحون: ملفٌّ فيه `مُعلِّم` (بالشدّة والكسرة) و`معلم` يُنتج في
 * `documentSymbol` رمزًا زائفًا اسمُه `معلم` على سطر `مُعلِّم` **بمدًى صفريّ العرض**.
 * وأصلُه أنّ الخادمَ **يطوي** الهمزةَ والتشكيل فيدمج الاسمين — وهو نقضُ القاعدة
 * المكتوبة عندنا في `mihrab-welcome/validate-name.js`: «مُعلِّم» و«معلم» اسمان
 * مختلفان وإن طابقا بعد الطيّ. فالطيُّ يتسرّب من الخادم إلى مخطَّط المستخدم.
 *
 * ولا نُصلِح الطيَّ عندنا: قرارُ «هذان اسمٌ واحد» دلاليٌّ اتّخذه الخادمُ قبل أن تصلنا
 * الحمولة، وتصفيتُه بمقارنةِ تطبيعٍ عكسيّةٍ تبني حكمًا دلاليًّا على تخمينٍ لفظيّ.
 * نُسقِط ما **يقيسه شكلُه**: مدًى صفريُّ العرض لا يُحدِّد نصًّا، فلا يُظهَر في
 * مخطَّطٍ غايتُه التنقّل. والباقي يُرفَع إلى فريق اللغة.
 */
const DROP_DEGENERATE_SYMBOLS = true;

/** يُسقِط الرموزَ ذاتَ المدى الصفريّ العرض (وذلك في الأبناء أيضًا). */
function dropDegenerateSymbols(list) {
  if (!Array.isArray(list)) return [];
  const keep = [];
  for (const s of list) {
    if (!s || typeof s !== "object") continue;
    const r = s.selectionRange || s.range || (s.location && s.location.range);
    const degenerate =
      !!r && r.start && r.end &&
      r.start.line === r.end.line && r.start.character === r.end.character;
    if (DROP_DEGENERATE_SYMBOLS && degenerate) continue;
    keep.push(
      Array.isArray(s.children) ? { ...s, children: dropDegenerateSymbols(s.children) } : s,
    );
  }
  return keep;
}

module.exports = {
  ENC_UNKNOWN,
  ENC_UTF16,
  ENC_BYTES,
  byteToUtf16,
  decideFromSymbol,
  rangeProvesBytes,
  repairByteRange,
  createEncodingOracle,
  dropDegenerateSymbols,
};
