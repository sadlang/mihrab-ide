#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""رُقعة نواة محراب: محاذاة منسدلة شريط القوائم في RTL — RTL-2 (الطبقة 3).

العطل: في RTL، شريط القوائم على اليمين، لكنّ الفرع الافتراضيّ في menubar.ts يضبط
`menuHolder.style.left = titleBoundingRect.left` فتمتدّ المنسدلة يمينًا وتخرج من حافّة
النافذة اليمنى. الإصلاح: في RTL نثبّت الحافّة اليمنى للمنسدلة عند الحافّة اليمنى للعنوان،
فتمتدّ يسارًا داخل الشاشة.

الملفّ المنبعيّ: src/vs/base/browser/ui/menu/menubar.ts (فرع الموضع الافتراضيّ).
لماذا تعذّرت طبقة أدنى: الموضع محسوب بـJavaScript (style.left) لا CSS؛ لا سبيل لإصلاحه
من إعداد أو ورقة أنماط.

idempotent عبر الوسم mihrab-rtl-menubar. كتابة ذرّيّة. Python 3.12-آمن.
الاستعمال: python patch_menubar_rtl.py <مسار menubar.ts>
"""
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

MARK = "mihrab-rtl-menubar"

# تُكتب بـ\n ثمّ تُطابَق نهاية سطر الملفّ الفعليّة (CRLF/LF) وقت التشغيل — المصدر CRLF.
ANCHOR = (
    "\t\t} else {\n"
    "\t\t\tmenuHolder.style.left = `${titleBoundingRect.left * titleBoundingRectZoom}px`;\n"
    "\t\t}"
)

REPLACEMENT = (
    "\t\t} else if (DOM.getComputedStyle(this.container).direction === 'rtl') {\n"
    "\t\t\t// mihrab-rtl-menubar: في RTL ثبّت الحافّة اليمنى للمنسدلة عند الحافّة اليمنى للعنوان\n"
    "\t\t\t// فتمتدّ المنسدلة يسارًا داخل الشاشة بدل الخروج من حافّة النافذة اليمنى.\n"
    "\t\t\tconst mihrabWindowWidth = DOM.getWindow(this.container).innerWidth;\n"
    "\t\t\tmenuHolder.style.right = `${mihrabWindowWidth - titleBoundingRect.right * titleBoundingRectZoom}px`;\n"
    "\t\t\tmenuHolder.style.left = 'auto';\n"
    "\t\t} else {\n"
    "\t\t\tmenuHolder.style.left = `${titleBoundingRect.left * titleBoundingRectZoom}px`;\n"
    "\t\t}"
)


def main() -> int:
    if len(sys.argv) != 2:
        print("الاستعمال: python patch_menubar_rtl.py <مسار menubar.ts>", file=sys.stderr)
        return 2
    path = sys.argv[1]
    try:
        with open(path, "r", encoding="utf-8", newline="") as f:
            text = f.read()
    except OSError as e:
        print(f"⚠️ تعذّر فتح {path}: {e}", file=sys.stderr)
        return 1

    if MARK in text:
        print("مُرقَّع مسبقًا — تخطٍّ.")
        return 0

    # طابِق نهاية سطر الملفّ الفعليّة (CRLF على ويندوز، LF على CI/mac).
    nl = "\r\n" if "\r\n" in text else "\n"
    anchor = ANCHOR.replace("\n", nl)
    replacement = REPLACEMENT.replace("\n", nl)
    if anchor not in text:
        print("⚠️ لم تُعثَر مرساة موضع المنسدلة في menubar.ts — ربّما تغيّر المنبع.", file=sys.stderr)
        return 1

    text = text.replace(anchor, replacement, 1)

    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        os.replace(tmp, path)
    except OSError as e:
        try:
            os.remove(tmp)
        except OSError:
            pass
        print(f"⚠️ تعذّر كتابة {path}: {e}", file=sys.stderr)
        return 1

    print("✅ رُقِّع menubar.ts (محاذاة المنسدلة يمينًا في RTL).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
