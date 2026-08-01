#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""فحصٌ بنيويّ لمخرَج موقع محراب.

يمسك الأعطالَ التي **لا تظهر في المتصفّح**: زرًّا يقود إلى صفحةٍ لم تُبنَ، ووسمًا
يبحث عنه جافاسكربت ولا يجده فيموت السلوكُ كلُّه صامتًا، ومسارًا مطلقًا يربط المخرَج
بمضيفٍ بعينه فيكسر المرآة. وكلُّها أعطالٌ تمرّ من مراجعةِ العين لأنّ الصفحة تبدو سليمة.

    python tests/docs/check_site.py          # يبني ثمّ يفحص
    python tests/docs/check_site.py --no-build
"""
import json
import os
import re
import subprocess
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SITE = os.path.join(ROOT, "site")
OUT = os.path.join(SITE, "public")

fails = []


def bad(msg):
    fails.append(msg)


def read(rel):
    with open(os.path.join(OUT, rel), encoding="utf-8") as f:
        return f.read()


def main():
    if "--no-build" not in sys.argv:
        r = subprocess.run([sys.executable, os.path.join(SITE, "build.py")],
                           cwd=ROOT)
        if r.returncode:
            print("❌ فشل بناءُ الموقع.")
            return 1

    with open(os.path.join(SITE, "data", "site.json"), encoding="utf-8") as f:
        data = json.load(f)

    # ── ١) الصفحاتُ الإلزاميّة ──
    required = ["index.html", "download/index.html", "docs/index.html",
                "keyboard/index.html", "start/index.html",
                "search-index.json", "dl/releases.json", ".nojekyll",
                "assets/mihrab-docs.css", "assets/mihrab-home.css",
                "assets/docs.js", "assets/site.js", "assets/fonts.css"]
    for rel in required:
        if not os.path.exists(os.path.join(OUT, rel)):
            bad("ملفٌّ إلزاميّ مفقود في المخرَج: %s" % rel)
    if fails:
        report()
        return 1

    home = read("index.html")
    dl = read("download/index.html")
    kbd = read("keyboard/index.html")

    # ── ٢) مراسي site.js ──
    # كلُّ واحدٍ منها عقدٌ بين المولِّد والسكربت. كسرُه لا يرمي خطأً: الزرُّ يبقى
    # على نصّه المحافظ والجدولُ يبقى فارغًا، والصفحةُ تبدو «قيد الإعداد».
    for sel, page, name in [("data-dl-primary", home, "index.html"),
                            ("data-dl-meta", home, "index.html"),
                            ("data-dl-pick", dl, "download/index.html"),
                            ("data-dl-table", dl, "download/index.html"),
                            ("data-dl-empty", dl, "download/index.html"),
                            ("data-dl-wrap", dl, "download/index.html"),
                            ("data-dl-version", dl, "download/index.html"),
                            ('id="site-platforms"', home, "index.html"),
                            ('id="baked-releases"', home, "index.html"),
                            ('id="site-platforms"', dl, "download/index.html"),
                            ('id="baked-releases"', dl, "download/index.html")]:
        if sel not in page:
            bad("مِرساةٌ مفقودة في %s: %s" % (name, sel))

    # docs.js يخرج مبكّرًا بلا هذا الوسم، فيموت مبدّلُ النظام والترشيحُ والالتقاط.
    if "data-kbd-table" not in kbd:
        bad("keyboard/index.html بلا data-kbd-table — سلوكُ صفحة الاختصارات ميّتٌ صامتًا.")

    # ── ٣) جزيرةُ البيانات تُحلَّل فعلًا ──
    for name, page in (("index.html", home), ("download/index.html", dl)):
        for isle in ("site-platforms", "baked-releases"):
            m = re.search(r'id="%s">(.*?)</script>' % isle, page, re.S)
            if not m:
                continue
            try:
                json.loads(m.group(1).replace("<\\/", "</"))
            except ValueError as e:
                bad("جزيرةُ بياناتٍ غيرُ صالحة (%s في %s): %s" % (isle, name, e))

    # ── ٤) لا مساراتٍ مطلقةً إلى مضيفٍ بعينه ──
    # المخرَجُ نفسُه يُخدَم من sad-lang.org/mihrab/ ومن sadlang.github.io/mihrab-ide/.
    # رابطُ تنقّلٍ مطلقٌ واحدٌ إلى أحدهما يربط المرآةَ بالأصل ويرسل زوّارَها بعيدًا.
    #
    # ‏`<link rel=canonical>` مستثنًى: هو **يجب** أن يكون مطلقًا ويشير إلى الأصل —
    # وهذا بالضبط ما يمنع محرّكات البحث من معاملة المرآة كمحتوًى مكرّر.
    NAV = re.compile(r'<a\b[^>]*\bhref="([^"]+)"|<(?:img|script)\b[^>]*\bsrc="([^"]+)"')
    for rel in ("index.html", "download/index.html", "docs/index.html",
                "keyboard/index.html"):
        page = read(rel)
        for m in NAV.finditer(page):
            url = m.group(1) or m.group(2)
            for host in ("sadlang.github.io", "sad-lang.org/mihrab"):
                if host in url:
                    bad("رابطٌ مطلقٌ إلى مضيفٍ بعينه في %s: %s" % (rel, url))

    # ── ٥) كلُّ منصّةٍ في المانيفست معروفةٌ في site.json ──
    ids = {p["id"] for p in data["platforms"]}
    with open(os.path.join(SITE, "data", "releases.json"), encoding="utf-8") as f:
        rel_data = json.load(f)
    for a in rel_data.get("assets", []):
        if a.get("id") not in ids:
            bad("أصلٌ بمعرّفِ منصّةٍ مجهول في releases.json: %r" % a.get("id"))
        for k in ("file", "size", "sha256"):
            if not a.get(k):
                bad("أصل %r بلا %s — الصفحةُ ستعرض صفًّا ناقصًا." % (a.get("id"), k))
    if rel_data.get("assets") and not rel_data.get("version"):
        bad("releases.json فيه أصولٌ بلا `version` — الصفحةُ ستُخفيها كلَّها.")

    # ── ٦) روابطُ الهويّة تطابق ما يُبنى فعلًا ──
    # عطبٌ سبق أن أُبلغ عنه من هذا الصنف: مفتاحٌ في product.json يشير إلى صفحةٍ
    # لا وجودَ لها، فيقود «مساعدة ← التوثيق» إلى 404.
    with open(os.path.join(ROOT, "product-overrides", "product.json"),
              encoding="utf-8") as f:
        prod = json.load(f)
    canon = data["canonical"].rstrip("/") + "/"
    for key in ("documentationUrl", "downloadUrl", "keyboardShortcutsUrlWin",
                "keyboardShortcutsUrlLinux", "keyboardShortcutsUrlMac"):
        url = prod.get(key)
        if not url:
            continue
        if not url.startswith(canon):
            bad("product.json:%s لا يشير إلى %s — %s" % (key, canon, url))
            continue
        path = url[len(canon):].strip("/")
        target = os.path.join(OUT, path, "index.html") if path else os.path.join(OUT, "index.html")
        if not os.path.isfile(target):
            bad("product.json:%s يشير إلى صفحةٍ لا تُبنى: %s" % (key, url))

    report()
    return 1 if fails else 0


def report():
    if fails:
        print("❌ %d عطبٌ بنيويّ:" % len(fails))
        for f in fails:
            print("   · %s" % f)
    else:
        print("✅ الموقعُ سليمٌ بنيويًّا: الصفحات، والمراسي، والمانيفست، وروابطُ الهويّة.")


if __name__ == "__main__":
    sys.exit(main())
