// @ts-check
"use strict";
// امتداد ترحيب محراب (الطبقة 1) — أمرا الإعداد الأوّل:
//   • mihrab.newSadProject — ينشئ مجلّد مشروع ص بقالب حيّ مشروح بالعربية (الفكرة أ-٢).
//   • mihrab.runSadFile     — يشغّل ملفّ ص الحاليّ عبر أدوات ص (sad-run) كمهمّة (بلا صدفة).
// كلّ نصّ ظاهر للمستخدم ثابت مسمّى في COPY (نسخة عربيّة-أوّلًا = بيانات واجهة، استثناء
// مقبول لقاعدة منع السلاسل الحرفيّة، متّسق مع قرار جملة الترحيب في patch_welcome_rtl.py).

const vscode = require("vscode");
const cp = require("child_process");
const fs = require("fs");
const path = require("path");

// اسم أداة تشغيل ص (مصدر حقيقة واحد داخل هذا الامتداد).
const SAD_RUN = "sad-run";
// مجلّد سلسلة الأدوات المدمجة داخل الامتداد (يُحقَن وقت البناء إن توفّرت الثنائيّات).
const BUNDLED_BIN_DIR = "bin";
// معرّف الجولة المحلّيّ (id في contributes.walkthroughs)؛ المعرّف الكامل يُشتَقّ وقت
// التشغيل من context.extension.id (publisher.name) كي لا ينكسر لو تغيّرت الهوية. [M4]
const WALKTHROUGH_LOCAL_ID = "mihrab.gettingStarted";
const WALKTHROUGH_ID_SEP = "#";
// مفتاح حالة عامّة: هل عُرِضت جولة الترحيب مرّة على هذا الملفّ الشخصيّ؟ (تُفتح مرّة واحدة).
const WELCOME_SHOWN_KEY = "mihrab.welcome.shown";
// معرّف لغة ص (يطابق contributes.languages في sad-lang) وامتدادها (حرف الصاد).
const SAD_LANG_ID = "sad";
const SAD_EXT = ".ص";
// اسم المشروع الافتراضيّ واسم الملفّ الرئيس والمجلّدات.
const DEFAULT_PROJECT_NAME = "مشروع-ص";
const MAIN_FILE = "مرحبا" + SAD_EXT;
const README_FILE = "اقرأني.md";
const VSCODE_DIR = ".vscode";
const TASKS_FILE = "tasks.json";
const RUN_TASK_LABEL = "تشغيل برنامج ص";
// نوع مهمّة مخصّص (لا نوع VSCode المدمج «process») لإزالة أيّ لبس مع عقد المهامّ المدمجة.
const RUN_TASK_TYPE = "mihrab-run";
const DOCS_URL = "https://github.com/sadlang/s-programming-language";
// معرّفا أمرَي هذا الامتداد (مصدر حقيقة واحد؛ يطابقان contributes.commands في package.json).
const NEW_PROJECT_CMD = "mihrab.newSadProject";
const RUN_FILE_CMD = "mihrab.runSadFile";
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
  runFailed: (e) => `تعذّر تشغيل الملفّ: ${e}`,
  noEditor: "لا يوجد محرّر نشط — افتح ملفّ ص أوّلًا كي تشغّله.",
  sadFileAmbiguous: `وُجدت عدّة ملفّات ص — افتح الملفّ الذي تريد تشغيله أوّلًا (لا يوجد ‹${MAIN_FILE}› لأختاره تلقائيًّا).`,
  notSadFile: `الملفّ الحاليّ ليس ملفّ ص (‹${SAD_EXT}›).`,
  notOnDisk: "احفظ الملفّ على القرص أوّلًا كي يمكن تشغيله.",
  saveCancelled: "أُلغي الحفظ — لم يُشغَّل الملفّ.",
  toolMissingTitle: `لم يُعثَر على أداة تشغيل ص (‹${SAD_RUN}›) في مسار النظام.`,
  toolMissingHint: "ثبّت أدوات ص وأضِفها إلى PATH ثمّ أعِد المحاولة.",
  toolMissingLearn: "كيف أثبّت أدوات ص؟",
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
  const taskNote = runnerReady
    ? "- أو شغّل المهمّة **«" + RUN_TASK_LABEL + "»** (تعمل مباشرةً بمُشغّل ص المحلول).\n"
    : "- أو شغّل المهمّة **«" + RUN_TASK_LABEL + "»** (تتطلّب تثبيت أدوات ص ‹" + SAD_RUN + "› على PATH).\n";
  return (
    "# " + projectName + "\n\n" +
    "أوّل مشروع لك بلغة ص داخل محراب.\n\n" +
    "## التشغيل\n\n" +
    "- افتح ‹" + MAIN_FILE + "› ثمّ نفّذ أمر **«محراب: شغّل ملفّ ص الحاليّ»**.\n" +
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
        group: { kind: "build", isDefault: true },
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

// أمر التشغيل المحلول: يُضبَط عند التنشيط إلى الثنائيّ المدمج (إن وُجِد) وإلا اسم PATH.
let sadRunCmd = SAD_RUN;

// اسم ثنائيّ ص المدمج حسب المنصّة (البناء ويندوزيّ ويحزم sad-run.exe؛ نطابقه هنا). [L1]
const SAD_RUN_EXE = process.platform === "win32" ? SAD_RUN + ".exe" : SAD_RUN;

/** يحلّ مسار sad-run: الثنائيّ المدمج مع محراب أوّلًا (يعمل دون تثبيت)، ثمّ اسم PATH احتياطًا. */
function resolveSadRun(context) {
  const bundled = path.join(context.extensionPath, BUNDLED_BIN_DIR, SAD_RUN_EXE);
  try {
    // ملفّ فعليّ لا مجلّد (accessSync/X_OK على ويندوز = وجود فقط، ينجح على مجلّد أيضًا). [L8]
    if (fs.statSync(bundled).isFile()) {
      fs.accessSync(bundled, fs.constants.X_OK);
      return bundled; // مسار مطلق للثنائيّ المدمج
    }
  } catch {
    // لا ثنائيّ مدمج — يسقط إلى PATH.
  }
  return SAD_RUN; // يسقط إلى اسم PATH (يُرقّى لمسار مطلق في isSadRunAvailable). [M1]
}

/**
 * هل sad-run متاح للتشغيل؟ الثنائيّ المدمج بمسار مطلق ⇒ إعادة تحقّق من الوجود (يمسك حذفًا
 * بين التنشيط والتشغيل [N3]). وإلا فحص PATH عبر where/which، ومع النجاح نرقّي sadRunCmd إلى
 * المسار المطلق الأوّل الذي يُرجعه where — فلا يفشل ProcessExecution بحلّ لاحقة .exe على ويندوز. [M1]
 */
function isSadRunAvailable() {
  if (path.isAbsolute(sadRunCmd)) {
    try {
      return Promise.resolve(fs.statSync(sadRunCmd).isFile());
    } catch {
      return Promise.resolve(false);
    }
  }
  const probe = process.platform === "win32" ? "where" : "which";
  return new Promise((resolve) => {
    try {
      const child = cp.execFile(probe, [sadRunCmd], { timeout: 4000 }, (err, stdout) => {
        if (err) {
          resolve(false);
          return;
        }
        const first = String(stdout || "")
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)[0];
        if (first) sadRunCmd = first; // ارفع إلى المسار المطلق المحلول
        resolve(true);
      });
      child.on("error", () => resolve(false));
    } catch {
      resolve(false);
    }
  });
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

/** أمر: شغّل ملفّ ص (النشط، أو الرئيس من الجولة حين لا نشط) عبر sad-run كمهمّة (بلا صدفة، فلا حقن). */
async function runSadFile() {
  const resolved = await resolveSadDoc();
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

  // ProcessExecution: البرنامج ووسيطته مفصولان — لا صدفة ولا تأويل، فلا حقن عبر اسم المسار.
  // نستعمل المسار المحلول (الثنائيّ المدمج إن وُجِد، وإلا اسم PATH)، ومجلّد عمل = مجلّد
  // الملفّ كي تُحلّ المسارات النسبيّة داخل برنامج ص صوابًا (لا مجلّد عمل غير محدَّد). [M5]
  const task = new vscode.Task(
    { type: RUN_TASK_TYPE },
    vscode.TaskScope.Workspace,
    RUN_TASK_LABEL,
    "mihrab",
    new vscode.ProcessExecution(sadRunCmd, [doc.fileName], { cwd: path.dirname(doc.fileName) }),
    []
  );
  task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, clear: true };
  try {
    await vscode.tasks.executeTask(task);
  } catch (err) {
    vscode.window.showErrorMessage(COPY.runFailed(String(err && err.message ? err.message : err)));
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
  // حلّ مسار sad-run مرّة واحدة عند التنشيط (المدمج أوّلًا ثمّ PATH).
  sadRunCmd = resolveSadRun(context);
  context.subscriptions.push(
    vscode.commands.registerCommand(NEW_PROJECT_CMD, newSadProject),
    vscode.commands.registerCommand(RUN_FILE_CMD, runSadFile)
  );
  // عند اكتمال الإقلاع (onStartupFinished) اعرض الجولة أوّل مرّة فقط (رفض الوعد مُبتلَع). [L5]
  void maybeShowWelcome(context).catch(() => {});
}

function deactivate() {}

// validateProjectName مُصدَّرة للاختبار الوحدويّ (منطق نقيّ بلا vscode).
module.exports = { activate, deactivate, validateProjectName };
