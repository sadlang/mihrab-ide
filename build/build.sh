#!/usr/bin/env bash
# بناء محراب م0 — VSCodium نظيف من المنبع المثبَّت، قابل للتكرار (ويندوز/Git Bash).
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

# ── إصدارات سلسلة الأدوات (طابِق NODE_VERSION مع vscode/.nvmrc للمنبع المثبَّت) ──
NODE_VERSION="${MIHRAB_NODE_VERSION:-22.22.1}"
JQ_VERSION="1.7.1"
NODEGYP_VERSION="13.0.0"   # 11.x لا يعرف VS 2026 (v18)؛ 13 يدعم [2019,2022,2026]
PYTHON_HINT="${MIHRAB_PYTHON:-}"   # مسار python3.12؛ يُكتشف تلقائيًّا إن تُرك فارغًا

log() { echo "▶ $*"; }

# ── (أ) Node محمول مطابق لـ.nvmrc (Node النظام قد يكون أقدم من أن يشغّل ملفّات .ts) ──
NODE_DIR="$TC/node-v${NODE_VERSION}-win-x64"
if [[ ! -x "$NODE_DIR/node.exe" ]]; then
  log "تنزيل Node ${NODE_VERSION} المحمول"
  # -f يُفشِل عند 4xx/5xx؛ نُنزِّل لملفّ مؤقّت ثمّ نُعيد التسمية حتى لا يبقى zip ناقص
  # يُربك إعادة التشغيل لو انقطع التنزيل في المنتصف.
  curl -fsSL --retry 3 -o "$TC/node.zip.part" "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip"
  mv -f "$TC/node.zip.part" "$TC/node.zip"
  powershell -NoProfile -Command "Expand-Archive -Force -Path '$(cygpath -w "$TC/node.zip")' -DestinationPath '$(cygpath -w "$TC")'"
  rm -f "$TC/node.zip"
  # تحقّق أنّ الاستخراج أنتج node.exe فعلًا (Expand-Archive قد يفشل بصمت في powershell).
  [[ -x "$NODE_DIR/node.exe" ]] || { echo "❌ فشل استخراج Node إلى $NODE_DIR" >&2; exit 1; }
fi
export PATH="$NODE_DIR:$TC:$PATH"
log "Node=$(node -v) npm=$(npm -v)"

# ── (ب) jq (يحتاجه get_repo.sh/utils.sh في المنبع) ──
if [[ ! -x "$TC/jq.exe" ]]; then
  log "تنزيل jq ${JQ_VERSION}"
  # نُنزِّل لملفّ مؤقّت ثمّ نُعيد التسمية: يمنع بقاء jq.exe ناقص (يجتاز فحص -x) عند انقطاع.
  curl -fsSL --retry 3 -o "$TC/jq.exe.part" "https://github.com/jqlang/jq/releases/download/jq-${JQ_VERSION}/jq-windows-amd64.exe"
  mv -f "$TC/jq.exe.part" "$TC/jq.exe"
  # تحقّق أنّ الثنائيّ يعمل (تنزيل صفحة خطأ HTML بدل exe يجتاز فحص الوجود لكن لا يُنفَّذ).
  "$TC/jq.exe" --version >/dev/null 2>&1 || { echo "❌ jq المُنزَّل لا يعمل — تحقّق من الرابط/الشبكة." >&2; rm -f "$TC/jq.exe"; exit 1; }
fi

# ── (ج) تحضير شجرة المنبع (استنساخ VSCodium المثبَّت + رُقَع محراب) ──
if [[ "${SKIP_SOURCE:-no}" != "yes" || ! -d "$UP/.git" ]]; then
  log "تحضير المنبع عبر prepare.sh"
  bash "$ROOT/build/prepare.sh"
fi

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
  sed -i 's/^mkdir openssl$/mkdir -p openssl/' "$BCL"
fi

# ── (ز) بيئة البناء + كشف Visual Studio و Python تلقائيًّا ──
VSWHERE="/c/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe"
if [[ -x "$VSWHERE" ]]; then
  VS_PATH="$("$VSWHERE" -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>/dev/null | tr -d '\r')"
  # فحص vscode للمترجم يقبل 2022/2019 ويكتفي بوجود المسار ⇒ نوجّهه إلى أحدث VS.
  # ملاحظة: نستعمل if لا «A && B» لأنّ الأخيرة تُفشِل السكربت تحت set -e عند فراغ المسار.
  if [[ -n "$VS_PATH" ]]; then export vs2022_install="$(cygpath -w "$VS_PATH")"; fi
fi
if [[ -z "$PYTHON_HINT" ]]; then
  PYTHON_HINT="$(py -3.12 -c 'import sys;print(sys.executable)' 2>/dev/null | tr -d '\r' || true)"
fi
# if لا «A && B»: غياب python يجب أن يَسقط للنظام لا أن يُوقف البناء تحت set -e.
if [[ -n "$PYTHON_HINT" ]]; then export npm_config_python="$PYTHON_HINT"; fi
export npm_config_node_gyp="$(cygpath -w "$BUNDLED_GYP/bin/node-gyp.js")"
export npm_config_jobs=12
export UV_THREADPOOL_SIZE=12
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
  if ! jq -s '.[0] * .[1] | del(._comment)' "$UP/product.json" "$OVERRIDES" > "$UP/product.json.tmp"; then
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
# جهّز رُقَع النواة + أصولها (تُطبَّق داخل build.sh المنبع بعد cd vscode، فتنجو من reset).
[[ -f "$ROOT/build/patch_main_locale.py" ]] && cp -f "$ROOT/build/patch_main_locale.py" "$UP/.mihrab-patch-main-locale.py"
[[ -f "$ROOT/build/patch_workbench_rtl.py" ]] && cp -f "$ROOT/build/patch_workbench_rtl.py" "$UP/.mihrab-patch-workbench-rtl.py"
[[ -f "$ROOT/build/patch_menubar_rtl.py" ]] && cp -f "$ROOT/build/patch_menubar_rtl.py" "$UP/.mihrab-patch-menubar-rtl.py"
[[ -f "$ROOT/build/patch_menu_rtl.py" ]] && cp -f "$ROOT/build/patch_menu_rtl.py" "$UP/.mihrab-patch-menu-rtl.py"
[[ -f "$ROOT/build/patch_splitview_rtl.py" ]] && cp -f "$ROOT/build/patch_splitview_rtl.py" "$UP/.mihrab-patch-splitview-rtl.py"
[[ -f "$ROOT/build/patch_sash_rtl.py" ]] && cp -f "$ROOT/build/patch_sash_rtl.py" "$UP/.mihrab-patch-sash-rtl.py"
[[ -f "$ROOT/build/patch_gridview_marker.py" ]] && cp -f "$ROOT/build/patch_gridview_marker.py" "$UP/.mihrab-patch-gridview-marker.py"
[[ -f "$ROOT/build/patch_editor_rtl.py" ]] && cp -f "$ROOT/build/patch_editor_rtl.py" "$UP/.mihrab-patch-editor-rtl.py"
[[ -f "$ROOT/build/patch_welcome_rtl.py" ]] && cp -f "$ROOT/build/patch_welcome_rtl.py" "$UP/.mihrab-patch-welcome-rtl.py"
[[ -f "$ROOT/patches/mihrab-rtl.css" ]] && cp -f "$ROOT/patches/mihrab-rtl.css" "$UP/.mihrab-rtl.css"
# جهّز أصول هوية محراب البصريّة (أيقونة التطبيق + بلاطتا ويندوز) في مجلّد ينجو من reset،
# ليحقنها build.sh المنبع فوق resources/win32/ بعد cd vscode (تستبدل هوية VSCodium).
BRAND_SRC="$ROOT/assets/branding"
BRAND_STAGE="$UP/.mihrab-branding"
rm -rf "$BRAND_STAGE"; mkdir -p "$BRAND_STAGE"
[[ -f "$BRAND_SRC/mihrab.ico" ]] && cp -f "$BRAND_SRC/mihrab.ico" "$BRAND_STAGE/code.ico"
[[ -f "$BRAND_SRC/mihrab_150x150.png" ]] && cp -f "$BRAND_SRC/mihrab_150x150.png" "$BRAND_STAGE/code_150x150.png"
[[ -f "$BRAND_SRC/mihrab_70x70.png" ]] && cp -f "$BRAND_SRC/mihrab_70x70.png" "$BRAND_STAGE/code_70x70.png"
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
OUTDIR="$UP/VSCode-win32-x64"
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
APP_DIR="$UP/VSCode-win32-x64/resources/app"
if [[ -f "$APP_DIR/out/nls.messages.json" ]]; then
  log "خبز الواجهة العربيّة في nls.messages.json"
  python "$ROOT/build/bake_nls_arabic.py" "$APP_DIR" || {
    echo "❌ فشل خبز الترجمة العربيّة — راجع أعلاه." >&2; exit 1; }
else
  log "تخطّي الخبز: لا nls.messages.json في $APP_DIR (بناء غير مكتمل؟)"
fi

# ── (ط) تحقّق المخرَج (اسم الـexe = nameShort = Mihrab؛ CLI = applicationName = mihrab) ──
EXE="$UP/VSCode-win32-x64/Mihrab.exe"
if [[ -f "$EXE" ]]; then
  echo "✅ البناء نجح: $EXE"
  "$UP/VSCode-win32-x64/bin/mihrab.cmd" --version 2>/dev/null | head -3 || true
else
  echo "❌ لم يُنتَج Mihrab.exe — راجع السجلّ أعلاه." >&2
  exit 1
fi
