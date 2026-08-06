"use strict";
/**
 * رسالةُ محرّر الفرق [DR-04] — تسميةُ الاستثناء الوحيد الباقي بدل الحَيرة الصامتة.
 *
 * ## القيدُ ومَن يدفع ثمنَه
 * القاعدةُ ٣ في `mihrab-rtl.css` تُبقي `.editor.original` و`.editor.modified` على
 * ‏`direction: ltr`. كان ذلك صائبًا يومَ كانت العقيدةُ «الكودُ يبقى LTR»، ثمّ نُقِضت
 * العقيدةُ وصار المحرّرُ RTL كاملًا — فبقي محرّرُ الفرق **السطحَ الوحيدَ الذي يقرأ فيه
 * المستخدمُ شيفرتَه العربيّةَ بالاتّجاه المعاكس لِما اعتاده قبل ثانية**. وعدمُ الاتّساق
 * أشدُّ إرباكًا من الاتّجاه الخطأ المتّسق.
 *
 * ## لماذا رسالةٌ ولماذا هنا
 * أوصت المراجعةُ برسالةٍ **في ترويسة الفرق**، وسُجِّل عندنا أنّها لم تُنفَّذ لأنّ الترويسةَ
 * سطحٌ منبعيٌّ لا يُحقَن فيه نصٌّ إلّا برقعةِ نواةٍ جديدة — ومؤشّرُ الصحّة يمنعها لأجل
 * رسالةٍ إعلاميّة. **والحكمُ كان على الموضع لا على الرسالة**: الطبقةُ الأولى تبلغ نفسَ
 * اللحظة بإشعارٍ لمرّةٍ واحدة، وهي السابقةُ نفسُها التي مشى عليها `terminal-notice`
 * لقيدٍ منبعيٍّ آخر. فالتوصيةُ تُنفَّذ بلا رقعةٍ ولا يبقى الحدُّ صامتًا.
 *
 * ## شرطُ اللحظة
 * لا تقع الرسالةُ إلّا حين يُفتَح فرقٌ **وأحدُ لوحيه ملفُّ ص** — لا عند فرقِ
 * ‏`package.json`. الفرصةُ واحدةٌ للأبد فلا تُحرَق في غير سياقها، وهو الدرسُ المستفاد
 * حرفيًّا من رسالة الطرفيّة.
 */

/** مفتاحُ الحالة: هل عُرِضت رسالةُ الفرق مرّةً على هذا الملفّ الشخصيّ؟ */
const STATE_KEY = "mihrab.diff.directionNoticeShown";
/** أمرُ الإعادة — مخرَجٌ لمن أخفاها، فالإخفاءُ قرارٌ لا بابٌ مغلَق. */
const SHOW_AGAIN_CMD = "mihrab.showDiffDirectionNotice";
/** معرّفُ لغة ص (مرآةٌ لِما في `extension.js`؛ يحرس تطابقَهما فحصُ `_lang_identity`). */
const SAD_LANG_ID = "sad";

const COPY = {
  // **القيدُ مسمًّى بمصدره وبحدِّه**: «لوحان جنبًا لجنب» لا «محراب لا يدعم العربيّة».
  notice:
    "لوحا المقارنة يُعرَضان من اليسار — وحدَهما في محراب. قلبُ اتّجاههما يحتاج قلبَ منطقِ " +
    "المحاذاة بينهما لا قلبَ اتّجاهِ نصّ، وهو بندٌ مرفوعٌ إلى المنبع لا رُقعةٌ عندنا. " +
    "ونصُّك سليمٌ في الملفّ وفي المحرّر العاديّ.",
  openNormally: "افتح الملفّ في محرّرٍ عاديّ",
  dontRemind: "لا تُظهر هذا ثانيةً",
  hidden:
    "أُخفيَت رسالةُ اتّجاه المقارنة. لإعادتها: لوحةُ الأوامر ← «محراب: أظهِر رسالة اتّجاه المقارنة».",
  shownAgain: "أُعيدت رسالةُ اتّجاه المقارنة.",
};

/** أهو محرّرُ فرقٍ أحدُ لوحيه ملفُّ ص؟ */
function isSadDiff(editor) {
  if (!editor) return false;
  // ‏`TextEditor` العاديّ لا يحمل `original`/`modified`؛ وحدَه `TabInputTextDiff` يحملهما.
  const a = editor.original;
  const b = editor.modified;
  if (!a && !b) return false;
  const isSad = u => !!u && (/\.ص$/.test(u.path || "") || /\.sad$/.test(u.path || ""));
  return isSad(a) || isSad(b);
}

/**
 * يراقب تبويباتِ المحرّر: أوّلُ فرقٍ لملفّ ص يستدعي الرسالة، مرّةً واحدةً للأبد.
 *
 * @param {*} vscode واجهةُ المحرّر (محقونةٌ للاختبار).
 * @param {*} memento ذاكرةُ الحالة العامّة (`context.globalState`).
 */
function activateDiffNotice(vscode, memento) {
  const maybeNotice = async () => {
    if (!memento || memento.get(STATE_KEY)) return false;
    const groups = (vscode.window.tabGroups && vscode.window.tabGroups.all) || [];
    const hit = groups.some(g => (g.tabs || []).some(t => isSadDiff(t && t.input)));
    if (!hit) return false;
    // نسِم «عُرِضت» **قبل** الانتظار: فرقان يُفتحان معًا لا يعطيان رسالتين.
    await memento.update(STATE_KEY, true);
    const pick = await vscode.window.showInformationMessage(
      COPY.notice,
      COPY.openNormally,
      COPY.dontRemind
    );
    if (pick === COPY.openNormally) {
      const ed = vscode.window.activeTextEditor;
      const uri = ed && ed.document && ed.document.uri;
      if (uri) await vscode.commands.executeCommand("vscode.open", uri);
    } else if (pick === COPY.dontRemind) {
      vscode.window.showInformationMessage(COPY.hidden);
    }
    return true;
  };

  const subs = [];
  if (vscode.window.tabGroups && vscode.window.tabGroups.onDidChangeTabs) {
    // **يُعاد الوعدُ عمدًا** لا يُبتلَع: يجعل الرسالةَ قابلةً للانتظار في الاختبار.
    subs.push(vscode.window.tabGroups.onDidChangeTabs(() => maybeNotice().catch(() => {})));
  }
  // تبويبٌ مفتوحٌ سلفًا وقتَ التنشيط لا يُطلِق حدثًا — فنسأل مرّةً عند البدء.
  const initial = maybeNotice().catch(() => {});

  return {
    initial,
    /** أمرُ الإعادة: يمسح الوسمَ فتعود الرسالةُ عند أوّل فرقِ ص تالٍ. */
    async showAgain() {
      if (memento) await memento.update(STATE_KEY, undefined);
      vscode.window.showInformationMessage(COPY.shownAgain);
    },
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
}

module.exports = {
  activateDiffNotice,
  isSadDiff,
  STATE_KEY,
  SHOW_AGAIN_CMD,
  SAD_LANG_ID,
  COPY,
};
