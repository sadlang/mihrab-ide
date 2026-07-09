#!/usr/bin/env bash
# مزامنة نحو ومقتطفات لغة ص المحزومة من مستودع اللغة (مصدر الحقيقة).
#
# كلاهما مولَّد في s-programming-language من language-truth/ عبر scripts/codegen/:
#   • النحو    editors/grammars/sad.tmLanguage.json  ← gen_tmgrammar.py
#   • المقتطفات editors/snippets/sad.code-snippets    ← gen_snippets.py [SAD-03]
# محراب يستهلك نسختين محزومتين؛ هذا السكربت يجلب أحدث ناتج (ويولّده إن لزم وكان المستودع متاحًا).
#
# الاستعمال:  bash build/sync-grammar.sh
#             SAD_LANG_REPO=/path/to/s-programming-language bash build/sync-grammar.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/extensions/sad-lang/syntaxes/sad.tmLanguage.json"
SNIPPET_DEST="$ROOT/extensions/sad-lang/snippets/sad.code-snippets"
LANG_REPO="${SAD_LANG_REPO:-$ROOT/../s-programming-language}"
SRC="$LANG_REPO/editors/grammars/sad.tmLanguage.json"
SNIPPET_SRC="$LANG_REPO/editors/snippets/sad.code-snippets"

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

# جدّد الناتجين من مصدر الحقيقة إن توفّر المولِّد وPython (وإلّا نستعمل المُلتزَم).
GEN="$LANG_REPO/scripts/codegen/gen_tmgrammar.py"
GEN_SNIP="$LANG_REPO/scripts/codegen/gen_snippets.py"
if [[ -n "$PY" ]]; then
  [[ -f "$GEN" ]] && { echo "▶ توليد النحو من language-truth ($PY)"; ( cd "$LANG_REPO" && $PY "$GEN" ); }
  [[ -f "$GEN_SNIP" ]] && { echo "▶ توليد المقتطفات من language-truth ($PY)"; ( cd "$LANG_REPO" && $PY "$GEN_SNIP" ); }
elif [[ -f "$GEN" || -f "$GEN_SNIP" ]]; then
  echo "⚠️ المولِّد موجود لكن لا مُفسِّر Python — أستعمل الناتج المُلتزَم." >&2
fi

# انسخ كلّ ناتج إن وُجد (النحو إلزاميّ؛ المقتطفات كذلك بعد SAD-03).
if [[ ! -f "$SRC" ]]; then
  echo "❌ ناتج النحو غير موجود: $SRC" >&2
  exit 1
fi
mkdir -p "$(dirname "$DEST")"
cp -f "$SRC" "$DEST"
echo "✅ زُومن النحو المحزوم من: $SRC"

if [[ ! -f "$SNIPPET_SRC" ]]; then
  echo "❌ ناتج المقتطفات غير موجود: $SNIPPET_SRC" >&2
  exit 1
fi
mkdir -p "$(dirname "$SNIPPET_DEST")"
cp -f "$SNIPPET_SRC" "$SNIPPET_DEST"
echo "✅ زُومنت المقتطفات المحزومة من: $SNIPPET_SRC"
