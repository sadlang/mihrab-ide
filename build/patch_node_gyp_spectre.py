#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ترقيع مولّد msvs في node-gyp لإجبار SpectreMitigation=false (وصفة محراب م0).

السبب: VS Code يفعّل SpectreMitigation على وحداته الأصليّة، ومكتبات Spectre غير
مثبّتة في VS 2026، وتثبيتها يحتاج رفعًا تفاعليًّا (UAC). نُجبر المولّد على إصدار
`false` لكل مشروع لتفادي MSB8040. انحراف م0 معروف: لبناء إنتاجيّ تُثبَّت مكتبات
Spectre (Microsoft.VisualStudio.Component.VC.14.50.18.0.x86.x64.Spectre) ويُزال هذا.

idempotent: يتحقّق من وجود الوسم قبل التعديل.
الاستعمال: python patch_node_gyp_spectre.py <مسار msvs.py>
"""
import os
import sys

# فرض UTF-8 على المخرجات (كونسول ويندوز قد يكون cp125x فيفشل مع العربيّة).
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

# الوسم = السطر الوظيفيّ الذي يكتبه الترقيع (لا تعليق) ⇒ كشف idempotency موثوق
# يطابق ما يفحصه build.sh، ويصمد لو أُعيد التشغيل على ملفّ مُرقَّع سلفًا.
MARK = 'spectre_mitigation = "false"'


def _write_atomic(path: str, text: str) -> None:
    """كتابة ذرّيّة: نكتب لملفّ مؤقّت ثمّ نستبدل، حتى لا يبقى ملفّ نصف-مكتوب يُربك
    حارس الوسم في إعادة التشغيل (idempotency) عند انقطاع. نُبقي معالجة نهايات الأسطر
    الافتراضيّة (newline=None) مطابِقةً للسلوك المُثبَت قبل هذا التحسين."""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)

OLD = (
    '        spectre_mitigation = msbuild_attributes.get("SpectreMitigation")\n'
)
NEW = (
    "        # محراب م0: إجبار تعطيل Spectre (مكتباته غير مثبّتة، التثبيت يحتاج UAC).\n"
    '        spectre_mitigation = "false"\n'
    "        _unused_spectre = msbuild_attributes.get(\"SpectreMitigation\")\n"
)


def main() -> int:
    if len(sys.argv) != 2:
        print("الاستعمال: python patch_node_gyp_spectre.py <مسار msvs.py>", file=sys.stderr)
        return 2
    path = sys.argv[1]
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError as e:
        print(f"⚠️ تعذّر فتح {path}: {e}", file=sys.stderr)
        return 1
    if MARK in text:
        print("مُرقَّع مسبقًا — تخطٍّ.")
        return 0
    if OLD not in text:
        print("⚠️ لم يُعثر على السطر المتوقّع في msvs.py — ربّما تغيّر node-gyp.", file=sys.stderr)
        return 1
    text = text.replace(OLD, NEW, 1)
    _write_atomic(path, text)
    print("✅ رُقِّع msvs.py (SpectreMitigation=false).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
