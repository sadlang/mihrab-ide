/*---------------------------------------------------------------------------------------------
 *  محراب — أين يُكتَب ملفُّ إعداداتِ مشروع (الحلُّ الفعليّ لا الاسمُ المجرّد).
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { IFileService } from '../../files/common/files.js';
import {
	CONFIG_FOLDER_NAMES_BY_PREFERENCE,
	MIHRAB_CONFIG_FOLDER_NAME,
} from '../../../base/common/mihrabConfigFolder.js';

/**
 * ## القاعدة
 *
 * **القراءةُ من الأسماء الثلاثة، والكتابةُ في مجلّدٍ واحد.**
 *
 * أيُّ واحد؟ الموجودُ فعلًا في هذا المشروع، وإلّا `.محراب`. والسببُ أنّ البديل — أن
 * تُكتَب `tasks.json` دائمًا في `.محراب` — يُشظّي المشروعَ القائم: مستودعٌ فيه
 * `.vscode/settings.json` ملتزَمةٌ منذ سنوات يكتسب فجأةً `.محراب/tasks.json` بجانبها،
 * فيرى زملاءُ المستخدم مجلّدًا لا تعرفه أدواتُهم، ويرى هو مجلّدين لا يدري أيّهما الحقّ.
 *
 * فمشروعٌ قديم يبقى قديمًا حتّى يُنقَل عمدًا، ومشروعٌ جديد يولد باسمه الجديد.
 *
 * ## لماذا هذا في طبقة platform
 *
 * مستهلكوه في الطبقتين معًا (workbench: المهامّ والتنقيح وMCP · platform: التشخيص).
 * وقواعدُ الطبقات تمنع platform من استيراد workbench، فلو سكن هناك لتعذّر استعماله
 * في نصفهم — ولانتهى الأمرُ بنسختين تتباعدان.
 */

/** ذاكرةُ الحلّ لكلّ جذر — يملؤها `resolveConfigFolderName`، ويقرؤها المتزامنون. */
const resolved = new Map<string, string>();

/** يعيد اسمَ مجلّد الإعدادات الذي يُكتَب فيه في هذا الجذر (لا مسارًا كاملًا). */
export async function resolveConfigFolderName(fileService: IFileService, folder: URI): Promise<string> {
	for (const name of CONFIG_FOLDER_NAMES_BY_PREFERENCE) {
		try {
			const stat = await fileService.stat(folder.with({ path: `${folder.path}/${name}` }));
			if (stat.isDirectory) {
				resolved.set(folder.toString(), name);
				return name;
			}
		} catch (e) {
			// غيرُ موجود: انتقل إلى التالي. لا نُسجّل — الغيابُ هو الحالةُ الشائعة لا خطأ.
		}
	}
	resolved.set(folder.toString(), MIHRAB_CONFIG_FOLDER_NAME);
	return MIHRAB_CONFIG_FOLDER_NAME;
}

/**
 * نسخةٌ متزامنة لمواضع لا تحتمل `await` (مثل `get uri()` في مدير التنقيح).
 *
 * **حدُّها المعلوم:** قبل أن يُحلّ هذا الجذرُ مرّةً تعيد `.محراب`. ولهذا يُمهَّد الحلُّ
 * من `FolderConfiguration` عند بناء كلّ جذرٍ في مساحة العمل — أي قبل أن يفتح المستخدمُ
 * تهيئةَ تنقيحٍ بزمنٍ طويل. ومسارُ **الإنشاء** لا يعتمد عليها أصلًا: هو غيرُ متزامن
 * فيستعمل `resolveConfigFileResource`. فأسوأُ ما تُنتجه هذه الدالّة مسارٌ يُعرَض، لا
 * ملفٌّ يُكتَب في المكان الخطأ.
 */
export function configFolderNameSync(folder: URI): string {
	return resolved.get(folder.toString()) ?? MIHRAB_CONFIG_FOLDER_NAME;
}

/** يعيد URI ملفٍّ داخل مجلّد إعدادات هذا الجذر — مثال: `resolve(fs, root, 'tasks.json')`. */
export async function resolveConfigFileResource(fileService: IFileService, folder: URI, fileName: string): Promise<URI> {
	const name = await resolveConfigFolderName(fileService, folder);
	return folder.with({ path: `${folder.path}/${name}/${fileName}` });
}
