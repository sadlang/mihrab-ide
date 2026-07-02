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
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))  # جذر mihrab-ide
BUILD = os.path.join(ROOT, "build")
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
            assert '[dir="rtl"]' in part, (
                f"جزء محدّد غير مقصور على RTL (تسرّب عالميّ): «{part[:60]}» ضمن «{sel[:40]}…»")


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
