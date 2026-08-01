#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""مولِّدُ موقع توثيق محراب العربيّ → GitHub Pages.

لماذا مولِّدٌ لنا لا قالبٌ جاهز (Docsy/Just-the-Docs/Docusaurus)؟ قرارُ سالي، وسببُه
أنّ دعمَ RTL في تلك القوالب طبقةُ `[dir=rtl]` مضافةٌ لاحقًا: تغطّي التخطيطَ ولا تغطّي
الحالاتِ الحدّيّة — عزلَ bidi، واتّجاهَ الدرج، وتخطيطَ الطباعة. وترقيعُها أطولُ من
كتابةِ ما نملك، وتفرض هويّةً بصريّة تناقض ذهبَ محرابٍ ونقشَه.

الاستعمال:  python site/build.py            → site/public/
            python site/build.py --check    → لا كتابة؛ يتحقّق من السلامة فقط
"""
import html
import json
import os
import re
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
CONTENT = os.path.join(HERE, "content")
ASSETS = os.path.join(HERE, "assets")
DATA = os.path.join(HERE, "data")
OUT = os.path.join(HERE, "public")

SITE_URL = "https://sadlang.github.io/mihrab-ide"
UPSTREAM_DOCS = "https://github.com/microsoft/vscode-docs/blob/main/"

# التنقّل: ثلاثةُ أقسامٍ عليا فقط. أكثرُ من ثلاثةٍ يُجبر المستخدمَ على قرارٍ قبل أن
# يعرف ما يريد. والتسميةُ أفعالُ أمرٍ لا أسماءَ مجرّدة: الفعلُ يخاطب القارئ،
# والاسمُ يصف رفًّا في مكتبة.
NAV = [
    ("ابدأ", [
        ("start", "البدء في دقيقة"),
        ("interface", "جولة في الواجهة"),
        ("folders", "فتح مجلّد ومشروع"),
    ]),
    ("اكتب", [
        ("editing", "أساسيّات المحرّر"),
        ("keyboard", "اختصارات لوحة المفاتيح"),
        ("search", "البحث والاستبدال"),
        ("intellisense", "الإكمال والتلميحات"),
        ("terminal", "الطرفيّة المدمجة"),
    ]),
    ("اضبط ووسّع", [
        ("settings", "الإعدادات"),
        ("themes", "السمات والمظهر"),
        ("git", "Git ومصادر التحكّم"),
        ("debug", "التنقيح"),
        ("extensions", "الامتدادات"),
    ]),
]

SLUG_SECTION = {slug: sec for sec, items in NAV for slug, _t in items}
SLUG_TITLE = {slug: t for _s, items in NAV for slug, t in items}


# ═════════════════════ Markdown — مجموعةٌ فرعيّة مضبوطة ═════════════════════
# لا نستورد مكتبةً: المحتوى ملكُنا وقواعدُه مغلقة، ومولِّدٌ بلا اعتماديّات يعمل في
# أيّ CI بلا تثبيت. وكلُّ ما لا تدعمه هذه الدالّة يُرفَض صراحةً لا يُتجاهَل صامتًا.

_INLINE_CODE = re.compile(r"`([^`]+)`")
_LINK = re.compile(r"\[([^\]]+)\]\(([^)]+)\)")
_BOLD = re.compile(r"\*\*([^*]+)\*\*")
_KBD = re.compile(r"\{\{([^}]+)\}\}")  # {{Ctrl+Shift+P}} → اختصارٌ معزول


def _chord_html(chord):
    """يبني حاويةَ اختصارٍ معزولةً اتّجاهيًّا.

    المفاتيحُ لا تُترجَم: `Ctrl` يبقى `Ctrl` لا «تحكّم» — فالمكتوبُ على لوحة
    المستخدم لاتينيّ، وترجمتُه تفصل التوثيقَ عن الجهاز.
    """
    parts = [p.strip() for p in chord.split("+") if p.strip()]
    out = []
    for i, p in enumerate(parts):
        if i:
            out.append('<span class="plus">+</span>')
        out.append('<kbd class="chord" dir="ltr">%s</kbd>' % html.escape(p))
    return '<span class="keys">%s</span>' % "".join(out)


def inline(text):
    """يحوّل التعليم السطريّ. ترتيبُ العمليّات مقصود: الكودُ أوّلًا كي لا يُفسَّر ما بداخله."""
    slots = []

    def stash(markup):
        slots.append(markup)
        return "\x00%d\x00" % (len(slots) - 1)

    text = _INLINE_CODE.sub(lambda m: stash("<code>%s</code>" % html.escape(m.group(1))), text)
    text = _KBD.sub(lambda m: stash(_chord_html(m.group(1))), text)
    text = html.escape(text)
    text = _BOLD.sub(r"<b>\1</b>", text)
    text = _LINK.sub(lambda m: '<a href="%s">%s</a>' % (m.group(2), m.group(1)), text)
    return re.sub(r"\x00(\d+)\x00", lambda m: slots[int(m.group(1))], text)


def render_md(src, path_hint):
    """Markdown → (html, headings) — headings تُستعمل لبناء الفهرس الجانبيّ."""
    lines = src.split("\n")
    out, headings = [], []
    i, n = 0, len(lines)
    seen_ids = set()

    def heading_id(txt):
        base = re.sub(r"[^\w؀-ۿ]+", "-", txt).strip("-") or "قسم"
        hid, k = base, 2
        while hid in seen_ids:
            hid, k = "%s-%d" % (base, k), k + 1
        seen_ids.add(hid)
        return hid

    while i < n:
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # كتلةُ كود
        if stripped.startswith("```"):
            lang = stripped[3:].strip()
            body, i = [], i + 1
            while i < n and not lines[i].strip().startswith("```"):
                body.append(lines[i])
                i += 1
            i += 1
            cls = ' class="lang-%s"' % html.escape(lang) if lang else ""
            out.append("<pre><code%s>%s</code></pre>" % (cls, html.escape("\n".join(body))))
            continue

        # عنوان
        m = re.match(r"^(#{2,3})\s+(.+)$", stripped)
        if m:
            lvl, txt = len(m.group(1)), m.group(2).strip()
            hid = heading_id(txt)
            headings.append((lvl, hid, txt))
            out.append('<h%d id="%s">%s</h%d>' % (lvl, hid, inline(txt), lvl))
            i += 1
            continue

        if stripped.startswith("# "):
            raise SystemExit(
                "%s: عنوانُ h1 يأتي من `title` في الترويسة لا من المتن." % path_hint)

        # جدول
        if stripped.startswith("|"):
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            if len(rows) >= 2 and set("".join(rows[1])) <= set("-: "):
                head, body = rows[0], rows[2:]
            else:
                head, body = None, rows
            t = ['<div class="table-wrap"><table>']
            if head:
                t.append("<thead><tr>%s</tr></thead>"
                         % "".join("<th>%s</th>" % inline(c) for c in head))
            t.append("<tbody>")
            for r in body:
                t.append("<tr>%s</tr>" % "".join("<td>%s</td>" % inline(c) for c in r))
            t.append("</tbody></table></div>")
            out.append("".join(t))
            continue

        # قائمة
        if re.match(r"^([-*]|\d+\.)\s+", stripped):
            ordered = bool(re.match(r"^\d+\.\s", stripped))
            items = []
            while i < n and re.match(r"^([-*]|\d+\.)\s+", lines[i].strip()):
                items.append(re.sub(r"^([-*]|\d+\.)\s+", "", lines[i].strip()))
                i += 1
            tag = "ol" if ordered else "ul"
            out.append("<%s>%s</%s>" % (tag, "".join("<li>%s</li>" % inline(x) for x in items), tag))
            continue

        # فقرة
        para = []
        while i < n and lines[i].strip() and not re.match(
                r"^(#{1,3}\s|```|\||[-*]\s|\d+\.\s)", lines[i].strip()):
            para.append(lines[i].strip())
            i += 1
        out.append("<p>%s</p>" % inline(" ".join(para)))

    return "\n".join(out), headings


# ═════════════════════ الترويسة (front-matter) ═════════════════════
def parse_front_matter(raw, path_hint):
    if not raw.startswith("---\n"):
        raise SystemExit("%s: لا ترويسةَ front-matter." % path_hint)
    end = raw.find("\n---\n", 4)
    if end == -1:
        raise SystemExit("%s: ترويسةٌ غير مغلقة." % path_hint)
    meta = {}
    for ln in raw[4:end].split("\n"):
        if not ln.strip() or ln.lstrip().startswith("#"):
            continue
        if ":" not in ln:
            raise SystemExit("%s: سطرُ ترويسةٍ بلا نقطتين: %s" % (path_hint, ln))
        k, v = ln.split(":", 1)
        meta[k.strip()] = v.strip().strip('"')
    return meta, raw[end + 5:]


# ═════════════════════ القوالب ═════════════════════
MARK_SVG = (
    '<svg class="%s" viewBox="0 0 24 32" fill="none" aria-hidden="true">'
    '<path d="M2 31V14C2 7.4 6.5 2 12 2s10 5.4 10 12v17" stroke="currentColor" '
    'stroke-width="2.2" stroke-linecap="round"/>'
    '<path d="M7 31V15c0-3.4 2.2-6 5-6s5 2.6 5 6v16" stroke="currentColor" '
    'stroke-width="1.4" opacity=".55" stroke-linecap="round"/></svg>'
)


def nav_html(active, base):
    parts = []
    for section, items in NAV:
        parts.append("<h2>%s</h2><ul>" % html.escape(section))
        for slug, title in items:
            cur = ' aria-current="page"' if slug == active else ""
            parts.append('<li><a href="%s/%s/"%s>%s</a></li>'
                         % (base, slug, cur, html.escape(title)))
        parts.append("</ul>")
    return "".join(parts)


def toc_html(headings):
    if len(headings) < 2:
        return ""
    items = "".join(
        '<li class="lvl-%d"><a href="#%s">%s</a></li>' % (lvl, hid, html.escape(txt))
        for lvl, hid, txt in headings)
    return ('<nav class="site-toc" aria-label="في هذه الصفحة">'
            '<div class="toc-title">في هذه الصفحة</div><ul>%s</ul></nav>' % items)


def src_note_html(meta):
    """تذييلُ النسبة — شرطُ رخصة CC BY، ودليلُ صدقٍ في آنٍ واحد.

    ولا ذكرَ لعلامةِ مايكروسوفت كتسميةٍ للمنتج: الترخيصُ يُجيز النصَّ لا العلامة.
    """
    if not meta.get("source_path"):
        return ""
    url = UPSTREAM_DOCS + meta["source_path"]
    bits = ['تُرجم عن <a href="%s" rel="nofollow">صفحة المنبع</a>' % html.escape(url)]
    if meta.get("translated_at"):
        bits.append('حُدّث %s' % html.escape(meta["translated_at"]))
    bits.append('بترخيص <a href="https://creativecommons.org/licenses/by/3.0/us/" '
                'rel="license nofollow">CC BY 3.0 US</a>')
    return ('<div class="src-note">%s<br>محراب مشروعٌ مستقلٌّ لا صلةَ له بمايكروسوفت.</div>'
            % ' <span class="dot">·</span> '.join(bits))


def drift_banner_html(meta):
    """الانجرافُ الكبيرُ وحده يعترض القارئ فوق المقال. وما دونه يبقى في التذييل."""
    if meta.get("drift") != "major":
        return ""
    return ('<div class="drift-banner"><b>تنبيه</b>'
            '<span>هذه الترجمة أقدمُ من الأصل الإنجليزيّ. '
            'راجِع <a href="%s">صفحة المنبع</a> للتفاصيل المستجدّة.</span></div>'
            % html.escape(UPSTREAM_DOCS + meta.get("source_path", "")))


def page_shell(title, body, active, base, description=""):
    return """<!doctype html>
<html lang="ar" dir="rtl">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — توثيق محراب</title>
<meta name="description" content="{desc}">
<link rel="stylesheet" href="{base}/assets/fonts.css">
<link rel="stylesheet" href="{base}/assets/mihrab-docs.css">
<body data-base="{base}">
<header class="site-header">
  <a class="brand" href="{base}/">{mark}<span>محراب</span></a>
  <div class="header-search search-box">
    <input type="search" id="site-search" placeholder="ابحث في التوثيق…  /" aria-label="بحث">
    <div class="search-results" id="search-results" hidden></div>
  </div>
  <button class="icon-btn" id="theme-toggle" type="button">فاتح</button>
  <button class="icon-btn" id="nav-toggle" type="button" aria-expanded="false"
          aria-controls="site-nav">القائمة</button>
</header>
<div class="nav-scrim" hidden></div>
{body}
<script src="{base}/assets/docs.js" defer></script>
</html>
""".format(title=html.escape(title), desc=html.escape(description), base=base,
           mark=MARK_SVG % "mark", body=body)


# ═════════════════════ صفحة الاختصارات ═════════════════════
def build_keyboard_page():
    """أهمُّ صفحةٍ في الموقع: بديلُ المنبع لها ملفُّ PDF إنجليزيٌّ وLTR معًا.

    ترتيبُ الأعمدة: الوصفُ العربيّ يمينًا لأنّ المستخدم يبحث بالمعنى («أريد تقسيم
    المحرّر») لا بالمفتاح؛ ثمّ الاختصارُ معزولًا في الوسط؛ ثمّ معرّفُ الأمر اللاتينيّ
    باهتًا — يحتاجه من يحرّر `keybindings.json` ولا يزاحم القارئ العابر.
    """
    with open(os.path.join(DATA, "keybindings.json"), encoding="utf-8") as f:
        data = json.load(f)

    out = []
    for group in data["groups"]:
        rows = []
        for e in group["items"]:
            win, mac = e["win"], e.get("mac") or e["win"]
            search = " ".join([e["ar"], e["id"], win, mac])
            chords = "|".join({win, mac})
            rows.append(
                '<tr data-search="%s" data-chords="%s">'
                '<td>%s</td>'
                '<td class="k"><span class="keys" data-platform="win">%s</span>'
                '<span class="keys" data-platform="mac" hidden>%s</span></td>'
                '<td class="id"><code>%s</code></td></tr>'
                % (html.escape(search), html.escape(chords), html.escape(e["ar"]),
                   _chord_inner(win), _chord_inner(mac), html.escape(e["id"])))
        out.append(
            '<section class="kbd-section"><h2 id="%s">%s</h2>'
            '<div class="table-wrap"><table class="kbd-table">'
            '<thead><tr><th>الأمر</th><th>الاختصار</th><th>معرّف الأمر</th></tr></thead>'
            '<tbody>%s</tbody></table></div></section>'
            % (html.escape(group["id"]), html.escape(group["title"]), "".join(rows)))

    toolbar = (
        '<div class="kbd-toolbar">'
        '<div class="grow"><input type="search" id="kbd-filter" '
        'placeholder="رشِّح بالأمر أو بالمفتاح…" aria-label="ترشيح الاختصارات"></div>'
        '<div class="seg" role="group" aria-label="النظام">'
        '<button type="button" data-platform="win" aria-pressed="true">ويندوز / لينكس</button>'
        '<button type="button" data-platform="mac" aria-pressed="false">macOS</button>'
        '</div>'
        '<button class="icon-btn" id="capture-btn" type="button">التقط اختصارًا</button>'
        '<button class="icon-btn" type="button" onclick="window.print()">اطبع البطاقة</button>'
        '</div>'
        '<div class="capture-box" hidden>'
        '<input type="text" id="capture-field" placeholder="اضغط الاختصار الآن…" '
        'aria-label="التقاط اختصار">'
        '<div class="result dim">سيظهر الأمرُ المطابق هنا.</div></div>'
        '<p class="no-results" hidden>لا اختصارَ يطابق ما كتبت.</p>'
    )
    return toolbar + "".join(out), [
        (2, g["id"], g["title"]) for g in data["groups"]]


def _chord_inner(chord):
    parts = [p.strip() for p in chord.split("+") if p.strip()]
    bits = []
    for i, p in enumerate(parts):
        if i:
            bits.append('<span class="plus">+</span>')
        bits.append('<kbd class="chord" dir="ltr">%s</kbd>' % html.escape(p))
    return "".join(bits)


# ═════════════════════ الخطوط ═════════════════════
# الوجوهُ المطلوبة. الاسمُ ⇒ (العائلة، الوزن).
FONT_FACES = [
    ("plex-arabic-400.woff2", "IBM Plex Sans Arabic", 400),
    ("plex-arabic-600.woff2", "IBM Plex Sans Arabic", 600),
    ("plex-mono-400.woff2", "IBM Plex Mono", 400),
]


def write_fonts_css(dst_assets):
    """يولّد `fonts.css` من الملفّات **الموجودة فعلًا** وينسخها.

    ولا يكتب `@font-face` لملفٍّ غائب: وجهٌ يشير إلى ملفٍّ غير موجود لا يفشل بصوت —
    بل يُطلق 404 في كلّ فتحةِ صفحة ثمّ يسقط صامتًا إلى خطٍّ آخر، فيبدو الموقعُ سليمًا
    وهو يعرض خطًّا لم نصمّم عليه. والسقوطُ الصريح في سلسلة `--font-ar` أشرفُ من ذلك.
    """
    src_dir = os.path.join(ASSETS, "fonts")
    faces, present = [], []
    for fn, family, weight in FONT_FACES:
        if os.path.isfile(os.path.join(src_dir, fn)):
            present.append(fn)
            faces.append(
                '@font-face{font-family:"%s";src:url("fonts/%s") format("woff2");'
                'font-weight:%d;font-display:swap}' % (family, fn, weight))

    if present:
        dst_dir = os.path.join(dst_assets, "fonts")
        os.makedirs(dst_dir, exist_ok=True)
        for fn in present:
            with open(os.path.join(src_dir, fn), "rb") as f_in, \
                    open(os.path.join(dst_dir, fn), "wb") as f_out:
                f_out.write(f_in.read())

    header = ("/* مولَّد من build.py — لا تحرّره. %d/%d وجهًا مورَّدًا. */\n"
              % (len(present), len(FONT_FACES)))
    with open(os.path.join(dst_assets, "fonts.css"), "w", encoding="utf-8", newline="\n") as f:
        f.write(header + "\n".join(faces) + "\n")

    if len(present) != len(FONT_FACES):
        print("  ⚠️  %d/%d وجهِ خطٍّ مورَّد — الباقي يسقط إلى Noto Sans Arabic صراحةً. "
              "ورِّد woff2 في site/assets/fonts/ لتفعيلها."
              % (len(present), len(FONT_FACES)))


# ═════════════════════ البناء ═════════════════════
def strip_tags(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s)).strip()


def main():
    check_only = "--check" in sys.argv
    pages, index = [], []

    for slug in SLUG_TITLE:
        path = os.path.join(CONTENT, slug + ".md")
        if not os.path.isfile(path):
            raise SystemExit("صفحةٌ في التنقّل بلا ملفّ: %s.md" % slug)

    for fn in sorted(os.listdir(CONTENT)):
        if not fn.endswith(".md"):
            continue
        slug = fn[:-3]
        if slug not in SLUG_TITLE:
            raise SystemExit("ملفٌّ خارج التنقّل: %s — أضِفه إلى NAV أو احذفه." % fn)
        raw = open(os.path.join(CONTENT, fn), encoding="utf-8").read()
        meta, body_md = parse_front_matter(raw, fn)
        body_html, headings = render_md(body_md, fn)
        if slug == "keyboard":
            kbd_html, kbd_heads = build_keyboard_page()
            body_html += kbd_html
            headings += kbd_heads
        pages.append((slug, meta, body_html, headings))
        index.append({
            "url": slug + "/",
            "title": SLUG_TITLE[slug],
            "section": SLUG_SECTION[slug],
            "text": strip_tags(body_html)[:1200],
        })

    if check_only:
        print("✅ %d صفحة سليمة." % len(pages))
        return 0

    os.makedirs(OUT, exist_ok=True)
    # الأصول
    dst_assets = os.path.join(OUT, "assets")
    os.makedirs(dst_assets, exist_ok=True)
    for fn in os.listdir(ASSETS):
        src = os.path.join(ASSETS, fn)
        if os.path.isfile(src):
            with open(src, "rb") as f_in, open(os.path.join(dst_assets, fn), "wb") as f_out:
                f_out.write(f_in.read())
    write_fonts_css(dst_assets)

    for slug, meta, body_html, headings in pages:
        base = ".."
        title = SLUG_TITLE[slug]
        article = (
            '<main class="content">'
            + drift_banner_html(meta)
            + "<h1>%s</h1>" % html.escape(title)
            + body_html
            + src_note_html(meta)
            + "</main>"
        )
        layout = ('<div class="layout"><nav class="site-nav" id="site-nav" '
                  'aria-label="التنقّل">%s</nav>%s%s</div>'
                  % (nav_html(slug, base), article, toc_html(headings)))
        page = page_shell(title, layout, slug, base, meta.get("description", ""))
        d = os.path.join(OUT, slug)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8", newline="\n") as f:
            f.write(page)

    # الصفحةُ الأولى: بحثٌ مركَّزٌ تلقائيًّا وثلاثُ بطاقات. لا صورَ بطلٍ ولا لقطاتِ
    # شاشة فوق الطيّة — تدفع المحتوى النافع خارج الشاشة.
    cards = [
        ("start", "البدء في دقيقة", "أوّلُ ملفٍّ وأوّلُ تشغيل."),
        ("keyboard", "اختصارات لوحة المفاتيح", "بطاقةٌ مرجعيّة عربيّة، قابلةٌ للطباعة."),
        ("terminal", "الطرفيّة المدمجة", "شغّل الأوامر دون مغادرة المحرّر."),
    ]
    home_body = (
        '<main class="home">' + (MARK_SVG % "mark-lg")
        + "<h1>توثيق محراب</h1>"
        + '<p class="tagline">للمِحرابِ اتّجاه، ولكودِك وِجهة.</p>'
        + '<p class="tagline-sub">مكانٌ صافٍ تكتب فيه بالعربيّة كما تُفكّر بها.</p>'
        + '<div class="home-search search-box">'
          '<input type="search" id="site-search" autofocus '
          'placeholder="ابحث في التوثيق…" aria-label="بحث">'
          '<div class="search-results" id="search-results" hidden></div></div>'
        + '<div class="cards">'
        + "".join('<a class="card" href="%s/"><b>%s</b><span>%s</span></a>' % c for c in cards)
        + "</div>"
        + '<p class="dim" style="margin-top:48px">التوثيقُ مترجَمٌ عن '
          '<a href="https://github.com/microsoft/vscode-docs">vscode-docs</a> '
          'بترخيص CC BY 3.0 US.</p>'
        + "</main>"
    )
    home = page_shell("توثيق محراب", home_body, None, ".",
                      "توثيقُ محرّر محراب بالعربيّة: البدء، المحرّر، الاختصارات، الطرفيّة.")
    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(home)

    with open(os.path.join(OUT, "search-index.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))

    # .nojekyll — نحن نولّد HTML جاهزًا، ومعالجةُ Jekyll تحذف ما يبدأ بشرطةٍ سفليّة.
    open(os.path.join(OUT, ".nojekyll"), "w").close()

    print("✅ بُني الموقع: %d صفحة + الصفحة الأولى → %s" % (len(pages), OUT))
    return 0


if __name__ == "__main__":
    sys.exit(main())
