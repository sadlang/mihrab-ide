# -*- coding: utf-8 -*-
"""قياسُ حدِّ وضوحِ الحرف العربيّ في Kawkab Mono — ‏[VA-04].

## السؤال الذي يجيب عنه
`editor.fontSize` تُرِك بلا ضبطٍ في محراب لأنّنا **لم نقِس**، والقرارُ المسجَّل في
[قرارات الطباعة §٤] قال ذلك صراحةً: «أيُّ رقمٍ قبل القياس رقمٌ بلا معنى». وهذا الملفّ
يُجري القياسَ الذي كان ناقصًا — لا ليستبدل بجلسة القراءة البشريّة، بل **ليضع أرضيّةً
حسابيّةً دونها لا معنى للجلسة أصلًا**.

## ولماذا **النقطة** هي المقياس
النقطةُ (‏«ب/ت/ث/ن/ي» · «ج/ح/خ» · «د/ذ» · «ر/ز» · «س/ش» · «ص/ض» · «ط/ظ» · «ع/غ» ·
«ف/ق») هي **الفارقُ الوحيد** بين تسعِ عائلاتٍ من رسوم العربيّة — أي أكثر من نصف الأبجديّة.
وهي في الوقت نفسه **أصغرُ ما يُرسَم على الشاشة**. فحدُّ وضوح العربيّة ليس ارتفاعَ الحرف
(‏x-height كما في اللاتينيّة) بل **قُطرَ النقطة والفجوةَ بين نقطتين**. وهذا فرقٌ بنيويّ:
حجمٌ يكفي «‏m» اللاتينيّة قد لا يكفي للتمييز بين «ب» و«ت».

## القاعدةُ الفيزيائيّة المستعملة
مع التنعيم الرماديّ (‏greyscale AA، وهو مسارُ Electron الافتراضيّ بعد قفلِ GPU في `DR-05`):
  • معلمٌ أضيقُ من **بكسل جهازٍ واحد** لا يُرسَم شكلًا بل لطخةً رماديّةً باهتة.
  • معلمان بينهما فجوةٌ أضيقُ من **بكسل واحد** يندمجان في لطخةٍ واحدة.
فـ«نقطتا التاء» عند فجوةٍ دون البكسل تصيران نقطةً عريضةً — أي **«ت» تُقرأ «ب»**. وهذا
عطبٌ قاطعٌ لا تجميليّ.

العتبات: ‎1.0px‎ = حدُّ الظهور (دونه لا شكل)، ‎1.5px‎ = حدُّ القراءة المريحة (الشكلُ يُقرأ
دائريًّا لا رماديًّا). ونحسب عند ‎1×‎ لأنّها **الحالةُ الأسوأ** الواقعيّة: شاشةٌ ‎1080p‎ بلا
تحجيمٍ نظاميّ — وهي شائعةٌ في أجهزة المتعلّمين، وهم جمهورُ محرابٍ الأوّل.

## الاستعمال
    python tests/dx/arabic_legibility.py <مسار KawkabMono-Regular.ttf>

**ولماذا مسارٌ خارجيّ لا ملفٌّ في المستودع:** المشحونُ في `patches/fonts/` هو `woff2`
مبنيٌّ على `CFF` (تحقّقنا: جدولُ `CFF ` لا `glyf`)، وقراءةُ الكونتورات منه تحتاج فكَّ
‏brotli ثمّ تفسيرَ charstrings — أي مفسّرَ خطٍّ كاملًا داخل حارس. والمصدرُ `TTF` من
إصدار Kawkab Mono نفسِه (‏0.501) يحمل `glyf` مباشرةً. وهذا **نفسُ ما فعلته** قراءةُ
المقاييس في `patches/fonts/README.md`، فالسابقةُ قائمةٌ لا استثناء.
"""
import hashlib
import io
import json
import struct
import sys

# عائلاتُ الرسم التي تفرّقها النقطةُ وحدَها — مصدرُ الادّعاء «تسع عائلات» أعلاه، مسرودًا
# كي لا يبقى الرقمُ دعوى. (الحرفُ الأوّل بلا نقطةٍ أو بأقلَّ، والثاني بنقطةٍ أو أكثر.)
DOT_FAMILIES = [
    ("ب/ت/ث/ن/ي", (0x0628, 0x062A, 0x062B, 0x0646, 0x064A)),
    ("ج/ح/خ", (0x062C, 0x062D, 0x062E)),
    ("د/ذ", (0x062F, 0x0630)),
    ("ر/ز", (0x0631, 0x0632)),
    ("س/ش", (0x0633, 0x0634)),
    ("ص/ض", (0x0635, 0x0636)),
    ("ط/ظ", (0x0637, 0x0638)),
    ("ع/غ", (0x0639, 0x063A)),
    ("ف/ق", (0x0641, 0x0642)),
]

# أحجامٌ تُفحَص. 14 افتراضُ المنبع على ويندوز/لينكس، و12 على macOS، والبقيّةُ للمقارنة.
SIZES = (12, 13, 14, 15, 16, 17)

MIN_VISIBLE_PX = 1.0   # دونه: لطخةٌ رماديّةٌ لا شكل
MIN_LEGIBLE_PX = 1.5   # دونه: يُرى ولا يُقرأ شكلًا

# **حدُّ عزل النقطة: مطلقٌ لا نسبيّ.** جرّبنا نسبةً من أكبر كونتور (‏≤22%) فأخطأت في
# «د/ذ/ن/ف»: أجسامُها صغيرةٌ فسقطت نقاطُها تحت النسبة، فظهرت «ذ» بلا نقطةٍ أصلًا. والقياسُ
# يقول إنّ الحدَّ المطلقَ آمنٌ بفارقٍ واسع: كلُّ نقاط هذا الخطّ ‎137×151‎ وحدة، وأصغرُ معلمٍ
# غيرِ نقطةٍ هو عينُ «ف» ‎212×219‎ — فحدُّ ‎200‎ يقع في فجوةٍ لا في وسطِ توزيع.
DOT_MAX_SPAN = 200

# الأجسامُ التي يُقاس بها «نطاقُ الجسم» العربيّ: حروفٌ تجلس على خطّ الأساس بلا صاعدٍ
# طويل. تُستثنى «ط/ع/ا/ل» (صواعد) و«ن» (قصعةٌ نازلة) كي لا يُقاس الصاعدُ على أنّه جسم.
ARABIC_BODY = {"ه": 0x0647, "د": 0x062F, "ح": 0x062D, "س": 0x0633,
               "م": 0x0645, "ص": 0x0635}
# نظيرُها اللاتينيّ: `x` مسطّحةُ القمّة فلا تحمل تجاوزَ الاستدارة (‏overshoot).
LATIN_XHEIGHT = 0x0078

# حدُّ عمقِ فكِّ الرسوم المركَّبة — حارسٌ ضدّ مرجعٍ دائريٍّ في خطٍّ معطوب.
MAX_COMPOSITE_DEPTH = 4


class Font:
    """قارئُ SFNT صغيرٌ يبلغ الكونتورات — لا `fontTools` (ليست من تبعيّات المستودع)."""

    def __init__(self, path):
        self.d = d = open(path, "rb").read()
        n = struct.unpack(">H", d[4:6])[0]
        self.tables = {}
        for i in range(n):
            off = 12 + i * 16
            tag = d[off:off + 4].decode("latin-1")
            o, ln = struct.unpack(">II", d[off + 8:off + 16])
            self.tables[tag] = (o, ln)
        if "glyf" not in self.tables:
            raise SystemExit("هذا الخطّ ليس من نوع glyf (‏CFF غالبًا) — القياسُ يحتاج نسخة TTF")
        ho = self.tables["head"][0]
        self.upem = struct.unpack(">H", d[ho + 18:ho + 20])[0]
        self.loc_fmt = struct.unpack(">h", d[ho + 50:ho + 52])[0]
        self._cmap()

    def _cmap(self):
        d = self.d
        co = self.tables["cmap"][0]
        n = struct.unpack(">H", d[co + 2:co + 4])[0]
        best = None
        for i in range(n):
            _pid, _eid, off = struct.unpack(">HHI", d[co + 4 + i * 8:co + 12 + i * 8])
            fmt = struct.unpack(">H", d[co + off:co + off + 2])[0]
            if fmt in (4, 12):
                best = (fmt, co + off)
                if fmt == 12:
                    break
        self.cmap = best

    def gid(self, cp):
        d = self.d
        fmt, o = self.cmap
        if fmt == 4:
            seg_x2 = struct.unpack(">H", d[o + 6:o + 8])[0]
            seg = seg_x2 // 2
            ends = struct.unpack(">%dH" % seg, d[o + 14:o + 14 + seg_x2])
            sto = o + 16 + seg_x2
            starts = struct.unpack(">%dH" % seg, d[sto:sto + seg_x2])
            dto = sto + seg_x2
            deltas = struct.unpack(">%dh" % seg, d[dto:dto + seg_x2])
            rto = dto + seg_x2
            ranges = struct.unpack(">%dH" % seg, d[rto:rto + seg_x2])
            for i in range(seg):
                if starts[i] <= cp <= ends[i]:
                    if ranges[i] == 0:
                        return (cp + deltas[i]) & 0xFFFF
                    gi = rto + i * 2 + ranges[i] + (cp - starts[i]) * 2
                    g = struct.unpack(">H", d[gi:gi + 2])[0]
                    return (g + deltas[i]) & 0xFFFF if g else 0
            return 0
        ngroups = struct.unpack(">I", d[o + 12:o + 16])[0]
        for i in range(ngroups):
            s, e, g = struct.unpack(">III", d[o + 16 + i * 12:o + 28 + i * 12])
            if s <= cp <= e:
                return g + (cp - s)
        return 0

    def _glyph_bytes(self, g):
        d = self.d
        lo = self.tables["loca"][0]
        if self.loc_fmt == 0:
            s = struct.unpack(">H", d[lo + g * 2:lo + g * 2 + 2])[0] * 2
            e = struct.unpack(">H", d[lo + g * 2 + 2:lo + g * 2 + 4])[0] * 2
        else:
            s = struct.unpack(">I", d[lo + g * 4:lo + g * 4 + 4])[0]
            e = struct.unpack(">I", d[lo + g * 4 + 4:lo + g * 4 + 8])[0]
        if s == e:
            return None
        go = self.tables["glyf"][0]
        return d[go + s:go + e]

    def contours(self, cp, _depth=0):
        """يعيد قائمةَ كونتوراتٍ، كلٌّ منها قائمةُ ‎(x, y, on_curve)‎ بوحدات التصميم.

        **‏`on_curve` ليس زينةً في البيانات.** منحنياتُ TrueType تربيعيّة، ونقاطُ التحكّم
        فيها تقع **خارجَ** المسار: لدائرةٍ مقرَّبةٍ بأربعة أقواس، نقطةُ التحكّم على مسافة
        ‏‎r√2‎ من المركز — أي أنّ صندوقًا يحسبها يزيد على القُطر الحقيقيّ حتّى **‎41٪‎**.
        وحروفُ العربيّة مستديرةُ القمم ونقاطُها دوائرُ صغيرة، فالانحيازُ يصيب **كلَّ** رقمٍ
        في هذا القياس، **وغيرُ متماثلٍ** في القسم الرابع: `x` اللاتينيّة مسطّحةُ القمّة
        (اختيرت لذلك) فلا تُضخَّم، والعربيّةُ تُضخَّم — فينكمش العجزُ المقيسُ عن حقيقته.

        يفكّ الرسومَ المركَّبة (‏composite) بالتكرار: نقطةُ الإعجام رسمٌ مركَّبٌ في خطوطٍ
        كثيرة — تجاهُلُها كان سيُعيد «صفرَ نقاطٍ» ويبدو أنّ الحرفَ بلا نقاط.
        """
        g = self.gid(cp)
        if not g:
            return []
        b = self._glyph_bytes(g)
        if not b:
            return []
        nc = struct.unpack(">h", b[0:2])[0]
        if nc < 0:
            return self._composite(b, _depth)
        return _parse_simple(b)

    def _composite(self, b, depth):
        """يفكّ المكوّنات بإزاحةٍ فقط (‏ARGS_ARE_XY_VALUES). التحجيمُ نادرٌ في النقاط ويُهمَل.

        وحدُّ العمق **يُفحَص هنا لا عند المُستدعي وحدَه**: `_composite` يستدعي نفسَه، فرسمٌ
        مركَّبٌ دائريٌّ كان يبلغ `RecursionError` بلا أن يمرّ بالفحص أصلًا.
        """
        if depth > MAX_COMPOSITE_DEPTH:
            return []
        out, p = [], 10
        while True:
            flags, gi = struct.unpack(">HH", b[p:p + 4])
            p += 4
            if flags & 1:
                a1, a2 = struct.unpack(">hh", b[p:p + 4])
                p += 4
            else:
                a1, a2 = struct.unpack(">bb", b[p:p + 2])
                p += 2
            if flags & 8:
                p += 2
            elif flags & 0x40:
                p += 4
            elif flags & 0x80:
                p += 8
            dx, dy = (a1, a2) if flags & 2 else (0, 0)
            sub = self._glyph_bytes(gi)
            if sub:
                nc = struct.unpack(">h", sub[0:2])[0]
                subc = _parse_simple(sub) if nc >= 0 else self._composite(sub, depth + 1)
                for c in subc:
                    out.append([(x + dx, y + dy, on) for x, y, on in c])
            if not (flags & 0x20):
                break
        return out


def _parse_simple(b):
    """يفكّ رسمًا بسيطًا إلى كونتورات ‎(x, y, on_curve)‎.

    **دالّةٌ حرّةٌ لا طريقةُ صنف**: كانت نسختان منها — واحدةٌ في `contours` وأخرى في
    `_contours_from` بإسنادَين ميّتَين — أربعون سطرًا مكرّرةً حرفيًّا. ونسختان من مُفكِّكٍ
    ثنائيٍّ تتباعدان صامتتَين.
    """
    nc = struct.unpack(">h", b[0:2])[0]
    if nc <= 0:
        return []
    p = 10
    ends = struct.unpack(">%dH" % nc, b[p:p + nc * 2])
    p += nc * 2
    ilen = struct.unpack(">H", b[p:p + 2])[0]
    p += 2 + ilen
    npts = ends[-1] + 1
    flags = []
    while len(flags) < npts:
        f = b[p]
        p += 1
        flags.append(f)
        if f & 8:
            r = b[p]
            p += 1
            flags.extend([f] * r)
    flags = flags[:npts]
    xs, v = [], 0
    for f in flags:
        if f & 2:
            dx = b[p]
            p += 1
            v += dx if f & 16 else -dx
        elif not (f & 16):
            v += struct.unpack(">h", b[p:p + 2])[0]
            p += 2
        xs.append(v)
    ys, v = [], 0
    for f in flags:
        if f & 4:
            dy = b[p]
            p += 1
            v += dy if f & 32 else -dy
        elif not (f & 32):
            v += struct.unpack(">h", b[p:p + 2])[0]
            p += 2
        ys.append(v)
    on = [bool(f & 1) for f in flags]
    out, start = [], 0
    for e in ends:
        out.append(list(zip(xs[start:e + 1], ys[start:e + 1], on[start:e + 1])))
        start = e + 1
    return out


def bbox(c):
    """صندوقُ كونتورٍ **من نقاط المسار وحدَها** — لا من نقاط التحكّم.

    نقطةُ التحكّم في منحنًى تربيعيٍّ تقع خارجَ المسار، فصندوقٌ يحسبها يقيس **مثلّثَ
    التحكّم لا الشكلَ**. والحدُّ النظريُّ للخطأ كبير: لدائرةٍ مقرَّبةٍ بأربعة أقواس يبلغ
    ‏‎41٪‎. وهو خطأٌ **غيرُ متماثلٍ** في القسم الرابع: العربيّةُ مستديرةُ القمم فتُضخَّم،
    و`x` اللاتينيّةُ مسطّحةُ القمّة (اختيرت لذلك) فلا تُضخَّم — أي أنّه يجعل العجزَ المقيسَ
    **أصغرَ من حقيقته**، وهو الاتّجاهُ الذي يخدع لأنّه يبدو تحفّظًا.

    **والأثرُ الفعليُّ في هذا الوجه: ‎3‎ وحداتٍ على الأكثر (‏‎0.003em‎).** قِسناه: من ‎99‎
    كونتورًا في العيّنة، ‎64‎ فيها نقاطُ تحكّم، وأقصى فرقٍ بين الصندوقَين ‎3‎ وحدات. والسببُ
    أنّ Kawkab Mono يضع **نقطةَ مسارٍ عند كلّ طرفٍ** (ممارسةٌ قياسيّةٌ يقتضيها التلميح).
    فالترشيحُ هنا **احتياطٌ لا تصحيح**، وأرقامُ هذا القياس (‏‎0.135‎ و‎0.828‎) لا تتغيّر به.
    ونُبقيه: الوجهُ قد يُرقَّى، والاحتياطُ الذي يكلّف سطرًا لا يُترَك لأنّه لم يلزم اليوم.

    السقوطُ إلى كلّ النقاط حين لا نقطةَ مسارٍ في الكونتور: صيغةٌ قانونيّةٌ نادرةٌ في
    TrueType (كلُّ النقاط خارجَ المسار، والمسارُ يمرّ بمنتصفاتها). صندوقُها تقريبٌ زائد،
    ولا يقع في هذا الخطّ — لكنّ سقوطًا صامتًا إلى صفرِ نقاطٍ كان سيرمي.
    """
    pts = [p for p in c if len(p) < 3 or p[2]] or c
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def dot_cluster(font, cp):
    """يعزل النقاطَ ويعيد ‎(عرضُ العنقود، ارتفاعُه، عددُ النقاط، أصغرُ قُطر)‎ بوحدات التصميم.

    **العنقودُ لا الفجوة.** قِسنا أوّلًا الفجوةَ بين نقطتين، ووجدناها ‎0.019em‎ في «ث» —
    أي ‎0.27px‎ عند ‎14px‎، فحكمنا بأنّ الثلاثَ تندمج. والحكمُ صحيحٌ والاستنتاجُ منه خطأ:
    القارئُ **لا يعدّ النقاطَ أصلًا**، بل يقرأ **حجمَ العنقود وشكلَه** — نقطةٌ واحدةٌ صغيرة،
    أو عريضٌ منبسط (نقطتان)، أو عريضٌ مرتفع (ثلاث). فالفجوةُ ليست المقياسَ، بل امتدادُ
    العنقود. وهذا ما نقيسه هنا.
    """
    cs = font.contours(cp)
    if not cs:
        return None
    boxes = [bbox(c) for c in cs]
    dots = [b for b in boxes if max(b[2] - b[0], b[3] - b[1]) <= DOT_MAX_SPAN]
    if not dots:
        return (0, 0, 0, 0)
    x0 = min(b[0] for b in dots)
    x1 = max(b[2] for b in dots)
    y0 = min(b[1] for b in dots)
    y1 = max(b[3] for b in dots)
    diam = min(min(b[2] - b[0], b[3] - b[1]) for b in dots)
    return (x1 - x0, y1 - y0, len(dots), diam)


def body_band(font, cp):
    """ارتفاعُ جسم الحرف فوق خطّ الأساس (‏`ymax`) — نظيرُ `x-height` في العربيّة.

    يمرّ عبر `bbox` لا على النقاط الخام، كي يستفيد من ترشيح نقاط التحكّم — وهنا
    بالذات يقع أشدُّ أثرِ الترشيح، لأنّ الطرفَ المقارَنَ (`x`) لا يتأثّر به.
    """
    cs = font.contours(cp)
    if not cs:
        return None
    return max(bbox(c)[3] for c in cs)


def main():
    argv = [a for a in sys.argv[1:] if a != "--json"]
    as_json = "--json" in sys.argv
    if len(argv) != 1:
        print("الاستعمال: python tests/dx/arabic_legibility.py [--json] <KawkabMono-Regular.ttf>",
              file=sys.stderr)
        return 2
    path = argv[0]
    # في وضع JSON يُبتلَع التقريرُ البشريُّ كلُّه: مخرَجٌ يُقرأ آليًّا يجب أن يكون JSONًا
    # صرفًا. والالتقاطُ إلى مخزنٍ بدل تكرار كلّ `print` بشرطٍ — نسختان من التقرير
    # تتباعدان صامتتَين، وهذا الدرسُ مدفوعٌ ثمنُه في هذا المستودع من قبل.
    real_stdout = sys.stdout
    if as_json:
        sys.stdout = io.StringIO()
    f = Font(path)
    upem = f.upem
    # **بصمةُ الوجه المقيس.** رقمٌ بلا وجهٍ يُنسَب إليه رقمٌ معلَّق: ترقيةُ الخطّ إلى إصدارٍ
    # بمقاييسَ أخرى تُبطِل `0.135` و`0.828` بلا أن يسقط شيء. فنخزّن البصمةَ مع الأرقام،
    # ويقارنها حارسُ L0 بالوجه المشحون.
    digest = hashlib.sha256(f.d).hexdigest()
    out = {"sha256": digest, "unitsPerEm": upem, "bytes": len(f.d)}
    if not as_json:
        print(f"unitsPerEm = {upem}")
        print(f"بصمةُ الوجه المقيس (sha256) = {digest[:16]}…")

    # ── ١) عناقيدُ النقاط: ما الذي يفرّق العائلات فعلًا ──────────────────────────
    print("\n‏١) عناقيدُ النقاط (وحدةُ التصميم)")
    print("العائلة            الحرف   عدد   عرض×ارتفاع العنقود   أصغرُ قُطر")
    shapes = {}   # (عدد النقاط) → (عرض، ارتفاع)
    min_diam = None
    for label, cps in DOT_FAMILIES:
        for cp in cps:
            m = dot_cluster(f, cp)
            if m is None:
                continue
            w, h, n, diam = m
            print(f"{label:16s}  U+{cp:04X}    {n}     {w:4d} × {h:4d}"
                  + (f"          {diam}" if n else "                —"))
            if n:
                # **الأضيقُ لا الأوّل.** الرسومُ ذاتُ نقطتين ليست متطابقةَ العنقود (‏ت فوق ·
                # ي تحت · ق فوق)، وأخذُ أوّلِها يجعل الرقمَ رهينةَ ترتيبِ `DOT_FAMILIES`.
                prev = shapes.get(n)
                shapes[n] = (w, h) if prev is None else (min(prev[0], w), min(prev[1], h))
                min_diam = diam if min_diam is None else min(min_diam, diam)
    if min_diam is None:
        print("لم تُعزَل نقطةٌ واحدة — راجع DOT_MAX_SPAN", file=sys.stderr)
        return 1

    # الفوارقُ الحقيقيّة بين الرسوم، **مصنَّفةً بنوع الإشارة لا مجموعةً في رقمٍ واحد**:
    #   • «حبرٌ صلب» = وجودُ حبرٍ حيث لا حبر (النقطةُ نفسُها). إشارةٌ قويّة: أسودُ على أبيض.
    #   • «امتدادُ عنقود» = فرقُ حجمِ كتلةٍ موجودةٍ في الحالين. إشارةٌ أضعفُ بطبيعتها.
    # وجمعُهما في `min()` واحدٍ كان يختار الحبرَ الصلبَ (الأصغرَ عدديًّا) **فيُخفي** أنّ
    # التمييزَ الأصعبَ إدراكيًّا هو فرقُ الامتداد — رقمان لا يقارَنان على مسطرةٍ واحدة.
    solid = [("‏٠ ↔ ١ نقطة (ب/ح · ر/ز · ص/ض · د/ذ · ط/ظ · ع/غ)", min_diam)]
    extent = []
    if 1 in shapes and 2 in shapes:
        extent.append(("‏١ ↔ ٢ نقطة (ب/ت · ف/ق) — فرقُ العرض",
                       abs(shapes[2][0] - shapes[1][0])))
    if 2 in shapes and 3 in shapes:
        extent.append(("‏٢ ↔ ٣ نقاط (ت/ث · س/ش) — فرقُ الارتفاع",
                       abs(shapes[3][1] - shapes[2][1])))
    print("\n‏٢) الفارقُ المميِّز لكلّ زوجِ رسمٍ — مصنَّفًا بنوع الإشارة")
    print("  ▸ حبرٌ صلب (وجودُ حبرٍ حيث لا حبر — أقوى إشارةٍ ممكنة)")
    for name, v in solid:
        print(f"    {name:46s} = {v:4d} وحدة = {v / upem:.4f} em")
    print("  ▸ امتدادُ عنقود (فرقُ حجمِ كتلةٍ موجودةٍ في الحالين — إشارةٌ أضعف)")
    for name, v in extent:
        print(f"    {name:46s} = {v:4d} وحدة = {v / upem:.4f} em")
    b_solid = min(v for _, v in solid) / upem
    b_extent = (min(v for _, v in extent) / upem) if extent else None
    out["solidEm"] = round(b_solid, 4)
    out["extentEm"] = round(b_extent, 4) if b_extent else None

    print("\n‏٣) الفارقان بالبكسل عند ‎1×‎ (شاشةٌ بلا تحجيمٍ نظاميّ — الحالةُ الأسوأ)")
    print("الحجم(px)  حبرٌ صلب(px)  امتداد(px)   الحكم")
    floor_visible = floor_legible = None
    for s_px in SIZES:
        ps = b_solid * s_px
        pe = b_extent * s_px if b_extent else float("inf")
        worst = min(ps, pe)
        if worst < MIN_VISIBLE_PX:
            verdict = "✗ دون بكسل — الفارقُ لا يُرسَم أصلًا"
        elif worst < MIN_LEGIBLE_PX:
            verdict = "△ يُرى ولا يُقرأ شكلًا"
            floor_visible = floor_visible or s_px
        else:
            verdict = "✓ الفارقان مقروءان"
            floor_visible = floor_visible or s_px
            floor_legible = floor_legible or s_px
        print(f"  {s_px:2d}       {ps:5.2f}        "
              + (f"{pe:5.2f}" if b_extent else "  — ") + f"      {verdict}")
    out["floorVisiblePx"] = floor_visible
    out["floorLegiblePx"] = floor_legible
    print(f"\n  أرضيّةُ الظهور = {floor_visible} px · أرضيّةُ القراءة = {floor_legible} px")

    # ── ٤) العجزُ البصريّ: نطاقُ الجسم العربيّ مقابل `x-height` اللاتينيّ ─────────
    bands = {}
    for name, cp in ARABIC_BODY.items():
        v = body_band(f, cp)
        if v:
            bands[name] = v
    xh = body_band(f, LATIN_XHEIGHT)
    vals = sorted(bands.values())
    med = (vals[len(vals) // 2] if len(vals) % 2
           else (vals[len(vals) // 2 - 1] + vals[len(vals) // 2]) / 2)
    ratio = med / xh
    out["arabicBandEm"] = round(med / upem, 4)
    out["latinXHeightEm"] = round(xh / upem, 4)
    out["bandRatio"] = round(ratio, 3)
    print("\n‏٤) العجزُ البصريّ — نطاقُ الجسم العربيّ ÷ `x-height` اللاتينيّ")
    print("  " + " · ".join(f"{k} {v}" for k, v in bands.items()))
    print(f"  وسيطُ الجسم العربيّ = {med:g} وحدة = {med / upem:.4f} em")
    print(f"  ‏x-height اللاتينيّ (‏«x»)  = {xh} وحدة = {xh / upem:.4f} em")
    print(f"  ⇒ النسبة = {ratio:.3f} — أي أنّ الحجمَ نفسَه يعطي العربيّةَ "
          f"{(1 - ratio) * 100:.0f}٪ حبرًا أقلّ ارتفاعًا")
    for base in (12, 14):
        print(f"  ⇒ لمعادلةِ ما يعطيه {base}px للّاتينيّة، تحتاج العربيّةُ "
              f"{base / ratio:.1f}px")

    print("\nملاحظةٌ لازمة: القسمان ١–٣ **حدٌّ أدنى قاطع**؛ والقسمُ ٤ **ضغطٌ اتّجاهيّ** لا")
    print("وصفةٌ — معادلةُ الارتفاع بالكامل تُكلّف أعمدةً، والمقايضةُ قرارٌ لا قياس.")
    _emit(out, as_json, real_stdout)
    return 0


def _emit(out, as_json, real_stdout):
    """يكتب حصيلةَ القياس JSONًا — **الملفُّ الملتزَمُ هو ما يقرؤه الحارس**، لا التقريرُ
    البشريُّ ولا رقمٌ منسوخٌ في تعليق."""
    if as_json:
        sys.stdout = real_stdout
        print(json.dumps(out, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    raise SystemExit(main())
