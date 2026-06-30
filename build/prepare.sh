#!/usr/bin/env bash
# تحضير بناء محراب (م0): استنسخ المنبع المثبَّت في upstream.json وطبّق رُقَع الطبقة الثالثة.
# لا يبني — يهيّئ شجرة المصدر فقط. البناء يتبع توثيق المنبع (راجع build/README.md).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_JSON="$ROOT/upstream.json"
WORK="$ROOT/.upstream"          # شجرة المنبع المُحضَّرة (مُتجاهَلة في git)

# اقرأ التثبيت (jq إن وُجد، وإلا تحليل بسيط).
read_pin() {
  local key="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -r "$key" "$UPSTREAM_JSON"
  else
    # تحليل احتياطيّ بسيط (يكفي للحقول المسطّحة المعروفة).
    grep -oE "\"${key##*.}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" "$UPSTREAM_JSON" | head -1 | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/'
  fi
}

REPO="$(read_pin '.vscodium.repo')"
TAG="$(read_pin '.vscodium.tag')"

if [[ -z "$REPO" || -z "$TAG" ]]; then
  echo "خطأ: تعذّر قراءة تثبيت المنبع من $UPSTREAM_JSON" >&2
  exit 1
fi

echo "▶ المنبع المثبَّت: $REPO @ $TAG"

if [[ -d "$WORK/.git" ]]; then
  echo "▶ تحديث شجرة المنبع الموجودة إلى $TAG"
  git -C "$WORK" fetch --depth 1 origin "refs/tags/$TAG:refs/tags/$TAG"
  git -C "$WORK" checkout -f "$TAG"
else
  echo "▶ استنساخ المنبع (depth=1) عند $TAG"
  rm -rf "$WORK"
  git clone --depth 1 --branch "$TAG" "$REPO" "$WORK"
fi

# طبّق رُقَع الطبقة الثالثة (إن وُجدت). م0 يبدأ بلا رُقَع — الهويّة/RTL في م1/م3.
shopt -s nullglob
PATCHES=("$ROOT"/patches/*.patch)
if (( ${#PATCHES[@]} )); then
  echo "▶ تطبيق ${#PATCHES[@]} رُقعة (الطبقة الثالثة)"
  for p in "${PATCHES[@]}"; do
    echo "  - $(basename "$p")"
    git -C "$WORK" apply --3way "$p"
  done
else
  echo "▶ لا رُقَع بعد (م0: بناء نظيف بلا تعديل نواة)."
fi

echo "✅ شجرة المنبع جاهزة في: $WORK"
echo "   التالي: اتبع توثيق بناء المنبع (راجع build/README.md)."
