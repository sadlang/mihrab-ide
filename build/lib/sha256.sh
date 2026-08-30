#!/usr/bin/env bash
# بصمةُ ملفٍّ SHA-256 — دالّةٌ مشتركةٌ لأنّها تُختبَر.
#
# لا أداةَ واحدةَ تكفي المنصّاتِ الثلاث: `sha256sum` من coreutils غائبةٌ عن macOS
# (وهناك `shasum`)، وكلتاهما قد تغيبان عن بيئةٍ نحيفة. وحارسٌ يعتمد على أداةٍ قد
# تغيب يسقط في المنصّةِ التي جيء به ليحرسَها — وهو ما وقع فعلًا: سقط بناءُ macOS
# بـ`sha256sum: command not found` قبل أن يقيس بصمةَ الإضافةِ التي جاء يقيسها.
#
# وحين تغيب الثلاث: خطأٌ صريحٌ بحالةِ خروجٍ غيرِ صفريّة، لا بصمةٌ فارغةٌ تُقارَن.
sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$1"
  elif command -v python >/dev/null 2>&1; then
    python -c 'import hashlib,sys;print(hashlib.sha256(open(sys.argv[1],"rb").read()).hexdigest())' "$1"
  else
    echo "❌ لا أداةَ بصمةٍ في هذه البيئة (sha256sum · shasum · python) — لا يمكن التحقّق." >&2
    return 1
  fi
}
