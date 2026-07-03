#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""رُقعة نواة محراب: محرّر Monaco RTL — م1 (إعادة تصميم صحيحة) — RTL-محرّر (الطبقة 3).

**درس التصميم (مثبَت بـCDP على بناء م1 الأوّل الفاشل):** بنية Monaco الداخليّة مبنيّة على
إحداثيّات **LTR فيزيائيّة**؛ قلب حاوية `.monaco-editor` بـ`dir=rtl` يرسي عناصرها المُطلَقة
(`view-lines` داخل `lines-content` العملاق، وأبناء `.margin`) إلى اليمين خارج حاوياتها ⇒ النصّ
يطير خارج الشاشة. لذا **الحاوية تبقى LTR** (تُعاد حمايتها في mihrab-rtl.css)، ونحقّق RTL عبر:

  (أ) **اتّجاه السطر** — `_getTextDirection` يُعيد RTL افتراضيًّا (viewModelImpl.ts). هذا يُشغّل
      آليّة Monaco المدمجة: `dir="rtl"` لكلّ سطر (viewLine.ts:181) + معالجة المؤشّر RTL
      (cursorMoveCommands) + hit-test (mouseHandler). أنظف من حيلة CSS ويمنح مؤشّرًا صحيحًا.
  (ب) **المزراب يمينًا** — `margin.ts` يضع حاوية المزراب عند `contentWidth` (بعد المحتوى).
      أبناء المزراب نسبةٌ للحاوية (مثبَت: تحريك الحاوية ينقلهم) فتنتقل الأرقام معها؛ و*Left
      تبقى طبيعيّة صغيرة داخل صندوق المزراب فلا يقصّها `contain:strict` (margin.ts:83).
  (ج) **المحتوى يسارًا** — `editorScrollbar.ts` يضع المحتوى عند `left:0` بدل `contentLeft`.

**م2 (جهة الخريطة/الشريط/المسطرة):** الخريطة المصغّرة إلى أقصى اليسار (`minimap.ts` setLeft(0))؛
والمحتوى يُزاح يمينها (`editorScrollbar` left=minimapWidth، عرض=contentWidth)؛ والمزراب إلى أقصى
اليمين (`margin` left=width−contentLeft ⇐ أمتن من contentWidth+minimapWidth للجهة اليسرى). التخطيط يسار→يمين:
خريطة[0,mm] · محتوى[mm,mm+cw] · مزراب[mm+cw,W]. مسطرة النظرة + الشريط العموديّ ينتقلان لليسار
عبر mihrab-rtl.css (قاعدة 13) لأنّهما ابنا المنطقة القابلة للتمرير بـ`right:0`.

**غير مشروط** (محراب RTL-أوّلًا). مرجع: docs/rtl/monaco-rtl-map.md.
idempotent (وسم لكلّ ملفّ)، ذرّيّ، Python 3.12، CRLF. يُرقّع 8 ملفّات (م1–م5).
الاستعمال: python patch_editor_rtl.py <جذر مصدر vscode>   (مثال: «.» من داخل مجلّد vscode)
"""
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

# كلّ ملفّ: (المسار النسبيّ، الوسم، [(قديم، جديد، العدد المتوقَّع)]).
FILES = [
    (
        "src/vs/editor/common/viewModel/viewModelImpl.ts",
        "mihrab-rtl-textdir",
        [
            (
                "\t\treturn rtlCount > 0 ? TextDirection.RTL : TextDirection.LTR;",
                (
                    "\t\t// mihrab-rtl-textdir: محراب عربيّ-أوّلًا — الاتّجاه الافتراضيّ للسطر RTL (يُشغّل\n"
                    "\t\t// dir=\"rtl\" لكلّ سطر + معالجة المؤشّر/hit-test RTL المدمجة في Monaco). زخرفة LTR\n"
                    "\t\t// صريحة (rtlCount<0) تَغلِب لأسطرٍ مفروضة LTR. راجع docs/rtl/monaco-rtl-map.md.\n"
                    "\t\treturn rtlCount < 0 ? TextDirection.LTR : TextDirection.RTL;"
                ),
                1,
            ),
        ],
    ),
    (
        "src/vs/editor/browser/viewParts/margin/margin.ts",
        "mihrab-rtl-gutter",
        [
            # حقل جديد: موضع بداية المزراب = contentWidth + minimapWidth (يمين المحتوى والخريطة اليسرى).
            (
                "\tprivate _contentLeft: number;",
                "\tprivate _contentLeft: number;\n\tprivate _mihrabGutterLeft: number = 0; // mihrab-rtl-gutter (م2)",
                1,
            ),
            # التقاط الموضع في الباني وعند تغيّر التهيئة (السطران متطابقان ⇒ العدد 2).
            # الصيغة width−contentLeft (لا contentWidth+minimapWidth): متطابقة في الافتراضيّ لكنّها
            # أمتن ضدّ الإزاحة المزدوجة حين minimap.side==='left' (تُطلَق editorOptions:2961) — تُنهي
            # المزراب عند W بلا تجاوز مهما كانت الجهة (ملاحظة Amelia، م2).
            (
                "\t\tthis._contentLeft = layoutInfo.contentLeft;",
                "\t\tthis._contentLeft = layoutInfo.contentLeft;\n\t\tthis._mihrabGutterLeft = layoutInfo.width - layoutInfo.contentLeft; // mihrab-rtl-gutter (م2)",
                2,
            ),
            # ضع حاوية المزراب يمين المحتوى (الخريطة يسارًا، المحتوى وسطًا، المزراب يمينًا حتى الحافّة).
            (
                "\t\tthis._domNode.setWidth(this._contentLeft);",
                "\t\tthis._domNode.setWidth(this._contentLeft);\n\t\tthis._domNode.setLeft(this._mihrabGutterLeft); // mihrab-rtl-gutter: المزراب أقصى اليمين",
                1,
            ),
        ],
    ),
    (
        "src/vs/editor/browser/viewParts/editorScrollbar/editorScrollbar.ts",
        "mihrab-rtl-content",
        [
            # المحتوى يُزاح يمين الخريطة اليسرى (left = minimapWidth)، وعرضه = contentWidth (لا يضمّ الخريطة).
            (
                "\t\tthis.scrollbarDomNode.setLeft(layoutInfo.contentLeft);",
                "\t\tthis.scrollbarDomNode.setLeft(layoutInfo.minimap.minimapWidth); // mihrab-rtl-content (م2): المحتوى يمين الخريطة اليسرى",
                1,
            ),
            (
                "\t\t\tthis.scrollbarDomNode.setWidth(layoutInfo.contentWidth + layoutInfo.minimap.minimapWidth);",
                "\t\t\tthis.scrollbarDomNode.setWidth(layoutInfo.contentWidth); // mihrab-rtl-content (م2): الخريطة مستقلّة يسارًا",
                1,
            ),
        ],
    ),
    (
        "src/vs/editor/browser/viewParts/minimap/minimap.ts",
        "mihrab-rtl-minimap",
        [
            # الخريطة المصغّرة إلى أقصى اليسار (م2). محراب RTL-أوّلًا: تجاهل جهة minimapLeft المحسوبة.
            (
                "\t\tthis._domNode.setLeft(this._model.options.minimapLeft);",
                "\t\tthis._domNode.setLeft(0); // mihrab-rtl-minimap (م2): الخريطة أقصى اليسار",
                1,
            ),
        ],
    ),
    (
        # م3 (hit-test الطيّ/المزراب): المزراب انتقل بصريًّا يمينًا (margin.ts) لكنّ mouseTarget
        # ظلّ يحسب منطقته يسارًا [glyphMarginLeft, contentLeft] ⇒ النقر على سهم الطيّ (يمينًا) يقع
        # في «المحتوى» فلا يُطوى. نُعيد تعريف منطقة المزراب إلى اليمين [width−contentLeft, width]
        # ونُصلِح أصل مِشية التصنيف (glyph/أرقام/زخارف) لتبدأ من حافّة المزراب اليمنى.
        "src/vs/editor/browser/controller/mouseTarget.ts",
        "mihrab-rtl-hit",
        [
            (
                "\t\tthis.isInMarginArea = (this.relativePos.x < ctx.layoutInfo.contentLeft && this.relativePos.x >= ctx.layoutInfo.glyphMarginLeft);",
                "\t\tthis.isInMarginArea = (this.relativePos.x >= ctx.layoutInfo.width - ctx.layoutInfo.contentLeft); // mihrab-rtl-hit: المزراب يمينًا [width−contentLeft, width]",
                1,
            ),
            (
                "\t\t\toffset -= ctx.layoutInfo.glyphMarginLeft;",
                "\t\t\toffset -= (ctx.layoutInfo.width - ctx.layoutInfo.contentLeft); // mihrab-rtl-hit: أصل التصنيف من حافّة المزراب اليمنى",
                1,
            ),
            # م5: detail.offsetX (يستهلكه الطيّ فقط، folding.ts:412) كان القيمة المطلقة (~1100) فحارس
            # 4px `gutterOffsetX < 4` مُهزَم دائمًا ⇒ نقر فراغ 4px يطوي أيضًا. نجعله نسبيًّا للمزراب
            # (مطروحًا منه أصل المزراب اليمنى) فيعود الحارس ذا معنى (0..contentLeft).
            (
                "\t\t\t\toffsetX: offset",
                "\t\t\t\toffsetX: offset - (ctx.layoutInfo.width - ctx.layoutInfo.contentLeft) // mihrab-rtl-hit (م5): offsetX نسبيّ للمزراب (حارس الطيّ 4px)",
                1,
            ),
        ],
    ),
    (
        # م4 (التمرير الأفقيّ RTL): كلّ الأسطر عرضها = أعرض سطر، والأسطر RTL تُحاذى يمين ذلك الصندوق.
        # مع التمرير الافتراضيّ عند 0 (يسار) يظهر يسار المحتوى، فتبدو الأسطر القصيرة فارغة (نصّها
        # يمينًا خارج الشاشة). محراب RTL-أوّلًا: حين يصير المحتوى أعرض من نافذة العرض والتمرير عند 0
        # (فتح/افتراضيّ)، ننتقل لأقصى اليمين حيث يبدأ نصّ RTL. المستخدم إن مرّر يدويًّا يصير
        # scrollLeft≠0 فلا يُفرَض؛ وكشف المؤشّر (Monaco RTL-واعٍ) يتكفّل بحركة التحرير.
        "src/vs/editor/common/viewLayout/viewLayout.ts",
        "mihrab-rtl-hscroll",
        [
            # مرساة سطر-واحد. التعليق فريد. (المراسي متعدّدة الأسطر بـ\n صارت مدعومة: patch_file يطبّع
            # \n إلى سطر الملفّ CRLF/LF قبل المطابقة — انظر rulers أدناه.)
            (
                "\t\t// The height might depend on the fact that there is a horizontal scrollbar or not",
                (
                    "\t\t// mihrab-rtl-hscroll: محراب RTL-أوّلًا — ثبّت التمرير الأفقيّ يمينًا (حيث يبدأ نصّ RTL)\n"
                    "\t\t// عند اتّساع المحتوى أعرض من النافذة والتمرير ما زال عند 0 (فتح/افتراضيّ).\n"
                    "\t\t// نُعيد قراءة الأبعاد (لا نُعيد استخدام scrollDimensions أعلاه): تلك أبعادٌ قديمة قبل\n"
                    "\t\t// setScrollDimensions؛ getScrollDimensions هنا يُرجِع contentWidth المحدَّث لتوّه.\n"
                    "\t\t// convergent: بعد الضبط يصير scrollLeft≠0 فيفشل الشرط ⇒ لا إعادة دخول (والحدث لا\n"
                    "\t\t// يُطلَق أصلًا إن كان الموضع مطابقًا؛ وScrollState يقصّ scrollLeft إلى [0, scrollWidth−width]).\n"
                    "\t\t{\n"
                    "\t\t\tconst _mSd = this._scrollable.getScrollDimensions();\n"
                    "\t\t\tif (_mSd.contentWidth > _mSd.width && this._scrollable.getFutureScrollPosition().scrollLeft === 0) {\n"
                    "\t\t\t\tthis._scrollable.setScrollPositionNow({ scrollLeft: _mSd.contentWidth - _mSd.width });\n"
                    "\t\t\t}\n"
                    "\t\t}\n"
                    "\t\t// The height might depend on the fact that there is a horizontal scrollbar or not"
                ),
                1,
            ),
        ],
    ),
    (
        # م5 (موضع ودجات المحتوى في RTL): ودجات المحتوى (الاقتراحات/التحويم/تلميحات الوسائط) تُحاذى
        # يسارًا افتراضيًّا (حافّتها اليسرى عند المؤشّر تمتدّ يمينًا) ثمّ تُقصّ للنافذة. في RTL والمؤشّر
        # قرب الحافّة اليمنى (بداية السطر) لا تتّسع يمينًا فتُقصّ يسارًا وتغطّي المؤشّر. مرآة RTL: نحاذيها
        # يمينيًّا (نطرح العرض ⇒ الحافّة اليمنى عند المؤشّر، تمتدّ يسارًا). كشف RTL عبر dir للـworkbench
        # (محرّرنا نفسه LTR-حاوية). يطال الدالّتين: viewport (ودجات عاديّة) وpage (ودجات فائضة كالاقتراحات
        # allowEditorOverflow). الاقتراحات تستعمل _layoutBoxInPage (السطر 482).
        "src/vs/editor/browser/viewParts/contentWidgets/contentWidgets.ts",
        "mihrab-rtl-cwpos",
        [
            # ودجات غير الفائضة (viewport): محاذاة يمينيّة بسيطة (الإحداثيّات محتوى-نسبيّة، بلا contentLeft).
            (
                "\t\tlet left = anchor.left;",
                (
                    "\t\tlet left = anchor.left;\n"
                    "\t\t// mihrab-rtl-cwpos: في RTL حاذِ ودجة المحتوى يمينيًّا (الحافّة اليمنى عند المرساة، تمتدّ يسارًا).\n"
                    "\t\tif (this._viewDomNode.domNode.closest('.monaco-workbench')?.getAttribute('dir') === 'rtl') { left = anchor.left - width; }"
                ),
                1,
            ),
            # ودجات فائضة (page، كالاقتراحات/التحويم/تلميحات): في RTL نريد الحافّة اليمنى للودجة مُلاصِقة
            # للمؤشّر. حسابُ يسار المحتوى من قيم التخطيط أخطأ مرارًا (minimapWidth/ميزانية العرض/الشريط
            # العموديّ). **الأمتن والحاسم: حاذِ الحافّة اليمنى بموضع الـcaret المرسوم فعلًا** — نقيس
            # أوّل `.cursors-layer .cursor` مرسوم (يطابق مرساة الاقتراحات في الوضع أحاديّ المؤشّر الشائع؛
            # في multi-cursor النادر مع اقتراح قد يكون ثانويًّا لكن التأثير محاذاة أفقيّة فقط) ونضع يسار
            # الودجة = يسار الـcaret − العرض المرسوم الفعليّ (فحافّتها اليمنى = المؤشّر بلا فجوة).
            # ملاحظة مرجعيّة: فرع الـcaret مطلق-الصفحة (getBoundingClientRect) نطرح منه domNodePosition.left
            # لأنّ _layoutHorizontalSegmentInPage يعيد إضافته؛ والاحتياطيّ محرّك-نسبيّ (بلا طرح).
            # احتياطيّ (لا caret مرئيّ): محاذاة يمينيّة نسبةً لـcontentLeft.
            (
                "\t\tconst [left, absoluteAboveLeft] = this._layoutHorizontalSegmentInPage(windowSize, domNodePosition, anchor.left - ctx.scrollLeft + this._contentLeft, width);",
                (
                    "\t\t// mihrab-rtl-cwpos: في RTL حاذِ الحافّة اليمنى للودجة بموضع الـcaret المرسوم (مضمون بلا فجوة).\n"
                    "\t\tconst _mCwRtl = this._viewDomNode.domNode.closest('.monaco-workbench')?.getAttribute('dir') === 'rtl';\n"
                    "\t\tlet _mLeftArg = anchor.left - ctx.scrollLeft + this._contentLeft;\n"
                    "\t\tif (_mCwRtl) {\n"
                    "\t\t\tconst _mCaret = this._viewDomNode.domNode.querySelector('.cursors-layer .cursor');\n"
                    "\t\t\t// العرض الحقيقيّ المرسوم لا المخزَّن: بعض الودجات (الاقتراحات) تحجز عرض شريط تمرير لا تُظهره ⇒ فجوة ~14px.\n"
                    "\t\t\tconst _mRealW = Math.round(this.domNode.domNode.getBoundingClientRect().width) || width;\n"
                    "\t\t\tif (_mCaret && _mCaret.getBoundingClientRect().height > 0) { _mLeftArg = Math.round(_mCaret.getBoundingClientRect().left) - _mRealW - domNodePosition.left; }\n"
                    "\t\t\telse { _mLeftArg = anchor.left - ctx.scrollLeft + this._contentLeft - _mRealW; }\n"
                    "\t\t}\n"
                    "\t\tconst [left, absoluteAboveLeft] = this._layoutHorizontalSegmentInPage(windowSize, domNodePosition, _mLeftArg, width);"
                ),
                1,
            ),
        ],
    ),
    (
        # م5 (مرآة ودجات التراكب في RTL): ودجات التراكب المُثبَّتة في الزاوية أعلى/أسفل-اليمين
        # (كودجة البحث Ctrl+F = overlay بتفضيل TOP_RIGHT_CORNER) تُزاح بـmaxRight=2×شريط+خريطة عبر
        # `setRight(maxRight)` لتبقى بعيدةً عن الخريطة المصغّرة (يمينًا في LTR). في محراب الخريطة يسارًا
        # (رُقعة minimap setLeft(0)) ⇒ نريد الودجة أعلى-اليسار عند نفس الإزاحة (حافّة يسرى = maxRight).
        # **نُبقي setRight نفسه** (مرجعُه مُثبَت صحيحًا في LTR: right=maxRight يلاصق حافّة المحرّر ⇒
        # عرض الحاوية = عرض المحرّر) بقيمة تجعل الحافّة اليسرى عند maxRight:
        #   right = editorWidth − maxRight − clientWidth   ⇒   left = editorWidth − right − clientWidth = maxRight.
        # فائدة مزدوجة: (أ) يتجنّب غموض أصل حاوية الودجة الفائضة (overflowingOverlayWidgetsDomNode)
        # إذ نبقى في إطار setRight العامل نفسه؛ (ب) يحافظ على ثبات تخزين FastDomNode (لا كتابة style
        # مباشرة). يطال TOP/BOTTOM_RIGHT (المسار المشترك غير المكدَّس). كشف RTL عبر dir للـworkbench.
        # ⚠️ حدّ معروف (ملاحظة Amelia، غير حاجب): يفترض أنّ حاوية الودجة بعرض المحرّر (_editorWidth) —
        # صحيح لكلّ ودجات TOP_RIGHT اليوم (البحث ليس allowEditorOverflow ⇒ تُلحَق بـ_domNode). لو أُضيفت
        # مستقبلًا ودجة TOP_RIGHT فائضة (allowEditorOverflow=true) بلا stackOrdinal فقد يختلّ الإطار.
        "src/vs/editor/browser/viewParts/overlayWidgets/overlayWidgets.ts",
        "mihrab-rtl-overlay",
        [
            (
                "\t\t\t\tdomNode.setRight(maxRight);",
                (
                    "\t\t\t\t// mihrab-rtl-overlay: مرآة RTL — نعكس الودجة لليسار بإبقاء setRight بقيمة تضع الحافّة اليسرى عند maxRight.\n"
                    "\t\t\t\tif (domNode.domNode.closest('.monaco-workbench')?.getAttribute('dir') === 'rtl') { domNode.setRight(this._editorWidth - maxRight - domNode.domNode.clientWidth); }\n"
                    "\t\t\t\telse { domNode.setRight(maxRight); }"
                ),
                1,
            ),
        ],
    ),
    (
        # م5 (المسطرات rulers): خطوط عموديّة عند أعمدة (editor.rulers، مُطفأة افتراضيًّا). حاوية
        # .view-rulers تُلحَق بـ_linesContent (الطبقة القابلة للتمرير) فـsetLeft بإحداثيّات المحتوى.
        # في RTL يبدأ النصّ من يمين صندوق المحتوى (عرضه scrollWidth) ⇒ العمود N عند scrollWidth−N*w.
        # (مراجعة Amelia: contentWidth = viewport خطأ؛ ctx.scrollWidth الصحيح، ولا حاجة scrollLeft إذ
        # الطبقة تُترجَم تلقائيًّا.) ونوسّع onScrollChanged لـscrollWidthChanged وإلّا جمدت المسطرة عند
        # كتابة سطر أطول (يغيّر العرض لا الارتفاع). التحجيم مُغطّى بـonConfigurationChanged (يُعيد الرسم بلا
        # شرط عند إعادة حساب التخطيط) — لا onLayoutChanged (غير موجود في ViewPart الأساس). والعكس مشروط
        # بـdir==='rtl' (مراجعة Amelia MEDIUM-1) متّسقًا مع أخوات م5 (contentWidgets/overlayWidgets) فلا نعكس
        # محتوى LTR (سطر إنجليزيّ مفروض) على مسطرة يمينًا. مُتحقَّق حيًّا (CDP): عمود 20 عند الحافّة اليمنى−20حرفًا.
        "src/vs/editor/browser/viewParts/rulers/rulers.ts",
        "mihrab-rtl-rulers",
        [
            (
                "		return e.scrollHeightChanged;",
                "		return e.scrollHeightChanged || e.scrollWidthChanged; // mihrab-rtl-rulers (م5): أعِد الرسم عند تغيّر العرض (موضع RTL يعتمد scrollWidth)",
                1,
            ),
            (
                "		this._ensureRulersCount();\n\n		for (let i = 0, len = this._rulers.length; i < len; i++) {",
                "		this._ensureRulersCount();\n\n		// mihrab-rtl-rulers (م5، Amelia MEDIUM-1): حارس RTL يُقاس مرّة لا لكلّ مسطرة، متّسق مع أخوات م5.\n		const mihrabRtl = this.domNode.domNode.closest('.monaco-workbench')?.getAttribute('dir') === 'rtl';\n\n		for (let i = 0, len = this._rulers.length; i < len; i++) {",
                1,
            ),
            (
                "			node.setLeft(ruler.column * this._typicalHalfwidthCharacterWidth);",
                "			const mihrabLeft = ruler.column * this._typicalHalfwidthCharacterWidth; // mihrab-rtl-rulers\n			node.setLeft(mihrabRtl ? ctx.scrollWidth - mihrabLeft : mihrabLeft); // mihrab-rtl-rulers (م5): العمود N من يمين المحتوى في RTL، وإلّا LTR أصليّ",
                1,
            ),
        ],
    ),
]


def patch_file(root: str, relpath: str, mark: str, edits) -> int:
    path = os.path.join(root, relpath.replace("/", os.sep))
    try:
        with open(path, "r", encoding="utf-8", newline="") as f:
            text = f.read()
    except OSError as e:
        print(f"⚠️ تعذّر فتح {relpath}: {e}", file=sys.stderr)
        return 1
    if mark in text:
        print(f"مُرقَّع مسبقًا ({mark}) — تخطٍّ: {relpath}")
        return 0
    # نطبّع أسطر المرساة على سطر الملفّ (CRLF/LF) قبل المطابقة: مراسٍ متعدّدة الأسطر تُكتب بـ\n
    # لكنّ الملفّ قد يكون CRLF (نقرأ newline="") فتفشل المطابقة صامتةً بلا هذا التطبيع.
    # خلط النهايات في ملفّ واحد ⇒ مرساة LF لا تطابق nl=CRLF ⇒ إجهاض صاخب (return 1) لا إفساد — فشل آمن.
    nl = "\r\n" if "\r\n" in text else "\n"
    for old, _new, count in edits:
        old_nl = old.replace("\n", nl)
        if text.count(old_nl) != count:
            print(f"⚠️ عدد تطابقات غير متوقَّع ({text.count(old_nl)}≠{count}) للمرساة في {relpath}: «{old[:44]}...»", file=sys.stderr)
            return 1
    for old, new, count in edits:
        text = text.replace(old.replace("\n", nl), new.replace("\n", nl), count)
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
        print(f"⚠️ تعذّر كتابة {relpath}: {e}", file=sys.stderr)
        return 1
    print(f"✅ رُقِّع {relpath} ({mark}).")
    return 0


def main() -> int:
    if len(sys.argv) != 2:
        print("الاستعمال: python patch_editor_rtl.py <جذر مصدر vscode>", file=sys.stderr)
        return 2
    root = sys.argv[1]
    rc = 0
    for relpath, mark, edits in FILES:
        rc |= patch_file(root, relpath, mark, edits)
    if rc == 0:
        print("✅ محرّر Monaco RTL م1–م5: نصّ RTL، مزراب يمينًا، خريطة يسارًا، طيّ+تمرير أفقيّ+حارس طيّ+موضع ودجات RTL+مرآة تراكب (بحث) لليسار.")
    return rc


if __name__ == "__main__":
    sys.exit(main())
