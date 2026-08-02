#!/usr/bin/env bash
# جلبُ أدوات لغة ص من **الإصدار الرسميّ المنشور** لمستودع اللغة، كي يحمل كلُّ نشرٍ لمحراب
# أحدثَ ص رسميّة — بدل الاعتماد على `../sad-engines-dev/` الموجود على جهاز المطوّر وحده.
#
# **العطبُ الذي يعالجه:** لا خطوةَ جلبٍ لأدوات ص في أيّ سير عمل (`grep -rl MIHRAB_SAD .github/`
# ⇒ لا شيء)، و`build.sh` يسقط سقوطًا رشيقًا عند غيابها. فالنسخةُ المبنيّةُ على جهاز مطوّرٍ
# تعمل، والمنشورةُ من CI **بلا لغةٍ أصلًا** — والموقعُ يَعِد بأنّها «جاهزةٌ في الصندوق».
# وهو فرقٌ لا يراه المطوّر لأنّ جهازه مملوء.
#
# الاستعمال:
#   bash build/fetch_sad_tools.sh                  # أحدثُ إصدارٍ رسميّ لهذه المنصّة
#   SAD_TOOLS_TAG=v1.0.0 bash build/fetch_sad_tools.sh
#   source .upstream/.sad-tools/env.sh && bash build/build.sh
#
# الخرج: `.upstream/.sad-tools/` فيه الأدواتُ بأسماء محراب، و`env.sh` للتصدير،
#        و`manifest.json` يسجّل الوسمَ والأصلَ وبصماتِ الملفّات.
# الخروج: 0 حين تُجلَب أداةٌ واحدةٌ على الأقلّ · 3 حين لا أصلَ لهذه المنصّة (ليس فشلًا:
#        المستودعُ لا ينشر لكلّ منصّة بعدُ) · 1 خطأٌ حقيقيّ.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="${SAD_TOOLS_REPO:-sadlang/s-programming-language}"
TAG="${SAD_TOOLS_TAG:-}"
OUT="$ROOT/.upstream/.sad-tools"
log() { echo "▶ $*"; }

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*|Windows_NT) PLATFORM=windows; EXE=.exe ;;
  Darwin) PLATFORM=mac; EXE= ;;
  *) PLATFORM=linux; EXE= ;;
esac
ARCH="$(uname -m)"; [[ "$ARCH" == "aarch64" ]] && ARCH=arm64
[[ "$ARCH" == "x86_64" ]] && ARCH=x64

command -v gh >/dev/null || { echo "❌ لا gh CLI — لازمٌ لجلب الإصدار الرسميّ." >&2; exit 1; }

if [[ -z "$TAG" ]]; then
  TAG="$(gh release view --repo "$REPO" --json tagName --jq .tagName)"
fi
log "إصدارُ لغة ص الرسميّ: $TAG (من $REPO) · المنصّة: $PLATFORM/$ARCH"

# اختيارُ الأصل: نمطُ المنصّة، و**استبعادُ المثبِّتات** (`sad-setup-*`) — نريد نسخةً محمولةً
# نستخرج منها، لا مثبِّتًا يحتاج تفاعلًا.
mapfile -t ASSETS < <(gh release view "$TAG" --repo "$REPO" --json assets --jq '.assets[].name')
PICK=""
for a in "${ASSETS[@]}"; do
  [[ "$a" == sad-setup-* ]] && continue
  case "$a" in
    *"$PLATFORM-$ARCH"*.zip|*"$PLATFORM-$ARCH"*.tar.gz|*"$PLATFORM-$ARCH"*.tar.xz) PICK="$a"; break ;;
  esac
done
if [[ -z "$PICK" ]]; then
  echo "⚠️ لا أصلَ لهذه المنصّة في $TAG (المتاح: ${ASSETS[*]:-لا شيء})." >&2
  echo "   محرابُ هذه المنصّة سيُبنى **بلا أدوات ص**. انشر أصلًا باسمٍ يحوي «$PLATFORM-$ARCH»." >&2
  exit 3
fi
log "الأصل المختار: $PICK"

rm -rf "$OUT"; mkdir -p "$OUT/raw" "$OUT/bin"
gh release download "$TAG" --repo "$REPO" --pattern "$PICK" --dir "$OUT/raw" --clobber
ARCHIVE="$OUT/raw/$PICK"
case "$PICK" in
  # ‏`unzip` يعيد 1 على **تحذير** لا على فشل — وأرشيفُ الإصدار الرسميّ يُطلق تحذيرَ
  # «backslashes as path separators» (أُنشئ على ويندوز). تحت `set -e` كان ذلك يُسقِط
  # الجلبَ صامتًا بعد تنزيلٍ ناجح. فنقبل 0 و1 ونرفض ما فوقهما.
  *.zip) ( cd "$OUT/raw" && unzip -o -q "$PICK" -d ex ) || [[ $? -le 1 ]] ;;
  *.tar.gz|*.tar.xz) mkdir -p "$OUT/raw/ex" && tar -xf "$ARCHIVE" -C "$OUT/raw/ex" ;;
esac
EX="$OUT/raw/ex"

# ── الخريطة: اسمُ محرابٍ ⇐ أوّلُ موجودٍ من مرشّحي الإصدار ──
# الاسمُ المطابقُ أوّلًا (كي يلتقط الإصداراتِ القادمة تلقائيًّا حين تنشر الأسماءَ الأربعة)،
# ثمّ اسمُ الإصدار الحاليّ: `sad` مُشغِّلٌ و`sadc` مترجم. ولا مرشّحَ لـcheck/lsp اليوم.
declare -A CANDIDATES=(
  [sad-run]="sad-run sad"
  [sad-build]="sad-build sadc"
  [sad-check]="sad-check"
  [sad-lsp]="sad-lsp"
)
declare -A ENVVAR=(
  [sad-run]=MIHRAB_SAD_RUN [sad-build]=MIHRAB_SAD_BUILD
  [sad-check]=MIHRAB_SAD_CHECK [sad-lsp]=MIHRAB_SAD_LSP
)

: > "$OUT/env.sh"
FOUND=0; MISSING=()
for tool in sad-run sad-build sad-check sad-lsp; do
  src=""
  for cand in ${CANDIDATES[$tool]}; do
    hit="$(find "$EX" -maxdepth 3 -type f -name "$cand$EXE" -print -quit 2>/dev/null || true)"
    [[ -n "$hit" ]] && { src="$hit"; break; }
  done
  if [[ -z "$src" ]]; then MISSING+=("$tool"); continue; fi
  cp -f "$src" "$OUT/bin/$tool$EXE"
  chmod +x "$OUT/bin/$tool$EXE" 2>/dev/null || true
  echo "export ${ENVVAR[$tool]}='$OUT/bin/$tool$EXE'" >> "$OUT/env.sh"
  log "‏$tool$EXE ⇐ $(basename "$src") ($(du -h "$OUT/bin/$tool$EXE" | cut -f1))"
  FOUND=$((FOUND + 1))
done

# حمولةٌ مجاورة: المكتبةُ القياسيّة ومكتباتُ التشغيل. `sad.exe` يعمل بلا SDL2 لبرنامجٍ
# نصّيّ (قِسناه)، لكنّ استيرادَ المكتبة القياسيّة وتوليدَ الواجهات يحتاجانهما.
for extra in stdlib SDL2.dll; do
  [[ -e "$EX/$extra" ]] && cp -rf "$EX/$extra" "$OUT/bin/" && log "حمولةٌ مجاورة: $extra"
done
[[ -d "$OUT/bin/stdlib" || -f "$OUT/bin/SDL2.dll" ]] && \
  echo "export MIHRAB_SAD_PAYLOAD='$OUT/bin'" >> "$OUT/env.sh"

if ((FOUND == 0)); then
  echo "❌ لم تُطابَق أيُّ أداةٍ داخل $PICK — تغيّرت أسماءُ ملفّات الإصدار؟" >&2
  exit 1
fi

python - "$OUT" "$REPO" "$TAG" "$PICK" <<'PY'
import hashlib, json, os, sys
out, repo, tag, asset = sys.argv[1:5]
bins = {}
for f in sorted(os.listdir(os.path.join(out, "bin"))):
    p = os.path.join(out, "bin", f)
    if os.path.isfile(p):
        bins[f] = hashlib.sha256(open(p, "rb").read()).hexdigest()[:16]
json.dump({"repo": repo, "tag": tag, "asset": asset, "tools": bins},
          open(os.path.join(out, "manifest.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
PY

echo "✅ أدواتُ ص $TAG جاهزة: $FOUND/4 (${MISSING[*]:-لا نقص})"
[[ ${#MISSING[@]} -gt 0 ]] && echo "   ⚠️ غيرُ منشورٍ في الإصدار الرسميّ: ${MISSING[*]} — محرابٌ يُشحن بلا ذكاءٍ لغويّ/تشخيصٍ حتّى تُنشَر."
echo "   للاستعمال: source ${OUT#$ROOT/}/env.sh"
exit 0
