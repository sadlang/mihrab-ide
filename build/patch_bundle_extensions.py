#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ترقيع build.sh الخاصّ بـVSCodium لحقن إضافات محراب المدمجة (الطبقة 1).

السبب: في وضع -s يُجري dev/build.sh «git add . ; git reset --hard» على vscode
فيحذف أيّ إضافة غير متعقَّبة نُسِخت قبله. لذا نحقن الإضافات من داخل build.sh
بعد «cd vscode» (بعد reset، قبل gulp) من مرحلة تجهيز محزومة (.mihrab-extensions).

idempotent: يتحقّق من وسم قبل التعديل.
الاستعمال: python patch_bundle_extensions.py <مسار build.sh>
"""
import os
import sys

# فرض UTF-8 على المخرجات (كونسول ويندوز قد يكون cp125x فيفشل مع العربيّة).
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

MARK = "محراب: حقن الإضافات المدمجة"  # كاشف عامّ: أيّ حقن محراب سابق (مستقلّ عن الإصدار)
# وسم الإصدار الحاليّ للرُقَع؛ يجب أن يطابق حرفيًّا الوسم في build.sh والتعليق داخل INJECT أدناه.
# بدّله عند توسيع كتلة INJECT (وبدّل نظيرَيه) كي يُعاد الترقيع لا أن يُبقى حقنٌ بائت.
CORE_PATCH_VERSION = "v16"
VERSION_MARK = f"محراب: رُقَع النواة {CORE_PATCH_VERSION}"

ANCHOR = '  cd vscode || { echo "\'vscode\' dir not found"; exit 1; }'

INJECT = """
  # محراب: حقن الإضافات المدمجة المُجهَّزة في ../.mihrab-extensions (الطبقة 1).
  # نستعمل if لا «[ -d ] && cmd» (الأخيرة تُفشِل البناء تحت set -e عند غياب التطابق).
  for _mext in ../.mihrab-extensions/*/; do
    if [ -d "${_mext}" ]; then
      _mname="$( basename "${_mext}" )"
      rm -rf "extensions/${_mname}"
      cp -r "${_mext}" "extensions/${_mname}"
      echo "محراب: حُقِنت إضافة مدمجة ${_mname}"
    fi
  done
  # محراب: رُقَع النواة v16 (+صفحة الترحيب) على مصدر vscode (الطبقة 3) من ملفّات مُجهَّزة تنجو من reset.
  # أيقونة التطبيق وبلاطتا ويندوز: استبدل resources/win32/ (electron.ts:winIcon=resources/win32/code.ico
  # ⇒ أيقونة الـexe؛ code.iss:SetupIconFile ⇒ المُثبِّت؛ code_*x*.png ⇒ بلاطات ابدأ؛ default.ico
  # ⇒ أيقونة المستند). فشل قاتل (لا تخطٍّ صامت) إن غاب أصلٌ متوقَّع كي لا تُشحَن هوية VSCodium
  # زورًا مع إعلان نجاح — على غرار رُقَع RTL/اللغة القاتلة.
  if [ -d ../.mihrab-branding ]; then
    for _masset in code.ico code_150x150.png code_70x70.png; do
      [ -f "../.mihrab-branding/${_masset}" ] || { echo "محراب: أصل هوية مفقود ../.mihrab-branding/${_masset}" >&2; exit 1; }
    done
    cp -f ../.mihrab-branding/code.ico resources/win32/code.ico
    cp -f ../.mihrab-branding/code.ico resources/win32/default.ico
    cp -f ../.mihrab-branding/code_150x150.png resources/win32/code_150x150.png
    cp -f ../.mihrab-branding/code_70x70.png resources/win32/code_70x70.png
    echo "محراب: طُبِّقت أيقونة التطبيق وبلاطات ويندوز"
  fi
  if [ -f ../.mihrab-patch-main-locale.py ]; then
    python ../.mihrab-patch-main-locale.py src/main.ts || { echo "محراب: فشلت رُقعة اللغة الافتراضيّة" >&2; exit 1; }
  fi
  # رُقعة الاتّجاه RTL-0: انسخ ورقة الأنماط إلى media/ ثمّ رقّع workbench.ts ليستوردها ويضبط dir=rtl.
  if [ -f ../.mihrab-patch-workbench-rtl.py ] && [ -f ../.mihrab-rtl.css ]; then
    cp -f ../.mihrab-rtl.css src/vs/workbench/browser/media/mihrab-rtl.css
    python ../.mihrab-patch-workbench-rtl.py src/vs/workbench/browser/workbench.ts || { echo "محراب: فشلت رُقعة اتّجاه RTL" >&2; exit 1; }
  fi
  # رُقعة RTL-2: محاذاة منسدلة شريط القوائم يمينًا في RTL (لا تخرج من حافّة النافذة).
  if [ -f ../.mihrab-patch-menubar-rtl.py ]; then
    python ../.mihrab-patch-menubar-rtl.py src/vs/base/browser/ui/menu/menubar.ts || { echo "محراب: فشلت رُقعة قوائم RTL" >&2; exit 1; }
  fi
  # رُقعة RTL-2: تعاقب القائمة الفرعيّة يسارًا في RTL (menu.ts).
  if [ -f ../.mihrab-patch-menu-rtl.py ]; then
    python ../.mihrab-patch-menu-rtl.py src/vs/base/browser/ui/menu/menu.ts || { echo "محراب: فشلت رُقعة القائمة الفرعيّة RTL" >&2; exit 1; }
  fi
  # رُقعة RTL-2: وسم splitview الشبكة (يُمكِّن استثناءها في رُقعتَي splitview/sash).
  if [ -f ../.mihrab-patch-gridview-marker.py ]; then
    python ../.mihrab-patch-gridview-marker.py src/vs/base/browser/ui/grid/gridview.ts || { echo "محراب: فشلت رُقعة وسم الشبكة" >&2; exit 1; }
  fi
  # رُقعة RTL-2: اتّجاه SplitView الأفقيّ المستقلّ (كلّ اللوحات، باستثناء splitview الشبكة) + المقبض.
  if [ -f ../.mihrab-patch-splitview-rtl.py ]; then
    python ../.mihrab-patch-splitview-rtl.py src/vs/base/browser/ui/splitview/splitview.ts || { echo "محراب: فشلت رُقعة SplitView RTL" >&2; exit 1; }
  fi
  if [ -f ../.mihrab-patch-sash-rtl.py ]; then
    python ../.mihrab-patch-sash-rtl.py src/vs/base/browser/ui/sash/sash.ts || { echo "محراب: فشلت رُقعة المقبض RTL" >&2; exit 1; }
  fi
  # رُقعة محرّر Monaco RTL م1–م4: الحاوية LTR + اتّجاه السطر RTL + خريطة يسارًا · مزراب يمينًا + طيّ + تمرير أفقيّ RTL.
  # تُرقّع 6 ملفّات (viewModelImpl/margin/editorScrollbar/minimap/mouseTarget/viewLayout) من جذر المصدر «.».
  if [ -f ../.mihrab-patch-editor-rtl.py ]; then
    python ../.mihrab-patch-editor-rtl.py . || { echo "محراب: فشلت رُقعة محرّر RTL" >&2; exit 1; }
  fi
  # رُقعة صفحة الترحيب: شعار القوس + الجملة الاستعاريّة في ترويسة Get Started (شكل الشعار في mihrab-rtl.css).
  if [ -f ../.mihrab-patch-welcome-rtl.py ]; then
    python ../.mihrab-patch-welcome-rtl.py src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts || { echo "محراب: فشلت رُقعة صفحة الترحيب" >&2; exit 1; }
  fi"""


def main() -> int:
    if len(sys.argv) != 2:
        print("الاستعمال: python patch_bundle_extensions.py <مسار build.sh>", file=sys.stderr)
        return 2
    path = sys.argv[1]
    try:
        with open(path, encoding="utf-8", newline="") as f:
            text = f.read()
    except OSError as e:
        print(f"⚠️ تعذّر فتح {path}: {e}", file=sys.stderr)
        return 1
    # حارس انجراف داخليّ: تأكّد أنّ وسم الإصدار مضمَّن فعلًا في INJECT (لا يفترقان بصمت).
    if VERSION_MARK not in INJECT:
        print(f"⚠️ تناقض داخليّ: {VERSION_MARK} غير موجود في INJECT — حدّث CORE_PATCH_VERSION.", file=sys.stderr)
        return 1
    # idempotency واعٍ بالإصدار: تخطٍّ فقط لو كان الحقن الحاليّ بالضبط موجودًا. لو وُجِد حقنٌ
    # محرابيّ بإصدار أقدم (MARK دون VERSION_MARK) فلا نتخطّى صامتًا (يُبقي حقنًا بائتًا) ولا نُضاعف
    # الحقن — بل نُخفِق بوضوح ونطلب استعادة build.sh نظيفًا (كما يفعل مسار build.sh قبل الاستدعاء).
    if VERSION_MARK in text:
        print("مُرقَّع بالإصدار الحاليّ مسبقًا — تخطٍّ.")
        return 0
    if MARK in text:
        print("مُرقَّع بإصدار أقدم — استعِد build.sh نظيفًا قبل إعادة الترقيع (تفاديًا لحقن بائت/مزدوج).", file=sys.stderr)
        return 1
    if ANCHOR not in text:
        print("⚠️ لم يُعثر على سطر «cd vscode» المتوقّع في build.sh — ربّما تغيّر المنبع.", file=sys.stderr)
        return 1
    text = text.replace(ANCHOR, ANCHOR + INJECT, 1)
    # نكتب لملفّ مؤقّت ثمّ نُبدِّل ذرّيًّا: فشل الكتابة لا يُتلِف build.sh الأصليّ.
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        os.replace(tmp, path)
    except OSError as e:
        try:
            os.remove(tmp)
        except OSError:
            pass
        print(f"⚠️ تعذّر كتابة {path}: {e}", file=sys.stderr)
        return 1
    print("✅ رُقِّع build.sh (حقن الإضافات المدمجة).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
