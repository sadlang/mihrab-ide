#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""بصماتُ النزاهة في `product.json` المشحون — تُحدَّث بعد آخرِ تعديلٍ على `out/`.

**العطبُ الذي يُصلحه، وقد شُوهد في المشحون.** يحسب المنبعُ عند التحزيم بصمةَ sha256
لعشرة ملفّاتٍ أساسيّة ويكتبها في `product.json`، ثمّ يتحقّق منها **عند كلّ إقلاع**:
فإن اختلفت واحدةٌ عرض «يبدو أن تثبيت Mihrab تالف. يرجى إعادة التثبيت».

وخطواتُ محرابٍ بعد التحزيم تعدّل ملفًّا من العشرة: `patch_workbench_font.py` يعيد
كتابةَ `workbench.desktop.main.css` ليصل الخطَّ العربيَّ بملفٍّ مجاور بدل `data:`
المحجوبة بـCSP. فالبصمةُ تصير بائتةً، والإشعارُ يظهر لكلّ مستخدمٍ في كلّ إقلاع.

قِيس على البناء ‎1.121.05937‎: تسعُ بصماتٍ مطابقة، وواحدةٌ مختلفة — ورقةُ الأنماط
بعينها. ولم يمسكه حارس: L2 يقيس **وجودَ** الشيفرة في الحزمة لا نزاهتَها، وL3 يقرأ
الإشعاراتِ بـ`some()` فلا يسقط لوجود إشعارٍ زائد.

**ولماذا تُحدَّث البصمةُ ولا تُنزَع الآليّة.** الآليّةُ تحمي المستخدمَ من حزمةٍ عُبِث
بها بعد الشحن، وهي حمايةٌ نريدها. فالصوابُ أن تصف البصمةُ ما شُحن فعلًا — أي أن
تُحسَب **بعد** آخرِ خطوةٍ تكتب في `out/` — لا أن يُسكَت التحقّق.

ويُحسَب **كلُّ** المفاتيح لا الورقةَ وحدَها: خطوةُ ما بعد بناءٍ تُضاف غدًا وتمسّ
ملفًّا آخرَ من العشرة تبقى مغطّاةً بلا تعديلٍ هنا.

الاستعمال:
    python build/refresh_checksums.py <APP_DIR>              # يُحدِّث ويكتب
    python build/refresh_checksums.py --verify <APP_DIR>     # يتحقّق ولا يكتب

الخرج: 0 نجاح · 1 فشل (‏--verify: بصمةٌ مخالفة؛ وبلا --verify: ملفٌّ مفقود).
"""
import base64
import hashlib
import io
import json
import os
import sys

# ‏PowerShell 5.1 على هذا الجهاز يقرأ خرجَ بايثون بترميز النظام (cp1255)، فكلُّ محرفٍ
# عربيٍّ أو رمزٍ (↻ ⇐ ✅) يُسقِط السكربتَ بـUnicodeEncodeError — والسكربتُ الذي يفشل
# على **رسالته** يُفشِل البناء وقد أدّى عملَه. نمطٌ متّبَعٌ في مرقِّعات البناء الأخرى.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


def _digest(path):
    """بصمةُ المنبع حرفيًّا: sha256 ⇐ base64 بلا حشوِ `=`.

    الصيغةُ ليست اختيارًا: `computeChecksum` في `build/gulpfile.vscode.js` يكتبها
    هكذا، والمقارنةُ عند الإقلاع نصّيّة. أيُّ اختلافٍ في الترميز يجعل كلَّ بصمةٍ
    «مخالفة» فيُقلَب الإصلاحُ عطبًا.
    """
    with open(path, "rb") as f:
        return base64.b64encode(hashlib.sha256(f.read()).digest()).decode("ascii").rstrip("=")


def main(argv):
    verify = "--verify" in argv
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 1:
        print("الاستعمال: refresh_checksums.py [--verify] <APP_DIR>", file=sys.stderr)
        return 2
    app = args[0]
    pj = os.path.join(app, "product.json")
    if not os.path.isfile(pj):
        print(f"❌ لا product.json في {app}", file=sys.stderr)
        return 1

    with io.open(pj, encoding="utf-8-sig") as f:
        product = json.load(f)

    checksums = product.get("checksums")
    # **شاهدُ تفعيلٍ موجَب.** حزمةٌ بلا مفاتيحَ أصلًا تجعل كلَّ ما يلي يمرّ على العمى:
    # لا فرقَ بين «كلُّ البصمات سليمة» و«لا بصماتِ تُقاس». والمنبعُ يكتبها دائمًا.
    if not checksums:
        print("❌ لا مفاتيحَ `checksums` في product.json — الآليّةُ غائبةٌ لا سليمة", file=sys.stderr)
        return 1

    stale, missing = [], []
    for key, recorded in sorted(checksums.items()):
        f = os.path.join(app, "out", key)
        if not os.path.isfile(f):
            missing.append(key)
            continue
        actual = _digest(f)
        if actual != recorded:
            stale.append((key, recorded, actual))

    for key in missing:
        print(f"❌ ملفٌّ مبصومٌ مفقودٌ من المشحون: out/{key}", file=sys.stderr)

    if verify:
        for key, recorded, actual in stale:
            print(f"❌ بصمةٌ بائتة: out/{key}\n     مسجَّلة {recorded}\n     فعليّة {actual}",
                  file=sys.stderr)
        if stale or missing:
            print("   ⇐ هذا هو «يبدو أن تثبيت Mihrab تالف» بعينه: يُعرَض عند كلّ إقلاع.",
                  file=sys.stderr)
            return 1
        print(f"  ✅ بصماتُ النزاهة مطابقة ({len(checksums)} ملفًّا)")
        return 0

    if missing:
        return 1
    if not stale:
        print(f"  ✅ بصماتُ النزاهة مطابقةٌ أصلًا ({len(checksums)} ملفًّا) — لا تحديث")
        return 0

    for key, recorded, actual in stale:
        checksums[key] = actual
        print(f"  ↻ {key}\n      {recorded} ⇐ {actual}")
    with io.open(pj, "w", encoding="utf-8", newline="\n") as f:
        json.dump(product, f, ensure_ascii=False, indent="\t")
        f.write("\n")
    print(f"  ✅ حُدِّثت {len(stale)} بصمةً في product.json المشحون")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
