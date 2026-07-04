#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""رُقعة نواة محراب: مؤشّر السحب/الإفلات بين تبويبات المحرّر في RTL — البند #18 (الطبقة 3).

حاوية التبويبات `.tabs-container` هي `display:flex` **بلا** `direction`/`flex-direction` صريح،
فتحت `dir=rtl` (رُقعة workbench) ينعكس محورها الرئيسيّ فيزيائيًّا: التبويب ذو الفهرس 0 يصير
أقصى اليمين. لكنّ منطق الإفلات المنبعيّ يفترض ترتيب DOM = يسار→يمين فيزيائيًّا في موضعين:

  1) فعل الإفلات (onDrop): `getTabDragOverLocation` يُرجع الجهة **الفيزيائيّة**؛ والمنبع يزيد
     الفهرس على الجهة اليمنى (`=== 'right'` ⇒ targetIndex++). في RTL الجهة الفيزيائيّة اليمنى
     تقابل فهرسًا **أدنى**، فيهبط التبويب في مكان خاطئ (خلل وظيفيّ لا تجميليّ فقط).
  2) المؤشّر البصريّ (computeDropTarget): يستعمل previous/nextElementSibling وisFirst/isLast
     على أنّها الأخ الفيزيائيّ الأيسر/الأيمن والحافّة اليسرى/اليمنى — معكوسة في RTL.

نصلح الموضعين بحارس RTL يُقاس من `getComputedStyle(...).direction` (الحقيقة الفيزيائيّة للتخطيط).
**في LTR القيم مطابقة للمنبع بايتًا** (mihrabTabsRtl=false ⇒ لا تغيّر سلوكيّ)، فصفر انحدار.
الأشجار/المستكشف خارج النطاق: إدراجها عموديّ (صفّ كامل .drop-target) محايد الاتّجاه أصلًا.

حدّ معروف (تجميليّ فقط): في وضع التبويبات الملتفّة (`.wrapping`/`wrapTabs`) يعالج المنبع حدود الصفوف
بصنف `last-in-row` وقواعد CSS تفترضه التبويب الفيزيائيّ الأيمن (وهو الأيسر في RTL). *فعل* الإفلات يبقى
صحيحًا دائمًا (يعتمد على التبويب المُحوَّم وحده)؛ الأثر المحتمل = إزاحة خطّ الإدراج البصريّ عند حدّ صفّ
ملتفّ في RTL فقط. يُغلَق لاحقًا بقاعدة CSS تعكس last-in-row↔first-in-row تحت `[dir=rtl] .wrapping`.

الملفّ المنبعيّ: src/vs/workbench/browser/parts/editor/multiEditorTabsControl.ts
idempotent (وسم mihrab-rtl-tabdrop)، كتابة ذرّيّة، Python 3.12-آمن، واعٍ بـCRLF (مراسٍ متعدّدة الأسطر).
الاستعمال: python patch_tabsdrop_rtl.py <مسار multiEditorTabsControl.ts>
"""
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

MARK = "mihrab-rtl-tabdrop"

# كلّ مُدخَل: (المرساة، البديل، العدد المتوقَّع). المراسي متعدّدة الأسطر تُطبَّع لـnl الملفّ.
EDITS = [
    # (1) فعل الإفلات: «بعدُ» في ترتيب النموذج = الجهة الفيزيائيّة اليمنى في LTR واليسرى في RTL.
    (
        "\t\t\t\tlet targetIndex = tabIndex;\n"
        "\t\t\t\tif (this.getTabDragOverLocation(e, tab) === 'right') {\n"
        "\t\t\t\t\ttargetIndex++;\n"
        "\t\t\t\t}",
        "\t\t\t\t// mihrab-rtl-tabdrop: تبويبات RTL معكوسة فيزيائيًّا (flex بلا direction صريح)،\n"
        "\t\t\t\t// فالجهة الفيزيائيّة اليمنى تقابل فهرسًا أدنى. «بعدُ» (targetIndex++) = النصف\n"
        "\t\t\t\t// الفيزيائيّ الأيسر عند RTL، واليمنى عند LTR (سلوك المنبع، mihrabTabsRtl=false).\n"
        "\t\t\t\tlet targetIndex = tabIndex;\n"
        "\t\t\t\tconst mihrabTabDropLoc = this.getTabDragOverLocation(e, tab);\n"
        "\t\t\t\t// نقيس الاتّجاه من حاوية الـflex مباشرةً (هي مَن ينعكس محورها) لا من التبويب.\n"
        "\t\t\t\tconst mihrabTabsRtl = getComputedStyle(tabsContainer).direction === 'rtl';\n"
        "\t\t\t\tif (mihrabTabDropLoc === (mihrabTabsRtl ? 'left' : 'right')) {\n"
        "\t\t\t\t\ttargetIndex++;\n"
        "\t\t\t\t}",
        1,
    ),
    # (2) المؤشّر البصريّ: اعكس الأخ الفيزيائيّ والحافّة الفيزيائيّة في RTL فقط.
    (
        "\t\tconst isLeftSideOfTab = this.getTabDragOverLocation(e, targetTab) === 'left';\n"
        "\t\tconst isLastTab = tabIndex === this.tabsModel.count - 1;\n"
        "\t\tconst isFirstTab = tabIndex === 0;\n"
        "\n"
        "\t\t// Before first tab\n"
        "\t\tif (isLeftSideOfTab && isFirstTab) {\n"
        "\t\t\treturn { leftElement: undefined, rightElement: targetTab };\n"
        "\t\t}\n"
        "\n"
        "\t\t// After last tab\n"
        "\t\tif (!isLeftSideOfTab && isLastTab) {\n"
        "\t\t\treturn { leftElement: targetTab, rightElement: undefined };\n"
        "\t\t}\n"
        "\n"
        "\t\t// Between two tabs\n"
        "\t\tconst tabBefore = isLeftSideOfTab ? targetTab.previousElementSibling : targetTab;\n"
        "\t\tconst tabAfter = isLeftSideOfTab ? targetTab : targetTab.nextElementSibling;\n"
        "\n"
        "\t\treturn { leftElement: tabBefore as HTMLElement, rightElement: tabAfter as HTMLElement };",
        "\t\tconst isLeftSideOfTab = this.getTabDragOverLocation(e, targetTab) === 'left';\n"
        "\t\tconst isLastTab = tabIndex === this.tabsModel.count - 1;\n"
        "\t\tconst isFirstTab = tabIndex === 0;\n"
        "\t\t// mihrab-rtl-tabdrop: التبويبات معكوسة فيزيائيًّا في RTL، فالأخ الفيزيائيّ الأيسر هو\n"
        "\t\t// nextElementSibling لا previous، والحافّة الفيزيائيّة اليسرى هي آخر تبويب لا أوّله.\n"
        "\t\t// نعكس الإسنادات عند RTL فقط؛ في LTR القيم مطابقة للمنبع بايتًا (mihrabTabsRtl=false).\n"
        "\t\t// نقيس الاتّجاه من حاوية التبويبات (الأب) — هي مَن ينعكس محور الـflex فيها.\n"
        "\t\tconst mihrabTabsRtl = getComputedStyle(targetTab.parentElement ?? targetTab).direction === 'rtl';\n"
        "\t\tconst mihrabPhysFirst = mihrabTabsRtl ? isLastTab : isFirstTab;\n"
        "\t\tconst mihrabPhysLast = mihrabTabsRtl ? isFirstTab : isLastTab;\n"
        "\t\tconst mihrabPhysPrev = mihrabTabsRtl ? targetTab.nextElementSibling : targetTab.previousElementSibling;\n"
        "\t\tconst mihrabPhysNext = mihrabTabsRtl ? targetTab.previousElementSibling : targetTab.nextElementSibling;\n"
        "\n"
        "\t\t// Before physically-leftmost tab\n"
        "\t\tif (isLeftSideOfTab && mihrabPhysFirst) {\n"
        "\t\t\treturn { leftElement: undefined, rightElement: targetTab };\n"
        "\t\t}\n"
        "\n"
        "\t\t// After physically-rightmost tab\n"
        "\t\tif (!isLeftSideOfTab && mihrabPhysLast) {\n"
        "\t\t\treturn { leftElement: targetTab, rightElement: undefined };\n"
        "\t\t}\n"
        "\n"
        "\t\t// Between two tabs (physical prev/next)\n"
        "\t\tconst tabBefore = isLeftSideOfTab ? mihrabPhysPrev : targetTab;\n"
        "\t\tconst tabAfter = isLeftSideOfTab ? targetTab : mihrabPhysNext;\n"
        "\n"
        "\t\treturn { leftElement: tabBefore as HTMLElement, rightElement: tabAfter as HTMLElement };",
        1,
    ),
]


def main() -> int:
    if len(sys.argv) != 2:
        print("الاستعمال: python patch_tabsdrop_rtl.py <مسار multiEditorTabsControl.ts>", file=sys.stderr)
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

    # خلط النهايات في ملفّ واحد ⇒ مرساة LF لا تطابق nl=CRLF ⇒ إجهاض صاخب (return 1) لا إفساد.
    nl = "\r\n" if "\r\n" in text else "\n"
    for old, _new, count in EDITS:
        old_nl = old.replace("\n", nl)
        if text.count(old_nl) != count:
            print(
                f"⚠️ عدد تطابقات غير متوقَّع ({text.count(old_nl)}≠{count}) لمرساة الإفلات في "
                f"multiEditorTabsControl.ts: «{old[:44]}...» — ربّما تغيّر المنبع.",
                file=sys.stderr,
            )
            return 1
    for old, new, count in EDITS:
        text = text.replace(old.replace("\n", nl), new.replace("\n", nl), count)

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

    print("✅ رُقِّع multiEditorTabsControl.ts (اتّجاه إفلات التبويبات + مؤشّره RTL، LTR مطابق).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
