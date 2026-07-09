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
IDENTITY_CLASSES = ("mihrab-welcome-mark",)
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


# ───────────── L0-5: مانيفست حزمة اللغة ↔ الملفّات (فحص Amelia مؤتمَتًا) ─────────────
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
        assert td.get("type") in ("dark", "light"), f"type غير صالح في {t['path']}"
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
    assert "resolveSadRun" in js, "لا دالّة resolveSadRun (حلّ الثنائيّ المدمج) في نقطة الدخول"
    assert _re.search(r"ProcessExecution\(\s*sadRunCmd", js), \
        "ProcessExecution لا يستعمل المسار المحلول sadRunCmd — قد يتجاهل الثنائيّ المدمج"
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
    assert _re.search(r'BUNDLED_BIN_DIR\s*=\s*"bin"', js), \
        "ثابت BUNDLED_BIN_DIR ليس \"bin\" — قد يفترق عن مسار الحقن في build.sh"
    build_sh = _read(os.path.join(ROOT, "build", "build.sh"))
    assert "WELCOME_BIN" in build_sh and "sad-run.exe" in build_sh, \
        "build.sh لا يحوي كتلة حزم sad-run المدمجة (WELCOME_BIN/sad-run.exe)"
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
        # activationEvents يجب أن يفعّل الامتداد عند فتح الجولة (وإلّا لن تعمل روابط الأوامر).
        assert f"onWalkthrough:{w['id']}" in pkg.get("activationEvents", []), \
            f"activationEvents لا يفعّل الامتداد عند فتح الجولة {w['id']}"
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
        for n in ("chat.js", "agent.js", "explain-selection.js", "inline-completion.js")
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
