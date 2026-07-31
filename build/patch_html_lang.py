#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""رُقعة نواة محراب: تصريح لغة المستند `<html lang>` = product.defaultLocale — الطبقة 3.

## المشكلة (اكتُشفت بالتشغيل الحيّ، لا بالمراجعة الساكنة)

محراب يُعرَّب بطريقتين متكاملتين:
  • **السلاسل**: `bake_nls_arabic.py` يخبز العربيّة داخل `nls.messages.json` الافتراضيّ
    وقت البناء — فتصير العربيّة الافتراضيّ الحرفيّ بلا اعتماد على مسح حزمة لغة.
  • **الاتّجاه**: `patch_workbench_rtl.py` يضبط `dir=rtl`.

لكنّ الخبز **يتجاوز حلّ اللغة** بالكامل: لا يُسجَّل أيّ language pack، فيبقى
`configuration.nls.language` غير معرَّف، وفي `setupNLS` بـworkbench.ts:

    let language = configuration.nls.language || 'en';
    window.document.documentElement.setAttribute('lang', language);

⇒ **`<html lang="en">` بينما كلّ نصّ الواجهة عربيّ.** المستند يكذب على مستهلكيه.

## لماذا هذا عطبٌ لا تجميل

1. **قارئات الشاشة** تختار صوت النطق من `lang`. مستخدمٌ كفيف يفتح محرابًا عربيًّا
   فيسمع العربيّة تُنطَق بصوتٍ إنجليزيّ — نصٌّ غير مفهوم عمليًّا. (WCAG 3.1.1 «لغة الصفحة».)
2. **محدّد `:lang(ar)`** لا يُطابِق أبدًا ⇒ كلّ تخصيص طباعيّ للعربيّة يموت صامتًا.
   وهذا ما حدث فعلًا للقاعدة 20 في mihrab-rtl.css (‏[AR-03]): اجتازت L0 وL2 وكانت
   **شيفرة ميّتة حيًّا** حتى كشفها القياس بـCDP (‏lang=en، والمكدّس مكدّس المنبع).
3. **فصل الحروف/التشكيل** ومحرّكات النصّ تستعمل اللغة تلميحًا للتشكيل والتهذيب.

## الحلّ

نُسنِد `defaultLocale` من هوية المنتج حين لا يحلّ NLS لغةً — بنفس فلسفة
`patch_main_locale.py` (الذي يجعل حلّ اللغة يرتدّ إلى `product.defaultLocale`).
تفضيل المستخدم يبقى الأعلى: إن حلّ NLS لغةً فعليّة (حزمة لغة مُسجَّلة أو `--locale`)
فهي المستعمَلة، ولا نلمسها.

لماذا تعذّرت طبقة أدنى: السطر يُنفَّذ في مُمهِّد النافذة قبل تحميل أيّ إضافة أو ورقة
أنماط؛ لا إعداد ولا إضافة يمكنها ضبط `lang` قبل أوّل رسم (وضبطه لاحقًا يُحدث ومضة
بخطٍّ خاطئ ويأتي بعد أن تكون قارئة الشاشة قرأت الوثيقة).

idempotent عبر الوسم mihrab-html-lang. كتابة ذرّيّة. Python 3.12-آمن.
الاستعمال: python patch_html_lang.py <مسار workbench.ts>
"""
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

MARK = "mihrab-html-lang"

ANCHOR = (
    "\t\tlet language = configuration.nls.language || 'en';\n"
)

# ‏(product as any): defaultLocale حقلٌ يضيفه محراب عبر product-overrides ولا يعرّفه
# IProductConfiguration ⇒ الطاقم الصريح يتفادى خطأ فحص أنواع TS (نفس حيلة patch_main_locale).
#
# ── مُميِّز «هل الرسائل مخبوزة؟» (قيس حيًّا، لا خُمِّن) ──
# ‏`configuration.nls.messages` = مصفوفة الرسائل المحزومة. حالتان متمايزتان تمامًا:
#   • بناء مشحون: مصفوفة مأهولة — وفي محراب محتواها **عربيّ** (خبزُ bake_nls_arabic).
#   • وضع التطوير: `undefined` (‏localize تُحلّ من المصدر ⇒ النصّ إنجليزيّ فعلًا).
# مُثبَت بـCDP على نسخة تطوير حيّة: `typeof _VSCODE_NLS_MESSAGES === 'undefined'`.
# فالشرط أدناه دقيقٌ في الحالات كلّها ولا يكذب في أيّ منها:
#   حزمة لغة حُلَّت (‏≠en)      → هي الأعلى، لا نلمسها.
#   رسائل مخبوزة ولا حزمة       → لغة المحتوى = defaultLocale (العربيّة المخبوزة).
#   وضع تطوير (لا رسائل)        → 'en'، وهو **صحيح**: نصّ التطوير إنجليزيّ.
REPLACEMENT = (
    "\t\t// محراب: العربيّة مخبوزة في nls.messages.json الافتراضيّ (bake_nls_arabic) فلا تُحلّ\n"
    "\t\t// حزمةُ لغة ⇒ كان <html lang>='en' بينما كلّ نصّ الواجهة عربيّ: تصريحٌ كاذب يجعل\n"
    "\t\t// قارئات الشاشة تنطق العربيّة بصوت إنجليزيّ (WCAG 3.1.1) ويُبطِل كلّ محدِّد :lang(ar).\n"
    "\t\t// المُميِّز: وجود nls.messages المحزومة = بناء مشحون (محتواه عربيّ)؛ غيابها = وضع\n"
    "\t\t// تطوير (نصّه إنجليزيّ فعلًا) فيبقى 'en' صادقًا. حزمة لغة مُحلّاة تغلب الاثنين.\n"
    "\t\tconst mihrabBakedLocale = (configuration.nls.messages?.length "
    "? (configuration.product as any)?.defaultLocale : undefined); /* mihrab-html-lang */\n"
    "\t\tlet language = (configuration.nls.language && configuration.nls.language !== 'en')\n"
    "\t\t\t? configuration.nls.language\n"
    "\t\t\t: (mihrabBakedLocale || configuration.nls.language || 'en');\n"
)


def main() -> int:
    if len(sys.argv) != 2:
        print("الاستعمال: python patch_html_lang.py <مسار workbench.ts>", file=sys.stderr)
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
        print("⚠️ لم تُعثَر مرساة setupNLS في workbench.ts — ربّما تغيّر المنبع.", file=sys.stderr)
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

    print("✅ رُقِّع workbench.ts (تصريف لغة المستند <html lang> = product.defaultLocale).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
