#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""رُقعة نواة محراب: موضع المقبض العموديّ (sash) في RTL — RTL-2 (الطبقة 3).

مُرافِقة لـpatch_splitview_rtl.py: حين تُقلَب عروض SplitView الأفقيّ لليمين، يجب أن يُقلَب
المقبض الفاصل بينها كذلك وإلا وقع في مكان خاطئ (لا يحاذي الحدّ بين العرضين). المقبض العموديّ
يُوضَع بـ`style.left = getVerticalSashLeft(...)` (تراكميّ من اليسار = مجموع أحجام العروض قبله).
نضبطه `style.right = ...` بنفس القيمة عند RTL (خارج الشبكة) فيحاذي العروض المقلوبة.

نفس قيد رُقعة SplitView: القشرة RTL **و** أقرب `.monaco-split-view2` بلا وسم `mihrab-grid-sv`
(splitview الشبكة) — فيحاذي المقبضُ العروضَ المقلوبة في اللوحات المستقلّة فقط.

الملفّ المنبعيّ: src/vs/base/browser/ui/sash/sash.ts (Sash.layout، فرع VERTICAL).
idempotent (وسم mihrab-rtl-sash)، كتابة ذرّيّة، Python 3.12-آمن، واعٍ بـCRLF.
الاستعمال: python patch_sash_rtl.py <مسار sash.ts>
"""
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

MARK = "mihrab-rtl-sash"

ANCHOR = "\t\t\tthis.el.style.left = verticalProvider.getVerticalSashLeft(this) - (this.size / 2) + 'px';"

REPLACEMENT = (
    "\t\t\t// mihrab-rtl-sash: طابِق قلبَ عروض SplitView المستقلّة في RTL فيحاذي المقبضُ الحدَّ.\n"
    "\t\t\t// نستثني مقابض splitview الشبكة عبر أقرب .monaco-split-view2 يحمل mihrab-grid-sv.\n"
    "\t\t\tconst mihrabSashOffset = verticalProvider.getVerticalSashLeft(this) - (this.size / 2);\n"
    "\t\t\tconst mihrabSashSv = this.el.closest('.monaco-split-view2');\n"
    "\t\t\tif (mihrabSashSv && !mihrabSashSv.classList.contains('mihrab-grid-sv') && this.el.closest('.monaco-workbench[dir=\"rtl\"]')) {\n"
    "\t\t\t\tthis.el.style.right = mihrabSashOffset + 'px';\n"
    "\t\t\t\tthis.el.style.left = 'auto';\n"
    "\t\t\t} else {\n"
    "\t\t\t\tthis.el.style.left = mihrabSashOffset + 'px';\n"
    "\t\t\t\tthis.el.style.right = 'auto';\n"
    "\t\t\t}"
)


def main() -> int:
    if len(sys.argv) != 2:
        print("الاستعمال: python patch_sash_rtl.py <مسار sash.ts>", file=sys.stderr)
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
    anchor = ANCHOR  # سطر واحد (لا حسّاسيّة CRLF)
    if anchor not in text:
        print("⚠️ لم تُعثَر مرساة موضع المقبض العموديّ في sash.ts — ربّما تغيّر المنبع.", file=sys.stderr)
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

    print("✅ رُقِّع sash.ts (موضع المقبض العموديّ RTL، باستثناء الشبكة).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
