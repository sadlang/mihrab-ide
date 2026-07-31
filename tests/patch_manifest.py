# -*- coding: utf-8 -*-
"""مانيفست رُقَع محراب — مصدر الحقيقة الوحيد لطبقة الاختبار (L0/L1).

لكلّ مرقِّع يُطبَّق على مصدر المنبع (VSCode داخل VSCodium): كيف يُستدعى (ملفّ مفرد أم
جذر)، وأيّ ملفّات المنبع يمسّها. **مشتقّ حرفيًّا من كتلة الحقن في patch_bundle_extensions.py**
(الأوامر التي يشغّلها build.sh المنبع). حين تُغيّر أهداف مرقِّع، حدّث هنا — واختبار L0
يتحقّق أنّ المانيفست متّسق مع المرقِّعات الفعليّة.

الأوضاع:
  - "file": يُستدعى `python <patcher> <target.ts>` — target واحد.
  - "root": يُستدعى `python <patcher> <root>` — يشتقّ ملفّاته من قائمة FILES داخله.
"""

# (اسم المرقِّع، الوضع، [ملفّات المنبع النسبيّة التي يمسّها])
# ملاحظة: patch_workbench_rtl ينسخ أيضًا mihrab-rtl.css إلى media/ قبل ترقيع workbench.ts،
# لكنّ فحص المراسي يحتاج workbench.ts فقط (النسخ خطوة بناء لا مرساة).
PATCHERS = [
    ("patch_main_locale.py", "file", ["src/main.ts"]),
    ("patch_workbench_rtl.py", "file", ["src/vs/workbench/browser/workbench.ts"]),
    ("patch_menubar_rtl.py", "file", ["src/vs/base/browser/ui/menu/menubar.ts"]),
    ("patch_menu_rtl.py", "file", ["src/vs/base/browser/ui/menu/menu.ts"]),
    ("patch_gridview_marker.py", "file", ["src/vs/base/browser/ui/grid/gridview.ts"]),
    ("patch_splitview_rtl.py", "file", ["src/vs/base/browser/ui/splitview/splitview.ts"]),
    ("patch_sash_rtl.py", "file", ["src/vs/base/browser/ui/sash/sash.ts"]),
    ("patch_tabsdrop_rtl.py", "file",
     ["src/vs/workbench/browser/parts/editor/multiEditorTabsControl.ts"]),
    ("patch_welcome_rtl.py", "file",
     ["src/vs/workbench/contrib/welcomeGettingStarted/browser/gettingStarted.ts"]),
    # تصريح <html lang> من product.defaultLocale (يُفعّل :lang(ar) ويُصلح نطق قارئات الشاشة).
    ("patch_html_lang.py", "file",
     ["src/vs/code/electron-browser/workbench/workbench.ts"]),
    # افتراضُ الحوار المشروط = custom: بدونه يعرض ويندوز حوارَه بلغته وباتّجاه LTR.
    ("patch_dialog_style.py", "file",
     ["src/vs/workbench/electron-browser/desktop.contribution.ts"]),
    # جذر: يشتقّ ملفّاته الثمانية من FILES (تُستخرَج ديناميكيًّا في L1).
    ("patch_editor_rtl.py", "root", None),
]

# مرقِّعات بناء لا تُطبَّق على مصدر vscode مباشرةً (تُستثنى من فحص المراسي L1، لكنّها
# تخضع لفحص الصياغة في L0):
BUILD_PATCHERS = [
    "patch_bundle_extensions.py",  # يرقّع build.sh المنبع (لا مصدر vscode)
    "bake_nls_arabic.py",          # خطوة بعد-بناء على الـartifacts
    "patch_extension_nls.py",      # حقن package.nls.ar.json للامتدادات (بعد-بناء)
    "patch_node_gyp_spectre.py",   # م0
    "patch_npmrc_tolerance.py",    # م0
]

# طبقة الأنماط (تُفحَص في L0/L2 لا L1):
CSS_PATCH = "patches/mihrab-rtl.css"

# أصول الهوية البصريّة: يجهّزها build.sh في .mihrab-branding ويحقنها patch_bundle_extensions
# فوق resources/win32/ (electron.ts:winIcon='resources/win32/code.ico' ⇒ أيقونة الـexe؛
# code.iss:SetupIconFile ⇒ المُثبِّت؛ code_*x*.png ⇒ بلاطات ابدأ؛ default.ico ⇒ أيقونة
# المستند الافتراضيّة في المستكشف). تُفحَص في L0 (وجود) وL2 (تطابق بايتيّ مع الحزمة).
# قائمة أزواج (مصدر، هدف في resources/win32/) — الأصل الواحد قد يُنسَخ لهدفين.
BRANDING_ASSETS = [
    ("assets/branding/mihrab.ico", "code.ico"),
    ("assets/branding/mihrab.ico", "default.ico"),
    ("assets/branding/mihrab_150x150.png", "code_150x150.png"),
    ("assets/branding/mihrab_70x70.png", "code_70x70.png"),
]

# أصول SVG لهوية الأسطح غير resources/win32/ (شعار رأس التطبيق + خلفية المحرّر الفارغ).
# (مصدر, مسار الوجهة المنبعيّ داخل src/) — تُحقَن في كتلة INJECT بـcp -f.
BRANDING_SVG_ASSETS = [
    ("assets/branding/mihrab-appicon.svg", "src/vs/workbench/browser/media/code-icon.svg"),
    ("assets/branding/mihrab-letterpress-dark.svg", "src/vs/workbench/browser/parts/editor/media/letterpress-dark.svg"),
    ("assets/branding/mihrab-letterpress-light.svg", "src/vs/workbench/browser/parts/editor/media/letterpress-light.svg"),
    ("assets/branding/mihrab-letterpress-hcDark.svg", "src/vs/workbench/browser/parts/editor/media/letterpress-hcDark.svg"),
    ("assets/branding/mihrab-letterpress-hcLight.svg", "src/vs/workbench/browser/parts/editor/media/letterpress-hcLight.svg"),
]

# أصول مساحة sessions التجريبيّة (شعار حوض الأسماك المطموس + أيقونة Open-in + خلفيّة فارغة).
# (مصدر, وجهة داخل src/). vscodeLogoPath.ts مسار مطموس مملوء يُبنَى في sessions.desktop.main.js.
BRANDING_SESSIONS_ASSETS = [
    ("assets/branding/mihrab-sessions-icon.svg", "src/vs/sessions/browser/media/vscode-icon.svg"),
    ("assets/branding/mihrab-vscodeLogoPath.ts", "src/vs/sessions/contrib/aquarium/browser/vscodeLogoPath.ts"),
    ("assets/branding/mihrab-letterpress-sessions-dark.svg", "src/vs/sessions/contrib/chat/browser/media/letterpress-sessions-dark.svg"),
    ("assets/branding/mihrab-letterpress-sessions-light.svg", "src/vs/sessions/contrib/chat/browser/media/letterpress-sessions-light.svg"),
]


def editor_target_files(build_dir):
    """يستورد patch_editor_rtl.FILES ويعيد قائمة الملفّات النسبيّة التي يمسّها.

    build_dir: مسار مجلّد build/ (حيث المرقِّع). يعيد قائمة relpaths (بأسلوب src/vs/...).
    """
    import importlib.util
    import os

    path = os.path.join(build_dir, "patch_editor_rtl.py")
    spec = importlib.util.spec_from_file_location("_mihrab_patch_editor", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return [relpath for (relpath, _mark, _edits) in mod.FILES]
