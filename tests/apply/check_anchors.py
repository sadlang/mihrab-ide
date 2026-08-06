#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""L1 — فحص تطبيق مراسي الرُقَع على المنبع المثبَّت (1–2 د، بلا بناء).

**أعلى مردود**: يحوّل «فشل بناء صامت بعد 20 د» إلى «أحمر فوريّ». لكلّ مرقِّع RTL/لغة:
يجهّز نسخة **نظيفة** من ملفّات المنبع التي يمسّها في مجلّد مؤقّت، يشغّل المرقِّع الفعليّ
(كود الإنتاج) عليها، ويتحقّق أنّه: (أ) طبَّق فعلًا (المحتوى تغيّر والوسم حُقن)، (ب) نجح
(خرج 0 — مراسيه طابقت بعددها المتوقَّع)، (ج) idempotent (إعادة التشغيل لا تغيّر شيئًا).

مصدر النظيف (بالأولويّة):
  1) .upstream/vscode (مستودع git، HEAD = نظيف المنبع المثبَّت) — الأوثق والأحدث.
  2) tests/apply/snapshot/ — لقطة مُلتزَمة (لـCI بلا منبع محضَّر). حدّثها بـrefresh_snapshot.py.
إن غاب الاثنان: تخطٍّ برسالة واضحة (خرج 0، غير حاجب) — CI بلا منبع.

**حدّ معروف (كلّ الرُقَع):** HEAD = VSCode النقيّ من مايكروسوفت، بينما البناء الفعليّ يرقّع
شجرة عمل VSCodium (تُطبَّق تعديلات VSCodium غير المُلتزَمة أثناء prepare). لملفّات يعدّلها
VSCodium بكثافة (مثل gettingStarted.ts — يضيف «الإعلانات») تبقى مراسينا الحاليّة متطابقة في
HEAD وشجرة العمل، لكنّ L1 الأخضر لا يبرهن صمود المرساة على الهدف المُعدَّل مستقبلًا ⇒ إن غيّرت
نسخة VSCodium كتلةً مرقَّعة، ينكسر البناء رغم L1 أخضر. التخفيف: L2 (مِجَسّ الحزمة المبنيّة)
وL3 (الوقتيّ) يمسكان الانكسار الفعليّ بعد البناء.

الاستعمال: python tests/apply/check_anchors.py   (خرج 0 = نجاح/تخطٍّ، 1 = انجراف مرساة)
"""
import os
import shutil
import subprocess
import sys
import tempfile

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
BUILD = os.path.join(ROOT, "build")
UPSTREAM_VSCODE = os.path.join(ROOT, ".upstream", "vscode")
SNAPSHOT = os.path.join(HERE, "snapshot")
sys.path.insert(0, os.path.dirname(HERE))
import patch_manifest as M  # noqa: E402


def _git_show(relpath):
    """محتوى ملفّ نظيف من .upstream/vscode عند HEAD، أو None إن تعذّر."""
    try:
        out = subprocess.run(
            ["git", "-C", UPSTREAM_VSCODE, "show", f"HEAD:{relpath}"],
            capture_output=True, check=True)
        return out.stdout.decode("utf-8", errors="replace")
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def _force_snapshot():
    return os.environ.get("MIHRAB_L1_SOURCE", "").strip().lower() == "snapshot"


def _pristine_source(relpath):
    """أعِد محتوى الملفّ النظيف من المصدر المتاح (upstream ثمّ snapshot)، أو None.

    MIHRAB_L1_SOURCE=snapshot يُجبِر اللقطة المُلتزَمة (لـCI أو تجاهُل منبع محلّيّ قديم)."""
    if not _force_snapshot() and os.path.isdir(os.path.join(UPSTREAM_VSCODE, ".git")):
        c = _git_show(relpath)
        if c is not None:
            return c, "upstream"
    snap = os.path.join(SNAPSHOT, relpath)
    if os.path.isfile(snap):
        with open(snap, "r", encoding="utf-8", newline="") as f:
            return f.read(), "snapshot"
    return None, None


def _targets_for(name, mode):
    if mode == "root":
        return M.root_target_files(BUILD, name)
    for pname, _m, targets in M.PATCHERS:
        if pname == name:
            return targets
    return []


def _run(patcher, arg):
    r = subprocess.run([sys.executable, os.path.join(BUILD, patcher), arg],
                       capture_output=True)
    return r.returncode, (r.stdout + r.stderr).decode("utf-8", errors="replace")


def check_patcher(name, mode):
    """يعيد (ok:bool, رسالة)."""
    targets = _targets_for(name, mode)
    tmp = tempfile.mkdtemp(prefix="mihrab_l1_")
    try:
        # جهّز الملفّات النظيفة في البنية النسبيّة
        srcs = {}
        for rel in targets:
            content, origin = _pristine_source(rel)
            if content is None:
                return None, f"لا مصدر نظيف لـ{rel} (تخطٍّ)"
            dst = os.path.join(tmp, rel.replace("/", os.sep))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, "w", encoding="utf-8", newline="") as f:
                f.write(content)
            srcs[rel] = (dst, content, origin)

        arg = tmp if mode == "root" else srcs[targets[0]][0]

        rc1, out1 = _run(name, arg)
        if rc1 != 0:
            return False, f"خرج غير صفريّ ({rc1}) — انجراف مرساة؟\n       {out1.strip()[:400]}"
        # تحصين: بعض المرقِّعات متعدّدة المراسي قد تتخطّى مرساةً منجرفة بتحذير وتخرج 0
        # (تطبيق جزئيّ). أيّ تحذير ⇒ فشل (نمنع النجاح الكاذب للتطبيق الجزئيّ).
        if "⚠️" in out1 or "لم تُعثَر" in out1 or "غير متوقَّع" in out1:
            return False, f"تحذير مرساة رغم خرج 0 (تطبيق جزئيّ؟)\n       {out1.strip()[:400]}"

        # (أ) طبَّق فعلًا: محتوى ملفّ واحد على الأقلّ تغيّر
        changed = []
        after = {}
        for rel, (dst, before, _o) in srcs.items():
            with open(dst, "r", encoding="utf-8", newline="") as f:
                a = f.read()
            after[rel] = a
            if a != before:
                changed.append(rel)
        if not changed:
            return False, "لم يتغيّر أيّ ملفّ (المرقِّع لم يطبِّق — مرساة مفقودة صامتًا؟)"

        # (ج) idempotent: إعادة التشغيل تنجح ولا تغيّر شيئًا
        rc2, out2 = _run(name, arg)
        if rc2 != 0:
            return False, f"إعادة التشغيل فشلت ({rc2}) — ليس idempotent\n       {out2.strip()[:300]}"
        for rel, (dst, _b, _o) in srcs.items():
            with open(dst, "r", encoding="utf-8", newline="") as f:
                a2 = f.read()
            if a2 != after[rel]:
                return False, f"إعادة التشغيل غيّرت {rel} (تطبيق مزدوج — ليس idempotent)"

        origin = next(iter(srcs.values()))[2]
        return True, f"طبَّق {len(changed)} ملفّ، idempotent [{origin}]"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def check_core_diff(diff_rel):
    """رُقعةُ منبعٍ (diff): تُطبَّق نظيفةً على المنبع المثبَّت؟ يعيد (ok, رسالة).

    لا مراسيَ هنا تُفحَص فرديًّا — الفحصُ أقوى: نجهّز الملفّات النظيفة التي يمسّها الـdiff
    في مجلّد مؤقّت ونشغّل `git apply --check` عليه. أيّ انجرافٍ في المنبع يظهر فورًا،
    وبنفس الأداة التي يستعملها البناء (patch_bundle_extensions ⇐ `git apply --3way`).
    """
    targets = M.core_diff_files(ROOT, diff_rel, existing_only=True)
    if not targets:
        return False, "رُقعةٌ بلا ملفّات (شكلٌ غير متوقَّع)"
    tmp = tempfile.mkdtemp(prefix="mihrab_l1_diff_")
    try:
        origin = None
        for rel in targets:
            content, org = _pristine_source(rel)
            if content is None:
                return None, f"لا مصدر نظيف لـ{rel} (تخطٍّ)"
            origin = origin or org
            dst = os.path.join(tmp, rel.replace("/", os.sep))
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, "w", encoding="utf-8", newline="") as f:
                f.write(content)
        patch = os.path.join(ROOT, diff_rel.replace("/", os.sep))
        r = subprocess.run(["git", "apply", "--check", "--verbose", patch],
                           cwd=tmp, capture_output=True)
        if r.returncode != 0:
            err = (r.stdout + r.stderr).decode("utf-8", errors="replace").strip()[:500]
            return False, f"لا تُطبَّق على المنبع المثبَّت (انجراف):{chr(10)}       {err}"
        return True, f"تُطبَّق نظيفةً على {len(targets)} ملفًّا [{origin}]"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    print("═══ L1: تطبيق مراسي الرُقَع على المنبع المثبَّت ═══")
    have_upstream = os.path.isdir(os.path.join(UPSTREAM_VSCODE, ".git")) and not _force_snapshot()
    have_snapshot = os.path.isdir(SNAPSHOT)
    if not have_upstream and not have_snapshot:
        print("  ⏭️  لا .upstream/vscode ولا لقطة — تخطٍّ (شغّل build/prepare أو refresh_snapshot.py).")
        return 0
    print(f"  المصدر: {'upstream (git HEAD)' if have_upstream else 'snapshot مُلتزَمة'}")
    failed = skipped = 0
    for name, mode, _targets in M.PATCHERS:
        ok, msg = check_patcher(name, mode)
        if ok is None:
            skipped += 1
            print(f"  ⏭️  {name}: {msg}")
        elif ok:
            print(f"  ✅ {name}: {msg}")
        else:
            failed += 1
            print(f"  ❌ {name}: {msg}")
    for diff in getattr(M, "CORE_DIFFS", []):
        ok, msg = check_core_diff(diff)
        name = os.path.basename(diff)
        if ok is None:
            skipped += 1
            print(f"  ⏭️  {name}: {msg}")
        elif ok:
            print(f"  ✅ {name}: {msg}")
        else:
            failed += 1
            print(f"  ❌ {name}: {msg}")
    total = len(M.PATCHERS) + len(getattr(M, "CORE_DIFFS", []))
    print(f"─── {total - failed - skipped}/{total} نجحت، {skipped} تخطٍّ، {failed} فشل ───")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
