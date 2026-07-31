#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""رُقعة نواة محراب: افتراضُ `window.dialogStyle` = `custom` — الطبقة 3.

## المشكلة (قيست حيّةً على الحزمة، لا استُنتِجت)

الحوارُ المشروط (احفظ/لا تحفظ/إلغاء، تأكيدُ الحذف، تأكيدُ الاستبدال…) **يحجب
التطبيق كلَّه حتى يُجاب**. وفي المنبع:

    'window.dialogStyle': { 'default': 'native', 'scope': APPLICATION }
    useCustom = config.get('window.dialogStyle') === 'custom' || smokeTestDriver

أي أنّ محرابًا على ويندوز — بلا إعدادٍ من المستخدم — يعرض **حوارَ نظامِ التشغيل**:
نصُّه بلغة ويندوز لا بالعربيّة، اتّجاهُه LTR، وترتيبُ أزراره ترتيبُ الصدفة لا
ترتيبُنا. فأشدُّ لحظاتِ الواجهة إلحاحًا (لحظةُ فقدِ عمل) تخرج من التعريب كلِّه.

قِسنا الفرق على النسخة المشحونة بملفٍّ بلا عنوان مُلوَّث ثمّ `Ctrl+W`:

  | الإعداد | ما يظهر |
  | `native` (افتراضُ المنبع) | حوارُ ويندوز — لا شيءَ منه لنا: لا نصَّ ولا اتّجاه |
  | `custom` | «هل تريد حفظ التغييرات التي أجريتها على س؟» · «حفظ» «عدم الحفظ» «إلغاء» — ‏`direction: rtl` |

## لماذا رُقعةُ نواة لا إعدادٌ افتراضيّ من إضافة

جرّبناه أوّلًا في `extensions/mihrab-shell/package.json` عبر `configurationDefaults`
فلم يُطبَّق: نطاقُ الإعداد `ConfigurationScope.APPLICATION`، ومساهماتُ الإضافات لا
تغلب نطاقًا تطبيقيًّا. **قِسناه ولم نفترضه**: نفسُ العيّنة مع الإضافة المحدَّثة ردّت
‏`0 حوار`، ومع `window.dialogStyle` في إعدادات المستخدم ردّت `1` بأزرارٍ عربيّة.
فالطبقة الوحيدة التي تملك تغييرَ الافتراض هي مصدرُ المنبع نفسه.

وتفضيلُ المستخدم يبقى الأعلى: من كتب `"window.dialogStyle": "native"` صراحةً يحصل
على حوار النظام — نحن نغيّر الافتراضَ لا نُلغي الخيار.

idempotent عبر الوسم mihrab-dialog-style. كتابة ذرّيّة. Python 3.12-آمن.
الاستعمال: python patch_dialog_style.py <مسار desktop.contribution.ts>
"""
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

MARK = "mihrab-dialog-style"

# المرساةُ كتلةُ `window.dialogStyle` كاملةً حتى سطر الافتراض — لا سطرَ `'default': 'native'`
# وحده: الأخيرُ يتكرّر في عشرات إعدادات النافذة (menuStyle وtitleBarStyle وغيرهما)،
# فاستبدالُه المفرد يصيب أوّلَ ورودٍ لا ورودَنا. الكتلةُ تُميّز الهدف وحده.
ANCHOR = (
    "\t\t\t'window.dialogStyle': {\n"
    "\t\t\t\t'type': 'string',\n"
    "\t\t\t\t'enum': ['native', 'custom'],\n"
    "\t\t\t\t'default': 'native',\n"
)

REPLACEMENT = (
    "\t\t\t'window.dialogStyle': {\n"
    "\t\t\t\t'type': 'string',\n"
    "\t\t\t\t'enum': ['native', 'custom'],\n"
    "\t\t\t\t// محراب: الحوارُ المشروط يحجب التطبيق كلَّه، وافتراضُ المنبع 'native' يعني\n"
    "\t\t\t\t// حوارَ ويندوز بلغته وباتّجاه LTR ⇒ أشدُّ لحظاتِ الواجهة إلحاحًا تخرج من\n"
    "\t\t\t\t// التعريب. 'custom' يُصيّره الـworkbench فيرث dir=rtl والسلاسلَ المخبوزة.\n"
    "\t\t\t\t// نطاقُه APPLICATION فلا تبلغه configurationDefaults من إضافة (مقيسٌ لا مفترَض).\n"
    "\t\t\t\t'default': 'custom', /* mihrab-dialog-style */\n"
)


def main() -> int:
    if len(sys.argv) != 2:
        print("الاستعمال: python patch_dialog_style.py <مسار desktop.contribution.ts>",
              file=sys.stderr)
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

    nl = "\r\n" if "\r\n" in text else "\n"
    anchor = ANCHOR.replace("\n", nl)
    replacement = REPLACEMENT.replace("\n", nl)
    if anchor not in text:
        print("⚠️ لم تُعثَر كتلة window.dialogStyle في desktop.contribution.ts — تغيّر المنبع.",
              file=sys.stderr)
        return 1

    text = text.replace(anchor, replacement, 1)

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

    print("✅ رُقِّع desktop.contribution.ts (افتراضُ الحوار المشروط = custom عربيّ RTL).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
