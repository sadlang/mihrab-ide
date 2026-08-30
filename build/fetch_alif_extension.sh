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

ALIF_VERSION="${ALIF_EXT_VERSION:-0.1.0}"
ALIF_SHA256="${ALIF_EXT_SHA256:-fc813f2ded315de080186a36522c44a7ffaa9b73e32b518fc8ad4f8d75e5a55d}"
ALIF_URL="https://github.com/SalehKadah/alif-vscode/releases/download/v${ALIF_VERSION}/alif-lang-${ALIF_VERSION}.vsix"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/.preview-extensions/alif-lang"
TMP="$ROOT/.preview-extensions/.alif.vsix"

mkdir -p "$(dirname "$TMP")"
echo "▶ جلبُ إضافة لغة ألف $ALIF_VERSION …"
curl -fsSL -o "$TMP" "$ALIF_URL"

got=$(sha256sum "$TMP" | cut -d' ' -f1)
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
python - "$TMP" "$DEST" <<'PY'
import sys, zipfile, os
src, dest = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as z:
    for name in z.namelist():
        if not name.startswith("extension/") or name.endswith("/"):
            continue
        rel = name[len("extension/"):]
        out = os.path.join(dest, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "wb") as fh:
            fh.write(z.read(name))
PY

[[ -f "$DEST/package.json" ]] || { echo "❌ لا package.json في المفكوك: $DEST" >&2; exit 1; }
rm -f "$TMP"
echo "✅ لغة ألف جاهزة: $DEST"
echo "   للبناء بها:  MIHRAB_EXTRA_EXT_DIRS=\"$DEST\" bash build/build.sh"
