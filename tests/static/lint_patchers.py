#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""L0 — فحص ساكن لطبقة رقعة محراب (ثوانٍ، بلا بناء، بلا منبع، صالح لـCI).

يمسك: مرقِّع معطوب نحويًّا، وسم مكرّر/عدّ خاطئ في FILES، JSON غير صالح، **انجراف مانيفست
حزمة اللغة عن الملفّات**، قواعد CSS غير مقصورة على RTL، ومانيفست الرُقَع غير متّسق.

الاستعمال: python tests/static/lint_patchers.py   (خرج 0 = نجاح، 1 = فشل)
لا يعتمد pytest (أسرار CI صفريّة) — إطار فحص بسيط داخليّ.
"""
import json
import os
import py_compile
import re
import shutil
import subprocess
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))  # جذر mihrab-ide
BUILD = os.path.join(ROOT, "build")

# أصناف هويّة محراب المحقونة (عناصر نملكها) — تُعفى قواعدها من قصر [dir=rtl] لأنّها غير
# اتّجاهيّة وتستهدف عناصرنا لا عناصر VSCode العامّة. أضِف هنا كلّ صنف هويّة جديد.
IDENTITY_CLASSES = ("mihrab-welcome-mark", "mihrab-welcome-pattern", "mihrab-welcome-lede")
sys.path.insert(0, os.path.dirname(HERE))  # tests/
import patch_manifest as M  # noqa: E402

_checks = []


def check(name):
    def deco(fn):
        _checks.append((name, fn))
        return fn
    return deco


def _read(path):
    with open(path, "r", encoding="utf-8", newline="") as f:
        return f.read()


# ───────────────────────── L0-1: صياغة المرقِّعات ─────────────────────────
@check("كلّ مرقِّعات build/ تُصرَّف (Python)")
def _compile_all():
    pys = [f for f in os.listdir(BUILD) if f.endswith(".py")]
    assert pys, "لا مرقِّعات في build/"
    for f in pys:
        py_compile.compile(os.path.join(BUILD, f), doraise=True)


@check("لا شاهدة خلفيّة في تعليقٍ داخل قالب نصّيّ (فخّ أسقط ملفَّين فعلًا)")
def _no_backtick_in_templates():
    """يمنع فخًّا **وقعنا فيه مرّتين** فأسقط الملفّ كلَّه بـSyntaxError.

    ‏JS ونحن نكتب DOM/CSS داخل قوالب نصّيّة (`` evaluate(`…`) `` و``webview.html = `…` ``)،
    ونشرح داخلها بالعربيّة. وأيّ شاهدةٍ خلفيّة في تعليقٍ **داخل القالب** تُنهي القالب هناك،
    فينهار ما بعده نحويًّا ويصير الخطأ في سطرٍ لا علاقة له بالسبب — أضلَّنا مرّتين:
    مرّةً في `chat.js` (أمسكها اختبار الوحدة) ومرّةً في `harness.mjs` (أمسكها التشغيل الحيّ).
    الفحص ساكن ورخيص، فيسبق الاثنين.

    نمسح **سطور التعليق وحدها** داخل القوالب: الشاهدة في شيفرةٍ فعليّة داخل القالب قد تكون
    مقصودة (قالب متداخل)، أمّا في تعليقٍ فلا فائدة منها أبدًا — البديل ‎U+200E‎ حولها.
    """
    import re as _re
    targets = [os.path.join(ROOT, "tests", "runtime", "harness.mjs"),
               os.path.join(ROOT, "tests", "runtime", "launch.mjs"),
               os.path.join(ROOT, "tests", "runtime", "rtl.spec.mjs"),
               os.path.join(ROOT, "extensions", "mihrab-nebras", "chat.js")]
    OPEN = _re.compile(r"(?:evaluate\(|html\s*=\s*|return\s+)`")
    for path in targets:
        if not os.path.isfile(path):
            continue
        inside, offenders = False, []
        for i, line in enumerate(_read(path).split("\n"), 1):
            if not inside:
                m = OPEN.search(line)
                # ⚠️ **القالبُ ذو السطر الواحد يُغلَق في سطره.** كان الفحص يفتح الحالة ثمّ
                # `continue` بلا فحص الإغلاق، فيبقى «داخل قالب» حتى يصادف سطرًا يُغلِق —
                # فيُبلِّغ عن كلّ تعليقٍ بينهما زورًا. أوقعَنا فيه أوّلُ سطرٍ من صنف
                # ``evaluate(`…`), 1`` أضفناه: أشعل إنذارًا على تعليقٍ قديمٍ سليم بعده
                # بأربعين سطرًا. **الحارسُ الكاذب أخطرُ من غيابه**: يُعلِّم القارئَ أنّ
                # حمرةَ هذا الفحص ضجيج، فيتجاهلها يوم تصدق.
                if m and "`" not in line[m.end():]:
                    inside = True
                continue
            # نهاية القالب: سطر يُغلقه (`)` أو `;` بعد شاهدة) — تقريبٌ كافٍ لملفّاتنا.
            if _re.search(r"`\s*[);]", line) or line.strip() == "`;":
                inside = False
                continue
            if line.lstrip().startswith("//") and "`" in line:
                offenders.append(i)
        assert not offenders, (
            f"{os.path.basename(path)}: شاهدة خلفيّة في تعليقٍ داخل قالب نصّيّ عند "
            f"السطور {offenders} — تُنهي القالب وتُسقِط الملفّ بـSyntaxError")


@check("لا هروب نمطيّ بشرطةٍ واحدة داخل قالب نصّيّ (فرعُ كشفٍ ماتَ صامتًا)")
def _no_single_escape_in_templates():
    """يمنع الفخّ **الأخطر** في قوالبنا: لا يُسقِط الملفّ، بل يُضعِف الكشف صامتًا.

    ما نكتبه داخل ``evaluate(`…`)`` يمرّ بمرحلتَي تأويل: قالبُ JS عندنا، ثمّ الشيفرة في
    الصفحة. فـ`\\p{L}` بشرطةٍ واحدة يبتلعها القالب ويصل إلى الصفحة `p{L}` — **صنفُ محارفٍ
    حرفيّ** لا فئةٌ يونيكوديّة. لا خطأ نحويّ ولا تحذير: تعبيرٌ صحيحٌ يطابق شيئًا آخر.

    وقع هذا عندنا مرّتين وكلتاهما كلَّفت:
      • `\\s` ⇒ `s` ⇒ `split(/s+/)` شَطَر أسماءَ الأصناف على حرف «s» فصار
        ‎composite-bar‎ ⇒ ‎compo.ite-bar‎، وأعاد الماسحُ ‎25‎ بلاغًا كاذبًا.
      • `\\p{L}` ⇒ `p{L}` ⇒ `strong` صار `null` في كلّ نصٍّ خالٍ من ‎p/L‎، فـ`startsLTR`
        `False` أبدًا، ففرعُ «المحايد الطرفيّ» **ميّتٌ كلُّه** — والفحص أخضر.

    الثاني هو الأسوأ: أخضرُ يعني «مسحنا ولم نجد» بينما الحقيقة «لم نبحث». فلا نتّكل على
    أن نتذكّر المضاعفة — نفرضها ساكنًا.

    نحصر الحروف المرصودة في `pPsSdDwWbB` (لا معنى لأيٍّ منها كهروبٍ نصّيّ)، ونستثني
    `\\n` و`\\t` و`\\u` — فهذه مقصودةٌ حرفيًّا داخل القوالب.
    """
    import re as _re
    targets = [os.path.join(ROOT, "tests", "runtime", "harness.mjs"),
               os.path.join(ROOT, "tests", "runtime", "launch.mjs"),
               os.path.join(ROOT, "tests", "runtime", "rtl.spec.mjs"),
               os.path.join(ROOT, "extensions", "mihrab-nebras", "chat.js")]
    OPEN = _re.compile(r"(?:evaluate\(|html\s*=\s*|return\s+)`")
    # شرطةٌ **فردٌ** (عددٌ زوجيّ من الشرطات قبلها ⇒ مُضاعَفة ⇒ سليمة) يتبعها حرفُ فئة.
    BAD = _re.compile(r"(?<!\\)(?:\\\\)*\\([pPsSdDwWbB])")
    for path in targets:
        if not os.path.isfile(path):
            continue
        inside, offenders = False, []
        for i, line in enumerate(_read(path).split("\n"), 1):
            if not inside:
                # نفس تصحيح القالب ذي السطر الواحد المشروح في `_no_backtick_in_templates`.
                m = OPEN.search(line)
                if m and "`" not in line[m.end():]:
                    inside = True
                continue
            if _re.search(r"`\s*[);]", line) or line.strip() == "`;":
                inside = False
                continue
            if line.lstrip().startswith("//"):
                continue                      # الشرح لا يصل الصفحةَ فلا يضرّ
            for m in BAD.finditer(line):
                if m.group(0).count("\\") % 2:   # فردٌ فعلًا
                    offenders.append((i, m.group(1)))
        assert not offenders, (
            f"{os.path.basename(path)}: هروبٌ بشرطةٍ واحدة داخل قالب نصّيّ عند "
            f"{offenders} — يصل الصفحةَ حرفًا عاديًّا فيموت فرعُ الكشف صامتًا. ضاعِف الشرطة.")


# ───────────────────── L0-2: بنية FILES في patch_editor_rtl ─────────────────────
@check("patch_editor_rtl.FILES سليمة (وسوم فريدة، عدّ موجب، شكل صحيح)")
def _editor_files_shape():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "_ed", os.path.join(BUILD, "patch_editor_rtl.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert hasattr(mod, "FILES") and mod.FILES, "FILES مفقودة/فارغة"
    marks = []
    for entry in mod.FILES:
        assert len(entry) == 3, f"إدخال FILES ليس ثلاثيًّا: {entry[:1]}"
        relpath, mark, edits = entry
        assert isinstance(relpath, str) and relpath.startswith("src/"), f"مسار غير صالح: {relpath}"
        assert isinstance(mark, str) and mark, f"وسم غير صالح لـ{relpath}"
        marks.append(mark)
        assert edits, f"لا تعديلات لـ{relpath}"
        for e in edits:
            assert len(e) == 3, f"تعديل ليس ثلاثيًّا في {relpath}"
            old, new, count = e
            assert isinstance(old, str) and old, f"مرساة فارغة في {relpath}"
            assert isinstance(new, str) and new, f"استبدال فارغ في {relpath}"
            assert isinstance(count, int) and count > 0, f"عدّ غير موجب في {relpath}"
            assert old != new, f"مرساة == استبدال في {relpath} (لا عمل)"
            assert old in new or mark in new, (
                f"الاستبدال لا يحوي المرساة ولا الوسم في {relpath} — قد يفشل idempotency")
    assert len(marks) == len(set(marks)), f"وسوم مكرّرة في FILES: {marks}"


# ───────── L0-2أ: وسم إصدار الرُقَع مضمَّن في كتلة الحقن ─────────
@check("إصدار رُقَع النواة: VERSION_MARK حاضر في INJECT (لا حقنٌ بائت)")
def _core_patch_version_embedded():
    """رفعُ CORE_PATCH_VERSION دون تحديث التعليق داخل INJECT خطأٌ **حدث فعلًا**.

    ‏patch_bundle_extensions يتحقّق منه وقت التشغيل ويُجهض — لكنّ ذلك يقع داخل `build.sh`
    بعد دقائق من التجهيز. هنا يصير الفشلُ ثانيتين. (ولو غاب الحارسان معًا لبقي البناءُ
    يستعمل حقنًا بائتًا بلا الرُقَع الجديدة — نجاحٌ كاذب، أسوأ من إخفاق.)
    """
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "_pbe", os.path.join(BUILD, "patch_bundle_extensions.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.VERSION_MARK in mod.INJECT, (
        f"«{mod.VERSION_MARK}» غير موجود في INJECT — حدّث التعليق داخل الكتلة مع رفع الإصدار.")


# ───────── L0-2ب: قائمة الجولات المُسقَطة (لا تبتلع محتوى الوصول) ─────────
@check("إسقاط جولات المنبع: القائمة مقصورة على التعريفيّة ولا تمسّ SetupAccessibility")
def _walkthroughs_drop_scope():
    """الخطر الحقيقيّ هنا ليس فشلَ المرساة (يمسكه L1) بل **توسُّع القائمة**.

    `SetupAccessibility` هي الجولة الوحيدة التي تشرح أدوات الوصول، ومحراب لا يوفّر بديلًا
    عنها؛ إسقاطها يحذف محتوًى لا يُعوَّض. و`notebooks` وظيفيّة لا تعريفيّة ومحكومة بسياق.
    فنُثبّت القائمة على الثلاثة التعريفيّة بالضبط، ونمنع انجرافها بصمت.
    """
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        "_wd", os.path.join(BUILD, "patch_walkthroughs_drop.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    dropped = set(mod.DROPPED_IDS)
    assert dropped == {"Setup", "SetupWeb", "Beginner"}, (
        f"قائمة الجولات المُسقَطة انجرفت: {sorted(dropped)} — "
        "التوسيع قرارٌ يحتاج تبريرًا (خاصّةً SetupAccessibility: محتوى وصول بلا بديل).")
    # الاستبدال يجب ألّا يُبقي مرجعًا للمصفوفة الأصليّة في حساب الترتيب (وإلّا انزاح الترتيب).
    assert "order: mihrabWalkthroughs.length - index" in mod.REPLACEMENT, (
        "حساب الترتيب لا يستعمل المصفوفة المُرشَّحة — سينزاح ترتيب الجولات الباقية.")
    assert "order: walkthroughs.length" not in mod.REPLACEMENT, (
        "بقي مرجعٌ للمصفوفة غير المُرشَّحة في حساب الترتيب.")
    assert mod.MARK in mod.REPLACEMENT, "الوسم غائب عن الاستبدال — يسقط idempotency."


# ───────────────────── L0-3: اتّساق مانيفست الرُقَع ─────────────────────
@check("مانيفست الرُقَع متّسق (كلّ مرقِّع موجود على القرص)")
def _manifest_consistency():
    for name, mode, _targets in M.PATCHERS:
        assert os.path.isfile(os.path.join(BUILD, name)), f"مرقِّع مفقود: {name}"
        assert mode in ("file", "root"), f"وضع غير معروف لـ{name}: {mode}"
    for name in M.BUILD_PATCHERS:
        assert os.path.isfile(os.path.join(BUILD, name)), f"مرقِّع بناء مفقود: {name}"
    # ملفّات محرّر RTL قابلة للاشتقاق:
    ed = M.editor_target_files(BUILD)
    assert len(ed) >= 6, f"عدد ملفّات محرّر RTL غير متوقَّع: {len(ed)}"


# ──────── L0-3ب: تقريرُ المنبع يواكب الرُقَع ────────
UPSTREAM_REPORT = os.path.join(ROOT, "docs", "اقتراحات تعديلات المصدر", "README.md")


def _report_drop_column():
    """عمودُ «الرُقَع التي يُسقطها» من الجدول الموجز وحده — لا كلُّ التقرير ولا كلُّ الجدول.

    قصرُ الفحص على هذا العمود مقصود من الطرفين: ذِكرُ الرقعة عَرَضًا في فقرةٍ لا يعني أنّ
    لها مقترحًا مقابلًا (فيمرّ الفحصُ كذبًا)، و`dir` و`nameShort` في عمود الوصف أسماءُ
    خصائصَ لا رُقَعٍ (فيُخفق كذبًا). العمودُ الثالث وحده هو الربطُ رقعةً↔مقترحًا.
    """
    text = _read(UPSTREAM_REPORT)
    i = text.find("## الجدول الموجز")
    assert i >= 0, "لا «## الجدول الموجز» في تقرير المنبع — تغيّرت بنيتُه فعمِيَ الفحص."
    j = text.find("\n## ", i + 1)
    rows = [ln for ln in text[i:j if j > 0 else len(text)].splitlines()
            if ln.lstrip().startswith("|")]
    assert len(rows) >= 5, f"الجدول الموجز شبهُ فارغ ({len(rows)} سطرًا) — عمِيَ الفحص."
    cells = []
    for ln in rows:
        parts = ln.split("|")
        assert len(parts) >= 6, f"صفٌّ بأعمدةٍ غيرِ متوقَّعة في الجدول الموجز: {ln[:60]}"
        cells.append(parts[3])
    return "\n".join(cells)


@check("تقريرُ المنبع يغطّي كلّ رقعة (رقعةٌ بلا مقترحٍ = دَينٌ خفيّ)")
def _upstream_report_covers_patchers():
    """طلبُ المستخدم: «التقرير يُحدَّث بعد كلّ إضافةِ رقعةٍ في محراب».

    بلا حارسٍ يبقى ذلك وعدًا يعتمد على الذاكرة: تُضاف رقعةٌ، ويُنسى بندُها، فيبدو
    التقريرُ كاملًا وهو ناقص — وهذا أسوأ من غيابه، لأنّه يُطمئن. القائمةُ تُشتقّ من
    **القرص** لا من المانيفست: `patch_cli_macapp` مثلًا ليس في المانيفست (يرقّع
    VSCodium لا vscode) ومع ذلك يستحقّ بندًا (م-١٠).
    """
    assert os.path.isfile(UPSTREAM_REPORT), (
        "تقريرُ اقتراحات المنبع مفقود: docs/اقتراحات تعديلات المصدر/README.md")
    table = _report_drop_column()

    stems = {f[len("patch_"):-3] for f in os.listdir(BUILD)
             if f.startswith("patch_") and f.endswith(".py")}
    stems |= {f[:-3] for f in M.BUILD_PATCHERS if not f.startswith("patch_")}
    missing = sorted(s for s in stems if f"`{s}`" not in table)
    assert not missing, (
        "رُقَعٌ بلا بندٍ في الجدول الموجز — أضِف لكلٍّ مقترحَ المنبع الذي يُسقطها: "
        + " · ".join(missing))


@check("تقريرُ المنبع لا يذكر رقعةً زائلة (بندٌ ميّت يوهم بدَينٍ لم يعد قائمًا)")
def _upstream_report_has_no_stale_rows():
    table = _report_drop_column()
    known = set(os.listdir(BUILD))
    stale = []
    for tok in re.findall(r"`([^`]+)`", table):
        if "." in tok or "/" in tok:   # ملفّاتٌ ومساراتٌ لا أسماءُ رُقَع
            continue
        if f"patch_{tok}.py" not in known and f"{tok}.py" not in known:
            stale.append(tok)
    assert not stale, (
        "أسماءُ رُقَعٍ في الجدول الموجز بلا ملفٍّ في build/ — أُزيلت الرقعةُ ولم يُحدَّث "
        "التقرير، أو أُخطئ الاسم: " + " · ".join(sorted(set(stale))))


@check("تقريرُ المنبع: لكلّ صفٍّ في الجدول قسمٌ مكتوب (لا فهرسَ يحيل إلى فراغ)")
def _upstream_report_rows_have_sections():
    """الصفُّ وحده ليس بندًا. حذفُ قسم «م-13» كاملًا مع إبقاء صفّه كان يمرّ أخضرَ —
    فيبدو التقريرُ مغطّيًا وهو فهرسٌ يحيل إلى لا شيء. (رصدَته مراجعةٌ هندسيّة بطفرة.)
    """
    text = _read(UPSTREAM_REPORT)
    i = text.find("## الجدول الموجز")
    j = text.find("\n## ", i + 1)
    rows = [ln for ln in text[i:j if j > 0 else len(text)].splitlines()
            if ln.lstrip().startswith("|")]
    nums = [m.group(1) for ln in rows for m in [re.search(r"\[م-([٠-٩]+)\]", ln)] if m]
    assert len(nums) >= 10, f"لم أستخرج أرقامَ البنود من الجدول ({len(nums)}) — عمِيَ الفحص."
    thin = []
    for n in nums:
        k = text.find(f"## م-{n})")
        if k < 0:
            thin.append(f"م-{n} (لا قسم)")
            continue
        end = text.find("\n## ", k + 1)
        body = [ln for ln in text[k:end if end > 0 else len(text)].splitlines()[1:]
                if ln.strip() and ln.strip() != "---"]
        # المقياسُ **الفراغُ** لا الطول: حدُّ 400 محرفٍ جرّبناه فأخفق على م-12 وم-14 وهما
        # قسمان تامّان قصيران (عطبُ سطرين لا يحتاج صفحة). ثلاثةُ أسطرٍ ومئةُ محرفٍ تفصل
        # «قسمٌ مكتوب» عن «عنوانٌ يليه فاصل» بلا حكمٍ على الإسهاب.
        if len(body) < 3 or len(" ".join(body)) < 100:
            thin.append(f"م-{n} (قسمٌ فارغ)")
    assert not thin, (
        "بنودٌ في الفهرس بلا متنٍ مكتوب — مقترحٌ بلا نصٍّ لا يُرفَع ولا يُسقِط رقعة: "
        + " · ".join(thin))


@check("تقريرُ المنبع: مراسي الفهرس تحلّ إلى عناوينَ موجودة")
def _upstream_report_anchors_resolve():
    """رابطٌ ميّتٌ في فهرسٍ من ٥٠٠ سطرٍ لا يُكتشَف بالقراءة. المرساةُ تُشتقّ من العنوان
    بقاعدة GitHub: خفضُ الحالة، حذفُ الترقيم، والمسافةُ شَرطة."""
    text = _read(UPSTREAM_REPORT)
    # كلُّ مستويات العناوين لا `## ` وحدَها: أوّلُ عنوانٍ فرعيٍّ برابطٍ **صحيح** كان
    # يُسقِط الفحصَ أحمرَ كاذبًا. ولاحقةُ التكرار (`-1`) كما تفعل GitHub.
    heads, seen = set(), {}
    for ln in text.splitlines():
        m = re.match(r"(#{2,6})\s+(.*)", ln)
        if not m:
            continue
        slug = re.sub(r"[^\w؀-ۿ\s-]", "", m.group(2).strip().lower(), flags=re.UNICODE)
        slug = re.sub(r"\s+", "-", slug.strip())
        n = seen.get(slug, 0)
        seen[slug] = n + 1
        heads.add(slug if n == 0 else f"{slug}-{n}")
    dead = sorted({a for a in re.findall(r"\]\(#([^)]+)\)", text) if a not in heads})
    assert not dead, "مراسٍ في الفهرس لا عنوانَ لها: " + " · ".join(dead)


@check("تقريرُ المنبع: أعدادُ الملفّات في الجدول = ما يمسّه المرقِّع فعلًا")
def _upstream_report_counts_match():
    """‏«٩ ملفّات» و«١٦ ملفًّا» أرقامٌ منسوخةٌ يدويًّا تتقادم بصمتٍ عند تغيّر `FILES` —
    فيُرفَع إلى المنبع مقترحٌ يَعِد بإسقاط تسعةٍ وهي أحدَ عشر. (رصدَته مراجعةٌ هندسيّة.)
    """
    ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
    table = _report_drop_column()
    # أرقامٌ عربيّةٌ **ولاتينيّة**: حصرُها في `[٠-٩]` كان يُمرِّر «(11 ملفًّا)» أخضرَ.
    # و«ملف» بلا شدّةٍ ولا تنوين ليطابق «ملفّات» و«ملفًّا» معًا.
    pairs = [(s, n) for cell in table.splitlines()
             for s, n in re.findall(r"`([a-z_]+)`\s*\(([٠-٩\d]+)\s*ملف", cell)]
    assert pairs, "لا عددَ ملفّاتٍ في عمود الرُقَع — تغيّرت صياغةُ الجدول فعمِيَ الفحص."
    unchecked = []
    for stem, num in pairs:
        patcher = f"patch_{stem}.py"
        # لا تخطٍّ صامت: رقمٌ لمرقِّعٍ لا نعرف كيف نتحقّق منه يُعلَن، لا يُبتلَع — وهو
        # عينُ «التخطّي الصامت» الذي أُزيل من L2. (رصدَته مراجعةٌ هندسيّة.)
        if patcher not in M.ROOT_PATCHER_FILES_ATTR:
            unchecked.append(f"{stem} ({num})")
            continue
        actual = len(M.root_target_files(BUILD, patcher))
        claimed = int(num.translate(ARABIC_DIGITS))
        assert claimed == actual, (
            f"التقرير يقول إنّ `{stem}` يمسّ {claimed} ملفًّا، و`FILES` تقول {actual} "
            "— رقمٌ متقادمٌ في مقترحٍ يُرفَع إلى المنبع")
    assert not unchecked, (
        "أعدادُ ملفّاتٍ في الجدول لا مصدرَ يتحقّق منها (المرقِّعُ ليس مرقِّعَ جذرٍ ذا `FILES`) "
        "— اذكرها بلا رقمٍ أو اجعلها مشتقّة: " + " · ".join(unchecked))


# ───────────────────── L0-4: صحّة JSON ─────────────────────
@check("product.json و package.json صالحة JSON")
def _json_valid():
    paths = [os.path.join(ROOT, "product-overrides", "product.json")]
    ext = os.path.join(ROOT, "extensions")
    if os.path.isdir(ext):
        for d in os.listdir(ext):
            pj = os.path.join(ext, d, "package.json")
            if os.path.isfile(pj):
                paths.append(pj)
    for p in paths:
        with open(p, "r", encoding="utf-8") as f:
            json.load(f)
    # product.json: عربيّ افتراضيّ (انحدار تعريب)
    prod = json.load(open(os.path.join(ROOT, "product-overrides", "product.json"), encoding="utf-8"))
    assert prod.get("defaultLocale") == "ar", "defaultLocale ليس 'ar' (انحدار تعريب)"


# ───────── L0-4ب: هويّةُ التحديث والروابط — «حدِّث» يجب ألّا يجلب المنبع ─────────
@check("هويّة المنتج: المُحدِّث معطَّل ولا رابطَ يشير إلى المنبع")
def _product_identity_not_upstream():
    """
    ⚠️ عطبٌ حقيقيّ أبلغه المستخدم: زرُّ «تحديث التطبيق» كان يُنزِّل **المنبع** لا محرابًا.

    السبب: `updateUrl` يُورَث من VSCodium إلى تغذيةِ إصداراته، و`commit` موجود — فالمُحدِّث
    **يعمل** ويستبدل محرابًا بـVSCodium بلا أن يسأل. ولا تغذيةَ تحديثٍ لمحراب، فالصوابُ
    تعطيلُه صراحةً (‏`updateUrl: null` ⇒ `State.Disabled(MissingConfiguration)`) لا توجيهُه
    إلى عنوانٍ لا وجود له — وعنوانٌ ميّت يعطي «فشل التحديث» بدل «لا تحديث»، وهما ليسا سواء.

    وروابطُ الهويّة (تنزيل/إبلاغ/رخصة/ملاحظات) من الصنف نفسه: رابطٌ يقود المستخدمَ إلى
    منتجٍ آخر عطبُ هويّة، لا تجميل.
    """
    prod = json.load(open(os.path.join(ROOT, "product-overrides", "product.json"), encoding="utf-8"))
    assert "updateUrl" in prod and prod["updateUrl"] is None, \
        "updateUrl ليس null — المُحدِّث سيعمل على تغذية المنبع ويستبدل محرابًا"
    assert prod.get("serverDownloadUrlTemplate", "x") is None, \
        "serverDownloadUrlTemplate ليس null — لا بناءَ خادمٍ لمحراب"
    upstream = ("vscodium", "microsoft", "visualstudio")
    for k, v in prod.items():
        if k.startswith("_comment") or not isinstance(v, str):
            continue
        if k.endswith(("Url", "UrlTemplate")) or k.endswith(("UrlLinux", "UrlMac", "UrlWin")):
            low = v.lower()
            assert not any(u in low for u in upstream), f"{k} يشير إلى المنبع: {v}"


# مفاتيحُ توثيقٍ **يجب** أن تكون مُصرَّحةً في التجاوزات — لا يكفي أن تكون سليمةً إن وُجدت.
# القيمةُ: None ⇒ يجب تصفيرُها، "url" ⇒ يجب أن تكون سلسلةً غيرَ فارغة.
MUST_DECLARE_URLS = {
    "documentationUrl": "url",
    "keyboardShortcutsUrlWin": "url",
    "keyboardShortcutsUrlLinux": "url",
    "keyboardShortcutsUrlMac": "url",
    "tipsAndTricksUrl": None,
    "introductoryVideosUrl": None,
}


@check("هويّة المنتج: مفاتيح التوثيق مُصرَّحة (لا وراثةَ صامتة من المنبع)")
def _product_docs_urls_declared():
    """
    الفحصُ السابق يمنع أن **يشير** مفتاحٌ *موجود* إلى المنبع — لكنّه أعمى عن المفاتيح
    **الموروثة**: مفتاحٌ لا نُصرّح به أصلًا لا يمرّ على الحلقة، فيبقى على قيمة المنبع
    ويقود المستخدمَ إلى code.visualstudio.com. وهذا بالضبط موضعُ العطب الذي أُبلغ عنه:
    «مرجع اختصارات لوحة المفاتيح» كان يفتح ملفَّ PDF إنجليزيًّا وLTR معًا.

    فالحارسُ هنا معكوسُ ذاك: يُلزم **الحضور** لا يفحص القيمة وحدها. وما يُصفَّر يُصفَّر
    عمدًا: `helpActions.ts` يشتقّ `AVAILABLE = !!product.X`، فالتصفيرُ يحذف بندَ القائمة
    كلَّه — أشرفُ من وعدٍ بالعربيّة يُسلَّم إنجليزيّة.
    """
    prod = json.load(open(os.path.join(ROOT, "product-overrides", "product.json"), encoding="utf-8"))
    for key, want in MUST_DECLARE_URLS.items():
        assert key in prod, (
            f"{key} غير مُصرَّح في product-overrides — سيُورَث من المنبع ويقود إلى مايكروسوفت.")
        if want is None:
            assert prod[key] is None, (
                f"{key} يجب أن يكون null حتّى يوجد بديلٌ عربيّ (التصفير يحذف بندَ القائمة).")
        else:
            assert isinstance(prod[key], str) and prod[key].strip(), f"{key} ليس عنوانًا صالحًا."


# ───────────── L0-5: مانيفست حزمة اللغة ↔ الملفّات (فحص Amelia مؤتمَتًا) ─────────────
@check("موقع التوثيق: كلّ رابطٍ في product.json يقابل صفحةً مولَّدة (لا 404)")
def _docs_urls_resolve_to_pages():
    """
    وعدُنا في خطّة التعريب: «كلُّ صفحةٍ تُفتَح من داخل محرابٍ تصل إلى صفحةٍ عربيّة،
    لا إلى 404 ولا إلى إنجليزيّة». والوعدُ بلا حارسٍ ينكسر عند أوّل إعادة تسمية:
    نعيد تسميةَ ملفٍّ في `site/content` فيصير بندُ «مرجع الاختصارات» في القائمة
    رابطًا ميّتًا — ولا شيءَ يصرخ حتّى يشتكي مستخدم.
    """
    prod = json.load(open(os.path.join(ROOT, "product-overrides", "product.json"), encoding="utf-8"))
    site_root = "https://sadlang.github.io/mihrab-ide/"
    content = os.path.join(ROOT, "site", "content")
    if not os.path.isdir(content):
        return  # لا موقع في هذا الفرع — تخطٍّ
    slugs = {fn[:-3] for fn in os.listdir(content) if fn.endswith(".md")}
    for k, v in prod.items():
        if not isinstance(v, str) or not v.startswith(site_root):
            continue
        rest = v[len(site_root):].strip("/")
        if not rest:
            continue  # الجذر: الصفحة الأولى، تُولَّد دائمًا
        assert rest in slugs, (
            f"{k} يشير إلى /{rest}/ ولا ملفَّ site/content/{rest}.md — رابطٌ ميّت في القائمة.")


@check("مجلّد الإعدادات: الرقعة موصولة فعلًا (نسخٌ + استدعاء + وحدتا TS)")
def _config_folder_patch_wired():
    """
    ثغرةٌ صامتة بامتياز: الرقعةُ نفسُها قد تكون سليمةً تمامًا — تجتاز L1 بستّةَ عشرَ
    ملفًّا وidempotent — ثمّ **لا تعمل أبدًا** لأنّ سطرَ استدعائها ناقصٌ من كتلة الحقن.
    حينئذٍ يبقى كلُّ شيءٍ أخضر ويظلّ البناءُ المشحون على `.vscode`، ولا شيءَ يشتكي.

    وشرطٌ ثانٍ: وحدتا TS الجديدتان تُنسَخان إلى شجرة المنبع. لو غابتا لفشل البناءُ
    بصوتٍ عالٍ (استيرادٌ لملفٍّ غير موجود) — وهذا مقبول؛ لكنّ الفحصَ هنا أرخصُ من
    اكتشافه بعد أربعين دقيقةَ بناء.
    """
    patcher = os.path.join(BUILD, "patch_config_folder.py")
    if not os.path.isfile(patcher):
        return  # لا رقعة في هذا الفرع — تخطٍّ
    core = os.path.join(ROOT, "patches", "core")
    for name in ("mihrabConfigFolder.ts", "mihrabConfigFolderResolve.ts"):
        assert os.path.isfile(os.path.join(core, name)), (
            f"patches/core/{name} مفقود — الرقعة تستورده ولا تنسخه.")

    build_sh = _read(os.path.join(BUILD, "build.sh"))
    assert "patch_config_folder.py" in build_sh, (
        "build.sh لا ينسخ patch_config_folder.py إلى شجرة المنبع.")
    assert "$ROOT/patches/core" in build_sh, (
        "build.sh لا ينسخ patches/core (وحدتا TS) — استيرادٌ لملفٍّ غير موجود.")

    bundle = _read(os.path.join(BUILD, "patch_bundle_extensions.py"))
    assert ".mihrab-patch-config-folder.py ." in bundle, (
        "كتلة الحقن لا **تستدعي** رقعة مجلّد الإعدادات — نسخٌ بلا تشغيل: كلّ الفحوص "
        "خضراء والبناء المشحون يبقى على .vscode.")


@check("موقع التوثيق: مصطلحاتُ الترجمة من المسرد (لا انفصال عن الواجهة)")
def _docs_glossary_respected():
    """
    الشرطُ الذي يُفشِل مشروعَ التعريب إن أُغفِل: توثيقٌ يقول «لوحة الأوامر» وواجهةٌ
    تقول «لوحة الأوامر السريعة» **أسوأُ من توثيقٍ إنجليزيّ** — لأنّه يُشكِّك المستخدمَ
    في فهمه هو. فالمسردُ مصدرُ حقيقةٍ واحد، وهذا الفحصُ يمسك البدائلَ الممنوعة.
    """
    gpath = os.path.join(ROOT, "site", "data", "glossary.json")
    content = os.path.join(ROOT, "site", "content")
    if not (os.path.isfile(gpath) and os.path.isdir(content)):
        return
    terms = json.load(open(gpath, encoding="utf-8"))["terms"]
    bad = []
    for fn in sorted(os.listdir(content)):
        if not fn.endswith(".md"):
            continue
        text = open(os.path.join(content, fn), encoding="utf-8").read()
        for t in terms:
            for wrong in t.get("forbidden", []):
                if wrong in text:
                    bad.append(f"{fn}: «{wrong}» ⇐ المعتمد «{t['ar']}»")
    assert not bad, "مصطلحاتٌ خارج المسرد:\n    " + "\n    ".join(bad)


@check("حزمة اللغة: كلّ ترجمة معلَنة موجودة، ولا ملفّ غير معلَن")
def _langpack_manifest_matches_files():
    pkg_dir = os.path.join(ROOT, "extensions", "language-pack-ar")
    if not os.path.isdir(pkg_dir):
        return  # لا حزمة لغة في هذا الفرع — تخطٍّ
    pkg = json.load(open(os.path.join(pkg_dir, "package.json"), encoding="utf-8"))
    locs = pkg.get("contributes", {}).get("localizations", [])
    declared = set()
    for loc in locs:
        for tr in loc.get("translations", []):
            rel = tr["path"].lstrip("./")
            declared.add(os.path.normpath(rel))
            assert os.path.isfile(os.path.join(pkg_dir, rel)), f"ترجمة معلَنة مفقودة: {rel}"
    # لا يتيم: كلّ ملفّ i18n في translations/ معلَن
    tdir = os.path.join(pkg_dir, "translations")
    on_disk = set()
    for root, _dirs, files in os.walk(tdir):
        for fn in files:
            if fn.endswith(".i18n.json"):
                rel = os.path.relpath(os.path.join(root, fn), pkg_dir)
                on_disk.add(os.path.normpath(rel))
    orphan = on_disk - declared
    assert not orphan, f"ملفّات ترجمة غير معلَنة في المانيفست: {sorted(orphan)[:5]}"


# ───────────────────── L0-6: lint طبقة CSS ─────────────────────
def _strip_css_comments(text):
    out, i, n = [], 0, len(text)
    while i < n:
        if text[i:i + 2] == "/*":
            j = text.find("*/", i + 2)
            i = (j + 2) if j != -1 else n
        else:
            out.append(text[i])
            i += 1
    return "".join(out)


@check("لقطة L1 مواكِبة لوسم المنبع المثبَّت (upstream.json)")
def _snapshot_matches_upstream():
    # يُغلق حلقيّة L1-في-CI: لو رُقِّي المنبع دون refresh_snapshot، يصير الفحص على لقطة
    # قديمة بلا معنى. نُلزِم أنّ وسم اللقطة = وسم upstream.json (وإلّا: حدِّث اللقطة).
    tag_file = os.path.join(os.path.dirname(HERE), "apply", "snapshot", "SNAPSHOT_TAG.txt")
    up_file = os.path.join(ROOT, "upstream.json")
    if not os.path.isfile(tag_file) or not os.path.isfile(up_file):
        return  # لا لقطة/منبع في هذا الفرع — تخطٍّ
    up_tag = json.load(open(up_file, encoding="utf-8")).get("vscodium", {}).get("tag", "")
    snap_tag = ""
    for line in open(tag_file, encoding="utf-8"):
        if "tag:" in line:
            snap_tag = line.split("tag:", 1)[1].strip()
            break
    assert snap_tag == up_tag, (
        f"لقطة L1 ({snap_tag}) ≠ وسم المنبع ({up_tag}) — شغّل refresh_snapshot.py بعد ترقية المنبع")


@check("mihrab-rtl.css: أقواس متوازنة وكلّ قاعدة مقصورة على [dir=rtl]")
def _css_lint():
    css_path = os.path.join(ROOT, M.CSS_PATCH)
    text = _read(css_path)
    assert text.count("{") == text.count("}"), "أقواس CSS غير متوازنة"
    body = _strip_css_comments(text)
    # استخرج المحدّدات على المستوى الأعلى (قبل كلّ '{' بعمق 0)
    selectors, depth, buf = [], 0, []
    for ch in body:
        if ch == "{":
            if depth == 0:
                selectors.append("".join(buf).strip())
                buf = []
            depth += 1
        elif ch == "}":
            depth -= 1
            buf = []
        elif depth == 0:
            buf.append(ch)
    selectors = [s for s in selectors if s]
    assert len(selectors) >= 15, f"عدد قواعد CSS منخفض بشكل مريب: {len(selectors)}"
    for sel in selectors:
        # تخطَّ القواعد الشرطيّة (@media/@supports…) — محدّداتها الداخليّة تُفحَص بذاتها.
        if sel.lstrip().startswith("@"):
            continue
        # افحص **كلّ جزء بفاصلة** لا السلسلة كاملةً: «.foo, [dir=rtl] .bar» يحوي [dir=rtl]
        # لكنّ .foo عالميّ متسرّب — الفحص على المجموع يمرّره خطأً (نجاح كاذب).
        for part in sel.split(","):
            part = part.strip()
            if not part:
                continue
            # استثناء قواعد هويّة محراب: محدّد يستهدف عنصرًا **نملكه** (صنف هوية مُحقَن) لا
            # عنصر VSCode عامّ ⇒ لا تسرّب عالميّ ممكن، ويجب أن يظهر في الاتّجاهين (الشعار غير
            # اتّجاهيّ، كالعنوان). قائمة صريحة (لا بادئة mihrab- عامّة كي لا نُعفي .mihrab-grid-sv
            # في القاعدة 12 التي يجب أن تبقى مقصورة على RTL).
            if any(idc in part for idc in IDENTITY_CLASSES):
                continue
            assert '[dir="rtl"]' in part, (
                f"جزء محدّد غير مقصور على RTL (تسرّب عالميّ): «{part[:60]}» ضمن «{sel[:40]}…»")


@check("إبراز يونيكود [AR-04]: إعفاء ص من nonBasicASCII — مقصورًا على اللغة لا عالميًّا")
def _unicode_highlight():
    """‏[AR-04] يحرس إعفاءً **مقيسًا** من `editor.unicodeHighlight` — وحدَّه في آن.

    **العطب:** `editor.unicodeHighlight.nonBasicASCII` افتراضُه `inUntrustedWorkspace`، وهو
    يُبرِز **كلّ** محرف خارج ‎U+0020–U+007E‎. وقياسنا على مِلفّ ص واقعيّ: **62% من محارفه
    غير-ASCII**. أي أنّ فتح مجلّد ص غير موثوق — وهي الحالة الافتراضيّة لأيّ مشروع مُنزَّل —
    يُغرِق الملفّ كلَّه في إبرازات تحذير. وهذا مسارٌ قاطع لا احتماليّ: في
    `unicodeTextModelHighlighter.ts` يعود `shouldHighlightNonBasicASCII` بـNonBasicASCII
    **قبل** استدلال سياق الكلمة، فلا شيء يُنقِذ منه.

    **ولماذا اقتصر الإصلاح على هذا المفتاح وحده — قياسٌ لا حَدْس:**
      • ‏`ambiguousCharacters` **تبقى مفعَّلة**، والعربيّةُ المُلتبِسة تُعفى **بالاسم** عبر
        `allowedCharacters` داخل `[sad]` وحدها. وهذا **تصحيحُ قياسٍ سابقٍ كان يكذب**:
        قلنا «كلمة واحدة من 1238» اعتمادًا على استدلال سياق الكلمة (يُعفي الكلمة التي لا
        ASCII فيها وفيها محرفٌ غير-مُلتبِس). والشرطُ في المنبع هو **`!hasBasicASCIICharacters`**
        — أي **محرفُ ASCII واحدٌ يُبطِل الإعفاء كلَّه** — ومعرّفاتُ ص تُكتب `نصاب_الفضة`،
        والشرطةُ السفليّة ASCII. فأعدنا القياس بمحاكاة قاعدة المنبع حرفيًّا، **والمجموعةُ
        مسمّاةٌ لأنّ النسبة بلا مجموعةٍ ادّعاء**:
            نواة نهلة (‏c:\\s_lang\\nahla، 174 ملفّ ص):  77690 من 607018 كلمة = **12.8%**
            أمثلة مستودع اللغة (6 ملفّات):              59 من 843 = 7.0%
            هذا المستودع (ملفّ تجهيزٍ واحد):             0 من 107 = 0.0%
        (وقلنا أوّلًا «59 من 950 على مصادر ص في المستودع» — والمجموعةُ كانت أمثلةَ
        مستودع اللغة لا هذا المستودع. صحّحته مراجعةٌ هندسيّة، والرقمُ الحاكم هو نهلة:
        أكبرُ شيفرةِ ص حقيقيّة عندنا.) وكلُّ المُعلَّم معرّفاتُ snake_case عربيّة.
        (ورصده المستخدم على نسخةٍ حيّة: «مستطيلٌ أصفر حول كلّ حرف ا».)

        فالإعفاء لـ17 نقطة كودٍ من كتل العربيّة (‏0600–06FF · 0750–077F · 08A0–08FF —
        اليومَ كلُّها في الأولى) وردت في `_common`، وللقوسين
        المزخرفين ﴾﴿ **بالاسم** (يُكتبان عمدًا لاقتباس آية). ونُبقي بقيّةَ **صور العرض**
        (‏FB50+/FE70+) مُعلَّمةً عمدًا: لا تُنتجها لوحةُ مفاتيحَ عربيّة، فوجودُها إشارةٌ
        تستحقّ التنبيه لا ضجيجًا. والحمايةُ من trojan-source باقيةٌ لكلّ ما عداها —
        وأهمُّها للعربيّة `invisibleCharacters` (‏RLM/LRO وأخواتُها تقلب ترتيبَ السطر
        بصريًّا) ولم تُمسّ.

        **وفخٌّ ظنَنّاه قائمًا فلم يكن — مُثبَتُ النفي بالقراءة، ومكتوبٌ هنا كي لا يُبعَث:**
        الإصلاحُ السريع «استثنِ هذا المحرف» (`excludeCharFromBeingHighlighted`) يكتب فعلًا
        في إعدادات المستخدم **عالميًّا** بلا `overrideIdentifier` — وهذا صحيح. واستنتجنا
        منه أنّ نقرةً واحدةً في md تُبطِل إعفاءَنا المحصورَ في `[sad]` **ذرّيًّا**، فبنينا
        عليه توسيعًا للنطاقات وبندًا رابعًا في م-13. **والاستنتاجُ خطأ:** الدمجُ بين
        المصادر وبين تجاوزات اللغة **عميقٌ لا ذرّيّ** — `ConfigurationModel.merge` (‏:156)
        و`createOverrideConfigurationModel` (‏:203) كلاهما يمرّ بـ`mergeContents` (‏:219)
        وهي تعاود النزول في كلّ قيمةٍ كائنًا. فقيمةُ المستخدم `{«а»: true}` **تتّحد**
        بمحارفنا التسعةَ عشرَ ولا تحلّ محلَّها. والمفاتيحُ الذرّيّةُ حقًّا هي البوليانيّة،
        ولا مسارَ في الواجهة يكتب `nonBasicASCII: true` (أوامرُ التعطيل تكتب `false` فقط).
        فلا فخَّ هنا. (رصدَته مراجعةٌ هندسيّة، وتحقّقناه بقراءة الملفّ لا بالثقة.)

        **وأسبقيّةُ النطاق اللغويّ أقوى ممّا ظنَنّا مرّتين:** `getConsolidatedConfigurationModel`
        (‏:990) يدمج المصادرَ كلَّها **ثمّ** يستدعي `.override(id)`، فمحتوى النطاق اللغويّ
        يُطبَّق فوق المتن أيًّا كان مصدرُه. أي أنّ افتراضَنا `[sad]` يغلب **قيمةَ المستخدم
        العامّة** لا العكس. والحالةُ الوحيدةُ التي تغلبنا: قيمةٌ بنطاقِ لغةٍ في إعدادات
        المستخدم/المشروع — وعليها وحدَها يُنذر حارسُ `unicode-guard.js`.

        **ما بقي من التوسيع، بحيثيّةٍ أخرى:** `[markdown]` و`[plaintext]` و`[git-commit]`
        و`[git-rebase]` تأخذ `nonBasicASCII: false` **وحدَه** — لا إعفاءً بالاسم. السببُ
        ليس الفخّ بل أنّ المفتاح افتراضُه `inUntrustedWorkspace`، وأيُّ مشروعٍ مُنزَّلٍ غيرُ
        موثوقٍ ابتداءً، فيغرق README عربيٌّ كلُّه بالمستطيلات. والنثرُ لا يُنفَّذ. ورسالةُ
        الالتزام تُحرَّر داخل المحرّر وتخلط عربيًّا بلاتينيٍّ ملتصق — وهو النمطُ الذي
        يتجاوز إعفاءَ سياق الكلمة. أمّا `[json]`/`[jsonc]` فتُركتا عمدًا: `tasks.json`
        و`devcontainer.json` هما ما يقرؤه المراجعُ **قبل** منحِ الثقة، وإسكاتُهما يُسقِط
        الإشارةَ في موضع القرار.

        **والضجيجُ خارجَ هذه النطاقات مقيسٌ لا مُقدَّر:** ‏md ‏0.05% · ts ‏0.25% ·
        json ‏0.07% من الكلمات — النثرُ العربيُّ بلا snake_case، ونمطُ «الـHTML» وحده
        يُبطِل إعفاءَ سياق الكلمة بحرفٍ لاتينيٍّ ملتصق.

        **وإبقاءُ `invisibleCharacters` مفعَّلةً مقيسٌ أيضًا** (كان ادّعاءً يُكرَّر): في
        ‏174 ملفّ ص من نواة نهلة (‏4.88 مليون محرف) وُجدت ‏312 علامةً خفيّةً فقط —
        ‏192 LRM و120 RLM، أي ‏0.006% من المحارف ونحوُ علامتين في الملفّ. فالكلفةُ على
        المستخدم لا تُذكَر، والفائدةُ حقيقيّة: هذه العلاماتُ تقلب ترتيبَ السطر بصريًّا.
      • ‏`allowedLocales: {ar: true}` **عديم الأثر** لا حلّ: بيانات المحليّات في
        `strings.ts` لا تحوي `ar` أصلًا (‏cs/de/es/fr/it/ja/ko/pl/pt-BR/ru/tr/zh…)،
        والمُرشِّح `Object.hasOwn(data, l)` يُسقِط أيّ محليّة غير موجودة. أثبتناه بالقراءة.

    **ولماذا مقصورًا على `[sad]`:** خيارات المحرّر `LANGUAGE_OVERRIDABLE`
    (‏editorConfigurationSchema.ts:19)، فالإعفاء ينحصر في اللغة التي **غير-ASCII هي متنُها**.
    إسقاطه عالميًّا يُطفئ حمايةً حقيقيّة في كلّ لغة أخرى — ولذا يمنعه هذا الفحص صراحةً.
    """
    shell = os.path.join(ROOT, "extensions", "mihrab-shell", "package.json")
    sad_pkg = os.path.join(ROOT, "extensions", "sad-lang", "package.json")
    if not (os.path.isfile(shell) and os.path.isfile(sad_pkg)):
        return
    # مُعرّف اللغة من مصدره الوحيد (مساهمة sad-lang) لا من سلسلة مُختلَقة — كما في _lang_identity.
    lang_id = json.load(open(sad_pkg, encoding="utf-8"))["contributes"]["languages"][0]["id"]
    defaults = json.load(open(shell, encoding="utf-8")).get("contributes", {}).get("configurationDefaults", {})
    KEY = "editor.unicodeHighlight.nonBasicASCII"
    # نطاقان لا واحد، وبصلاحيّتين مختلفتين:
    #   • `[sad]`: الإطفاءُ الشامل **والإعفاءُ بالاسم** — متنُ الملفّ عربيّ، ومعرّفاتُه
    #     snake_case عربيّةٌ تُبرَز بالملتبِس (قياسُ نهلة: 12.8% من الكلمات).
    #   • `[markdown]`/`[plaintext]`: الإطفاءُ الشامل **وحدَه**. النثرُ العربيّ لا يُبرَز
    #     بالملتبِس أصلًا (قاعدةُ سياق الكلمة تُعفيه)، لكنّ `nonBasicASCII` يُبرِز كلَّ
    #     غير-ASCII في مساحةِ عملٍ **غير موثوقة** — وهي حالُ أيّ مشروعٍ مُنزَّل — فيغرق
    #     ملفُّ README عربيٌّ كلُّه. والإعفاءُ بالاسم هناك ممنوع، انظر أدناه.
    # ‏`git-commit`/`git-rebase`: رسالةُ الالتزام تُحرَّر **داخل** المحرّر، ورسائلُ هذا
    # المشروع نفسِه عربيّةٌ مخلوطةٌ بلاتينيّ ملتصق (`macOS`، أسماءُ ملفّات) — وهو النمطُ
    # الذي يتجاوز إعفاءَ سياق الكلمة. واللغتان مشحونتان في `git-base`. (اقتراحُ مراجعةِ
    # تجربةِ المستخدم، وهو الوحيدُ من قائمتها الذي رجّحته بالاحتمال لا بالإمكان.)
    PROSE_SCOPES = ("markdown", "plaintext", "git-commit", "git-rebase")
    SCOPES = (lang_id,) + PROSE_SCOPES
    scoped_all = {sc: defaults.get(f"[{sc}]", {}) for sc in SCOPES}
    scoped = scoped_all[lang_id]
    for sc, s in scoped_all.items():
        assert s.get(KEY) is False, (
            f"لا إعفاء `{KEY}: false` داخل `[{sc}]` في mihrab-shell — فتح مجلّدٍ "
            f"غير موثوق يُبرِز 62% من محارف الملفّ كتحذير يونيكود [AR-04]")
    assert KEY not in defaults, (
        f"‏`{KEY}` مضبوط **عالميًّا** — هذا يُطفئ حماية التماثل البصريّ في كلّ لغة. "
        f"احصره في `[{lang_id}]` وأخواتها [AR-04]")
    # مجموعةٌ **مغلقة**: نطاقٌ لغويٌّ جديدٌ يحمل مفاتيحَ إبراز يونيكود يجب أن يُخفق حتّى
    # يُقرَّر عمدًا. بلا هذا كان يمرّ `"[yaml]": {nonBasicASCII: false}` أخضرَ — أي توسّعٌ
    # صامتٌ في إسقاط الحماية بلا قرارٍ ولا حيثيّة. (رصدَته مراجعةٌ هندسيّة بطفرةٍ مرّت.)
    PREFIX = "editor.unicodeHighlight."
    stray = sorted(k for k, v in defaults.items()
                   if k.startswith("[") and k not in {f"[{sc}]" for sc in SCOPES}
                   and isinstance(v, dict) and any(x.startswith(PREFIX) for x in v))
    assert not stray, (
        "نطاقاتٌ لغويّةٌ تضبط إبرازَ يونيكود خارج المجموعة المقرَّرة — كلُّ نطاقٍ إسقاطُ "
        "حمايةٍ يحتاج حيثيّة: " + " ".join(stray) + " [AR-04]")
    # حارسُ التعافي (`unicode-guard.js`) يفحص النطاقاتِ بالاسم كي يكشف ما يُظلِّلها. نطاقٌ
    # يُضاف هنا ولا يُضاف هناك يبقى بلا تشخيصٍ ولا إصلاح: يرى المستخدمُ الإطاراتِ ويقول له
    # الأمرُ «لم أجد شيئًا». فالقائمتان مصدرٌ واحدٌ يُفحَص تطابقُه.
    guard_js = os.path.join(ROOT, "extensions", "mihrab-welcome", "unicode-guard.js")
    if os.path.isfile(guard_js):
        m = re.search(r"const LANGS = \[([^\]]*)\]", _read(guard_js))
        assert m, "لا `LANGS` في unicode-guard.js — انجرف شكلُها فعمِيَ فحصُ التطابق [AR-04]"
        guard_langs = set(re.findall(r'"([^"]+)"', m.group(1)))
        assert guard_langs == set(SCOPES), (
            "نطاقاتُ القشرة ≠ نطاقاتُ حارس التعافي — نطاقٌ بلا تشخيص: "
            f"{sorted(set(SCOPES) ^ guard_langs)} [AR-04]")

    # الحماية التي نُبقيها عمدًا: لا نُطفئ الملتبِس ولا الخفيّ، لا عالميًّا ولا في نطاق.
    for keep in ("editor.unicodeHighlight.ambiguousCharacters",
                 "editor.unicodeHighlight.invisibleCharacters"):
        assert keep not in defaults, (
            f"‏`{keep}` مُعطَّل — الإعفاء بالاسم (allowedCharacters) يكفي لإسكات الضجيج، "
            f"والإطفاء يُسقِط حماية التماثل البصريّ/المحارف الخفيّة كلَّها [AR-04]")
        for sc, s in scoped_all.items():
            assert keep not in s, (
                f"‏`{keep}` مُعطَّل في `[{sc}]` — الإعفاء بالاسم يكفي، والإطفاء يُسقِط "
                f"حماية التماثل البصريّ/المحارف الخفيّة كلَّها [AR-04]")

    # ── الإعفاء بالاسم: مشتقٌّ من جدول المنبع لا مكتوبٌ بالحدس ──
    # لو أضاف المنبع نقطةَ كودٍ عربيّةً جديدةً إلى `_common` لبقيت قائمتُنا ناقصةً **بصمت**،
    # وعاد المستطيلُ الأصفر إلى حرفٍ بعينه دون أن يُخفق شيء. فنشتقّ المتوقَّع من مصدره.
    ALLOWED_KEY = "editor.unicodeHighlight.allowedCharacters"
    assert ALLOWED_KEY not in defaults, (
        f"‏`{ALLOWED_KEY}` مضبوط **عالميًّا** — يُسقِط الحماية في كلّ لغة. "
        f"احصره في `[{lang_id}]` [AR-04]")
    # الغيابُ إخفاقٌ لا تخطٍّ: لولا هذا التوكيد لمرّ حذفُ الإعفاء كلِّه أخضرَ — وهي نفسُ
    # الفجوة الصامتة التي وُجد هذا الفحص ليسدّها.
    allowed = scoped.get(ALLOWED_KEY)
    assert allowed, (
        f"لا `{ALLOWED_KEY}` داخل `[{lang_id}]` — يعود المستطيلُ الأصفر حول كلّ ألفٍ "
        f"وهاءٍ في معرّفات ص [AR-04]")
    # **والإعفاءُ بالاسم محصورٌ في ص وحدها.** `shouldHighlightNonBasicASCII` يفحص
    # `allowedCodePoints` **أوّلًا ويعود None** (unicodeTextModelHighlighter.ts:190) — أي
    # قبل الملتبِس والخفيّ معًا. فكلُّ محرفٍ نُعفيه يفقد حمايتَه كاملةً في ذلك النطاق،
    # وقائمتُنا فيها ما يشبه l و o و 0 و 1 و 5 و 7 و * و , و / و . — أدواتُ الانتحال في
    # أمرِ مهمّةٍ أو مسارِ صورة. في ص المقايضةُ مقصودةٌ ومقيسة؛ خارجَها لا مقابلَ لها.
    # (رصدَته مراجعةٌ هندسيّة بقراءة ترتيب الفحص في المنبع.)
    named = sorted(sc for sc in PROSE_SCOPES if ALLOWED_KEY in scoped_all[sc])
    assert not named, (
        f"‏`{ALLOWED_KEY}` في نطاقٍ غير `[{lang_id}]` — الإعفاءُ بالاسم يتخطّى الملتبِسَ "
        "والخفيَّ معًا، فيُسقِط الحمايةَ حيث لا ضجيجَ يبرّرها: "
        + " ".join(f"[{sc}]" for sc in named) + " [AR-04]")
    # القيمةُ تُفحَص لا المفتاح وحده: `validateBooleanMap` في المنبع تقبل `=== true` فقط
    # وتُسقِط ما عداه، فـ`"ا": false` إعفاءٌ **مُبطَل** بمفتاحٍ حاضر — أي مستطيلٌ أصفرُ عائد
    # وحارسٌ أخضر. رصدَته مراجعةٌ هندسيّة بطفرةٍ مرّت.
    falsy = sorted(c for c, v in allowed.items() if v is not True)
    assert not falsy, (
        "مفاتيحُ إعفاءٍ قيمتُها ليست `true` — يُسقِطها المنبع فيعود الإبراز: "
        + " ".join(f"U+{ord(c):04X} «{c}»" for c in falsy) + " [AR-04]")

    # الأقواسُ المزخرفة ﴾﴿ استثناءٌ **بالاسم**: هي في كتلة صور العرض (‏FD3E/FD3F) التي
    # نُبقيها مُعلَّمةً كقاعدة، لكنّ هذين يكتبهما عربيٌّ **عمدًا** لاقتباس آية، بخلاف صور
    # عرض الحروف التي لا تنتجها لوحةُ مفاتيح. فالقاعدةُ بالكتلة والاستثناءُ بالاسم.
    NAMED_EXTRA = {"﴾", "﴿"}

    # مصدرُ الاشتقاق: المنبعُ المثبَّت إن وُجد، وإلّا **لقطةُ L1** المُلتزَمة في المستودع.
    # الارتدادُ ليس ترفًا: `.upstream/` مُتجاهَلٌ في git، فبلا اللقطة يكون لُبُّ هذا الفحص
    # معطَّلًا في CI — يمرّ إعفاءٌ فارغٌ أو سيريليٌّ أخضرَ. (رصدَته مراجعةٌ هندسيّة بطفرة.)
    REL = os.path.join("src", "vs", "base", "common", "strings.ts")
    strings_ts = os.path.join(ROOT, ".upstream", "vscode", REL)
    if not os.path.isfile(strings_ts):
        strings_ts = os.path.join(os.path.dirname(HERE), "apply", "snapshot", REL)
    assert os.path.isfile(strings_ts), (
        "لا `strings.ts` — لا في المنبع المثبَّت ولا في لقطة L1. شغّل "
        "`python tests/apply/refresh_snapshot.py` والتزِم اللقطة [AR-04]")
    # المرساة على **تعريف الحقل** لا على `_common` وحدها: كتلةُ المحارف الخفيّة في الملفّ
    # نفسِه تبدأ ببادئةٍ مشابهة، فمرساةٌ فضفاضة كانت ستطابق الجدولَ الخطأ بلا إخفاق.
    src = open(strings_ts, encoding="utf-8").read()
    m = re.search(r"ambiguousCharacterData\s*=\s*new Lazy[\s\S]*?"
                  r"JSON\.parse\(\s*'(\{.*?\})'\s*\)", src)
    assert m, "تعذّر إيجاد جدول المحارف الملتبِسة في المنبع — تغيّر شكلُه؟ [AR-04]"
    common = json.loads(m.group(1).replace('\\"', '"'))["_common"]
    ambiguous_cps = {common[i] for i in range(0, len(common), 2)}
    # تحقّقٌ من أنّنا أمسكنا الجدولَ الصحيح لا جدولًا آخر بالبنية نفسها.
    assert 0x0627 in ambiguous_cps, "الجدول المُلتقَط لا يحوي الألف — مرساةٌ أمسكت غيرَه [AR-04]"

    # نطاقُ الحروف العربيّة **الثلاثة** لا الكتلة الأساسيّة وحدها: الملحق (0750–077F)
    # والموسَّع-A (08A0–08FF) حروفُ كتابةٍ عربيّةٍ حقيقيّة تُنتجها لوحاتُ مفاتيحَ إقليميّة،
    # فحصرُ الاشتقاق في 0600–06FF كان يَعِد بما لا يفي: إضافةُ المنبع لحرفٍ منهما تمرّ
    # صامتةً. (رصدَته مراجعةٌ هندسيّة بحقن U+0751 في الجدول فمرّ أخضرَ.)
    ARABIC_BLOCKS = ((0x0600, 0x06FF), (0x0750, 0x077F), (0x08A0, 0x08FF))
    expected = {chr(cp) for cp in ambiguous_cps
                if any(lo <= cp <= hi for lo, hi in ARABIC_BLOCKS)} | NAMED_EXTRA
    missing = expected - set(allowed)
    assert not missing, (
        "محارفُ عربيّةٌ ملتبِسةٌ في جدول المنبع وليست في الإعفاء ⇒ مستطيلٌ أصفر حولها: "
        + " ".join(f"U+{ord(c):04X} «{c}»" for c in sorted(missing)) + " [AR-04]")
    # الزيادةُ تُقاس على **المتوقَّع** لا على الجدول كلِّه: مقارنةٌ بالجدول كانت ستُمرِّر
    # إعفاءَ «а» السيريليّة أو صورةِ عرضٍ للألف — أي إسقاطَ حمايةٍ في اتّجاهٍ آخر.
    extra = set(allowed) - expected
    assert not extra, (
        "إعفاءٌ لمحارفَ خارج نطاق القرار (إسقاطُ حمايةٍ بلا سبب): "
        + " ".join(f"U+{ord(c):04X} «{c}»" for c in sorted(extra)) + " [AR-04]")


@check("خطّ ص العربيّ المحزوم [AR-02]: config ↔ حقن data:URI ↔ لا url() كاسر للبناء")
def _arabic_font():
    # قيم متوقَّعة (بيانات فحص تطابق مصدر الإعداد؛ استثناء literal مقبول للاختبارات).
    BUNDLED_FONT_FAMILY = "Kawkab Mono"  # الخطّ المحزوم (OFL)، أوّل المكدّس
    STAGED_FONT = ".mihrab-kawkab-mono.woff2"  # المُجهَّز في .upstream/ لاشتقاق base64
    shell = os.path.join(ROOT, "extensions", "mihrab-shell", "package.json")
    if not os.path.isfile(shell):
        return  # لا قشرة في هذا الفرع — تخطٍّ
    defaults = json.load(open(shell, encoding="utf-8")).get("contributes", {}).get("configurationDefaults", {})
    ff = defaults.get("editor.fontFamily")
    assert ff, "لا editor.fontFamily افتراضيّ في mihrab-shell [AR-02]"
    # الخطّ المحزوم أوّل المكدّس (وإلّا لا يُفضَّل عند توفّره)، والمكدّس ينتهي بـmonospace،
    # وفيه احتياطيّ عربيّ لأنظمةٍ بلا الخطّ المحزوم (وإلّا عربيّة رديئة في السقوط الرشيق).
    first = ff.split(",")[0].strip().strip("'\"")
    assert first == BUNDLED_FONT_FAMILY, \
        f"«{BUNDLED_FONT_FAMILY}» ليس أوّل مكدّس editor.fontFamily (لن يُفضَّل عند توفّره): «{first}» [AR-02]"
    assert ff.rstrip().endswith("monospace"), "مكدّس editor.fontFamily لا ينتهي بـmonospace [AR-02]"
    assert ("Segoe UI" in ff) or ("Noto Sans Arabic" in ff), \
        "مكدّس editor.fontFamily بلا احتياطيّ عربيّ (Segoe UI/Noto Sans Arabic) — عربيّة رديئة بلا الخطّ المحزوم [AR-02]"
    assert defaults.get("terminal.integrated.fontFamily") == ff, \
        "terminal.integrated.fontFamily لا يطابق editor.fontFamily (اتّساق أسطح الخطّ) [AR-02]"

    # **حارس الانحدار الحرِج:** الورقة الساكنة يجب ألّا تحوي url() نسبيًّا لـ.woff2 — esbuild
    # (optimize.ts) يحلّ url() في الـCSS المحزوم زمن البناء، و.woff2 بلا loader ⇒ يفشل البناء
    # («No loader…») وغيابُ الملفّ يفشله («Could not resolve»). الحقن الآمن data: URI فقط.
    css_body = _strip_css_comments(_read(os.path.join(ROOT, M.CSS_PATCH)))
    assert "woff2" not in css_body, \
        f"مرجع woff2 عاد إلى {M.CSS_PATCH} الساكنة — url() نسبيّ يكسر بناء esbuild؛ استعمل حقن data:URI [AR-02]"

    # وصل البناء: build.sh يجهّز المصدر (MIHRAB_ARABIC_FONT→staged)، وpatch_bundle يحقن @font-face
    # بمصدر data: URI (base64) مشتقّ من الملفّ المُجهَّز — لا loader ولا رُقعة نواة (يتركه esbuild حرفيًّا).
    build_sh = _read(os.path.join(ROOT, "build", "build.sh"))
    assert "MIHRAB_ARABIC_FONT" in build_sh and STAGED_FONT in build_sh, \
        f"build.sh لا يجهّز الخطّ العربيّ المحزوم (MIHRAB_ARABIC_FONT/{STAGED_FONT}) [AR-02]"
    bundle_py = _read(os.path.join(ROOT, "build", "patch_bundle_extensions.py"))
    assert STAGED_FONT in bundle_py, \
        f"patch_bundle_extensions لا يشتقّ الخطّ من الملفّ المُجهَّز ({STAGED_FONT}) [AR-02]"
    for needle in ("@font-face", BUNDLED_FONT_FAMILY, "data:font/woff2", "base64"):
        assert needle in bundle_py, \
            f"patch_bundle_extensions لا يحقن @font-face بـdata:URI base64 (ينقص «{needle}») — قد يعود url() الكاسر [AR-02]"

    # [AR-01↔AR-02] لوحة المخرجات (webview معزول) تُضمِّن الخطّ المحزوم data:URI من media/ لتعرض
    # به عينه لا بخطّ نظاميّ: build.sh ينسخه إلى welcome/media، وoutput-panel.js يقرؤه ويبنيه.
    welcome = os.path.join(ROOT, "extensions", "mihrab-welcome")
    if os.path.isdir(welcome):
        # نفحص أمر cp **الفعليّ** لا مجرّد ظهور «media/kawkab-mono.woff2» نصًّا (يظهر في سطر
        # log أيضًا) كي لا يمرّ الحارس أخضر لو حُذف النسخ وبقي التسجيل — نجاح كاذب (أسوة بحرّاس
        # أصول الهوية التي تجرّد غير-الكود وتفحص سطر cp حقيقيًّا).
        bsh_code = [ln for ln in build_sh.splitlines() if not ln.lstrip().startswith("#")]
        assert 'WELCOME_MEDIA="$STAGE_EXT/mihrab-welcome/media"' in "\n".join(bsh_code), \
            "build.sh لا يعرّف WELCOME_MEDIA لمجلّد media لوحة الترحيب [AR-01↔AR-02]"
        assert any("cp -f" in ln and "WELCOME_MEDIA/kawkab-mono.woff2" in ln for ln in bsh_code), \
            "build.sh لا ينسخ الخطّ فعلًا إلى media/ لوحة الترحيب (سطر cp لا سطر log) [AR-01↔AR-02]"
        panel_js = _read(os.path.join(welcome, "output-panel.js"))
        assert "loadBundledFontDataUri" in panel_js and "data:font/woff2" in panel_js, \
            "output-panel.js لا يُضمِّن الخطّ المحزوم كـdata:URI في اللوحة [AR-01↔AR-02]"
        # الخطّ ثنائيّ يُحقَن وقت البناء (كـbin/) ويُقرأ من extensionPath/media؛ يجب تجاهله في git
        # كي لا يُودَع لو أسقطه مطوّر في media/ (المتعقَّب لوسائط الجولة) للتجربة المحلّيّة.
        gitignore = _read(os.path.join(ROOT, ".gitignore"))
        assert "extensions/mihrab-welcome/media/kawkab-mono.woff2" in gitignore, \
            ".gitignore لا يتجاهل خطّ media المحقون (extensions/mihrab-welcome/media/kawkab-mono.woff2) — خطر إيداعه [AR-01↔AR-02]"


# ───────────── L0-8: سمتا محراب (خريطة الرموز ↔ نحو ص) ─────────────
def _grammar_scopes():
    """كلّ نطاقات (scopes) نحو ص الفعليّة من sad.tmLanguage.json."""
    g = os.path.join(ROOT, "extensions", "sad-lang", "syntaxes", "sad.tmLanguage.json")
    if not os.path.isfile(g):
        return None
    data = json.load(open(g, encoding="utf-8"))
    found = set()

    def walk(o):
        if isinstance(o, dict):
            n = o.get("name")
            if isinstance(n, str) and "." in n:
                found.add(n)
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(data)
    return found


@check("سمتا محراب: JSON صالح، مُسهَمتان وافتراضيّة، ونطاقاتها تطابق نحو ص")
def _themes():
    ext = os.path.join(ROOT, "extensions", "mihrab-themes")
    if not os.path.isdir(ext):
        return  # لا إضافة سمات في هذا الفرع — تخطٍّ
    pkg = json.load(open(os.path.join(ext, "package.json"), encoding="utf-8"))
    contrib = pkg.get("contributes", {})
    themes = contrib.get("themes", [])
    assert len(themes) >= 2, f"متوقّع سمتان (داكنة/فاتحة)، وُجد {len(themes)}"
    # الافتراضيّة يجب أن تساوي أحد الـlabels فعلًا (خطأ مطبعيّ ⇒ VS Code يسقط للأساس صامتًا).
    default = contrib.get("configurationDefaults", {}).get("workbench.colorTheme")
    labels = {t.get("label") for t in themes}
    assert default in labels, f"السمة الافتراضيّة «{default}» ليست من labels السمات {labels}"
    # ── السمات المفضَّلة لكلّ وضع نظام — **الوصلة التي بدونها تصير سمتا التباين العالي حبرًا
    # على ورق.** ‏`window.autoDetectHighContrast` مفعَّل افتراضًا؛ فحين يكون نظام التشغيل في
    # وضع التباين العالي، يبدّل VS Code إلى `workbench.preferredHighContrastColorTheme`
    # لا إلى `workbench.colorTheme`. وافتراض ذلك المفتاح هو ثابت المنبع
    # ‏`ThemeSettingDefaults.COLOR_THEME_HC_DARK = 'Default High Contrast'`. أي أنّ **أحوج
    # المستخدمين إلى تصميم مقصود كان يُنقَل تلقائيًّا خارج سمات محراب** — وهو عين الفجوة
    # التي بُنيت سمتا hcDark/hcLight لسدّها. والأمر نفسه لـautoDetectColorScheme (داكن/فاتح).
    # كلّ قيمة تُطابَق بالـlabel: خطأ مطبعيّ ⇒ VS Code يسقط للأساس **صامتًا** بلا خطأ.
    UI_THEME_OF = {"vs-dark": "workbench.preferredDarkColorTheme",
                   "vs": "workbench.preferredLightColorTheme",
                   "hc-black": "workbench.preferredHighContrastColorTheme",
                   "hc-light": "workbench.preferredHighContrastLightColorTheme"}
    defaults = contrib.get("configurationDefaults", {})
    for t in themes:
        key = UI_THEME_OF.get(t.get("uiTheme"))
        if not key:
            continue
        assert defaults.get(key) == t["label"], (
            f"‏`{key}` = «{defaults.get(key)}» لا «{t['label']}» — عند تبديل النظام إلى هذا "
            f"الوضع يخرج المستخدم من سمات محراب إلى سمة المنبع العامّة")
    gscopes = _grammar_scopes()  # نحو ص الفعليّ
    grammar_sad = {s for s in gscopes if s.endswith(".sad")} if gscopes is not None else set()
    # نطاقات نحو لا تُلوَّن عمدًا (حاويات بنيويّة نلوّن محتواها لا هي): تُعفى من التغطية العكسيّة.
    uncolored = {"meta.interpolation.sad"}
    for t in themes:
        assert t.get("label") and t.get("uiTheme") and t.get("path"), f"عقد سمة ناقص: {t}"
        tp = os.path.join(ext, *t["path"].lstrip("./").split("/"))
        assert os.path.isfile(tp), f"ملفّ سمة مفقود: {t['path']}"
        td = json.load(open(tp, encoding="utf-8"))
        assert td.get("name"), f"سمة بلا name: {t['path']}"
        # أنواع سمات VS Code الأربعة (dark/light + نظيراهما عاليا التباين).
        assert td.get("type") in ("dark", "light", "hcDark", "hcLight"),             f"type غير صالح في {t['path']}"
        assert td.get("colors") and td.get("tokenColors"), f"بلا colors/tokenColors: {t['path']}"
        # نطاقات ص في **هذه السمة** (التغطية تُفحَص لكلّ سمة، لا اتّحادهما).
        this_scopes = set()
        for rule in td["tokenColors"]:
            sc = rule.get("scope", [])
            for s in ([sc] if isinstance(sc, str) else sc):
                if s.endswith(".sad"):
                    this_scopes.add(s)
        # (أمام) كلّ نطاق ص في السمة موجود في النحو الفعليّ (لا اختراع/انجراف):
        if gscopes is not None:
            invented = this_scopes - grammar_sad
            assert not invented, (
                f"نطاقات في {t['path']} غير موجودة في نحو ص (مخترَعة/منجرفة): {sorted(invented)}")
            # (خلف) كلّ نطاق نحو ص مُلوَّن في هذه السمة (أو مُعفى) — يمسك نطاقًا جديدًا بلا لون:
            missing = grammar_sad - this_scopes - uncolored
            assert not missing, (
                f"نطاقات نحو ص بلا لون في {t['path']} (سترث افتراضيًّا متنافرًا): {sorted(missing)} "
                f"— أضِف لونًا في gen_themes.py أو أعفِها صراحةً")


@check("طباعة القشرة العربيّة [AR-03]: مكدّس :lang(ar) للمنصّات الثلاث + وحدة الوجه الأحاديّ")
def _arabic_chrome_typography():
    """يحرس القاعدة 20 في mihrab-rtl.css — سدُّ ثغرة `:lang(ar)` الغائبة عن المنبع.

    المنبع (style.css:12-29) يخصّص `--monaco-font` لـzh/ja/ko × (mac/windows/linux) ولا يخصّصه
    للعربيّة. أخطر أثر على **لينكس**: مكدّسه `Ubuntu`/`Droid Sans` بلا محارف عربيّة ⇒ الاختيار
    يؤول إلى fontconfig (غير حتميّ). هذا الفحص يمنع سقوط القاعدة أو نقصان منصّة منها.
    """
    BUNDLED_FONT_FAMILY = "Kawkab Mono"  # يطابق [AR-02] — الوجه المحزوم نفسه
    # المنصّات الثلاث التي يعرّف لها المنبع مكدّسًا؛ نقص أيٍّ منها = منصّة بلا عربيّة حتميّة.
    PLATFORMS = ("windows", "mac", "linux")
    # الوجه العربيّ الصريح المتوقَّع لكلّ منصّة (السند الذي يجعل الناتج حتميًّا لا ضمنيًّا).
    ARABIC_FACE = {"windows": "Tahoma", "mac": "SF Arabic", "linux": "Noto Sans Arabic"}
    css = _strip_css_comments(_read(os.path.join(ROOT, M.CSS_PATCH)))

    for plat in PLATFORMS:
        sel = f'.monaco-workbench[dir="rtl"].{plat}:lang(ar)'
        assert sel in css, (
            f"لا قاعدة `{sel}` في {M.CSS_PATCH} — منصّة {plat} تسقط لمكدّس المنبع "
            f"اللاتينيّ بلا عربيّة معلَنة [AR-03]")
        # جسم كلّ قاعدة تخصّ هذه المنصّة (قاعدتان: المتناسب والأحاديّ).
        bodies = [css[css.index(sel, p) + len(sel):][:css[css.index(sel, p) + len(sel):].index("}")]
                  for p in _all_positions(css, sel)]
        prop = "".join(bodies)
        assert "--monaco-font:" in prop, f"قاعدة {plat}:lang(ar) بلا `--monaco-font` [AR-03]"
        assert "--monaco-monospace-font:" in prop, \
            (f"قاعدة {plat}:lang(ar) بلا `--monaco-monospace-font` — شيفرة ص العربيّة داخل "
             f"القشرة (تلميحات/اختصارات/فتات) ستُعرَض بوجه مغاير للمحرّر [AR-03]")
        assert ARABIC_FACE[plat] in prop, (
            f"مكدّس {plat}:lang(ar) بلا الوجه العربيّ الصريح «{ARABIC_FACE[plat]}» — "
            f"التغطية تعود ضمنيّة/غير حتميّة [AR-03]")

    # وحدة الوجه: الأحاديّ في القشرة يبدأ بالخطّ المحزوم نفسه الذي يبدأ به editor.fontFamily
    # (‏[AR-02]) — وإلّا اختلف وجه المعرّف العربيّ بين المحرّر والتلميح.
    for m in _all_positions(css, "--monaco-monospace-font:"):
        stack = css[m + len("--monaco-monospace-font:"):]
        stack = stack[:stack.index(";")]
        first = stack.split(",")[0].strip().strip("'\"")
        assert first == BUNDLED_FONT_FAMILY, (
            f"«{BUNDLED_FONT_FAMILY}» ليس أوّل مكدّس --monaco-monospace-font (وُجد «{first}») — "
            f"وجه الشيفرة في القشرة يخالف المحرّر [AR-03]")
        assert stack.rstrip().endswith("monospace"), \
            "مكدّس --monaco-monospace-font لا ينتهي بـmonospace [AR-03]"


@check("حشوات تسمية الأيقونة [القاعدة 23]: شارة التزيين والأيقونة والوصف + استثناء التبويب")
def _icon_label_margins():
    """يحرس القاعدة 23 — قيمٌ فيزيائيّة في أكثر ودجةٍ حضورًا في المحرّر.

    ‏`monaco-icon-label` تحمل أسماء الملفّات في المستكشف والتبويبات والفتات والبحث وGit
    ولوحة الأوامر. وثلاث قيمٍ فيها فيزيائيّة تنقلب دلالتها مع القشرة — **رُصدت أوّلًا في
    لقطة البناء المشحون**: شارة «‎+9‎» ملتصقة بالاسم («‎+9rtl_fixture.ص‎»)، ثمّ أُكِّدت من
    ‏`iconlabel.css:105`: `margin: auto 16px 0 5px` ⇒ في RTL ‎16px‎ تفصل الشارة عن الاسم
    و‎5px‎ عن الحافّة، أي عكس المقصود تمامًا.

    **والاستثناء جزءٌ من الحارس لا زينة:** المنبع يُصفِّر `margin-right` في التبويبات/الفتات
    بأولويّة ‎(0,6,1)‎، وهي تغلب قاعدتنا العامّة ‎(0,3,1)‎ وتُلغي فجوة الاسم في RTL. قِسنا
    ذلك حيًّا بعد تطبيق الإصلاح الأوّل (`0 0 0 5px` ⇒ `0 0 0 16px` — ما زالت ملتصقة)، فلزم
    استثناءٌ صريح. سقوطُه يُعيد العطب في التبويبات وحدها بينما يبدو المستكشف سليمًا.
    """
    css = _strip_css_comments(_read(os.path.join(ROOT, M.CSS_PATCH)))
    RTL = '.monaco-workbench[dir="rtl"]'
    assert f"{RTL} .monaco-icon-label::after" in css, \
        "شارة تزيين تسمية الأيقونة بلا عكس في RTL — تلتصق بالحافّة وتنفصل عن الاسم [القاعدة 23]"
    assert "margin-inline: 5px 16px" in css, (
        "قيمتا شارة التزيين ليستا معكوستين (متوقَّع `margin-inline: 5px 16px` — الداخليّة "
        "أوّلًا) [القاعدة 23]")
    assert f"{RTL} .monaco-icon-label-iconpath" in css, \
        "فجوة أيقونة التسمية (`margin-right: 6px`) بلا عكس في RTL [القاعدة 23]"
    assert ".label-description" in css and "margin-inline-start: 0.5em" in css, \
        "فجوة الوصف الخافت (`margin-left: 0.5em`) بلا عكس في RTL [القاعدة 23]"
    # الاستثناء: يجب أن تُصفَّر الجهة **اليسرى** في التبويبات/الفتات وتُعاد اليمنى.
    assert f"{RTL} .part.editor > .content .editor-group-container > .title.tabs .monaco-icon-label::after" in css, (
        "لا استثناء للتبويبات — تصفيرُ المنبع لـ`margin-right` بأولويّة أعلى يُلغي فجوة "
        "الشارة عن الاسم في RTL (مقيس) [القاعدة 23]")


@check("الرموز الاتّجاهيّة [القاعدة 22]: مثلّث الشجرة + أدلّتها + الأسهم المعكوسة — بلا قلبٍ جملة")
def _directional_glyphs():
    """يحرس القاعدة 22 — الأسهم التي لا يمسّها `dir=rtl` لأنّها مرسومة بـ`transform`.

    كلّ بند هنا **مقيس بـCDP حيًّا** قبل كتابته (لا مستنتَج من قراءة المصدر):
      • مثلّث الشجرة: قِسنا صندوق الرمز ‎[1133‥1149]‎ في العمقين ٠ و١ ⇒ لا يتدرّج مع العمق
        (‏`paddingLeft` فيزيائيّة والحافّة اليمنى مثبَّتة). و`scaleX(-1)` على الحاوية يُصلح
        التدرّج **واتّجاه الرمز معًا**؛ قِسنا بعده ‎[1125‥1141]‎ ثمّ ‎[1117‥1133]‎ (خطوة ‎8px‎).
      • أدلّة التشجير: كانت عند ‎x=868‎ بينما صفوف الشجرة عند ‎1155‎ — الحافّة المقابلة.
      • الأسهم: `view-pane-container-collapsed` قِسناه `none` ⇒ صار `matrix(-1,0,0,1,0,0)`.

    ويمنع الفحص **القلب الجملة**: `.codicon-chevron-right` صنفٌ عامّ يخدم استعمالات غير
    اتّجاهيّة، فقلبه يكسر ما لم يكن مكسورًا.
    """
    css = _strip_css_comments(_read(os.path.join(ROOT, M.CSS_PATCH)))
    RTL = '.monaco-workbench[dir="rtl"]'
    # (أ) المثلّث: قلبٌ على الحاوية لا دورانٌ على ::before — الأوّل يُصلح التدرّج أيضًا.
    tw = f"{RTL} .monaco-tl-twistie"
    assert tw in css, "لا قاعدة لمثلّث الشجرة في RTL [القاعدة 22]"
    body = css[css.index(tw) + len(tw):]
    body = body[:body.index("}")]
    assert "scaleX(-1)" in body, (
        "قلب مثلّث الشجرة `scaleX(-1)` غائب — الرمز يشير عكس اتّجاه التوسّع **ولا يتدرّج مع "
        "العمق** (حشوة `paddingLeft` فيزيائيّة تُثبِّت الرمز) [القاعدة 22]")
    assert "translateX(-3px)" in body, (
        "إزاحة المنبع `translateX(3px)` لم تُعكَس إلى `-3px` — قلبُ الحاوية بلا عكس الإزاحة "
        "يزحزح الرمز ‎6px‎ عن محلّه [القاعدة 22]")
    # (ب) أدلّة التشجير: إرساءٌ مقلوب + حدٌّ على الحافّة المقابلة.
    ind = f"{RTL} .monaco-tl-indent"
    assert ind in css, "لا إعادة إرساء لأدلّة التشجير في RTL [القاعدة 22]"
    ind_body = css[css.index(ind) + len(ind):]
    ind_body = ind_body[:ind_body.index("}")]
    assert "left: auto" in ind_body and "right:" in ind_body, (
        "أدلّة التشجير ما زالت مرساةً بـ`left` — تُرسَم على الحافّة المقابلة للشجرة "
        "(قِسنا فارق ‎≈230px‎) [القاعدة 22]")
    assert "border-right:" in css, \
        "حدّ دليل التشجير لم يُنقَل إلى الحافّة المقابلة (border-right) [القاعدة 22]"
    # (ج) الأسهم المخصَّصة للاتّجاه — أصنافٌ سجّلها المنبع لهذا الغرض وحده.
    for icon in ("codicon-breadcrumb-separator", "codicon-view-pane-container-collapsed",
                 "codicon-search-hide-replace", "codicon-suggest-more-info"):
        assert f"{RTL} .{icon}::before" in css, \
            f"السهم الاتّجاهيّ `{icon}` غير معكوس في RTL [القاعدة 22]"
    # زرّ «رجوع» في الجولة: صنفه (`chevron-left`) عامٌّ فيُحصَر بحاويته. كان **آخر سهمٍ بلا
    # عكس في القشرة المشحونة** — أثبته مسحٌ حيّ لكلّ `codicon-chevron/arrow/triangle` الظاهرة
    # (‏3 نتائج: سهما مركز الأوامر معكوسان بالقاعدة 8، وهذا `transform: none`).
    assert f"{RTL} .gettingStartedContainer .prev-button > .codicon-chevron-left::before" in css, \
        "سهم «رجوع» في الجولة غير معكوس — يشير عكس جهة السابق في RTL [القاعدة 22]"
    # (د) لا قلب جملة: الصنف العامّ يخدم استعمالات غير اتّجاهيّة.
    assert ".codicon-chevron-right" not in css, (
        "قلبٌ جملة لـ`.codicon-chevron-right` — الصنف عامّ (زخارف «مزيد»، مؤشّرات فتح) "
        "فقلبه يكسر ما لم يكن مكسورًا؛ اقصِر القلب على الأصناف المخصَّصة [القاعدة 22]")


@check("اتّجاه التسميات المحايدة [القاعدة 21]: تغطية الأهداف المرصودة + حصر أزرار الأيقونة")
def _bidi_neutrals():
    """يحرس القاعدة 21 — و**انحدارًا رصدناه حيًّا مرّة فلا يعود**.

    الخلاصة المُكلِفة: `unicode-bidi: plaintext` على `.button-link` نفسه (لا على ورقة نصّه)
    يجعل فقرة الزرّ كلَّها LTR فتنقلب الأيقونة من الحافّة القائدة إلى التابعة — أصلحنا النصّ
    وكسرنا التخطيط. فالقاعدة هنا شرطيّة لا مجرّد وجود:

      • الزرّ **ذو الأيقونة** يُستهدَف عبر ابنه النصّيّ فقط: `.button-link > span`.
      • الزرّ **بلا أيقونة** (نصُّه عقدةُ نصّ مباشرة، كـ«‎More...‎») يُستهدَف مباشرةً، لكن
        **مشروطًا بـ`:not(:has(.codicon))`** — فيسقط ذاتيًّا إن اكتسب أيقونة لاحقًا.

    ويمنع الفحص استهداف `.button-link` عاريًا (بلا `>` ولا `:not(`) — وهو الشكل المكسور نفسه.
    """
    css = _strip_css_comments(_read(os.path.join(ROOT, M.CSS_PATCH)))
    # الأهداف التي رُصد عطبها بالقياس الحيّ — سقوط أيٍّ منها انحدارٌ مُثبَت لا احتمال.
    REQUIRED = (
        ".monaco-icon-label .label-name",          # أسماء الملفّات (وتبويبات المحرّر: tab-label
                                                   #  صنفٌ إضافيّ على ResourceLabel ⇒ يرثها)
        ".monaco-icon-label .label-description",   # المسار بجانب الاسم
        ".gettingStartedContainer .button-link > span",
        ".gettingStartedContainer .button-link:not(:has(.codicon))",
        ".part.statusbar .statusbar-item-label",    # اسم فرع Git واللواحق المحايدة
        ".activitybar .badge-content",             # شارة العدد «3K+» — رصدها المسح الشامل
        ".gettingStartedContainer .path.detail",   # مسارات «المفتوحة مؤخّرًا»
    )
    # جسم القاعدة الحاوية لـplaintext (نتحقّق أنّ الأهداف داخلها لا في مكان آخر من الورقة).
    idx = css.find("unicode-bidi: plaintext")
    assert idx >= 0, f"لا `unicode-bidi: plaintext` في {M.CSS_PATCH} — القاعدة 21 سقطت"
    for sel in REQUIRED:
        assert sel in css, (
            f"القاعدة 21 بلا الهدف «{sel}» — نصٌّ رُصد عطبه حيًّا يعود لوراثة اتّجاه الفقرة "
            f"RTL فتقفز محايداته الطرفيّة")

    # حصر أزرار الأيقونة: أيّ `.button-link` يتلقّى plaintext يجب أن يكون إمّا ورقةَ نصّ
    # (`> span`) وإمّا مشروطًا بغياب الأيقونة. الشكل العاري = الانحدار المرصود.
    for m in _all_positions(css, ".button-link"):
        tail = css[m + len(".button-link"):]
        nxt = tail[:2].strip()
        assert nxt.startswith(">") or nxt.startswith(":"), (
            "‏`.button-link` مستهدَف عاريًا في القاعدة 21 — هذا يقلب الأيقونة من الحافّة "
            "القائدة إلى التابعة (انحدار مرصود بلقطة). استعمل `> span` أو "
            "`:not(:has(.codicon))`")


@check("محايدات bidi في اللوحات والقوائم [24+25]: تغطية الأسطح + نطاق حقل الاقتراح")
def _bidi_panels():
    """يحرس القاعدة 24 — أسطحُ اللوحات التي لم تكن مقيسةً حين كُتبت القاعدة 21.

    مسحٌ عامّ حيّ (‏`bidiPanels` في الحزام) أعاد خمسة أسطح، وكلّ هدفٍ هنا مقيسٌ لا مُفترَض:
    اسمُ الامتداد `‎.ipynb Support‎` كان يُعرَض `‎ipynb Support.‎`؛ ووصفُه اللاتينيّ كان
    يُقَصّ من **بدايته**؛ ورسالةُ البحث كانت `‎results in 194 files … 9838‎` والعدد في آخرها.

    وفحصٌ ثانٍ يحرس **نطاق** حقل الاقتراح: `plaintext` على `.view-line` نفسها لا يغلب
    سمة `dir="rtl"` التي يبصمها Monaco (‏`viewLine.ts:181`) — قِسناه: تُحسَب ولا تفعل شيئًا.
    فالهدف الصحيح هو `<span>` الداخليّة. واستهدافُ `.view-line` عاريًا خطأٌ مزدوج: قاعدةٌ
    ميّتة، **و**اتّساعٌ يبتلع محرّر الشيفرة الرئيس (شأنُ `patch_editor_rtl.py`).
    """
    css = _strip_css_comments(_read(os.path.join(ROOT, M.CSS_PATCH)))
    REQUIRED = (
        ".extension-list-item .name",                    # «.ipynb Support» ⇒ «ipynb Support.»
        ".extension-list-item .description",             # قُصَّ من بدايته لا نهايته
        ".suggest-input-container .view-line > span",    # «@builtin» ⇒ «builtin@»
        ".markers-panel .marker-message",                # «error [SYN001]: <source>:19:1»
        ".markers-panel .marker-line",                   # «[Ln 1, Col 1]»
        ".search-view .monaco-list-row a.match",         # سطر المطابقة المقتطَع من الطرفين
        ".search-view .messages .message",               # «329 results…» والعدد يقفز للآخر
        ".pane-header > .title",                         # عناوين الأجزاء مختلطة اللغة
        ".monaco-count-badge",                           # «83 Results» والعدد يقفز للآخر
        ".settings-editor .setting-item-category",       # «Editor:» والنقطتان تقفزان
        ".settings-editor .setting-item-description",    # وصفٌ لاتينيّ يُقَصّ من بدايته
        ".keybindings-editor .when-label",               # تعبير when: && و== وفواصل عليا
        ".keybindings-editor .when-label *",             # النصّ في ابنٍ يعزل بنفسه (مقيس)
        ".keybindings-editor .command-label",            # «Auto Fix...»
        ".pane-body .message-container > .message",      # «No extensions found.»
        # القاعدة 25 — قوائم السياق. أربعةُ بنودٍ من ثلاثة عشر انقلبت وتسعةٌ لم تتحرّك:
        # النقاطُ الثلاث في ذيل نصٍّ لاتينيّ تقفز إلى مقدّمته «‎New File...‎» ⇒ «‎...New File‎».
        ".monaco-menu .action-label",
        ".monaco-menu .action-label *",                  # النصّ في ابنٍ يعزل بنفسه
        ".monaco-menu .keybinding",                      # «Shift+Alt+R» في الصفّ نفسه
        # القاعدة 26 — الإشعارات (المركز والفقاعات معًا). شاهدٌ موجب مقيس: ذيلُ
        # «‎ESLint: unable to resolve configuration...‎» عند ‎198‎ ورأسُه عند ‎207‎ ⇒ النقاط
        # تسبق الرأس بصريًّا؛ وبعد الإصلاح ‎315‎ مقابل ‎95‎ ⇒ تتبعه.
        ".notification-list-item-message",
        ".notification-list-item-message *",             # الرسالة تُصيَّر Markdown في span
        ".notification-list-item-source",                # اسم الامتداد — لاتينيٌّ في صفٍّ عربيّ
        # القاعدة 27 — تلميح التبويب. مقيس: رأسُ المسار ‎C‎ عند ‎732‎ وذيلُه عند ‎685‎ ⇒
        # المسار **مقلوبٌ كلَّه**؛ وبعد الإصلاح ‎522‎ مقابل ‎1007‎.
        ".monaco-hover .hover-contents",
        ".monaco-hover .hover-contents *",
        # القاعدة 28 — رسالة الحالة الفارغة. مقيس: رأسُ الجملة عند 800 والنقطةُ عند 797
        # ⇒ النقطة في مقدّمة الجملة بصريًّا؛ وبعد الإصلاح 320 مقابل 612.
        ".message-box-container",
        ".message-box-container *",
        # القاعدة 29 — شريط العنوان: تسميةٌ محتواها اسمُ مساحة عمل أو **عنوانُ النافذة
        # كاملًا** أو **اسمُ الملفّ** (‏commandCenterControl.ts:216-234). قِسنا
        # ‏`rtl_fixture.ص`: بلا القاعدة ينفصل الامتدادُ العربيّ ويقفز قبل الجذع (899 مقابل 918).
        ".search-label",
        ".window-title",
        # القاعدة 30 — العطبُ المعاكس: نصٌّ **عربيّ** في حاوية **LTR** (ودجات المحرّر).
        # «‏3 من 146» تُقرأ «‏3 146 من» لأنّ الرقم بعد حرفٍ عربيّ يصير `AN` فيلتحق بمقطعه.
        ".find-widget .matchesCount",
        # القاعدة 31 — بقيّةُ ودجات الحاوية LTR، وقد فُتحت أخيرًا بمحفّزاتٍ مقيسة
        # (`Ctrl+.` و`F8`). عنوانُ إجراء الكود تنقلب جملتُه كاملةً فتُرمى التسميةُ
        # العربيّة إلى أقصى اليسار؛ وترويسةُ النظرة «‏1 مشكلة من 10» قاعدةُ W2 نفسها؛
        # ومتنُ المُشخِّص عليه `isolate` من المنبع — تعزل ولا تشتقّ اتّجاهًا.
        ".action-widget .monaco-list-row .title",
        ".zone-widget .peekview-title .dirname",
        ".zone-widget .descriptioncontainer .message div",
    )
    assert "unicode-bidi: plaintext" in css, (
        f"لا `unicode-bidi: plaintext` في {M.CSS_PATCH} — القاعدة 24 سقطت")
    # ⚠️ **الاحتواءُ النصّيُّ وحده حارسٌ كاذب.** كشفه اختبارُ نفيٍ للقاعدة 29: غيّرنا
    # ‏`.search-label` إلى `.search-labelXX` — وهو **صنفٌ غير موجود إطلاقًا** فالقاعدة
    # ميّتة — ومع ذلك أعاد الفحص ‎30/30‎، لأنّ الاسم المكسور يحوي الاسمَ الصحيح جزءًا منه.
    # نشترط أن يلي المُحدِّدَ **فاصلُ مُحدِّدات** (فاصلة أو مسافة أو `{`) لا حرفَ اسم.
    for sel in REQUIRED:
        ok = any(css[p + len(sel):p + len(sel) + 1] in (",", " ", "{", "\n", "\t", ":", ">")
                 for p in _all_positions(css, sel))
        assert ok, (
            f"القاعدة 24 بلا الهدف «{sel}» — سطحٌ رُصد عطبه حيًّا يعود لوراثة اتّجاه "
            f"الفقرة RTL فتقفز محايداته أو يُقَصّ نصُّه من الطرف الخطأ")

    # حصر النطاق: كلّ `.view-line` في الورقة يجب أن يكون داخل حقل الاقتراح **وبـ`> span`**.
    for m in _all_positions(css, ".view-line"):
        # **حدُّ النظر إلى الوراء هو المُحدِّد نفسه لا نافذةٌ بعدد أحرف.** كتبناه أوّلًا
        # بنافذة ‎90‎ حرفًا فسقط الفحص في اختبار النفي: مُحدِّدٌ عارٍ مضافٌ **بعد** الصحيح
        # يرى `.suggest-input-container` في **سطر جاره** فيمرّ. المُحدِّد يبدأ بعد آخر
        # فاصلة/قوس/سطر — فهذا هو المدى الصحيح.
        head = css[max((css.rfind(c, 0, m) for c in ",{}\n"), default=-1) + 1:m]
        tail = css[m + len(".view-line"):m + len(".view-line") + 8].strip()
        assert ".suggest-input-container" in head, (
            "‏`.view-line` مستهدَف خارج `.suggest-input-container` — هذا يبتلع محرّر "
            "الشيفرة الرئيس، واتّجاه أسطره شأنُ patch_editor_rtl.py [القاعدة 24]")
        assert tail.startswith(">"), (
            "‏`.view-line` مستهدَف عاريًا — عليها سمة `dir=\"rtl\"` من Monaco فلا تفعل "
            "`plaintext` شيئًا (مقيس). الهدف هو `> span` الداخليّة [القاعدة 24]")


def _all_positions(hay, needle):
    """كلّ مواضع `needle` في `hay` (لا أوّلها فقط) — القاعدة مكرّرة لكلّ منصّة."""
    out, i = [], hay.find(needle)
    while i != -1:
        out.append(i)
        i = hay.find(needle, i + 1)
    return out


# ───────── L0-8ب: تباين السمتين وتمايز لوحتهما (أرقام لا ذوق) ─────────
# عتبتان تحرسان قرارَي تصميمٍ سبق أن انكسرا صامتين، فصارا مُلزَمَين عدديًّا:
#   AA_MIN  — WCAG 2.1 معيار 1.4.3 لنصّ عاديّ صغير (كود المحرّر كلّه كذلك).
#   DE_MIN  — أدنى فارق ΔE76 مقبول بين فئتين دلاليّتين. اللوحة السابقة جعلت «مفتاح» و«رقم»
#             على بُعد 9.4 فقط (ذهبان متطابقان عمليًّا) و«نصّ» و«دالّة» على بُعد 11.6؛ عتبة 25
#             هي أدنى فارق يبقى مُدرَكًا على شاشة مكتبيّة مع تفاوت المعايرة.
AA_MIN = 4.5
DE_MIN = 25.0
# سمتا التباين العالي تُلزَمان بعتبة **AAA (‏1.4.6)** لا AA: من يختارهما يختارهما لحاجة بصريّة،
# فالوفاء بالحدّ الأدنى العامّ فيهما يُفرِغهما من معناهما. تُشتقّ العتبة من `type` في ملفّ السمة.
AAA_MIN = 7.0
HC_TYPES = ("hcDark", "hcLight")
# الفئات الدلاليّة الخمس التي يجب أن تتمايز. الرماديّات (تعليق/عامل/متغيّر) مستثناة عمدًا:
# هدوؤها مقصود، وتمايزها بالوظيفة والمَيْل (italic) لا باللون.
SEMANTIC_KINDS = ("keyword", "type", "function", "string", "number")


def _srgb_to_lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _parse_hex(h):
    """‏#RRGGBB → (r,g,b) بايتات. يرفض ما عداه (الشفافيّة #RRGGBBAA غير مدعومة هنا)."""
    h = h.lstrip("#")
    assert len(h) == 6, f"لون غير سداسيّ صريح: #{h}"
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _luminance(h):
    r, g, b = (_srgb_to_lin(c) for c in _parse_hex(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contrast(fg, bg):
    a, b = sorted((_luminance(fg), _luminance(bg)), reverse=True)
    return (a + 0.05) / (b + 0.05)


def _lab(h):
    r, g, b = (_srgb_to_lin(c) for c in _parse_hex(h))
    # sRGB → XYZ (D65) → CIELAB، بمرجع أبيض D65.
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
    y = 0.2126 * r + 0.7152 * g + 0.0722 * b
    z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883

    def f(t):
        return t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    fx, fy, fz = f(x), f(y), f(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def colors_of(td):
    return td.get("colors", {})


def _delta_e(c1, c2):
    """ΔE76 (إقليديّ في CIELAB) — كافٍ لحارس «هل اللونان متمايزان؟»؛ لا نحتاج دقّة CIEDE2000."""
    return sum((a - b) ** 2 for a, b in zip(_lab(c1), _lab(c2))) ** 0.5


@check("سمتا محراب: تباين AA لكلّ رمز + تمايز اللوحة (ΔE) + اشتقاق القشرة من اللوحة")
def _theme_contrast():
    ext = os.path.join(ROOT, "extensions", "mihrab-themes")
    if not os.path.isdir(ext):
        return  # لا إضافة سمات في هذا الفرع — تخطٍّ
    pkg = json.load(open(os.path.join(ext, "package.json"), encoding="utf-8"))
    for t in pkg.get("contributes", {}).get("themes", []):
        tp = os.path.join(ext, *t["path"].lstrip("./").split("/"))
        td = json.load(open(tp, encoding="utf-8"))
        label = td.get("name", t["path"])
        bg = td["colors"]["editor.background"]
        # العتبة تتبع نوع السمة: AAA لعاليتَي التباين، AA لغيرهما.
        is_hc = td.get("type") in HC_TYPES
        thr, thr_name = (AAA_MIN, "WCAG AAA") if is_hc else (AA_MIN, "WCAG AA")

        # (1) تباين — كلّ لون رمزٍ نحويّ ودلاليّ على خلفيّة محرّره الفعليّة.
        def _assert_aa(color, what, thr=thr, thr_name=thr_name):
            ratio = _contrast(color, bg)
            assert ratio >= thr, (
                f"[{label}] {what} = {color} على {bg} تباينه {ratio:.2f}:1 < {thr}:1 "
                f"({thr_name}) — أغمِق/فتِّح اللون في gen_themes.py")

        for rule in td["tokenColors"]:
            fg = rule.get("settings", {}).get("foreground")
            if fg:
                _assert_aa(fg, f"نطاق نحويّ «{rule.get('name')}»")
        for kind, val in td.get("semanticTokenColors", {}).items():
            fg = val.get("foreground") if isinstance(val, dict) else val
            if fg:
                _assert_aa(fg, f"رمز دلاليّ «{kind}»")

        # (2) تمايز اللوحة — الفئات الخمس الدلاليّة متباعدة ΔE76 ≥ DE_MIN، وإلّا انهارت
        #     اللوحة إلى كتل متشابهة وضاع معنى التلوين (الانحدار الذي أوقعته لوحة سابقة).
        sem = td.get("semanticTokenColors", {})
        present = {k: sem[k] for k in SEMANTIC_KINDS if isinstance(sem.get(k), str)}
        assert len(present) == len(SEMANTIC_KINDS), (
            f"[{label}] فئات دلاليّة مفقودة من semanticTokenColors: "
            f"{sorted(set(SEMANTIC_KINDS) - set(present))}")
        kinds = sorted(present)
        for i, a in enumerate(kinds):
            for b in kinds[i + 1:]:
                d = _delta_e(present[a], present[b])
                assert d >= DE_MIN, (
                    f"[{label}] «{a}» ({present[a]}) و«{b}» ({present[b]}) متقاربان: "
                    f"ΔE76={d:.1f} < {DE_MIN} — لونان لا يُميَّزان أثناء القراءة؛ "
                    f"باعِد بينهما في gen_themes.py")

        # (3) اشتقاق القشرة من اللوحة — الذهب/الأزرق في عناصر بيئة العمل يجب أن يساويا
        #     نبرتَي «مفتاح»/«نوع» حرفيًّا. تُمسَك بذلك القشرةُ التي تتخلّف عن إعادة تلوين
        #     اللوحة (انجراف حدث فعلًا: بقي #785006/#0B626E من لوحة سابقة بعد تبديلها).
        colors = td["colors"]
        # (2ب) سمة تباين عالٍ بلا `contrastBorder` ليست عالية التباين فعلًا: VS Code يرسم
        #      الحدود حول العناصر انطلاقًا منه؛ بدونه تعود القشرة تعتمد فروق خلفيّة خافتة.
        if is_hc:
            for req in ("contrastBorder", "contrastActiveBorder"):
                assert colors_of(td).get(req), (
                    f"[{label}] سمة عالية التباين بلا «{req}» — لن تُرسَم الحدود "
                    f"فتفقد السمة سبب وجودها")

        for ui_key, kind in (("list.highlightForeground", "keyword"),
                             ("progressBar.background", "keyword"),
                             ("textLink.foreground", "type")):
            if ui_key in colors and kind in present:
                assert colors[ui_key].lower() == present[kind].lower(), (
                    f"[{label}] {ui_key} = {colors[ui_key]} ≠ لون «{kind}» ({present[kind]}) — "
                    f"القشرة منجرفة عن اللوحة؛ اشتقّها في gen_themes.py")


# ───────────── L0-9: سمة أيقونات محراب ─────────────
@check("سمة أيقونات محراب: JSON صالح، خرائط ص/مجلّد/عامّ، SVG موجود، مُعرّف افتراضيّ")
def _icon_theme():
    ext = os.path.join(ROOT, "extensions", "mihrab-icons")
    if not os.path.isdir(ext):
        return  # لا إضافة أيقونات في هذا الفرع — تخطٍّ
    pkg = json.load(open(os.path.join(ext, "package.json"), encoding="utf-8"))
    contrib = pkg.get("contributes", {})
    icons = contrib.get("iconThemes", [])
    assert icons, "لا iconThemes في الحزمة"
    ids = {i.get("id") for i in icons}
    # الافتراضيّة (سمات الأيقونات تُفتَّح بالـid لا الـlabel):
    default = contrib.get("configurationDefaults", {}).get("workbench.iconTheme")
    assert default in ids, f"سمة الأيقونات الافتراضيّة «{default}» ليست من ids {ids}"
    for it in icons:
        assert it.get("id") and it.get("label") and it.get("path"), f"عقد سمة أيقونات ناقص: {it}"
        tp = os.path.join(ext, *it["path"].lstrip("./").split("/"))
        assert os.path.isfile(tp), f"ملفّ سمة الأيقونات مفقود: {it['path']}"
        td = json.load(open(tp, encoding="utf-8"))
        defs = td.get("iconDefinitions", {})
        assert defs, "لا iconDefinitions"
        # الافتراضات الأساسيّة موجودة (ملفّ + مجلّد) وإلّا فالملفّات غير المعرّفة بلا أيقونة:
        assert td.get("file") in defs, "لا أيقونة ملفّ افتراضيّة (file)"
        assert td.get("folder") in defs, "لا أيقونة مجلّد افتراضيّة (folder)"
        # ملفّ ص مخرَّط (بالامتداد ص أو بلغة sad):
        sad_ref = td.get("fileExtensions", {}).get("ص") or td.get("languageIds", {}).get("sad")
        assert sad_ref in defs, "ملفّ ص غير مخرَّط لأيقونة (fileExtensions.ص / languageIds.sad)"

        # **كلّ** مرجع أيقونة (base + light + highContrast، بما فيه folderExpanded) له تعريف —
        # يمنع مرجعًا مكسورًا يمرّ صامتًا (يرتدّ لأيقونة أخرى/يختفي).
        def _refs(block):
            r = set()
            for k in ("file", "folder", "folderExpanded", "rootFolder", "rootFolderExpanded"):
                if block.get(k):
                    r.add(block[k])
            for m in ("fileExtensions", "fileNames", "folderNames",
                      "folderNamesExpanded", "languageIds"):
                r.update((block.get(m) or {}).values())
            return r
        refs = _refs(td)
        for variant in ("light", "highContrast"):
            if isinstance(td.get(variant), dict):
                refs |= _refs(td[variant])
        for r in refs:
            assert r in defs, f"مرجع أيقونة «{r}» بلا تعريف في iconDefinitions ({it['path']})"
        # كلّ iconPath يشير لملفّ SVG موجود وصالح الترويسة:
        for name, d in defs.items():
            ip = d.get("iconPath")
            assert ip, f"iconDefinition «{name}» بلا iconPath"
            svg = os.path.join(ext, *ip.lstrip("./").split("/"))
            assert os.path.isfile(svg), f"أيقونة SVG مفقودة: {ip}"
            head = _read(svg).lstrip()
            assert head.startswith("<?xml") or head.startswith("<svg"), f"ليس SVG صالحًا: {ip}"

        # ── [AR-06] اتّساع التغطية: السمة **افتراضيّة**، فتغطيتها الضيّقة تجعل مستكشف محراب
        # أقلّ إفادةً من المحرّر القياسيّ (‏seti). كانت تُخرِّط نوعًا واحدًا (ص) فتصير الشجرة
        # صفًّا من صفحاتٍ متطابقة. هذا الحدّ الأدنى يمنع الارتداد إلى تلك الحال.
        MIN_EXTENSIONS = 30
        MUST_COVER = ("ص", "json", "md", "py", "svg", "log")   # عائلة واحدة على الأقلّ من كلٍّ
        fe = td.get("fileExtensions", {})
        assert len(fe) >= MIN_EXTENSIONS, (
            f"سمة الأيقونات تُخرِّط {len(fe)} امتدادًا فقط (الحدّ {MIN_EXTENSIONS}) — الشجرة "
            f"تصير صفحاتٍ متطابقة وتضيع أسرع إشارة بصريّة في المستكشف [AR-06]")
        for e in MUST_COVER:
            assert e in fe, f"امتداد «{e}» غير مخرَّط — عائلة كاملة بلا أيقونة [AR-06]"
        # تكافؤ الأرضيّتين: كلّ ما تخرّطه الداكنة تخرّطه الفاتحة (وإلّا سقطت الفاتحة للعامّ).
        lfe = (td.get("light") or {}).get("fileExtensions", {})
        if lfe:
            missing_light = set(fe) - set(lfe)
            assert not missing_light, \
                f"امتدادات مخرَّطة في الداكنة وحدها: {sorted(missing_light)[:6]} [AR-06]"

    # ── المولّد مصدر الحقيقة: الملفّات المشتقّة تحمل رأسه، ولا تُحرَّر يدويًّا (اصطلاح
    # مقتطفات ص نفسه). ‏sad.svg مستثنًى صراحةً — علامة الهوية مكتوبة يدويًّا لا مشتقّة.
    gen = os.path.join(ext, "gen_icons.py")
    if os.path.isfile(gen):
        BANNER = "مولَّد بـgen_icons.py"
        assert BANNER in _read(gen), "رأس المولَّد غير معرَّف في gen_icons.py [AR-06]"
        for fn in sorted(os.listdir(os.path.join(ext, "icons"))):
            if fn.startswith("sad") or fn.startswith("file") or fn.startswith("folder"):
                continue  # أصولٌ يدويّة سابقة للمولّد (الهوية + الافتراضيّان)
            assert BANNER in _read(os.path.join(ext, "icons", fn)), \
                f"‏{fn} بلا رأس المولَّد — حُرِّر يدويًّا فسيُدهَس عند أوّل توليد [AR-06]"


# ───────────── L0-7: أصول الهوية البصريّة (أيقونة التطبيق) ─────────────
@check("أصول الهوية موجودة وسليمة، وكتلة الحقن تنسخها فعلًا")
def _branding_assets():
    # كلّ أصل معلَن موجود؛ والـico ترويسته صالحة (00 00 01 00) — دون اعتماد PIL في CI.
    for src in {s for s, _t in M.BRANDING_ASSETS}:
        p = os.path.join(ROOT, src)
        assert os.path.isfile(p), f"أصل هوية مفقود: {src} (شغّل assets/branding/gen_ico.py)"
        if src.endswith(".ico"):
            with open(p, "rb") as f:
                head = f.read(4)
            assert head == b"\x00\x00\x01\x00", f"ترويسة ICO غير صالحة في {src}: {head!r}"
            assert os.path.getsize(p) > 2000, f"{src} صغير بشكل مريب (ربّما تالف)"
    # كتلة الحقن تنسخ كلّ هدف فعلًا. **جرّد أسطر التعليق** قبل الفحص: تعليق يذكر المسار
    # (winIcon=resources/win32/code.ico) يُرضي فحص السلسلة زورًا حتى لو حُذف أمر cp الفعليّ.
    src_lines = _read(os.path.join(BUILD, "patch_bundle_extensions.py")).splitlines()
    code_only = "\n".join(ln for ln in src_lines if not ln.lstrip().startswith("#"))
    for _src, target in M.BRANDING_ASSETS:
        assert f"cp -f ../.mihrab-branding/" in code_only and f"resources/win32/{target}" in code_only, \
            f"كتلة الحقن لا تنسخ {target} إلى resources/win32/ (أمر cp فعليّ) — أُزيل ربط الهوية؟"


@check("أصول SVG للأسطح (رأس التطبيق + خلفية المحرّر): موجودة وسليمة، وكتلة الحقن تنسخها للوجهة الفعليّة")
def _branding_svg_assets():
    import re
    import xml.dom.minidom
    src_lines = _read(os.path.join(BUILD, "patch_bundle_extensions.py")).splitlines()
    code_only = chr(10).join(ln for ln in src_lines if not ln.lstrip().startswith("#"))
    cp_lines = [ln for ln in code_only.splitlines() if "cp -f" in ln]
    loop_m = re.search("for _lp in ([A-Za-z ]+)", code_only)  # كلمات المتغيّرات فقط (يقف عند ; أو do)
    q = chr(34)
    for src, dest in M.BRANDING_SVG_ASSETS:
        ap = os.path.join(ROOT, src)
        assert os.path.isfile(ap), f"أصل SVG مفقود: {src}"
        body = _read(ap)
        xml.dom.minidom.parseString(body.encode("utf-8"))  # يرفع عند XML غير سليم
        # مِجَسّ ASCII في **مصدر** الأصل يميّز شعار محراب عن أصل VSCodium. (svgo يجرّده في الحزمة ⇒
        # تحقّق المخرَج بتوقيع لونيّ في L2 _surface_svgs لا بهذا المِجَسّ.)
        assert ("id=" + q + "mihrab-arch" + q) in body, f"{src} لا يحمل مِجَسّ mihrab-arch (ليس شعار محراب؟)"
        base = os.path.basename(dest)
        # نفحص الوجهة الفعليّة في سطر cp حقيقيّ (لا مجرّد ظهور الاسم في سطر الفحص القاتل).
        if base.startswith("letterpress-"):
            variant = base[len("letterpress-"):-len(".svg")]  # dark/light/hcDark/hcLight
            templ = os.path.dirname(dest) + "/letterpress-${_lp}.svg"
            assert any(templ in ln for ln in cp_lines), f"لا سطر cp مُعامَل ينسخ letterpress إلى {os.path.dirname(dest)}"
            assert loop_m and variant in loop_m.group(1).split(), f"المتغيّر {variant} غير مُغطّى في حلقة for _lp"
        else:
            assert any(dest in ln for ln in cp_lines), f"لا سطر cp ينسخ إلى الوجهة الحرفيّة {dest} (أُزيل ربط سطح الهوية؟)"


@check("أصول مساحة sessions: موجودة وسليمة، وكتلة الحقن تنسخها للوجهة الفعليّة")
def _branding_sessions_assets():
    import xml.dom.minidom
    src_lines = _read(os.path.join(BUILD, "patch_bundle_extensions.py")).splitlines()
    code_only = chr(10).join(ln for ln in src_lines if not ln.lstrip().startswith("#"))
    cp_lines = [ln for ln in code_only.splitlines() if "cp -f" in ln]
    import re as _re
    fatal_m = _re.search("for _sasset in ([^;]+)", code_only)  # قائمة الفحص القاتل ضدّ الأصل المفقود
    fatal_list = fatal_m.group(1).split() if fatal_m else []
    q = chr(34)
    for src, dest in M.BRANDING_SESSIONS_ASSETS:
        ap = os.path.join(ROOT, src)
        assert os.path.isfile(ap), f"أصل sessions مفقود: {src}"
        body = _read(ap)
        if src.endswith(".svg"):
            xml.dom.minidom.parseString(body.encode("utf-8"))
            assert ("id=" + q + "mihrab-arch" + q) in body, f"{src} بلا مِجَسّ mihrab-arch"
        else:  # vscodeLogoPath.ts: مسار محراب المطموس لا مسار VSCodium
            assert "M14 88" in body, f"{src} لا يحمل مسار قوس محراب (M14 88)"
            assert "M65.566" not in body, f"{src} ما زال يحمل مسار شعار VSCodium (M65.566)"
        assert any(dest in ln for ln in cp_lines), f"لا سطر cp ينسخ إلى وجهة sessions {dest}"
        assert os.path.basename(dest) in fatal_list, f"basename {os.path.basename(dest)} غائب عن قائمة الفحص القاتل for _sasset"

@check("الملفّ التكميليّ للترجمة: JSON صالح، قيم نصّيّة غير فارغة، تكافؤ الحوامل، ووصل الخبز به")
def _ar_supplement():
    import re as _re
    supp_path = os.path.join(BUILD, "mihrab_ar_supplement.json")
    assert os.path.isfile(supp_path), "الملفّ التكميليّ mihrab_ar_supplement.json مفقود"
    data = json.load(open(supp_path, encoding="utf-8"))
    assert isinstance(data, dict), "الملفّ التكميليّ ليس كائن JSON"
    ph = _re.compile(r"\{\d+\}")
    mnem = _re.compile(r"&&(.)")
    # محارف تنسيق غير مرئيّة تلوّث النصّ العربيّ بصمت (لا مكان لها في هذه السلاسل):
    # واصلة ليّنة، مسافة/واصل/فاصل صفريّ العرض، واصل الكلمات، BOM. (ترميز صريح — لا محارف
    # غير مرئيّة في الكود نفسه.)
    INVISIBLE = {
        0x00AD: "SOFT-HYPHEN", 0x200B: "ZWSP", 0x200C: "ZWNJ",
        0x200D: "ZWJ", 0x2060: "WORD-JOINER", 0xFEFF: "BOM",
    }
    for en, ar in data.items():
        assert isinstance(en, str) and isinstance(ar, str) and ar, f"زوج غير نصّيّ/فارغ: {en!r}"
        for cp, nm in INVISIBLE.items():
            assert chr(cp) not in ar, f"محرف غير مرئيّ ({nm}) في الترجمة: {en!r}"
        # تكافؤ الحوامل {n} كـmultiset (لا set) — يمسك اختلال العدد المكرَّر ({0}...{0}).
        assert sorted(ph.findall(en)) == sorted(ph.findall(ar)), \
            f"اختلال حوامل بين الإنجليزيّة والعربيّة: {en!r}"
        # تكافؤ بنية الماركداون/المعرّفات الحرفيّة: رابط `](`، backtick، وبادئة الرابط http.
        for tok in ("](", "`", "http"):
            assert en.count(tok) == ar.count(tok), \
                f"اختلال بنية «{tok}» بين الإنجليزيّة والعربيّة: {en!r}"
        # علامة اختصار &&: يجب بقاء حرف الوصول اللاتينيّ نفسه (لا مجرّد وجود &&).
        assert {c.lower() for c in mnem.findall(en)} == {c.lower() for c in mnem.findall(ar)}, \
            f"اختلّ حرف اختصار && بين الإنجليزيّة والعربيّة: {en!r}"
    # الخبز يجب أن يشير إلى اسم الملفّ التكميليّ (وإلّا فالوصل مقطوع).
    bake_src = _read(os.path.join(BUILD, "bake_nls_arabic.py"))
    assert "mihrab_ar_supplement.json" in bake_src, "bake_nls_arabic.py لا يشير إلى الملفّ التكميليّ"


@check("تكميليّ بيانات الامتدادات: JSON صالح، قيم نصّيّة، تكافؤ الحوامل/البنية، ووصل الحقن به")
def _ext_nls_supplement():
    import re as _re
    supp_path = os.path.join(BUILD, "mihrab_ext_nls_ar.json")
    assert os.path.isfile(supp_path), "الملفّ التكميليّ mihrab_ext_nls_ar.json مفقود"

    # كشف المفاتيح المكرّرة عند المصدر: json.load يحتفظ بآخر قيمة صمتًا فيُسقِط ترجمةً
    # (نزاهة بيانات — 1139 زوجًا محرَّرًا يدويًّا). object_pairs_hook يمسكها قبل الابتلاع.
    def _no_dups(pairs):
        seen = {}
        for k, v in pairs:
            assert k not in seen, f"مفتاح مكرّر في تكميليّ الامتدادات: {k!r}"
            seen[k] = v
        return seen
    data = json.load(open(supp_path, encoding="utf-8"), object_pairs_hook=_no_dups)
    assert isinstance(data, dict), "تكميليّ الامتدادات ليس كائن JSON"
    # حوامل بأسلوبين: {0} و${name} (سلاسل package.nls تستعمل كليهما).
    ph = _re.compile(r"\{\d+\}|\$\{[^}]*\}")
    mnem = _re.compile(r"&&(.)")
    INVISIBLE = {
        0x00AD: "SOFT-HYPHEN", 0x200B: "ZWSP", 0x200C: "ZWNJ",
        0x200D: "ZWJ", 0x2060: "WORD-JOINER", 0xFEFF: "BOM",
    }
    for en, ar in data.items():
        if en.startswith("//"):  # تعليقات مسموحة، تُتخطّى في الحقن
            continue
        assert isinstance(en, str) and isinstance(ar, str) and ar, f"زوج غير نصّيّ/فارغ: {en!r}"
        for cp, nm in INVISIBLE.items():
            assert chr(cp) not in ar, f"محرف غير مرئيّ ({nm}) في الترجمة: {en!r}"
        # تكافؤ الحوامل كـmultiset (يمسك اختلال العدد المكرَّر).
        assert sorted(ph.findall(en)) == sorted(ph.findall(ar)), \
            f"اختلال حوامل بين الإنجليزيّة والعربيّة: {en!r}"
        # تكافؤ بنية الماركداون/المعرّفات الحرفيّة: رابط `](`، backtick، بادئة http،
        # ومرجع الأمر command: (روابط الإجراءات في أوصاف Git يجب ألّا تُترجَم بنيتها).
        for tok in ("](", "`", "http", "command:"):
            assert en.count(tok) == ar.count(tok), \
                f"اختلال بنية «{tok}» بين الإنجليزيّة والعربيّة: {en!r}"
        # تكافؤ حرف اختصار && (mnemonic) كما في حارس النواة _ar_supplement.
        assert {c.lower() for c in mnem.findall(en)} == {c.lower() for c in mnem.findall(ar)}, \
            f"اختلّ حرف اختصار && بين الإنجليزيّة والعربيّة: {en!r}"
    # الحقن يجب أن يشير إلى اسم الملفّ التكميليّ (وإلّا فالوصل مقطوع).
    inj_src = _read(os.path.join(BUILD, "patch_extension_nls.py"))
    assert "mihrab_ext_nls_ar.json" in inj_src, "patch_extension_nls.py لا يشير إلى الملفّ التكميليّ"


# ───────────── L0-15: امتداد ترحيب محراب (الجولة + أوامر الإعداد الأوّل) ─────────────
@check("امتداد ترحيب محراب: JSON صالح، أوامر ↔ JS متطابقة، خطوات الجولة تشير لوسائط موجودة")
def _welcome_ext():
    ext = os.path.join(ROOT, "extensions", "mihrab-welcome")
    if not os.path.isdir(ext):
        return  # لا امتداد ترحيب في هذا الفرع — تخطٍّ
    pkg = json.load(open(os.path.join(ext, "package.json"), encoding="utf-8"))
    contrib = pkg.get("contributes", {})

    # (١) نقطة الدخول main موجودة فعلًا (وإلّا فالأوامر لن تُفعَّل).
    main_rel = pkg.get("main")
    assert main_rel, "لا حقل main في امتداد الترحيب (الأوامر تحتاج نقطة دخول JS)"
    main_path = os.path.join(ext, *main_rel.lstrip("./").split("/"))
    assert os.path.isfile(main_path), f"ملفّ main مفقود: {main_rel}"
    js = _read(main_path)
    # نقطة الدخول تصدّر activate (وإلّا لن يُفعَّل الامتداد إطلاقًا).
    assert "module.exports" in js and "function activate" in js, \
        "نقطة دخول الامتداد لا تصدّر activate (module.exports/function activate)"
    # صحّة نحو JS إن توفّر node (لا يُفشِل حين غيابه — L0 صالح لـCI بلا اعتماد).
    node = shutil.which("node")
    if node:
        r = subprocess.run([node, "--check", main_path], capture_output=True, text=True)
        assert r.returncode == 0, f"خطأ نحويّ في {main_rel}:\n{r.stderr.strip()}"

    # (١ب) الفتح التلقائيّ للجولة يعتمد على تنشيط عند اكتمال الإقلاع؛ بدونه لا تظهر لمستخدم عائد.
    assert "onStartupFinished" in pkg.get("activationEvents", []), \
        "activationEvents لا يحوي onStartupFinished — الجولة لن تُفتَح تلقائيًّا أوّل مرّة"
    assert "maybeShowWelcome" in js and "openWalkthrough" in js, \
        "لا منطق فتح تلقائيّ للجولة (maybeShowWelcome/openWalkthrough) في نقطة الدخول"

    # (١ج) تشغيل ملفّ ص يجب أن يمرّ بالمسار المحلول (المدمج ثمّ PATH) لا باسم ثابت مباشر،
    #      وإلّا ينكسر ربط الثنائيّ المدمج ولا يعمل التشغيل دون تثبيت على PATH.
    #      (أنماط متسامحة مع المسافات كي لا تنكسر بإعادة تنسيق. [N1])
    import re as _re
    # (١ب٢) كلّ أمرٍ معلَنٍ مُسجَّل — كان هذا الحارسُ لنِبراس وحدَه، فأمرٌ يُعلَن في مانيفست
    #       الترحيب بلا `registerCommand` كان يمرّ أخضرَ ويظهر في لوحة الأوامر ثمّ يرمي
    #       «command not found» عند النقر. التسجيلُ قد يمرّ بثابتٍ مسمّى فنحلّه.
    _wcmds = {c.get("command") for c in (pkg.get("contributes", {}).get("commands") or [])}
    assert _wcmds, "لا أوامر معلَنة في امتداد الترحيب"
    # التسجيلُ قد يُنقَل إلى وحدةٍ مستقلّة (نمطُ نِبراس «التسجيل الموزّع»)، فنمسح كلَّ ملفّات
    # JS لا نقطةَ الدخول وحدَها — وإلّا يُسقِط أوّلُ نقلٍ الفحصَ أحمرَ كاذبًا.
    _wreg = set()
    for _jf in sorted(f for f in os.listdir(ext) if f.endswith(".js")):
        _js = _read(os.path.join(ext, _jf))
        _wconst = dict(_re.findall(r'const\s+([A-Za-z_$][\w$]*)\s*=\s*"([^"]+)"', _js))
        for _arg in _re.findall(r"registerCommand\(\s*([^,]+?)\s*,", _js):
            _arg = _arg.strip()
            _lit = _re.fullmatch(r"""["']([^"']+)["']""", _arg)
            _wreg.add(_lit.group(1) if _lit else _wconst.get(_arg, _arg))
    assert not (_wcmds - _wreg), (
        f"أوامرُ معلَنةٌ في مانيفست الترحيب بلا registerCommand: {sorted(_wcmds - _wreg)}")
    for _c in pkg.get("contributes", {}).get("commands", []):
        assert _c.get("title"), f"أمرُ ترحيبٍ بلا عنوان: {_c.get('command')}"
    assert "resolveSadRun" in js, "لا دالّة resolveSadRun (حلّ الثنائيّ المدمج) في نقطة الدخول"
    # [AR-01] التشغيل يُوجَّه إلى لوحة المخرجات العربيّة (bidi صحيح) بدل مهمّة طرفيّة تشوّه العربيّة،
    #         ويجب أن يمرّر المسار المحلول sadRunCmd — وإلّا يتجاهل الثنائيّ المدمج. حارس ضدّ انحدار.
    assert "output-panel" in js and "SadOutputPanel" in js, \
        "runSadFile لا يوجّه إلى لوحة المخرجات العربيّة (output-panel/SadOutputPanel) [AR-01]"
    # اللوحة تُنشأ فعلًا وتُدفَع إلى subscriptions (وإلّا يبقى sadOutput غير مُهيّأ ⇒ runSadFile
    # يرمي زمن التشغيل بينما L0/node --check أخضران — نجاح كاذب). وتُشغَّل بالمسار المحلول sadRunCmd.
    assert _re.search(r"new\s+SadOutputPanel\(", js), \
        "لا إنشاء فعليّ للوحة (new SadOutputPanel) — sadOutput يبقى غير مُهيّأ [AR-01]"
    # اللوحة مُدرَجة في context.subscriptions (وإلّا لا تُغلَق/تُقتَل العمليّة عند التعطيل). نفحص
    # نافذةً بعد push( تغطّي قائمة الوسائط كاملةً (لا regex [^)] الذي يتوقّف عند أوّل قوس مغلق).
    _push_idx = js.find("subscriptions.push(")
    assert _push_idx != -1 and "sadOutput" in js[_push_idx:_push_idx + 600], \
        "لوحة المخرجات غير مُدرَجة في context.subscriptions — لن تُغلَق/تُقتَل عند التعطيل [AR-01]"
    assert _re.search(r"sadOutput\.run\(\s*sadRunCmd", js), \
        "لوحة المخرجات لا تُشغَّل بالمسار المحلول sadRunCmd — قد تتجاهل الثنائيّ المدمج [AR-01]"
    # [SAD-04] أمر «ابنِ» يُوجَّه للّوحة بالمسار المحلول sadBuildCmd، وعدسات الكود «شغّل/ابنِ»
    #          مسجَّلة فوق «دالة رئيسية». حرّاس ضدّ انحدار (المسار المحلول + وجود الميزة).
    assert "resolveSadBuild" in js and _re.search(r"sadOutput\.run\(\s*sadBuildCmd", js), \
        "أمر البناء لا يُوجَّه للّوحة بالمسار المحلول sadBuildCmd (resolveSadBuild) — قد يتجاهل الثنائيّ المدمج [SAD-04]"
    assert "registerCodeLensProvider" in js and "SadMainCodeLensProvider" in js, \
        "لا موفّر عدسات كود (registerCodeLensProvider/SadMainCodeLensProvider) فوق دالّة رئيسية [SAD-04]"
    # [تدقيق #1] خطوة «شغّل» تصف لوحة ص العربيّة (وجهة AR-01) لا «طرفيّة في الأسفل» (تشوّه bidi).
    _step_run = os.path.join(ext, "media", "step-run.md")
    if os.path.isfile(_step_run):
        _sr = _read(_step_run)
        assert "لوحة" in _sr and "طرفيّة في الأسفل" not in _sr, \
            "media/step-run.md لا يصف لوحة المخرجات العربيّة (أو ما زال يَعِد بطرفيّة في الأسفل) — يناقض AR-01 [تدقيق #1]"
    # مهمّة tasks.json المولَّدة يجب أن تُبنى من المُشغّل المحلول (buildTasksJson(sadRunCmd)) لا
    # باسم ثابت — وإلّا عاد تباعد المسارين (المهمّة تفشل رغم توفّر المدمج). حارس ضدّ انحدار.
    assert "buildTasksJson" in js and _re.search(r"command:\s*runCommand", js), \
        "مهمّة tasks.json لا تُبنى من المُشغّل المحلول (buildTasksJson/command: runCommand) — خطر تباعد المسارين"
    # التشغيل يجب أن يصمد حين لا محرّر ص نشط (زرّ الجولة يحتلّ المحرّر فلا نصّ نشط): بحث في
    #      مساحة العمل عن ملفّ ص وفتحه — وإلّا عاد عطل «لا محرّر نشط» في الجولة. حارس ضدّ انحدار.
    assert "findWorkspaceSadFile" in js and "resolveSadDoc" in js, \
        "runSadFile لا يحوي رجوعًا لملفّ مساحة العمل (findWorkspaceSadFile/resolveSadDoc) — زرّ التشغيل في الجولة سيفشل"

    # (١د) طبقة الحزم المدمجة: البناء يحقن sad-run في bin/ داخل الامتداد، وgit يتجاهله، وثابت
    #      المجلّد في JS يطابق ما يحقنه البناء — وإلّا يمرّ L0 أخضر بينما التشغيل المدمج مكسور. [M6]
    # ثابت مجلّد الثنائيّات المدمجة صار في tool-resolve.js (مصدر واحد يتشاركه run/check/build). [تدقيق #2]
    tool_resolve = _read(os.path.join(ext, "tool-resolve.js"))
    assert _re.search(r'BUNDLED_BIN_DIR\s*=\s*"bin"', tool_resolve), \
        "ثابت BUNDLED_BIN_DIR ليس \"bin\" في tool-resolve.js — قد يفترق عن مسار الحقن في build.sh"
    assert "resolveBundledTool" in tool_resolve and "probeTool" in tool_resolve, \
        "tool-resolve.js لا يصدّر محلّل الأدوات المشترك (resolveBundledTool/probeTool) [تدقيق #2]"
    build_sh = _read(os.path.join(ROOT, "build", "build.sh"))
    assert "WELCOME_BIN" in build_sh and "sad-run.exe" in build_sh, \
        "build.sh لا يحوي كتلة حزم sad-run المدمجة (WELCOME_BIN/sad-run.exe)"
    # جسر التشخيص [SAD-02] يحلّ sad-check المدمج من bin/ قبل PATH ⇒ يجب أن يحزمه البناء أيضًا.
    assert "sad-check.exe" in build_sh, \
        "build.sh لا يحزم sad-check.exe المدمج — جسر التشخيص عند الحفظ سيسقط دومًا إلى PATH"
    # أمر البناء [SAD-04] يحلّ sad-build المدمج من bin/ قبل PATH ⇒ يجب أن يحزمه البناء أيضًا.
    assert "sad-build.exe" in build_sh, \
        "build.sh لا يحزم sad-build.exe المدمج — أمر «ابنِ» سيسقط دومًا إلى PATH [SAD-04]"
    gitignore = _read(os.path.join(ROOT, ".gitignore"))
    assert "extensions/mihrab-welcome/bin/" in gitignore, \
        ".gitignore لا يتجاهل الثنائيّ المدمج extensions/mihrab-welcome/bin/ (خطر إيداعه)"

    # (٢) كلّ أمر معلَن في المانيفست مُسجَّل فعلًا في JS (احتواء لا تطابق تامّ:
    #     يجوز أن يسجّل JS أمرًا داخليًّا غير معلَن، لكن كلّ معلَن يجب أن يُنفَّذ).
    manifest_cmds = {c.get("command") for c in contrib.get("commands", [])}
    assert manifest_cmds, "لا أوامر معلَنة في امتداد الترحيب"
    # الوسيط الأوّل لـregisterCommand قد يكون سلسلة حرفيّة أو ثابتًا مسمّى (منع السلاسل الخام)؛
    # نحلّ الثابت من إعلانه `const NAME = "..";` كي لا ينكسر الحارس برفع المعرّف إلى ثابت.
    _const_str = dict(_re.findall(r'const\s+([A-Za-z_$][\w$]*)\s*=\s*"([^"]+)"', js))
    js_cmds = set()
    for arg in _re.findall(r"registerCommand\(\s*([^,]+?)\s*,", js):
        arg = arg.strip()
        lit = _re.fullmatch(r"""["']([^"']+)["']""", arg)
        if lit:
            js_cmds.add(lit.group(1))
        elif arg in _const_str:
            js_cmds.add(_const_str[arg])
    missing = manifest_cmds - js_cmds
    assert not missing, f"أوامر معلَنة في المانيفست بلا registerCommand في JS: {missing}"
    # كلّ أمر معلَن له عنوان غير فارغ (يظهر في لوحة الأوامر).
    for c in contrib.get("commands", []):
        assert c.get("title"), f"أمر بلا عنوان: {c.get('command')}"

    # (٣) الجولة: خطوات تشير لوسائط ماركداون موجودة، ومعرّفات فريدة، وactivationEvents مربوط.
    walks = contrib.get("walkthroughs", [])
    assert walks, "لا جولات (walkthroughs) في امتداد الترحيب"
    seen_step_ids = set()
    for w in walks:
        assert w.get("id") and w.get("title") and w.get("description"), f"عقد جولة ناقص: {w.get('id')}"
        # ملاحظة: onWalkthrough:<id> يولّده VS Code تلقائيًّا من contributes.walkthroughs (≥1.74)،
        # فلا نُلزِمه صراحةً في activationEvents (كان زائدًا يحذّر منه المحرّر). التنشيط مضمون بـ
        # onStartupFinished (يُفحَص أعلاه) + التوليد التلقائيّ. [تدقيق #6]
        steps = w.get("steps", [])
        assert steps, f"جولة بلا خطوات: {w['id']}"
        for st in steps:
            sid = st.get("id")
            assert sid and sid not in seen_step_ids, f"معرّف خطوة مفقود/مكرّر: {sid}"
            seen_step_ids.add(sid)
            assert st.get("title") and st.get("description"), f"خطوة ناقصة: {sid}"
            md = (st.get("media") or {}).get("markdown")
            assert md, f"خطوة بلا وسيط ماركداون: {sid}"
            mp = os.path.join(ext, *md.lstrip("./").split("/"))
            assert os.path.isfile(mp), f"وسيط جولة مفقود: {md} (للخطوة {sid})"
            # أيّ رابط command: في وصف الخطوة يجب أن يشير لأمر معلَن (لا رابط ميّت).
            for cmd in _re.findall(r"command:([A-Za-z0-9_.]+)", st["description"]):
                assert cmd in manifest_cmds, f"رابط أمر ميّت «{cmd}» في الخطوة {sid}"


@check("هوية لغة ص متّسقة (SAD_LANG_ID/SAD_EXT ↔ contributes.languages في sad-lang)")
def _lang_identity():
    # مصدر الحقيقة لهوية لغة ص = مساهمة اللغة في امتداد sad-lang (لا سلسلة مُختلَقة). كلّ مرآة
    # SAD_LANG_ID/SAD_EXT مكرَّرة في امتدادات محراب يجب أن تطابقه — يمنع التباعد الصامت.
    import re
    sad_lang_pkg = os.path.join(ROOT, "extensions", "sad-lang", "package.json")
    if not os.path.isfile(sad_lang_pkg):
        return  # لا امتداد لغة في هذا الفرع — تخطٍّ
    pkg = json.load(open(sad_lang_pkg, encoding="utf-8"))
    langs = pkg.get("contributes", {}).get("languages", [])
    assert langs, "امتداد sad-lang بلا contributes.languages (مصدر هوية اللغة)"
    lang = langs[0]
    lang_id = lang.get("id")
    exts = lang.get("extensions") or []
    assert lang_id and exts, "تعريف لغة ص ناقص (id/extensions) في sad-lang"
    sad_ext = exts[0]

    mirrors = [
        os.path.join(ROOT, "extensions", "mihrab-nebras", n)
        for n in ("chat.js", "agent.js", "explain-selection.js", "inline-completion.js", "fix-diagnostic.js")
    ] + [os.path.join(ROOT, "extensions", "mihrab-welcome", "extension.js")]
    id_re = re.compile(r'const\s+SAD_LANG_ID\s*=\s*"([^"]*)"')
    ext_re = re.compile(r'const\s+SAD_EXT\s*=\s*"([^"]*)"')
    seen_id = seen_ext = 0
    for f in mirrors:
        if not os.path.isfile(f):
            continue
        js = _read(f)
        for m in id_re.finditer(js):
            seen_id += 1
            assert m.group(1) == lang_id, \
                f"SAD_LANG_ID «{m.group(1)}» في {os.path.basename(f)} ≠ هوية sad-lang «{lang_id}»"
        for m in ext_re.finditer(js):
            seen_ext += 1
            assert m.group(1) == sad_ext, \
                f"SAD_EXT «{m.group(1)}» في {os.path.basename(f)} ≠ امتداد sad-lang «{sad_ext}»"
    # حارس ضدّ التحوّل إلى no-op لو تغيّرت البنية (نقل الملفّات/إعادة تسمية الثابت).
    assert seen_id and seen_ext, \
        "لم يُعثَر على أيّ تصريح SAD_LANG_ID/SAD_EXT في المرايا — تحقّق من بنية الامتدادات"


@check("مقتطفات ص [SAD-03]: معلَنة ↔ ملفّ موجود ↔ JSONC صالح ↔ رأس مولَّد (لا تحرير يدويّ)")
def _sad_snippets():
    ext = os.path.join(ROOT, "extensions", "sad-lang")
    if not os.path.isdir(ext):
        return  # لا إضافة لغة ص في هذا الفرع — تخطٍّ
    pkg = json.load(open(os.path.join(ext, "package.json"), encoding="utf-8"))
    decls = pkg.get("contributes", {}).get("snippets", [])
    assert decls, "لا contributes.snippets في sad-lang — المقتطفات [SAD-03] غير مسجّلة"
    for d in decls:
        assert d.get("language") == "sad", f"مقتطف بلغة غير sad: {d.get('language')}"
        rel = d.get("path")
        assert rel, "إعلان مقتطفات بلا path"
        p = os.path.join(ext, *rel.lstrip("./").split("/"))
        assert os.path.isfile(p), f"ملفّ مقتطفات معلَن مفقود: {rel}"
        raw = _read(p)
        # رأس «مولَّد» (تعليق JSONC) — حارس ضدّ التحرير اليدويّ (المصدر gen_snippets.py في مستودع اللغة).
        assert "gen_snippets.py" in raw and "لا تُحرِّره" in raw, \
            f"ملفّ المقتطفات {rel} بلا رأس مولَّد — قد يكون حُرِّر يدويًّا (يجب توليده من language-truth)"
        # JSONC صالح: نجرّد أسطر التعليقات // ثمّ نحلّل، ونتأكّد أنّ كلّ مقتطف يحمل prefix + body.
        body = "".join(ln for ln in raw.splitlines(keepends=True) if not ln.lstrip().startswith("//"))
        data = json.loads(body)
        assert data, "ملفّ المقتطفات فارغ (لا مقتطفات مولَّدة)"
        for key, snip in data.items():
            assert isinstance(snip, dict) and snip.get("prefix") and snip.get("body"), \
                f"مقتطف «{key}» بلا prefix/body صالح"


# ───────────── L0-17: عميل ص LSP (SAD-01: خادم لغويّ محزوم في sad-lang) ─────────────
@check("عميل ص LSP: main يصدّر activate، تنشيط onLanguage:sad، حلّ الخادم المدمج ↔ حقن build.sh، تشخيص/مزوّدات موصولة")
def _sad_lsp_ext():
    import re as _re
    ext = os.path.join(ROOT, "extensions", "sad-lang")
    if not os.path.isdir(ext):
        return  # لا إضافة لغة ص في هذا الفرع — تخطٍّ
    pkg = json.load(open(os.path.join(ext, "package.json"), encoding="utf-8"))
    contrib = pkg.get("contributes", {})

    # (١) نقطة الدخول main موجودة وتصدّر activate (وإلّا لا يُفعَّل العميل إطلاقًا).
    main_rel = pkg.get("main")
    assert main_rel, "لا حقل main في sad-lang — عميل LSP يحتاج نقطة دخول JS [SAD-01]"
    main_path = os.path.join(ext, *main_rel.lstrip("./").split("/"))
    assert os.path.isfile(main_path), f"ملفّ main مفقود: {main_rel}"
    js = _read(main_path)
    assert "module.exports" in js and "function activate" in js, \
        "نقطة دخول sad-lang لا تصدّر activate"

    # (٢) التنشيط عند فتح لغة ص (وإلّا لا يبدأ الخادم عند تحرير ملفّ ص).
    assert "onLanguage:sad" in pkg.get("activationEvents", []), \
        "activationEvents لا يحوي onLanguage:sad — الخادم لن يبدأ عند فتح ملفّ ص [SAD-01]"

    # (٣) صحّة نحو JS لكلّ ملفّات العميل إن توفّر node (لا يُفشِل حين غيابه).
    js_files = ["extension.js", "sad-lsp-process.js", "lsp-rpc.js", "lsp-protocol.js", "tool-resolve.js"]
    node = shutil.which("node")
    for jf in js_files:
        jp = os.path.join(ext, jf)
        assert os.path.isfile(jp), f"ملفّ عميل LSP مفقود: {jf}"
        if node:
            r = subprocess.run([node, "--check", jp], capture_output=True, text=True)
            assert r.returncode == 0, f"خطأ نحويّ في {jf}:\n{r.stderr.strip()}"

    # (٤) حلّ الخادم المدمج: ثابت مجلّد bin يطابق ما يحقنه build.sh (وإلّا L0 أخضر والحزم مكسور).
    tool_resolve = _read(os.path.join(ext, "tool-resolve.js"))
    assert _re.search(r'BUNDLED_BIN_DIR\s*=\s*"bin"', tool_resolve), \
        "ثابت BUNDLED_BIN_DIR ليس \"bin\" في sad-lang/tool-resolve.js — قد يفترق عن حقن build.sh"
    assert "resolveBundledTool" in tool_resolve and "probeTool" in tool_resolve, \
        "sad-lang/tool-resolve.js لا يصدّر محلّل الأدوات (resolveBundledTool/probeTool)"
    proc_js = _read(os.path.join(ext, "sad-lsp-process.js"))
    assert 'SAD_LSP_EXE = "sad-lsp.exe"' in proc_js, \
        "sad-lsp-process.js لا يحلّ الثنائيّ المدمج باسم sad-lsp.exe — قد يتجاهل حقن build.sh"

    # (٥) البناء يحزم الخادم المدمج، وgit يتجاهله (طبقة الحزم المدمجة، نفس نمط sad-run/check/build).
    build_sh = _read(os.path.join(ROOT, "build", "build.sh"))
    assert "SAD_LSP_SRC" in build_sh and "sad-lsp.exe" in build_sh and "SADLANG_BIN" in build_sh, \
        "build.sh لا يحوي كتلة حزم sad-lsp المدمجة (SAD_LSP_SRC/SADLANG_BIN/sad-lsp.exe) [SAD-01]"
    gitignore = _read(os.path.join(ROOT, ".gitignore"))
    assert "extensions/sad-lang/bin/" in gitignore, \
        ".gitignore لا يتجاهل الخادم المدمج extensions/sad-lang/bin/ (خطر إيداعه) [SAD-01]"

    # (٦) التشخيص موصول: publishDiagnostics → DiagnosticCollection (القيمة الأساسيّة يوم الأوّل).
    assert "createDiagnosticCollection" in js, \
        "extension.js لا يُنشئ DiagnosticCollection — التشخيصات لن تظهر في لوحة المشاكل [SAD-01]"
    assert "M_PUBLISH_DIAGNOSTICS" in js, \
        "extension.js لا يستمع لـpublishDiagnostics — لا تشخيصات حيّة من الخادم [SAD-01]"

    # (٦ب) تنسيق ملكيّة التشخيص [تكامل SAD-01/02]: الخادم يملك التشخيص فيتنحّى جسر فحص-الحفظ.
    #      يجب: (أ) إعداد sad.lsp.diagnostics معلَن، (ب) extension يصدّر isDiagnosticsActive،
    #      (ج) جسر SAD-02 (welcome/diagnostics.js) يستعلمه ويتنحّى — وإلّا ازدواج تشخيص لنفس الخطأ.
    props = (contrib.get("configuration", {}) or {}).get("properties", {})
    assert "sad.lsp.diagnostics" in props, \
        "إعداد sad.lsp.diagnostics غير معلَن — لا مفتاح لملكيّة التشخيص [تكامل SAD-01/02]"
    assert "isDiagnosticsActive" in js, \
        "extension.js لا يصدّر isDiagnosticsActive — جسر SAD-02 لن يعرف متى يتنحّى [تكامل SAD-01/02]"
    welcome_diag = os.path.join(ROOT, "extensions", "mihrab-welcome", "diagnostics.js")
    if os.path.isfile(welcome_diag):
        wd = _read(welcome_diag)
        assert "lspOwnsDiagnostics" in wd and "isDiagnosticsActive" in wd, \
            "جسر SAD-02 لا يتنحّى لخادم LSP (lspOwnsDiagnostics/isDiagnosticsActive) — خطر ازدواج تشخيص [تكامل SAD-01/02]"

    # (٧) المزوّدات مسجَّلة: إكمال/تحويم/تعريف [SAD-01] + الرموز الدلاليّة [SAD-07].
    for reg in ["registerCompletionItemProvider", "registerHoverProvider", "registerDefinitionProvider"]:
        assert reg in js, f"extension.js لا يسجّل {reg} — ميزة LSP ناقصة [SAD-01]"
    # [SAD-07] التلوين الدلاليّ: مزوّد مسجَّل + حارس مطابقة المفتاح (legend) يمنع التلوين الخاطئ +
    #          مُصدِر تغيّر (onDidChangeSemanticTokens) كي تظهر الألوان على الفتح البارد لا بعد أوّل تعديل.
    assert "registerDocumentSemanticTokensProvider" in js and "serverLegendMatches" in js, \
        "extension.js لا يسجّل التلوين الدلاليّ مع حارس المفتاح (registerDocumentSemanticTokensProvider/serverLegendMatches) [SAD-07]"
    assert "onDidChangeSemanticTokens" in js, \
        "المزوّد الدلاليّ بلا onDidChangeSemanticTokens — لا تلوين على الفتح البارد حتى أوّل تعديل [SAD-07]"
    proto = _read(os.path.join(ext, "lsp-protocol.js"))
    assert "SEMANTIC_TOKEN_TYPES" in proto and '"decorator"' in proto, \
        "lsp-protocol.js لا يحوي مفتاح الرموز الدلاليّة SEMANTIC_TOKEN_TYPES [SAD-07]"

    # (٧ب) أحرف تحفيز الإكمال ممرَّرة للمزوّد: بعد إصلاح wordPattern تُحفَّز أحرفُ الكلمة تلقائيًّا، لكنّ
    #      أحرف التحفيز (. : ( ،) ليست أحرف كلمة فلا يُحفَّز الإكمال بعدها إلّا بتمريرها. ثابت مسمّى.
    assert "COMPLETION_TRIGGER_CHARACTERS" in proto, \
        "lsp-protocol.js لا يعرّف COMPLETION_TRIGGER_CHARACTERS — لا أحرف تحفيز للإكمال [SAD-01]"
    assert _re.search(r"\.\.\.COMPLETION_TRIGGER_CHARACTERS", js), \
        "extension.js لا يمرّر أحرف التحفيز لمزوّد الإكمال — لا إكمال تلقائيّ بعد . : ( ، [SAD-01]"

    # (٨) مزامنة كاملة (Full) لا تزايديّة: didChange يرسل النصّ الكامل (تفادي حساب إزاحات UTF-16).
    #     نتحقّق من غياب حساب إزاحات تزايديّة عبر تأكيد إرسال contentChanges بنصّ كامل.
    assert "contentChanges" in js and _re.search(r"contentChanges:\s*\[\{\s*text:", js), \
        "مزامنة المستند ليست كاملة (contentChanges بنصّ كامل) — خطر إزاحات UTF-16 يدويّة [SAD-01]"

    # (٩) كلّ أمر معلَن في المانيفست مُسجَّل فعلًا (احتواء، مع حلّ الثوابت المسمّاة).
    manifest_cmds = {c.get("command") for c in contrib.get("commands", [])}
    _const_str = dict(_re.findall(r'const\s+([A-Za-z_$][\w$]*)\s*=\s*"([^"]+)"', js))
    js_cmds = set()
    for arg in _re.findall(r"registerCommand\(\s*([^,]+?)\s*,", js):
        arg = arg.strip()
        lit = _re.fullmatch(r"""["']([^"']+)["']""", arg)
        if lit:
            js_cmds.add(lit.group(1))
        elif arg in _const_str:
            js_cmds.add(_const_str[arg])
    missing = manifest_cmds - js_cmds
    assert not missing, f"أوامر معلَنة بلا registerCommand في sad-lang: {missing}"
    for c in contrib.get("commands", []):
        assert c.get("title"), f"أمر بلا عنوان: {c.get('command')}"

    # (١٠) إعدادات الخادم معلَنة (المسار الصريح + التتبّع + ملكيّة التشخيص).
    props = (contrib.get("configuration", {}) or {}).get("properties", {})
    assert "sad.lsp.serverPath" in props and "sad.lsp.trace" in props, \
        "إعدادات sad.lsp.serverPath/sad.lsp.trace غير معلَنة في المانيفست [SAD-01]"


# ───────────── L0-19: wordPattern لغة ص عربيّ-الوعي (مانع انحدار الإكمال التلقائيّ) ─────────────
@check("إعداد لغة ص: wordPattern يطابق العربيّة (كائن براية u عند \\p{}) — لا انحدار إكمال تلقائيّ")
def _sad_word_pattern():
    ext = os.path.join(ROOT, "extensions", "sad-lang")
    if not os.path.isdir(ext):
        return  # لا إضافة لغة ص في هذا الفرع — تخطٍّ
    cfg_path = os.path.join(ext, "language-configuration.json")
    assert os.path.isfile(cfg_path), "language-configuration.json مفقود في sad-lang"
    # تحميله يفحص صحّة JSON ضمنًا (هذا الملفّ خارج نطاق حارس _json_valid). [تدقيق Amelia]
    cfg = json.load(open(cfg_path, encoding="utf-8"))
    wp = cfg.get("wordPattern")
    assert wp is not None, \
        "wordPattern غير معرَّف — لن يُكتشف المُدخَل العربيّ ككلمة فلا يُحفَّز الإكمال التلقائيّ"
    # الجذر: VS Code يجمّع wordPattern النصّيّة بـnew RegExp(s, "") بلا راية ⇒ \p{L} يُعامَل حرفيًّا
    #        فلا يطابق العربيّة. الحلّ: صيغة الكائن {pattern, flags:"u"} كي تُمرَّر الراية.
    if isinstance(wp, str):
        assert "\\p{" not in wp and "\\P{" not in wp, (
            "wordPattern صيغة نصّيّة تحوي \\p{...} — تُجمَّع بلا راية u فتُعامَل حرفيًّا ولا تطابق "
            "العربيّة (انحدار الإكمال التلقائيّ). استعمل صيغة الكائن {pattern, flags:'u'}")
        return
    assert isinstance(wp, dict) and isinstance(wp.get("pattern"), str), \
        "wordPattern كائن بلا حقل pattern نصّيّ"
    flags = wp.get("flags", "")
    assert isinstance(flags, str), "wordPattern.flags ليس نصًّا"
    if "\\p{" in wp["pattern"] or "\\P{" in wp["pattern"]:
        assert "u" in flags, (
            "wordPattern يستعمل \\p{...} دون راية u — بلا u تُعامَل حرفيًّا ولا تطابق العربيّة "
            "(انحدار الإكمال التلقائيّ). أضِف flags:'u'")
    # تعزيز سلوكيّ إن توفّر node: النمط يطابق عيّنة عربيّة «فيب» كاملةً فعليًّا. [تدقيق Amelia]
    node = shutil.which("node")
    if node:
        sample = "فيب"  # «فيب»
        script = (
            "const w=%s;const re=new RegExp(w.pattern,w.flags||'');const s=%s;"
            "const m=s.match(re);process.exit(m&&m[0]===s?0:3);"
        ) % (json.dumps(wp), json.dumps(sample))
        r = subprocess.run([node, "-e", script], capture_output=True, text=True)
        assert r.returncode == 0, \
            "wordPattern لا يطابق عيّنة عربيّة «فيب» كاملةً في Node — انحدار الإكمال التلقائيّ"


# ───────────── L0-18: امتداد نِبراس (أوامر ↔ تسجيل موزّع + «أصلِح بنِبراس» SAD-11) ─────────────
@check("امتداد نِبراس: main يصدّر activate، كلّ أمر معلَن مُسجَّل (تسجيل موزّع)، ووصل «أصلِح بنِبراس»")
def _nebras_ext():
    import re as _re
    ext = os.path.join(ROOT, "extensions", "mihrab-nebras")
    if not os.path.isdir(ext):
        return  # لا امتداد نِبراس في هذا الفرع — تخطٍّ
    pkg = json.load(open(os.path.join(ext, "package.json"), encoding="utf-8"))
    contrib = pkg.get("contributes", {})

    # (١) نقطة الدخول main موجودة وتصدّر activate.
    main_rel = pkg.get("main")
    assert main_rel, "لا حقل main في امتداد نِبراس"
    main_path = os.path.join(ext, *main_rel.lstrip("./").split("/"))
    assert os.path.isfile(main_path), f"ملفّ main مفقود: {main_rel}"
    ext_js = _read(main_path)
    assert "module.exports" in ext_js and "function activate" in ext_js, \
        "نقطة دخول نِبراس لا تصدّر activate"

    # (٢) صحّة نحو JS لملفّات الامتداد إن توفّر node.
    js_files = ["extension.js", "agent.js", "fix-diagnostic.js", "explain-selection.js",
                "chat.js", "inline-completion.js", "nebras-process.js", "rpc-client.js"]
    node = shutil.which("node")
    for jf in js_files:
        jp = os.path.join(ext, jf)
        if node and os.path.isfile(jp):
            r = subprocess.run([node, "--check", jp], capture_output=True, text=True)
            assert r.returncode == 0, f"خطأ نحويّ في {jf}:\n{r.stderr.strip()}"

    # (٣) كلّ أمر معلَن مُسجَّل — التسجيل **موزّع** عبر extension.js ووحدات الميزات (مثل fix-diagnostic.js
    #     عبر registerFixDiagnostic)، فنجمع registerCommand من كلّ ملفّات JS (مع حلّ الثوابت المسمّاة).
    manifest_cmds = {c.get("command") for c in contrib.get("commands", [])}
    assert manifest_cmds, "لا أوامر معلَنة في امتداد نِبراس"
    js_cmds = set()
    for jf in js_files:
        jp = os.path.join(ext, jf)
        if not os.path.isfile(jp):
            continue
        js = _read(jp)
        const_str = dict(_re.findall(r'const\s+([A-Za-z_$][\w$]*)\s*=\s*"([^"]+)"', js))
        for arg in _re.findall(r"registerCommand\(\s*([^,]+?)\s*,", js):
            arg = arg.strip()
            lit = _re.fullmatch(r"""["']([^"']+)["']""", arg)
            if lit:
                js_cmds.add(lit.group(1))
            elif arg in const_str:
                js_cmds.add(const_str[arg])
    missing = manifest_cmds - js_cmds
    assert not missing, f"أوامر معلَنة في مانيفست نِبراس بلا registerCommand في JS: {missing}"
    for c in contrib.get("commands", []):
        assert c.get("title"), f"أمر نِبراس بلا عنوان: {c.get('command')}"

    # (٣.٥) [AR-05] لوحة دردشة نِبراس: عربيّة **مقروءة** لا عربيّة الاتّجاه فقط.
    #   ردّ نِبراس نصٌّ مختلط بطبيعته (شرحٌ عربيّ + أسطر شيفرة لاتينيّة)، واللوحة كلّها RTL.
    #   بلا `unicode-bidi: plaintext` تُصيَّر كلّ أسطر الشيفرة في فقرةٍ RTL واحدة فتقفز أقواسها
    #   وفواصلها المنقوطة إلى الطرف المقابل — شيفرة غير قابلة للنسخ بصريًّا. ومع
    #   ‏`white-space: pre-wrap` يصير كلّ سطر **فقرة bidi** مستقلّة، فيأخذ اتّجاهه من محتواه.
    chat_path = os.path.join(ext, "chat.js")
    if os.path.isfile(chat_path):
        chat = _read(chat_path)
        assert 'lang="ar"' in chat and 'dir="rtl"' in chat, \
            "لوحة دردشة نِبراس بلا lang=ar/dir=rtl على <html> [AR-05]"
        # نتحقّق من **جسم قاعدة `.msg` نفسها** لا من ورود السلسلة في مكانٍ ما من الورقة:
        # وجودها على `#ctx` وحده كان سيُرضي فحصًا فضفاضًا بينما الفقاعات ما زالت مكسورة
        # (‏أثبتناه باختبار فشل مقصود).
        msg_rule = _re.search(r"\.msg\s*\{([^}]*)\}", chat)
        assert msg_rule, "لا قاعدة CSS للصنف .msg في لوحة نِبراس [AR-05]"
        assert "unicode-bidi: plaintext" in msg_rule.group(1), \
            ("فقاعات دردشة نِبراس (.msg) بلا `unicode-bidi: plaintext` — أسطر الشيفرة داخل "
             "الردّ العربيّ ستُبعثَر محايداتها في فقرة RTL واحدة [AR-05]")
        assert 'dir="auto"' in chat, \
            "صندوق سؤال نِبراس بلا dir=auto — لصقةُ شيفرة لاتينيّة تُفرَض عليها RTL [AR-05]"
        assert "Noto Sans Arabic" in chat, \
            ("مكدّس خطّ لوحة نِبراس بلا وجه عربيّ صريح — نظير [AR-03]: system-ui وحده لا "
             "يضمن محارف عربيّة على لينكس [AR-05]")
        # ملحوظة: فخّ الشاهدة الخلفيّة داخل قالب HTML (تُنهي القالب ⇒ SyntaxError) **مغطّى
        # أصلًا** بفحص الصحّة النحويّة العامّ في هذا الملفّ — تحقّقنا بفشل مقصود — فلا نكرّره.

    # (٤) [SAD-11] «أصلِح بنِبراس» موصول فعلًا: extension.js يستدعي registerFixDiagnostic (وإلّا يبقى
    #     الأمر مُسجَّلًا في وحدة غير مستدعاة ⇒ «command not found» زمن التشغيل رغم خضرة L0).
    # نطابق **النداء** `registerFixDiagnostic(` لا مجرّد الاسم (كي لا يُرضي الحارسَ سطرُ الاستيراد
    # وحده لو حُذف الاستدعاء الفعليّ). [تشديد مراجعة Amelia]
    assert _re.search(r"registerFixDiagnostic\s*\(", ext_js), \
        "extension.js لا يستدعي registerFixDiagnostic(...) — «أصلِح بنِبراس» غير موصول [SAD-11]"
    assert "mihrab.nebras.fixDiagnostic" in manifest_cmds, \
        "أمر mihrab.nebras.fixDiagnostic غير معلَن في مانيفست نِبراس [SAD-11]"

    # (٥) cwd الخادم = جذر مساحة العمل: الخادم يشتقّ workspaceRoot من process.cwd()، فلا بدّ أن يُمرَّر
    #     cwd (من resolveWorkspaceCwd) إلى cp.spawn — وإلّا يرث مجلّد إطلاق المحرّر فتُرفَض ملفّات المشروع
    #     بـ«المسار خارج مجلّد العمل». حذف الوصلة انحدار صامت (لا اختبار وحدة يمسّ خيارات spawn). [تدقيق Amelia]
    proc_js = _read(os.path.join(ext, "nebras-process.js"))
    # cwd يُحسب من resolveWorkspaceCwd (مع توجيهٍ صريح اختياريّ _cwdOverride من retargetRoot قبله في نفس التعبير).
    assert "resolveWorkspaceCwd" in proc_js and _re.search(r"const\s+cwd\s*=[^;\n]*resolveWorkspaceCwd\(", proc_js), \
        "nebras-process.js لا يحسب cwd من resolveWorkspaceCwd — جذر عمل الوكيل سيكون مجلّد إطلاق المحرّر"
    # إعادة توجيه الجذر (ملفّ مفرد/جذر غير أوّل): retargetRoot معرَّفة في المدير ومستهلَكة في تجهيز الوكيل.
    agent_js_src = _read(os.path.join(ext, "agent.js"))
    assert "retargetRoot" in proc_js and _re.search(r"retargetRoot\s*\(", agent_js_src), \
        "إعادة توجيه الجذر غير موصولة (retargetRoot في nebras-process/agent) — الملفّ المفرد/الجذور غير الأولى ستُرفَض"
    # النمط يُلزِم `cwd` **كمفتاح خيار** (يليه , أو : أو }) داخل نداء spawn نفسه (حتى أوّل ;) —
    # لا مجرّد ورود الكلمة (تعليق «// cwd …» داخل النداء كان يُرضي النمط القديم زورًا).
    assert _re.search(r"cp\.spawn\([^;]*?\bcwd\b\s*[,:}]", proc_js), \
        "nebras-process.js لا يمرّر cwd إلى cp.spawn — الوكيل سيرفض ملفّات المشروع «خارج مجلّد العمل»"
    # عند تغيّر مجلّد العمل أثناء الجلسة: إعادة تشغيل كي لا يبقى الخادم بـcwd بائت. [تدقيق Amelia — فجوة (ج)]
    assert "onDidChangeWorkspaceFolders" in ext_js and "restartIfWorkspaceChanged" in ext_js, \
        "extension.js لا يعيد تشغيل نِبراس عند تغيّر مجلّد العمل (onDidChangeWorkspaceFolders/restartIfWorkspaceChanged) — cwd بائت"


@check("معجم عناوين الإعدادات: موصول، بلا مفاتيح مكرّرة، وبلا نصفِ ترجمة")
def _settings_lexicon_sound():
    """يحرس رقعةَ تعريب عناوين لوحة الإعدادات — وأخطرُ ما فيها يقع صامتًا.

    **المفاتيح المكرّرة** هي العطبُ الأوّل: خريطتان تُبنيان من `Object.entries`، فمفتاحٌ
    مكرّرٌ لا يُخطئ وقتَ التشغيل — الأخيرُ يفوز والأوّلُ يختفي. وقع هذا فعلًا (ثمانيةُ
    مفاتيح) ولم يكشفه إلّا التصريفُ بـ‏`tsc` (‏TS1117). لكنّ التصريفَ يجري في بناءٍ
    كاملٍ يستغرق عشراتِ الدقائق، فالحارسُ هنا يزيحه إلى ثانيةٍ واحدة.

    **الوصل** هو العطبُ الثاني، وهو صامتٌ أيضًا: معجمٌ سليمٌ لا يُستدعى = واجهةٌ
    إنجليزيّةٌ وكلُّ الفحوص خضراء.

    **إملاء حرف الجرّ** ثالثًا: «بـالدفع» و«لـالمحرّر» خطأٌ صريحٌ يراه المستخدم في كلّ
    بندٍ تولّده القاعدة، فنمنع كتابةَ التطويل قبل «ال» في القوالب.
    """
    import importlib.util
    import re as _re

    MARKED = "mihrab-settings-lexicon"
    patcher = os.path.join(BUILD, "patch_settings_labels.py")
    if not os.path.isfile(patcher):
        return  # لا رقعة في هذا الفرع — تخطٍّ

    lex_path = os.path.join(ROOT, "patches", "core", "mihrabSettingsLexicon.ts")
    assert os.path.isfile(lex_path), (
        "patches/core/mihrabSettingsLexicon.ts مفقود — الرقعة تستورده ولا تنسخه.")
    lex = _read(lex_path)

    # ── مفاتيح مكرّرة داخل كلّ خريطة على حدة ──
    for map_name in ("PHRASES", "WORDS", "ADJECTIVES"):
        i = lex.find(f"const {map_name} = new Map")
        assert i >= 0, f"{map_name} غير معرَّفة في المعجم."
        j = lex.find("}))", i)
        assert j > i, f"لم أجد نهاية {map_name}."
        keys = _re.findall(r"^\t'([^']+)':", lex[i:j], _re.M)
        dupes = sorted({k for k in keys if keys.count(k) > 1})
        assert not dupes, (
            f"{map_name}: مفاتيح مكرّرة {dupes} — الأخير يفوز صامتًا وقتَ التشغيل "
            f"(‏tsc يرفضها بـTS1117، لكنّ ذلك بعد بناءٍ كامل).")
        assert keys, f"{map_name} فارغة."
        # لا مفتاحَ بحروفٍ كبيرة: البحثُ يجري بـtoLowerCase فمفتاحٌ كبيرٌ ميّتٌ أبدًا.
        upper = [k for k in keys if k != k.lower()]
        assert not upper, (
            f"{map_name}: مفاتيح بحروفٍ كبيرة {upper[:5]} — المطابقة تجري بعد "
            f"toLowerCase فهي شيفرةٌ ميّتة.")

    # ── القيم عربيّة فعلًا (قيمةٌ لاتينيّة = ترجمةٌ منسيّة تمرّ صامتة) ──
    vals = _re.findall(r"^\t'[^']+': '([^']*)',", lex, _re.M)
    assert vals, "لم أستخرج أيّ قيمة من المعجم — تغيّر شكلُ الملفّ؟"
    non_ar = [v for v in vals if not _re.search(r"[؀-ۿ]", v)]
    assert not non_ar, f"قيمٌ بلا حرفٍ عربيّ: {non_ar[:5]}"

    # ── إملاء حرف الجرّ: لا تطويلَ قبل «ال» في أيّ قالب ──
    # محصورٌ في كتلة القواعد وحدها: التوثيقُ أعلاه يقتبس الخطأَ ليشرحه، فبحثٌ في
    # الملفّ كلّه كان سيصطاد شرحَ العطب بدل العطب.
    _ri = lex.find("const RULES")
    _rj = lex.find("\n];", _ri)
    rules_block = lex[_ri:_rj] if _ri >= 0 else ""
    assert rules_block, "لم أجد كتلة RULES في المعجم."
    bad = _re.findall(r"[بل]ـال", rules_block)
    assert not bad, (
        "قالبٌ يكتب «بـال/لـال» — الصواب «بال» و«لل» عبر joinPreposition.")
    assert "function joinPreposition" in lex, (
        "joinPreposition مفقودة — قواعدُ Allow/For ستُنتج «بـالدفع».")

    # ── الوصل: نسخٌ في build.sh، واستدعاءٌ في كتلة الحقن ──
    build_sh = _read(os.path.join(BUILD, "build.sh"))
    assert "patch_settings_labels.py" in build_sh, (
        "build.sh لا ينسخ patch_settings_labels.py إلى شجرة المنبع.")
    bundle = _read(os.path.join(BUILD, "patch_bundle_extensions.py"))
    assert ".mihrab-patch-settings-labels.py ." in bundle, (
        "كتلة الحقن لا **تستدعي** رقعة عناوين الإعدادات — نسخٌ بلا تشغيل: كلّ الفحوص "
        "خضراء وعناوينُ الإعدادات تبقى إنجليزيّة.")

    src = _read(patcher)
    assert "arabizeSettingText" in src and "wordifyKey" in src, (
        "المرقِّع لا يشير إلى wordifyKey/arabizeSettingText — انجرفت الرقعة عن هدفها.")

    # ── المرساة موجودة في المنبع **فعلًا** ──
    # الصيغةُ الأولى من هذا الفحص كانت تقرأ نصَّ المرقِّع وتزعم أنّها تفحص المنبع —
    # فحصٌ يُطمئن ولا يكشف شيئًا (رصدته المراجعة الهندسيّة). هنا نقرأ ملفَّ المنبع
    # نفسَه، فينكشف انجرافُ `wordifyKey` عند ترقية المنبع لا بعد ساعةِ بناءٍ ضائعة.
    upstream = os.path.join(ROOT, ".upstream", "vscode", "src", "vs", "workbench",
                            "contrib", "preferences", "common", "preferences.ts")
    if os.path.isfile(upstream):
        text = _read(upstream)
        if MARKED not in text:
            spec = importlib.util.spec_from_file_location("_mihrab_settings_labels", patcher)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            for _rel, _mark, edits in mod.FILES:
                for old, _new, count in edits:
                    found = text.count(old.replace("\n", "\r\n")) + text.count(old)
                    assert found >= count, (
                        f"مرساةٌ مفقودة من منبع preferences.ts (وُجدت {found}/{count}): "
                        f"{old.splitlines()[0][:80]} — انجرف wordifyKey؟")


# ───────────────────────── المشغّل ─────────────────────────
def main():
    print("═══ L0: فحص ساكن لطبقة الرقعة ═══")
    failed = 0
    for name, fn in _checks:
        try:
            fn()
            print(f"  ✅ {name}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"  ❌ {name}\n       {type(e).__name__}: {e}")
    print(f"─── {len(_checks) - failed}/{len(_checks)} نجحت ───")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
