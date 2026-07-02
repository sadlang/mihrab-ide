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
APP = os.path.join(ROOT, ".upstream", "VSCode-win32-x64", "resources", "app")
OUT = os.path.join(APP, "out")
JS = os.path.join(OUT, "vs", "workbench", "workbench.desktop.main.js")
CSS = os.path.join(OUT, "vs", "workbench", "workbench.desktop.main.css")
EXE = os.path.join(ROOT, ".upstream", "VSCode-win32-x64", "Mihrab.exe")

# (وصف، ملفّ، سلسلة يجب وجودها، أدنى عدد)
BUNDLE_MARKERS = [
    # JS — طبقة النواة (الطبقة 3)
    ("workbench dir=rtl (القشرة عربيّة الاتّجاه)", JS, 'setAttribute("dir","rtl")', 1),
    ("استيراد ورقة mihrab-rtl في workbench", JS, "mihrab-rtl", 1),
    ("محرّر: محاذاة ودجة المحتوى بالـcaret (cwpos)", JS, ".cursors-layer .cursor", 1),
    ("محرّر: تمرير لاصق RTL (sticky content)", JS, "sticky-line-content", 1),
    # CSS — طبقة الأنماط (mihrab-rtl.css)
    ("CSS13: مسطرة النظرة يسارًا", CSS, "decorationsOverviewRuler", 1),
    ("CSS14: أرقام التمرير اللاصق يمينًا", CSS, "sticky-widget-line-numbers", 1),
    ("CSS15: ودجة الاقتراحات RTL", CSS, "suggest-widget{direction:rtl}", 1),
    ("CSS16: مرآة الإشعارات (مقصورة)", CSS, "notifications-toasts:not(.bottom-left)", 1),
    ("CSS16: مرآة الزرّ العائم", CSS, "floating-click-widget", 1),
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
