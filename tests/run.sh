#!/usr/bin/env bash
# منسّق اختبارات محراب — يشغّل الطبقات الساكنة/التطبيقيّة/الحزمة، ويرشد لطبقة الوقت.
# L0 (ساكن) + L1 (مراسي) يعملان دائمًا (بلا بناء). L2 (حزمة) يعمل إن وُجد مخرَج بناء.
# L3 (وقتيّ) يحتاج نسخة مُطلَقة بالمنفذ — يُطبَع إرشاده لا يُشغَّل هنا.
#
# الاستعمال: bash tests/run.sh          # L0+L1 (+L2 إن مبنيّ)
#            MIHRAB_L1_SOURCE=snapshot bash tests/run.sh   # فرض لقطة L1 (كـCI)
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="${PYTHON:-python}"
rc=0

echo "╔══════════════════ اختبارات محراب ══════════════════╗"

"$PY" "$HERE/static/lint_patchers.py" || rc=1
echo
"$PY" "$HERE/apply/check_anchors.py" || rc=1
echo
"$PY" "$HERE/bundle/check_injected.py" || rc=1
echo

# ── نِبراس: حارس تطابق عقد السلك (المصدر ⇄ المولَّد) ──
NEBRAS="$HERE/../extensions/mihrab-nebras"
"$PY" "$NEBRAS/contract/gen_contract.py" --check || rc=1
echo

# ── اختبارات وحدة الامتدادات (نِبراس: RPC/توافق · الترحيب: تحقّق الاسم · sad-lang: نقل LSP/محوّلات) ──
if command -v node >/dev/null 2>&1; then
  for _ext in "$NEBRAS" "$HERE/../extensions/mihrab-welcome" "$HERE/../extensions/sad-lang"; do
    ( cd "$_ext" && node --test ) || rc=1
  done
else
  echo "⚠️ node غير متوفّر — تخطّي اختبارات وحدة الامتدادات"
fi
echo

echo "─── L3 (وقتيّ) — مساران ───"
echo "  (أ) تشغيل حيّ مؤتمَت (يُصرِّف ويُطلق ويلتقط بنفسه — لا حاجة لإطلاق يدويّ):"
echo "      python build/dev_sync.py                       # زامِن الطبقتين 2/3 مع شجرة المنبع"
echo "      node tests/runtime/launch.mjs --build --spec   # صرِّف + أطلق + شغّل التأكيدات"
echo "      node tests/runtime/launch.mjs --folder . --tabs <ملفّ> --spec   # تشغيلة المحرّر"
echo "      node tests/runtime/launch.mjs --welcome --spec                 # تشغيلة الترحيب"
echo "        (تشغيلتان لا واحدة: صفحة الترحيب والمحرّر لا يكونان نشطين معًا في مجموعة"
echo "         تبويبات واحدة، ومحراب لا يفتح الترحيب أصلًا حين يُمرَّر ملفّ.)"
echo "        (‏--folder لازم لمِجَسّات القاعدة 22: مثلّث الشجرة وأدلّتها وأسهم اللوحات)"
echo "      node tests/runtime/launch.mjs --shot welcome --keep   # لقطة وأبقِ النسخة مفتوحة"
echo "  (ب) نسخة مُطلَقة يدويًّا (كما كان):"
echo "      Mihrab.exe --remote-debugging-port=9222 --remote-allow-origins=* \\"
echo "        tests/runtime/fixtures/rtl_fixture.ص"
echo "      node tests/runtime/run.mjs"
echo

if [[ $rc -eq 0 ]]; then echo "╚═══ ✅ الطبقات غير الوقتيّة نجحت ═══╝"; else echo "╚═══ ❌ فشل — راجع أعلاه ═══╝"; fi
exit $rc
