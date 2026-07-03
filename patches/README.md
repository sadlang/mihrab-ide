# رُقَع الطبقة الثالثة (Core Patches)

هذا المجلّد يحوي **رُقَع وقت-البناء** التي تُطبَّق على شجرة المنبع (راجع
[`../build/prepare.sh`](../build/prepare.sh)). كلّ رُقعة هنا = **دَيْن دمج**.

> **مؤشّر صحّة المشروع = عدد الملفّات هنا.** كلّما قلّ، قلّ دَيْن الصيانة. راجع
> [`../docs/architecture/three-layer-model.md`](../docs/architecture/three-layer-model.md).

## متى تُسمح رُقعة نواة؟

فقط حين **يستحيل** تحقيق الهدف من الطبقة الأولى (إضافة محزومة) أو الثانية (تجاوز بناء).
أمثلة مبرَّرة (تأتي في م3): اتّجاه القشرة (workbench dir=rtl)، اتّجاه Monaco، محارف
تحكّم bidi (Trojan-Source)، التفاف الأسطر RTL، إزالة التتبّع.

## سياسة الرُقَع الذرّيّة

- **رُقعة واحدة = غرض واحد** باسم وصفيّ: `NNN-وصف-موجز.patch`.
- لكلّ رُقعة تعليق رأسيّ: **الغرض، الملفّات المنبعيّة، الطبقة، ولماذا تعذّرت طبقة أدنى**.
- تُولَّد بـ`git diff` من شجرة المنبع وتُطبَّق بـ`git apply --3way` (تتسامح مع انجراف المنبع).
- تُراجَع عند كلّ مزامنة منبع (م5): إن فشلت رُقعة ⇐ **أصلِحها أو ارفعها لطبقة أدنى**، لا تجمّد.

## مؤشّر الصحّة — رُقَع النواة الحاليّة (الطبقة 3)

> مصدر vscode يُستنسَخ ويُعاد ضبطه (`git reset`) داخل البناء، فرُقَعه تُطبَّق عبر **حقن
> `build.sh` المنبع** (بعد `cd vscode`) من ملفّات مُجهَّزة تنجو من الـreset — لا من هذا
> المجلّد (الذي يطبّقه `prepare.sh` على شجرة VSCodium، لا vscode). تُعدّ كلّها هنا للمؤشّر.

| # | الرُقعة | الملفّ | المبرّر |
|---|--------|--------|--------|
| 1 | اللغة الافتراضيّة العربيّة | `src/main.ts` (`getUserDefinedLocale` ← `product.defaultLocale`) | لا سبيل لضبط لغة الواجهة الافتراضيّة من الطبقتين 1/2؛ الحلّ في النواة قبل تحميل الإضافات. مرقِّعها `build/patch_main_locale.py` (idempotent). |
| 2 | اتّجاه القشرة RTL (م3، RTL-0) | `src/vs/workbench/browser/workbench.ts` (`dir="rtl"` على `.monaco-workbench` **و`documentElement`/`<html>`** + استيراد `media/mihrab-rtl.css`) | اتّجاه القشرة الجذر يتعذّر من إعداد/إضافة. ضبط `<html dir=rtl>` يورّث الاتّجاه لكلّ شيء — بما فيه مضيفو Shadow DOM (القوائم السياقيّة) والنوافذ المساعِدة (عبر `trackAttributes`). الكود يبقى LTR عبر `mihrab-rtl.css`. مرقِّعها `build/patch_workbench_rtl.py`. |
| 3 | محاذاة منسدلة شريط القوائم RTL (م3، RTL-2) | `src/vs/base/browser/ui/menu/menubar.ts` (فرع RTL يثبّت الحافّة اليمنى للمنسدلة) | الموضع محسوب بـJS (`style.left`)؛ في RTL كانت المنسدلة تخرج من حافّة النافذة اليمنى. لا سبيل لإصلاحه من CSS/إعداد. مرقِّعها `build/patch_menubar_rtl.py` (idempotent، واعٍ بـCRLF). |
| 4 | القوائم المنسدلة/السياقيّة RTL (م3، RTL-2) | `src/vs/base/browser/ui/menu/menu.ts` (تعديلان: `expandDirection`←Left، **وحقن CSS اتّجاهيّ في مولّد `getMenuWidgetCSS`**) | تعاقب الفرعيّة منطق JS. **الأهمّ**: القوائم السياقيّة تُصيَّر في **Shadow DOM** فلا يخترقها CSS المستند؛ لذا حُقنت قواعد RTL داخل مولّد CSS القائمة نفسه (محدِّد مزدوج `:host-context([dir=rtl])`+`.monaco-workbench[dir=rtl]`، `direction:rtl` صريحة لعكس ترتيب flex). مرقِّعها `build/patch_menu_rtl.py`. |

| 5 | اتّجاه SplitView الأفقيّ عامًّا RTL (م3، RTL-2) | `src/vs/base/browser/ui/splitview/splitview.ts` (`HorizontalViewItem` ← `right`) | **كلّ** SplitView أفقيّ مستقلّ (إعدادات، اختصارات، peek، master-detail) يتدفّق RTL. **باستثناء `.monaco-grid-view`** (شبكة القشرة تُدار بإعادة ترتيب العقد عبر إعداد موضع الشريط الجانبي؛ قلبها = قلب مزدوج). مرقِّعها `build/patch_splitview_rtl.py`. |
| 6 | موضع المقبض العموديّ RTL (م3، RTL-2) | `src/vs/base/browser/ui/sash/sash.ts` (`Sash.layout` VERTICAL ← `right`) | مُرافِقة لـ#5: يقلب المقبض ليحاذي العروض المقلوبة (نفس القيد: rtl + خارج الشبكة). لولاه لوقع المقبض في مكان خطأ. فاصل SplitView يُقلَب في `mihrab-rtl.css` (قاعدة 12). مرقِّعها `build/patch_sash_rtl.py`. |

| 7 | وسم splitview الشبكة RTL (م3، RTL-2 مساعِدة) | `src/vs/base/browser/ui/grid/gridview.ts` (`mihrab-grid-sv` على `splitview.el`) | يميّز splitview الذي يُنشئه gridview (شبكة القشرة **وشبكة المحرّر**) كي تستثنيه #5/#6 عبر «أقرب splitview بلا الوسم». يعالج أنّ `.monaco-grid-view` لا يميّز الشبكتين (محرّر الإعدادات داخل شبكة المحرّر — رصدته مراجعة Amelia). مرقِّعها `build/patch_gridview_marker.py`. |

**عدد رُقَع النواة = 7** (التعريب + RTL-0 + قوائم شريط + قوائم Shadow DOM + SplitView عامّ + المقبض + وسم الشبكة). كلّما قلّ، قلّ دَيْن الدمج. باقي RTL
يُنجَز قدر الإمكان بالطبقتين 1/2 (إعداد `sideBar.location:right` في إضافة `mihrab-shell`،
وورقة `mihrab-rtl.css`)؛ رُقَع النواة المتبقّية (قوائم سياقيّة، ترتيب أزرار الحوار) تأتي في
RTL-2 حصرًا حيث تعجز CSS. الجرد الكامل: [`../docs/rtl/rtl-inventory.md`](../docs/rtl/rtl-inventory.md).
