# خريطة تنفيذ محرّر Monaco RTL — توليف الاستكشاف

> ناتج **3 وكلاء استكشاف متوازين** (تخطيط/مزراب · مؤشّر/تحديد/أسطر · فأرة/تمرير/خريطة)
> على مصدر VSCodium 1.121 في `.upstream/vscode`. مرجع تنفيذ مشروع محرّر Monaco RTL.

## ⚠️ تصحيح م1 (بعد بناءٍ فاشل وتشخيص CDP) — اقرأه أوّلًا

**فرضيّة الاستكشاف الأولى كانت خاطئة جزئيًّا:** «إزالة حماية LTR + عكس التخطيط». بناءُ م1 الأوّل
عليها **فشل** — النصّ طار خارج الشاشة (`.view-lines` عند `left≈16.7M`، أرقام مقصوصة). التشخيص
الحيّ (CDP على البناء الفاشل) أثبت:

- **قلب حاوية `.monaco-editor` بـ`dir=rtl` يكسر Monaco:** بنيتها الداخليّة تستعمل إحداثيّات
  **LTR فيزيائيّة**؛ العناصر المُطلَقة بلا `left` صريح ترسو يمينًا داخل حاوياتها العملاقة
  (`lines-content` عرضه 16.7M) فتطير خارج الشاشة. **الحاوية يجب أن تبقى LTR.**
- **عكس *Left في `editorOptions` آليّة خاطئة:** أبناء `.margin` نسبةٌ للحاوية، و`margin.ts`
  يستعمل `setContain('strict')` (يقصّ لعرض المزراب=`contentLeft`)؛ فقيم *Left الكبيرة تُقصّ.
- **Monaco لا يكشف العربيّة تلقائيًّا:** `_getTextDirection` (viewModelImpl.ts:856) يعتمد
  **الزخارف فقط** ويردّ LTR افتراضيًّا. لا صلة بمحتوى السطر.

**التصميم الصحيح (المُنفَّذ، رُقعة `patch_editor_rtl.py` تُرقّع 3 ملفّات):**
1. **الحاوية LTR** — تُعاد حماية `.monaco-editor{direction:ltr}` (mihrab-rtl.css قاعدة 1).
2. **اتّجاه السطر RTL** — `_getTextDirection`⇒RTL افتراضيًّا ⇒ Monaco يضبط `dir="rtl"` لكلّ سطر
   (viewLine.ts:181) فيتدفّق النصّ يمينًا، **والمؤشّر/hit-test RTL مدمجان** (لا حيلة CSS).
3. **المزراب يمينًا** — `margin.ts`: حاوية المزراب `setLeft(contentWidth)` (أبناؤها ينتقلون معها،
   مثبَت حيًّا: تحريك الحاوية +300 ⇒ الأرقام +300؛ و*Left تبقى صغيرة فلا تُقصّ).
4. **المحتوى يسارًا** — `editorScrollbar.ts`: `setLeft(0)` بدل `setLeft(contentLeft)`.

التجاور: محتوى`[0,contentWidth]` · مزراب`[contentWidth,+contentLeft]` · خريطة — بلا تراكب لأنّ
`contentWidth` يستثني عرض الخريطة. جهة الخريطة/الشريط/المسطرة = م2. **القسم التالي أرشيفيّ.**

---

## الحكم: الجدوى **عالية** — بلا مرآة رياضيّة شاملة

**السبب الجوهريّ:** المؤشّر والتحديد وأسطر النصّ تعتمد **قياس DOM الفعليّ**
(`Range.getClientRects()` / `getBoundingClientRect()`) الذي **يحترم `direction:rtl` تلقائيًّا**.
وMonaco يملك **دعم أسطر RTL مدمجًا** أصلًا. فالعمل الأساسيّ = **عكس التخطيط** لا إعادة الرياضيّات.

### دعم Monaco RTL المدمَّج (موجود، معطَّل بحمايتنا)
- `viewLine.ts:180-198`: حين `lineData.textDirection === TextDirection.RTL` ⇒ يضبط `dir="rtl"` على
  div السطر + `padding-right` بعرض شريط التمرير (تعويض) — فالنصّ يبدأ من اليمين.
- `viewLineRenderer.ts:1019-1022`: `unicode-bidi:isolate` على أجزاء RTL.
- `viewLineRenderer.ts:509-515`: لا يُقسَّم نصّ RTL (يفسد التصيير).
- `mouseHandler.ts:576-589` و`cursorMoveCommands.ts`: يعالجان `TextDirection.RTL`.
- **⚠️ حمايتنا `.monaco-editor { direction: ltr }` (mihrab-rtl.css قاعدة 1) تُلغي هذا** — إزالتها
  تُفعّل دعم Monaco المدمج للأسطر RTL.

## نظام الإحداثيّات (LTR الحالي)

`EditorLayoutInfoComputer` (editorOptions.ts:2924-2968) يبني الأعمدة تراكميًّا **من اليسار**:
```
glyphMarginLeft = 0
lineNumbersLeft = glyphMarginLeft + glyphMarginWidth
decorationsLeft = lineNumbersLeft + lineNumbersWidth
contentLeft     = decorationsLeft + lineDecorationsWidth
remainingWidth  = outerWidth - glyphMarginWidth - lineNumbersWidth - lineDecorationsWidth
contentWidth    = remainingWidth - minimapWidth
minimapLeft (2858) = minimapSide==='left' ? 0 : outerWidth - minimapWidth - verticalScrollbarWidth
overviewRuler.right (3011) = 0   // دائمًا يمينًا
```
تعديل قائم مفيد كنموذج (2961): لو الخريطة يسارًا (`minimapLeft===0`) يُزاح كلّ شيء يمينًا.

## المستهلكون: من ينتقل تلقائيًّا عند عكس القيم، ومن يحتاج تدخّلًا

**ينتقل تلقائيًّا** (يستعمل `setLeft(layoutInfo.X)` كما هي):
| الجزء | الملفّ:سطر |
|------|-----------|
| المزراب | `viewParts/margin/margin.ts:91-92` (setLeft/setWidth) |
| أرقام الأسطر | `viewParts/lineNumbers/lineNumbers.ts:200-201` (`left:${_lineNumbersLeft}px` في HTML) |
| زخارف الأسطر | `viewParts/linesDecorations/linesDecorations.ts:96-98` |
| ودجات المزراب | `viewParts/glyphMargin/glyphMargin.ts:404,419` |
| شريط تمرير المحرّر | `viewParts/editorScrollbar/editorScrollbar.ts:113` (setLeft(contentLeft)) |

**يحتاج تدخّلًا (رياضيّات/جهة مستقلّة):**
| الجزء | الملفّ:سطر | اللازم في RTL |
|------|-----------|---------------|
| **مسطرة النظرة** | `viewParts/overviewRuler/overviewRuler.ts:94-96` | `setRight`→`setLeft` (والحساب 3011 `right:0`→`left:0`) |
| **الخريطة المصغّرة** | `editorOptions.ts:2858` + `minimap.ts:1402` | عكس جهة `minimapLeft` حسب rtl |
| **شريط التمرير العموديّ** | mihrab-rtl.css قاعدة 13 | **يمينًا بجانب الأرقام** (طلب المستخدم م5): يبقى `right:0` الافتراضيّ ⇒ حافّته على الحدّ الداخليّ للمزراب. عُكِس يسارًا في م2 ثمّ أُعيد يمينًا. مُتحقَّق بصريًّا |
| **التمرير الأفقيّ (كشف)** | `viewParts/viewLines/viewLines.ts:676,784-835` | `setLeft(-scrollLeft)` واتّجاه الكشف؛ حشو `HORIZONTAL_EXTRA_PX:101` |
| **hit-test الفأرة** | `controller/mouseTarget.ts:408-414,700-730,760-795` | `mouseContentHorizontalOffset` ومنطق الهوامش (فيه `isRtl()` جزئيّ:370) |
| **ودجات المحتوى** | `viewParts/contentWidgets/contentWidgets.ts:376,581` | موضع أفقيّ نسبةً لـcontentLeft |
| **المسطرات (rulers)** | `viewParts/rulers/rulers.ts:96` (mihrab-rtl-rulers) | ✅ `ctx.scrollWidth − column*w` من يمين صندوق المحتوى + `onScrollChanged` يشمل scrollWidthChanged. مُتحقَّق حيًّا (CDP): عمود 20 عند حافّة المحتوى اليمنى−20حرفًا بالضبط، بلا إزاحة |
| **زخارف الكتل** | `viewParts/blockDecorations/blockDecorations.ts:107` | جهة |

**ملاحظة:** المؤشّر (`viewCursor.ts:269 setLeft(renderData.left)`) والتحديد (`selections.ts`) —
قيمة `left` مقيسة من DOM فتحترم rtl؛ فالـ`setLeft` بها **صحيح** (لا يحتاج `setRight`).

## علم RTL: نقطة الحقن

- خيار محرّر جديد `editor.rtl` (الأنظف): `EditorOption` enum + `IEditorOptions` + تمريره في
  `EditorLayoutInfoComputerEnv` (2558) و`computeLayout` (2875). محراب يضبطه افتراضيًّا.
- أو (مبدئيًّا لأبسط م1): **عكس غير مشروط** في الحاسب (محراب RTL-أوّلًا)، ثمّ تدريج لخيار لاحقًا.

## صيغة المرآة (تُحقَن بعد حساب contentWidth، أسوةً بتعديل الخريطة 2961)

```
// RTL: المحتوى يسارًا، المزراب يمينًا
contentLeft     = (minimap يسار ? minimapWidth : 0)
decorationsLeft = contentLeft + contentWidth
lineNumbersLeft = decorationsLeft + lineDecorationsWidth
glyphMarginLeft = lineNumbersLeft + lineNumbersWidth
// overviewRuler: left:0 بدل right:0 ؛ scrollbar/minimap: الجهة المعاكسة
```

## المراحل (مرجع [monaco-rtl-plan.md](monaco-rtl-plan.md))

> ⚠️ الوصف أدناه للمراحل م1/م2 **أرشيفيّ** (صيغة الفرضيّة الأولى). التنفيذ الفعليّ المُنجَز في
> قسم «تصحيح م1» أعلى الملفّ + التالي. الحالة الحقيقيّة:

1. **م1 — ✅ مُنجَز ومُتحقَّق بصريًّا (CDP، بناء rtl8):** الحاوية LTR + `_getTextDirection`⇒RTL
   (dir=rtl لكلّ سطر + مؤشّر/hit-test مدمجان) + المزراب/الأرقام يمينًا + المحتوى يسارًا.
   قياس: نصّ عربيّ `[300,1004]`، مزراب `[1004,1072]`، `firstLineDir="rtl"`.
2. **م2 — ✅ مُنجَز ومُتحقَّق بصريًّا (CDP، بناء rtl9):** الخريطة المصغّرة `setLeft(0)` (يسارًا)،
   المحتوى `left=minimapWidth` عرض `contentWidth`، المزراب `left=width−contentLeft` (ينتهي عند W)،
   والمسطرة+الشريط العموديّ إلى اليسار عبر mihrab-rtl.css قاعدة 13. قياس: خريطة `[300,380]`،
   محتوى `[380,1084]`، مزراب `[1084,1152]`، مسطرة/شريط `[380,394]`.
   قيد معروف (م3): `minimap.side='left'` (غير الافتراضيّ) — عولج جزئيًّا بصيغة `width−contentLeft`.
3. **م3 — ✅ مُنجَز ومُتحقَّق (بناء rtl10/rtl11):** إصلاح خلَلَي المستخدم:
   - **الطيّ (folding):** `mouseTarget.ts` — منطقة المزراب `[width−contentLeft, width]` يمينًا + أصل
     تصنيف الأجزاء من الحافّة اليمنى. تحقّق CDP: نقر السهم عند `x=1141` (المزراب الأيمن) ⇒ الأسطر
     المرئيّة 37→3، السهم expanded→collapsed. ✅
   - **التمرير اللاصق (sticky scroll):** `float:right` على `.sticky-widget-line-numbers` (يزيح
     الأرقام يمينًا والمحتوى يسارًا بآليّة الطفو) + `direction:rtl` على `.sticky-line-content`
     (renderViewLine لا يضع dir، خلافًا لـviewLine.ts). تحقّق CDP+لقطة: أرقام يمينًا، نصّ من اليمين. ✅
4. **م4 — ✅ مُنجَز ومُتحقَّق (بناء rtl12، تكرار ١):** التمرير الأفقيّ RTL. الجذر: كلّ الأسطر
   بعرض أعرض سطر، والقصيرة RTL تُحاذى يمين الصندوق (content-x≈2270) ⇒ مع scrollLeft=0 (يسار)
   تبدو فارغة والنقر لا يصيبها (يذهب لنهاية السطر). الإصلاح: `viewLayout._updateContentWidth` —
   حين يتّسع المحتوى أعرض من النافذة والتمرير عند 0 (فتح)، ثبّته لأقصى اليمين (`contentWidth−width`).
   تحقّق CDP: فتح ⇒ scrollLeft=−1200، الأسطر القصيرة مرئيّة `[941,1070]`؛ نقر x=1050→ع١ (بداية)،
   x=960→ع١٥ (نهاية) ⇒ **hit-test دقيق**. حارس `scrollLeft===0` ذرّيّ (لا حلقة، Amelia).
   قيود متبقّية (تجميليّة): استعادة scrollLeft=0 محفوظ تُدفَع يمينًا؛ مزامنة الفرق لحظيّة.
5. **م5 (مُنجَز 2026-07-03):** حارس الطيّ 4px ✅ (mihrab-rtl-hit)، ودجات المحتوى/التراكب ✅
   (mihrab-rtl-cwpos/overlay)، **المسطرات ✅ (mihrab-rtl-rulers: `ctx.scrollWidth − column*w` من يمين المحتوى،
   مشروط بـ`dir==='rtl'` كأخوات م5 (التحجيم مُغطّى بـ`onConfigurationChanged`)، مُتحقَّق بصريًّا بلا إزاحة)**.
   **زخارف الكتل:** لا-قضيّة (تمتدّ كامل `contentWidth` ⇒ محايدة للاتّجاه — مُتحقَّق حيًّا count=0/بنيويًّا).
   حالات حافّيّة موثَّقة (لا تظهر عاديًّا): `minimap.side='left'` (إعداد مستخدم؛ محراب يفرض اليسار)،
   IME/الالتفاف (محرّك Monaco مدمج)، أيقونة طيّ التمرير اللاصق (تفصيل hover ضمن السطر اللاصق المرقَّع قاعدة 14).
   **حدود المسطرات المعروفة (مراجعة Amelia، مطفأة افتراضيًّا فلا تظهر):** (أ) **مسار GPU خارج نطاق طبقة RTL
   معماريًّا لا سهوًا:** المنبع نفسه يرفض تصيير أسطر RTL على GPU — `ViewGpuContext.canRender()` يُرجع `false`
   لأيّ سطر `containsRTL` (viewGpuContext.ts:166) فيسقط لمصيّر DOM المرقَّع؛ وكامل طبقة `browser/gpu/` بلا أيّ
   معالجة RTL (`rectangleRenderer` يفترض مزرابًا يسارًا: `ViewportOffsetX=contentLeft`, `scissorRect` من اليسار).
   لذا رقعة `rulersGpu.ts` معزولةً = إصلاح كاذب (مسطرة صحيحة في إطار GPU غير مكيَّف + غير قابل للتحقّق حيًّا)؛
   الصواب تركه حتّى يكيّف المنبع طبقة GPU كاملةً لـRTL. (ب) عمود يتجاوز `scrollWidth` (نافذة ضيّقة) ⇒ `left`
   سالب يُقصّ يسارًا (لا انهيار؛ اختفاء غير متماثل مقبول لـRTL-أوّلًا).

## ملفّات المشروع (مرجع سريع)

```
editorOptions.ts (EditorLayoutInfoComputer) ........ التخطيط + علم rtl [م1]
mihrab-rtl.css قاعدة 1 ............................. إزالة حماية LTR [م1]
viewParts/overviewRuler/overviewRuler.ts .......... جهة المسطرة [م2]
viewParts/editorScrollbar/editorScrollbar.ts ...... جهة الشريط [م2]
viewParts/minimap/minimap.ts + editorOptions:2858 . جهة الخريطة [م2]
viewParts/viewLines/viewLines.ts .................. التمرير الأفقيّ [م3]
controller/mouseTarget.ts ......................... hit-test [م4]
viewParts/contentWidgets, rulers, blockDecorations  ودجات/تفاصيل [م5]
```
