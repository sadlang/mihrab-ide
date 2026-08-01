#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""يبني `code.icns` (أيقونةُ تطبيق macOS) من PNG واحدٍ 256×256.

    python build/gen_icns.py assets/branding/mihrab-mark-color-256.png out/code.icns

لماذا يدويًّا لا بأداة؟ `iconutil` موجودٌ على macOS وحده، وPillow ليست اعتماديّةَ
بناء. وصيغةُ ICNS أبسط ممّا يُظنّ: ترويسةٌ ثمّ كتلٌ موسومة، وكلُّ كتلةٍ من نوعٍ
حديث (‏ic07 فما فوق) **تحمل ملفَّ PNG كما هو** بلا إعادة ترميز. فالمولِّدُ نسخُ
بايتاتٍ لا معالجةَ صور.

⚠️ وبديلُ هذا أن تُشحن أيقونةُ VSCodium على macOS. وهو عطبُ هويّةٍ صامت: البناءُ
ينجح، والاختباراتُ تمرّ، والمستخدمُ يرى في الـDock شعارَ مشروعٍ آخر.
"""
import struct
import sys

# كونسول ويندوز قد يكون cp125x فيفشل الطبعُ بالعربيّة/✅ **بعد** كتابة الملفّ:
# مخرَجٌ سليمٌ وخروجٌ بـ1، فيُجهض البناءَ بلا سبب. نفس كتلة بقيّة مرقِّعات المشروع.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


def build_icns(png_bytes, types=("ic07", "ic08", "ic11", "ic12", "ic13")):
    """يلفّ PNG واحدًا في كلّ نوعٍ مطلوب.

    النوعُ يُعلن الحجمَ المنطقيّ لا الفعليّ، وmacOS يعيد القياس. وحقنُ 256×256 في
    كلّ الفتحات يعطي أيقونةً صحيحةً في كلّ المقاسات، أنعمَ ممّا لو تُركت الفتحاتُ
    الصغيرة فارغةً فسقط النظامُ إلى أكبرِ متاحٍ بخوارزميّةٍ لا نتحكّم بها.
    """
    chunks = b"".join(
        t.encode("ascii") + struct.pack(">I", len(png_bytes) + 8) + png_bytes
        for t in types)
    return b"icns" + struct.pack(">I", len(chunks) + 8) + chunks


def main(argv):
    if len(argv) != 3:
        sys.stderr.write("الاستعمال: gen_icns.py <مصدر.png> <هدف.icns>\n")
        return 2
    src, dst = argv[1], argv[2]
    with open(src, "rb") as f:
        png = f.read()
    if png[:8] != b"\x89PNG\r\n\x1a\n":
        sys.stderr.write("❌ المصدر ليس PNG: %s\n" % src)
        return 1
    w, h = struct.unpack(">II", png[16:24])
    if w != h:
        sys.stderr.write("❌ الأيقونةُ يجب أن تكون مربّعة (%dx%d): %s\n" % (w, h, src))
        return 1
    with open(dst, "wb") as f:
        f.write(build_icns(png))
    print("✅ %s ← %s (%dx%d)" % (dst, src, w, h))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
