#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""يصحّح افتراضَ المنبع أنّ حزمة macOS اسمُها `${NAME_SHORT}.app`.

    python build/patch_cli_macapp.py <.upstream/build_cli.sh> [<.upstream/prepare_assets.sh>]

المشكلة: سكربتا المنبع يشتقّان مسارَ الحزمة من `nameShort`، بينما يشتقّه مغلِّفُ
‏vscode لـmacOS من **`nameLong`**. وهما في VSCodium نصٌّ واحد («VSCodium»)، فلا
يظهر الفرق أبدًا. أمّا عندنا فـnameShort لاتينيّ («Mihrab» — منه يُشتَقّ اسمُ
التنفيذيّ، وعربيٌّ يكسر التوافق) وnameLong عربيّ («محراب»)، فيبني المغلِّفُ
`محراب.app` ويبحث السكربتُ عن `Mihrab.app`:

    cp: .../VSCode-darwin-arm64/Mihrab.app/Contents/Resources/app/bin/mihrab-tunnel:
        No such file or directory

وهو عطبٌ يظهر **بعد ست عشرة دقيقة** من البناء، في آخر خطوة، بعد ترجمة CLI بـRust
كاملةً. ولا يظهر على ويندوز ولا لينكس إطلاقًا.

العلاج: لا نفرض اسمًا — نحلّ الحزمةَ الموجودة فعلًا. `ls -d …/*.app` مصدرُ حقيقةٍ
أصدقُ من أيّ اشتقاق، ويبقى صحيحًا لو غيّر المنبعُ قاعدةَ التسمية غدًا.
"""
import io
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

MARK = "# محراب: حلُّ حزمة .app بالبحث لا بالاشتقاق"

# (الملفّ، الأصل، البديل) — البديلُ يحلّ الحزمةَ في محلّها داخل نفس السطر.
EDITS = [
    ("build_cli.sh",
     '"../../VSCode-darwin-${VSCODE_ARCH}/${NAME_SHORT}.app/'
     'Contents/Resources/app/bin/${TUNNEL_APPLICATION_NAME}"',
     '"$( ls -d "../../VSCode-darwin-${VSCODE_ARCH}"/*.app | head -1 )'
     '/Contents/Resources/app/bin/${TUNNEL_APPLICATION_NAME}"'),
    ("prepare_assets.sh",
     '"../VSCode-${VSCODE_PLATFORM}-${VSCODE_ARCH}/${NAME_SHORT}.app/'
     'Contents/Resources/app/bin/${TUNNEL_APPLICATION_NAME}"',
     '"$( ls -d "../VSCode-${VSCODE_PLATFORM}-${VSCODE_ARCH}"/*.app | head -1 )'
     '/Contents/Resources/app/bin/${TUNNEL_APPLICATION_NAME}"'),
]


def main(argv):
    if len(argv) < 2:
        sys.stderr.write("الاستعمال: patch_cli_macapp.py <ملفّ> [<ملفّ>…]\n")
        return 2

    touched = 0
    for path in argv[1:]:
        base = os.path.basename(path)
        edit = next((e for e in EDITS if e[0] == base), None)
        if edit is None:
            sys.stderr.write("❌ ملفٌّ غيرُ معروف لهذا المرقِّع: %s\n" % base)
            return 1
        if not os.path.isfile(path):
            print("  ⏭️  غير موجود، يُتخطّى: %s" % base)
            continue

        src = io.open(path, encoding="utf-8").read()
        if MARK in src:
            print("  ✅ مُرقَّعٌ سلفًا: %s" % base)
            continue

        _, old, new = edit
        if old not in src:
            # فشلٌ صريح لا تخطٍّ صامت: تغيّرُ المنبع يعني أنّ الافتراض قد يكون
            # صُحّح — أو انتقل إلى موضعٍ آخر. والصمتُ هنا يُعيد العطبَ إلى macOS.
            sys.stderr.write(
                "❌ لم يُعثر على النمط المتوقَّع في %s — تغيّر المنبع؟\n"
                "   راجِع %s وحدِّث EDITS في هذا المرقِّع.\n" % (base, path))
            return 1

        src = src.replace(old, new, 1).replace(
            "\nSHOULD_BUILD", "\n%s\nSHOULD_BUILD" % MARK, 1)
        if MARK not in src:                    # لا مرساةَ SHOULD_BUILD في هذا الملفّ
            src = src.replace("\n", "\n%s\n" % MARK, 1)
        io.open(path, "w", encoding="utf-8", newline="\n").write(src)
        print("  ✅ رُقِّع: %s" % base)
        touched += 1

    print("✅ حزمة macOS تُحلّ بالبحث (%d ملفًّا مُرقَّعًا)." % touched)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
