#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""رُقعة نواة محراب: اتّجاهُ لوحِ شرحِ الجولة — الطبقة 3.

**العطب (مرصودٌ حيًّا بـCDP لا استنتاجًا):** لوحُ الشرح في صفحة الترحيب ليس عنصرًا في
القشرة بل **إطارُ webview بمستندٍ مستقلّ**، يبنيه `renderMarkdown` هنا نصًّا. ذلك المستند
يخرج بـ`<html>` عاريةً — لا `dir` ولا `lang` — فيرتدّ إلى `ltr` مهما كانت القشرة. قِسناه
على الحزمة المشحونة: `documentElement.getAttribute('dir') === null` و`direction: ltr`
على الفقرة العربيّة نفسِها. والأثرُ يُرى بالعين: النقطةُ الختاميّة تقفز يسارًا
(«‎.الكتابة إلى العربيّة»)، وأعمدةُ الجدول تبدأ من اليسار، والقوائمُ تُحاذى يسارًا.

**لماذا تعذّرت طبقةٌ أدنى** (جُرِّبت الثلاث قبل النزول إلى هنا):
  • ‏L1 (محتوانا): مِلفّاتُ الجولة `.md` لنا، لكنّ `readAndCacheStepMarkdown` يمرّرها على
    مطهّر DOM قائمتُه البيضاء `allowedMarkdownHtmlAttributes` — و`dir` **ليست فيها**
    (‏`augment` هنا يضيف `x-dispatch`/`when-checked`/… لا غير). فأيّ `<div dir="rtl">`
    نكتبه في الـmd يُنزَع صامتًا.
  • ‏L2 (ورقةُ أنماطنا): `mihrab-rtl.css` تُحقَن في مستند القشرة، ولا تعبر حدَّ الـwebview.
  • إعدادٌ: لا خيارَ في المنبع لاتّجاه لوح الجولة.

**والقيمةُ تُشتقّ لا تُكتَب:** نقرأ `dir`/`lang` من `document.documentElement` — مستندِ
القشرة المضيفة نفسِه (ويضبطهما `patch_workbench_rtl.py` و`patch_html_lang.py`). فلا سلسلةَ
مكرَّرة تنجرف، ويتبع اللوحُ مضيفَه إن صار المضيفُ LTR يومًا. و`document` عالميّةٌ مستعملةٌ
في هذه الدالّة أصلًا (`document.location.protocol` في السطر المُرسى عليه).

**و`padding-inline-end` بدل `padding-right`:** حشوةُ الـ32px في المنبع فجوةٌ بين لوح الشرح
وحافّة النافذة. في LTR يقع اللوحُ يمينًا فالفجوةُ يمينًا؛ وفي RTL ينقلب موضعُه فتبقى
الحشوةُ الفيزيائيّة في الجهة الخطأ — تلتصق العربيّةُ بالحافّة وتفغر فجوةً حيث لا تُرى.
والخاصّيّةُ المنطقيّة مطابقةٌ بايتًا في LTR (‏`inline-end` = يمين) فلا انحدارَ هناك.

**مُرشَّحةٌ للرفع إلى المنبع:** العطبُ ليس من صنعنا — كلُّ حزمةِ لغةٍ RTL (عربيّة/عبريّة/فارسيّة)
تُصيبها. لم تُصَغ diff منبعيّة هنا لأنّها ستُطبَّق على ملفٍّ ترقّعه سلسلةُ محراب أصلًا.

idempotent عبر الوسم mihrab-walkthrough-dir. كتابة ذرّيّة. Python 3.12-آمن.
الاستعمال: python patch_walkthrough_dir.py <مسار gettingStartedDetailsRenderer.ts>
"""
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

MARK = "mihrab-walkthrough-dir"

# تُكتب بـ\n ثمّ تُطابَق نهاية سطر الملفّ الفعليّة وقت التشغيل.
#
# المرساةُ تشمل السطرين قبل `<html>` عمدًا: الوسمُ `\t\t<html>` يتكرّر **ثلاث مرّات** في
# الملفّ (‏markdown/SVG/video)، فمرساةٌ عليه وحده تُصيب أوّلَ ما تلقى لا ما نقصد.
ANCHOR = (
    "\t\tconst inDev = document.location.protocol === 'http:';\n"
    "\t\tconst imgSrcCsp = inDev ? 'img-src https: data: http:' : 'img-src https: data:';\n"
    "\n"
    "\t\treturn `<!DOCTYPE html>\n"
    "\t\t<html>"
)

REPLACEMENT = (
    "\t\tconst inDev = document.location.protocol === 'http:';\n"
    "\t\tconst imgSrcCsp = inDev ? 'img-src https: data: http:' : 'img-src https: data:';\n"
    "\n"
    "\t\t// mihrab-walkthrough-dir: مستندُ الـwebview مستقلٌّ عن القشرة فلا يرث اتّجاهها.\n"
    "\t\t// نشتقّهما من المضيف بدل تثبيت سلسلةٍ تنجرف عنه.\n"
    "\t\tconst mihrabDir = document.documentElement.getAttribute('dir') || 'ltr';\n"
    "\t\tconst mihrabLang = document.documentElement.getAttribute('lang') || 'en';\n"
    "\n"
    "\t\treturn `<!DOCTYPE html>\n"
    "\t\t<html dir=\"${mihrabDir}\" lang=\"${mihrabLang}\">"
)

# حشوةُ الفجوة: فيزيائيّة ⇒ منطقيّة. مقصورةٌ على قالب markdown (القالبان الآخران لا يحملانها).
PAD_ANCHOR = "\t\t\t\t\t\tpadding-right: 32px;"
PAD_REPLACEMENT = "\t\t\t\t\t\tpadding-inline-end: 32px; /* mihrab-walkthrough-dir */"


def main() -> int:
    if len(sys.argv) != 2:
        print("الاستعمال: python patch_walkthrough_dir.py <مسار gettingStartedDetailsRenderer.ts>",
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
        print("⚠️ لم تُعثَر مرساةُ قالب markdown في gettingStartedDetailsRenderer.ts — ربّما تغيّر المنبع.",
              file=sys.stderr)
        return 1
    text = text.replace(anchor, replacement, 1)

    # الحشوةُ فشلٌ قاتلٌ لا تخطٍّ: بدونها يبقى نصفُ العطب (اتّجاهٌ صحيحٌ وفجوةٌ في الجهة الخطأ)
    # بينما تُعلن الرقعةُ نجاحًا — وذلك أسوأ من الحمرة.
    if text.count(PAD_ANCHOR) != 1:
        print(f"⚠️ حشوةُ الفجوة (padding-right: 32px) لم تُعثَر مرّةً واحدة — عُدَّت {text.count(PAD_ANCHOR)}.",
              file=sys.stderr)
        return 1
    text = text.replace(PAD_ANCHOR, PAD_REPLACEMENT, 1)

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

    print("✅ رُقِّع gettingStartedDetailsRenderer.ts (اتّجاهُ لوح شرح الجولة + حشوةٌ منطقيّة).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
