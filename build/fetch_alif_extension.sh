#!/usr/bin/env bash
# جلبُ إضافة «لغة ألف» لبناءِ المعاينة — لا للبناءِ العاديّ.
#
# لماذا جلبٌ لا إيداع؟ الإضافةُ منتَجُ مستودعٍ آخر (SalehKadah/alif-vscode) وله
# إصداراتُه. إيداعُ vsix هنا يخلق نسخةً ثانيةً تنجرف صامتةً عن الأصل، ويجعل
# مستودعَ محرابٍ مخزنَ ثنائيّاتٍ لغيره. الجلبُ يُبقي مصدرَ الحقيقةِ واحدًا.
#
# ولماذا بصمةٌ مثبَّتة؟ لأنّ هذا الملفَّ يُنفَّذ في جهازِ المستخدمِ آخرَ المطاف.
# رابطُ إصدارٍ على GitHub قابلٌ للاستبدالِ بأصلٍ آخرَ بالاسمِ نفسِه بلا أثر،
# فبلا بصمةٍ نبني ما لا نعرفه. البصمةُ تُثبَّت هنا وتُقاس قبل الفكّ لا بعده.
set -euo pipefail

ALIF_VERSION="${ALIF_EXT_VERSION:-0.1.1}"
ALIF_SHA256="${ALIF_EXT_SHA256:-c4a4561d4d13e5df95fdf8d7006c33bae96e7b3b1cbd983db9bd6a81d8b44fc5}"
ALIF_URL="https://github.com/SalehKadah/alif-vscode/releases/download/v${ALIF_VERSION}/alif-lang-${ALIF_VERSION}.vsix"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# الحسابُ في دالّةٍ مشتركةٍ لأنّه يُختبَر (tests/static/check_extra_ext_dirs.sh).
. "$ROOT/build/lib/sha256.sh"
DEST="$ROOT/.preview-extensions/alif-lang"
TMP="$ROOT/.preview-extensions/.alif.vsix"

mkdir -p "$(dirname "$TMP")"
echo "▶ جلبُ إضافة لغة ألف $ALIF_VERSION …"
curl -fsSL -o "$TMP" "$ALIF_URL"

got=$(sha256_of "$TMP")
if [[ "$got" != "$ALIF_SHA256" ]]; then
  echo "❌ بصمةُ الإضافةِ لا تطابق المثبَّتة." >&2
  echo "   المتوقَّع: $ALIF_SHA256" >&2
  echo "   المقيس:   $got" >&2
  rm -f "$TMP"
  exit 1
fi
echo "   ✅ البصمة مطابقة: $got"

rm -rf "$DEST"; mkdir -p "$DEST"
# vsix أرشيفُ zip، ومحتوى الإضافةِ كلُّه تحت extension/ — تُنقل إلى الجذر لأنّ
# ماسحَ الإضافاتِ المدمجةِ يتوقّع package.json في أعلى المجلّد.
# <<VSIX_EXTRACT — سياجٌ يقرأ منه tests/static/check_extra_ext_dirs.sh هذا الفكَّ نفسَه.
python - "$TMP" "$DEST" <<'PY'
import sys, zipfile, os
src, dest = sys.argv[1], os.path.realpath(sys.argv[2])
with zipfile.ZipFile(src) as z:
    for name in z.namelist():
        if not name.startswith("extension/") or name.endswith("/"):
            continue
        rel = name[len("extension/"):]
        # zip slip: اسمُ مدخلٍ فيه «‏../» أو مسارٌ مطلقٌ يكتب **خارج** الوجهة —
        # و«‏../..» من ‎.preview-extensions/alif-lang هو جذرُ المستودع، أي كتابةٌ فوق
        # build/build.sh قبل تشغيله بلحظة. والبصمةُ المثبَّتة ليست حارسًا عن هذا:
        # تُبدَّل مع كلّ ترقيةٍ للإضافة، وتُتجاوَز بـALIF_EXT_SHA256.
        out = os.path.realpath(os.path.join(dest, rel))
        if out != dest and not out.startswith(dest + os.sep):
            sys.exit("❌ مدخلٌ يخرج من وجهةِ الفكّ (zip slip): %s" % name)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "wb") as fh:
            fh.write(z.read(name))
PY
# VSIX_EXTRACT>>

[[ -f "$DEST/package.json" ]] || { echo "❌ لا package.json في المفكوك: $DEST" >&2; exit 1; }
rm -f "$TMP"
echo "✅ لغة ألف جاهزة: $DEST"
echo "   للبناء بها:  MIHRAB_EXTRA_EXT_DIRS=\"$DEST\" bash build/build.sh"
