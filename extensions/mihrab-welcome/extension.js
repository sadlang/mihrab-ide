// @ts-check
"use strict";
// امتداد ترحيب محراب (الطبقة 1) — أمرا الإعداد الأوّل:
//   • mihrab.newSadProject — ينشئ مجلّد مشروع ص بقالب حيّ مشروح بالعربية (الفكرة أ-٢).
//   • mihrab.runSadFile     — يشغّل ملفّ ص الحاليّ عبر أدوات ص (sad-run) كمهمّة (بلا صدفة).
// كلّ نصّ ظاهر للمستخدم ثابت مسمّى في COPY (نسخة عربيّة-أوّلًا = بيانات واجهة، استثناء
// مقبول لقاعدة منع السلاسل الحرفيّة، متّسق مع قرار جملة الترحيب في patch_welcome_rtl.py).

const vscode = require("vscode");
const cp = require("child_process");

// اسم أداة تشغيل ص (مصدر حقيقة واحد داخل هذا الامتداد).
const SAD_RUN = "sad-run";
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

/** يبني نصّ اقرأني بعنوان يطابق اسم المشروع الفعليّ (لا الاسم الافتراضيّ). */
function buildReadme(projectName) {
  return (
    "# " + projectName + "\n\n" +
    "أوّل مشروع لك بلغة ص داخل محراب.\n\n" +
    "## التشغيل\n\n" +
    "- افتح ‹" + MAIN_FILE + "› ثمّ نفّذ أمر **«محراب: شغّل ملفّ ص الحاليّ»**.\n" +
    "- أو شغّل المهمّة **«" + RUN_TASK_LABEL + "»** (تتطلّب تثبيت أدوات ص ‹" + SAD_RUN + "› على النظام).\n"
  );
}

// مهمّة تشغيل قياسيّة (آليّة VSCode) — تعمل عند توفّر sad-run على PATH.
const TEMPLATE_TASKS = {
  version: "2.0.0",
  tasks: [
    {
      label: RUN_TASK_LABEL,
      type: "process",
      command: SAD_RUN,
      args: ["${file}"],
      group: { kind: "build", isDefault: true },
      problemMatcher: [],
    },
  ],
};

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
    await writeText(vscode.Uri.joinPath(targetUri, README_FILE), buildReadme(projectName));
    await writeText(
      vscode.Uri.joinPath(targetUri, VSCODE_DIR, TASKS_FILE),
      JSON.stringify(TEMPLATE_TASKS, null, 2) + "\n"
    );

    // (٥) افتح الملفّ الرئيس، واعرض دعوة لفتح المجلّد كمساحة عمل.
    const doc = await vscode.workspace.openTextDocument(mainUri);
    await vscode.window.showTextDocument(doc, { preview: false });
    const action = await vscode.window.showInformationMessage(COPY.createdInfo(projectName), COPY.openFolder);
    if (action === COPY.openFolder) {
      await vscode.commands.executeCommand("vscode.openFolder", targetUri, { forceNewWindow: false });
    }
  } catch (err) {
    vscode.window.showErrorMessage(COPY.createFailed(String(err && err.message ? err.message : err)));
  }
}

/** هل أداة sad-run متوفّرة على PATH؟ (فحص غير حاجب عبر where/which). */
function isSadRunAvailable() {
  const probe = process.platform === "win32" ? "where" : "which";
  return new Promise((resolve) => {
    try {
      const child = cp.execFile(probe, [SAD_RUN], { timeout: 4000 }, (err) => resolve(!err));
      child.on("error", () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

/** أمر: شغّل ملفّ ص الحاليّ عبر sad-run كمهمّة (ProcessExecution — بلا صدفة، فلا حقن). */
async function runSadFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(COPY.noEditor);
    return;
  }
  const doc = editor.document;
  // كشف اللغة بالمعرّف (أدقّ من الامتداد)، مع الامتداد احتياطًا.
  if (doc.languageId !== SAD_LANG_ID && !doc.fileName.endsWith(SAD_EXT)) {
    vscode.window.showWarningMessage(COPY.notSadFile);
    return;
  }
  // يجب أن يكون ملفًّا حقيقيًّا على القرص (لا untitled ولا مخطّط بعيد/افتراضيّ).
  if (doc.isUntitled || doc.uri.scheme !== "file") {
    vscode.window.showWarningMessage(COPY.notOnDisk);
    return;
  }
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
      vscode.commands.executeCommand("vscode.open", vscode.Uri.parse(DOCS_URL));
    }
    return;
  }

  // ProcessExecution: البرنامج ووسيطته مفصولان — لا صدفة ولا تأويل، فلا حقن عبر اسم المسار.
  const task = new vscode.Task(
    { type: RUN_TASK_TYPE },
    vscode.TaskScope.Workspace,
    RUN_TASK_LABEL,
    "mihrab",
    new vscode.ProcessExecution(SAD_RUN, [doc.fileName]),
    []
  );
  task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, clear: true };
  try {
    await vscode.tasks.executeTask(task);
  } catch (err) {
    vscode.window.showErrorMessage(COPY.runFailed(String(err && err.message ? err.message : err)));
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("mihrab.newSadProject", newSadProject),
    vscode.commands.registerCommand("mihrab.runSadFile", runSadFile)
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
