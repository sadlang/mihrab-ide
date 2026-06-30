# إضافة لغة ص (مدمجة) — `sad-lang`

إضافة **مدمجة (built-in)** في محراب توفّر دعم لغة ص بتهيئة صفريّة:
- **إبراز الصياغة** عبر [`syntaxes/sad.tmLanguage.json`](syntaxes/sad.tmLanguage.json).
- **تهيئة اللغة** (الأقواس، التعليقات، الطيّ) عبر [`language-configuration.json`](language-configuration.json).
- ربط امتداد `.ص` باللغة `sad`.

> هذه إضافة من **الطبقة الأولى** (محزومة)، دَيْن دمج شبه صفر. تُحقَن في شجرة المنبع
> وقت البناء عبر `build/build.sh` (راجع §حزم الإضافات).

## ⚠️ النحو ناتج مولَّد — لا تُحرِّره

ملفّ `syntaxes/sad.tmLanguage.json` **مولَّد من مصدر الحقيقة** في مستودع اللغة
(`s-programming-language`) عبر `scripts/codegen/gen_tmgrammar.py` (من `language-truth/`).
محراب **يستهلكه لا يكرّره** — فالإبراز يتبع اللغة آليًّا بلا انجراف.

تحديث النسخة المحزومة من مستودع اللغة:

```bash
bash build/sync-grammar.sh            # يفترض ../s-programming-language
SAD_LANG_REPO=/path/to/lang bash build/sync-grammar.sh
```

النواقص اللاحقة (م2-ب فأكثر): عميل LSP محزوم (إبراز دلاليّ + إكمال + تشخيص).
