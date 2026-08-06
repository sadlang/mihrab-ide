#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""L0 — حارسُ الهويّة في النصّ المُصيَّر (م1).

طبقتان في ملفٍّ واحدٍ لأنّهما تشهدان لشيءٍ واحد:

  (أ) **سلوكُ القاعدة**: أنّ `build/mihrab_brand.py` يستبدل ما ينبغي ويصون ما ينبغي.
      قاعدةٌ بلا اختبارٍ تنجرف بصمت — والانجرافُ هنا يعني إمّا تسرّبَ اسمٍ أو كذبًا
      على المستخدم (وعدًا بسوقٍ لا وجودَ له).

  (ب) **حالُ المصادر**: أنّ ملفّاتِ الترجمة **المصدريّة** في المستودع خاليةٌ من تسرّبٍ
      لا يغطّيه التطبيع. هذا جردٌ لا حكم: يطبع ما بقي ويُفشِل فقط على «VSCodium» بعد
      التطبيع — أي على تسرّبٍ لا عذرَ له.

الاستعمال: python tests/brand/check_brand.py
"""
import json
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "build"))
import mihrab_brand as B  # noqa: E402

NAME = B.NAME
fails = []
oks = 0


def check(label, cond, detail=""):
    global oks
    if cond:
        oks += 1
    else:
        fails.append(f"{label}{(' — ' + detail) if detail else ''}")


def same(label, src, expected):
    got, _n = B.rebrand(src)
    check(label, got == expected, f"«{got}» ≠ «{expected}»")


# ── (أ) سلوكُ القاعدة ──────────────────────────────────────────────────────────
print("── الهويّة: سلوكُ قاعدة التطبيع ──")

# 1) اسمُ التوزيعة الأمّ: لا استثناءَ له في أيّ سياق.
same("VSCodium يُستبدَل في جملةٍ عربيّة",
     "افتراضيًّا، يُطلق VSCodium إكمال القيمة.",
     f"افتراضيًّا، يُطلق {NAME} إكمال القيمة.")
check("مسارٌ بفراغٍ داخله يُصان كاملًا",
      B.rebrand("افتح C:/Program Files/VSCodium/bin")[0]
      == "افتح C:/Program Files/VSCodium/bin",
      B.rebrand("افتح C:/Program Files/VSCodium/bin")[0])
check("ولا يبتلع المسارُ ما بعده فيُخفي تسرّبًا",
      B.rebrand("افتح C:/x ثمّ شغّل VSCodium")[0] == f"افتح C:/x ثمّ شغّل {NAME}",
      B.rebrand("افتح C:/x ثمّ شغّل VSCodium")[0])
same("لامُ الجرّ تلتحم: «لـVSCodium» ⇐ «لمحراب»",
     "دعم Emmet لـVSCodium", f"دعم Emmet ل{NAME}")
# والباءُ والكافُ والفاءُ مثلُها: «بـمحراب» عطبٌ إملائيٌّ كـ«لـمحراب» سواء.
same("باءُ الجرّ تلتحم", "دعم Emmet بـVSCodium", f"دعم Emmet ب{NAME}")
# **أثرٌ سياقيّ**: تمريرةُ إصلاحٍ لاحقةٌ على كامل النصّ كانت تُعيد كتابةَ «لـ محراب»
# الواردةِ أصلًا لمجرّد أنّ سلسلةً أخرى في الجملة استُبدلت. الالتحامُ داخل المسحة يمنعه.
same("«لـ محراب» الواردةُ أصلًا لا تُمَسّ حين يُستبدَل غيرُها",
     f"لـ {NAME} و VSCodium", f"لـ {NAME} و {NAME}")

# 2) اسمُ VS Code حين يتكلّم عن التطبيق الجاري: يُستبدَل.
same("«أعد تشغيل VS Code» عن التطبيق الجاري",
     "أعد تشغيل VS Code قبل إعادة التثبيت.",
     f"أعد تشغيل {NAME} قبل إعادة التثبيت.")
same("«Visual Studio Code» الطويل يُطابَق قبل القصير",
     "يرجى إعادة تحميل Visual Studio Code لتفعيلها.",
     f"يرجى إعادة تحميل {NAME} لتفعيلها.")
same("«VSCode» بلا فراغ",
     "افتح VSCode ثمّ أعد المحاولة.", f"افتح {NAME} ثمّ أعد المحاولة.")

# 2-ب) صِيَغُ الاسم التي كانت تتسرّب: فراغٌ مزدوجٌ وحروفٌ صغيرة.
same("«VS  Code» بفراغين لا تمرّ", "انظر VS  Code هنا", f"انظر {NAME} هنا")
same("«vscodium» بحروفٍ صغيرةٍ لا تمرّ", "شغّل vscodium الآن", f"شغّل {NAME} الآن")
same("«Code - OSS» اسمُ توزيعةٍ كذلك", "بُني على Code - OSS.", f"بُني على {NAME}.")

# 3) الإشاراتُ الصادقةُ إلى طرفٍ ثالث: تُصان — واستبدالُها كذبٌ لا تعريب.
for label, src in [
    ("سوقُ الإضافات (لا سوقَ لمحراب)", "بانر مستخدم في سوق VS Code."),
    ("معرضُ الإضافات", "الفئات المستخدمة من معرض VS Code لتصنيف الإضافة."),
    ("متجرٌ بكلمةٍ فاصلة", "افتح متجر إضافات VS Code."),
    ("سوقٌ باسم التوزيعة الأمّ لا يصير سوقًا لنا",
     "استعراض سوق VSCodium غير متاح."),
    ("معرضٌ بالإنجليزيّة", "Browse the VS Code Marketplace."),
    ("قناةُ Insiders (لا قنواتِ تحديثٍ لمحراب)",
     "إعادة التحميل للتبديل إلى إصدار Insiders من VS Code."),
    ("Insiders بشَرطةٍ فاصلة", "حمّل VS Code - Insiders."),
    ("ترتيبُ الصفة العربيّ (الصفةُ بعد الموصوف)", "إصدار VS Code التجريبيّ"),
    ("صِيغةُ الويب", "استعراض السوق غير متاح في VS Code للويب."),
    ("VS Code for the Web", "افتح VS Code for the Web."),
    ("خادمٌ ونفقٌ لا نبنيهما", "تثبيت VS Code Server ثمّ VS Code Tunnel."),
    ("سطرُ الأوامر البعيد", "جارٍ تثبيت VS Code CLI على البعيد..."),
    ("تحديثٌ لا مُحدِّثَ له", "تحديث VS Code"),
    ("حسابٌ لا مزوّدَ هويّةٍ له", "حساب VS Code"),
    ("نسبةُ السمة إلى صانعها", "سمة ألوان Monokai لـ Visual Studio Code"),
    ("النسبةُ بالصيغة القصيرة كذلك", "سمة Monokai لـVS Code"),
    ("تمييزٌ بين قوسين", "بسيط (Visual Studio Code)"),
    ("تمييزٌ بين قوسين بالصيغة القصيرة", "بسيط (VS Code)"),
]:
    got, n = B.rebrand(src)
    check(f"مصان: {label}", got == src and n == 0, f"تغيّر إلى «{got}»")

# 4) المساحاتُ الحرفيّة: عنوانٌ وشيفرةٌ ومُعوِّضٌ ومسارٌ لا تُلمَس.
for label, src in [
    ("عنوانٌ يحمل الاسم", "راجع https://code.visualstudio.com/VS Code-docs الآن"),
    ("شيفرةٌ بين شَولتين مائلتين", "استعمل `VSCodium --version` من الطرفيّة"),
    # الشَّولتان المزدوجتان: النمطُ المفردُ كان يبتلع المحدِّدَين ويترك المتنَ مكشوفًا،
    # فيصير الأمرُ المُملى على المستخدم أمرًا لا وجودَ له.
    ("شيفرةٌ بين شَولتين مزدوجتين", "شغّل ``VSCodium --version`` هنا"),
    ("مُعوِّضُ قالب", "الاسم ${VSCodium} هنا"),
]:
    got, _n = B.rebrand(src)
    check(f"مصان حرفيًّا: {label}", got == src, f"تغيّر إلى «{got}»")

# 4-ب) المسحةُ الواحدة: مصانٌ ومُستبدَلٌ في السلسلة نفسِها، كلٌّ بحكمه.
same("مصانٌ ومُستبدَلٌ جنبًا إلى جنب",
     "شغّل `VSCodium --version` ثمّ افتح VSCodium",
     f"شغّل `VSCodium --version` ثمّ افتح {NAME}")
same("سوقٌ مصانٌ وجملةٌ مُستبدَلةٌ في نصٍّ واحد",
     "افتح سوق VS Code من VS Code.", f"افتح سوق VS Code من {NAME}.")
# محرفُ NUL كان يُستعمَل مُعوِّضًا في تنفيذٍ سابقٍ بأقنعة؛ نصٌّ يحويه كان سيُفسَد صمتًا.
_nul = "قبل\x005\x00 بعد VSCodium"
check("محرفُ NUL في المصدر لا يُفسِد الناتج",
      B.rebrand(_nul)[0] == f"قبل\x005\x00 بعد {NAME}", repr(B.rebrand(_nul)[0]))

# 5) نصٌّ بلا اسمٍ لا يُمَسّ، وغيرُ النصّ يمرّ كما هو.
same("نصٌّ نظيفٌ يمرّ بلا تغيير", "افتح الملفّ ثمّ احفظه.", "افتح الملفّ ثمّ احفظه.")
check("العدمُ لا يُكسِر", B.rebrand(None) == (None, 0))
check("العددُ يمرّ كما هو", B.rebrand(7) == (7, 0))

# 6) التطبيعُ **مُتساكن** (idempotent): إعادةُ تطبيقه لا تغيّر شيئًا. لازمٌ لأنّ البناء
#    قد يمرّ على الشجرة نفسِها مرّتين، ونصٌّ يتضاعف تغييرُه يفسد صمتًا.
_once, _ = B.rebrand("يُطلق VSCodium إكمال القيمة في VS Code.")
_twice, _n2 = B.rebrand(_once)
check("التطبيعُ متساكن", _twice == _once and _n2 == 0, f"«{_once}» ⇐ «{_twice}»")

# 7) الشجرةُ المتداخلة تُطبَّع بكاملها.
_tree, _n3 = B.rebrand_tree({"a": "في VSCodium", "b": ["و VSCodium", 3], "c": None})
check("التطبيعُ يعبر القواميسَ والقوائم",
      _tree == {"a": f"في {NAME}", "b": [f"و {NAME}", 3], "c": None} and _n3 == 2,
      json.dumps(_tree, ensure_ascii=False))

# 8) اسمُ المنتج من مصدر الهويّة لا من سلسلةٍ مكرَّرة.
_pj = os.path.join(ROOT, "product-overrides", "product.json")
with open(_pj, encoding="utf-8") as _f:
    check("الاسمُ مقروءٌ من product-overrides", NAME == json.load(_f).get("nameLong"),
          f"NAME={NAME}")

# 9) مسحُ الحزمة (`scan_shipped`) — **سلوكُه مُختبَرٌ على شجرةٍ مصنوعة**، لا على الحزمة
#    وحدَها. حارسٌ لا يُختبَر إلّا على مُدخَلٍ نظيفٍ لا يُعرَف أنّه يرى شيئًا أصلًا: لو
#    عاد `[]` دائمًا لبقي أخضرَ إلى الأبد. فتُصنَع له شجرةٌ فيها تسرّبٌ يجب أن يمسكه،
#    ومفتاحٌ يجب ألّا يمسكه، وملفُّ أصلٍ يجب أن يتخطّاه.
import tempfile  # noqa: E402

with tempfile.TemporaryDirectory() as _d:
    def _w(rel, obj):
        p = os.path.join(_d, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False)

    _w("out/nls.messages.json", ["مرحبًا", "أعد تشغيل VSCodium"])
    # المفتاحُ معرّفُ رسالةٍ لا يراه أحد — والقيمةُ نظيفة. قِيس في الحزمة: main.i18n.json
    # يحوي «VSCodium for Web» مفتاحًا. مسحٌ يقرأ المفاتيح يحمرّ على ما لا يُصيَّر.
    _w("ext/a/package.nls.json", {"x": "نصٌّ نظيف"})
    _w("ext/a/package.nls.ar.json", {"x": "نصٌّ نظيف"})
    _w("lp/translations/main.i18n.json", {"contents": {"m": {"VSCodium for Web": "{0} للويب"}}})
    # ملفّاتُ الأصل: فيها الاسمُ بحقٍّ (منها نُعيد البناء) — تُستثنى بالاسم لا تُصلَح.
    _w("out/nls.messages.en.json", ["Restart VSCodium"])
    _w("ext/a/package.nls.en.json", {"x": "Open VSCodium"})
    _w("lp/translations/main.i18n.orig.json", {"contents": {"m": {"k": "شغّل VSCodium"}}})

    _found, _stats = B.scan_shipped(_d)
    check("المسح: يمسك تسرّبًا في قيمةٍ مُصيَّرة", len(_found) == 1 and "nls.messages" in _found[0],
          f"{len(_found)}: {_found}")
    check("المسح: لا يحمرّ على اسمٍ في **مفتاح** رسالة",
          not any("i18n" in f_ for f_ in _found), str(_found))
    check("المسح: يتخطّى ملفّاتِ الأصل بالاسم ويعدّها", _stats["_hinges"] == 3, str(_stats))
    check("المسح: يعدّ كلَّ صنفِ سطحٍ على حدة",
          all(_stats.get(k) == 1 for k in
              ("nls.messages", "package.nls.json", "package.nls.ar.json", "i18n")), str(_stats))
    # وإن سقط التطبيعُ عن سطحٍ «محصَّنٍ» وحدَه — وهو ما كان يمرّ أخضرَ قبل هذا المسح:
    _w("ext/a/package.nls.ar.json", {"x": "أعد تشغيل VSCodium"})
    _f2, _ = B.scan_shipped(_d)
    check("المسح: يمسك سقوطَ التطبيع عن سطحٍ خامدٍ (nls.ar) — وكان يمرّ أخضرَ",
          any("package.nls.ar.json" in f_ for f_ in _f2), str(_f2))

# ── (ب) حالُ ملفّات الترجمة المصدريّة ──────────────────────────────────────────
print("── الهويّة: جردُ ملفّات الترجمة المصدريّة ──")

for rel in ("build/mihrab_ext_nls_ar.json", "build/mihrab_ar_supplement.json"):
    path = os.path.join(ROOT, rel)
    if not os.path.isfile(path):
        continue
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    # **على القيمة الخام لا على المُطبَّعة**: التطبيعُ شبكةُ أمانٍ عند الكتابة، لا رخصةٌ
    # لكتابة اسم المنبع في مصدرٍ نملكه. مصدرٌ نظيفٌ يمنع أن يُنسَخ الأسلوبُ في السطر التالي.
    raw_leak, kept = [], {}
    for k, v in data.items():
        if not isinstance(v, str) or k.startswith("//"):
            continue
        if "VSCodium" in v or "Code - OSS" in v:
            raw_leak.append(v[:70])
        for m in B.leaks(v):
            kept[m] = kept.get(m, 0) + 1
    check(f"{rel}: لا «VSCodium» في قيمةٍ نملكها", not raw_leak,
          f"{len(raw_leak)} قيمة، أوّلها «{raw_leak[0] if raw_leak else ''}»")
    if kept:
        total = sum(kept.values())
        # الوصفُ يصف ما وُجد لا ما نتمنّاه: المصانُ قد يكون ميزةً لا نظيرَ لها (سوقٌ،
        # قناةٌ) وقد يكون تسميةً منسوبةً إلى صانعها — والجملةُ الواحدةُ لا تصدق عليهما.
        print(f"   ℹ️ {rel}: {total} إشارةً إلى المنبع مصانةً بقرار "
              f"({', '.join(f'{k}×{v}' for k, v in sorted(kept.items()))}).")

# ── الخلاصة ───────────────────────────────────────────────────────────────────
print()
if fails:
    print(f"❌ حارسُ الهويّة: {len(fails)} إخفاق / {oks} نجاح")
    for f_ in fails:
        print("   ✗", f_)
    sys.exit(1)
print(f"✅ حارسُ الهويّة: {oks}/{oks}")
sys.exit(0)
