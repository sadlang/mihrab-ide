#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""تحديث لقطة المنبع النظيفة (fixture لـL1 في CI بلا منبع محضَّر).

ينسخ **الملفّات النظيفة** التي تمسّها الرُقَع من .upstream/vscode عند HEAD إلى
tests/apply/snapshot/ (بنفس البنية النسبيّة). الغرض: تمكين check_anchors.py من العمل في
CI (على GitHub) دون تحضير VSCode كامل.

**متى تُشغَّل:** عند ترقية upstream.json (م5 مزامنة) — بعدها راجع فرق اللقطة (يُظهر ما تغيّر
في المنبع) وأصلح أيّ مرقِّع انجرفت مراسيه، ثمّ التزم اللقطة المحدَّثة مع ترقية المنبع.

الاستعمال: python tests/apply/refresh_snapshot.py   (يتطلّب .upstream/vscode محضَّرًا)
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
BUILD = os.path.join(ROOT, "build")
UPSTREAM_VSCODE = os.path.join(ROOT, ".upstream", "vscode")
SNAPSHOT = os.path.join(HERE, "snapshot")
sys.path.insert(0, os.path.dirname(HERE))
import patch_manifest as M  # noqa: E402


def all_target_files():
    files = set()
    for name, mode, targets in M.PATCHERS:
        if mode == "root":
            files.update(M.editor_target_files(BUILD))
        else:
            files.update(targets)
    return sorted(files)


def main():
    if not os.path.isdir(os.path.join(UPSTREAM_VSCODE, ".git")):
        print("❌ لا .upstream/vscode (مستودع git). شغّل build/prepare أوّلًا.", file=sys.stderr)
        return 1
    os.makedirs(SNAPSHOT, exist_ok=True)
    written = 0
    for rel in all_target_files():
        r = subprocess.run(["git", "-C", UPSTREAM_VSCODE, "show", f"HEAD:{rel}"],
                           capture_output=True)
        if r.returncode != 0:
            print(f"⚠️ تعذّر جلب {rel}: {r.stderr.decode('utf-8', 'replace')[:120]}", file=sys.stderr)
            continue
        dst = os.path.join(SNAPSHOT, rel.replace("/", os.sep))
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, "wb") as f:
            f.write(r.stdout)
        written += 1
        print(f"  ✎ {rel}")
    # وسم الإصدار المصاحب للقطة
    up = os.path.join(ROOT, "upstream.json")
    tag = "?"
    if os.path.isfile(up):
        import json
        tag = json.load(open(up, encoding="utf-8")).get("vscodium", {}).get("tag", "?")
    with open(os.path.join(SNAPSHOT, "SNAPSHOT_TAG.txt"), "w", encoding="utf-8") as f:
        f.write(f"vscodium tag: {tag}\nfiles: {written}\n")
    print(f"✅ لقطة محدَّثة: {written} ملفّ (منبع {tag}) في tests/apply/snapshot/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
