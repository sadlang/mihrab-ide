#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ترقيع build.sh الخاصّ بـVSCodium لحقن إضافات محراب المدمجة (الطبقة 1).

السبب: في وضع -s يُجري dev/build.sh «git add . ; git reset --hard» على vscode
فيحذف أيّ إضافة غير متعقَّبة نُسِخت قبله. لذا نحقن الإضافات من داخل build.sh
بعد «cd vscode» (بعد reset، قبل gulp) من مرحلة تجهيز محزومة (.mihrab-extensions).

idempotent: يتحقّق من وسم قبل التعديل.
الاستعمال: python patch_bundle_extensions.py <مسار build.sh>
"""
import os
import sys

# فرض UTF-8 على المخرجات (كونسول ويندوز قد يكون cp125x فيفشل مع العربيّة).
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

MARK = "محراب: حقن الإضافات المدمجة"

ANCHOR = '  cd vscode || { echo "\'vscode\' dir not found"; exit 1; }'

INJECT = """
  # محراب: حقن الإضافات المدمجة المُجهَّزة في ../.mihrab-extensions (الطبقة 1).
  # نستعمل if لا «[ -d ] && cmd» (الأخيرة تُفشِل البناء تحت set -e عند غياب التطابق).
  for _mext in ../.mihrab-extensions/*/; do
    if [ -d "${_mext}" ]; then
      _mname="$( basename "${_mext}" )"
      rm -rf "extensions/${_mname}"
      cp -r "${_mext}" "extensions/${_mname}"
      echo "محراب: حُقِنت إضافة مدمجة ${_mname}"
    fi
  done"""


def main() -> int:
    if len(sys.argv) != 2:
        print("الاستعمال: python patch_bundle_extensions.py <مسار build.sh>", file=sys.stderr)
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
    if ANCHOR not in text:
        print("⚠️ لم يُعثر على سطر «cd vscode» المتوقّع في build.sh — ربّما تغيّر المنبع.", file=sys.stderr)
        return 1
    text = text.replace(ANCHOR, ANCHOR + INJECT, 1)
    # نكتب لملفّ مؤقّت ثمّ نُبدِّل ذرّيًّا: فشل الكتابة لا يُتلِف build.sh الأصليّ.
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
    print("✅ رُقِّع build.sh (حقن الإضافات المدمجة).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
