#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""رُقعة نواة محراب: اتّجاه القشرة من اليمين (RTL) — مرحلة RTL-0 (الطبقة 3).

الغرض: محراب محرّر عربيّ-أوّلًا، فالاتّجاه من اليمين **هويّة لا خيار**. نضبط
`dir="rtl"` على حاوية .monaco-workbench فيتتالى على معظم القشرة، ونستورد ورقة
`mihrab-rtl.css` (التي تحمي المحرّر/الطرفيّة LTR وتُصلِح الكسور المبكّرة).

الملفّ المنبعيّ: src/vs/workbench/browser/workbench.ts (renderWorkbench).
لماذا تعذّرت طبقة أدنى: لا سبيل لضبط اتّجاه القشرة الجذر من إعداد أو إضافة؛ يجب
على حاوية workbench نفسها قبل بناء الأجزاء.

idempotent عبر الوسم mihrab-rtl. كتابة ذرّيّة (tmp + os.replace). Python 3.12-آمن
(open(..., newline="") لا Path.read_text(newline=)).

الاستعمال: python patch_workbench_rtl.py <مسار workbench.ts>
"""
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

MARK = "mihrab-rtl"

# مرساة الاستيراد: سطر استيراد قائم ومستقرّ قرب رأس الملفّ.
IMPORT_ANCHOR = "import { runWhenWindowIdle } from '../../base/browser/dom.js';"
IMPORT_INJECT = "\nimport './media/mihrab-rtl.css'; /* mihrab-rtl */"

# مرساة ضبط الاتّجاه: بعد إضافة أصناف القشرة مباشرةً، قبل بناء الأجزاء.
DIR_ANCHOR = "\t\tthis.mainContainer.classList.add(...workbenchClasses);"
DIR_INJECT = (
    "\n\t\t// محراب: اتّجاه القشرة من اليمين (RTL-0). الكود يبقى LTR عبر mihrab-rtl.css."
    "\n\t\t// نضبط dir على documentElement (<html>) أيضًا كي يرث كلّ شيء الاتّجاه — بما فيه"
    "\n\t\t// مضيفو Shadow DOM (القوائم السياقيّة) أينما التصقوا، والنوافذ المساعِدة عبر trackAttributes."
    "\n\t\tthis.mainContainer.setAttribute('dir', 'rtl'); /* mihrab-rtl */"
    "\n\t\tthis.mainContainer.ownerDocument.documentElement.setAttribute('dir', 'rtl'); /* mihrab-rtl */"
)


def main() -> int:
    if len(sys.argv) != 2:
        print("الاستعمال: python patch_workbench_rtl.py <مسار workbench.ts>", file=sys.stderr)
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

    for anchor, label in ((IMPORT_ANCHOR, "الاستيراد"), (DIR_ANCHOR, "ضبط الاتّجاه")):
        if anchor not in text:
            print(f"⚠️ لم تُعثَر مرساة «{label}» في workbench.ts — ربّما تغيّر المنبع.", file=sys.stderr)
            return 1

    text = text.replace(IMPORT_ANCHOR, IMPORT_ANCHOR + IMPORT_INJECT, 1)
    text = text.replace(DIR_ANCHOR, DIR_ANCHOR + DIR_INJECT, 1)

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

    print("✅ رُقِّع workbench.ts (اتّجاه القشرة RTL + استيراد mihrab-rtl.css).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
