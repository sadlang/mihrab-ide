#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""رُقعة نواة محراب: تعريب عناوين الإعدادات المشتقّة حسابيًّا — الطبقة 3.

## المشكلة

عناوينُ لوحة الإعدادات **ليست سلاسلَ مترجَمة**. لا مدخلَ لها في `nls.messages.json`
ولا في حزمة اللغة، فخبزُ العربيّة (‏bake_nls_arabic.py) لا يمسّها ولا يمكنه. هي
تُشتَقّ من اسم المفتاح وقتَ التشغيل في `wordifyKey`:

    'editor.formatOnSave'  →  'Editor › Format On Save'

فيبقى في واجهةٍ عربيّةٍ بالكامل سطرٌ لاتينيٌّ فوق كلّ إعداد، ووصفُه تحته عربيّ:
يقرأ المستخدم يسارًا ثمّ يمينًا في بندٍ واحد. هذا ارتدادُ اتّجاهٍ متكرّر آلافَ المرّات،
لا نقصُ تجميلٍ في زاوية.

## لماذا لا تكفي طبقةٌ أدنى

- **لا سلسلةَ ترجمة**: ما لا مدخلَ له في NLS لا تصله ترجمةٌ مهما اتّسعت الحزمة.
- **لا إعداد**: المنبع لا يعرض أيّ خطّاف لتخصيص هذا الاشتقاق.
- **لا CSS**: النصُّ نفسُه إنجليزيّ؛ الاتّجاهُ ليس المشكلة.

## الحلّ

نُلحِق بـ‎`wordifyKey`‎ استدعاءً أخيرًا لـ‎`arabizeSettingText`‎ من وحدةٍ جديدة.
موضعُ الحقن مقصود: للدالّة موضعا استدعاءٍ اثنان لا ثالثَ لهما، كلاهما في
`settingKeyToDisplayFormat` و**بعد** `trimCategoryForGroup`. فاقتطاعُ الفئة يجري
على الإنجليزيّة الأصليّة ولا يتأثّر بالتعريب، والتعريبُ آخرُ خطوةٍ قبل العرض.

ورقعةٌ ثانيةٌ لقابليّة البحث: بحثُ الإعدادات يطابق المفتاحَ والوصفَ و`keywords` ولا
يطابق العنوانَ المعروض، فبلا إلحاقِ الصورةِ المعرَّبةِ بالكلمات المفتاحيّة يقرأ
المستخدم عنوانًا عربيًّا ويكتبه فلا يجد شيئًا.

قياسُ التغطية (على 1523 مفتاحًا محصودًا من مصدر المنبع): **63.9%** من مقاطع الفئات
و**58.0%** من عناوين الأقسام الأساسيّة. الباقي يعود **إنجليزيًّا كما هو** — وأكثرُه
أسماءُ أعلامٍ لا تُترجَم أصلًا (‏Git، Npm، Vite، Webpack). انظر رأسَ
mihrabSettingsLexicon.ts لقاعدة «لا نصفَ ترجمة».

الأرقامُ تُحدَّث يدويًّا هنا، فإن غيّرتَ المعجم فأعد القياس ولا تتركها تكذب.

idempotent عبر الوسم mihrab-settings-lexicon. كتابة ذرّيّة.
الاستعمال: python patch_settings_labels.py <جذر مصدر vscode>
"""
import os
import shutil
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

HERE = os.path.dirname(os.path.abspath(__file__))

# مصدرُ وحدة الـTS. المرقِّع يعمل في موضعين: من مستودع محراب (build/)، ومن داخل شجرة
# المنبع بعد أن ينسخه build.sh (‏.mihrab-core بجانبه). فالبحثُ لا الافتراض.
_CORE_CANDIDATES = [
    os.path.join(os.path.dirname(HERE), "patches", "core"),
    os.path.join(HERE, ".mihrab-core"),
]
CORE = next((p for p in _CORE_CANDIDATES if os.path.isdir(p)), _CORE_CANDIDATES[0])

MARK = "mihrab-settings-lexicon"

_PREF = "src/vs/workbench/contrib/preferences/common"
_SVC = "src/vs/workbench/services/preferences/common"

# الوحدة في `base/common` لا في `contrib`: يستوردها مستهلكان في طبقتين مختلفتين
# (‏contrib للعرض وservices للبحث)، واستيرادُ services من contrib يخرق ترتيبَ طبقات
# المنبع. و`base` هي الطبقة التي يجوز للجميع أن يستوردوا منها — وهو الموضع نفسُه
# الذي اختارته رقعةُ مجلّد الإعدادات لثابتها.
NEW_FILES = [
    ("mihrabSettingsLexicon.ts", "src/vs/base/common/mihrabSettingsLexicon.ts"),
]

# نهايةُ wordifyKey في المنبع. نرسو على الحلقة الأخيرة و`return key` معًا لا على
# `return` وحده: الملفّ يحوي عشراتِ `return key;`، ومرساةٌ مفردةٌ منها كانت ستطابق
# موضعًا غيرَ مقصودٍ صامتةً.
_END_OF_WORDIFY = (
    "\tfor (const [k, v] of knownTermMappings) {\n"
    "\t\tkey = key.replace(new RegExp(`\\\\b${k}\\\\b`, 'gi'), v);\n"
    "\t}\n"
    "\n"
    "\treturn key;\n"
)

_DECL = "export function wordifyKey(key: string): string {"

# كلّ ملفّ: (المسار النسبيّ، الوسم، [(قديم، جديد، العدد المتوقَّع)]) — نفس شكل بقيّة
# مرقِّعات الجذر، فيشتقّ فحصُ المراسي (L1) أهدافَه من هنا آليًّا بلا حالةٍ خاصّة.
FILES = [
    (
        _PREF + "/preferences.ts",
        MARK,
        [
            # نرسو على الحلقة الأخيرة و`return key` معًا لا على `return` وحده: الملفّ
            # يحوي عشراتِ `return key;`، ومرساةٌ مفردةٌ منها كانت ستطابق موضعًا غيرَ
            # مقصودٍ صامتةً — والصمتُ هنا أخطرُ من الإخفاق.
            (
                _END_OF_WORDIFY,
                (
                    "\tfor (const [k, v] of knownTermMappings) {\n"
                    "\t\tkey = key.replace(new RegExp(`\\\\b${k}\\\\b`, 'gi'), v);\n"
                    "\t}\n"
                    "\n"
                    "\t// " + MARK + ": عناوينُ الإعدادات تُشتَقّ حسابيًّا فلا مدخلَ لها في\n"
                    "\t// NLS — التعريبُ هنا آخرُ خطوةٍ قبل العرض. وما لا مقابلَ له يعود\n"
                    "\t// إنجليزيًّا كما هو (أسماءُ الأعلام لا تُترجَم).\n"
                    "\treturn arabizeSettingText(key);\n"
                ),
                1,
            ),
            # الاستيراد قُبيل تعريف الدالّة لا في رأس الملفّ: أقربُ إلى مستعمِله، ومرساتُه
            # فريدةٌ قطعًا (تعريفُ دالّةٍ مصدَّرةٍ واحد).
            (
                _DECL,
                (
                    "// " + MARK + "\n"
                    "import { arabizeSettingText } from "
                    "'../../../../base/common/mihrabSettingsLexicon.js';\n"
                    "\n" + _DECL
                ),
                1,
            ),
        ],
    ),
    # ── قابليّةُ البحث ──
    # بحثُ الإعدادات يطابق المفتاحَ والوصفَ و`keywords` — لا العنوانَ المعروض. فبلا
    # هذه الرقعة يقرأ المستخدم عنوانًا عربيًّا ويكتبه فلا يجد شيئًا: نصٌّ معروضٌ لا
    # سبيلَ إليه. نُلحِق الصورةَ المعرَّبةَ (مجرَّدةً من التشكيل) بالكلمات المفتاحيّة.
    (
        _SVC + "/preferencesModels.ts",
        MARK,
        [
            (
                "\t\t\tkeywords: prop.keywords,\n",
                (
                    "\t\t\t// " + MARK + ": العنوانُ المعرَّب لا يدخل البحثَ في المنبع،\n"
                    "\t\t\t// فنُلحِقه بالكلمات المفتاحيّة كي يجدَه من يقرؤه على الشاشة.\n"
                    "\t\t\tkeywords: [...(prop.keywords ?? []), searchableSettingKey(key)],\n"
                ),
                1,
            ),
            (
                "export const nullRange: IRange = ",
                (
                    "// " + MARK + "\n"
                    "import { searchableSettingKey } from "
                    "'../../../../base/common/mihrabSettingsLexicon.js';\n"
                    "\n"
                    "export const nullRange: IRange = "
                ),
                1,
            ),
        ],
    ),
]


def _read(path):
    with open(path, "r", encoding="utf-8", newline="") as f:
        return f.read()


def _write_atomic(path, text):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    os.replace(tmp, path)


def _apply(root, relpath, mark, edits):
    """يطبّق تعديلات ملفٍّ واحد. يعيد True نجاحًا (أو تخطّيًا)، False إخفاقًا."""
    path = os.path.join(root, relpath.replace("/", os.sep))
    try:
        text = _read(path)
    except OSError as e:
        print(f"⚠️ تعذّر فتح {relpath}: {e}", file=sys.stderr)
        return False

    if mark in text:
        print(f"  ⏭️  {relpath} — مُرقَّع مسبقًا.")
        return True

    nl = "\r\n" if "\r\n" in text else "\n"
    for old, new, count in edits:
        old_nl = old.replace("\n", nl)
        found = text.count(old_nl)
        if found != count:
            print(f"⚠️ {relpath}: المرساة وُجدت {found} مرّة والمتوقَّع {count} — "
                  f"تغيّر المنبع؟\n   المرساة: {old.splitlines()[0][:100]}", file=sys.stderr)
            return False
        text = text.replace(old_nl, new.replace("\n", nl), count)

    try:
        _write_atomic(path, text)
    except OSError as e:
        print(f"⚠️ تعذّر كتابة {relpath}: {e}", file=sys.stderr)
        return False
    print(f"  ✅ {relpath}")
    return True


def main() -> int:
    if len(sys.argv) != 2:
        print("الاستعمال: python patch_settings_labels.py <جذر مصدر vscode>", file=sys.stderr)
        return 2
    root = sys.argv[1]

    ok = True
    for src_name, dest_rel in NEW_FILES:
        src = os.path.join(CORE, src_name)
        dest = os.path.join(root, dest_rel.replace("/", os.sep))
        if not os.path.isfile(src):
            print(f"⚠️ مفقود: {src}", file=sys.stderr)
            ok = False
            continue
        try:
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copyfile(src, dest)
            print(f"  ✅ نُسخ {dest_rel}")
        except OSError as e:
            print(f"⚠️ تعذّر نسخ {dest_rel}: {e}", file=sys.stderr)
            ok = False

    for relpath, mark, edits in FILES:
        if not _apply(root, relpath, mark, edits):
            ok = False

    if not ok:
        print("❌ رقعة عناوين الإعدادات لم تكتمل.", file=sys.stderr)
        return 1
    print("✅ رُقِّعت عناوين الإعدادات (تعريبُ مخرَج wordifyKey).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
