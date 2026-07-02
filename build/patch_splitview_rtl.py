#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""رُقعة نواة محراب: اتّجاه SplitView الأفقيّ عامًّا (كلّ الشرائط/اللوحات) — RTL-2 (الطبقة 3).

يجعل **كلّ** SplitView أفقيّ مستقلّ يتدفّق RTL (أوّل عرض يمينًا): محرّر الإعدادات،
محرّر الاختصارات، عرض النظرة الخاطفة (peek)، وأيّ لوحة master-detail. الإزاحة التراكميّة
نفسها مع `right` بدل `left` تعطي RTL.

**استثناء حاسم — splitview الشبكة**: تخطيط workbench **وشبكة المحرّر** مبنيّان على SplitView
عبر gridview، ويُداران اتّجاهيًّا بإعادة ترتيب العقد (إعداد موضع الشريط الجانبي). قلبهما هنا
= قلب مزدوج يكسر التخطيط. لا نستطيع الاستثناء بـ`closest('.monaco-grid-view')` لأنّ محرّر
الإعدادات/peek **يُصيَّر داخل شبكة المحرّر** فيُستثنى خطأً (عيب رصدته مراجعة Amelia). عوضًا:
نقلب فقط حين تكون **أقرب** `.monaco-split-view2` **بلا** الوسم `mihrab-grid-sv` (يضعه
`patch_gridview_marker.py` على splitview الذي يُنشئه gridview) — فيصيب المستقلّة فقط رغم التداخل.

يُرافقها رُقعة المقبض (patch_sash_rtl.py) بنفس القيد كي يحاذي المقبض العروضَ المقلوبة،
وقاعدة CSS للفاصل. الشرط: اتّجاه المستند rtl (يضبطه patch_workbench_rtl على <html>).

الملفّ المنبعيّ: src/vs/base/browser/ui/splitview/splitview.ts (HorizontalViewItem).
idempotent (وسم mihrab-rtl-split)، كتابة ذرّيّة، Python 3.12-آمن، واعٍ بـCRLF.
الاستعمال: python patch_splitview_rtl.py <مسار splitview.ts>
"""
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

MARK = "mihrab-rtl-split"

ANCHOR = (
    "\tlayoutContainer(offset: number): void {\n"
    "\t\tthis.container.style.left = `${offset}px`;\n"
    "\t\tthis.container.style.width = `${this.size}px`;\n"
    "\t}"
)

REPLACEMENT = (
    "\tlayoutContainer(offset: number): void {\n"
    "\t\t// mihrab-rtl-split: في RTL نوضِع SplitView المستقلّة من اليمين (الإزاحة التراكميّة نفسها\n"
    "\t\t// تعطي RTL). نستثني splitview الشبكة عبر أقرب .monaco-split-view2 يحمل mihrab-grid-sv.\n"
    "\t\tconst mihrabSv = this.container.closest('.monaco-split-view2');\n"
    "\t\tif (mihrabSv && !mihrabSv.classList.contains('mihrab-grid-sv') && this.container.closest('.monaco-workbench[dir=\"rtl\"]')) {\n"
    "\t\t\tthis.container.style.right = `${offset}px`;\n"
    "\t\t\tthis.container.style.left = 'auto';\n"
    "\t\t} else {\n"
    "\t\t\tthis.container.style.left = `${offset}px`;\n"
    "\t\t\tthis.container.style.right = 'auto';\n"
    "\t\t}\n"
    "\t\tthis.container.style.width = `${this.size}px`;\n"
    "\t}"
)


def main() -> int:
    if len(sys.argv) != 2:
        print("الاستعمال: python patch_splitview_rtl.py <مسار splitview.ts>", file=sys.stderr)
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

    nl = "\r\n" if "\r\n" in text else "\n"
    anchor = ANCHOR.replace("\n", nl)
    if anchor not in text:
        print("⚠️ لم تُعثَر مرساة HorizontalViewItem.layoutContainer في splitview.ts — ربّما تغيّر المنبع.", file=sys.stderr)
        return 1

    text = text.replace(anchor, REPLACEMENT.replace("\n", nl), 1)

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

    print("✅ رُقِّع splitview.ts (اتّجاه SplitView الأفقيّ RTL عامًّا، باستثناء الشبكة).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
