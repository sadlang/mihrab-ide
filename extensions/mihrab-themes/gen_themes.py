#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""مولِّد سمتَي محراب (JSON) — مصدر الحقيقة للسمتين (داكنة/فاتحة متوازيتان).

يُخرّط لوحتَي ألوان الرموز على نطاقات نحو ص الفعليّة (sad.tmLanguage.json)
+ أنواع رموز LSP الدلاليّة (من legend الخادم الفعليّ). أعِد التشغيل عند تعديل اللوحة:
    py -3 extensions/mihrab-themes/gen_themes.py

قرارات (مراجعة Amelia):
  • الألوان الفاتحة مُغمَّقة لتحقّق تباين WCAG AA (≥4.5:1) على الحجر الجيريّ #F5F0E4.
  • تعليق الداكنة مُفتَّح إلى ≥4.5:1 على الليل #0F1C24.
  • «صحيح/خطأ/لاشيء» (constant.language) بلون الكلمة المفتاحيّة — لأنّ LSP يصنّفها Keyword،
    فتوحيد اللون يمنع تذبذب اللون بين وضعَي النحو والدلالة.
  • مؤشّر الإدخال (editorCursor) يبقى ذهبيًّا رغم أنّ الكلمات المفتاحيّة صارت ذهبيّة: الذهب
    هو نبرة «القضيب» في شعار القوس (assets/branding) — والمؤشّر يتمايز بالشكل والوميض
    والحركة لا باللون، فبقاؤه ذهبيًّا اختيارُ هويّة مقصود لا انجرافًا.
  • لا selfKeyword في الرموز الدلاليّة: خادم ص لا يُصدره (يصنّف «هذا» كـKeyword).
  • meta.interpolation بلا foreground: نلوّن المحتوى الداخليّ لا الحاوية.
"""
import json
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "themes")

# ── لوحتا ألوان الرموز (token → hex) ──
# لوحة التصميم البصريّ (نماذج محراب) — خمس فئات دلاليّة، **خمس عائلات لونيّة متمايزة**:
#   كلمة مفتاحيّة = ذهب  ·  نوع = أزرق  ·  دالّة = فيروزيّ  ·  نصّ = أخضر  ·  رقم = نُحاسيّ.
# الفئات الهادئة (تعليق/عامل/متغيّر) تبقى رماديّات مقصودة — تمايزها بالوظيفة والمَيْل لا باللون.
#
# ⚠️ قيدان يفرضهما اختبار L0 «سمتا محراب: تباين AA + تمايز اللوحة» (tests/static/lint_patchers.py)
# ولا يجوز خرقهما عند أيّ إعادة تلوين — القيم أدناه مُتحقَّقة عدديًّا لا مُقدَّرة بالعين:
#   (أ) تباين WCAG AA ≥ 4.5:1 لكلّ لون على خلفيّة محرّره (الليل #0F1C24 / الحجر #F5F0E4).
#   (ب) فارق ΔE76 ≥ 25 بين كلّ زوج من الفئات الخمس الدلاليّة — وإلّا انهارت اللوحة إلى كتل
#       متشابهة. (النسخة السابقة جعلت المفتاح #E3BE68 والرقم #D9A94E على بُعد ΔE=9.4 فقط —
#       ذهبان متطابقان عمليًّا؛ والنصّ #8FCBA8 والدالّة #7FD1C1 على بُعد 11.6. أُصلِح هنا
#       بإرجاع الرقم إلى نُحاسيّ حقيقيّ والنصّ إلى أخضر حقيقيّ بعيدًا عن فيروزيّ الدالّة.)
DARK = dict(cm="#738991", kw="#E3BE68", cls="#6FB2D8", fn="#7FD1C1", str="#A8CC85",
            num="#E2926A", bool="#E2926A", op="#9DB0B6", var="#D4DEDF", esc="#E2926A")
# الفاتحة: النبرات نفسها مُغمَّقة لعتبة AA على الحجر #F5F0E4 مع حفظ ترتيب العائلات الخمس.
LIGHT = dict(cm="#626B75", kw="#8A5A0E", cls="#255F87", fn="#0E776A", str="#4C6B22",
             num="#A6431A", bool="#A6431A", op="#5D6B6F", var="#43565A", esc="#A6431A")

# ── لوحتا التباين العالي (hc-black / hc-light) ──
# لماذا وُجدتا: أصول الهوية تشحن letterpress-hcDark/hcLight منذ البداية، لكن لم تكن ثمّة
# سمتا تباين عالٍ تُقرَنان بهما — فمستخدم التباين العالي (وهو **أحوج** الناس إلى تصميم
# مقصود) كان يقع على سمة VS Code العامّة بلا أثر من محراب. العائلات الخمس نفسها، مُشبَعة
# ومُفتَّحة/مُغمَّقة إلى **AAA (‏≥7:1)** على أسودَ/أبيضَ خالصين — يفرضه حارس L0 بعتبة أعلى.
HC_DARK = dict(cm="#9FB3BA", kw="#FFD479", cls="#7FC4EC", fn="#6FE7D2", str="#B8E986",
               num="#FFAE85", bool="#FFAE85", op="#C3D2D7", var="#FFFFFF", esc="#FFAE85")
# الرقم نُحاسيّ محروق (#99270A لا #8A3200): التغميق إلى AAA كان يقارب الذهب (ΔE=24)،
# فأُزيح نحو الأحمر ليحفظ ΔE≥25 — القيد نفسه المفروض على السمتين العاديّتين.
HC_LIGHT = dict(cm="#4A5560", kw="#6B4400", cls="#00457A", fn="#00564C", str="#33520C",
                num="#99270A", bool="#99270A", op="#37474F", var="#101418", esc="#99270A")

WB_DARK = {
    "editor.background": "#0F1C24", "editor.foreground": "#D4DEDF",
    "editorLineNumber.foreground": "#5A6E77", "editorLineNumber.activeForeground": "#9DB0B6",
    "editor.lineHighlightBackground": "#16262E", "editor.selectionBackground": "#22463F",
    "editor.selectionHighlightBackground": "#1C3A36", "editorCursor.foreground": "#E3BE68",
    "editorWhitespace.foreground": "#263A42", "editorIndentGuide.background1": "#20343C",
    "editorIndentGuide.activeBackground1": "#3A5560", "editorBracketMatch.background": "#22463F",
    "editorBracketMatch.border": "#31A796", "focusBorder": "#31A796", "foreground": "#C4CFD1",
    "titleBar.activeBackground": "#182A34", "titleBar.activeForeground": "#C4CFD1",
    "titleBar.inactiveBackground": "#142129", "titleBar.inactiveForeground": "#63767C",
    "activityBar.background": "#142129", "activityBar.foreground": "#D4DEDF",
    "activityBar.inactiveForeground": "#63767C", "activityBar.activeBorder": "#31A796",
    "activityBarBadge.background": "#31A796", "activityBarBadge.foreground": "#062420",
    "sideBar.background": "#12212B", "sideBar.foreground": "#B7C2C4",
    "sideBarSectionHeader.background": "#182A34", "sideBarTitle.foreground": "#8CA0A6",
    "statusBar.background": "#31A796", "statusBar.foreground": "#062420",
    "statusBar.noFolderBackground": "#2A8577", "statusBar.debuggingBackground": "#C0563B",
    "tab.activeBackground": "#0F1C24", "tab.inactiveBackground": "#152530",
    "tab.activeForeground": "#EDE6D6", "tab.inactiveForeground": "#7E9199",
    "tab.activeBorderTop": "#31A796", "tab.border": "#182A34",
    "editorGroupHeader.tabsBackground": "#152530", "panel.background": "#12212B",
    "panelTitle.activeForeground": "#D4DEDF", "terminal.background": "#0F1C24",
    "terminal.foreground": "#D4DEDF", "input.background": "#152530",
    "input.foreground": "#D4DEDF", "input.border": "#2A424E", "dropdown.background": "#152530",
    "list.activeSelectionBackground": "#204640", "list.activeSelectionForeground": "#EDE6D6",
    # مشتقّ من DARK["kw"] (نظير القشرة الفاتحة) — لا هكس جامد ينجرف عن اللوحة.
    "list.hoverBackground": "#182A34", "list.highlightForeground": DARK["kw"],
    "button.background": "#31A796", "button.foreground": "#062420",
    "button.hoverBackground": "#3BB9A8", "badge.background": "#31A796",
    "badge.foreground": "#062420", "progressBar.background": DARK["kw"],
    "textLink.foreground": DARK["cls"], "textLink.activeForeground": "#96C9E6",
    "scrollbarSlider.background": "#2A424E80", "scrollbarSlider.hoverBackground": "#3A5560AA",
    "editorWidget.background": "#152530", "editorSuggestWidget.background": "#152530",
    "editorSuggestWidget.selectedBackground": "#204640", "editorHoverWidget.background": "#152530",
    "peekViewEditor.background": "#12212B",
}
WB_LIGHT = {
    "editor.background": "#F5F0E4", "editor.foreground": "#33474C",
    "editorLineNumber.foreground": "#8F856F", "editorLineNumber.activeForeground": "#6E6552",
    "editor.lineHighlightBackground": "#ECE5D2", "editor.selectionBackground": "#D3E1D8",
    "editor.selectionHighlightBackground": "#DFE8DC", "editorCursor.foreground": "#C79A3E",
    "editorWhitespace.foreground": "#DAD0BC", "editorIndentGuide.background1": "#E0D8C6",
    "editorIndentGuide.activeBackground1": "#C3B79C", "editorBracketMatch.background": "#D3E1D8",
    "editorBracketMatch.border": "#0F7C6E", "focusBorder": "#0F7C6E", "foreground": "#4A5A50",
    "titleBar.activeBackground": "#EAE3D1", "titleBar.activeForeground": "#3E4E44",
    "titleBar.inactiveBackground": "#EFE8D8", "titleBar.inactiveForeground": "#8A7F6B",
    "activityBar.background": "#EAE3D1", "activityBar.foreground": "#33474C",
    "activityBar.inactiveForeground": "#7E7462", "activityBar.activeBorder": "#0F7C6E",
    "activityBarBadge.background": "#0F7C6E", "activityBarBadge.foreground": "#EAF6F2",
    "sideBar.background": "#EFE8D8", "sideBar.foreground": "#4A5A50",
    "sideBarSectionHeader.background": "#E7E0CE", "sideBarTitle.foreground": "#6E6553",
    "statusBar.background": "#0F7C6E", "statusBar.foreground": "#EAF6F2",
    "statusBar.noFolderBackground": "#0E6A5F", "statusBar.debuggingBackground": "#BB552B",
    "tab.activeBackground": "#F5F0E4", "tab.inactiveBackground": "#E7E0CE",
    "tab.activeForeground": "#2C3B40", "tab.inactiveForeground": "#7A6F5C",
    "tab.activeBorderTop": "#0F7C6E", "tab.border": "#E7E0CE",
    "editorGroupHeader.tabsBackground": "#E7E0CE", "panel.background": "#EFE8D8",
    "panelTitle.activeForeground": "#33474C", "terminal.background": "#F5F0E4",
    "terminal.foreground": "#33474C", "input.background": "#FBF7EC",
    "input.foreground": "#33474C", "input.border": "#D4C9B0", "dropdown.background": "#FBF7EC",
    "list.activeSelectionBackground": "#D3E1D8", "list.activeSelectionForeground": "#243B36",
    # الذهب/الأزرق هنا مشتقّان من LIGHT["kw"]/LIGHT["cls"] (لا هكسات جامدة سابقة) كي لا
    # تنجرف القشرة عن لوحة الرموز عند أيّ إعادة تلوين — L0 يتحقّق من الاشتقاق.
    "list.hoverBackground": "#EAE3D1", "list.highlightForeground": LIGHT["kw"],
    "button.background": "#0F7C6E", "button.foreground": "#EAF6F2",
    "button.hoverBackground": "#12897A", "badge.background": "#0F7C6E",
    "badge.foreground": "#EAF6F2", "progressBar.background": LIGHT["kw"],
    "textLink.foreground": LIGHT["cls"], "textLink.activeForeground": "#2E7BAB",
    "scrollbarSlider.background": "#C3B79C80", "scrollbarSlider.hoverBackground": "#B3A992AA",
    "editorWidget.background": "#EFE8D8", "editorSuggestWidget.background": "#F1EBDD",
    "editorSuggestWidget.selectedBackground": "#D9E5DC", "editorHoverWidget.background": "#F1EBDD",
    "peekViewEditor.background": "#EFE8D8",
}


# قشرتا التباين العالي. المبدأ المميِّز عن السمتين العاديّتين: **حدودٌ لا تدرّجات** —
# `contrastBorder` يجعل VS Code يرسم حدًّا حول كلّ عنصر بدل الاعتماد على فروق خلفيّة خافتة،
# و`contrastActiveBorder` يبرز العنصر النشط. الخلفيّة سوداء/بيضاء خالصتان (لا نبرة محرابيّة
# هنا عمدًا: التباين يسبق الهوية حين يتعارضان — والهوية تبقى في النبرات والشعار والزخرفة).
def _wb_hc(p, bg, fg, panel, sel, sel_fg, muted):
    """قشرة تباين عالٍ مشتقّة من اللوحة — لا هكسات مكرَّرة تنجرف عنها."""
    return {
        "editor.background": bg, "editor.foreground": fg,
        "contrastBorder": p["fn"], "contrastActiveBorder": p["kw"],
        "focusBorder": p["kw"], "foreground": fg,
        "editorLineNumber.foreground": p["cm"], "editorLineNumber.activeForeground": fg,
        "editor.lineHighlightBorder": p["fn"], "editor.selectionBackground": sel,
        "editor.selectionForeground": sel_fg, "editorCursor.foreground": p["kw"],
        "editorWhitespace.foreground": muted, "editorIndentGuide.background1": muted,
        "editorIndentGuide.activeBackground1": p["fn"],
        "editorBracketMatch.background": bg, "editorBracketMatch.border": p["kw"],
        "titleBar.activeBackground": bg, "titleBar.activeForeground": fg,
        "titleBar.inactiveBackground": bg, "titleBar.inactiveForeground": p["cm"],
        "activityBar.background": bg, "activityBar.foreground": fg,
        "activityBar.inactiveForeground": p["cm"], "activityBar.activeBorder": p["kw"],
        "activityBarBadge.background": p["kw"], "activityBarBadge.foreground": bg,
        "sideBar.background": bg, "sideBar.foreground": fg,
        "sideBarSectionHeader.background": panel, "sideBarTitle.foreground": fg,
        "statusBar.background": bg, "statusBar.foreground": fg,
        "statusBar.border": p["fn"], "statusBar.noFolderBackground": bg,
        "statusBar.debuggingBackground": bg,
        "tab.activeBackground": bg, "tab.inactiveBackground": bg,
        "tab.activeForeground": fg, "tab.inactiveForeground": p["cm"],
        "tab.activeBorderTop": p["kw"], "tab.border": p["fn"],
        "editorGroupHeader.tabsBackground": bg, "panel.background": bg,
        "panel.border": p["fn"], "panelTitle.activeForeground": fg,
        "terminal.background": bg, "terminal.foreground": fg,
        "input.background": bg, "input.foreground": fg, "input.border": p["fn"],
        "dropdown.background": bg, "dropdown.border": p["fn"],
        "list.activeSelectionBackground": sel, "list.activeSelectionForeground": sel_fg,
        "list.hoverBackground": panel, "list.highlightForeground": p["kw"],
        "button.background": bg, "button.foreground": fg, "button.border": p["fn"],
        "button.hoverBackground": panel,
        "badge.background": p["kw"], "badge.foreground": bg,
        "progressBar.background": p["kw"],
        "textLink.foreground": p["cls"], "textLink.activeForeground": p["kw"],
        "scrollbarSlider.background": muted, "scrollbarSlider.hoverBackground": p["cm"],
        "editorWidget.background": bg, "editorWidget.border": p["fn"],
        "editorSuggestWidget.background": bg, "editorSuggestWidget.border": p["fn"],
        "editorSuggestWidget.selectedBackground": sel,
        "editorHoverWidget.background": bg, "editorHoverWidget.border": p["fn"],
        "peekViewEditor.background": bg,
    }


WB_HC_DARK = _wb_hc(HC_DARK, "#000000", "#FFFFFF", "#0D0D0D", "#00463E", "#FFFFFF", "#4A5A5F")
WB_HC_LIGHT = _wb_hc(HC_LIGHT, "#FFFFFF", "#101418", "#F2F2F2", "#CFE6E0", "#101418", "#8A9499")


def token_colors(p):
    """يُخرّط لوحة الرموز على نطاقات sad.tmLanguage.json الفعليّة."""
    return [
        {"name": "تعليق", "scope": [
            "comment", "comment.line.number-sign.sad", "comment.block.sad",
            "comment.line.documentation.sad", "comment.block.documentation.sad"],
         "settings": {"foreground": p["cm"], "fontStyle": "italic"}},
        {"name": "كلمة مفتاحيّة", "scope": [
            "keyword.control.sad", "keyword.control.directive.sad", "keyword.other.sad",
            "keyword.operator.word.sad", "storage.modifier.sad",
            "storage.modifier.lifetime.sad", "constant.language", "constant.language.sad"],
         "settings": {"foreground": p["kw"]}},
        {"name": "نوع", "scope": ["storage.type.sad", "support.type.sad"],
         "settings": {"foreground": p["cls"]}},
        {"name": "عامل", "scope": ["keyword.operator.sad"], "settings": {"foreground": p["op"]}},
        {"name": "نصّ", "scope": [
            "string", "string.quoted.double.sad", "string.quoted.raw.sad",
            "string.quoted.interpolated.sad"], "settings": {"foreground": p["str"]}},
        {"name": "هروب", "scope": ["constant.character.escape.sad"],
         "settings": {"foreground": p["esc"]}},
        {"name": "رقم", "scope": [
            "constant.numeric", "constant.numeric.decimal.sad", "constant.numeric.hex.sad",
            "constant.numeric.binary.sad", "constant.numeric.octal.sad"],
         "settings": {"foreground": p["num"]}},
    ]


def semantic(p):
    """رموز LSP الدلاليّة — أنواع من legend خادم ص الفعليّ فقط (لا selfKeyword: غير مُصدَر)."""
    return {
        "function": p["fn"], "method": p["fn"],
        "class": p["cls"], "struct": p["cls"], "enum": p["cls"], "interface": p["cls"],
        "type": p["cls"], "typeParameter": p["cls"], "namespace": p["cls"],
        "variable": p["var"], "parameter": p["var"], "property": p["var"],
        "enumMember": p["bool"], "keyword": p["kw"], "number": p["num"], "string": p["str"],
        "comment": {"foreground": p["cm"], "fontStyle": "italic"},
    }


def build(name, ttype, palette, wb):
    return {
        "$schema": "vscode://schemas/color-theme",
        "name": name, "type": ttype,
        "semanticHighlighting": True,
        "colors": wb,
        "tokenColors": token_colors(palette),
        "semanticTokenColors": semantic(palette),
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    for fn, name, ttype, pal, wb in (
        ("mihrab-dark-color-theme.json", "محراب الداكنة", "dark", DARK, WB_DARK),
        ("mihrab-light-color-theme.json", "محراب الفاتحة", "light", LIGHT, WB_LIGHT),
        ("mihrab-hc-dark-color-theme.json", "محراب الداكنة عالية التباين", "hcDark", HC_DARK, WB_HC_DARK),
        ("mihrab-hc-light-color-theme.json", "محراب الفاتحة عالية التباين", "hcLight", HC_LIGHT, WB_HC_LIGHT),
    ):
        data = build(name, ttype, pal, wb)
        with open(os.path.join(OUT, fn), "w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print("wrote", fn, "-", len(data["tokenColors"]), "token rules,", len(wb), "ui colors")


if __name__ == "__main__":
    main()
