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
  • لا selfKeyword في الرموز الدلاليّة: خادم ص لا يُصدره (يصنّف «هذا» كـKeyword).
  • meta.interpolation بلا foreground: نلوّن المحتوى الداخليّ لا الحاوية.
"""
import json
import os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "themes")

# ── لوحتا ألوان الرموز (token → hex) ──
DARK = dict(cm="#7C8E94", kw="#32AEA0", cls="#63C9BE", fn="#E3BE68", str="#AEC489",
            num="#E0946A", bool="#D0895F", op="#93A2A9", var="#CBD5D7", esc="#D0895F")
# الفاتحة: نبرات مُغمَّقة لعتبة AA على #F5F0E4 (كلّها ≥4.5:1).
LIGHT = dict(cm="#6A6452", kw="#0C6659", cls="#0B626E", fn="#785006", str="#4C6A2C",
             num="#A5431C", bool="#8F4117", op="#525C66", var="#2E4045", esc="#8F4117")

WB_DARK = {
    "editor.background": "#0F1C24", "editor.foreground": "#D4DEDF",
    "editorLineNumber.foreground": "#485A61", "editorLineNumber.activeForeground": "#9DB0B6",
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
    "list.hoverBackground": "#182A34", "list.highlightForeground": "#E3BE68",
    "button.background": "#31A796", "button.foreground": "#062420",
    "button.hoverBackground": "#3BB9A8", "badge.background": "#31A796",
    "badge.foreground": "#062420", "progressBar.background": "#E3BE68",
    "textLink.foreground": "#57C4B6", "textLink.activeForeground": "#7BD6C9",
    "scrollbarSlider.background": "#2A424E80", "scrollbarSlider.hoverBackground": "#3A5560AA",
    "editorWidget.background": "#152530", "editorSuggestWidget.background": "#152530",
    "editorSuggestWidget.selectedBackground": "#204640", "editorHoverWidget.background": "#152530",
    "peekViewEditor.background": "#12212B",
}
WB_LIGHT = {
    "editor.background": "#F5F0E4", "editor.foreground": "#33474C",
    "editorLineNumber.foreground": "#B3A992", "editorLineNumber.activeForeground": "#6E6552",
    "editor.lineHighlightBackground": "#ECE5D2", "editor.selectionBackground": "#D3E1D8",
    "editor.selectionHighlightBackground": "#DFE8DC", "editorCursor.foreground": "#C79A3E",
    "editorWhitespace.foreground": "#DAD0BC", "editorIndentGuide.background1": "#E0D8C6",
    "editorIndentGuide.activeBackground1": "#C3B79C", "editorBracketMatch.background": "#D3E1D8",
    "editorBracketMatch.border": "#0F7C6E", "focusBorder": "#0F7C6E", "foreground": "#4A5A50",
    "titleBar.activeBackground": "#EAE3D1", "titleBar.activeForeground": "#3E4E44",
    "titleBar.inactiveBackground": "#EFE8D8", "titleBar.inactiveForeground": "#8A7F6B",
    "activityBar.background": "#EAE3D1", "activityBar.foreground": "#33474C",
    "activityBar.inactiveForeground": "#9A9078", "activityBar.activeBorder": "#0F7C6E",
    "activityBarBadge.background": "#0F7C6E", "activityBarBadge.foreground": "#EAF6F2",
    "sideBar.background": "#EFE8D8", "sideBar.foreground": "#4A5A50",
    "sideBarSectionHeader.background": "#E7E0CE", "sideBarTitle.foreground": "#7C7360",
    "statusBar.background": "#0F7C6E", "statusBar.foreground": "#EAF6F2",
    "statusBar.noFolderBackground": "#0E6A5F", "statusBar.debuggingBackground": "#BB552B",
    "tab.activeBackground": "#F5F0E4", "tab.inactiveBackground": "#E7E0CE",
    "tab.activeForeground": "#2C3B40", "tab.inactiveForeground": "#8A7F6B",
    "tab.activeBorderTop": "#0F7C6E", "tab.border": "#E7E0CE",
    "editorGroupHeader.tabsBackground": "#E7E0CE", "panel.background": "#EFE8D8",
    "panelTitle.activeForeground": "#33474C", "terminal.background": "#F5F0E4",
    "terminal.foreground": "#33474C", "input.background": "#FBF7EC",
    "input.foreground": "#33474C", "input.border": "#D4C9B0", "dropdown.background": "#FBF7EC",
    "list.activeSelectionBackground": "#D3E1D8", "list.activeSelectionForeground": "#243B36",
    "list.hoverBackground": "#EAE3D1", "list.highlightForeground": "#785006",
    "button.background": "#0F7C6E", "button.foreground": "#EAF6F2",
    "button.hoverBackground": "#12897A", "badge.background": "#0F7C6E",
    "badge.foreground": "#EAF6F2", "progressBar.background": "#785006",
    "textLink.foreground": "#0B626E", "textLink.activeForeground": "#0B808F",
    "scrollbarSlider.background": "#C3B79C80", "scrollbarSlider.hoverBackground": "#B3A992AA",
    "editorWidget.background": "#EFE8D8", "editorSuggestWidget.background": "#F1EBDD",
    "editorSuggestWidget.selectedBackground": "#D9E5DC", "editorHoverWidget.background": "#F1EBDD",
    "peekViewEditor.background": "#EFE8D8",
}


def token_colors(p):
    """يُخرّط لوحة الرموز على نطاقات sad.tmLanguage.json الفعليّة."""
    return [
        {"name": "تعليق", "scope": [
            "comment", "comment.line.number-sign.sad", "comment.block.sad",
            "comment.line.documentation.sad", "comment.block.documentation.sad"],
         "settings": {"foreground": p["cm"], "fontStyle": "italic"}},
        {"name": "كلمة مفتاحيّة", "scope": [
            "keyword.control.sad", "keyword.control.directive.sad", "keyword.other.sad",
            "keyword.operator.word.sad", "storage.type.sad", "storage.modifier.sad",
            "storage.modifier.lifetime.sad", "constant.language", "constant.language.sad"],
         "settings": {"foreground": p["kw"]}},
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
        {"name": "نوع مدعوم", "scope": ["support.type.sad"], "settings": {"foreground": p["cls"]}},
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
    ):
        data = build(name, ttype, pal, wb)
        with open(os.path.join(OUT, fn), "w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print("wrote", fn, "-", len(data["tokenColors"]), "token rules,", len(wb), "ui colors")


if __name__ == "__main__":
    main()
