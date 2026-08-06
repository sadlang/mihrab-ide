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
CORE_PATCH_VERSION = "v28"
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
  # محراب: رُقَع النواة v28 (+صناديق الإدخال البسيطة [SC-01] +اتّجاه لوح شرح الجولة +ورقة الهويّة [VA-05] +رأس التطبيق + خلفية المحرّر + أصول sessions + زخرفة نجميّة الترحيب + تصريح <html lang>) على مصدر vscode (الطبقة 3) من ملفّات مُجهَّزة تنجو من reset.
  # أيقونة التطبيق وبلاطتا ويندوز: استبدل resources/win32/ (electron.ts:winIcon=resources/win32/code.ico
  # ⇒ أيقونة الـexe؛ code.iss:SetupIconFile ⇒ المُثبِّت؛ code_*x*.png ⇒ بلاطات ابدأ؛ default.ico
  # ⇒ أيقونة المستند). فشل قاتل (لا تخطٍّ صامت) إن غاب أصلٌ متوقَّع كي لا تُشحَن هوية VSCodium
  # زورًا مع إعلان نجاح — على غرار رُقَع RTL/اللغة القاتلة.
  if [ -d ../.mihrab-branding ]; then
    for _masset in code.ico code_150x150.png code_70x70.png code-icon.svg letterpress-dark.svg letterpress-light.svg letterpress-hcDark.svg letterpress-hcLight.svg; do
      [ -f "../.mihrab-branding/${_masset}" ] || { echo "محراب: أصل هوية مفقود ../.mihrab-branding/${_masset}" >&2; exit 1; }
    done
    cp -f ../.mihrab-branding/code.ico resources/win32/code.ico
    cp -f ../.mihrab-branding/code.ico resources/win32/default.ico
    cp -f ../.mihrab-branding/code_150x150.png resources/win32/code_150x150.png
    cp -f ../.mihrab-branding/code_70x70.png resources/win32/code_70x70.png
    echo "محراب: طُبِّقت أيقونة التطبيق وبلاطات ويندوز"
    # أيقونتا لينكس وmacOS. **سقوط رشيق لا قاتل** (بخلاف أصول ويندوز أعلاه): تُولَّدان
    # في build.sh من mihrab-mark-color-256.png، وشجرةُ منبعٍ قديمة قد تسبق وجودهما.
    # وقاطعُ الغيابِ الحقيقيّ فحصُ ما بعد البناء لا هنا.
    if [ -f ../.mihrab-branding/code.png ]; then
      cp -f ../.mihrab-branding/code.png resources/linux/code.png
      echo "محراب: طُبِّقت أيقونة لينكس"
    fi
    if [ -f ../.mihrab-branding/code.icns ]; then
      cp -f ../.mihrab-branding/code.icns resources/darwin/code.icns
      echo "محراب: طُبِّقت أيقونة macOS"
    fi
    # شعار رأس التطبيق: .window-appicon في titlebarpart.css يشير إلى media/code-icon.svg.
    cp -f ../.mihrab-branding/code-icon.svg src/vs/workbench/browser/media/code-icon.svg
    # خلفية المحرّر الفارغ: .letterpress في editorgroupview.css يشير إلى letterpress-{dark,light,hcDark,hcLight}.svg.
    for _lp in dark light hcDark hcLight; do
      cp -f "../.mihrab-branding/letterpress-${_lp}.svg" "src/vs/workbench/browser/parts/editor/media/letterpress-${_lp}.svg"
    done
    echo "محراب: طُبِّق شعار رأس التطبيق وخلفية المحرّر"
    # أصول مساحة sessions التجريبيّة: شعار حوض الأسماك (vscodeLogoPath.ts، مسار مطموس مملوء)،
    # أيقونة Open-in-VSCode (بديل تطوير)، وخلفيّة sessions الفارغة.
    for _sasset in vscode-icon.svg vscodeLogoPath.ts letterpress-sessions-dark.svg letterpress-sessions-light.svg; do
      [ -f "../.mihrab-branding/${_sasset}" ] || { echo "محراب: أصل هوية sessions مفقود ../.mihrab-branding/${_sasset}" >&2; exit 1; }
    done
    cp -f ../.mihrab-branding/vscode-icon.svg src/vs/sessions/browser/media/vscode-icon.svg
    cp -f ../.mihrab-branding/vscodeLogoPath.ts src/vs/sessions/contrib/aquarium/browser/vscodeLogoPath.ts
    cp -f ../.mihrab-branding/letterpress-sessions-dark.svg src/vs/sessions/contrib/chat/browser/media/letterpress-sessions-dark.svg
    cp -f ../.mihrab-branding/letterpress-sessions-light.svg src/vs/sessions/contrib/chat/browser/media/letterpress-sessions-light.svg
    echo "محراب: طُبِّقت أصول مساحة sessions (شعار الحوض + أيقونة + خلفية)"
  fi
  if [ -f ../.mihrab-patch-main-locale.py ]; then
    python ../.mihrab-patch-main-locale.py src/main.ts || { echo "محراب: فشلت رُقعة اللغة الافتراضيّة" >&2; exit 1; }
  fi
  # رُقعة الاتّجاه RTL-0: انسخ ورقة الأنماط إلى media/ ثمّ رقّع workbench.ts ليستوردها ويضبط dir=rtl.
  # **الشرطُ على المرقِّع وحدَه** [VA-05]: كانت الورقتان داخل شرطٍ يذكر `.mihrab-rtl.css`،
  # فغيابُ ورقةِ الاتّجاه كان يُسقِط ورقةَ الهويّة والاستيرادَ معها بلا كلمة — أي أنّ
  # «الفصل» يبقى صوريًّا ما دامت إحداهما رهينةَ الأخرى. وكلُّ ورقةٍ تفشل الآن بذاتها.
  if [ -f ../.mihrab-patch-workbench-rtl.py ]; then
    # ورقتان إلزاميّتان: الرُقعةُ تحقن استيرادَ كلتيهما بلا شرط، فغيابُ أيٍّ منهما يُسقِط
    # esbuild بخطأ «Could not resolve» غامضٍ بعد دقائق. والفشلُ هنا يقولها بالعربيّة.
    for _sheet in mihrab-rtl mihrab-identity; do
      if [ ! -f "../.${_sheet}.css" ]; then
        echo "محراب: ورقة الأنماط .${_sheet}.css مفقودة — واستيرادُها محقونٌ في workbench.ts" >&2
        exit 1
      fi
      cp -f "../.${_sheet}.css" "src/vs/workbench/browser/media/${_sheet}.css"
    done
    # [AR-02] خطّ ص العربيّ المحزوم (Kawkab Mono): يُحقَن كـ@font-face بمصدر **data: URI (base64)**
    # مُقدَّمًا إلى نسخة media من الورقة. **لا url() نسبيّ**: esbuild (optimize.ts) يحلّ url() في CSS
    # المحزوم زمن البناء و.woff2 بلا loader (ttf/svg/png/sh فقط) ⇒ يفشل البناء «No loader…»، وغيابُ
    # الملفّ يفشل «Could not resolve» (كلاهما مثبَت تجريبيًّا). data: URI يتركه esbuild حرفيًّا فلا
    # loader ولا رُقعة نواة. سقوط رشيق: غياب الخطّ ⇒ لا حقن ⇒ لا @font-face ⇒ بناء نظيف والسقوط لبقيّة المكدّس.
    if [ -f ../.mihrab-kawkab-mono.woff2 ]; then
      _mfont_b64="$( base64 -w0 ../.mihrab-kawkab-mono.woff2 2>/dev/null || base64 ../.mihrab-kawkab-mono.woff2 | tr -d '\\n' )"
      if [ -n "${_mfont_b64}" ]; then
        _mfont_css="src/vs/workbench/browser/media/mihrab-rtl.css"
        printf '@font-face{font-family:"Kawkab Mono";font-style:normal;font-weight:400;font-display:swap;src:url("data:font/woff2;base64,%s") format("woff2");}\\n' "${_mfont_b64}" > "${_mfont_css}.font"
        cat "${_mfont_css}" >> "${_mfont_css}.font"
        mv -f "${_mfont_css}.font" "${_mfont_css}"
        echo "محراب: حُقِن الخطّ العربيّ Kawkab Mono (@font-face بـdata: URI)"
      else
        echo "محراب: تعذّر ترميز base64 للخطّ العربيّ — السقوط لبقيّة مكدّس editor.fontFamily"
      fi
    else
      echo "محراب: لا خطّ عربيّ محزوم (kawkab-mono.woff2) — السقوط لبقيّة مكدّس editor.fontFamily"
    fi
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
  # رُقعة إفلات تبويبات المحرّر RTL (البند #18): اتّجاه الإدراج + مؤشّره البصريّ (LTR مطابق بايتًا).
  if [ -f ../.mihrab-patch-tabsdrop-rtl.py ]; then
    python ../.mihrab-patch-tabsdrop-rtl.py src/vs/workbench/browser/parts/editor/multiEditorTabsControl.ts || { echo "محراب: فشلت رُقعة إفلات التبويبات RTL" >&2; exit 1; }
  fi
  # محرّر Monaco RTL: تعديلٌ **منبعيٌّ** كامل (خيار editor.textDirection: auto|ltr|rtl) مُصاغٌ
  # للرفع إلى microsoft/vscode، لا رُقعةً خاصّة. يُطبَّق diff واحدًا بـgit apply --3way (يتسامح
  # مع انجراف المنبع). فشلٌ قاتل لا تخطٍّ صامت: بلا هذه الرقعة يخرج محرّرٌ إنجليزيّ الاتّجاه.
  if [ -f ../.mihrab-editor-text-direction.patch ]; then
    git apply --3way ../.mihrab-editor-text-direction.patch || { echo "محراب: فشل تطبيق رُقعة اتّجاه المحرّر" >&2; exit 1; }
    echo "محراب: طُبِّق اتّجاه نصّ المحرّر (editor.textDirection)"
  fi
  # حدُّ الكلمة في المطابقة الضبابيّة [م-١٥/ب]: تعديلٌ **منبعيّ** أيضًا (لا هويّةَ فيه ولا
  # عربيّةَ في شيفرته سوى المحرفين اللذين يعرّفهما). بلا هذه الرقعة تسقط الكتابةُ من وسط
  # المعرّف العربيّ سقوطًا كاملًا — مقيسًا في tests/dx/completion_rank.mjs.
  if [ -f ../.mihrab-nonlatin-word-start.patch ]; then
    git apply --3way ../.mihrab-nonlatin-word-start.patch || { echo "محراب: فشل تطبيق رُقعة حدّ الكلمة غير اللاتينيّ" >&2; exit 1; }
    echo "محراب: طُبِّق حدُّ الكلمة بعد أداة التعريف (المطابقة الضبابيّة)"
  fi
  # صناديقُ الإدخال البسيطة [SC-01]: اتّجاهُ النصّ وأشكالُه السياقيّة يبلغان رسالةَ الالتزام
  # وحقلَ وحدة التصحيح وشرطَ نقطة التوقّف والدردشة — أحدَ عشرَ مستهلكًا من موضعٍ واحد.
  # وارتفاعُ سطر صندوق الالتزام يحترم `editor.lineHeight` بدل نسبةٍ لاتينيّةٍ ثابتة (1.5)
  # تقصُّ التشكيلَ العربيّ. فشلٌ قاتل: بلا هذه الرقعة يعود أطولُ نصٍّ عربيٍّ يُكتَب إلى LTR.
  if [ -f ../.mihrab-simple-editor-rtl-input.patch ]; then
    # **تُسجَّل مساراتُ الرقعة في الفهرس قبل تطبيقها.** `git apply --3way` يطلب أن يجد
    # مُدخَلَ الفهرس مطابقًا لما في الشجرة، و`scmInput.ts` **ترقّعه VSCodium نفسُها** في
    # مرحلةٍ سابقة (‏00-ui-custom-font · 00-copilot-fix-action-condition) بلا تسجيل —
    # فيخرج «does not match index» ويسقط البناء. والمساراتُ تُشتقّ من الرقعة لا تُكتَب،
    # فتعديلُها لا يترك هنا اسمًا بائتًا.
    sed -n 's|^+++ b/||p' ../.mihrab-simple-editor-rtl-input.patch | while read -r _mp; do
      [ -n "${_mp}" ] && git add -- "${_mp}" 2>/dev/null || true
    done
    git apply --3way ../.mihrab-simple-editor-rtl-input.patch || { echo "محراب: فشل تطبيق رُقعة صناديق الإدخال البسيطة" >&2; exit 1; }
    echo "محراب: طُبِّقت صناديقُ الإدخال البسيطة (اتّجاه + أشكال سياقيّة + ارتفاع سطر)"
  fi
  # رُقعة صفحة الترحيب: شعار القوس + الجملة الاستعاريّة في ترويسة Get Started (شكل الشعار في mihrab-identity.css — ورقةُ الهويّة [VA-05]).
  if [ -f ../.mihrab-patch-welcome-rtl.py ]; then
    python ../.mihrab-patch-welcome-rtl.py src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts || { echo "محراب: فشلت رُقعة صفحة الترحيب" >&2; exit 1; }
  fi
  # رُقعة صفحة الترحيب (ب-١): اتّجاهُ لوح شرح الجولة. اللوحُ إطارُ webview بمستندٍ مستقلّ
  # يخرج بـ<html> عارية، فيرتدّ إلى ltr مهما كانت القشرة (قِسناه حيًّا). ولا مخرجَ من طبقةٍ
  # أدنى: مطهِّرُ الـmarkdown ينزع dir من محتوانا، وورقتُنا لا تعبر حدَّ الـwebview.
  if [ -f ../.mihrab-patch-walkthrough-dir.py ]; then
    python ../.mihrab-patch-walkthrough-dir.py src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedDetailsRenderer.ts || { echo "محراب: فشلت رُقعة اتّجاه لوح الجولة" >&2; exit 1; }
  fi
  # رُقعة صفحة الترحيب (ب): إسقاط جولات المنبع التعريفيّة (Setup/SetupWeb/Beginner) كي تتصدّر
  # جولة محراب «ابدأ في ٩٠ ثانية». SetupAccessibility وnotebooks تبقيان عمدًا (انظر المرقِّع).
  if [ -f ../.mihrab-patch-walkthroughs-drop.py ]; then
    python ../.mihrab-patch-walkthroughs-drop.py src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStartedService.ts || { echo "محراب: فشلت رُقعة إسقاط جولات المنبع" >&2; exit 1; }
  fi
  # تصريح لغة المستند: العربيّة مخبوزة في nls الافتراضيّ فلا يحلّ NLS لغةً ⇒ كان <html lang="en"
  # على واجهة عربيّة (يُضلّل قارئات الشاشة ويُبطِل :lang(ar)). نرتدّ إلى product.defaultLocale.
  if [ -f ../.mihrab-patch-html-lang.py ]; then
    python ../.mihrab-patch-html-lang.py src/vs/code/electron-browser/workbench/workbench.ts || { echo "محراب: فشلت رُقعة تصريح لغة المستند" >&2; exit 1; }
  fi
  # افتراضُ الحوار المشروط: 'native' يعني حوارَ ويندوز بلغته وباتّجاه LTR في لحظة فقدِ عمل.
  # 'custom' يُصيّره الـworkbench فيرث dir=rtl والسلاسلَ العربيّة المخبوزة (نطاقُه APPLICATION
  # فلا تبلغه configurationDefaults من إضافة — قِسناه).
  if [ -f ../.mihrab-patch-dialog-style.py ]; then
    python ../.mihrab-patch-dialog-style.py src/vs/workbench/electron-browser/desktop.contribution.ts || { echo "محراب: فشلت رُقعة نمط الحوار" >&2; exit 1; }
  fi

  # مجلّد إعدادات المشروع: `.محراب` يُكتَب، و`.mihrab` و`.vscode` يُقرآن ويُدمجان تحته.
  # الرقعةُ تشمل ستّةَ عشرَ ملفًّا لأنّ المنبع يكتب '.vscode' حرفيًّا خارج ثابته: لو
  # بُدّل الثابتُ وحده لقرأ محراب من مكانٍ وكتب في آخر — بلا خطأ ولا سجلّ.
  if [ -f ../.mihrab-patch-config-folder.py ]; then
    python ../.mihrab-patch-config-folder.py . || { echo "محراب: فشلت رُقعة مجلّد الإعدادات" >&2; exit 1; }
  fi

  # عناوين لوحة الإعدادات: تُشتَقّ حسابيًّا من اسم المفتاح وقت التشغيل، فلا مدخلَ لها
  # في NLS ولا يمسّها خبزُ العربيّة. التعريبُ يُلحَق بمخرَج wordifyKey.
  if [ -f ../.mihrab-patch-settings-labels.py ]; then
    python ../.mihrab-patch-settings-labels.py . || { echo "محراب: فشلت رُقعة عناوين الإعدادات" >&2; exit 1; }
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
