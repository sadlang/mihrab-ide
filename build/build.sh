#!/usr/bin/env bash
# بناء محراب م0 — VSCodium نظيف من المنبع المثبَّت، قابل للتكرار.
# ويندوز (Git Bash) · لينكس · macOS.
#
# يجسّد «وصفة م0»: يجهّز سلسلة أدوات معزولة في build/.toolchain (مُتجاهَلة)، ويطبّق
# خمسة إصلاحات بيئة لازمة لبناء VSCodium 1.121 على هذا الجهاز (راجع build/README.md
# §«وصفة م0 وإصلاحاتها»). idempotent: يُعاد تشغيله بأمان.
#
# الاستعمال:  bash build/build.sh           # بناء كامل
#             SKIP_SOURCE=yes bash build/build.sh   # أعد الاستعمال من شجرة منبع موجودة
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UP="$ROOT/.upstream"
TC="$ROOT/build/.toolchain"
mkdir -p "$TC"

# ══════════════════════════════════════════════════════════════════════════
#  (٠) المنصّة — يُشتَقّ كلُّ ما بعده منها
#
#  كان هذا السكربت ويندوزيًّا وحده، وكانت الويندوزيّةُ **مبثوثةً** فيه لا معلَنة:
#  ‏.exe في أسماء الأدوات، وcygpath في التصدير، ومسارُ مخرَجٍ حرفيّ. فبناءُ لينكس
#  لم يكن «غيرَ مدعوم» — كان يفشل متأخّرًا بعد أربعين دقيقة برسالةٍ عن ملفٍّ مفقود.
#  التصريحُ هنا يجعل الفشلَ (إن وقع) في السطر الأوّل لا في الساعة الأولى.
#
#  الاصطلاحاتُ تطابق dev/build.sh في المنبع (OS_NAME · VSCODE_ARCH) كي لا يكون
#  للمشروع تسميتان للشيء نفسه.
# ══════════════════════════════════════════════════════════════════════════
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) OS_NAME="windows" ;;
  Darwin)               OS_NAME="osx" ;;
  Linux)                OS_NAME="linux" ;;
  *) echo "❌ منصّةٌ غيرُ مدعومة: $(uname -s)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  aarch64|arm64) VSCODE_ARCH="arm64" ;;
  *)             VSCODE_ARCH="x64" ;;
esac
VSCODE_ARCH="${MIHRAB_ARCH:-$VSCODE_ARCH}"
export OS_NAME VSCODE_ARCH

IS_WIN=no; [[ "$OS_NAME" == "windows" ]] && IS_WIN=yes
EXE_SUFFIX=""; [[ "$IS_WIN" == "yes" ]] && EXE_SUFFIX=".exe"

# مجلّدُ المخرَج ومسارُ التطبيق داخله. الفرقُ الجوهريّ في macOS: المخرَجُ حزمة
# ‏`.app` وليس شجرةً مسطّحة، فمسارُ `resources/app` يغوص في Contents.
case "$OS_NAME" in
  windows) OUT_NAME="VSCode-win32-$VSCODE_ARCH"
           APP_REL="resources/app"
           LAUNCH_REL="Mihrab.exe" ;;
  linux)   OUT_NAME="VSCode-linux-$VSCODE_ARCH"
           APP_REL="resources/app"
           LAUNCH_REL="bin/mihrab" ;;
  # macOS: اسمُ الحزمة يُشتَقّ من nameLong وهو **عربيّ** («محراب.app»)، فلا يُكتب
  # حرفيًّا هنا — يُحلّ بالبحث بعد البناء. وكتابةُ «Mihrab.app» تجعل الفحصَ يفشل
  # على بناءٍ سليم، وهو أسوأُ من ألّا يكون هناك فحص.
  osx)     OUT_NAME="VSCode-darwin-$VSCODE_ARCH"
           APP_REL=""            # يُحلّ بعد البناء
           LAUNCH_REL="" ;;
esac

# تحويلُ مسارٍ إلى صيغة النظام لمستهلكٍ غير POSIX (node-gyp على ويندوز وحده).
winpath() { if [[ "$IS_WIN" == "yes" ]]; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

# مَخرَجٌ للفحص: يطبع ما استنتجه ثمّ يخرج. سببُ وجوده أنّ CI يجب أن يتحقّق من
# صحّة الكشف في ثوانٍ لا أن ينتظر أربعين دقيقةً ليكتشف أنّه بنى للمنصّة الخطأ.
if [[ "${1:-}" == "--platform" ]]; then
  echo "$OS_NAME/$VSCODE_ARCH out=$OUT_NAME"
  exit 0
fi

# ── إصدارات سلسلة الأدوات (طابِق NODE_VERSION مع vscode/.nvmrc للمنبع المثبَّت) ──
NODE_VERSION="${MIHRAB_NODE_VERSION:-22.22.1}"
JQ_VERSION="1.7.1"
NODEGYP_VERSION="13.0.0"   # 11.x لا يعرف VS 2026 (v18)؛ 13 يدعم [2019,2022,2026]
PYTHON_HINT="${MIHRAB_PYTHON:-}"   # مسار python3.12؛ يُكتشف تلقائيًّا إن تُرك فارغًا

log() { echo "▶ $*"; }

# ── (أ) Node محمول مطابق لـ.nvmrc (Node النظام قد يكون أقدم من أن يشغّل ملفّات .ts) ──
# اسمُ التوزيعة وصيغةُ الأرشيف وموضعُ الثنائيّ داخله تختلف الثلاثةُ بين المنصّات،
# ولا اشتقاقَ يجمعها — فتُذكَر صراحةً.
case "$OS_NAME" in
  windows) NODE_SLUG="node-v${NODE_VERSION}-win-x64";                NODE_PKG="zip";    NODE_BIN_SUB="" ;;
  linux)   NODE_SLUG="node-v${NODE_VERSION}-linux-${VSCODE_ARCH}";   NODE_PKG="tar.xz"; NODE_BIN_SUB="/bin" ;;
  osx)     NODE_SLUG="node-v${NODE_VERSION}-darwin-${VSCODE_ARCH}";  NODE_PKG="tar.gz"; NODE_BIN_SUB="/bin" ;;
esac
NODE_DIR="$TC/$NODE_SLUG"
NODE_BIN="$NODE_DIR$NODE_BIN_SUB"

if [[ ! -x "$NODE_BIN/node$EXE_SUFFIX" ]]; then
  log "تنزيل Node ${NODE_VERSION} المحمول ($NODE_SLUG)"
  # -f يُفشِل عند 4xx/5xx؛ نُنزِّل لملفّ مؤقّت ثمّ نُعيد التسمية حتى لا يبقى أرشيفٌ ناقص
  # يُربك إعادة التشغيل لو انقطع التنزيل في المنتصف.
  curl -fsSL --retry 3 -o "$TC/node.$NODE_PKG.part" \
       "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_SLUG}.${NODE_PKG}"
  mv -f "$TC/node.$NODE_PKG.part" "$TC/node.$NODE_PKG"
  if [[ "$IS_WIN" == "yes" ]]; then
    powershell -NoProfile -Command "Expand-Archive -Force -Path '$(cygpath -w "$TC/node.zip")' -DestinationPath '$(cygpath -w "$TC")'"
  else
    tar -C "$TC" -xf "$TC/node.$NODE_PKG"
  fi
  rm -f "$TC/node.$NODE_PKG"
  # تحقّق أنّ الاستخراج أنتج ثنائيًّا فعلًا (Expand-Archive قد يفشل بصمت في powershell).
  [[ -x "$NODE_BIN/node$EXE_SUFFIX" ]] || { echo "❌ فشل استخراج Node إلى $NODE_DIR" >&2; exit 1; }
fi
export PATH="$NODE_BIN:$TC:$PATH"
log "المنصّة=$OS_NAME/$VSCODE_ARCH · Node=$(node -v) npm=$(npm -v)"

# ── (ب) jq (يحتاجه get_repo.sh/utils.sh في المنبع) ──
case "$OS_NAME" in
  windows) JQ_ASSET="jq-windows-amd64.exe" ;;
  linux)   JQ_ASSET="jq-linux-$([[ "$VSCODE_ARCH" == "arm64" ]] && echo arm64 || echo amd64)" ;;
  osx)     JQ_ASSET="jq-macos-$([[ "$VSCODE_ARCH" == "arm64" ]] && echo arm64 || echo amd64)" ;;
esac
JQ_BIN="$TC/jq$EXE_SUFFIX"
if [[ ! -x "$JQ_BIN" ]]; then
  log "تنزيل jq ${JQ_VERSION} ($JQ_ASSET)"
  # نُنزِّل لملفّ مؤقّت ثمّ نُعيد التسمية: يمنع بقاء jq ناقص (يجتاز فحص -x) عند انقطاع.
  curl -fsSL --retry 3 -o "$JQ_BIN.part" \
       "https://github.com/jqlang/jq/releases/download/jq-${JQ_VERSION}/${JQ_ASSET}"
  chmod +x "$JQ_BIN.part"
  mv -f "$JQ_BIN.part" "$JQ_BIN"
  # تحقّق أنّ الثنائيّ يعمل (تنزيل صفحة خطأ HTML يجتاز فحص الوجود لكن لا يُنفَّذ).
  "$JQ_BIN" --version >/dev/null 2>&1 || { echo "❌ jq المُنزَّل لا يعمل — تحقّق من الرابط/الشبكة." >&2; rm -f "$JQ_BIN"; exit 1; }
fi

# ── (ج) تحضير شجرة المنبع (استنساخ VSCodium المثبَّت + رُقَع محراب) ──
if [[ "${SKIP_SOURCE:-no}" != "yes" || ! -d "$UP/.git" ]]; then
  log "تحضير المنبع عبر prepare.sh"
  bash "$ROOT/build/prepare.sh"
fi

# ══════════════════════════════════════════════════════════════════════════
#  (د)+(هـ)+(ز) إصلاحاتُ سلسلةِ أدوات ويندوز — **لا تُنفَّذ على غيرها**
#
#  الثلاثةُ تعالج أعطالَ MSVC وحدها: node-gyp لا يعرف VS 2026، ومكتباتُ Spectre
#  غير مثبّتة، وvswhere يكتشف موضعَ VS. ولينكس وmacOS يبنيان بـclang/gcc من
#  النظام، فتشغيلُها هناك ليس زائدًا فحسب — بل يُتلف node-gyp سليمًا ثمّ يفشل
#  البناءُ بعده بسببٍ لا صلةَ له بالسبب المكتوب في الرسالة.
# ══════════════════════════════════════════════════════════════════════════
if [[ "$IS_WIN" == "yes" ]]; then

# ── (د) استبدال node-gyp المدمج بـ13 (يدعم VS 2026). تجاوز npm_config_node_gyp
#        وحده لا يكفي لأنّ وحدات تنادي node-gyp في سكربتها ⇒ نستبدل المدمج فعليًّا. ──
BUNDLED_GYP="$NODE_DIR/node_modules/npm/node_modules/node-gyp"
gyp_version() { node "$BUNDLED_GYP/bin/node-gyp.js" --version 2>/dev/null | tr -d 'v\r'; }
if [[ "$(gyp_version)" != "$NODEGYP_VERSION" ]]; then
  log "ترقية node-gyp المدمج إلى ${NODEGYP_VERSION}"
  STAGE="$TC/nodegyp"; rm -rf "$STAGE"; mkdir -p "$STAGE"
  npm install "node-gyp@${NODEGYP_VERSION}" --prefix "$STAGE" --no-audit --no-fund >/dev/null
  # تحقّق أنّ التثبيت أنتج node-gyp قبل حذف المدمج (وإلا نُتلِف node-gyp بلا بديل).
  [[ -d "$STAGE/node_modules/node-gyp" ]] || { echo "❌ فشل تثبيت node-gyp@${NODEGYP_VERSION} في $STAGE" >&2; exit 1; }
  rm -rf "$BUNDLED_GYP"
  cp -r "$STAGE/node_modules/node-gyp" "$BUNDLED_GYP"
  mkdir -p "$BUNDLED_GYP/node_modules"
  for d in "$STAGE"/node_modules/*; do
    # if لا «A && continue»: الأخيرة تُفشِل الحلقة تحت set -e عند أوّل تبعيّة ليست node-gyp.
    if [[ "$(basename "$d")" == "node-gyp" ]]; then continue; fi
    cp -r "$d" "$BUNDLED_GYP/node_modules/$(basename "$d")"
  done
  log "node-gyp = $(gyp_version)"
fi

# ── (هـ) ترقيع Spectre: مكتبات Spectre غير مثبّتة في VS 2026 وتثبيتها يحتاج رفعًا
#        تفاعليًّا (UAC). نُجبر مولّد msvs على SpectreMitigation=false لتفادي MSB8040.
#        انحراف م0 معروف — لبناء إنتاجيّ تُثبَّت مكتبات Spectre ويُزال هذا الترقيع. ──
MSVS_PY="$BUNDLED_GYP/gyp/pylib/gyp/generator/msvs.py"
[[ -f "$MSVS_PY" ]] || { echo "❌ لم يُعثر على msvs.py في $MSVS_PY — بنية node-gyp غير متوقّعة." >&2; exit 1; }
if ! grep -q 'spectre_mitigation = "false"' "$MSVS_PY"; then
  log "ترقيع msvs.py لتعطيل SpectreMitigation"
  python "$ROOT/build/patch_node_gyp_spectre.py" "$MSVS_PY"
  # امسح أيّ bytecode مخبَّأ للمولِّد القديم حتى يُحمَّل المُرقَّع (احتمال غياب الدليل مقبول).
  find "$BUNDLED_GYP" -name "msvs.cpython-*.pyc" -delete 2>/dev/null || true
fi

fi  # ── نهاية إصلاحات ويندوز (د)+(هـ) ──

# ── (و) ترقيع رقصة .npmrc في prepare_vscode.sh (تتوقّف تحت set -e عند حالة متبقّية) ──
PVS="$UP/prepare_vscode.sh"
if [[ -f "$PVS" ]] && ! grep -q 'محراب م0: تسامح مع غياب .npmrc' "$PVS"; then
  log "ترقيع prepare_vscode.sh (تسامح .npmrc)"
  python "$ROOT/build/patch_npmrc_tolerance.py" "$PVS"
fi

# ── (و-2) ترقيع build_cli.sh: «mkdir openssl» (بلا -p) يفشل تحت set -e عند إعادة
#         الاستعمال (المجلّد موجود من بناء سابق). نجعله idempotent. ──
BCL="$UP/build_cli.sh"
if [[ -f "$BCL" ]] && grep -qE '^mkdir openssl$' "$BCL"; then
  log "ترقيع build_cli.sh (mkdir -p openssl)"
  # ⚠️ لا `sed -i`: صيغتُه تختلف بين GNU وBSD — الأخيرةُ (macOS) تُلزِم بلاحقةٍ بعد
  # ‏-i، فتبتلع النمطَ التالي وتموت بـ«-I or -i may not be used with stdin».
  # وأمسكها حارسُ المنصّات في أوّل تشغيلٍ له، بعد ثلاث ثوانٍ من بدء بناء macOS.
  sed 's/^mkdir openssl$/mkdir -p openssl/' "$BCL" > "$BCL.tmp" && mv -f "$BCL.tmp" "$BCL"
fi

# ── (و-3) اسمُ حزمة macOS: المنبع يشتقّه من nameShort، ومغلِّفُ vscode من nameLong ──
# متطابقان في VSCodium («VSCodium») فلا يظهر الفرق. وعندنا nameShort لاتينيّ
# (Mihrab — منه اسمُ التنفيذيّ) وnameLong عربيّ (محراب)، فيُبنى «محراب.app»
# ويُبحَث عن «Mihrab.app». يفشل بعد ست عشرة دقيقة، في آخر خطوة، على macOS وحدها.
if [[ -f "$UP/build_cli.sh" ]]; then
  python "$ROOT/build/patch_cli_macapp.py" "$UP/build_cli.sh" "$UP/prepare_assets.sh" \
    || { echo "❌ فشل ترقيع مسار حزمة macOS." >&2; exit 1; }
fi

# ── (ز) بيئة البناء + كشف Visual Studio و Python تلقائيًّا ──
VSWHERE="/c/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe"
if [[ "$IS_WIN" == "yes" && -x "$VSWHERE" ]]; then
  VS_PATH="$("$VSWHERE" -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>/dev/null | tr -d '\r')"
  # فحص vscode للمترجم يقبل 2022/2019 ويكتفي بوجود المسار ⇒ نوجّهه إلى أحدث VS.
  # ملاحظة: نستعمل if لا «A && B» لأنّ الأخيرة تُفشِل السكربت تحت set -e عند فراغ المسار.
  if [[ -n "$VS_PATH" ]]; then export vs2022_install="$(cygpath -w "$VS_PATH")"; fi
fi
if [[ -z "$PYTHON_HINT" && "$IS_WIN" == "yes" ]]; then
  PYTHON_HINT="$(py -3.12 -c 'import sys;print(sys.executable)' 2>/dev/null | tr -d '\r' || true)"
fi
# if لا «A && B»: غياب python يجب أن يَسقط للنظام لا أن يُوقف البناء تحت set -e.
if [[ -n "$PYTHON_HINT" ]]; then export npm_config_python="$PYTHON_HINT"; fi
# node-gyp المُستبدَل لا وجودَ له خارج ويندوز؛ npm يستعمل المدمج وهو الصواب هناك.
if [[ "$IS_WIN" == "yes" ]]; then
  export npm_config_node_gyp="$(winpath "$BUNDLED_GYP/bin/node-gyp.js")"
fi
# عددُ الأنوية لا ١٢ ثابتًا: عدّاءُ CI يملك ٢–٤، وطلبُ ١٢ وظيفة عليه يُثقل الذاكرة
# فيُقتل البناءُ بـOOM في منتصفه — وهو فشلٌ يصعب ردُّه إلى سببه.
JOBS="${MIHRAB_JOBS:-$( { nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4; } )}"
export npm_config_jobs="$JOBS"
export UV_THREADPOOL_SIZE="$JOBS"
export NODE_OPTIONS="--max-old-space-size=8192"
export VSCODE_SKIP_NODE_VERSION_CHECK=yes
log "vs2022_install=${vs2022_install:-<افتراضيّ>} · python=${npm_config_python:-<النظام>}"

# ── (ز-2) هوية محراب (م1، الطبقة الثانية): ادمج product-overrides/product.json فوق
#         product.json الخاصّ بـVSCodium. prepare_vscode.sh يدمج «../product.json»
#         فوق إعداداته (jq .[0]*.[1]) ⇒ قيمنا تسود. idempotent (دمج نفس المفاتيح).
#         نحذف ._comment حتى لا يتسرّب حقل غير معروف إلى product.json النهائيّ. ──
OVERRIDES="$ROOT/product-overrides/product.json"
if [[ -f "$OVERRIDES" ]]; then
  log "تطبيق هوية محراب (product.json)"
  # تحقّق أنّ هدف الدمج موجود (prepare.sh يُنتجه)؛ غيابه يعني خللًا في خطوة (ج).
  [[ -f "$UP/product.json" ]] || { echo "❌ $UP/product.json غير موجود — فشلت خطوة (ج) تحضير المنبع؟" >&2; exit 1; }
  # نكتب لملفّ مؤقّت ثمّ نُعيد التسمية ذرّيًّا: فشل jq (JSON تالف/خطأ قرص) يُجهض
  # قبل mv فلا يُداس product.json الصالح بناتج ناقص. ننظّف tmp عند الفشل.
  # نحذف **كلّ** مفتاحٍ يبدأ بـ_comment لا `._comment` وحده: أضفنا تعليقًا ثانيًا
  # (‏_comment_update) فكاد يتسرّب حقلٌ غير معروف إلى المنتج — حذفٌ بالاسم الواحد
  # يصمت عن الثاني ولا يُبلِّغ.
  if ! jq -s '.[0] * .[1] | with_entries(select(.key | startswith("_comment") | not))' "$UP/product.json" "$OVERRIDES" > "$UP/product.json.tmp"; then
    rm -f "$UP/product.json.tmp"
    echo "❌ فشل دمج هوية محراب عبر jq — تحقّق من صحّة $OVERRIDES و$UP/product.json." >&2
    exit 1
  fi
  mv -f "$UP/product.json.tmp" "$UP/product.json"
fi

# ── (ز-2ب) حزم إضافات محراب المدمجة (م2-أ، الطبقة 1) + رُقَع نواة محراب (الطبقة 3):
#         جهّزها في .mihrab-* (تنجو من git reset في وضع -s) ورقّع build.sh المنبع
#         ليحقنها بعد cd vscode (لا قبل dev/build.sh لأنّ «git add . ; git reset
#         --hard» يحذف غير المتعقَّب). يشمل التعريب (إضافة لغة عربيّة + لغة افتراضيّة). ──
STAGE_EXT="$UP/.mihrab-extensions"
rm -rf "$STAGE_EXT"; mkdir -p "$STAGE_EXT"
shopt -s nullglob
for ext in "$ROOT"/extensions/*/; do
  [[ -f "${ext}package.json" ]] || continue
  _dst="$STAGE_EXT/$(basename "$ext")"
  cp -r "$ext" "$_dst"
  # جرّد مصنوعات التوليد غير الوقتيّة من النسخة المشحونة (cp -r لا يحترم .vscodeignore):
  # سكربتات مولِّدات السمات/الأيقونات (*.py) و__pycache__ ليست جزءًا من المنتج.
  find "$_dst" -type d -name '__pycache__' -prune -exec rm -rf {} + 2>/dev/null || true
  find "$_dst" -type f -name '*.py' -delete 2>/dev/null || true
  log "إضافة مدمجة مُجهَّزة: $(basename "$ext")"
done
shopt -u nullglob

# ── (ز-2ب-2) حزم سلسلة أدوات ص المدمجة (الخيار ١): احقن sad-run.exe في bin/ داخل
#         نسخة mihrab-welcome المُجهَّزة كي يعمل «شغّل ملفّ ص» فورًا دون تثبيت. المصدر:
#         MIHRAB_SAD_RUN إن ضُبط، وإلّا الافتراضيّ المجاور (../sad-engines-dev/sad-run.exe).
#         **سقوط رشيق لا قاتل** (بخلاف الهوية/RTL): غياب الثنائيّ يعني بناءً بلا تشغيل مدمج،
#         والامتداد يسقط إلى PATH ويعرض تلميح التثبيت — لا نُفشِل البناء كلّه لأجله.
#         الهدف المستقبليّ (الخيار ٣، موثَّق في docs/toolchain-delivery.md): أمر «ثبّت أدوات ص»
#         يُنزّل أحدث إصدار عند الطلب فوق هذا المدمج. (راجع resolveSadRun في extension.js.)
SAD_RUN_SRC="${MIHRAB_SAD_RUN:-$ROOT/../sad-engines-dev/sad-run$EXE_SUFFIX}"
# [SAD-02] مصدر أداة الفحص المدمجة (تشخيص عند الحفظ عبر sad-check --json). نفس اصطلاح sad-run.
SAD_CHECK_SRC="${MIHRAB_SAD_CHECK:-$ROOT/../sad-engines-dev/sad-check$EXE_SUFFIX}"
# [SAD-04] مصدر أداة البناء المدمجة (أمر «ابنِ» عبر sad-build). نفس اصطلاح sad-run/sad-check.
SAD_BUILD_SRC="${MIHRAB_SAD_BUILD:-$ROOT/../sad-engines-dev/sad-build$EXE_SUFFIX}"
# [SAD-01] مصدر خادم ص اللغويّ المدمج (LSP: تشخيص/إكمال/تحويم/تعريف). نفس اصطلاح الأدوات؛
# يُحزَم في bin/ داخل نسخة sad-lang المُجهَّزة (لا mihrab-welcome — العميل يسكن في sad-lang).
SAD_LSP_SRC="${MIHRAB_SAD_LSP:-$ROOT/../sad-engines-dev/sad-lsp$EXE_SUFFIX}"
# [AR-02] مصدر خطّ ص العربيّ المحزوم (Kawkab Mono، OFL). يُستهلَك مرّتين: (١) media/ لوحة الترحيب
# (AR-01 تُضمّنه data:URI)، (٢) @font-face وثيقة الـworkbench (تجهيز أدناه). MIHRAB_ARABIC_FONT أو الافتراضيّ.
ARABIC_FONT_SRC="${MIHRAB_ARABIC_FONT:-$ROOT/patches/fonts/kawkab-mono.woff2}"
if [[ -d "$STAGE_EXT/mihrab-welcome" ]]; then
  WELCOME_BIN="$STAGE_EXT/mihrab-welcome/bin"
  # نظّف أيّ bin/ منسوخ من الشجرة المصدريّة (قد يوجد على جهاز مطوّر رغم تجاهله في git):
  # لا نشحن إلّا الثنائيّات من المصدر المعتمَد، أو لا شيء — فلا نسخة بائتة تُشحن صامتًا. [H1]
  rm -rf "$WELCOME_BIN"
  mkdir -p "$WELCOME_BIN"
  # (أ) sad-run — «شغّل ملفّ ص» المدمج.
  if [[ -f "$SAD_RUN_SRC" ]]; then
    cp -f "$SAD_RUN_SRC" "$WELCOME_BIN/sad-run$EXE_SUFFIX"
    log "حُزِمت أداة ص المدمجة: sad-run.exe ($(du -h "$WELCOME_BIN/sad-run$EXE_SUFFIX" 2>/dev/null | cut -f1 || echo '؟')) من $SAD_RUN_SRC"
  else
    log "⚠️ لا sad-run.exe في $SAD_RUN_SRC — بناء بلا تشغيل مدمج (يسقط الامتداد إلى PATH). اضبط MIHRAB_SAD_RUN للحزم."
  fi
  # (ب) sad-check — جسر التشخيص عند الحفظ [SAD-02]. سقوط رشيق كذلك: غيابه ⇒ الجسر يسقط إلى PATH.
  if [[ -f "$SAD_CHECK_SRC" ]]; then
    cp -f "$SAD_CHECK_SRC" "$WELCOME_BIN/sad-check$EXE_SUFFIX"
    log "حُزِمت أداة الفحص المدمجة: sad-check.exe ($(du -h "$WELCOME_BIN/sad-check$EXE_SUFFIX" 2>/dev/null | cut -f1 || echo '؟')) من $SAD_CHECK_SRC"
  else
    log "⚠️ لا sad-check.exe في $SAD_CHECK_SRC — تشخيص الحفظ يسقط إلى PATH. اضبط MIHRAB_SAD_CHECK للحزم."
  fi
  # (ج) sad-build — أمر «ابنِ» [SAD-04]. سقوط رشيق كذلك: غيابه ⇒ أمر البناء يسقط إلى PATH.
  if [[ -f "$SAD_BUILD_SRC" ]]; then
    cp -f "$SAD_BUILD_SRC" "$WELCOME_BIN/sad-build$EXE_SUFFIX"
    log "حُزِمت أداة البناء المدمجة: sad-build.exe ($(du -h "$WELCOME_BIN/sad-build$EXE_SUFFIX" 2>/dev/null | cut -f1 || echo '؟')) من $SAD_BUILD_SRC"
  else
    log "⚠️ لا sad-build.exe في $SAD_BUILD_SRC — أمر البناء يسقط إلى PATH. اضبط MIHRAB_SAD_BUILD للحزم."
  fi
  # (ج-2) حمولةٌ مجاورةٌ للأدوات (`MIHRAB_SAD_PAYLOAD`): المكتبةُ القياسيّة ومكتباتُ
  #        التشغيل التي تأتي في الإصدار الرسميّ. برنامجٌ نصّيٌّ يعمل بلا هذه (قِسناه)،
  #        لكنّ استيرادَ المكتبة القياسيّة يحتاجها — فشحنُ الثنائيّ وحدَه يُنتج «يعمل
  #        في مثال الترحيب ويسقط في أوّل استيراد»، وهو أسوأُ من غيابٍ صريح.
  if [[ -n "${MIHRAB_SAD_PAYLOAD:-}" && -d "$MIHRAB_SAD_PAYLOAD" && -d "$WELCOME_BIN" ]]; then
    for item in "$MIHRAB_SAD_PAYLOAD"/*; do
      base="$(basename "$item")"
      case "$base" in sad-run*|sad-build*|sad-check*|sad-lsp*) continue ;; esac
      cp -rf "$item" "$WELCOME_BIN/" && log "حمولةُ ص المجاورة: $base"
    done
  fi
  # لا تشحن دليلًا فارغًا إن غابت كلّ الأدوات (يُبقي السلوك كما لو لم يُنشأ bin/).
  rmdir "$WELCOME_BIN" 2>/dev/null || true
  # (د) [AR-02] الخطّ العربيّ المحزوم في media/ لوحة الترحيب: تُضمّنه لوحة المخرجات (AR-01) كـdata:URI
  # كي تعرض المخرجات بالخطّ المحزوم عينه (الـwebview معزول عن @font-face الـworkbench). سقوط رشيق.
  if [[ -f "$ARABIC_FONT_SRC" ]]; then
    WELCOME_MEDIA="$STAGE_EXT/mihrab-welcome/media"
    mkdir -p "$WELCOME_MEDIA"
    cp -f "$ARABIC_FONT_SRC" "$WELCOME_MEDIA/kawkab-mono.woff2"
    log "حُزِم الخطّ العربيّ في لوحة الترحيب: media/kawkab-mono.woff2 من $ARABIC_FONT_SRC"
  fi
fi

# ── (ز-2ب-3) [SAD-01] حزم خادم ص اللغويّ المدمج: احقن sad-lsp.exe في bin/ داخل نسخة sad-lang
#         المُجهَّزة كي يعمل الذكاء اللغويّ (تشخيص/إكمال/تحويم/تعريف) فورًا دون تثبيت. **سقوط رشيق
#         لا قاتل**: غياب الثنائيّ ⇒ العميل يسقط إلى PATH ويعرض تلميح تثبيت (LSP تحسينيّ لا شرط صحّة).
if [[ -d "$STAGE_EXT/sad-lang" ]]; then
  SADLANG_BIN="$STAGE_EXT/sad-lang/bin"
  # نظّف أيّ bin/ منسوخ من الشجرة المصدريّة (قد يوجد على جهاز مطوّر رغم تجاهله في git):
  # لا نشحن إلّا الثنائيّ من المصدر المعتمَد، أو لا شيء — فلا نسخة بائتة تُشحن صامتًا.
  rm -rf "$SADLANG_BIN"
  mkdir -p "$SADLANG_BIN"
  if [[ -f "$SAD_LSP_SRC" ]]; then
    cp -f "$SAD_LSP_SRC" "$SADLANG_BIN/sad-lsp$EXE_SUFFIX"
    log "حُزِم خادم ص اللغويّ المدمج: sad-lsp.exe ($(du -h "$SADLANG_BIN/sad-lsp$EXE_SUFFIX" 2>/dev/null | cut -f1 || echo '؟')) من $SAD_LSP_SRC"
  else
    log "⚠️ لا sad-lsp.exe في $SAD_LSP_SRC — الذكاء اللغويّ يسقط إلى PATH. اضبط MIHRAB_SAD_LSP للحزم."
  fi
  # لا تشحن دليلًا فارغًا إن غاب الخادم (يُبقي السلوك كما لو لم يُنشأ bin/).
  rmdir "$SADLANG_BIN" 2>/dev/null || true
fi

# جهّز رُقَع النواة + أصولها (تُطبَّق داخل build.sh المنبع بعد cd vscode، فتنجو من reset).
[[ -f "$ROOT/build/patch_main_locale.py" ]] && cp -f "$ROOT/build/patch_main_locale.py" "$UP/.mihrab-patch-main-locale.py"
[[ -f "$ROOT/build/patch_workbench_rtl.py" ]] && cp -f "$ROOT/build/patch_workbench_rtl.py" "$UP/.mihrab-patch-workbench-rtl.py"
[[ -f "$ROOT/build/patch_menubar_rtl.py" ]] && cp -f "$ROOT/build/patch_menubar_rtl.py" "$UP/.mihrab-patch-menubar-rtl.py"
[[ -f "$ROOT/build/patch_menu_rtl.py" ]] && cp -f "$ROOT/build/patch_menu_rtl.py" "$UP/.mihrab-patch-menu-rtl.py"
[[ -f "$ROOT/build/patch_splitview_rtl.py" ]] && cp -f "$ROOT/build/patch_splitview_rtl.py" "$UP/.mihrab-patch-splitview-rtl.py"
[[ -f "$ROOT/build/patch_sash_rtl.py" ]] && cp -f "$ROOT/build/patch_sash_rtl.py" "$UP/.mihrab-patch-sash-rtl.py"
[[ -f "$ROOT/build/patch_tabsdrop_rtl.py" ]] && cp -f "$ROOT/build/patch_tabsdrop_rtl.py" "$UP/.mihrab-patch-tabsdrop-rtl.py"
[[ -f "$ROOT/build/patch_gridview_marker.py" ]] && cp -f "$ROOT/build/patch_gridview_marker.py" "$UP/.mihrab-patch-gridview-marker.py"
[[ -f "$ROOT/build/patch_editor_rtl.py" ]] && cp -f "$ROOT/build/patch_editor_rtl.py" "$UP/.mihrab-patch-editor-rtl.py"
[[ -f "$ROOT/build/patch_welcome_rtl.py" ]] && cp -f "$ROOT/build/patch_welcome_rtl.py" "$UP/.mihrab-patch-welcome-rtl.py"
[[ -f "$ROOT/build/patch_walkthroughs_drop.py" ]] && cp -f "$ROOT/build/patch_walkthroughs_drop.py" "$UP/.mihrab-patch-walkthroughs-drop.py"
[[ -f "$ROOT/build/patch_html_lang.py" ]] && cp -f "$ROOT/build/patch_html_lang.py" "$UP/.mihrab-patch-html-lang.py"
[[ -f "$ROOT/build/patch_dialog_style.py" ]] && cp -f "$ROOT/build/patch_dialog_style.py" "$UP/.mihrab-patch-dialog-style.py"
# مجلّد إعدادات المشروع `.محراب` (بتوافقٍ خلفيّ مع `.vscode`). ينسخ معه وحدتَي TS
# جديدتَين — فالرقعةُ تُضيف ملفّات لا تعدّل قائمًا وحسب.
[[ -f "$ROOT/build/patch_config_folder.py" ]] && cp -f "$ROOT/build/patch_config_folder.py" "$UP/.mihrab-patch-config-folder.py"
# تعريب عناوين لوحة الإعدادات (تُشتَقّ حسابيًّا فلا تصلها ترجمةُ NLS). ينسخ معه وحدةَ
# TS واحدة عبر .mihrab-core أدناه.
[[ -f "$ROOT/build/patch_settings_labels.py" ]] && cp -f "$ROOT/build/patch_settings_labels.py" "$UP/.mihrab-patch-settings-labels.py"
[[ -d "$ROOT/patches/core" ]] && { rm -rf "$UP/.mihrab-core"; cp -rf "$ROOT/patches/core" "$UP/.mihrab-core"; }
[[ -f "$ROOT/patches/mihrab-rtl.css" ]] && cp -f "$ROOT/patches/mihrab-rtl.css" "$UP/.mihrab-rtl.css"
# [AR-02] جهّز خطّ ص العربيّ المحزوم لوثيقة الـworkbench: patch_bundle يشتقّ منه base64 ويحقن
# @font-face بمصدر data: URI في نسخة media من mihrab-rtl.css (لا url() نسبيّ: يكسر بناء esbuild —
# لا loader لـ.woff2). المصدر ARABIC_FONT_SRC معرَّف أعلى الملفّ. سقوط رشيق: غيابه ⇒ لا حقن.
[[ -f "$ARABIC_FONT_SRC" ]] && cp -f "$ARABIC_FONT_SRC" "$UP/.mihrab-kawkab-mono.woff2"
# جهّز أصول هوية محراب البصريّة (أيقونة التطبيق + بلاطتا ويندوز) في مجلّد ينجو من reset،
# ليحقنها build.sh المنبع فوق resources/win32/ بعد cd vscode (تستبدل هوية VSCodium).
BRAND_SRC="$ROOT/assets/branding"
BRAND_STAGE="$UP/.mihrab-branding"
rm -rf "$BRAND_STAGE"; mkdir -p "$BRAND_STAGE"
[[ -f "$BRAND_SRC/mihrab.ico" ]] && cp -f "$BRAND_SRC/mihrab.ico" "$BRAND_STAGE/code.ico"
[[ -f "$BRAND_SRC/mihrab_150x150.png" ]] && cp -f "$BRAND_SRC/mihrab_150x150.png" "$BRAND_STAGE/code_150x150.png"
[[ -f "$BRAND_SRC/mihrab_70x70.png" ]] && cp -f "$BRAND_SRC/mihrab_70x70.png" "$BRAND_STAGE/code_70x70.png"
# أيقونتا لينكس وmacOS. كانتا مفقودتين حين كان البناءُ ويندوزيًّا وحده، وغيابُهما
# لا يُفشل بناءً — يشحن شعارَ VSCodium في شريط مهامّ لينكس وفي Dock. وهو من صنف
# updateUrl الموروث: البناءُ ينجح والمستخدمُ يرى مشروعًا آخر.
if [[ -f "$BRAND_SRC/mihrab-mark-color-256.png" ]]; then
  cp -f "$BRAND_SRC/mihrab-mark-color-256.png" "$BRAND_STAGE/code.png"
  python "$ROOT/build/gen_icns.py" "$BRAND_SRC/mihrab-mark-color-256.png" \
         "$BRAND_STAGE/code.icns" >/dev/null \
    || { echo "❌ فشل توليد code.icns" >&2; exit 1; }
fi
# شعار رأس التطبيق (code-icon.svg) + خلفية المحرّر الفارغ (letterpress-*.svg) — أصول SVG
# تُحقَن فوق مصدر vscode في كتلة INJECT، فيظهر شعار القوس في شريط العنوان والخلفية أيضًا.
[[ -f "$BRAND_SRC/mihrab-appicon.svg" ]] && cp -f "$BRAND_SRC/mihrab-appicon.svg" "$BRAND_STAGE/code-icon.svg"
for _lp in dark light hcDark hcLight; do
  [[ -f "$BRAND_SRC/mihrab-letterpress-$_lp.svg" ]] && cp -f "$BRAND_SRC/mihrab-letterpress-$_lp.svg" "$BRAND_STAGE/letterpress-$_lp.svg"
done
# أصول مساحة sessions التجريبيّة (شعار الحوض + أيقونة Open-in + خلفيّتها الفارغة).
[[ -f "$BRAND_SRC/mihrab-sessions-icon.svg" ]] && cp -f "$BRAND_SRC/mihrab-sessions-icon.svg" "$BRAND_STAGE/vscode-icon.svg"
[[ -f "$BRAND_SRC/mihrab-vscodeLogoPath.ts" ]] && cp -f "$BRAND_SRC/mihrab-vscodeLogoPath.ts" "$BRAND_STAGE/vscodeLogoPath.ts"
for _lps in dark light; do
  [[ -f "$BRAND_SRC/mihrab-letterpress-sessions-$_lps.svg" ]] && cp -f "$BRAND_SRC/mihrab-letterpress-sessions-$_lps.svg" "$BRAND_STAGE/letterpress-sessions-$_lps.svg"
done
BSH="$UP/build.sh"
# مصدر حقيقة واحد لإصدار الرُقَع: يُشتَقّ CORE_PATCH_VERSION من patch_bundle_extensions.py
# فيبقى الحارس هنا والوسم في المرقِّع متّسقين تلقائيًّا (رفع الإصدار في موضع واحد يكفي).
CORE_PATCH_VERSION="$(sed -n 's/.*CORE_PATCH_VERSION[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$ROOT/build/patch_bundle_extensions.py" | head -1)"
[[ -z "$CORE_PATCH_VERSION" ]] && { echo "❌ تعذّر اشتقاق CORE_PATCH_VERSION من patch_bundle_extensions.py." >&2; exit 1; }
# الوسم يتضمّن إصدار الحقن؛ بدّله (في المرقِّع) عند توسيع الرُقَع كي يُعاد الترقيع على build.sh نظيف.
if [[ -f "$BSH" ]] && ! grep -q "محراب: رُقَع النواة $CORE_PATCH_VERSION" "$BSH"; then
  log "ترقيع build.sh (حقن الإضافات + رُقَع النواة: لغة + اتّجاه RTL)"
  # أعِد ضبط build.sh لو كان مُرقَّعًا بحقن أقدم كي يُطبَّق الحقن الموسَّع على نسخة نظيفة.
  # نتحقّق من نجاح الاستعادة فعلًا (لا || true صامت) لتفادي تراكب حقنين في الحالة الحديّة.
  if grep -q 'محراب: حقن الإضافات المدمجة' "$BSH"; then
    git -C "$UP" checkout -- build.sh 2>/dev/null || true
    if grep -q 'محراب: حقن الإضافات المدمجة' "$BSH"; then
      echo "❌ تعذّر استعادة build.sh نظيفًا (ربّما صار غير متعقَّب) — لتفادي حقن مزدوج، أوقف." >&2
      echo "   أعد توليد المنبع: shift أو احذف $UP وأعد تشغيل البناء." >&2
      exit 1
    fi
  fi
  python "$ROOT/build/patch_bundle_extensions.py" "$BSH"
fi

# ── (ز-3) نظّف مجلّد المخرَج السابق مبكّرًا: لو كان مقفولًا (نسخة محراب قيد التشغيل)
#         يفشل تنظيف gulp بـEBUSY بعد ~20 د. نُجهض الآن برسالة واضحة بدل إهدار الوقت. ──
OUTDIR="$UP/$OUT_NAME"
if [[ -d "$OUTDIR" ]]; then
  rm -rf "$OUTDIR" 2>/dev/null || true
  if [[ -d "$OUTDIR" ]]; then
    echo "❌ مجلّد المخرَج مقفول: $OUTDIR" >&2
    echo "   أغلق أيّ نسخة محراب/VSCodium قيد التشغيل ثمّ أعد المحاولة." >&2
    exit 1
  fi
fi

# ── (ح) البناء عبر نقطة دخول VSCodium الرسميّة (هوية محراب من الطبقة 2؛ لا رُقَع نواة) ──
cd "$UP"
BUILD_ARGS=()
# if لا «A && B»: في المسار الافتراضيّ (SKIP_SOURCE≠yes) تُفشِل «A && B» السكربتَ تحت set -e.
if [[ "${SKIP_SOURCE:-no}" == "yes" ]]; then BUILD_ARGS+=("-s"); fi
log "بدء dev/build.sh ${BUILD_ARGS[*]:-}"
# "${BUILD_ARGS[@]:-}" يمنع خطأ unbound تحت set -u عند مصفوفة فارغة في إصدارات bash الأقدم.
bash dev/build.sh "${BUILD_ARGS[@]:-}"

# ── (ط-0) خبز الواجهة العربيّة في nls.messages.json الافتراضيّ (مساهمة بناء — الطبقة 2) ──
# خطوة بعد-بناء سريعة على الـartifacts (لا إعادة gulp). تجعل العربيّة الافتراضيّ الحرفيّ
# للنواة ⇒ أوّل فتح عربيّ بلا إعادة تحميل ولا اعتماد على مسح حزمة لغة. idempotent.
# macOS: حلُّ حزمة `.app` الآن بعد أن صارت موجودة (اسمُها عربيٌّ مشتقٌّ من nameLong).
if [[ "$OS_NAME" == "osx" ]]; then
  MAC_APP="$(find "$OUTDIR" -maxdepth 1 -name '*.app' -print -quit)"
  [[ -n "$MAC_APP" ]] || { echo "❌ لا حزمةَ .app في $OUTDIR" >&2; exit 1; }
  APP_REL="$(basename "$MAC_APP")/Contents/Resources/app"
  LAUNCH_REL="$(basename "$MAC_APP")/Contents/Info.plist"
  log "حزمةُ macOS: $(basename "$MAC_APP")"
fi
APP_DIR="$OUTDIR/$APP_REL"

# ── (ط-0ز) إعادةُ فرض هويّة محراب على product.json **المشحون** ──
# ⚠️ قِيست: خطوةُ (ز-2) تدمج تجاوزاتنا فوق `$UP/product.json`، لكنّ prepare_vscode.sh
# الخاصّ بـVSCodium يكتب بعضَ المفاتيح **بعد** ذلك الدمج، فيعود بعضُها إلى قيمة المنبع
# في المنتج النهائيّ. أُمسك حيًّا: `updateUrl` نجا `null`، بينما عاد
# `serverDownloadUrlTemplate` يشير إلى تغذية إصدارات VSCodium في الحزمة المشحونة —
# دمجٌ واحدٌ مبكّر لا يكفي، فآخرُ من يكتب هو من يفوز.
# فالحلُّ أن نُعيد الفرض على الملفّ الذي يُشحَن فعلًا (وهو ما تقيسه طبقةُ L2).
if [[ -f "$APP_DIR/product.json" && -f "$OVERRIDES" ]]; then
  log "إعادة فرض هوية محراب على product.json المشحون"
  if ! jq -s '.[0] * .[1] | with_entries(select(.key | startswith("_comment") | not))' \
      "$APP_DIR/product.json" "$OVERRIDES" > "$APP_DIR/product.json.tmp"; then
    rm -f "$APP_DIR/product.json.tmp"
    echo "❌ فشل إعادة فرض هوية محراب على المخرَج." >&2; exit 1
  fi
  mv -f "$APP_DIR/product.json.tmp" "$APP_DIR/product.json"
fi

# ── (ط-0أ) حقن ترجمة بيانات الامتدادات إلى العربيّة — مساهمة بناء (الطبقة 2) ──
# يعيد بناء contents.package في ملفّ i18n لحزمة اللغة لكلّ امتداد مدمج (عناوين أوامر/أوصاف
# إعدادات)؛ المسار الذي تحلّه النواة فعلًا حين تكون حزمة اللغة نشطة (getLocalizedMessages
# ⟵ nlsConfig.translations[id].contents.package). package.nls.ar.json يُتجاوَز مع حزمة لغة
# نشطة، فيُكتب فقط للامتدادات غير المُدرَجة فيها. أُثبِت حيًّا عبر CDP.
# **قبل الخبز**: bake_nls يرفع نسخة حزمة اللغة من بصمة تشمل ملفّات i18n المحقونة هنا ⇒
# إبطال كاش CLP (%APPDATA%/clp) في «التحديث فوق ملفّ تعريف قائم». [[mihrab-stale-clp...]]
if [[ -d "$APP_DIR/extensions" ]]; then
  log "حقن ترجمة بيانات الامتدادات (contents.package في حزمة اللغة)"
  python "$ROOT/build/patch_extension_nls.py" "$APP_DIR" || {
    echo "❌ فشل حقن ترجمة بيانات الامتدادات — راجع أعلاه." >&2; exit 1; }
else
  log "تخطّي حقن بيانات الامتدادات: لا مجلّد extensions في $APP_DIR"
fi

# ── (ط-0ب) خبز الواجهة العربيّة + رفع نسخة حزمة اللغة (يشمل بصمة i18n المحقونة أعلاه) ──
if [[ -f "$APP_DIR/out/nls.messages.json" ]]; then
  log "خبز الواجهة العربيّة في nls.messages.json"
  python "$ROOT/build/bake_nls_arabic.py" "$APP_DIR" || {
    echo "❌ فشل خبز الترجمة العربيّة — راجع أعلاه." >&2; exit 1; }
else
  log "تخطّي الخبز: لا nls.messages.json في $APP_DIR (بناء غير مكتمل؟)"
fi

# ── (ط) تحقّق المخرَج (اسم المشغِّل = nameShort = Mihrab؛ CLI = applicationName = mihrab) ──
LAUNCHER="$OUTDIR/$LAUNCH_REL"
if [[ ! -f "$LAUNCHER" ]]; then
  echo "❌ لم يُنتَج مشغِّلُ محراب ($LAUNCH_REL) في $OUTDIR — راجع السجلّ أعلاه." >&2
  exit 1
fi
echo "✅ البناء نجح: $LAUNCHER"

# ── (ي) تحقّقٌ بعد البناء: أنّ ما بُني **محرابٌ** لا VSCodium بأيقونةٍ أخرى ──
# البناءُ الناجح ليس دليلَ صحّة: الهويّةُ قد تنجو في `$UP/product.json` وتسقط في
# المشحون (وقد سقطت فعلًا — انظر ط-0ز)، والتعريبُ قد يُخبَز في ملفٍّ لا يُقرأ.
# فحصٌ رخيصٌ على المخرَج هنا يمسك ذلك قبل أن يصل إلى مستخدم.
if [[ -f "$APP_DIR/product.json" ]]; then
  _nameLong="$("$JQ_BIN" -r '.nameLong // ""' "$APP_DIR/product.json")"
  _locale="$("$JQ_BIN" -r '.defaultLocale // ""' "$APP_DIR/product.json")"
  _update="$("$JQ_BIN" -r '.updateUrl // "null"' "$APP_DIR/product.json")"
  [[ "$_nameLong" == "محراب" ]] || { echo "❌ هويّةٌ مفقودة في المشحون: nameLong=$_nameLong" >&2; exit 1; }
  [[ "$_locale"  == "ar"     ]] || { echo "❌ اللغةُ الافتراضيّة ليست العربيّة: $_locale" >&2; exit 1; }
  # المُحدِّثُ معطَّلٌ عمدًا: تركُه مورَّثًا يستبدل محرابًا بـVSCodium صامتًا (عطبٌ أُبلغ عنه).
  [[ "$_update"  == "null"   ]] || { echo "❌ updateUrl غيرُ معطَّل — سيستبدل محرابًا بالمنبع: $_update" >&2; exit 1; }
  log "الهويّةُ في المشحون: nameLong=محراب · locale=ar · updateUrl=معطَّل"
fi
if [[ -f "$APP_DIR/out/nls.messages.json" ]]; then
  # بايتا 0xD8/0xD9 بادئتا العربيّة في UTF-8. لا `grep -P` ولا محرفٌ عربيٌّ حرفيّ:
  # الأوّلُ غائبٌ عن grep في macOS، والثاني رهنُ محارف السكربت ولغةِ البيئة معًا.
  LC_ALL=C grep -q $'\xd8\|\xd9' "$APP_DIR/out/nls.messages.json" \
    || { echo "❌ nls.messages.json بلا عربيّة — الخبزُ لم يصل إلى المخرَج." >&2; exit 1; }
  log "التعريبُ مخبوزٌ في nls.messages.json"
fi

# ‏--version لا يعمل بلا شاشة على لينكس (Electron يحتاج X/Wayland)، ولا يُشغَّل من
# داخل حزمة .app بهذه الصورة على macOS. فيُترك لويندوز، والتحقّقُ أعلاه يغني عنه.
if [[ "$IS_WIN" == "yes" ]]; then
  "$OUTDIR/bin/mihrab.cmd" --version 2>/dev/null | head -3 || true
fi
