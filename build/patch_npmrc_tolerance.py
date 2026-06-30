#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ترقيع رقصة .npmrc في prepare_vscode.sh (وصفة محراب م0).

السبب: السكربت يحفظ .npmrc إلى .npmrc.bak ثمّ يستعيده؛ تحت set -e يتوقّف البناء إن
غابت النسخة (حالة متبقّية من إعادة استعمال المصدر -s). نجعل الحفظ/الاستعادة متسامحَين.

idempotent: يتحقّق من الوسم قبل التعديل.
الاستعمال: python patch_npmrc_tolerance.py <مسار prepare_vscode.sh>
"""
import os
import sys

# فرض UTF-8 على المخرجات (كونسول ويندوز قد يكون cp125x فيفشل مع العربيّة).
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

MARK = "محراب م0: تسامح مع غياب .npmrc"


def _write_atomic(path: str, text: str) -> None:
    """كتابة ذرّيّة: نكتب لمؤقّت ثمّ نستبدل، حتى لا يبقى ملفّ نصف-مكتوب يُربك حارس
    الوسم في إعادة التشغيل (idempotency) عند انقطاع. نُبقي معالجة نهايات الأسطر
    الافتراضيّة (newline=None) مطابِقةً للسلوك المُثبَت قبل هذا التحسين."""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)

OLD_BACKUP = "mv .npmrc .npmrc.bak\ncp ../npmrc .npmrc"
NEW_BACKUP = (
    "# محراب م0: تسامح مع غياب .npmrc (تفادي توقّف set -e بسبب حالة متبقّية من -s).\n"
    "[ -f .npmrc ] && mv -f .npmrc .npmrc.bak || true\n"
    "cp ../npmrc .npmrc"
)

OLD_RESTORE = "mv .npmrc.bak .npmrc\n# }}}"
NEW_RESTORE = (
    "# محراب م0: استعد .npmrc من النسخة إن وُجدت، وإلا من git (تفادي توقّف set -e).\n"
    "if [ -f .npmrc.bak ]; then mv -f .npmrc.bak .npmrc; "
    "else git checkout -- .npmrc 2>/dev/null || true; fi\n# }}}"
)


def main() -> int:
    if len(sys.argv) != 2:
        print("الاستعمال: python patch_npmrc_tolerance.py <مسار prepare_vscode.sh>", file=sys.stderr)
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
    if OLD_BACKUP not in text or OLD_RESTORE not in text:
        print("⚠️ لم يُعثر على نمط .npmrc المتوقّع — ربّما تغيّر المنبع.", file=sys.stderr)
        return 1
    text = text.replace(OLD_BACKUP, NEW_BACKUP, 1).replace(OLD_RESTORE, NEW_RESTORE, 1)
    _write_atomic(path, text)
    print("✅ رُقِّع prepare_vscode.sh (تسامح .npmrc).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
