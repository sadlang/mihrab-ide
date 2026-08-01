/*---------------------------------------------------------------------------------------------
 *  رُقعة نواة محراب — معجم عناوين الإعدادات (الطبقة 3).
 *
 *  ## لماذا مِلفٌّ جديدٌ لا سلسلةُ ترجمة
 *
 *  عناوينُ الإعدادات في لوحة الإعدادات **ليست سلاسلَ مترجَمة**. لا مدخلَ لها في
 *  `nls.messages.json` ولا في حزمة اللغة، فخبزُ العربيّة (‏bake_nls_arabic) لا يمسّها.
 *  هي تُشتَقّ حسابيًّا من اسم المفتاح وقتَ التشغيل في `wordifyKey`:
 *
 *      'editor.formatOnSave'  →  'Editor › Format On Save'
 *
 *  فيبقى في واجهةٍ عربيّةٍ كاملةٍ سطرٌ لاتينيٌّ فوق كلّ إعداد. والعطبُ ليس تجميليًّا:
 *  العنوانُ هو ما يقرؤه المستخدم أوّلًا ليعرف ما يضبط، ووصفُه تحته عربيّ — فيقرأ
 *  اللاتينيّة يسارًا ثمّ العربيّةَ يمينًا في السطر التالي، وهو ارتدادُ اتّجاهٍ في كلّ بند.
 *
 *  ## القاعدة الحاكمة: لا نصفَ ترجمة
 *
 *  التركيبُ كلمةً-كلمةً يولّد عربيّةً مكسورة («تنسيق على حفظ»). فالمعجم ثلاثُ طبقاتٍ
 *  مرتّبة، وكلٌّ منها **إمّا يحلّ المقطعَ كاملًا أو يُرجِع null**:
 *
 *    1. `PHRASES` — مقابلٌ حرفيٌّ للعبارة كاملةً (أعلى جودة، أدنى تعميم).
 *    2. `RULES`   — صيغٌ متكرّرة تُقشَّر أطرافُها ثمّ **تُحَلّ محتجَزاتُها تعاوديًّا**؛
 *                   إن تعذّر حلُّ **أيٍّ** منها سقطت القاعدة كلُّها.
 *    3. `WORDS`   — كلمةٌ مفردة.
 *
 *  وما لم يُحَلّ يعود **إنجليزيًّا كما هو**. هذا مقصود: كثيرٌ من العناوين أسماءُ أعلامٍ
 *  لا تُترجَم أصلًا (‏Vite، Webpack، Pinecone، Docusaurus)، وترجمتُها تشويهٌ لا تعريب.
 *
 *  ## أين يُستدعى
 *
 *  في نهاية `wordifyKey` — وله موضعا استدعاءٍ اثنان لا ثالثَ لهما، كلاهما في
 *  `settingKeyToDisplayFormat` و**بعد** `trimCategoryForGroup`. فاقتطاعُ الفئة يجري
 *  على الإنجليزيّة الأصليّة ولا يتأثّر، والتعريبُ آخرُ خطوةٍ قبل العرض.
 *
 *  مسار الفئة يُبنى بـ‏'‏›‏'‏ فاصلًا؛ نعرّب كلّ مقطعٍ على حدة لأنّ المسار ليس جملةً
 *  فتركيبُه لا يُنتج خطأً نحويًّا: «‏المحرّر › الاقتراحات‏».
 *--------------------------------------------------------------------------------------------*/

const SEPARATOR = ' › ';

/**
 * وصلُ حرفِ جرٍّ بكلمة. الحرفُ المفرد لا يُكتَب منفصلًا في العربيّة، ووصلُه بالمعرَّف
 * بأل له قاعدتان مختلفتان — وتجاهلُهما يُنتج «بـالدفع» و«لـالمحرّر»، وهو خطأٌ إملائيٌّ
 * صريحٌ يراه المستخدم في كلّ بندٍ تولّده القاعدة.
 *
 *   الباء: ب + الدفع  ⇐ «بالدفع»   (وصلٌ مباشر)
 *   اللام: ل + الدفع  ⇐ «للدفع»    (تُحذَف ألفُ «ال»)
 *
 * وما لم يُعرَّف بأل يوصَل بتطويلٍ صريح («بـNode») كي لا يلتبس أوّلُ الكلمة بالحرف.
 */
function joinPreposition(letter: 'ب' | 'ل', word: string): string {
	if (word.startsWith('ال')) {
		return letter === 'ل' ? letter + word.slice(1) : letter + word;
	}
	return letter + 'ـ' + word;
}

/**
 * عباراتٌ كاملة. المفتاح بحروفٍ صغيرة (المطابقة غيرُ حسّاسة لحالة الأحرف).
 * تسبق كلَّ شيء: حين يوجد مقابلٌ حرفيٌّ فهو الأصحّ دائمًا.
 */
const PHRASES = new Map<string, string>(Object.entries({
	// ── فئاتٌ عليا (مصطلحاتُها موافقةٌ لحزمة اللغة العربيّة الرسميّة) ──
	'editor': 'المحرّر',
	'workbench': 'بيئة العمل',
	'window': 'النافذة',
	'terminal': 'الطرفيّة',
	'explorer': 'المستكشف',
	'search': 'البحث',
	'debug': 'التنقيح',
	'extensions': 'الامتدادات',
	'files': 'الملفّات',
	'breadcrumbs': 'أشرطة التنقّل',
	'outline': 'المخطّط',
	'minimap': 'الخريطة المصغّرة',
	'suggest': 'الاقتراحات',
	'diff editor': 'محرّر المقارنة',
	'merge editor': 'محرّر الدمج',
	'scm': 'إدارة المصدر',
	'problems': 'المشكلات',
	'output': 'الإخراج',
	'notebook': 'الدفتر',
	'accessibility': 'إمكانيّة الوصول',
	'security': 'الأمان',
	'update': 'التحديث',
	'telemetry': 'القياس عن بُعد',
	'remote': 'الاتّصال البعيد',
	'task': 'المهامّ',
	'tasks': 'المهامّ',
	'keyboard': 'لوحة المفاتيح',
	'screencast mode': 'وضع العرض التعليميّ',
	'zen mode': 'وضع التركيز',
	'audio cues': 'التلميحات الصوتيّة',
	'signals': 'الإشارات',
	'comments': 'التعليقات',
	'timeline': 'الخطّ الزمنيّ',
	'settings sync': 'مزامنة الإعدادات',
	'workspace': 'مساحة العمل',
	'application': 'التطبيق',
	'http': 'الشبكة',
	'chat': 'الدردشة',
	'inline chat': 'الدردشة السطريّة',
	'goto location': 'الانتقال إلى موضع',
	'find': 'البحث',
	'hover': 'التحويم',
	'lightbulb': 'مصباح الإجراءات',
	'inlay hints': 'التلميحات المضمّنة',
	'guides': 'الأدلّة',
	'bracket pair colorization': 'تلوين أزواج الأقواس',
	'unicode highlight': 'إبراز محارف يونيكود',
	'gpu acceleration': 'تسريع المعالج الرسوميّ',
	'code actions on save': 'إجراءات الشيفرة عند الحفظ',
	'quick suggestions': 'الاقتراحات السريعة',
	'parameter hints': 'تلميحات المعاملات',
	'lint': 'التدقيق',
	'format': 'التنسيق',
	'preferences': 'التفضيلات',
	'preview': 'المعاينة',
	'validate': 'التحقّق',
	'completion': 'الإكمال',
	'colorization': 'التلوين',
	'trace': 'التتبّع',
	'proxy': 'الوسيط',
	'experimental': 'تجريبيّ',
	'general': 'عامّ',
	'inline suggest': 'الاقتراح السطريّ',
	'inline completions': 'الإكمالات السطريّة',
	'decorations': 'الزخارف',
	'settings': 'الإعدادات',
	'scrollbar': 'شريط التمرير',
	'blame': 'نسبة التغيير',
	'parameter names': 'أسماء المعاملات',
	'variable types': 'أنواع المتغيّرات',
	'references code lens': 'عدسة المراجع',
	'implementations code lens': 'عدسة التنفيذات',
	'command palette': 'لوحة الأوامر',
	'quick open': 'الفتح السريع',
	'search editor': 'محرّر البحث',
	'local history': 'السجلّ المحلّيّ',
	'signal options': 'خيارات الإشارات',
	'implicit project config': 'إعداد المشروع الضمنيّ',
	'console': 'وحدة التحكّم',
	'browser': 'المتصفّح',
	'web': 'الويب',
	'graph': 'الرسم البيانيّ',
	'list': 'القائمة',
	'tree': 'الشجرة',
	'view': 'العرض',
	'links': 'الروابط',
	'integrated terminal': 'الطرفيّة المدمجة',
	'external terminal': 'الطرفيّة الخارجيّة',
	'basic': 'أساسيّ',
	'advanced': 'متقدّم',
	'common': 'مشترك',

	// ── عباراتٌ اسميّة شائعة (رؤوس الإضافة تحتاج تعريفًا صحيحًا، فلا تُركَّب آليًّا) ──
	'font size': 'حجم الخطّ',
	'font family': 'عائلة الخطّ',
	'font weight': 'وزن الخطّ',
	'font ligatures': 'روابط الخطّ',
	'line height': 'ارتفاع السطر',
	'line numbers': 'أرقام الأسطر',
	'letter spacing': 'تباعد الحروف',
	'word wrap': 'التفاف الكلمات',
	'word wrap column': 'عمود التفاف الكلمات',
	'word separators': 'فواصل الكلمات',
	'tab size': 'حجم علامة الجدولة',
	'tab completion': 'الإكمال بمفتاح الجدولة',
	'insert spaces': 'إدراج مسافات',
	'detect indentation': 'كشف المسافة البادئة',
	'trim auto whitespace': 'قصّ الفراغ التلقائيّ',
	'trim trailing whitespace': 'قصّ الفراغ الذيليّ',
	'insert final newline': 'إدراج سطرٍ أخيرٍ فارغ',
	'trim final newlines': 'قصّ الأسطر الفارغة الأخيرة',
	'render whitespace': 'إظهار الفراغ',
	'render control characters': 'إظهار محارف التحكّم',
	'render line highlight': 'إبراز السطر الحاليّ',
	'render final newline': 'إظهار السطر الأخير',
	'cursor style': 'شكل المؤشّر',
	'cursor blinking': 'وميض المؤشّر',
	'cursor width': 'عرض المؤشّر',
	'cursor surrounding lines': 'أسطر الإحاطة بالمؤشّر',
	'smooth scrolling': 'تمريرٌ ناعم',
	'mouse wheel zoom': 'التكبير بعجلة الفأرة',
	'sticky scroll': 'التمرير الملتصق',
	'side by side': 'جنبًا إلى جنب',
	'inline suggestions': 'الاقتراحات السطريّة',
	'drag and drop': 'السحب والإفلات',
	'line count': 'عدد الأسطر',
	'code lens': 'عدسة الشيفرة',
	'color theme': 'سمة الألوان',
	'icon theme': 'سمة الأيقونات',
	'product icon theme': 'سمة أيقونات المنتج',
	'zoom level': 'مستوى التكبير',
	'title bar style': 'نمط شريط العنوان',
	'menu bar visibility': 'ظهور شريط القوائم',
	'activity bar': 'شريط النشاط',
	'status bar': 'شريط الحالة',
	'side bar': 'الشريط الجانبيّ',
	'panel': 'اللوحة',
	'editor group': 'مجموعة المحرّرات',
	'tab height': 'ارتفاع التبويب',
	'default branch name': 'اسم الفرع الافتراضيّ',
	'executable path': 'مسار الملفّ التنفيذيّ',
	'working directory': 'مجلّد العمل',
	'exclude': 'الاستثناءات',
	'include': 'المشمولات',
	'watcher exclude': 'استثناءات المراقب',
	'associations': 'الارتباطات',
	'encoding': 'الترميز',
	'eol': 'نهاية السطر',
	'auto save': 'الحفظ التلقائيّ',
	'auto save delay': 'مهلة الحفظ التلقائيّ',
	'hot exit': 'استبقاء الجلسة عند الإغلاق',
	'default language': 'اللغة الافتراضيّة',
	'restore windows': 'استعادة النوافذ',
	'confirm before close': 'التأكيد قبل الإغلاق',
	'sort order': 'ترتيب الفرز',
	'compact folders': 'مجلّداتٌ مضغوطة',
	'single click behaviour': 'سلوك النقرة الواحدة',
	'default view mode': 'وضع العرض الافتراضيّ',
	'quote style': 'نمط علامات الاقتباس',
	'brace style': 'نمط الأقواس',
	'organize imports': 'تنظيم الاستيرادات',
	'plugin paths': 'مسارات الإضافات',
	'server path': 'مسار الخادم',
	'node path': 'مسار Node',
	'custom data': 'بيانات مخصّصة',
	'selection mode': 'وضع التحديد',
	'diff algorithm': 'خوارزميّة المقارنة',
	'count badge': 'شارة العدد',
	'label format': 'صيغة التسمية',
	'page size': 'حجم الصفحة',
	'watch options': 'خيارات المراقبة',
	'log level': 'مستوى السجلّ',
	'update mode': 'وضع التحديث',
	'follow symlinks': 'اتّباع الروابط الرمزيّة',
	'use ignore files': 'استعمال ملفّات التجاهل',
	'smart case': 'مراعاة الحالة الذكيّة',
	'match case': 'مطابقة حالة الأحرف',
	'whole word': 'كلمةٌ كاملة',
	'seed on focus': 'التعبئة عند التركيز',
	'run in terminal': 'التشغيل في الطرفيّة',
	'save before start': 'الحفظ قبل البدء',
	'break on load': 'التوقّف عند التحميل',
	'inline values': 'القيم السطريّة',
	'force push': 'الدفع القسريّ',
	'no verify commit': 'الإيداع بلا تحقّق',
	'sign off': 'التوقيع بالاسم',
	'closing tags': 'إغلاق الوسوم',
	'closing brackets': 'إغلاق الأقواس',
	'closing quotes': 'إغلاق علامات الاقتباس',
	'surrounding pairs': 'الأزواج المحيطة',
	'staged changes': 'التغييرات المُدرَجة',
	'untracked changes': 'التغييرات غير المتتبَّعة',
	'anonymous access': 'الوصول المجهول',
	'connection token': 'رمز الاتّصال',
	'tool bar location': 'موضع شريط الأدوات',
})) as Map<string, string>;

/**
 * كلماتٌ مفردة. تُستعمل مباشرةً حين يكون العنوان كلمةً واحدة، وداخلَ القواعد بديلًا
 * للباقي. القيمُ معرّفةٌ بأل لأنّ موقعَها الغالب مفعولٌ به بعد فعلٍ في قاعدة.
 */
const WORDS = new Map<string, string>(Object.entries({
	'enabled': 'مفعّل',
	'enable': 'التفعيل',
	'disabled': 'معطّل',
	'default': 'الافتراضيّ',
	'delay': 'المهلة',
	'timeout': 'مهلة الانتظار',
	'size': 'الحجم',
	'path': 'المسار',
	'paths': 'المسارات',
	'location': 'الموضع',
	'mode': 'الوضع',
	'style': 'النمط',
	'type': 'النوع',
	'value': 'القيمة',
	'variables': 'المتغيّرات',
	'title': 'العنوان',
	'icons': 'الأيقونات',
	'badges': 'الشارات',
	'colors': 'الألوان',
	'border': 'الحدّ',
	'padding': 'الحشو',
	'scale': 'المقياس',
	'volume': 'مستوى الصوت',
	'visibility': 'الظهور',
	'top': 'الأعلى',
	'bottom': 'الأسفل',
	'above': 'فوق',
	'side': 'الجانب',
	'layout': 'التخطيط',
	'history': 'السجلّ',
	'log': 'السجلّ',
	'progress': 'التقدّم',
	'schema': 'المخطّط',
	'schemas': 'المخطّطات',
	'scope': 'النطاق',
	'server': 'الخادم',
	'sources': 'المصادر',
	'target': 'الهدف',
	'template': 'القالب',
	'languages': 'اللغات',
	'locale': 'اللغة والمنطقة',
	'names': 'الأسماء',
	'patterns': 'الأنماط',
	'filters': 'المرشّحات',
	'references': 'المراجع',
	'diagnostics': 'التشخيصات',
	'documentation': 'التوثيق',
	'implementation': 'التنفيذ',
	'indentation': 'المسافة البادئة',
	'brackets': 'الأقواس',
	'breaks': 'الفواصل',
	'error': 'الخطأ',
	'warning': 'التحذير',
	'setting': 'الإعداد',
	'setup': 'التهيئة',
	'channel': 'القناة',
	'dictionary': 'القاموس',
	'environment': 'البيئة',
	'extension': 'الامتداد',
	'module': 'الوحدة',
	'loop': 'الحلقة',
	'macros': 'الماكرو',
	'manage': 'الإدارة',
	'clear': 'المسح',
	'run': 'التشغيل',
	'save': 'الحفظ',
	'expand': 'التوسيع',
	'restore': 'الاستعادة',
	'dispatch': 'الإرسال',
	'sequence': 'التسلسل',
	'serialization': 'التسلسل الثنائيّ',
	'presentation': 'العرض',
	'platform': 'المنصّة',
	'product': 'المنتج',
	'star': 'النجمة',
	'roots': 'الجذور',
	'scripts': 'السكربتات',
	'styles': 'الأنماط',
	'regex': 'التعبير النمطيّ',
	'id': 'المعرّف',
	'date': 'التاريخ',
	'destination': 'الوجهة',
	'cycle': 'التدوير',
	'config': 'الإعداد',
	'guidance': 'الإرشاد',
	'requirements': 'المتطلّبات',
	'hint': 'التلميح',
	// أسماءُ حقولٍ متكرّرة داخلَ القواعد
	'files': 'الملفّات',
	'file': 'الملفّ',
	'folders': 'المجلّدات',
	'folder': 'المجلّد',
	'lines': 'الأسطر',
	'line': 'السطر',
	'words': 'الكلمات',
	'word': 'الكلمة',
	'suggestions': 'الاقتراحات',
	'imports': 'الاستيرادات',
	'functions': 'الدوالّ',
	'function': 'الدالّة',
	'classes': 'الأصناف',
	'methods': 'التوابع',
	'fields': 'الحقول',
	'properties': 'الخصائص',
	'property': 'الخاصّيّة',
	'modules': 'الوحدات',
	'constants': 'الثوابت',
	'constructors': 'البواني',
	'interfaces': 'الواجهات',
	'namespaces': 'فضاءات الأسماء',
	'operators': 'المعاملات',
	'events': 'الأحداث',
	'keys': 'المفاتيح',
	'values': 'القيم',
	'strings': 'السلاسل النصّيّة',
	'numbers': 'الأرقام',
	'booleans': 'القيم المنطقيّة',
	'arrays': 'المصفوفات',
	'objects': 'الكائنات',
	'structs': 'البُنى',
	'enums': 'التعدادات',
	'labels': 'التسميات',
	'headers': 'الترويسات',
	'packages': 'الحزم',
	'links': 'الروابط',
	'tabs': 'التبويبات',
	'tags': 'الوسوم',
	'changes': 'التغييرات',
	'commit': 'الإيداع',
	'branch': 'الفرع',
	'window': 'النافذة',
	'editor': 'المحرّر',
	'terminal': 'الطرفيّة',
	'whitespace': 'الفراغ',
	'command': 'الأمر',
	'options': 'الخيارات',
	'length': 'الطول',
	'height': 'الارتفاع',
	'width': 'العرض',
	'count': 'العدد',
	'order': 'الترتيب',
	'input': 'الدخل',
	'selector': 'المحدّد',
	'preview': 'المعاينة',
	'updates': 'التحديثات',
	'notifications': 'الإشعارات',

	// ── دفعةٌ ثانية: مختارةٌ بتحليلِ ربحٍ على المفاتيح المحصودة، لا بالحدس ──
	'space': 'المسافة',
	'spaces': 'المسافات',
	'action': 'الإجراء',
	'actions': 'الإجراءات',
	'tab': 'التبويب',
	'view': 'العرض',
	'bar': 'الشريط',
	'focus': 'التركيز',
	'click': 'النقر',
	'position': 'الموضع',
	'code': 'الشيفرة',
	'closing': 'الإغلاق',
	'opening': 'الفتح',

	// ── دفعةٌ ثالثة: مقيسةٌ على أقسام الإعدادات الأساسيّة وحدها ──
	'members': 'الأعضاء',
	'parameters': 'المعاملات',
	'clipboard': 'الحافظة',
	'execution': 'التنفيذ',
	'announcements': 'الإعلانات',
	'release': 'الإصدار',
	'age': 'العمر',
	'bell': 'الجرس',
	'area': 'المنطقة',
	'watch': 'المراقبة',
	'voice': 'الصوت',
	'recording': 'التسجيل',
	'underline': 'التسطير',
	'upvote': 'التصويت الإيجابيّ',
	'animation': 'الحركة',
	'edits': 'التعديلات',
	'debounce': 'كبح التكرار',
	'override': 'التجاوز',
	'task': 'المهمّة',
	'chat': 'الدردشة',
	'notebook': 'الدفتر',
	'debug': 'التنقيح',
	'diff': 'المقارنة',
	'breakpoint': 'نقطة التوقّف',
	'user': 'المستخدم',
	'page': 'الصفحة',
	'ports': 'المنافذ',
	'port': 'المنفذ',
	'decorations': 'الزخارف',
	'support': 'الدعم',
	'agent': 'الوكيل',
	'import': 'الاستيراد',
	'gutter': 'الهامش',
	'indent': 'المسافة البادئة',
	'sizing': 'التحجيم',
	'host': 'المضيف',
	'hosts': 'المضيفات',
	'force': 'الإجبار',
	'header': 'الترويسة',
	'color': 'اللون',
	'bracket': 'القوس',
	'braces': 'الأقواس المعقوفة',
	'edit': 'التحرير',
	'separator': 'الفاصل',
	'language': 'اللغة',
	'status': 'الحالة',
	'font': 'الخطّ',
	'scrollbar': 'شريط التمرير',
	'section': 'القسم',
	'settings': 'الإعدادات',
	'repositories': 'المستودعات',
	'repository': 'المستودع',
	'group': 'المجموعة',
	'tokenization': 'التقطيع الرمزيّ',
	'source': 'المصدر',
	'break': 'التوقّف',
	'breakpoints': 'نقاط التوقّف',
	'request': 'الطلب',
	'end': 'النهاية',
	'start': 'البداية',
	'content': 'المحتوى',
	'results': 'النتائج',
	'drag': 'السحب',
	'drop': 'الإفلات',
	'menu': 'القائمة',
	'startup': 'بدء التشغيل',
	'limit': 'الحدّ',
	'behavior': 'السلوك',
	'behaviour': 'السلوك',
	'completions': 'الإكمالات',
	'completion': 'الإكمال',
	'node': 'العقدة',
	'attributes': 'السمات',
	'attribute': 'السمة',
	'wrap': 'الالتفاف',
	'suggestion': 'الاقتراح',
	'access': 'الوصول',
	'definition': 'التعريف',
	'declaration': 'التصريح',
	'reference': 'المرجع',
	'context': 'السياق',
	'controls': 'أدوات التحكّم',
	'model': 'النموذج',
	'dialog': 'الحوار',
	'rules': 'القواعد',
	'rule': 'القاعدة',
	'tools': 'الأدوات',
	'signing': 'التوقيع',
	'experiments': 'التجارب',
	'project': 'المشروع',
	'tracing': 'التتبّع',
	'trash': 'سلّة المهملات',
	'undo': 'التراجع',
	'onboarding': 'الترحيب',
	'kind': 'النوع',
	'center': 'المنتصف',
	'char': 'المحرف',
	'characters': 'المحارف',
	'protection': 'الحماية',
	'prefix': 'البادئة',
	'suffix': 'اللاحقة',
	'validation': 'التحقّق',
	'script': 'السكربت',
	'selection': 'التحديد',
	'snippet': 'القصاصة',
	'snippets': 'القصاصات',
	'symbols': 'الرموز',
	'symbol': 'الرمز',
	'branches': 'الفروع',
	'quotes': 'علامات الاقتباس',
	'entries': 'المدخلات',
	'items': 'العناصر',
	'item': 'العنصر',
	'workspace': 'مساحة العمل',
	'session': 'الجلسة',
	'sessions': 'الجلسات',
	'process': 'العمليّة',
	'processes': 'العمليّات',
	'shell': 'الصَّدَفة',
	'profile': 'الملفّ الشخصيّ',
	'profiles': 'الملفّات الشخصيّة',
	'notification': 'الإشعار',
	'message': 'الرسالة',
	'messages': 'الرسائل',
	'errors': 'الأخطاء',
	'warnings': 'التحذيرات',
	'info': 'المعلومات',
	'enter': 'مفتاح الإدخال',
	'images': 'الصور',
	'organizations': 'المنظّمات',
	'account': 'الحساب',
	'cells': 'الخلايا',
	'cell': 'الخليّة',
	'markers': 'العلامات',
	'ranges': 'المجالات',
	'range': 'المجال',
	'depth': 'العمق',
	'interval': 'الفترة',
	'retries': 'المحاولات',
	'strategy': 'الاستراتيجيّة',
	'algorithm': 'الخوارزميّة',
	'format': 'الصيغة',
	'version': 'الإصدار',
	'versions': 'الإصدارات',
	'arguments': 'الوسائط',
	'args': 'الوسائط',
	'flags': 'الرايات',
	'body': 'المتن',
	'response': 'الاستجابة',

	// ── مصادرُ الأفعال التي لها رؤوسُ قواعد ──
	// ضروريّةٌ لا تكرار: القاعدةُ الذيليّة تُقشَر أوّلًا فيصير رأسُ الفعل **مقطعًا مفردًا**
	// («Auto Accept Delay» ⇐ ذيلُ Delay ⇒ يُطلَب حلُّ «Auto Accept» ⇒ يُطلَب حلُّ «Accept»).
	// بغير المصدر يسقط المسارُ الصحيح فيلتقطه رأسُ الصفة بترجمةٍ مقلوبة.
	'accept': 'القبول',
	'show': 'العرض',
	'hide': 'الإخفاء',
	'render': 'الإظهار',
	'use': 'الاستعمال',
	'open': 'الفتح',
	'close': 'الإغلاق',
	'insert': 'الإدراج',
	'ignore': 'التجاهل',
	'confirm': 'التأكيد',
	'allow': 'السماح',
	'prefer': 'التفضيل',
	'detect': 'الكشف',
	'suppress': 'الكتم',
	'preserve': 'الحفظ',
	'prompt': 'المطالبة',
	'trim': 'القصّ',
	'follow': 'الاتّباع',
	'add': 'الإضافة',
	'attach': 'الإرفاق',
	'ask': 'السؤال',
	'check': 'الفحص',
	'collapse': 'الطيّ',
	'reveal': 'الكشف',
	'forward': 'التمرير',
	'fetch': 'الجلب',
	'pull': 'السحب',
	'push': 'الدفع',
	'sync': 'المزامنة',
	'split': 'التقسيم',
	'trigger': 'التشغيل',
	'copy': 'النسخ',
	'delete': 'الحذف',
	'create': 'الإنشاء',
	'guess': 'التخمين',
	'highlight': 'الإبراز',
	'reset': 'التصفير',
	'select': 'الاختيار',
})) as Map<string, string>;

/**
 * صفاتٌ لا أسماء. مفصولةٌ عن WORDS **لأنّ قاعدة الإضافة تفسد بها**: الإضافة تجعل
 * الطرفَ الأخير رأسًا مجرَّدًا، فتخرج «طيّ أسطر المتطابق» و«إظهار زخارف الفارغ» —
 * ركامٌ لا عربيّة. والوصفُ الصحيح يحتاج مطابقةً في التذكير والتأنيث والعدد، وهي صرفٌ
 * لا يبلغه معجمٌ بلا محلّل. فنمنعها من الإضافة ونقبلها مقطعًا مفردًا وحسب.
 */
const ADJECTIVES = new Map<string, string>(Object.entries({
	'visible': 'ظاهر',
	'horizontal': 'أفقيّ',
	'vertical': 'رأسيّ',
	'strict': 'صارم',
	'resizable': 'قابلٌ لتغيير الحجم',
	'important': 'مهمّ',
	'high': 'مرتفع',
	'low': 'منخفض',
	'new': 'الجديد',
	'smart': 'الذكيّ',
	'silent': 'الصامت',
	'verbose': 'المسهَب',
	'multiple': 'المتعدّد',
	'failed': 'الفاشل',
	'binary': 'الثنائيّ',
	'dirty': 'غير المحفوظ',
	'required': 'المطلوب',
	'collapsed': 'المطويّ',
	'suggested': 'المقترَح',
	'optimized': 'المحسَّن',
	'folded': 'المطويّ',
	'identical': 'المتطابق',
	'readonly': 'المقروء فقط',
	'natural': 'الطبيعيّ',
	'global': 'العامّ',
	'local': 'المحلّيّ',
	'remote': 'البعيد',
	'external': 'الخارجيّ',
	'integrated': 'المدمج',
	'double': 'المزدوج',
	'quick': 'السريع',
	'empty': 'الفارغ',
	'trailing': 'الذيليّ',
	'leading': 'البادئ',
	'surrounding': 'المحيط',
	'staged': 'المُدرَج',
	'untracked': 'غير المتتبَّع',
	'ignored': 'المتجاهَل',
	'next': 'التالي',
})) as Map<string, string>;

/**
 * وصفُ مركَّبٍ بصفة، مع مطابقةٍ في التأنيث.
 *
 * العربيّة تُطابِق الصفةَ موصوفَها في التذكير والتأنيث، فإلحاقُ صيغةٍ مذكّرةٍ دائمًا
 * يُخرِج «الاقتراحات الذكيّ» و«عائلة الخطّ الافتراضيّ» — عربيّةٌ واثقةٌ وخاطئة، وهي
 * الحالةُ التي مُنعت لأجلها ADJECTIVES من الإضافة. فالمنعُ هناك بلا مطابقةٍ هنا
 * تناقضٌ في الملفّ نفسِه، كشفته المراجعة الهندسيّة.
 *
 * لا محلّلَ صرفيّ هنا، فنستدلّ على التأنيث من صورة **رأس المركّب** (أوّلِ كلمةٍ —
 * فالرأسُ في الإضافة أوّلٌ): ما خُتم بتاءٍ مربوطة أو بجمعٍ مؤنّثٍ سالمٍ فهو مؤنّث.
 * ليست قاعدةً كاملةً — «الأسطر» جمعُ تكسيرٍ يُعامَل مذكّرًا هنا وهو الشائع في
 * الاستعمال التقنيّ — لكنّها تُصيب الغالبيّة وتُزيل أوضحَ الأخطاء.
 */
function describe(phrase: string, masculine: string, feminine: string): string {
	const head = phrase.split(' ')[0];
	const isFeminine = head.endsWith('\u0629') || head.endsWith('\u0627\u062A');
	return phrase + ' ' + (isFeminine ? feminine : masculine);
}

/**
 * صيغٌ متكرّرة. لكلٍّ منها تعبيرٌ نمطيّ بمحتجَزٍ أو محتجَزين، وبانٍ يستقبلها **معرَّبةً**.
 * إن تعذّر تعريبُ أيّ محتجَزٍ سقطت القاعدة ورجعنا إنجليزيًّا — لا نصفَ ترجمة.
 *
 * الترتيبُ حاكم: الأخصّ أوّلًا. فقواعدُ ‏`On Save`‏ و‏`On Type`‏ تسبق قاعدةَ الربط
 * العامّة ‏`X On Y`‏، وإلّا التهمتها الأخيرةُ بترجمةٍ أضعف.
 */
const RULES: ReadonlyArray<readonly [RegExp, (...parts: string[]) => string]> = [
	// ── 1. ذيولٌ مخصوصة: أقوى إشارةً من أيّ رأس، فتُجرَّب أوّلًا ──
	[/^(.+) On Save$/i, r => `${r} عند الحفظ`],
	[/^(.+) On Type$/i, r => `${r} عند الكتابة`],
	[/^(.+) On Paste$/i, r => `${r} عند اللصق`],
	[/^(.+) On Exit$/i, r => `${r} عند الخروج`],
	[/^(.+) On Scroll$/i, r => `${r} عند التمرير`],
	[/^(.+) On Focus$/i, r => `${r} عند التركيز`],
	[/^(.+) On Open$/i, r => `${r} عند الفتح`],

	// ── 2. رؤوسٌ فعليّة وكمّيّة: تحكم العبارةَ كاملةً، فتسبق ذيولَ الإضافة ──
	// عنوانٌ يبدأ بـShow/Enable/Add فعلٌ قطعًا، لا التباسَ فيه. وكذلك Max/Min/Default
	// كمٌّ على المركّب كلِّه: «Max File Size» = أقصى (حجم الملفّ) لا حجمُ (أقصى الملفّ).
	[/^Show (.+)$/i, r => `إظهار ${r}`],
	[/^Hide (.+)$/i, r => `إخفاء ${r}`],
	// Render ≠ Show: كانا يخرجان متطابقين فيميّز المستخدم.
	[/^Render (.+)$/i, r => `رسم ${r}`],
	[/^Enable (.+)$/i, r => `تفعيل ${r}`],
	[/^Disable (.+)$/i, r => `تعطيل ${r}`],
	[/^Use (.+)$/i, r => `استعمال ${r}`],
	[/^Open (.+)$/i, r => `فتح ${r}`],
	[/^Close (.+)$/i, r => `إغلاق ${r}`],
	[/^Insert (.+)$/i, r => `إدراج ${r}`],
	[/^Include (.+)$/i, r => `تضمين ${r}`],
	[/^Exclude (.+)$/i, r => `استثناء ${r}`],
	[/^Ignore (.+)$/i, r => `تجاهل ${r}`],
	[/^Confirm (.+)$/i, r => `التأكيد عند ${r}`],
	[/^Allow (.+)$/i, r => `السماح ${joinPreposition('ب', r)}`],
	[/^Prefer (.+)$/i, r => `تفضيل ${r}`],
	[/^Detect (.+)$/i, r => `كشف ${r}`],
	[/^Restore (.+)$/i, r => `استعادة ${r}`],
	[/^Suppress (.+)$/i, r => `كتم ${r}`],
	[/^Preserve (.+)$/i, r => `حفظ ${r}`],
	[/^Scroll (.+)$/i, r => `تمرير ${r}`],
	[/^Prompt (.+)$/i, r => `مطالبة ${r}`],
	[/^Trim (.+)$/i, r => `قصّ ${r}`],
	[/^Sort (.+)$/i, r => `فرز ${r}`],
	[/^Follow (.+)$/i, r => `اتّباع ${r}`],
	[/^Validate (.+)$/i, r => `التحقّق من ${r}`],
	[/^Format (.+)$/i, r => `تنسيق ${r}`],
	[/^Accept (.+)$/i, r => `قبول ${r}`],
	[/^Add (.+)$/i, r => `إضافة ${r}`],
	[/^Attach (.+)$/i, r => `إرفاق ${r}`],
	[/^Ask (.+)$/i, r => `سؤال ${r}`],
	[/^Check (.+)$/i, r => `فحص ${r}`],
	[/^Collapse (.+)$/i, r => `طيّ ${r}`],
	[/^Expand (.+)$/i, r => `توسيع ${r}`],
	[/^Reveal (.+)$/i, r => `كشف ${r}`],
	[/^Forward (.+)$/i, r => `تمرير ${r}`],
	[/^Fetch (.+)$/i, r => `جلب ${r}`],
	[/^Pull (.+)$/i, r => `سحب ${r}`],
	[/^Push (.+)$/i, r => `دفع ${r}`],
	[/^Sync (.+)$/i, r => `مزامنة ${r}`],
	[/^Split (.+)$/i, r => `تقسيم ${r}`],
	[/^Trigger (.+)$/i, r => `تشغيل ${r}`],
	[/^Navigate To (.+)$/i, r => `الانتقال إلى ${r}`],
	[/^Go To (.+)$/i, r => `الانتقال إلى ${r}`],
	[/^Copy (.+)$/i, r => `نسخ ${r}`],
	[/^Delete (.+)$/i, r => `حذف ${r}`],
	[/^Create (.+)$/i, r => `إنشاء ${r}`],
	[/^Guess (.+)$/i, r => `تخمين ${r}`],
	[/^Highlight (.+)$/i, r => `إبراز ${r}`],
	[/^Reset (.+)$/i, r => `تصفير ${r}`],
	[/^Select (.+)$/i, r => `اختيار ${r}`],
	[/^Search (.+)$/i, r => `البحث في ${r}`],
	[/^Focus (.+)$/i, r => `التركيز على ${r}`],
	[/^Closing (.+)$/i, r => `إغلاق ${r}`],
	[/^Opening (.+)$/i, r => `فتح ${r}`],
	[/^Max(?:imum)? (.+)$/i, r => `أقصى ${r}`],
	[/^Min(?:imum)? (.+)$/i, r => `أدنى ${r}`],
	[/^Default (.+)$/i, r => describe(r, 'الافتراضيّ', 'الافتراضيّة')],

	// ── 3. ذيولٌ اسميّة: إضافةٌ رأسُها الذيل («X Size» = حجم X) ──
	[/^(.+) Enabled$/i, r => `تفعيل ${r}`],
	[/^(.+) Visibility$/i, r => `ظهور ${r}`],
	[/^(.+) Size$/i, r => `حجم ${r}`],
	[/^(.+) Path$/i, r => `مسار ${r}`],
	[/^(.+) Delay$/i, r => `مهلة ${r}`],
	[/^(.+) Style$/i, r => `نمط ${r}`],
	[/^(.+) Mode$/i, r => `وضع ${r}`],
	[/^(.+) Order$/i, r => `ترتيب ${r}`],
	[/^(.+) Count$/i, r => `عدد ${r}`],
	[/^(.+) Length$/i, r => `طول ${r}`],
	[/^(.+) Height$/i, r => `ارتفاع ${r}`],
	[/^(.+) Width$/i, r => `عرض ${r}`],
	[/^(.+) Location$/i, r => `موضع ${r}`],
	[/^(.+) Options$/i, r => `خيارات ${r}`],
	[/^(.+) Command$/i, r => `أمر ${r}`],
	[/^(.+) Behavior$/i, r => `سلوك ${r}`],
	[/^(.+) Behaviour$/i, r => `سلوك ${r}`],
	[/^(.+) Limit$/i, r => `حدّ ${r}`],
	[/^(.+) Position$/i, r => `موضع ${r}`],
	[/^(.+) Sizing$/i, r => `تحجيم ${r}`],
	[/^(.+) Detection$/i, r => `كشف ${r}`],
	[/^(.+) Validation$/i, r => `التحقّق من ${r}`],
	[/^(.+) Separator$/i, r => `فاصل ${r}`],
	[/^(.+) Support$/i, r => `دعم ${r}`],
	[/^(.+) Protection$/i, r => `حماية ${r}`],
	[/^(.+) Prefix$/i, r => `بادئة ${r}`],
	[/^(.+) Group$/i, r => `مجموعة ${r}`],
	[/^(.+) Section$/i, r => `قسم ${r}`],
	[/^(.+) Kind$/i, r => `نوع ${r}`],
	// أسماءُ المفعول: نمطُ إشارات إمكانيّة الوصول كلِّه («Task Failed»، «Chat Request Sent»).
	// نحوّلها إلى مصدرٍ مضافٍ لأنّ العربيّة لا تصف الحدثَ بصفةٍ مفردةٍ هنا.
	[/^(.+) Completed$/i, r => `اكتمال ${r}`],
	[/^(.+) Failed$/i, r => `إخفاق ${r}`],
	[/^(.+) Succeeded$/i, r => `نجاح ${r}`],
	[/^(.+) Started$/i, r => `بدء ${r}`],
	[/^(.+) Stopped$/i, r => `توقّف ${r}`],
	[/^(.+) Sent$/i, r => `إرسال ${r}`],
	[/^(.+) Received$/i, r => `استقبال ${r}`],
	[/^(.+) Applied$/i, r => `تطبيق ${r}`],
	[/^(.+) Triggered$/i, r => `تشغيل ${r}`],
	[/^(.+) Inserted$/i, r => `إدراج ${r}`],
	[/^(.+) Deleted$/i, r => `حذف ${r}`],
	[/^(.+) Modified$/i, r => `تعديل ${r}`],
	[/^(.+) Kept$/i, r => `إبقاء ${r}`],
	[/^(.+) Undone$/i, r => `التراجع عن ${r}`],
	[/^(.+) Removal$/i, r => `إزالة ${r}`],
	[/^(.+) Retry$/i, r => `إعادة محاولة ${r}`],
	[/^(.+) Announcements$/i, r => `إعلانات ${r}`],
	[/^(.+) Changes$/i, r => `تغييرات ${r}`],
	[/^(.+) Requests$/i, r => `طلبات ${r}`],
	[/^(.+) Suggestions$/i, r => `اقتراحات ${r}`],
	[/^(.+) Members$/i, r => `أعضاء ${r}`],
	[/^(.+) Parameters$/i, r => `معاملات ${r}`],

	// ── 4. صفاتٌ متقدّمة: تصف المركّبَ بعد بنائه، فتأتي بعد ذيوله ──
	// «Auto Accept Delay» ⇐ ذيلُ Delay أوّلًا ثمّ Auto صفةً: «مهلة القبول التلقائيّ».
	// لو سبقت Auto لخرج «قبول المهلة تلقائيًّا» — عربيّةٌ واثقةٌ وخاطئة، وهي أسوأ
	// من الإنجليزيّة لأنّ القارئ لا يملك ما يكشف بها الخطأ.
	[/^Auto (.+)$/i, r => describe(r, 'التلقائيّ', 'التلقائيّة')],
	[/^Smart (.+)$/i, r => describe(r, 'الذكيّ', 'الذكيّة')],
	[/^Custom (.+)$/i, r => describe(r, 'المخصّص', 'المخصّصة')],
	[/^Native (.+)$/i, r => describe(r, 'الأصليّ', 'الأصليّة')],
	[/^Inline (.+)$/i, r => describe(r, 'السطريّ', 'السطريّة')],
	[/^Silent (.+)$/i, r => describe(r, 'الصامت', 'الصامتة')],
	[/^Verbose (.+)$/i, r => describe(r, 'المسهَب', 'المسهَبة')],
	[/^Multiple (.+)$/i, r => describe(r, 'المتعدّد', 'المتعدّدة')],
	[/^Alternative (.+)$/i, r => describe(r, 'البديل', 'البديلة')],
	[/^Experimental (.+)$/i, r => describe(r, 'التجريبيّ', 'التجريبيّة')],
	[/^Always (.+)$/i, r => `${r} دائمًا`],

	// ── 5. حروفُ الربط: محتجَزان، وكلاهما يجب أن يُحَلّ. الأعمُّ فالأخيرُ رتبةً ──
	[/^(.+) Has (.+)$/i, (a, b) => `${a} فيه ${b}`],
	[/^(.+) On (.+)$/i, (a, b) => `${a} عند ${b}`],
	[/^(.+) In (.+)$/i, (a, b) => `${a} في ${b}`],
	[/^(.+) And (.+)$/i, (a, b) => `${a} و${b}`],
	[/^(.+) Before (.+)$/i, (a, b) => `${a} قبل ${b}`],
	[/^(.+) After (.+)$/i, (a, b) => `${a} بعد ${b}`],
	[/^(.+) For (.+)$/i, (a, b) => `${a} ${joinPreposition('ل', b)}`],
	[/^(.+) With (.+)$/i, (a, b) => `${a} مع ${b}`],
	[/^(.+) By (.+)$/i, (a, b) => `${a} حسب ${b}`],
	[/^(.+) From (.+)$/i, (a, b) => `${a} من ${b}`],
	[/^(.+) To (.+)$/i, (a, b) => `${a} إلى ${b}`],
];

/** يحلّ مقطعًا كاملًا أو يُرجِع null. لا يُخرِج تركيبًا نصفَ عربيّ أبدًا. */
function resolveSegment(segment: string, depth: number): string | null {
	const trimmed = segment.trim();
	if (!trimmed) {
		return null;
	}

	const phrase = PHRASES.get(trimmed.toLowerCase());
	if (phrase !== undefined) {
		return phrase;
	}

	const word = WORDS.get(trimmed.toLowerCase());
	if (word !== undefined) {
		return word;
	}

	// الصفةُ تصلح عنوانًا قائمًا بذاته («Visible» ⇐ «ظاهر»)، ولا تصلح **جزءًا في تركيب**:
	// وصفُ الاسم في العربيّة يلزمه مطابقةٌ في التذكير والتأنيث والعدد، ولا محلّلَ صرفيّ
	// هنا. فحصرُها في العمق صفرٍ يمنع «أقصى اقتراحات ظاهر» ويُبقي الإنجليزيّةَ مكانها.
	if (depth === 0) {
		const adjective = ADJECTIVES.get(trimmed.toLowerCase());
		if (adjective !== undefined) {
			return adjective;
		}
	}

	// عمقٌ محدود: القواعد تعاوديّة وبعضُها يقشّر من الطرفين، فالحدُّ يمنع أيّ تسلسلٍ مَرَضيّ.
	// ستّةٌ تكفي أطولَ عنوانٍ في المنبع (عشرُ كلمات) بعد قشرِ رأسٍ وذيلٍ وحرفِ ربط.
	if (depth >= 6) {
		return null;
	}

	for (const [pattern, build] of RULES) {
		const match = pattern.exec(trimmed);
		if (!match) {
			continue;
		}
		const parts: string[] = [];
		for (let i = 1; i < match.length; i++) {
			const part = resolveSegment(match[i], depth + 1);
			if (part === null) {
				parts.length = 0;
				break;
			}
			parts.push(part);
		}
		// طولٌ مطابق ⇐ كلُّ محتجَزٍ حُلَّ. أيُّ إخفاقٍ يُفرِغ المصفوفة فتسقط القاعدة.
		if (parts.length === match.length - 1) {
			return build(...parts);
		}
	}

	return idafa(trimmed, depth);
}

/**
 * الإضافة: «Terminal Bell» ⇒ «جرس الطرفيّة». الرأسُ في العربيّة **أوّلٌ ومجرَّدٌ من أل**،
 * والمضافُ إليه ثانٍ ومعرَّف — عكسُ ترتيب الإنجليزيّة تمامًا.
 *
 * محروسةٌ عمدًا بشرطين، وهي آخرُ محاولةٍ لا أُولاها:
 *   • كلتا القطعتين تُحَلّ إلى **كلمةٍ عربيّةٍ واحدةٍ معرَّفةٍ بأل**. لو كانت إحداهما
 *     مركّبةً («نقطة التوقّف») لخرج «نقطة التوقّف السطر» — ركامٌ لا إضافة.
 *   • القَسمُ عند آخر مسافةٍ فقط: الرأسُ آخرُ كلمةٍ إنجليزيّة، وما قبله وصفٌ لها.
 *
 * فما لم يستوفِ الشرطين يبقى إنجليزيًّا — وهو الالتزامُ نفسُه: لا نصفَ ترجمة.
 */
function idafa(segment: string, depth: number): string | null {
	const cut = segment.lastIndexOf(' ');
	if (cut <= 0 || depth >= 5) {
		return null;
	}

	// صفةٌ في أيّ طرف ⇒ ليست إضافةً أصلًا. الوصفُ الصحيح يحتاج مطابقةً صرفيّة في
	// التذكير والتأنيث والعدد، ولا محلّلَ صرفيّ هنا — فالإنجليزيّةُ أصدقُ من «زخارف الفارغ».
	if (ADJECTIVES.has(segment.slice(0, cut).toLowerCase())
		|| ADJECTIVES.has(segment.slice(cut + 1).toLowerCase())) {
		return null;
	}

	const modifier = resolveSegment(segment.slice(0, cut), depth + 1);
	const head = resolveSegment(segment.slice(cut + 1), depth + 1);
	if (modifier === null || head === null) {
		return null;
	}

	// ‏`ال` = «ال» بالهروب الصريح لا بالحرف. **إلزاميّ**: esbuild يهرّب
	// السلاسلَ تلقائيًّا ولا يهرّب التعابيرَ النمطيّة، وبناءُ المنبع يرفض أيّ محرفٍ
	// غيرِ ASCII في المخرَج المصغَّر (‏build/lib/optimize.ts) فيسقط البناءُ كلُّه.
	// وقع هذا فعلًا: 'Found non-ascii character ال in the minified output'.
	const definiteSingleWord = /^\u0627\u0644\S+$/;
	if (!definiteSingleWord.test(modifier) || !definiteSingleWord.test(head)) {
		return null;
	}

	return head.slice(2) + ' ' + modifier;
}

/**
 * يعرّب نصَّ عنوانِ إعدادٍ (فئةً كان أم تسمية). ما تعذّر تعريبُه يعود كما هو.
 *
 * @param text مخرَج `wordifyKey` — قد يكون مسارًا بفواصل ‏'‏›‏'‏.
 */
export function arabizeSettingText(text: string): string {
	if (!text) {
		return text;
	}

	return text.split(SEPARATOR).map(segment => {
		// إعداداتُ وسم اللغة تُسبَق بأيقونة ‎'$(bracket) '‎؛ نُبقيها ونعرّب ما بعدها فقط.
		const icon = /^(\$\([^)]*\)\s*)([\s\S]*)$/.exec(segment);
		if (icon) {
			return icon[1] + (resolveSegment(icon[2], 0) ?? icon[2]);
		}
		return resolveSegment(segment, 0) ?? segment;
	}).join(SEPARATOR);
}

/**
 * صورةُ العنوان المعرَّب الصالحة للبحث.
 *
 * بحثُ الإعدادات في المنبع يطابق `setting.key` والوصفَ و`keywords` — **ولا يطابق
 * العنوانَ المعروض أصلًا**. فبلا هذه الدالّة يقرأ المستخدم «التنسيق عند الحفظ»،
 * يكتبها في مربّع البحث، فلا يجد شيئًا: نصٌّ معروضٌ لا سبيلَ إلى الوصول إليه.
 * (رصدته مراجعةُ تجربة الاستعمال، وهو أخطرُ عيبٍ وظيفيٍّ في الرقعة.)
 *
 * التجريدُ من التشكيل لازم: نكتب «المحرّر» بالشدّة ويكتب المستخدم «المحرر» بدونها،
 * فلولا التجريد لسقطت المطابقةُ على فرقٍ لا يراه أحد.
 */
export function searchableSettingText(key: string): string {
	// نطاقُ علامات التشكيل العربيّة (‏U+064B…U+0652) والتطويل (‏U+0640).
	// بالهروب الصريح لا بالحرف: بناءُ المنبع يرفض غيرَ ASCII في المخرَج المصغَّر.
	return arabizeSettingText(key).replace(/[\u064B-\u0652\u0640]/g, '');
}

/**
 * مفتاحٌ خامّ ⇐ نصٌّ عربيٌّ صالحٌ للبحث. (‏`editor.formatOnSave` ⇐ «التنسيق عند الحفظ»)
 *
 * يكرّر تحويلَ `wordifyKey` عمدًا لا سهوًا: تلك الدالّة تعيش في طبقة `contrib`،
 * واستيرادُها من `services` يخرق ترتيبَ طبقات المنبع. والتكرارُ هنا آمنٌ لأنّ أثرَ أيّ
 * انجرافٍ محصورٌ في **جودة البحث** لا في صحّة العرض — والعرضُ يمرّ بـ`wordifyKey`
 * الحقيقيّة وحدها.
 *
 * ونُسقِط عمدًا خطوتَي `knownAcronyms` و`knownTermMappings`: كلتاهما تضبط صورةَ
 * الكلمة الإنجليزيّة، ونحن نستبدل بها العربيّةَ فورًا فلا أثرَ لهما.
 */
export function searchableSettingKey(rawKey: string): string {
	const wordified = rawKey
		.replace(/\.([a-z0-9])/g, (_m, c: string) => SEPARATOR + c.toUpperCase())
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.replace(/([A-Z]{1,})([A-Z][a-z])/g, '$1 $2')
		.replace(/^[a-z]/, m => m.toUpperCase());
	return searchableSettingText(wordified);
}
