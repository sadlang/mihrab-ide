#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""L2 — تأكيدات ما بعد البناء: الكود المحقون وصل الحزمة المشحونة فعلًا (ثوانٍ).

L1 يضمن أنّ الرُقَع **طبَّقت على المصدر**؛ L2 يضمن أنّها **نجت من التحزيم/التصغير** إلى
`workbench.desktop.main.{js,css}` المشحون، وأنّ الـartifacts سليمة (exe، عربيّ افتراضيّ).

**تغطية تمثيليّة لا شاملة:** يفحص العلامات القابلة للاكتشاف نصّيًّا (أصناف CSS + سلاسل JS
حرفيّة تنجو من التصغير). الرُقَع العدديّة/المنطقيّة (minimap setLeft، margin، viewLayout…)
لا تُخلّف سلاسل ⇒ تغطّيها الطبقة الوقتيّة L3. سقوط فئة كاملة يُمسَك هنا.

الاستعمال: python tests/bundle/check_injected.py   (يتطلّب بناءً؛ يتخطّى بلطف إن غاب)
"""
import filecmp
import json
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.dirname(HERE))  # tests/
import patch_manifest as M  # noqa: E402
# وجهة التوزيع. الافتراضيّ هو ما ينتجه build/build.sh؛ و`MIHRAB_DIST_ROOT` يسمح بفحص
# حزمةٍ غُلِّفت في مجلّد آخر — لزِمنا حين حجب قفلُ نظام ملفّات (مقبض مُسرَّب لا تملكه أيّ
# عمليّة) المجلّدَ المعتاد، فغلّفنا جانبًا. لا يغيّر ما يُفحَص، بل أين يُقرأ.
DIST = os.environ.get("MIHRAB_DIST_ROOT") or os.path.join(ROOT, ".upstream", "VSCode-win32-x64")
APP = os.path.join(DIST, "resources", "app")
OUT = os.path.join(APP, "out")
# **مصدر بديل لعلامات الحزمة — مكافئ لا تنازل.** مهمّة L2 المُعلَنة أعلاه هي أنّ الحقن
# «نجا من التحزيم/التصغير». وناتج التصغير هو `out-vscode-min/`، ومهمّة التحزيم في
# ‏`build/gulpfile.vscode.ts:262` تنسخه حرفيًّا: `gulp.src(out + '/**')` ثمّ إعادة تسمية
# المجلّد إلى `out/` فقط — بلا أيّ تحويل للمحتوى. فملفّا workbench.desktop.main.{js,css}
# في الاثنين **متطابقان بايتيًّا بالبناء**، ومِجَسّاتُنا نصّيّة عليهما وحدهما.
# فحين تغيب الحزمة (أو يفشل تغليفها لسببٍ بيئيّ كقفل ملفّ) نقرأ ناتج التصغير مباشرةً:
# تغطية العلامات تبقى كاملة، ويبقى ما يحتاج الحزمة فعلًا (exe، أصول win32، الامتدادات
# المشحونة) متخطّىً بصراحة لا مُدّعىً. الترتيب: الحزمة أوّلًا حين توجد.
MIN_OUT = os.path.join(ROOT, ".upstream", "vscode", "out-vscode-min")


def _bundle_pair(rel):
    """مسار (js|css) الحزمة إن وُجد، وإلّا ناتج التصغير المكافئ بايتيًّا."""
    packaged = os.path.join(OUT, *rel)
    return packaged if os.path.isfile(packaged) else os.path.join(MIN_OUT, *rel)


JS = _bundle_pair(("vs", "workbench", "workbench.desktop.main.js"))
CSS = _bundle_pair(("vs", "workbench", "workbench.desktop.main.css"))
EXE = os.path.join(DIST, "Mihrab.exe")
# هوية بصريّة: مجلّد أصول win32 في الحزمة المشحونة (يُقارَن بالمصدر عبر M.BRANDING_ASSETS).
WIN32_OUT = os.path.join(APP, "resources", "win32")

# (وصف، ملفّ، سلسلة يجب وجودها، أدنى عدد)
BUNDLE_MARKERS = [
    # JS — طبقة النواة (الطبقة 3)
    ("workbench dir=rtl (القشرة عربيّة الاتّجاه)", JS, 'setAttribute("dir","rtl")', 1),
    ("استيراد ورقة mihrab-rtl في workbench", JS, "mihrab-rtl", 1),
    ("محرّر: محاذاة ودجة المحتوى بالـcaret (cwpos)", JS, ".cursors-layer .cursor", 1),
    ("محرّر: تمرير لاصق RTL (sticky content)", JS, "sticky-line-content", 1),
    # مِجَسّ الشعار (ASCII، يصمد أمام التصغير) يثبت أنّ **رُقعة الترويسة شُحنت**. لا يثبت نصّ
    # الجملة نفسه (esbuild يهرّب غير-ASCII إلى \\uXXXX ⇒ لا عربيّة حرفيّة في الحزمة، تحقّقنا).
    # نصّ الجملة يتحقّق منه L1 (السلسلة حرفيًّا في المصدر المُرقَّع) وL3 الوقتيّ (نصّ العنوان الفرعيّ).
    ("ترحيب: عنصر شعار القوس (ترويسة Get Started)", JS, "mihrab-welcome-mark", 1),
    ("ترحيب: طبقة الزخرفة النجميّة المحيطيّة", JS, "mihrab-welcome-pattern", 1),
    # افتراضُ الحوار المشروط. المِجَسُّ يشمل **اسمَ الإعداد** لا `default:"custom"` وحده:
    # الأخيرُ يرِد لإعداداتٍ أخرى (menuStyle وغيره) فينجح زورًا. عددناه على الحزمة قبل
    # الرُقعة: `…enum:["native","custom"],default:"native"` — أي 0 لصيغتنا.
    ("حوارٌ مشروط عربيّ RTL (dialogStyle=custom)", JS,
     'dialogStyle":{type:"string",enum:["native","custom"],default:"custom"', 1),
    # CSS — طبقة الأنماط (mihrab-rtl.css)
    ("CSS13: مسطرة النظرة يسارًا", CSS, "decorationsOverviewRuler", 1),
    ("CSS14: أرقام التمرير اللاصق يمينًا", CSS, "sticky-widget-line-numbers", 1),
    ("CSS15: ودجة الاقتراحات RTL", CSS, "suggest-widget{direction:rtl}", 1),
    ("CSS16: مرآة الإشعارات (مقصورة)", CSS, "notifications-toasts:not(.bottom-left)", 1),
    ("CSS16: مرآة الزرّ العائم", CSS, "floating-click-widget", 1),
    ("CSS17: شكل شعار القوس في الترحيب", CSS, "mihrab-welcome-mark", 1),
    ("CSS19: زخرفة نجميّة محيطيّة في الترحيب", CSS, "mihrab-welcome-pattern", 1),
    # AR-03: مكدّس خطّ القشرة العربيّة — قاعدة واحدة مدمَجة لكلّ منصّة = 3 مطابقات لـ`:lang(ar)`.
    # (المنبع لا يعرّف `:lang(ar)` إطلاقًا — راجع القاعدة 20 — فالمطابقات لنا وحدنا.) الدمج
    # في قاعدة واحدة/منصّة مقصود: مُصغِّر esbuild يدمج القواعد المتجاورة ذات المحدِّد نفسه،
    # فعدّ ٦ كان سيصير ٣ بعد التحزيم ويُسقِط المِجَسّ زورًا.
    ("CSS20: مكدّس خطّ القشرة لـ:lang(ar) [AR-03]", CSS, ":lang(ar)", 3),
    # مِجَسّ الوجه العربيّ الصريح على لينكس — الثغرة الحقيقيّة التي تسدّها القاعدة (مكدّس
    # المنبع هناك بلا محارف عربيّة). سلسلة فريدة لنا لا يعرّفها المنبع.
    ("CSS20: الوجه العربيّ الصريح على لينكس [AR-03]", CSS, "Noto Sans Arabic", 1),
    # القاعدة 21: اتّجاه التسميات المحايدة. المنبع **لا يستعمل** unicode-bidi:plaintext في
    # ‏workbench/base (تحقّقنا) ⇒ كلّ مطابقة لنا. قاعدتان (صناديق الإدخال 4 + التسميات 21).
    ("CSS21: اتّجاه التسميات المحايدة (plaintext)", CSS, "unicode-bidi:plaintext", 2),
    # القاعدة 22: الرموز الاتّجاهيّة. **المِجَسّان أدناه مُختاران بعد فشل مِجَسّين ساذجين
    # على حزمةٍ حقيقيّة** — وهو بالضبط ما وُجدت L2 لأجله:
    #   ‏(١) `translateX(-3px)` سقط لأنّ مُصغِّر esbuild يعيد كتابة الدالّة إلى الشكل العامّ
    #       `translate(-3px)`. فالمِجَسّ على النصّ المصدريّ لا على ناتج التصغير كان وهمًا.
    #   ‏(٢) `codicon-breadcrumb-separator` **نجح زورًا**: المنبع نفسه يعرّف
    #       `.codicon-breadcrumb-separator{color:inherit}`، فالمِجَسّ كان يقيس المنبع لا حقننا.
    # البديلان فريدان لنا قطعًا: السالب في `translate(-3px)` (المنبع `translate(3px)`)،
    # وصنف `codicon-view-pane-container-collapsed` الذي لا ترد له قاعدة CSS ساكنة في المنبع
    # إطلاقًا (يولّده registerIcon زمن التشغيل) — عددناهما على الحزمة: ‎0‎ قبل حقننا.
    ("CSS22: قلب مثلّث الشجرة (تدرّج + اتّجاه)", CSS, "translate(-3px)", 1),
    ("CSS22: عكس الأسهم المخصَّصة للاتّجاه", CSS, "codicon-view-pane-container-collapsed", 1),
    # القاعدة 23: عكس الحشوات الفيزيائيّة في تسمية الأيقونة. القيمتان معًا بهذا الترتيب
    # لا ترِدان في المنبع (قيمته `margin: auto 16px 0 5px` فيزيائيّة، لا منطقيّة).
    ("CSS23: عكس حشوات تسمية الأيقونة", CSS, "margin-inline:5px 16px", 1),
    # القاعدة 24: محايدات bidi في اللوحات. عددنا المرشّحين على الحزمة **قبل** حقن القاعدة:
    #   suggest-input-container .view-line ‎0‎ · extension-list-item .description ‎0‎
    #   markers-panel .marker-line ‎0‎ · search-view .messages .message ‎0‎
    # واستبعدنا `pane-header>.title` — عدده ‎1‎ في المنبع، فكان سينجح زورًا كما فعل
    # `codicon-breadcrumb-separator` في القاعدة 22. المختاران صفران قطعًا.
    ("CSS24: bidi حقل بحث الامتدادات", CSS, "suggest-input-container .view-line", 1),
    ("CSS24: bidi رسائل لوحة المشاكل", CSS, "markers-panel .marker-line", 1),
    # القاعدة 25: قوائم السياق. `.monaco-menu .keybinding` فريدٌ في الحزمة (مقيس) —
    # اخترناه علامةً لأنّه لا يظهر إلّا في كتلتنا، بخلاف `.action-label` الشائع.
    ("CSS25: bidi اختصار بند القائمة", CSS, "monaco-menu .keybinding", 1),
    # القاعدة 26: الإشعارات. `.notification-list-item-source` **يعرّفه المنبع أصلًا**
    # (عدده ‎1‎ قبل الحقن — قِسناه)، فاتّخاذه علامةً عاريةً كان سينجح زورًا كما فعل
    # `codicon-breadcrumb-separator` في القاعدة 22. نُقرِنه ببادئة RTL: ‎0‎ قبل، ‎1‎ بعد.
    ("CSS26: bidi مصدر الإشعار", CSS, "[dir=rtl] .notification-list-item-source", 1),
    # القاعدة 27: التلميحات. `.monaco-hover .hover-contents` عدده ‎7‎ في المنبع، فالبادئة
    # لازمةٌ هنا أيضًا: ‎0‎ قبل الحقن، ‎2‎ بعده (الحاوية وذرّيّتها في السطرين).
    ("CSS27: bidi محتوى التلميح", CSS, "[dir=rtl] .monaco-hover .hover-contents", 2),
    # القاعدة 28: رسالة الحالة الفارغة. `.message-box-container` عدده ‎3‎ في المنبع
    # (‏markers + comments)، فالبادئة لازمة: ‎0‎ قبل الحقن، ‎2‎ بعده.
    ("CSS28: bidi رسالة الحالة الفارغة", CSS, "[dir=rtl] .message-box-container", 2),
    # القاعدة 29: شريط العنوان. `.search-label` عدده ‎1‎ في المنبع و`.window-title` ‎26‎،
    # فالعلامةُ العارية كانت ستنجح زورًا في الاثنين. بالبادئة: ‎0‎ قبل الحقن، ‎1‎ لكلٍّ بعده.
    ("CSS29: bidi تسمية مركز الأوامر", CSS, "[dir=rtl] .search-label", 1),
    ("CSS29: bidi عنوان النافذة", CSS, "[dir=rtl] .window-title", 1),
    # القاعدة 30: عدّاد نتائج البحث. `.matchesCount` عدده ‎8‎ في المنبع، والبادئةُ RTL
    # مع سلسلة الآباء تُميّز قاعدتَنا وحدها: ‎0‎ قبل الحقن، ‎1‎ بعده.
    ("CSS30: bidi عدّاد نتائج البحث", CSS,
     "[dir=rtl] .monaco-editor .find-widget .matchesCount", 1),
    # القاعدة 31: بقيّةُ ودجات الحاوية LTR. الأصنافُ الثلاثة كلُّها موجودةٌ في المنبع
    # (‏`.title` و`.dirname` و`.message` بالمئات)، فلا علامةَ عاريةً تصلح — البادئةُ RTL
    # مع سلسلة الآباء الكاملة تُميّز قواعدنا وحدها: ‎0‎ قبل الحقن، ‎1‎ لكلٍّ بعده.
    ("CSS31: bidi عنوان إجراء الكود", CSS,
     "[dir=rtl] .action-widget .monaco-list-row .title", 1),
    ("CSS31: bidi ترويسة نظرة المشاكل", CSS,
     "[dir=rtl] .zone-widget .peekview-title .dirname", 1),
    ("CSS31: bidi متن رسالة المُشخِّص", CSS,
     "[dir=rtl] .zone-widget .descriptioncontainer .message div", 1),
    # القاعدة 32: محاذاة صفحة الترحيب والجولة. `text-align:start` **معدومٌ في الحزمة كلِّها
    # قبل حقننا** (قِسناه: ‎0‎) — المنبع يكتب المحاذاة فيزيائيّةً دائمًا، وهو عين العطب.
    # وشارةُ «مميَّزة» علامةٌ ثانية على الجزء الفيزيائيّ من القاعدة (‏`.featured-badge`
    # عدده ‎1‎ في المنبع عاريًا، فالبادئةُ RTL لازمة: ‎0‎ قبل الحقن).
    ("CSS32: محاذاة الجولة منطقيّة لا يسارًا", CSS, "text-align:start", 1),
    ("CSS32: عكس شارة «مميَّزة» في بطاقة الجولة", CSS,
     "[dir=rtl] .part.editor>.content .gettingStartedContainer .gettingStartedSlide"
     " .getting-started-category .featured-badge", 1),
]


def _count(path, needle):
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return f.read().count(needle)


_checks = []


def check(name):
    def deco(fn):
        _checks.append((name, fn))
        return fn
    return deco


@check("Mihrab.exe منتَج")
def _exe():
    assert os.path.isfile(EXE), f"لا exe: {EXE}"


@check("هوية بصريّة: كلّ أصول win32 في الحزمة = مصدر محراب (بايتيًّا)")
def _app_icon():
    for src, target in M.BRANDING_ASSETS:
        sp = os.path.join(ROOT, *src.split("/"))
        tp = os.path.join(WIN32_OUT, target)
        assert os.path.isfile(sp), f"لا أصل مصدر: {src} (شغّل assets/branding/gen_ico.py)"
        assert os.path.isfile(tp), f"لا {target} في الحزمة (لم تُحقَن الهوية؟)"
        assert filecmp.cmp(sp, tp, shallow=False), \
            f"{target} المشحون ≠ {src} (رجعت هوية VSCodium؟)"


# الحزمة تُسطّح أصول media/ إلى out/media/<basename> (لا تُمرِّر بنية src)، **وتُحسِّنها بـsvgo**:
# تُجرَّد التعليقات والـ id وviewBox ويُختصر المسار ⇒ لا مطابقة بايتيّة ولا مِجَسّ id يصمد.
# لكنّ svgo يُبقي ألوان stroke وبيانات المسار ⇒ نتحقّق بتوقيع لونيّ مشتقّ من المصدر.
OUT_MEDIA = os.path.join(APP, "out", "media")


def _readtext(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        return f.read()


def _stroke_colors(svg_text):
    import re
    return {c.lower() for c in re.findall(r'stroke="(#[0-9A-Fa-f]{6})"', svg_text)}


@check("هوية بصريّة: أصول SVG للأسطح (رأس التطبيق + خلفية المحرّر) في الحزمة = شعار محراب")
def _surface_svgs():
    matched, pending = [], []
    for src, dest in M.BRANDING_SVG_ASSETS:
        sp = os.path.join(ROOT, *src.split("/"))
        tp = os.path.join(OUT_MEDIA, os.path.basename(dest))
        assert os.path.isfile(sp), f"لا أصل مصدر: {src}"
        colors = _stroke_colors(_readtext(sp))  # ألوان القوس في مصدر محراب (تُشتَقّ، لا تُكتب حرفيًّا)
        assert colors, f"لا لون stroke في مصدر {src} (بنية SVG غير متوقَّعة؟)"
        if not os.path.isfile(tp):
            pending.append(os.path.basename(dest))
            continue
        shipped = _stroke_colors(_readtext(tp))
        # كلّ لون قوس محرابيّ حاضر في المخرَج المُحسَّن ⇒ شُحن شعار محراب (لا أصل VSCodium الأصليّ
        # ذو التدرّج الأزرق/الرماديّ #B2B2B2 — ألواننا الفيروزيّة غائبة عنه قطعًا).
        (matched if colors <= shipped else pending).append(os.path.basename(dest))
    if matched and pending:
        raise AssertionError(f"شحن جزئيّ لأسطح الهوية: طابق {matched}، وتخلّف {pending} (انحدار؟)")
    if not matched:
        # لا سطح مشحون بعد ⇒ بناء أقدم من v17 (الأسطح تُدخَل بإعادة البناء). L0 يضمن الربط ساكنًا.
        print("  ⏭️  أسطح SVG (رأس/خلفية) غير مشحونة بعد — يحتاج إعادة بناء v17 (الربط مضمون بـL0).")


# حزمة مساحة sessions التجريبيّة: شعار الحوض (VSCODE_LOGO_PATH) يُبنَى فيها كسلسلة مسار.
SESSIONS_BUNDLE = os.path.join(APP, "out", "vs", "sessions", "sessions.desktop.main.js")


@check("هوية بصريّة: شعار حوض sessions في الحزمة = قوس محراب (لا VSCodium)")
def _sessions_aquarium_logo():
    if not os.path.isfile(SESSIONS_BUNDLE):
        print("  ⏭️  حزمة sessions غير مبنيّة — تخطٍّ.")
        return
    txt = _readtext(SESSIONS_BUNDLE)
    if "M14 88" in txt:  # مسار قوس محراب المطموس
        assert "M65.566" not in txt, "الحزمة تحمل مسار محراب ومسار VSCodium معًا (حقن جزئيّ؟)"
        return  # pass: شعار الحوض = محراب
    # لا مسار محراب ⇒ بناء أقدم من v18 (يُدخَل بإعادة البناء). L0 يضمن الربط ساكنًا.
    print("  ⏭️  شعار حوض sessions غير مشحون بعد — يحتاج إعادة بناء v18 (الربط مضمون بـL0).")

@check("سمات محراب: مشحونة (داكنة + فاتحة) + الافتراضيّة معلَنة")
def _themes_shipped():
    d = os.path.join(APP, "extensions", "mihrab-themes")
    if not os.path.isdir(os.path.join(ROOT, "extensions", "mihrab-themes")):
        return  # لا إضافة سمات في هذا الفرع — تخطٍّ (لا يُفشِل)
    assert os.path.isdir(d), "إضافة سمات محراب غير مشحونة في المخرَج (extensions/mihrab-themes)"
    for fn in ("mihrab-dark-color-theme.json", "mihrab-light-color-theme.json"):
        assert os.path.isfile(os.path.join(d, "themes", fn)), f"سمة مفقودة في الحزمة: {fn}"
    pkg = json.load(open(os.path.join(d, "package.json"), encoding="utf-8"))
    assert pkg.get("contributes", {}).get("configurationDefaults", {}).get("workbench.colorTheme"), \
        "السمة الافتراضيّة غير معلَنة في حزمة المخرَج"


@check("سمة أيقونات محراب: مشحونة (SVG + JSON) + الافتراضيّة معلَنة")
def _icons_shipped():
    if not os.path.isdir(os.path.join(ROOT, "extensions", "mihrab-icons")):
        return  # لا إضافة أيقونات في هذا الفرع — تخطٍّ
    d = os.path.join(APP, "extensions", "mihrab-icons")
    assert os.path.isdir(d), "إضافة أيقونات محراب غير مشحونة (extensions/mihrab-icons)"
    tj = os.path.join(d, "mihrab-icon-theme.json")
    assert os.path.isfile(tj), "ملفّ سمة الأيقونات مفقود في الحزمة"
    # الأصول اليدويّة + **عائلة [AR-06] المولَّدة**: `cp -r` في build.sh يجرّد `*.py`
    # (المولّد) ويُبقي الـSVG. سقوطها يعيد المستكشف إلى صفحاتٍ متطابقة بلا أن يُفشِل L0.
    for svg in ("sad.svg", "file.svg", "folder.svg", "folder-open.svg",
                "code.svg", "data.svg", "doc.svg", "image.svg", "meta.svg"):
        assert os.path.isfile(os.path.join(d, "icons", svg)), f"أيقونة SVG مفقودة في الحزمة: {svg}"
    assert not os.path.isfile(os.path.join(d, "gen_icons.py")), \
        "مولّد الأيقونات شُحن مع المنتج (يجب أن يجرّده build.sh مع بقيّة *.py)"
    # افحص **محتوى** الـJSON المشحون لا وجوده فقط (بناء يشحن JSON بائتًا/فارغًا يمرّ وإلّا):
    td = json.load(open(tj, encoding="utf-8"))
    defs = td.get("iconDefinitions", {})
    sad_ref = td.get("fileExtensions", {}).get("ص") or td.get("languageIds", {}).get("sad")
    assert sad_ref in defs, "خريطة ملفّ ص مفقودة/مكسورة في سمة الأيقونات المشحونة"
    pkg = json.load(open(os.path.join(d, "package.json"), encoding="utf-8"))
    default = pkg.get("contributes", {}).get("configurationDefaults", {}).get("workbench.iconTheme")
    ids = {i.get("id") for i in pkg.get("contributes", {}).get("iconThemes", [])}
    assert default in ids, "سمة الأيقونات الافتراضيّة لا تطابق أيّ id في حزمة المخرَج"


@check("خطّ AR-02: @font-face بـdata:URI في CSS المشحون (مشروط بتوريد الخطّ)")
def _arabic_font_shipped():
    # الحقن مشروط بتوريد بايتات الخطّ (سقوط رشيق)؛ لا يمكن جعله غير مشروط وإلّا فشل حين لا خطّ.
    # الإشارة: الملفّ المُجهَّز في .upstream/ (ما نسخه build.sh فعلًا حين وُجد المصدر).
    if not os.path.isfile(CSS):
        return  # لا حزمة — يتخطّى الإطار العامّ أصلًا، وهذا احتياط
    staged = os.path.join(ROOT, ".upstream", ".mihrab-kawkab-mono.woff2")
    src_default = os.path.join(ROOT, "patches", "fonts", "kawkab-mono.woff2")
    if not (os.path.isfile(staged) or os.path.isfile(src_default) or os.environ.get("MIHRAB_ARABIC_FONT")):
        print("  ⏭️  خطّ Kawkab Mono غير مورَّد — @font-face غير محقون (سقوط رشيق مقصود؛ L0 يضمن الوصل).")
        return
    css = _readtext(CSS)
    # الخطّ مورَّد ⇒ يجب أن يكون الحقن زمن البناء وصل CSS المشحون: @font-face + data:font/woff2 + العائلة.
    assert "@font-face" in css and "data:font/woff2" in css and "Kawkab Mono" in css, \
        "الخطّ مورَّد لكن @font-face/data:font/woff2 غائب عن CSS المشحون (فشل الحقن زمن البناء؟)"


@check("product.json المبنيّ: عربيّ افتراضيّ (defaultLocale=ar)")
def _built_locale():
    pj = os.path.join(APP, "product.json")
    assert os.path.isfile(pj), "لا product.json مبنيّ"
    assert json.load(open(pj, encoding="utf-8")).get("defaultLocale") == "ar", \
        "defaultLocale ليس ar في المخرَج (خبز/هوية فشل)"


@check("product.json المبنيّ: «حدِّث» لا يجلب المنبع (المُحدِّث معطَّل + روابطُ محراب)")
def _built_update_identity():
    """
    ⚠️ العطبُ الذي أبلغه المستخدم يعيش في **المشحون** لا في ملفّ التجاوزات: التجاوزُ
    قد يكون سليمًا ودمجُه ساقطًا. فالسؤالُ هنا يُوجَّه إلى ما يُشغّله المستخدم فعلًا.

    وشرطُ التعطيل ليس `updateUrl` وحده: `abstractUpdateService` يعطّل عند `!updateUrl ||
    !commit`. فنقبل غيابَ أيّهما، ونرفض أن يكون العنوانُ حيًّا ويشير إلى منبع.
    """
    pj = os.path.join(APP, "product.json")
    assert os.path.isfile(pj), "لا product.json مبنيّ"
    prod = json.load(open(pj, encoding="utf-8"))
    upd = prod.get("updateUrl")
    assert not upd, f"المُحدِّث فعّال: updateUrl={upd} — «حدِّث» سيستبدل محرابًا بالمنبع"
    # روابطُ الهويّة التي نملكها. (‏keyboardShortcutsUrl*/documentation المتروكةُ عمدًا
    # توثيقُ المحرّر نفسِه لا هويّةُ منتجٍ منافس — تُستثنى صراحةً لا صمتًا.)
    owned = ("downloadUrl", "reportIssueUrl", "licenseUrl", "requestFeatureUrl",
             "releaseNotesUrl", "serverDownloadUrlTemplate", "twitterUrl")
    for k in owned:
        v = prod.get(k)
        if not v:
            continue
        low = str(v).lower()
        assert not any(u in low for u in ("vscodium", "microsoft", "visualstudio")), \
            f"{k} يقود المستخدمَ إلى المنبع: {v}"


def main():
    print("═══ L2: تأكيدات الحزمة المشحونة ═══")
    packaged = os.path.isdir(OUT)
    if not packaged and not os.path.isfile(JS):
        print(f"  ⏭️  لا مخرَج بناء ({OUT}) ولا ناتج تصغير ({MIN_OUT}) — تخطٍّ "
              f"(شغّل build/build.sh أوّلًا).")
        return 0
    failed = 0
    if not packaged:
        # وضعٌ جزئيّ **مُعلَن**: العلامات تُفحَص على ناتج التصغير (المكافئ بايتيًّا)، وفحوص
        # الحزمة (exe/أصول/امتدادات) تُتخطّى صراحةً. لا ندّعي تغطيةً لم تجرِ.
        print(f"  ⏭️  لا حزمة مُغلَّفة — العلامات تُفحَص على {os.path.relpath(MIN_OUT, ROOT)} "
              f"(نسخة حرفيّة منه في الحزمة)، وفحوص الأصول/exe متخطّاة.")
        for name, fn in _checks:
            print(f"  ⏭️  {name} — يحتاج حزمة مُغلَّفة.")
    else:
        for name, fn in _checks:
            try:
                fn()
                print(f"  ✅ {name}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"  ❌ {name}: {e}")
    for desc, path, needle, minc in BUNDLE_MARKERS:
        c = _count(path, needle)
        if c is None:
            failed += 1
            print(f"  ❌ {desc}: ملفّ الحزمة مفقود ({os.path.basename(path)})")
        elif c >= minc:
            print(f"  ✅ {desc} (×{c})")
        else:
            failed += 1
            print(f"  ❌ {desc}: «{needle}» غائب عن الحزمة (سقط في التحزيم/التصغير؟)")
    n = (len(_checks) if packaged else 0) + len(BUNDLE_MARKERS)
    print(f"─── {n - failed}/{n} نجحت ───")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
