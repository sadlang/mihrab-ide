#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""فحصُ انجراف الترجمة — المكافئُ الحرفيّ لطبقة L1 في رُقَع النواة.

هنا تموت ترجماتُ التوثيق عادةً: تُترجَم مرّةً، ثمّ يتغيّر المنبع، فتبقى الترجمةُ
**تكذب بثقة** — وهي حينئذٍ أسوأُ من غيابها، لأنّ القارئ يثق بها ولا يتحقّق.

فلكلّ صفحةٍ مترجَمة `source_path` و`source_sha`: بصمةُ ملفّ المنبع وقتَ الترجمة.
وهذا الفحصُ يقارنها بالبصمة الحاليّة في `microsoft/vscode-docs` فيرفع رايةً على كلّ
صفحةٍ تحرّك أصلُها — تحويلُ انجرافٍ صامتٍ يُكتشَف بعد شهور إلى أحمرَ فوريّ.

    python tests/docs/check_drift.py           فحص (يحتاج شبكة)
    python tests/docs/check_drift.py --seed    يكتب البصمةَ الحاليّة في الصفحات الخالية منها
    python tests/docs/check_drift.py --offline يتحقّق من اكتمال البيانات الوصفيّة فقط

الخرج: 0 = لا انجراف، 1 = بياناتٌ ناقصة أو انجراف.
"""
import json
import os
import re
import subprocess
import sys
import urllib.request

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CONTENT = os.path.join(ROOT, "site", "content")
REPO = "microsoft/vscode-docs"
API = "https://api.github.com/repos/%s/contents/%%s?ref=main" % REPO


def read_front_matter(path):
    raw = open(path, encoding="utf-8").read()
    if not raw.startswith("---\n"):
        return None, raw
    end = raw.find("\n---\n", 4)
    if end == -1:
        return None, raw
    meta = {}
    for ln in raw[4:end].split("\n"):
        if ":" in ln:
            k, v = ln.split(":", 1)
            meta[k.strip()] = v.strip().strip('"')
    return meta, raw


def write_sha(path, sha):
    raw = open(path, encoding="utf-8").read()
    new = re.sub(r'^source_sha:.*$', 'source_sha: "%s"' % sha, raw, count=1, flags=re.M)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(new)


def remote_sha(source_path):
    """بصمةُ blob لملفّ المنبع. يُفضَّل `gh` (يحمل الاعتماد ويرفع سقفَ الطلبات)."""
    try:
        out = subprocess.run(
            ["gh", "api", "repos/%s/contents/%s" % (REPO, source_path), "--jq", ".sha"],
            capture_output=True, text=True, timeout=30)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        pass
    req = urllib.request.Request(API % source_path, headers={"User-Agent": "mihrab-docs"})
    tok = os.environ.get("GITHUB_TOKEN")
    if tok:
        req.add_header("Authorization", "Bearer " + tok)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["sha"]


def main():
    seed = "--seed" in sys.argv
    offline = "--offline" in sys.argv
    if not os.path.isdir(CONTENT):
        print("لا مجلّد محتوى: %s" % CONTENT)
        return 1

    missing, drifted, ok, unknown = [], [], 0, []
    for fn in sorted(os.listdir(CONTENT)):
        if not fn.endswith(".md"):
            continue
        path = os.path.join(CONTENT, fn)
        meta, _raw = read_front_matter(path)
        if meta is None or not meta.get("source_path"):
            missing.append((fn, "لا source_path — كلُّ صفحةٍ مترجَمة تُنسَب إلى أصلها (شرطُ CC BY)"))
            continue
        if "source_sha" not in meta:
            missing.append((fn, "لا حقل source_sha في الترويسة"))
            continue
        if offline:
            if not meta["source_sha"]:
                missing.append((fn, "source_sha فارغ — شغّل --seed"))
            else:
                ok += 1
            continue
        try:
            cur = remote_sha(meta["source_path"])
        except Exception as e:  # شبكةٌ محجوبة أو مسارٌ خاطئ — لا نُخضِّر بالصمت
            unknown.append((fn, str(e)[:90]))
            continue
        if not meta["source_sha"]:
            if seed:
                write_sha(path, cur)
                print("  🌱 %s ← %s" % (fn, cur[:10]))
                ok += 1
            else:
                missing.append((fn, "source_sha فارغ — شغّل --seed"))
        elif meta["source_sha"] != cur:
            drifted.append((fn, meta["source_path"]))
        else:
            ok += 1

    print("═══ انجراف الترجمة ═══")
    for fn, why in missing:
        print("  ❌ %s — %s" % (fn, why))
    for fn, src in drifted:
        print("  ⚠️  %s — تحرّك أصلُه: %s" % (fn, src))
    for fn, why in unknown:
        print("  ⏭️  %s — تعذّر التحقّق: %s" % (fn, why))
    print("─── %d مواكِبة، %d منجرفة، %d ناقصة، %d غير محقَّقة ───"
          % (ok, len(drifted), len(missing), len(unknown)))

    # الانجرافُ يحجب: صفحةٌ منجرفة تكذب على القارئ، فتُراجَع أو تُوسَم `drift: major`.
    return 1 if (missing or drifted) else 0


if __name__ == "__main__":
    sys.exit(main())
