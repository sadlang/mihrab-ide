#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""خبز ترجمة الواجهة العربيّة داخل nls.messages.json الافتراضيّ (مساهمة بناء — الطبقة 2).

السبب الجذريّ: حزمة اللغة في VS Code تُفعَّل فقط حين يُسجَّلها مسحُ الإضافات في
‎userDataPath/languagepacks.json — وهذا يجري **بعد** أوّل إقلاع، فيكون أوّل فتح
إنجليزيًّا دائمًا، والثاني عربيًّا. كذلك «إعادة تحميل النافذة» لا تُعيد حلّ NLS
(يجري في العمليّة الرئيسة عند الإقلاع فقط).

الحلّ: نخبز الترجمة العربيّة داخل nls.messages.json الافتراضيّ وقت البناء، فتصير
العربيّة **الافتراضيّ الحرفيّ للنواة** بلا اعتماد على مسح حزمة لغة ولا إعادة تحميل.
السلاسل غير المترجَمة ترتدّ تلقائيًّا للإنجليزيّة (نفس منطق التشغيل: ‎`||`).

الخوارزميّة الأساس مطابقة لـ‎resolveNLSConfiguration في src/vs/base/node/nls.ts:
  لكلّ [moduleId, keys] في nls.keys.json، ولكلّ key:
    result.push( contents[moduleId]?.[key]  ||  default_messages[idx] )

ارتداد على مستوى المفتاح (يعالج انجراف مسار الوحدة بين إصدار الحزمة 1.85 وإصدار
محراب 1.121): حين يغيب التطابق الحرفيّ ‎(moduleId, key)، نستعمل ترجمة نفس المفتاح من
أيّ وحدة أخرى **فقط إن كانت غير ملتبسة** (المفتاح ذاته ⇐ ترجمة واحدة في كلّ الحزمة).
آمن: لا يخمّن عند تعدّد الترجمات لنفس المفتاح؛ يستردّ سلاسل كـ«ملف/عرض» التي نُقِلت
وحدتها (menubarControl ⇐ menubar.contribution) دون تخمين.

idempotent: يحفظ الإنجليزيّة الأصليّة في nls.messages.en.json ويقرأ منها مصدرَ
الارتداد، فإعادة التشغيل لا تُضاعِف الخبز.

الاستعمال: python bake_nls_arabic.py <مسار resources/app>
"""
import json
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass


def _read_json(path):
    with open(path, "r", encoding="utf-8", newline="") as f:
        return json.load(f)


def main() -> int:
    if len(sys.argv) != 2:
        print("الاستعمال: python bake_nls_arabic.py <مسار resources/app>", file=sys.stderr)
        return 2
    app = sys.argv[1]
    out_dir = os.path.join(app, "out")
    keys_file = os.path.join(out_dir, "nls.keys.json")
    msgs_file = os.path.join(out_dir, "nls.messages.json")
    en_backup = os.path.join(out_dir, "nls.messages.en.json")
    i18n_file = os.path.join(
        app, "extensions", "language-pack-ar", "translations", "main.i18n.json"
    )

    for p in (keys_file, msgs_file, i18n_file):
        if not os.path.isfile(p):
            print(f"⚠️ ملفّ مفقود: {p}", file=sys.stderr)
            return 1

    # مصدر الإنجليزيّة للارتداد: النسخة الاحتياطيّة إن وُجدت (يضمن idempotency)،
    # وإلا الأصل الحاليّ (ونحفظه احتياطيًّا قبل الكتابة).
    if os.path.isfile(en_backup):
        default_messages = _read_json(en_backup)
    else:
        default_messages = _read_json(msgs_file)
        with open(en_backup, "w", encoding="utf-8", newline="") as f:
            json.dump(default_messages, f, ensure_ascii=False)
        print("حُفِظت نسخة الإنجليزيّة الأصليّة: nls.messages.en.json")

    nls_keys = _read_json(keys_file)

    # مصدر الحزمة الأصليّة (1.85): النسخة الاحتياطيّة إن وُجدت (idempotency)، وإلا
    # الحاليّة (ونحفظها قبل إعادة التخطيط فوقها).
    i18n_backup = os.path.join(os.path.dirname(i18n_file), "main.i18n.orig.json")
    if os.path.isfile(i18n_backup):
        orig = _read_json(i18n_backup)
    else:
        orig = _read_json(i18n_file)
        with open(i18n_backup, "w", encoding="utf-8", newline="") as f:
            json.dump(orig, f, ensure_ascii=False)
        print("حُفِظت نسخة الحزمة الأصليّة: main.i18n.orig.json")
    contents = orig.get("contents", {})

    # خريطة ارتداد على مستوى المفتاح: key -> ar، لكن فقط للمفاتيح غير الملتبسة
    # (ترجمة واحدة عبر كلّ الحزمة). المفاتيح متعدّدة الترجمات تُترَك للتطابق الحرفيّ.
    key_votes: dict[str, set] = {}
    for _mid, _d in contents.items():
        if not isinstance(_d, dict):
            continue
        for _k, _v in _d.items():
            if isinstance(_v, str) and _v:
                key_votes.setdefault(_k, set()).add(_v)
    key_fallback = {k: next(iter(v)) for k, v in key_votes.items() if len(v) == 1}

    # حلّ الترجمة لكلّ (module, key) بترتيب nls.keys: حرفيّ أوّلًا ثمّ ارتداد المفتاح.
    # نبني معًا: (1) مصفوفة nls.messages.json المخبوزة، (2) حزمة معاد تخطيطها على بِنية
    # وحدات 1.121 كي يجد مسارُ كاش حزمة اللغة (clp) نفسَ الترجمات بالمطابقة الحرفيّة.
    result = []
    remapped: dict[str, dict] = {}
    idx = 0
    exact = 0
    fallback = 0
    for module_id, keys in nls_keys:
        mod = contents.get(module_id) or {}
        for key in keys:
            ar = mod.get(key)
            if ar:
                exact += 1
            elif key in key_fallback:
                ar = key_fallback[key]
                fallback += 1
            if ar:
                result.append(ar)
                remapped.setdefault(module_id, {})[key] = ar
            else:
                result.append(default_messages[idx])
            idx += 1
    translated = exact + fallback

    if idx != len(default_messages):
        print(
            f"⚠️ عدم تطابق: مفاتيح={idx} رسائل={len(default_messages)} — توقّف بلا كتابة.",
            file=sys.stderr,
        )
        return 1

    # (1) كتابة nls.messages.json المخبوزة (المسار الافتراضيّ — أوّل فتح).
    tmp = msgs_file + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        json.dump(result, f, ensure_ascii=False)
    os.replace(tmp, msgs_file)

    # (2) كتابة main.i18n.json المعاد تخطيطها (مسار كاش حزمة اللغة — الفتحات التالية).
    new_pack = {k: orig[k] for k in orig if k != "contents"}
    new_pack["contents"] = remapped
    tmp2 = i18n_file + ".tmp"
    with open(tmp2, "w", encoding="utf-8", newline="") as f:
        json.dump(new_pack, f, ensure_ascii=False)
    os.replace(tmp2, i18n_file)

    pct = (translated * 100) // idx if idx else 0
    print(
        f"✅ عُرّبت الواجهة: {translated}/{idx} سلسلة ({pct}%) — حرفيّ={exact}، "
        f"ارتداد-مفتاح={fallback}. (nls.messages.json مخبوز + main.i18n.json معاد تخطيطه)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
