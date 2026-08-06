"use strict";
/**
 * حارسُ أسماء الملفّات والمجلّدات [BS-03] — تعميمُ حارسٍ كان في بابٍ واحد.
 *
 * ## لماذا بعد الإنشاء لا قبله
 * ‏VS Code لا يعطي الامتداداتِ **حقَّ النقض** على إنشاء ملفّ أو إعادة تسميته: `onWillCreateFiles`
 * يقبل تحريرًا إضافيًّا لا رفضًا. فالخيارُ الصادقُ **الكشفُ الفوريُّ مع إصلاحٍ بنقرة**، لا ادّعاءُ
 * منعٍ لا نملكه. وهذا يكفي للخطر الحقيقيّ: الانتحالُ يضرّ حين **يبقى** في الشجرة ويُستورَد،
 * لا في اللحظة التي أُنشئ فيها.
 *
 * ## ولماذا لا يشمل كلَّ ما ترفضه `checkName`
 * نظامُ الملفّات نفسُه يرفض `/` و`:` وأخواتِها ويعرض خطأَه. أمّا محارفُ **الانتحال** فيقبلها
 * النظامُ بلا كلمة، ولا يراها المستخدمُ بعينه — فهي وحدَها ما يحتاج حارسًا فوق النظام.
 */

const { checkName, stripSpoofChars, REASON } = require("./validate-name.js");

/**
 * يعزل مقطعًا لاتينيًّا داخل جملةٍ عربيّة (`FSI…PDI`) — نظيرُ `iso` في `bidi-guard.js`.
 * ورموزُ نقاط الكود (`U+202E`) لاتينيّةٌ محضة، وتُعرَض في **رسالةِ أمنٍ** يجب أن تُقرأ بدقّة.
 */
const iso = (s) => "⁦" + s + "⁩";

/** أمرٌ داخليٌّ للإصلاح — مُصدَّرٌ كي لا يُكتَب المعرّفُ حرفيًّا في مكانَين. */
const RENAME_CMD = "mihrab.renameSpoofedFile";

const COPY = {
  // **الأثرُ أوّلًا**: لا يعرف المستخدمُ «محارف التحكّم ثنائيّة الاتّجاه»، ويعرف أنّ اسمَين
  // متطابقَين في عينه ليسا واحدًا في الحاسوب.
  // ثلاثُ جملٍ قصيرةٍ لا واحدةٌ طويلة (الإشعارُ يقتطع): الأثرُ، ثمّ الخطر، ثمّ النتيجة.
  // والاسمُ المعروضُ **منظَّفٌ سلفًا** — فتُذكَر النتيجةُ صراحةً كي لا يبدو الزرُّ بلا أثر.
  warn: (cleanName, chars) =>
    `اسمُ هذا الملفّ فيه محرفٌ غيرُ مرئيّ (${iso(chars.join(" "))}) يقلب ترتيبَ عرضه. ` +
    "فما تراه عينُك ليس ما يقرؤه الحاسوب — وهي حيلةٌ تُخفى بها لاحقةُ ملفٍّ تنفيذيّ. " +
    `الاسمُ بعد التنظيف: ${iso(cleanName)}`,
  fix: "نظِّف الاسم",
  keep: "أعرفه، أبقِه",
  // «من … إلى …» لا سهمًا: الأسهمُ مرآتيّةٌ فينقلب اتّجاهُها الدلاليُّ في سياق RTL.
  // والاسمُ القديمُ **منظَّفٌ للعرض**: إعادةُ حقنِ محرفِ الانتحال تعرض العطبَ الذي أُصلح للتوّ.
  renamed: (from, to) => `أُعيدت التسميةُ من ${iso(from)} إلى ${iso(to)}.`,
  renameFailed: (e) => `تعذّرت إعادةُ التسمية: ${e}`,
};

/** يستخرج اسمَ المدخل من مسار URI (بلا `path` — الفاصلُ في URI دائمًا `/`). */
function basenameOf(uri) {
  const p = (uri && uri.path) || "";
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

/** هل يستحقّ هذا الاسمُ تنبيهًا؟ يعيد المحارفَ المكتشَفة أو `null`. */
function spoofCharsIn(name) {
  const bad = checkName(name);
  return bad && bad.reason === REASON.BIDI_SPOOF ? bad.chars : null;
}

/**
 * يفعّل الحارس: يراقب الإنشاءَ وإعادةَ التسمية، ويعرض تنبيهًا بإصلاحٍ بنقرة.
 * @param {*} vscode @param {*} context
 * @returns {{dispose():void, inspect(uri:*):Promise<boolean>}}
 */
function activateNameGuard(vscode, context) {
  /** يفحص مسارًا واحدًا؛ يعيد `true` إن أُعيدت التسميةُ فعلًا. */
  async function inspect(uri) {
    const name = basenameOf(uri);
    const chars = spoofCharsIn(name);
    if (!chars) return false;
    const clean0 = stripSpoofChars(name);
    const pick = await vscode.window.showWarningMessage(
      COPY.warn(clean0, chars), COPY.fix, COPY.keep);
    if (pick !== COPY.fix) return false;
    const clean = stripSpoofChars(name);
    // اسمٌ لا يبقى منه شيءٌ بعد التنظيف لا يصلح هدفًا — نمتنع بدل أن نُنشئ فوضى.
    if (!clean.trim()) return false;
    const target = uri.with({ path: uri.path.slice(0, uri.path.lastIndexOf("/") + 1) + clean });
    try {
      const edit = new vscode.WorkspaceEdit();
      edit.renameFile(uri, target, { overwrite: false });
      const ok = await vscode.workspace.applyEdit(edit);
      // **إقرارٌ بالأثر لا بعدم الرمي** — نمطُ المستودع في `unicode-guard` و`bidi-guard`.
      if (!ok) {
        vscode.window.showErrorMessage(COPY.renameFailed("رُفض التحرير"));
        return false;
      }
    } catch (e) {
      vscode.window.showErrorMessage(COPY.renameFailed((e && e.message) || String(e)));
      return false;
    }
    vscode.window.showInformationMessage(COPY.renamed(clean0, clean));
    return true;
  }

  // **طابورٌ تسلسليّ**: لصقُ خمسةِ ملفّاتٍ منتحلةٍ كان يفتح خمسةَ صناديقِ تحذيرٍ متزامنة.
  let queue = Promise.resolve();
  const scanAll = (uris) => {
    for (const u of uris || []) {
      queue = queue.then(() => inspect(u)).catch(() => {});
    }
  };
  const subs = [
    vscode.workspace.onDidCreateFiles((e) => scanAll(e.files)),
    vscode.workspace.onDidRenameFiles((e) => scanAll((e.files || []).map((f) => f.newUri))),
  ];
  const handle = {
    inspect,
    dispose() {
      for (const s of subs) {
        try {
          s.dispose();
        } catch {
          /* تجاهُلٌ مقصود عند الإغلاق */
        }
      }
    },
  };
  if (context && context.subscriptions) context.subscriptions.push(handle);
  return handle;
}

module.exports = { activateNameGuard, basenameOf, spoofCharsIn, iso, RENAME_CMD, COPY };
