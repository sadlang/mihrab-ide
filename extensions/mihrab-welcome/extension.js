// @ts-check
"use strict";
// امتداد ترحيب محراب (الطبقة 1) — أمرا الإعداد الأوّل:
//   • mihrab.newSadProject — ينشئ مجلّد مشروع ص بقالب حيّ مشروح بالعربية (الفكرة أ-٢).
//   • mihrab.runSadFile     — يشغّل ملفّ ص الحاليّ عبر أدوات ص (sad-run) في لوحة مخرجات عربيّة (bidi صحيح، spawn بلا صدفة). [AR-01]
// كلّ نصّ ظاهر للمستخدم ثابت مسمّى في COPY (نسخة عربيّة-أوّلًا = بيانات واجهة، استثناء
// مقبول لقاعدة منع السلاسل الحرفيّة، متّسق مع قرار جملة الترحيب في patch_welcome_rtl.py).

const vscode = require("vscode");
const path = require("path");
const { SadDiagnostics } = require("./diagnostics.js");
const { SadOutputPanel, ACTION_RUN, ACTION_BUILD } = require("./output-panel.js");
const { resolveBundledTool, probeTool } = require("./tool-resolve.js");
const unicodeGuard = require("./unicode-guard.js");

// اسم أداتَي تشغيل/بناء ص (مصدر حقيقة واحد داخل هذا الامتداد). sad-run يفسّر ويشغّل مباشرةً؛
// sad-build يترجم إلى تنفيذيّ فقط (لا يشغّل) — «ابنِ» [SAD-04].
const SAD_RUN = "sad-run";
const SAD_BUILD = "sad-build";
// وسيط مخرَج الترجمة في sad-build: «sad-build <ملفّ> -o <مخرَج>» (راجع tools/build).
const BUILD_OUT_FLAG = "-o";
// معرّف الجولة المحلّيّ (id في contributes.walkthroughs)؛ المعرّف الكامل يُشتَقّ وقت
// التشغيل من context.extension.id (publisher.name) كي لا ينكسر لو تغيّرت الهوية. [M4]
const WALKTHROUGH_LOCAL_ID = "mihrab.gettingStarted";
const WALKTHROUGH_ID_SEP = "#";
// مفتاح حالة عامّة: هل عُرِضت جولة الترحيب مرّة على هذا الملفّ الشخصيّ؟ (تُفتح مرّة واحدة).
const WELCOME_SHOWN_KEY = "mihrab.welcome.shown";
// معرّف لغة ص (يطابق contributes.languages في sad-lang) وامتدادها (حرف الصاد).
const SAD_LANG_ID = "sad";
const SAD_EXT = ".ص";
// كلمتا «دالة رئيسية» المفتاحيّتان (تعكسان KEYWORD_FUNCTION/KEYWORD_MAIN في language-truth؛ النحو
// والمقتطفات مرآتها المولَّدة). تُستعملان لكشف نقطة الدخول وعرض عدسات الكود فوقها. [SAD-04]
const SAD_KW_FUNCTION = "دالة";
const SAD_KW_MAIN = "رئيسية";
// نمط سطر تصريح الدالّة الرئيسيّة «دالة [نوع] رئيسية(» — نوع الإرجاع اختياريّ قبل الاسم (grammar).
const MAIN_FN_RE = new RegExp("(?:^|\\s)" + SAD_KW_FUNCTION + "\\s+(?:\\S+\\s+)?" + SAD_KW_MAIN + "\\s*\\(");
// اسم المشروع الافتراضيّ واسم الملفّ الرئيس والمجلّدات.
const DEFAULT_PROJECT_NAME = "مشروع-ص";
const MAIN_FILE = "مرحبا" + SAD_EXT;
const README_FILE = "اقرأني.md";
const VSCODE_DIR = ".vscode";
const TASKS_FILE = "tasks.json";
const RUN_TASK_LABEL = "تشغيل برنامج ص";
const DOCS_URL = "https://github.com/sadlang/s-programming-language";
// معرّفا أمرَي هذا الامتداد (مصدر حقيقة واحد؛ يطابقان contributes.commands في package.json).
const NEW_PROJECT_CMD = "mihrab.newSadProject";
const RUN_FILE_CMD = "mihrab.runSadFile";
// أمر فحص ملفّ ص الحاليّ يدويًّا (يكمّل الفحص التلقائيّ عند الحفظ). [SAD-02]
const CHECK_FILE_CMD = "mihrab.checkSadFile";
// أمر بناء (ترجمة) ملفّ ص الحاليّ عبر sad-build. [SAD-04]
const BUILD_FILE_CMD = "mihrab.buildSadFile";
// مخرجُ التعافي من إعدادٍ عامٍّ يُبطِل افتراضاتِ إبراز يونيكود. [AR-04]
const RESET_UNICODE_CMD = "mihrab.resetUnicodeHighlight";
// أوامر النواة المدمجة المُستدعاة (لا سلاسل حرفيّة موضعيّة — أسوة بـOPEN_WALKTHROUGH_CMD).
const OPEN_FOLDER_CMD = "vscode.openFolder";
const OPEN_CMD = "vscode.open";
// معرّف الامتداد الاحتياطيّ إن غابت هوية التشغيل (publisher.name — يطابق package.json).
const DEFAULT_EXTENSION_ID = "sadlang.mihrab-welcome";
// حدّ نتائج البحث عن ملفّات ص في مساحة العمل (أداء على مساحة كبيرة) + استبعاد التبعيّات.
const SAD_SEARCH_MAX = 50;
const NODE_MODULES_GLOB = "**/node_modules/**";

// نصوص الواجهة (عربيّة-أوّلًا).
const COPY = {
  pickParentTitle: "اختر المجلّد الذي سيُنشأ فيه مشروع ص",
  pickParentButton: "أنشئ هنا",
  namePrompt: "اسم مشروع ص الجديد",
  namePlaceholder: DEFAULT_PROJECT_NAME,
  nameEmpty: "الرجاء إدخال اسم للمشروع.",
  nameInvalidChars: "الاسم يحتوي محارف غير صالحة لاسم مجلّد (مثل \\ / : * ? \" < > | أو محارف تحكّم).",
  nameDotNames: "الاسم «.» أو «..» غير صالح لمجلّد مشروع.",
  nameTrailingDotSpace: "لا يصحّ أن ينتهي الاسم بنقطة أو مسافة (يُسبِّب مشكلات على ويندوز).",
  nameReserved: "هذا اسم محجوز في ويندوز (مثل CON أو PRN أو COM1) — اختر اسمًا آخر.",
  nameTooLong: "الاسم طويل جدًّا (أقصى 255 محرفًا).",
  existsDirPrompt: (n) => `يوجد مجلّد باسم «${n}» في هذا الموضع — ماذا تريد؟`,
  existsFilePrompt: (n) => `يوجد ملفّ (لا مجلّد) باسم «${n}» في هذا الموضع — ماذا تريد؟`,
  existsOverwrite: "الكتابة فوق الملفّات الأساسيّة",
  existsNewCopy: "إنشاء نسخة باسم آخر",
  createdInfo: (n) => `أُنشئ مشروع «${n}». بالتوفيق في أوّل برنامج!`,
  openFolder: "افتح المجلّد",
  createFailed: (e) => `تعذّر إنشاء المشروع: ${e}`,
  noEditor: "لا يوجد محرّر نشط — افتح ملفّ ص أوّلًا كي تشغّله.",
  sadFileAmbiguous: `وُجدت عدّة ملفّات ص — افتح الملفّ الذي تريد تشغيله أوّلًا (لا يوجد ‹${MAIN_FILE}› لأختاره تلقائيًّا).`,
  notSadFile: `الملفّ الحاليّ ليس ملفّ ص (‹${SAD_EXT}›).`,
  notOnDisk: "احفظ الملفّ على القرص أوّلًا كي يمكن تشغيله.",
  saveCancelled: "أُلغي الحفظ — لم يُشغَّل الملفّ.",
  toolMissingTitle: `لم يُعثَر على أداة تشغيل ص (‹${SAD_RUN}›) في مسار النظام.`,
  buildToolMissingTitle: `لم يُعثَر على أداة بناء ص (‹${SAD_BUILD}›) في مسار النظام.`,
  toolMissingHint: "ثبّت أدوات ص وأضِفها إلى PATH ثمّ أعِد المحاولة.",
  toolMissingLearn: "كيف أثبّت أدوات ص؟",
  // عناوين عدسات الكود (CodeLens) فوق دالّة رئيسية [SAD-04].
  lensRun: "▶ شغّل",
  lensBuild: "🔨 ابنِ",
};

// قالب البرنامج الحيّ: برنامج ص صغير يعمل فورًا، مشروح بالعربية سطرًا سطرًا.
const TEMPLATE_MAIN =
  "# 👋 أهلًا بك في محراب! هذا أوّل برنامج لك بلغة ص.\n" +
  "# كلّ سطر يبدأ بعلامة # هو تعليق (شرح) لا يُنفِّذه الحاسوب.\n" +
  "\n" +
  "اطبع(\"مرحبا يا عالم\")\n" +
  "\n" +
  "# جرّب الآن: غيّر النصّ بين علامتَي الاقتباس ثمّ شغّل البرنامج من جديد\n" +
  "# (من الجولة، أو بأمر «محراب: شغّل ملفّ ص الحاليّ»).\n";

/**
 * يبني نصّ اقرأني بعنوان يطابق اسم المشروع الفعليّ (لا الاسم الافتراضيّ). ملاحظة المهمّة تتبع
 * حالة المُشغّل: محلول لمسار مطلق (runnerReady=صحيح، مدمجًا أو من PATH) ⇒ تعمل مباشرةً؛
 * وإلا اسم مجرّد ⇒ تتطلّب توفّره على PATH.
 */
function buildReadme(projectName, runnerReady) {
  // ملاحظة المهمّة تُشغَّل في الطرفيّة (xterm لا يدعم bidi فقد لا تُعرَض العربيّة باتّجاهها الصحيح)؛
  // لذا نقدّم أمر التشغيل (لوحة ص العربيّة) أوّلًا كالمسار الموصى به، والمهمّة بديلٌ طرفيّ صريح. [تدقيق #1]
  const taskNote = runnerReady
    ? "- أو المهمّة **«" + RUN_TASK_LABEL + "»** — تُشغَّل في الطرفيّة (قد لا تُعرَض العربيّة باتّجاهها الصحيح).\n"
    : "- أو المهمّة **«" + RUN_TASK_LABEL + "»** — تُشغَّل في الطرفيّة، وتتطلّب تثبيت أدوات ص ‹" + SAD_RUN + "› على PATH.\n";
  return (
    "# " + projectName + "\n\n" +
    "أوّل مشروع لك بلغة ص داخل محراب.\n\n" +
    "## التشغيل\n\n" +
    "- افتح ‹" + MAIN_FILE + "› ثمّ نفّذ أمر **«محراب: شغّل ملفّ ص الحاليّ»** — تظهر المخرجات في لوحة ص العربيّة (باتّجاهها الصحيح).\n" +
    taskNote
  );
}

// مهمّة تشغيل قياسيّة (آليّة VSCode). الأمر = المُشغّل المحلول (runCommand): الثنائيّ المدمج
// بمساره المطلق حين يُشحَن (تعمل المهمّة فورًا كزرّ التشغيل، بلا تثبيت)، وإلا اسم PATH المجرّد
// (منقول بين الأجهزة). يُبنى وقت الإنشاء بالقيمة نفسها التي يستعملها الأمر كي لا يتباعد
// مسارا التشغيل (الأمر مقابل المهمّة) — كان التباعد يُفشِل المهمّة رغم توفّر المدمج.
// مقايضة مقبولة لهدف P0: المسار المطلق المخبوز يبيت إن نُقل المشروع لجهاز آخر أو تغيّر مسار
// تثبيت محراب؛ لكنّ جولة المبتدئ على جهازه تعمل فورًا — وهو الأهمّ هنا.
function buildTasksJson(runCommand) {
  return {
    version: "2.0.0",
    tasks: [
      {
        label: RUN_TASK_LABEL,
        type: "process",
        command: runCommand,
        args: ["${file}"],
        // ليست مهمّة البناء الافتراضيّة (لا group): كي لا يشغّلها Ctrl+Shift+B تلقائيًّا في الطرفيّة
        // (تشوّه العربيّة). المسار الموصى به للعربيّة الصحيحة = أمر «شغّل ملفّ ص» ⇒ لوحة ص. [تدقيق #1]
        problemMatcher: [],
      },
    ],
  };
}

const enc = new TextEncoder();

// محارف ممنوعة في أسماء المجلّدات: رموز نظام الملفّات + محارف تحكّم C0/DEL/C1 +
// محارف التحكّم ثنائيّة الاتّجاه (LRM/RLM، تضمين/تجاوز/عزل الاتّجاه) — الأخيرة تُنتج
// اسمًا مخادعًا بصريًّا (spoofing) في سياق RTL فتُرفَض صراحةً.
// (نقاط الرموز بترميز \u صريح — لا محرف غير مرئيّ في الكود نفسه.)
const INVALID_NAME_RE = /[\\/:*?"<>|\x00-\x1f\x7f-\x9f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
// أقصى طول لاسم مدخل في معظم أنظمة الملفّات (بايت/محرف).
const MAX_NAME_LEN = 255;
// أسماء محجوزة على ويندوز (بلا/مع امتداد) — تُقارَن دون حساسية حالة.
const RESERVED_NAMES = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

/** يتحقّق من صلاحيّة اسم المجلّد؛ يُرجع رسالة خطأ أو null. */
function validateProjectName(v) {
  const t = (v || "").trim();
  if (!t) return COPY.nameEmpty;
  if (t.length > MAX_NAME_LEN) return COPY.nameTooLong;
  if (t === "." || t === "..") return COPY.nameDotNames;
  if (INVALID_NAME_RE.test(t)) return COPY.nameInvalidChars;
  if (/[. ]$/.test(t)) return COPY.nameTrailingDotSpace;
  const stem = t.split(".")[0].toLowerCase();
  if (RESERVED_NAMES.has(stem)) return COPY.nameReserved;
  return null;
}

/** يكتب ملفًّا نصّيًّا عبر workspace.fs (يدعم البعيد أيضًا). */
async function writeText(uri, text) {
  await vscode.workspace.fs.writeFile(uri, enc.encode(text));
}

/** يُرجع نوع الملفّ عند المسار (vscode.FileType) أو null إن لم يوجد. */
async function statType(uri) {
  try {
    const s = await vscode.workspace.fs.stat(uri);
    return s.type;
  } catch {
    return null;
  }
}

/** يختار مجلّدًا فريدًا: name، ثمّ name-2، name-3… لتفادي الدوس. */
async function uniqueChild(parentUri, name) {
  let candidate = vscode.Uri.joinPath(parentUri, name);
  let i = 2;
  while ((await statType(candidate)) !== null) {
    candidate = vscode.Uri.joinPath(parentUri, `${name}-${i}`);
    i += 1;
  }
  return candidate;
}

/** أمر: مشروع ص جديد بقالب حيّ. */
async function newSadProject() {
  // (١) موضع الإنشاء: نطلبه دائمًا من المستخدم (الافتراضيّ = أوّل مجلّد عمل إن وُجد).
  const folders = vscode.workspace.workspaceFolders;
  const picked = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    canSelectMany: false,
    openLabel: COPY.pickParentButton,
    title: COPY.pickParentTitle,
    defaultUri: folders && folders.length ? folders[0].uri : undefined,
  });
  if (!picked || !picked.length) return; // ألغى المستخدم
  const parentUri = picked[0];

  // (٢) اسم المشروع، مع تحقّق صارم من المحارف والأسماء المحجوزة.
  const name = await vscode.window.showInputBox({
    prompt: COPY.namePrompt,
    placeHolder: COPY.namePlaceholder,
    value: DEFAULT_PROJECT_NAME,
    validateInput: validateProjectName,
  });
  if (name === undefined) return; // ألغى المستخدم
  const projectName = name.trim();

  // (٣) الحالة الحديّة (أ-٢): مسار بالاسم نفسه موجود ⇒ لا تَدُس؛ اسأل بلطف (مع تمييز
  //     المجلّد من الملفّ كي لا نَعِد باستبدال يفشل على مسار ملفّ).
  let targetUri = vscode.Uri.joinPath(parentUri, projectName);
  const existing = await statType(targetUri);
  if (existing !== null) {
    const isDir = (existing & vscode.FileType.Directory) !== 0;
    const prompt = isDir ? COPY.existsDirPrompt(projectName) : COPY.existsFilePrompt(projectName);
    // على ملفّ قائم: الاستبدال داخله متعذّر ⇒ نعرض «نسخة باسم آخر» فقط.
    const options = isDir ? [COPY.existsOverwrite, COPY.existsNewCopy] : [COPY.existsNewCopy];
    const choice = await vscode.window.showWarningMessage(prompt, { modal: true }, ...options);
    if (choice === COPY.existsNewCopy) {
      targetUri = await uniqueChild(parentUri, projectName);
    } else if (choice !== COPY.existsOverwrite) {
      return; // إلغاء أو إغلاق الحوار
    }
    // الكتابة فوق: نكتب الملفّات الأساسيّة داخل المجلّد نفسه (لا نحذف ما عداها).
  }

  try {
    // (٤) أنشئ المجلّد والملفّات.
    await vscode.workspace.fs.createDirectory(targetUri);
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(targetUri, VSCODE_DIR));
    const mainUri = vscode.Uri.joinPath(targetUri, MAIN_FILE);
    await writeText(mainUri, TEMPLATE_MAIN);
    // مسار مطلق للمُشغّل ⇒ محلول (مدمج أو من PATH؛ تعمل المهمّة فورًا)؛ اسم مجرّد ⇒ يتطلّب PATH.
    const runnerReady = path.isAbsolute(sadRunCmd);
    await writeText(vscode.Uri.joinPath(targetUri, README_FILE), buildReadme(projectName, runnerReady));
    await writeText(
      vscode.Uri.joinPath(targetUri, VSCODE_DIR, TASKS_FILE),
      JSON.stringify(buildTasksJson(sadRunCmd), null, 2) + "\n"
    );

    // (٥) افتح الملفّ الرئيس، واعرض دعوة لفتح المجلّد كمساحة عمل.
    const doc = await vscode.workspace.openTextDocument(mainUri);
    await vscode.window.showTextDocument(doc, { preview: false });
    const action = await vscode.window.showInformationMessage(COPY.createdInfo(projectName), COPY.openFolder);
    if (action === COPY.openFolder) {
      await vscode.commands.executeCommand(OPEN_FOLDER_CMD, targetUri, { forceNewWindow: false });
    }
  } catch (err) {
    vscode.window.showErrorMessage(COPY.createFailed(String(err && err.message ? err.message : err)));
  }
}

// أمرا التشغيل/البناء المحلولان: يُضبَطان عند التنشيط إلى الثنائيّ المدمج (إن وُجِد) وإلا اسم PATH.
let sadRunCmd = SAD_RUN;
let sadBuildCmd = SAD_BUILD;

// لوحة المخرجات العربيّة [AR-01]: تُنشأ عند التنشيط وتُبثّ إليها مخرجات sad-run بـbidi صحيح.
/** @type {import("./output-panel.js").SadOutputPanel} */
let sadOutput;

// اسم ثنائيّ ص المدمج حسب المنصّة (البناء ويندوزيّ ويحزم .exe؛ نطابقه هنا). [L1]
const SAD_RUN_EXE = process.platform === "win32" ? SAD_RUN + ".exe" : SAD_RUN;
const SAD_BUILD_EXE = process.platform === "win32" ? SAD_BUILD + ".exe" : SAD_BUILD;

// حلّ المسار (المدمج ثمّ PATH) وفحص التوفّر مشتركان في tool-resolve.js مع جسر التشخيص (sad-check)
// كي لا يتباعد سلوك أدوات ص المتطابقة الدور. هنا أغلفة رفيعة تحقن اسم الأداة وترقّي المتغيّر. [تدقيق #2]
/** يحلّ sad-run/sad-build المدمج ثمّ PATH (ثوابت مسمّاة، يحرسها L0). */
function resolveSadRun(context) {
  return resolveBundledTool(context, SAD_RUN_EXE, SAD_RUN);
}
function resolveSadBuild(context) {
  return resolveBundledTool(context, SAD_BUILD_EXE, SAD_BUILD);
}

/** يتحقّق توفّر sad-run ويرقّي sadRunCmd إلى المسار المحلول عند النجاح. */
async function isSadRunAvailable() {
  const resolved = await probeTool(sadRunCmd);
  if (resolved) sadRunCmd = resolved;
  return !!resolved;
}
/** يتحقّق توفّر sad-build ويرقّي sadBuildCmd إلى المسار المحلول عند النجاح. */
async function isSadBuildAvailable() {
  const resolved = await probeTool(sadBuildCmd);
  if (resolved) sadBuildCmd = resolved;
  return !!resolved;
}

/** يتحقّق أنّ المستند ملفّ ص حقيقيّ على القرص؛ يُرجع رسالة خطأ مناسبة أو null (صالح). */
function sadDocError(doc) {
  // كشف اللغة بالمعرّف (أدقّ من الامتداد)، مع الامتداد احتياطًا.
  if (doc.languageId !== SAD_LANG_ID && !doc.fileName.endsWith(SAD_EXT)) return COPY.notSadFile;
  // يجب أن يكون ملفًّا حقيقيًّا على القرص (لا untitled ولا مخطّط بعيد/افتراضيّ).
  if (doc.isUntitled || doc.uri.scheme !== "file") return COPY.notOnDisk;
  return null;
}

/**
 * يبحث في مساحة العمل عن ملفّ ص لتشغيله حين لا محرّر ص نشط (مثلًا لوحة الجولة/الترحيب مركَّزة).
 * مرحلتان: (١) بحث مستهدف عن الملفّ الرئيس (مرحبا.ص) — لا يفوته حدّ النتائج في مساحة كبيرة؛
 * (٢) وإلا كلّ ملفّات ص: الوحيد ⇒ شغّله، التعدّد ⇒ التباس (لا نخمّن). يُرجع {uri} أو
 * {ambiguous:true} (تعدّد بلا رئيس) أو null (لا ملفّ ص). يتجاهل node_modules ويحدّ العدد.
 */
async function findWorkspaceSadFile() {
  const mains = await vscode.workspace.findFiles("**/" + MAIN_FILE, NODE_MODULES_GLOB, 1);
  if (mains.length) return { uri: mains[0] };
  const uris = await vscode.workspace.findFiles("**/*" + SAD_EXT, NODE_MODULES_GLOB, SAD_SEARCH_MAX);
  if (uris.length === 1) return { uri: uris[0] };
  if (uris.length > 1) return { ambiguous: true };
  return null;
}

/**
 * يحلّ مستند ص للتشغيل. المحرّر النشط إن كان ملفّ ص (السلوك الصارم يبقى لمحرّر غير-ص نشط).
 * وإلا — لا محرّر نصّ نشط، وهو حال زرّ التشغيل داخل لوحة الجولة (تحتلّ المحرّر فلا نصّ نشط):
 * يجرّب محرّرًا ظاهرًا بجانبها ثمّ ملفّ مساحة العمل الرئيس ويفتحه بجانب الجولة. {doc} أو {error}.
 */
async function resolveSadDoc() {
  const active = vscode.window.activeTextEditor;
  if (active) {
    const err = sadDocError(active.document);
    return err ? { error: err } : { doc: active.document };
  }
  // ملفّ ص ظاهر في مجموعة أخرى (مفتوح بجانب الجولة) ⇒ شغّله دون فتح جديد.
  const visibleSad = vscode.window.visibleTextEditors.find((e) => sadDocError(e.document) === null);
  if (visibleSad) return { doc: visibleSad.document };
  // وإلا: ملفّ ص في مساحة العمل (مرحبا.ص أو الوحيد) — افتحه بجانب الجولة ثمّ شغّله.
  const found = await findWorkspaceSadFile();
  if (!found) return { error: COPY.noEditor }; // لا ملفّ ص إطلاقًا
  if (found.ambiguous) return { error: COPY.sadFileAmbiguous }; // تعدّد بلا رئيس ⇒ رسالة صادقة
  const doc = await vscode.workspace.openTextDocument(found.uri);
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });
  return { doc };
}

/**
 * يحلّ مستند ص من وسيط الأمر (Uri تمرّره عدسة الكود لوثيقتها) إن وُجِد — فيعمل الأمر على تلك
 * الوثيقة تحديدًا لا المحرّر النشط [تدقيق #5] — وإلا المسار المعتاد (النشط/الجولة). {doc} أو {error}.
 */
async function resolveSadDocArg(arg) {
  if (arg && arg.scheme === "file") {
    const doc = await vscode.workspace.openTextDocument(arg);
    const err = sadDocError(doc);
    return err ? { error: err } : { doc };
  }
  return resolveSadDoc();
}

/** أمر: شغّل ملفّ ص (وثيقة العدسة إن مُرِّرت، أو النشط/الرئيس) عبر sad-run في لوحة المخرجات العربيّة (bidi صحيح، spawn بلا صدفة فلا حقن). [AR-01] */
async function runSadFile(arg) {
  const resolved = await resolveSadDocArg(arg);
  if (resolved.error) {
    vscode.window.showWarningMessage(resolved.error);
    return;
  }
  const doc = resolved.doc;
  if (!(await doc.save())) {
    vscode.window.showWarningMessage(COPY.saveCancelled);
    return;
  }

  if (!(await isSadRunAvailable())) {
    const pick = await vscode.window.showErrorMessage(
      COPY.toolMissingTitle + " " + COPY.toolMissingHint,
      COPY.toolMissingLearn
    );
    if (pick === COPY.toolMissingLearn) {
      vscode.commands.executeCommand(OPEN_CMD, vscode.Uri.parse(DOCS_URL));
    }
    return;
  }

  // AR-01: بدل مهمّة الطرفيّة (xterm بلا bidi ⇒ يشوّه مخرجات ص العربيّة)، نبثّ المخرجات إلى
  // لوحة مخرجات عربيّة واعية بالاتّجاه (كلّ سطر يأخذ اتّجاهه من محتواه). العربيّة تُقرأ صحيحةً.
  // المسار المحلول (المدمج ثمّ PATH) والوسيط مفصولان (spawn بلا صدفة، فلا حقن)، ومجلّد العمل =
  // مجلّد الملفّ كي تُحلّ المسارات النسبيّة داخل برنامج ص صوابًا. [M5]
  sadOutput.run(sadRunCmd, [doc.fileName], path.dirname(doc.fileName), path.basename(doc.fileName), ACTION_RUN);
}

/** يشتقّ مسار المخرَج التنفيذيّ من ملفّ المصدر: بجواره باسمه دون لاحقة ص (sad-build يضيف لاحقة المنصّة). */
function outputPath(file) {
  return path.join(path.dirname(file), path.basename(file, path.extname(file)));
}

/** أمر: ابنِ (ترجِم) ملفّ ص (وثيقة العدسة إن مُرِّرت، أو النشط/الرئيس) عبر sad-build إلى تنفيذيّ (لا يشغّل)، وتُبثّ نتيجة الترجمة للّوحة. [SAD-04] */
async function buildSadFile(arg) {
  const resolved = await resolveSadDocArg(arg);
  if (resolved.error) {
    vscode.window.showWarningMessage(resolved.error);
    return;
  }
  const doc = resolved.doc;
  if (!(await doc.save())) {
    vscode.window.showWarningMessage(COPY.saveCancelled);
    return;
  }

  if (!(await isSadBuildAvailable())) {
    const pick = await vscode.window.showErrorMessage(
      COPY.buildToolMissingTitle + " " + COPY.toolMissingHint,
      COPY.toolMissingLearn
    );
    if (pick === COPY.toolMissingLearn) {
      vscode.commands.executeCommand(OPEN_CMD, vscode.Uri.parse(DOCS_URL));
    }
    return;
  }

  // sad-build يترجم فقط (لا يشغّل): «sad-build <ملفّ> -o <مخرَج>». المسار المحلول والوسائط مفصولة
  // (spawn بلا صدفة، فلا حقن)، ومجلّد العمل = مجلّد الملفّ. نتيجة الترجمة (نجاح/أخطاء) تظهر باللوحة.
  sadOutput.run(
    sadBuildCmd,
    [doc.fileName, BUILD_OUT_FLAG, outputPath(doc.fileName)],
    path.dirname(doc.fileName),
    path.basename(doc.fileName),
    ACTION_BUILD
  );
}

/**
 * موفّر عدسات كود [SAD-04]: يعرض فوق «دالة رئيسية» عدستَي «شغّل» و«ابنِ» (زرّا تشغيل/بناء في
 * السياق). منطق كشف نقيّ (MAIN_FN_RE)؛ الأمران المرتبطان يعملان على المحرّر النشط (نفس مسار
 * الأوامر). يكتفي بأوّل نقطة دخول (دالّة رئيسية واحدة للبرنامج).
 */
class SadMainCodeLensProvider {
  /** @param {vscode.TextDocument} document @returns {vscode.CodeLens[]} */
  provideCodeLenses(document) {
    const lenses = [];
    // نمرّر uri وثيقة العدسة كوسيط: الأمر يشغّل/يبني هذه الوثيقة تحديدًا لا المحرّر النشط
    // (يصمد في مجموعات المحرّر المنقسمة حيث قد يختلفان). [تدقيق #5]
    const arg = [document.uri];
    for (let i = 0; i < document.lineCount; i++) {
      if (MAIN_FN_RE.test(document.lineAt(i).text)) {
        const range = new vscode.Range(i, 0, i, 0);
        lenses.push(new vscode.CodeLens(range, { title: COPY.lensRun, command: RUN_FILE_CMD, arguments: arg }));
        lenses.push(new vscode.CodeLens(range, { title: COPY.lensBuild, command: BUILD_FILE_CMD, arguments: arg }));
        break; // نقطة دخول واحدة تكفي
      }
    }
    return lenses;
  }
}

// أمر النواة لفتح جولة، ووسيط «لا عمود جانبيّ» (تُملأ منطقة المحرّر الرئيسة).
const OPEN_WALKTHROUGH_CMD = "workbench.action.openWalkthrough";

/** يفتح جولة الترحيب مرّة واحدة على هذا الملفّ الشخصيّ (أوّل إقلاع بعد التثبيت). */
async function maybeShowWelcome(context) {
  if (context.globalState.get(WELCOME_SHOWN_KEY)) return;
  // المعرّف الكامل يُشتَقّ من هوية الامتداد وقت التشغيل (لا يُثبَّت publisher حرفيًّا). [M4]
  const ext = context.extension;
  const fullId = (ext && ext.id ? ext.id : DEFAULT_EXTENSION_ID) +
    WALKTHROUGH_ID_SEP + WALKTHROUGH_LOCAL_ID;
  try {
    await vscode.commands.executeCommand(OPEN_WALKTHROUGH_CMD, fullId, false);
    // نسِم «عُرِضت» فقط بعد نجاح الفتح: فشلٌ عابر (الجولة لم تُسجَّل بعدُ) يُعيد المحاولة
    // في الإقلاع التالي بدل إخماد الجولة أبدًا — وهو ذات العطل الأصليّ المُبلَّغ. [M2]
    await context.globalState.update(WELCOME_SHOWN_KEY, true);
  } catch {
    // الجولة تحسينيّة — فشلها لا يُفشِل التنشيط ولا يُسجَّل كمعروض (تُعاد المحاولة لاحقًا).
  }
}

function activate(context) {
  // حلّ مساري sad-run/sad-build مرّة واحدة عند التنشيط (المدمج أوّلًا ثمّ PATH).
  sadRunCmd = resolveSadRun(context);
  sadBuildCmd = resolveSadBuild(context);

  // جسر التشخيص [SAD-02]: يفحص ملفّ ص عند الحفظ (مهدّأ) وبأمر يدويّ عبر sad-check --json.
  // مُعامل ملفّ ص = مستند ص صالح على القرص (sadDocError == null): يمنع فحص ملفّات غير-ص/غير محفوظة.
  const sadDiag = new SadDiagnostics(context, {
    isSadFile: (doc) => !!doc && sadDocError(doc) === null,
  });

  // لوحة المخرجات العربيّة [AR-01]: وجهة تشغيل ملفّ ص (بديل الطرفيّة، bidi صحيح). نمرّر context
  // كي تقرأ الخطّ العربيّ المحزوم [AR-02] من media/ وتعرض المخرجات به عينه (webview معزول).
  sadOutput = new SadOutputPanel(context);

  context.subscriptions.push(
    sadDiag,
    sadOutput,
    vscode.commands.registerCommand(NEW_PROJECT_CMD, newSadProject),
    vscode.commands.registerCommand(RUN_FILE_CMD, runSadFile),
    vscode.commands.registerCommand(BUILD_FILE_CMD, buildSadFile),
    vscode.commands.registerCommand(CHECK_FILE_CMD, () => {
      const ed = vscode.window.activeTextEditor;
      return sadDiag.checkNow(ed && ed.document);
    }),
    // [AR-04] مخرجُ تعافٍ: قيمةٌ بنطاقِ لغةٍ في إعدادات المستخدم/المشروع تُظلِّل افتراضَنا،
    // ولا شيءَ في الواجهة يقول للمستخدم لماذا عادت الإطارات. الأمرُ يمسحها بنطاقها.
    vscode.commands.registerCommand(RESET_UNICODE_CMD,
      () => unicodeGuard.resetCommand(vscode, context.globalState)),
    // عدسات كود «شغّل/ابنِ» فوق دالّة رئيسية في ملفّات ص [SAD-04].
    vscode.languages.registerCodeLensProvider(
      { language: SAD_LANG_ID, scheme: "file" },
      new SadMainCodeLensProvider()
    ),
    vscode.workspace.onDidSaveTextDocument((doc) => sadDiag.scheduleCheck(doc))
  );

  // افحص الملفّ النشط عند التنشيط (إن كان ملفّ ص محفوظًا) كي تظهر التشخيصات فورًا لا بعد أوّل حفظ.
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) sadDiag.scheduleCheck(activeEditor.document);

  // عند اكتمال الإقلاع (onStartupFinished) اعرض الجولة أوّل مرّة فقط (رفض الوعد مُبتلَع). [L5]
  void maybeShowWelcome(context).catch(() => {});

  // [AR-04] إنذارٌ عن إعدادٍ يُظلِّل افتراضَنا **بنطاق لغة** (الحالةُ الوحيدة التي تُنتِج
  // الإطارات)، مرّةً لكلّ حالةٍ لا في كلّ إقلاع.
  void unicodeGuard.maybeWarn(vscode, context.globalState).catch(() => {});
}

function deactivate() {}

// دوالّ مُصدَّرة للاختبار الوحدويّ: validateProjectName وsadDocError نقيّتان (بلا vscode)،
// وfindWorkspaceSadFile/resolveSadDoc تُختبَران ببديل vscode متحكَّم (Module._load). COPY مُصدَّر
// كي تقابل الاختبارات رسائل الخطأ العائدة بمصدرها لا بحرفيّة مكرَّرة.
module.exports = {
  activate,
  deactivate,
  validateProjectName,
  sadDocError,
  findWorkspaceSadFile,
  resolveSadDoc,
  outputPath,
  SadMainCodeLensProvider,
  MAIN_FN_RE,
  COPY,
};
