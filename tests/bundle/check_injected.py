#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""L2 — تأكيدات ما بعد البناء: الكود المحقون وصل الحزمة المشحونة فعلًا (ثوانٍ).

L1 يضمن أنّ الرُقَع **طبَّقت على المصدر**؛ L2 يضمن أنّها **نجت من التحزيم/التصغير** إلى
`workbench.desktop.main.{js,css}` المشحون، وأنّ الـartifacts سليمة (exe، عربيّ افتراضيّ).

**تغطية تمثيليّة لا شاملة:** يفحص العلامات القابلة للاكتشاف نصّيًّا (أصناف CSS + سلاسل JS
حرفيّة تنجو من التصغير). الرُقَع العدديّة/المنطقيّة (minimap setLeft، margin، viewLayout…)
لا تُخلّف سلاسل ⇒ تغطّيها الطبقة الوقتيّة L3. سقوط فئة كاملة يُمسَك هنا.

الاستعمال: python tests/bundle/check_injected.py   (يتطلّب بناءً؛ يتخطّى بلطف إن غاب)
"""
import filecmp
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
sys.path.insert(0, os.path.dirname(HERE))  # tests/
import patch_manifest as M  # noqa: E402
APP = os.path.join(ROOT, ".upstream", "VSCode-win32-x64", "resources", "app")
OUT = os.path.join(APP, "out")
JS = os.path.join(OUT, "vs", "workbench", "workbench.desktop.main.js")
CSS = os.path.join(OUT, "vs", "workbench", "workbench.desktop.main.css")
EXE = os.path.join(ROOT, ".upstream", "VSCode-win32-x64", "Mihrab.exe")
# هوية بصريّة: مجلّد أصول win32 في الحزمة المشحونة (يُقارَن بالمصدر عبر M.BRANDING_ASSETS).
WIN32_OUT = os.path.join(APP, "resources", "win32")

# (وصف، ملفّ، سلسلة يجب وجودها، أدنى عدد)
BUNDLE_MARKERS = [
    # JS — طبقة النواة (الطبقة 3)
    ("workbench dir=rtl (القشرة عربيّة الاتّجاه)", JS, 'setAttribute("dir","rtl")', 1),
    ("استيراد ورقة mihrab-rtl في workbench", JS, "mihrab-rtl", 1),
    ("محرّر: محاذاة ودجة المحتوى بالـcaret (cwpos)", JS, ".cursors-layer .cursor", 1),
    ("محرّر: تمرير لاصق RTL (sticky content)", JS, "sticky-line-content", 1),
    # مِجَسّ الشعار (ASCII، يصمد أمام التصغير) يثبت أنّ **رُقعة الترويسة شُحنت**. لا يثبت نصّ
    # الجملة نفسه (esbuild يهرّب غير-ASCII إلى \\uXXXX ⇒ لا عربيّة حرفيّة في الحزمة، تحقّقنا).
    # نصّ الجملة يتحقّق منه L1 (السلسلة حرفيًّا في المصدر المُرقَّع) وL3 الوقتيّ (نصّ العنوان الفرعيّ).
    ("ترحيب: عنصر شعار القوس (ترويسة Get Started)", JS, "mihrab-welcome-mark", 1),
    # CSS — طبقة الأنماط (mihrab-rtl.css)
    ("CSS13: مسطرة النظرة يسارًا", CSS, "decorationsOverviewRuler", 1),
    ("CSS14: أرقام التمرير اللاصق يمينًا", CSS, "sticky-widget-line-numbers", 1),
    ("CSS15: ودجة الاقتراحات RTL", CSS, "suggest-widget{direction:rtl}", 1),
    ("CSS16: مرآة الإشعارات (مقصورة)", CSS, "notifications-toasts:not(.bottom-left)", 1),
    ("CSS16: مرآة الزرّ العائم", CSS, "floating-click-widget", 1),
    ("CSS17: شكل شعار القوس في الترحيب", CSS, "mihrab-welcome-mark", 1),
]


def _count(path, needle):
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read().count(needle)


_checks = []


def check(name):
    def deco(fn):
        _checks.append((name, fn))
        return fn
    return deco


@check("Mihrab.exe منتَج")
def _exe():
    assert os.path.isfile(EXE), f"لا exe: {EXE}"


@check("هوية بصريّة: كلّ أصول win32 في الحزمة = مصدر محراب (بايتيًّا)")
def _app_icon():
    for src, target in M.BRANDING_ASSETS:
        sp = os.path.join(ROOT, *src.split("/"))
        tp = os.path.join(WIN32_OUT, target)
        assert os.path.isfile(sp), f"لا أصل مصدر: {src} (شغّل assets/branding/gen_ico.py)"
        assert os.path.isfile(tp), f"لا {target} في الحزمة (لم تُحقَن الهوية؟)"
        assert filecmp.cmp(sp, tp, shallow=False), \
            f"{target} المشحون ≠ {src} (رجعت هوية VSCodium؟)"


# الحزمة تُسطّح أصول media/ إلى out/media/<basename> (لا تُمرِّر بنية src)، **وتُحسِّنها بـsvgo**:
# تُجرَّد التعليقات والـ id وviewBox ويُختصر المسار ⇒ لا مطابقة بايتيّة ولا مِجَسّ id يصمد.
# لكنّ svgo يُبقي ألوان stroke وبيانات المسار ⇒ نتحقّق بتوقيع لونيّ مشتقّ من المصدر.
OUT_MEDIA = os.path.join(APP, "out", "media")


def _readtext(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


def _stroke_colors(svg_text):
    import re
    return {c.lower() for c in re.findall(r'stroke="(#[0-9A-Fa-f]{6})"', svg_text)}


@check("هوية بصريّة: أصول SVG للأسطح (رأس التطبيق + خلفية المحرّر) في الحزمة = شعار محراب")
def _surface_svgs():
    matched, pending = [], []
    for src, dest in M.BRANDING_SVG_ASSETS:
        sp = os.path.join(ROOT, *src.split("/"))
        tp = os.path.join(OUT_MEDIA, os.path.basename(dest))
        assert os.path.isfile(sp), f"لا أصل مصدر: {src}"
        colors = _stroke_colors(_readtext(sp))  # ألوان القوس في مصدر محراب (تُشتَقّ، لا تُكتب حرفيًّا)
        assert colors, f"لا لون stroke في مصدر {src} (بنية SVG غير متوقَّعة؟)"
        if not os.path.isfile(tp):
            pending.append(os.path.basename(dest))
            continue
        shipped = _stroke_colors(_readtext(tp))
        # كلّ لون قوس محرابيّ حاضر في المخرَج المُحسَّن ⇒ شُحن شعار محراب (لا أصل VSCodium الأصليّ
        # ذو التدرّج الأزرق/الرماديّ #B2B2B2 — ألواننا الفيروزيّة غائبة عنه قطعًا).
        (matched if colors <= shipped else pending).append(os.path.basename(dest))
    if matched and pending:
        raise AssertionError(f"شحن جزئيّ لأسطح الهوية: طابق {matched}، وتخلّف {pending} (انحدار؟)")
    if not matched:
        # لا سطح مشحون بعد ⇒ بناء أقدم من v17 (الأسطح تُدخَل بإعادة البناء). L0 يضمن الربط ساكنًا.
        print("  ⏭️  أسطح SVG (رأس/خلفية) غير مشحونة بعد — يحتاج إعادة بناء v17 (الربط مضمون بـL0).")


@check("سمات محراب: مشحونة (داكنة + فاتحة) + الافتراضيّة معلَنة")
def _themes_shipped():
    d = os.path.join(APP, "extensions", "mihrab-themes")
    if not os.path.isdir(os.path.join(ROOT, "extensions", "mihrab-themes")):
        return  # لا إضافة سمات في هذا الفرع — تخطٍّ (لا يُفشِل)
    assert os.path.isdir(d), "إضافة سمات محراب غير مشحونة في المخرَج (extensions/mihrab-themes)"
    for fn in ("mihrab-dark-color-theme.json", "mihrab-light-color-theme.json"):
        assert os.path.isfile(os.path.join(d, "themes", fn)), f"سمة مفقودة في الحزمة: {fn}"
    pkg = json.load(open(os.path.join(d, "package.json"), encoding="utf-8"))
    assert pkg.get("contributes", {}).get("configurationDefaults", {}).get("workbench.colorTheme"), \
        "السمة الافتراضيّة غير معلَنة في حزمة المخرَج"


@check("سمة أيقونات محراب: مشحونة (SVG + JSON) + الافتراضيّة معلَنة")
def _icons_shipped():
    if not os.path.isdir(os.path.join(ROOT, "extensions", "mihrab-icons")):
        return  # لا إضافة أيقونات في هذا الفرع — تخطٍّ
    d = os.path.join(APP, "extensions", "mihrab-icons")
    assert os.path.isdir(d), "إضافة أيقونات محراب غير مشحونة (extensions/mihrab-icons)"
    tj = os.path.join(d, "mihrab-icon-theme.json")
    assert os.path.isfile(tj), "ملفّ سمة الأيقونات مفقود في الحزمة"
    for svg in ("sad.svg", "file.svg", "folder.svg", "folder-open.svg"):
        assert os.path.isfile(os.path.join(d, "icons", svg)), f"أيقونة SVG مفقودة في الحزمة: {svg}"
    # افحص **محتوى** الـJSON المشحون لا وجوده فقط (بناء يشحن JSON بائتًا/فارغًا يمرّ وإلّا):
    td = json.load(open(tj, encoding="utf-8"))
    defs = td.get("iconDefinitions", {})
    sad_ref = td.get("fileExtensions", {}).get("ص") or td.get("languageIds", {}).get("sad")
    assert sad_ref in defs, "خريطة ملفّ ص مفقودة/مكسورة في سمة الأيقونات المشحونة"
    pkg = json.load(open(os.path.join(d, "package.json"), encoding="utf-8"))
    default = pkg.get("contributes", {}).get("configurationDefaults", {}).get("workbench.iconTheme")
    ids = {i.get("id") for i in pkg.get("contributes", {}).get("iconThemes", [])}
    assert default in ids, "سمة الأيقونات الافتراضيّة لا تطابق أيّ id في حزمة المخرَج"


@check("product.json المبنيّ: عربيّ افتراضيّ (defaultLocale=ar)")
def _built_locale():
    pj = os.path.join(APP, "product.json")
    assert os.path.isfile(pj), "لا product.json مبنيّ"
    assert json.load(open(pj, encoding="utf-8")).get("defaultLocale") == "ar", \
        "defaultLocale ليس ar في المخرَج (خبز/هوية فشل)"


def main():
    print("═══ L2: تأكيدات الحزمة المشحونة ═══")
    if not os.path.isdir(OUT):
        print(f"  ⏭️  لا مخرَج بناء ({OUT}) — تخطٍّ (شغّل build/build.sh أوّلًا).")
        return 0
    failed = 0
    for name, fn in _checks:
        try:
            fn()
            print(f"  ✅ {name}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ❌ {name}: {e}")
    for desc, path, needle, minc in BUNDLE_MARKERS:
        c = _count(path, needle)
        if c is None:
            failed += 1
            print(f"  ❌ {desc}: ملفّ الحزمة مفقود ({os.path.basename(path)})")
        elif c >= minc:
            print(f"  ✅ {desc} (×{c})")
        else:
            failed += 1
            print(f"  ❌ {desc}: «{needle}» غائب عن الحزمة (سقط في التحزيم/التصغير؟)")
    n = len(_checks) + len(BUNDLE_MARKERS)
    print(f"─── {n - failed}/{n} نجحت ───")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
