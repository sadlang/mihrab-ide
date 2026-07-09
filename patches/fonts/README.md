# خطّ ص العربيّ المحزوم — Kawkab Mono (AR-02)

هذا المجلّد مصدرُ **الخطّ البرمجيّ العربيّ الافتراضيّ** في محراب. الخطّ نفسه (ملفّ
`kawkab-mono.woff2`) **غير متعقَّب في git** (انظر `.gitignore`) — يُورَّد وقت البناء، أسوة
بسلسلة أدوات ص المدمجة.

## ما هو Kawkab Mono؟

خطّ **أحاديّ العرض (monospace) داعم للعربيّة**، مُصمَّم أصلًا للبرمجة، يوائم مقاييس اللاتينيّة
أحاديّة العرض. مرخّص بـ**SIL Open Font License 1.1 (OFL)** — يسمح بإعادة التوزيع ضمن منتجات
(بما فيها الثنائيّات) بشرط إرفاق نصّ الرخصة وعدم بيع الخطّ منفردًا.

## كيف يُحزَم؟

1. **المصدر:** المتغيّر البيئيّ `MIHRAB_ARABIC_FONT` إن ضُبِط، وإلّا الافتراضيّ
   `patches/fonts/kawkab-mono.woff2` (هذا المجلّد).
2. **التجهيز:** `build/build.sh` ينسخ المصدر إلى `.upstream/.mihrab-kawkab-mono.woff2`.
3. **الحقن:** `build/patch_bundle_extensions.py` يشتقّ منه `base64` ويحقن قاعدة `@font-face`
   بمصدر **`data: URI`** (`data:font/woff2;base64,…`) مُقدَّمةً إلى نسخة `media` من `mihrab-rtl.css`.
   **لماذا `data:` URI لا `url()` نسبيّ؟** مُجمِّع `esbuild` (`build/lib/optimize.ts`) يحلّ `url()`
   في الـCSS المحزوم زمن البناء، و`.woff2` بلا `loader` مُهيّأ (`ttf/svg/png/sh` فقط) ⇒ `url()`
   نسبيّ يُفشِل البناء («No loader is configured for .woff2»)، وغيابُ الملفّ يُفشِله
   («Could not resolve»)؛ أمّا `data: URI` فيتركه `esbuild` حرفيًّا بلا `loader` ولا رُقعة نواة.
4. **الاستهلاك:** الخطّ المحقون هو أوّل مكدّس `editor.fontFamily`/`terminal.integrated.fontFamily`
   في `extensions/mihrab-shell`.

**سقوط رشيق:** غياب ملفّ الخطّ لا يُفشِل البناء — يفشل تحميل الوجه فيسقط العرض لبقيّة المكدّس
(`Cascadia Mono`/`Consolas` للّاتينيّة، `Segoe UI`/`Noto Sans Arabic` للعربيّة). كأدوات ص تمامًا.

## اعتماد الخطّ (خطوة المالك)

عند اعتماد Kawkab Mono للتوزيع:

1. ضَع `kawkab-mono.woff2` (وزن Regular) في هذا المجلّد، أو وجّه `MIHRAB_ARABIC_FONT` إليه.
2. أرفِق نصّ رخصة OFL الأصليّ للخطّ في `patches/fonts/OFL.txt` (إلزام الرخصة عند إعادة التوزيع).
3. أودِع الملفّين عمدًا (تجاوز `.gitignore` بـ`git add -f` إن رغبت بتعقّبهما)، أو أبقِهما موَرَّدَين
   وقت البناء.

> ملاحظة صدق: حتى تُورَّد `kawkab-mono.woff2`، يعمل محراب بمكدّس الخطّ الاحتياطيّ (لاتينيّ أحاديّ
> العرض + عربيّ من خطّ النظام). البنية جاهزة كاملةً؛ ينقص الملفّ الثنائيّ فقط.
