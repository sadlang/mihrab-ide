#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""رُقعة نواة محراب: هوية صفحة الترحيب (Get Started) — الطبقة 3.

تستبدل ترويسة صفحة الترحيب المولّدة في gettingStarted.ts: تُضيف طبقة زخرفة نجميّة محيطيّة
(‏.mihrab-welcome-pattern، بلاطة نجمة ثمانيّة خافتة) + عنصر شعار القوس
(‏.mihrab-welcome-mark، يُنسَّقان في mihrab-rtl.css كخلفيّة SVG)، وتبدّل العنوان الفرعيّ
«Editing evolved» بالجملة الافتتاحيّة الاستعاريّة لمحراب. العنوان نفسه = productService.nameLong
(= «محراب» من هوية product.json) فيبقى كما هو.

الملفّ المنبعيّ: src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts
(دالّة بناء الترويسة، حيث `const header = $('.header', …)`).
لماذا تعذّرت طبقة أدنى: الترويسة مبنيّة برمجيًّا بـdom.$ لا قالبًا؛ لا سبيل من إعداد/ورقة أنماط
لإضافة عنصر الشعار أو تبديل نصّ العنوان الفرعيّ.

ملاحظة i18n (قرار مقصود): العنوان الفرعيّ يُستبدَل بسلسلة عربيّة **ثابتة** لا عبر localize،
فيبقى عربيًّا حتّى لو بدّل المستخدم لغة العرض للإنجليزيّة. هذا متّسق مع هوية محراب العربيّة-أوّلًا
(defaultLocale=ar) وصوت العلامة؛ الجملة الاستعاريّة مِلكيّة لا نصّ قابل للترجمة. الشعار كذلك
غير اتّجاهيّ ويظهر في الاتّجاهين (قاعدة CSS 17 غير مقصورة على [dir=rtl]).

idempotent عبر الوسم mihrab-welcome. كتابة ذرّيّة. Python 3.12-آمن.
الاستعمال: python patch_welcome_rtl.py <مسار gettingStarted.ts>
"""
import json
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

MARK = "mihrab-welcome"

# تُكتب بـ\n ثمّ تُطابَق نهاية سطر الملفّ الفعليّة وقت التشغيل. gettingStarted.ts في المنبع
# الحاليّ LF خالص، لكنّ الكشف يتكيّف (CRLF إن وُجد) فيصمد لو تغيّر ترميز المنبع.
ANCHOR = (
    "\t\tconst header = $('.header', {},\n"
    "\t\t\t$('h1.product-name.caption', {}, this.productService.nameLong),\n"
    "\t\t\t$('p.subtitle.description', {}, localize({ key: 'gettingStarted.editingEvolved', comment: ['Shown as subtitle on the Welcome page.'] }, \"Editing evolved\"))\n"
    "\t\t);"
)

# الجملة الافتتاحيّة الاستعاريّة (IP هويّة محراب — استثناء مقبول لقاعدة منع السلاسل الحرفيّة).
# ثابت مسمّى كي يُحرَّر النصّ من موضع واحد لا من داخل قالب الرقعة.
# ⚠️ اقتران: مِجَسّ L3 في tests/runtime/rtl.spec.mjs (WELCOME_TAGLINE_MARKER = "تكتب فيه") يطابق
# جزءًا من الجملة — وهو اليوم في WELCOME_LEDE أدناه لا في الشطر الأوّل؛ أيّ إعادة صياغة تُسقِط
# ذلك الجزء من **مجموع** الشطرين يجب أن تُحدِّث المِجَسّ أيضًا.
WELCOME_TAGLINE = "للمِحرابِ اتّجاه، ولكودِك وِجهة."
# الشطر الثاني: صوتٌ ثانٍ لا نِدّ. يُصيَّر **ابنًا داخل** نفس `p.subtitle` لا شقيقًا له —
# قرارٌ مقصود لسببين: (أ) يبقى `textContent` للعنوان الفرعيّ حاويًا الجملتين فلا ينكسر مِجَسّ
# L3 (الذي يقرأ `.subtitle` وحده)، (ب) هما جملةٌ واحدة دلاليًّا فيحسن أن تكونا فقرةً واحدة
# لقارئ الشاشة بدل فقرتين منفصلتين. التمييز البصريّ (حجم/لون/سطر مستقلّ) من CSS قاعدة 27.
WELCOME_LEDE = "مكانٌ صافٍ تكتب فيه بالعربيّة كما تُفكّر بها."

# حرفيّة JS مهرَّبة بأمان (json.dumps ⇒ اقتباس مزدوج مقبول في TS، ويهرّب أيّ ' أو \\ مستقبليّ
# في إعادة صياغة الجملة). تعليق allow-any-unicode-next-line = إعفاء لينتر VSCode المعياريّ
# لسلسلة غير-ASCII حرفيّة في workbench/contrib (يمنع إخفاق no-unexternalized/unicode لو مُشِّط اللينتر).
_TAGLINE_JS = json.dumps(WELCOME_TAGLINE, ensure_ascii=False)
_LEDE_JS = json.dumps(WELCOME_LEDE, ensure_ascii=False)

REPLACEMENT = (
    "\t\t// mihrab-welcome: زخرفة نجميّة محيطيّة + شعار القوس + العنوان (nameLong=محراب) + الجملة الاستعاريّة بدل «Editing evolved».\n"
    "\t\tconst header = $('.header', {},\n"
    "\t\t\t$('.mihrab-welcome-pattern', { 'aria-hidden': 'true' }),\n"
    "\t\t\t$('.mihrab-welcome-mark', { 'aria-hidden': 'true' }),\n"
    "\t\t\t$('h1.product-name.caption', {}, this.productService.nameLong),\n"
    "\t\t\t/* allow-any-unicode-next-line */\n"
    "\t\t\t$('p.subtitle.description', {}, " + _TAGLINE_JS + ",\n"
    "\t\t\t\t/* allow-any-unicode-next-line */\n"
    "\t\t\t\t$('span.mihrab-welcome-lede', {}, " + _LEDE_JS + "))\n"
    "\t\t);"
)


def main() -> int:
    if len(sys.argv) != 2:
        print("الاستعمال: python patch_welcome_rtl.py <مسار gettingStarted.ts>", file=sys.stderr)
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
        print("⚠️ لم تُعثَر مرساة ترويسة صفحة الترحيب في gettingStarted.ts — ربّما تغيّر المنبع.", file=sys.stderr)
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

    print("✅ رُقِّع gettingStarted.ts (هوية صفحة الترحيب: شعار + جملة استعاريّة).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
