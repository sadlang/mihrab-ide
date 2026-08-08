#!/usr/bin/env bash
# ‏تثبيتُ محرابٍ المبنيّ في مجلّدٍ للاستعمال اليوميّ — منفصلًا عن شجرة التطوير.
#
# لماذا يوجد هذا الملفّ: مخرَجُ البناء يعيش في `.upstream/VSCode-win32-x64`، و`build.sh`
# **يحذفه** في أوّل خطوةٍ من كلّ بناء. فمن يشغّل محرابًا من هناك يجب أن يغلقه كلّما
# أراد أحدٌ أن يبني. النسخُ إلى وجهةٍ خارج الشجرة يفكّ هذا الاقتران: البناءُ يمسّ
# مخرَجَه وحدَه، والنسخةُ العاملةُ لا يمسّها شيءٌ إلّا هذا السكربتُ صراحةً.
#
# الاستعمال:  bash build/install_local.sh [الوجهة]
#             MIHRAB_DEST='C:\محراب' bash build/install_local.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UP="$ROOT/.upstream"

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) OS_NAME="windows" ;;
  Darwin)               OS_NAME="osx" ;;
  Linux)                OS_NAME="linux" ;;
  *) echo "❌ منصّةٌ غيرُ مدعومة: $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in aarch64|arm64) ARCH="arm64" ;; *) ARCH="x64" ;; esac
ARCH="${MIHRAB_ARCH:-$ARCH}"

case "$OS_NAME" in
  windows) SRC="$UP/VSCode-win32-$ARCH"; APP_REL="resources/app"; LAUNCH="Mihrab.exe";  DEFAULT_DEST="/c/محراب" ;;
  linux)   SRC="$UP/VSCode-linux-$ARCH"; APP_REL="resources/app"; LAUNCH="bin/mihrab";  DEFAULT_DEST="$HOME/محراب" ;;
  osx)     SRC="$UP/VSCode-darwin-$ARCH"; APP_REL=""; LAUNCH="";  DEFAULT_DEST="$HOME/Applications/محراب" ;;
esac

DEST="${1:-${MIHRAB_DEST:-$DEFAULT_DEST}}"
log() { echo "▶ $*"; }

# ── (أ) المصدرُ موجودٌ ومحرابٌ فعلًا ─────────────────────────────────────
# البناءُ الناجح ليس دليلَ هويّة، والنسخُ عمليّةٌ تدوسُ نسخةً يعتمد عليها المستخدم.
# فالتحقّقُ هنا **قبل** الدوس لا بعده — ونسخةٌ قديمةٌ سليمة خيرٌ من جديدةٍ مجهولة.
[[ -d "$SRC" ]] || { echo "❌ لا مخرَجَ بناءٍ في $SRC — شغّل build/build.sh أوّلًا." >&2; exit 1; }
if [[ "$OS_NAME" == "osx" ]]; then
  MAC_APP="$(find "$SRC" -maxdepth 1 -name '*.app' -print -quit)"
  [[ -n "$MAC_APP" ]] || { echo "❌ لا حزمةَ .app في $SRC" >&2; exit 1; }
  APP_REL="$(basename "$MAC_APP")/Contents/Resources/app"
  LAUNCH="$(basename "$MAC_APP")/Contents/MacOS/Electron"
fi
[[ -f "$SRC/$LAUNCH" ]] || { echo "❌ لا مشغِّلَ في $SRC/$LAUNCH — البناءُ ناقص." >&2; exit 1; }

PRODUCT="$SRC/$APP_REL/product.json"
[[ -f "$PRODUCT" ]] || { echo "❌ لا product.json في المخرَج — البناءُ ناقص." >&2; exit 1; }
JQ_BIN="$ROOT/build/.toolchain/jq"; [[ -x "$JQ_BIN" ]] || JQ_BIN="$(command -v jq || true)"
if [[ -n "$JQ_BIN" ]]; then
  _n="$("$JQ_BIN" -r '.nameLong // ""' "$PRODUCT")"
  _u="$("$JQ_BIN" -r '.updateUrl // "null"' "$PRODUCT")"
  [[ "$_n" == "محراب" ]] || { echo "❌ المخرَجُ ليس محرابًا: nameLong=$_n — لا يُثبَّت." >&2; exit 1; }
  # المُحدِّثُ لو عاد حيًّا استبدل محرابًا بـVSCodium صامتًا في جهاز المستخدم.
  [[ "$_u" == "null" ]] || { echo "❌ updateUrl حيٌّ في المخرَج ($_u) — لا يُثبَّت." >&2; exit 1; }
  log "الهويّةُ في المصدر: nameLong=محراب · updateUrl=معطَّل"
else
  echo "⚠️ لا jq — تُخطّى بوّابةُ الهويّة. (شغّل build/build.sh مرّةً ليُنزَّل)" >&2
fi

# ── (ب) الوجهةُ حرّة؟ ولو لا: **سمِّ المُمسِك** ──────────────────────────
# رسالةُ «أغلق أيّ نسخةٍ قيد التشغيل» تُرسِل القارئَ يبحث عمّا قد لا يكون موجودًا.
# ‏Restart Manager يعرف الاسمَ والرقم، فلا سبب لأن نُخمّن نيابةً عن المستخدم.
name_holder() {
  [[ "$OS_NAME" == "windows" && -f "$ROOT/build/who_locks.ps1" ]] || return 0
  local win; win="$(cygpath -w "$1" 2>/dev/null || echo "$1")"
  powershell -NoProfile -ExecutionPolicy Bypass -File "$ROOT/build/who_locks.ps1" -Path "$win" 2>/dev/null | tr -d '\r'
}

if [[ -e "$DEST" && ! -d "$DEST" ]]; then
  echo "❌ الوجهةُ موجودةٌ وليست مجلّدًا: $DEST" >&2; exit 1
fi
if [[ -f "$DEST/$LAUNCH" ]]; then
  HOLDERS="$(name_holder "$DEST/$LAUNCH")"
  if [[ -n "$HOLDERS" ]]; then
    echo "❌ الوجهةُ قيد الاستعمال — لا تُداس نسخةٌ عاملة:" >&2
    echo "$HOLDERS" | while IFS=$'\t' read -r pid app; do
      echo "   • PID $pid — ${app:-?}" >&2
    done
    echo "   أغلقها ثمّ أعد: bash build/install_local.sh \"$DEST\"" >&2
    exit 1
  fi
fi

# ── (ج) النسخ ───────────────────────────────────────────────────────────
# مرآةٌ لا إضافة: ملفٌّ حُذف من المخرَج يجب أن يُحذف من الوجهة، وإلّا بقيت مصنوعاتُ
# بناءٍ قديمٍ تتعايش مع الجديد — وذاك أصلُ أعطالٍ لا يعيد أحدٌ إنتاجَها.
# ⚠️ **لا robocopy هنا.** جُرِّب فسقط: استدعاؤه من bash يمرّر الوجهةَ عبر ترميز
# النظام، فوصلت `C:\محراب` إلى ويندوز `C:\?????` — وكلُّ وجهاتنا عربيّةُ الاسم.
# و`cp` في bash يمرّ بالبايتات كما هي، فلا يعرف هذه المشكلة أصلًا.
#
# والنسخُ إلى **مرحلةٍ ثمّ تبديل**، لا فوق الوجهة مباشرةً: انقطاعُ نسخٍ في المنتصف
# (قرصٌ يمتلئ، جهازٌ يُطفأ) يترك المستخدمَ بلا محرابٍ يعمل — لا بنسخةٍ قديمة.
STAGE="$DEST.جديد"
rm -rf "$STAGE"
log "النسخ إلى مرحلةٍ: $STAGE"
cp -r "$SRC" "$STAGE" || { rm -rf "$STAGE"; echo "❌ فشل النسخ إلى $STAGE." >&2; exit 1; }
[[ -f "$STAGE/$LAUNCH" ]] || { rm -rf "$STAGE"; echo "❌ لا مشغِّلَ في المرحلة — نسخٌ ناقص." >&2; exit 1; }
_src_n=$(find "$SRC"   -type f | wc -l)
_stg_n=$(find "$STAGE" -type f | wc -l)
if [[ "$_src_n" -ne "$_stg_n" ]]; then
  rm -rf "$STAGE"
  echo "❌ عددُ الملفّات لا يطابق: المصدر $_src_n · المرحلة $_stg_n — لم تُمَسّ الوجهة." >&2
  exit 1
fi
log "التبديل: $STAGE ⟵ $DEST"
_OLD="$DEST.سابق"
rm -rf "$_OLD"
[[ -d "$DEST" ]] && mv "$DEST" "$_OLD"
mv "$STAGE" "$DEST" || { [[ -d "$_OLD" ]] && mv "$_OLD" "$DEST"; echo "❌ فشل التبديل — أُعيدت النسخةُ السابقة." >&2; exit 1; }
rm -rf "$_OLD"

# ── (د) تحقّقٌ بعد النسخ على **الوجهة** لا على المصدر ────────────────────
# النسخُ قد ينجح جزئيًّا (قرصٌ ممتلئ، مسارٌ طويل) ويعيد رمزَ نجاح. فالشهادةُ تُؤخَذ
# من الملفّ الذي سيُشغّله المستخدم غدًا، لا من الذي بنيناه اليوم.
[[ -f "$DEST/$LAUNCH" ]] || { echo "❌ لا مشغِّلَ في الوجهة: $DEST/$LAUNCH" >&2; exit 1; }
if [[ -n "${JQ_BIN:-}" && -f "$DEST/$APP_REL/product.json" ]]; then
  _dn="$("$JQ_BIN" -r '.nameLong // ""' "$DEST/$APP_REL/product.json")"
  [[ "$_dn" == "محراب" ]] || { echo "❌ الهويّةُ سقطت في الوجهة: nameLong=$_dn" >&2; exit 1; }
fi
_dst_n=$(find "$DEST" -type f | wc -l)
[[ "$_dst_n" -eq "$_stg_n" ]] || { echo "❌ الوجهةُ ناقصةٌ بعد التبديل: $_dst_n بدل $_stg_n" >&2; exit 1; }

echo "✅ ثُبِّت محراب: $DEST/$LAUNCH"
echo "   ‎$_dst_n‎ ملفًّا · الهويّة محراب · المُحدِّثُ معطَّل"
echo "   ولا يمسّ هذا المجلّدَ أيُّ بناءٍ لاحق — بناءُ التطوير يعيش في .upstream وحدَه."
