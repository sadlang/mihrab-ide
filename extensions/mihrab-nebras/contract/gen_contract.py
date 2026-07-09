#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""مولِّد وحدة عقد سلك نِبراس لمحراب.

يقرأ `protocol-contract.yaml` (مصدر الحقيقة) ويولّد `protocol-contract.generated.js`
(وحدة CommonJS مجمَّدة تستهلكها ملفّات الامتداد عبر require). يمنع التباعد الصامت بين
النسخ اليدويّة المكرَّرة (F1): مصدر واحد ⇐ حارس آليّ.

    python gen_contract.py            # يولّد/يحدّث الوحدة
    python gen_contract.py --check    # حارس CI: يفشل (خروج 1) إن انحرفت الوحدة عن المصدر

الحارس محايد لنهايات الأسطر (LF/CRLF) كي لا يُنتج إيجابيّة كاذبة على ويندوز.
"""
import json
import re
import sys
from pathlib import Path

import yaml

# اسم ثابت JS صالح (يُدرَج خامًّا في `const <NAME>` و module.exports) — يمنع أيضًا الأسطر
# الجديدة/الرموز التي قد تكسر الوحدة المولَّدة.
_JS_IDENT_RE = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")

# رسائل المولِّد عربيّة؛ اضبط مجرى الخرج على UTF-8 (بيئات ويندوز قد تفترض cp1255/cp1256).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

HERE = Path(__file__).resolve().parent
SOT_PATH = HERE / "protocol-contract.yaml"
OUT_PATH = HERE / "protocol-contract.generated.js"

# رأس الوحدة المولَّدة (تحذير عدم التحرير + إحالة المصدر/المولِّد/الحارس).
BANNER = (
    "// @ts-check\n"
    '"use strict";\n'
    "// ⚠️ ملفّ مولَّد آليًّا — لا تُحرِّره يدويًّا. حرِّر المصدر ثمّ أعِد التوليد.\n"
    "//   المصدر:  contract/protocol-contract.yaml\n"
    "//   المولِّد: contract/gen_contract.py   (حارس التطابق: gen_contract.py --check)\n"
    "//\n"
    "// عقد سلك نِبراس (يعكس @nebras/protocol): مصدر حقيقة واحد يملكه محراب، يمنع التباعد\n"
    "// الصامت بين ملفّات الامتداد CommonJS الخارجة عن شجرة بناء TypeScript. كلّ ثابت هنا\n"
    "// يُستهلَك عبر require، لا يُعاد إعلانه في الملفّات.\n"
)


def _emit_value(value):
    """يصيغ قيمة SoT كحرفيّة JS (سلاسل عربيّة خام، أرقام كما هي)."""
    return json.dumps(value, ensure_ascii=False)


def _validate(sot):
    """يتحقّق من بنية المصدر ويمنع تصادم أسماء الثوابت عبر المجموعات (خطأ عربيّ واضح
    بدل انهيار غامض في التوليد/`node --check`)."""
    if not isinstance(sot, dict) or not isinstance(sot.get("groups"), list) or not sot["groups"]:
        raise ValueError("مصدر تالف: يجب أن يحوي `groups` غير فارغة.")
    # حقول تُدرَج خامًّا في تعليقات `//` المولَّدة — الأسطر الجديدة تكسر التعليق فتفسد الوحدة.
    def _no_newline(text, where):
        if isinstance(text, str) and ("\n" in text or "\r" in text):
            raise ValueError(f"سطر جديد ممنوع في {where} (يكسر تعليق الوحدة المولَّدة).")

    seen = {}
    for group in sot["groups"]:
        gname = group.get("name", "?")
        _no_newline(gname, "اسم مجموعة")
        _no_newline(group.get("doc"), f"توثيق المجموعة «{gname}»")
        entries = group.get("entries")
        if not isinstance(entries, list) or not entries:
            raise ValueError(f"المجموعة «{gname}» بلا `entries` — لا مجموعة فارغة.")
        for entry in entries:
            name = entry.get("const")
            if not name:
                raise ValueError(f"عنصر في «{gname}» بلا مفتاح `const`.")
            if not _JS_IDENT_RE.match(name):
                raise ValueError(f"اسم ثابت غير صالح «{name}» في «{gname}» — يجب أن يكون معرّف JS صحيحًا.")
            if "value" not in entry:
                raise ValueError(f"الثابت «{name}» في «{gname}» بلا `value`.")
            _no_newline(entry.get("doc"), f"توثيق الثابت «{name}»")
            if name in seen:
                raise ValueError(
                    f"اسم ثابت مكرَّر «{name}» (في «{seen[name]}» و«{gname}») "
                    "⇒ تصادم في module.exports — وحّد الاسم."
                )
            seen[name] = gname


def render(sot):
    """يبني نصّ الوحدة المولَّدة من كائن SoT المُحمَّل."""
    lines = [BANNER]
    names = []
    for group in sot["groups"]:
        doc = group.get("doc", "")
        lines.append(f"\n// ── {group['name']}: {doc} ──")
        entries = group["entries"]
        width = max(len(e["const"]) for e in entries)
        for entry in entries:
            name = entry["const"]
            names.append(name)
            decl = f"const {name.ljust(width)} = {_emit_value(entry['value'])};"
            note = entry.get("doc")
            lines.append(f"{decl}  // {note}" if note else decl)

    lines.append("\nmodule.exports = Object.freeze({")
    for name in names:
        lines.append(f"  {name},")
    lines.append("});\n")
    return "\n".join(lines)


def _normalize(text):
    """يحيّد نهايات الأسطر لمقارنة محايدة (LF/CRLF)."""
    return text.replace("\r\n", "\n").replace("\r", "\n")


def main(argv):
    check = "--check" in argv[1:]
    try:
        sot = yaml.safe_load(SOT_PATH.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        print(f"❌ تعذّر قراءة/تحليل المصدر {SOT_PATH.name}: {exc}", file=sys.stderr)
        return 1
    try:
        _validate(sot)
    except ValueError as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 1
    generated = render(sot)

    if check:
        if not OUT_PATH.exists():
            print(f"❌ الوحدة المولَّدة غير موجودة: {OUT_PATH.name} — شغّل gen_contract.py", file=sys.stderr)
            return 1
        current = OUT_PATH.read_text(encoding="utf-8")
        if _normalize(current) != _normalize(generated):
            print(
                "❌ عقد السلك منحرف: "
                f"{OUT_PATH.name} لا يطابق {SOT_PATH.name} — أعد gen_contract.py",
                file=sys.stderr,
            )
            return 1
        print(f"✅ عقد السلك متطابق ({OUT_PATH.name} ≡ {SOT_PATH.name})")
        return 0

    OUT_PATH.write_text(generated, encoding="utf-8", newline="\n")
    print(f"✅ توليد {OUT_PATH.name} من {SOT_PATH.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
