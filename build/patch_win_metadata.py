#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""بياناتُ نسخةِ ويندوز في الثنائيّات المشحونة (‏VERSIONINFO) — الطبقة 3.

## العطب، مقيسًا على المشحون

فحصنا `VersionInfo` لكلّ ‎exe/dll‎ في حزمة ‏1.126.05942 فوجدنا ثلاثةَ ملفّاتٍ تحمل
اسمَ منتَجِنا ونسبةَ ناشرٍ ليست لنا:

| الملفّ | ‏ProductName | ‏CompanyName | ‏LegalCopyright |
|---|---|---|---|
| `Mihrab.exe` | محراب | ‏**VSCodium** | ‏(C) 2026 **VSCodium** |
| `…/ripgrep-universal/bin/win32-x64/rg.exe` | محراب | ‏**VSCodium** | ‏(C) 2026 **VSCodium** |
| `bin/mihrab-tunnel.exe` | محراب | ‏**Microsoft Corporation** | ‏(C) 2026 **Microsoft** |

وهذه ليست زينةً في لوحة الخصائص: `CompanyName` هو ما يعرضه ويندوز ناشرًا، وما تقرؤه
أدواتُ الجرد وسياساتُ AppLocker. وملفٌّ باسم `mihrab-tunnel.exe` ينسب نفسَه إلى
مايكروسوفت **نسبةٌ خاطئةٌ لجهةٍ حقيقيّة**، لا مجرّدُ حقلٍ متروك.

## ولماذا الآن

لأنّ التوقيعَ يجعلها تناقضًا لا سهوًا: التوقيعُ سيقول «الناشر: لغة ص» والملفُّ يقول
«‏VSCodium»، وويندوز يعرض الاثنين في النافذة نفسِها. وشروطُ SignPath للمشاريع المفتوحة
تشترط صراحةً أن تحمل الثنائيّاتُ الموقَّعةُ بياناتِ منتَجٍ صحيحةً ومفروضة.

## ولماذا لم يمسكه حارس

حرّاسُ الهويّة عندنا (‏L0 وL2) يسألون `product.json` والنصَّ المُصيَّر — وهذان صحيحان
تمامًا: `nameLong=محراب`. أمّا `VERSIONINFO` فمَورِدُه مصادرُ البناء لا المنتَج، ولم
يكن في نطاق أيّ فحص. أضفنا الحارسَ مع الرقعة لا بعدها.

## المصادرُ الأربعة

ثلاثةٌ يضبطها VSCodium بـ`replace` في `prepare_vscode.sh` (فيرث محرابٌ اسمَهم)، والرابع
لم تبلغه يدُهم فبقي على نصّ مايكروسوفت:

  ‏`build/lib/electron.ts`      ⇐ حزمةُ Electron نفسُها (`Mihrab.exe`)
  ‏`build/gulpfile.vscode.ts`   ⇐ `rcedit` على الوحدات الأصليّة المرافقة (`rg.exe`)
  ‏`build/gulpfile.reh.ts`      ⇐ المثلُ لبناء الخادم البعيد
  ‏`cli/build.rs`               ⇐ مواردُ Rust لـ`mihrab-tunnel.exe`

ويُرقَّع الرابعُ ولو لم يُشحَن اليومَ في سطح المكتب: العطبُ واحدٌ والكلفةُ سطران،
وتركُه يعني أن يعود حين يُنشَر بناءُ الخادم.

## والسنةُ خارجَ المرساة عمدًا

المنبعُ يكتب `Copyright (C) <سنة> VSCodium. All rights reserved`، والسنةُ تتغيّر معه كلّ
عام. فلو رست الرقعةُ على السطر كاملًا لانكسر البناءُ كلَّ أوّلِ يناير بلا سببٍ يخصّنا.
المرساةُ هنا ما **بعد** السنة (` VSCodium. All rights reserved',`)، فتبقى السنةُ متدفّقةً
من المنبع ولا نستبدل إلّا الجهة.

## ولا «All rights reserved»

محرابٌ تحت MIT، و«كلُّ الحقوق محفوظة» نقيضُ ما ترخّصه. النصُّ الجديد يقول الرخصةَ
باسمها — والملفُّ التنفيذيُّ أوّلُ ما يقرؤه من يسأل «لمن هذا البرنامج؟».

يُشغَّل **بعد** `prepare_vscode.sh` (مثلَ بقيّة مرقِّعاتنا) فيرى نصَّ VSCodium لا نصَّ
مايكروسوفت في الثلاثة الأولى. idempotent عبر الوسم `mihrab-win-metadata`. كتابة ذرّيّة.

الاستعمال: python build/patch_win_metadata.py <جذر مصدر vscode>
"""
import io
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

MARK = "mihrab-win-metadata"

# هويّةُ الناشر. اسمٌ لاتينيٌّ واحدٌ يطابق `win32AppUserModelId: SadLang.Mihrab` في
# `product-overrides/product.json` — ويندوز يعرض هذا الحقلَ حرفيًّا، وبعضُ أدوات الجرد
# تطابقه نصًّا، فالاسمُ العربيُّ هنا يزيد احتمالَ سوءِ العرض بلا مكسب. والاسمُ العربيُّ
# حاضرٌ أصلًا في `ProductName` (محراب) الذي يأتي من `product.json`.
COMPANY = "Sad Language"
COPYRIGHT_TAIL = " Sad Language — MIT License"

# **ولكلّ مرساةٍ صورتان، لأنّ للملفّ حالتين.** يُشغَّل هذا المرقِّعُ في البناء **بعد**
# ‏`prepare_vscode.sh` فيجد نصَّ VSCodium؛ ويُشغَّل في `dev_sync.py` وفي L1 على شجرةٍ
# **نظيفةٍ من مايكروسوفت** فيجد نصَّها هي. وصورةٌ واحدةٌ كانت ستجعل الفحصَ الذي يُفترَض
# أن يحرس الرقعةَ هو أوّلَ ما يسقط عليها. تُجرَّب الصورتان بالترتيب، وواحدةٌ منهما
# يجب أن تقعَ مرّةً واحدةً بالضبط — لا صفرًا ولا اثنتين.
_CO_TS = ("companyName: 'VSCodium',", "companyName: 'Microsoft Corporation',")
_CO_RC = ("'CompanyName': 'VSCodium',", "'CompanyName': 'Microsoft Corporation',")
_CP_TS = (" VSCodium. All rights reserved',", " Microsoft. All rights reserved',")

FILES = [
    # (١) حزمةُ Electron: منها `CompanyName`/`LegalCopyright` في `Mihrab.exe`.
    (
        "build/lib/electron.ts",
        MARK,
        [
            (_CO_TS, "companyName: '" + COMPANY + "', // " + MARK, 1),
            (_CP_TS, COPYRIGHT_TAIL + "',", 1),
        ],
    ),
    # (٢) `rcedit` على الوحدات الأصليّة المرافقة — منها بصمةُ `rg.exe` المشحون.
    (
        "build/gulpfile.vscode.ts",
        MARK,
        [
            (_CO_RC, "'CompanyName': '" + COMPANY + "', // " + MARK, 1),
            (_CP_TS, COPYRIGHT_TAIL + "',", 1),
        ],
    ),
    # (٣) المثلُ لبناء الخادم البعيد — لا يُشحَن في سطح المكتب اليومَ ويُرقَّع كي لا
    #     يعود العطبُ حين يُنشَر.
    (
        "build/gulpfile.reh.ts",
        MARK,
        [
            (_CO_RC, "'CompanyName': '" + COMPANY + "', // " + MARK, 1),
            (_CP_TS, COPYRIGHT_TAIL + "',", 1),
        ],
    ),
    # (٤) مواردُ Rust لـ`mihrab-tunnel.exe`. **الوحيدُ الذي يقول «مايكروسوفت» في المشحون**:
    #     ‏`prepare_vscode.sh` يستبدل في `build/lib/electron.ts` وحدَه، فلم تبلغه يدُهم —
    #     فصورتُه واحدةٌ لا صورتان.
    (
        "cli/build.rs",
        MARK,
        [
            (('res.set("CompanyName", "Microsoft Corporation");',),
             'res.set("CompanyName", "' + COMPANY + '"); // ' + MARK, 1),
            ((' Microsoft. All rights reserved");',),
             COPYRIGHT_TAIL + '");', 1),
        ],
    ),
]


def _read(path):
    with io.open(path, encoding="utf-8", newline="") as f:
        return f.read()


def _write_atomic(path, text):
    tmp = path + ".mihrab-tmp"
    with io.open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    os.replace(tmp, path)


def _apply(root, relpath, mark, edits):
    """يطبّق تعديلات ملفٍّ واحد. يعيد True نجاحًا (أو تخطّيًا)، False إخفاقًا."""
    path = os.path.join(root, relpath.replace("/", os.sep))
    try:
        text = _read(path)
    except OSError as e:
        print("⚠️ تعذّر فتح %s: %s" % (relpath, e), file=sys.stderr)
        return False

    if mark in text:
        print("  ⏭️  %s — مُرقَّع مسبقًا." % relpath)
        return True

    for forms, new, count in edits:
        # المرساةُ مرّةً واحدةً بالضبط: مرّتان تعنيان أنّنا نستبدل موضعًا لم نقرأه،
        # والإخفاقُ حينها أسلمُ من النجاح. وتُجرَّب الصورُ بالترتيب — أوّلُ صورةٍ تقع
        # مرّةً هي المقصودة، وصورةٌ تقع مرّتين تُوقِف ولا تُتخطّى.
        hit = None
        for form in forms:
            n = text.count(form)
            if n == count:
                hit = form
                break
            if n > count:
                print("⚠️ %s: المرساة وُجدت %d مرّة والمتوقَّع %d — تغيّر المنبع؟\n"
                      "   المرساة: %s" % (relpath, n, count, form[:100]), file=sys.stderr)
                return False
        if hit is None:
            print("⚠️ %s: لا مرساةَ من %d — تغيّر المنبع؟\n   المُجرَّب: %s"
                  % (relpath, len(forms), " · ".join(f[:60] for f in forms)),
                  file=sys.stderr)
            return False
        text = text.replace(hit, new, count)

    try:
        _write_atomic(path, text)
    except OSError as e:
        print("⚠️ تعذّر كتابة %s: %s" % (relpath, e), file=sys.stderr)
        return False
    print("  ✅ %s" % relpath)
    return True


def main():
    if len(sys.argv) != 2:
        print("الاستعمال: python patch_win_metadata.py <جذر مصدر vscode>", file=sys.stderr)
        return 2
    root = sys.argv[1]

    ok = True
    for relpath, mark, edits in FILES:
        if not _apply(root, relpath, mark, edits):
            ok = False

    if not ok:
        print("❌ رقعةُ بيانات نسخةِ ويندوز لم تكتمل.", file=sys.stderr)
        return 1
    print("✅ رُقِّعت بياناتُ النسخة (‏CompanyName/LegalCopyright ⇐ %s)." % COMPANY)
    return 0


if __name__ == "__main__":
    sys.exit(main())
