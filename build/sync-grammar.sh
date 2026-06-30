#!/usr/bin/env bash
# مزامنة نحو لغة ص المحزوم من مستودع اللغة (مصدر الحقيقة).
#
# النحو مولَّد في s-programming-language (editors/grammars/sad.tmLanguage.json) عبر
# scripts/codegen/gen_tmgrammar.py من language-truth/. محراب يستهلك نسخة محزومة؛
# هذا السكربت يجلب أحدث ناتج (ويولّده إن لزم وكان المستودع متاحًا).
#
# الاستعمال:  bash build/sync-grammar.sh
#             SAD_LANG_REPO=/path/to/s-programming-language bash build/sync-grammar.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/extensions/sad-lang/syntaxes/sad.tmLanguage.json"
LANG_REPO="${SAD_LANG_REPO:-$ROOT/../s-programming-language}"
SRC="$LANG_REPO/editors/grammars/sad.tmLanguage.json"

if [[ ! -d "$LANG_REPO" ]]; then
  echo "❌ مستودع اللغة غير موجود: $LANG_REPO" >&2
  echo "   حدّد المسار: SAD_LANG_REPO=/path/to/s-programming-language" >&2
  exit 1
fi

# اكتشف مُفسِّر Python (Git Bash على ويندوز قد لا يملك python3؛ نجرّب py -3.12 وpython).
PY=""
if command -v python3 >/dev/null 2>&1; then
  PY="python3"
elif command -v py >/dev/null 2>&1; then
  PY="py -3.12"
elif command -v python >/dev/null 2>&1; then
  PY="python"
fi

# جدّد الناتج من مصدر الحقيقة إن توفّر المولِّد وPython (وإلّا نستعمل المُلتزَم).
GEN="$LANG_REPO/scripts/codegen/gen_tmgrammar.py"
if [[ -f "$GEN" && -n "$PY" ]]; then
  echo "▶ توليد النحو من language-truth في مستودع اللغة ($PY)"
  ( cd "$LANG_REPO" && $PY "$GEN" )
elif [[ -f "$GEN" ]]; then
  echo "⚠️ المولِّد موجود لكن لا مُفسِّر Python — أستعمل الناتج المُلتزَم." >&2
fi

if [[ ! -f "$SRC" ]]; then
  echo "❌ ناتج النحو غير موجود: $SRC" >&2
  exit 1
fi

mkdir -p "$(dirname "$DEST")"
cp -f "$SRC" "$DEST"
echo "✅ زُومن النحو المحزوم من: $SRC"
