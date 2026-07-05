#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""حقن ترجمة بيانات الامتدادات المدمجة إلى العربيّة — مساهمة بناء (الطبقة 2).

السبب الجذريّ: مفاتيح `package.nls.json` (عناوين الأوامر، أوصاف الإعدادات، تسميات
القوائم — الأعلى ظهورًا في «الإعدادات» و«لوحة الأوامر») لا تغطّيها حزمة اللغة المنبعيّة
(1.85) إلّا جزئيًّا (~23%). أمّا الباقي فيظهر إنجليزيًّا.

**اكتشاف حاسم (تحقّق CDP حيّ):** حين تكون حزمة اللغة (language-pack-ar) نشطة — وهي
كذلك دائمًا في محراب — تحلّ النواةُ ترجمةَ البيان عبر `getLocalizedMessages`:
    a = "${publisher}.${name}";  c = nlsConfig.translations[a]
    if c: values = read(c).contents.package            ← مسار حزمة اللغة (الفعليّ)
    else: values = read(package.nls.<locale>.json)      ← ارتداد فقط حين لا حزمة لغة
أي أنّ `package.nls.ar.json` **يُتجاوَز كليًّا** لأيّ امتداد مُدرَج في خريطة حزمة اللغة.
لذا يجب الحقن في `contents.package` بملفّ i18n لحزمة اللغة، لا في package.nls.ar.json.
(أُثبِت حيًّا: git commit ⇒ «إيداع»، وصف git.enableSmartCommit ⇒ عربيّ.)

الحلّ لكلّ امتداد:
  • إن كان مُدرَجًا في حزمة اللغة (له ملفّ i18n): نُعيد بناء `contents.package` **كاملًا**
    من مفاتيح package.nls.json = لكلّ مفتاح: الترجمة الرسميّة الموجودة في حزمة اللغة ⟵
    وإلّا التكميليّ (mihrab_ext_nls_ar.json بمفتاح نصّ الإنجليزيّة) ⟵ وإلّا الإنجليزيّة.
    نحفظ سائر مفاتيح `contents` (مثل dist/main = ترجمة الشيفرة) دون مساس. ونحذف أيّ
    package.nls.ar.json بائت من نهج سابق (كان يُتجاوَز).
  • إن لم يكن مُدرَجًا (لا ملفّ i18n): package.nls.ar.json هو الارتداد الأصيل الصحيح —
    نكتبه كاملًا.

كامل ⇒ لا انحدار مهما كانت أسبقيّة الحلّ. **حتميّ فقط على شجرة منبع نظيفة** (build.sh
يعيد بناءها بـrm -rf): عندئذٍ contents.package يُشتَقّ من package.nls.json + الترجمة الرسميّة
الأصليّة. على شجرة مُحقونة سابقًا (تطوير في المكان) تُقرَأ القيم المحقونة كأنّها «رسميّة»،
فتحديث mihrab_ext_nls_ar.json لا يسري إلّا بعد rm -rf — فخّ تطوير مقبول لأنّ البناء نظيف.
لا يمسّ package.nls.json الأصليّ.

**إبطال الكاش (كاشان منفصلان):**
  1. كاش مسح الامتدادات المدمجة (extensions.builtin.cache): مفتاحه يشمل mtime مجلّد
     الامتدادات ⇒ يُبطَل تلقائيًّا مع بناء جديد الطابع الزمنيّ.
  2. كاش ترجمة حزمة اللغة (%APPDATA%/clp): مفتاحه md5(extId+**version**) — ثابت عبر
     إعادة البناء ولا يحرّكه mtime. لذا **bake_nls_arabic.py يرفع نسخة language-pack-ar من
     بصمة محتوى تشمل ملفّات i18n المحقونة هنا** (يجب أن يعمل هذا المرقِّع **قبل** bake_nls).
     هذا يُبطل كاش CLP في سيناريو «تحديث فوق ملفّ تعريف قائم». انظر
     [[mihrab-stale-clp-language-cache-gotcha]].

الاستعمال: python patch_extension_nls.py <مسار resources/app>  (قبل bake_nls_arabic.py)
"""
import json
import os
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

LANG = "ar"
LP_DIR = "language-pack-" + LANG  # مجلّد حزمة اللغة داخل extensions/


def _read_json(path):
    with open(path, "r", encoding="utf-8", newline="") as f:
        return json.load(f)


def _write_json_atomic(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        json.dump(obj, f, ensure_ascii=False)
    os.replace(tmp, path)


def _en_value(v):
    """قيمة package.nls قد تكون نصًّا أو {message, comment}."""
    if isinstance(v, dict):
        return v.get("message")
    return v if isinstance(v, str) else None


def _existing_pkg(contents):
    """يستخرج ترجمة «package» الرسميّة الموجودة في contents (نصوص غير فارغة فقط)."""
    out = {}
    pkg = contents.get("package", {}) if isinstance(contents, dict) else {}
    if isinstance(pkg, dict):
        for k, v in pkg.items():
            s = v if isinstance(v, str) else (v.get("message") if isinstance(v, dict) else None)
            if isinstance(s, str) and s:
                out[k] = s
    return out


def _build_map(pk, official, supp):
    """يكوّن خريطة عربيّة كاملة لكلّ مفاتيح package.nls.json.

    الأسبقيّة لكلّ مفتاح: الترجمة الرسميّة الموجودة (official) ⟵ التكميليّ (supp بمفتاح
    نصّ الإنجليزيّة) ⟵ الإنجليزيّة. يعيد (ar_map، عدد المترجَم، عدد التكميليّ).
    """
    ar_map, n_ar, n_supp = {}, 0, 0
    for key, val in pk.items():
        en = _en_value(val)
        if en is None:
            continue
        if key in official:
            ar_map[key] = official[key]      # ترجمة رسميّة موجودة (أولى)
            n_ar += 1
        elif en in supp:
            ar_map[key] = supp[en]           # تكميليّ محراب
            n_ar += 1
            n_supp += 1
        else:
            ar_map[key] = en                 # ارتداد إنجليزيّ
    return ar_map, n_ar, n_supp


def main() -> int:
    if len(sys.argv) != 2:
        print("الاستعمال: python patch_extension_nls.py <مسار resources/app>", file=sys.stderr)
        return 2
    app = sys.argv[1]
    ext_dir = os.path.join(app, "extensions")
    if not os.path.isdir(ext_dir):
        print(f"⚠️ لا مجلّد extensions في {app} — تُخطّى ترجمة البيانات.", file=sys.stderr)
        return 0

    # الملفّ التكميليّ (ملكيّة محراب): إنجليزيّ→عربيّ مسطّح.
    supp = {}
    supp_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mihrab_ext_nls_ar.json")
    if os.path.isfile(supp_file):
        try:
            raw = _read_json(supp_file)
            supp = {k: v for k, v in raw.items()
                    if isinstance(k, str) and isinstance(v, str) and v and not k.startswith("//")}
        except (ValueError, OSError) as e:
            print(f"⚠️ الملفّ التكميليّ للبيانات تالف ({supp_file}): {e} — يُتخطّى.", file=sys.stderr)

    # فهرس ملفّات i18n لحزمة اللغة بالاسم الأساس (المفتاح = ${publisher}.${name} عادةً).
    lp_tr_dir = os.path.join(ext_dir, LP_DIR, "translations", "extensions")
    tr_index = {}
    if os.path.isdir(lp_tr_dir):
        for f in os.listdir(lp_tr_dir):
            if f.endswith(".i18n.json"):
                tr_index[f[:-len(".i18n.json")]] = os.path.join(lp_tr_dir, f)

    total_ext = total_keys = total_ar = total_supp = 0
    n_langpack = n_nls_fallback = 0
    for e in sorted(os.listdir(ext_dir)):
        if e.startswith("language-pack"):
            continue
        ed = os.path.join(ext_dir, e)
        pnls = os.path.join(ed, "package.nls.json")
        if not os.path.isfile(pnls):
            continue
        try:
            pk = _read_json(pnls)
        except (ValueError, OSError):
            continue

        # المعرّف الحقيقيّ = publisher.name من package.json (حتميّ)، لا تخمين بلاحقة المجلّد.
        pub_id = None
        try:
            pj = _read_json(os.path.join(ed, "package.json"))
            if isinstance(pj.get("publisher"), str) and isinstance(pj.get("name"), str):
                pub_id = f"{pj['publisher']}.{pj['name']}"
        except (ValueError, OSError):
            pub_id = None
        # الأسبقيّة في المطابقة: المعرّف الحتميّ <publisher>.<name> أوّلًا (يوائم النيّة)،
        # ثمّ التخمينان vscode.<e> واسم المجلّد <e>.
        cand = ([pub_id] if pub_id else []) + [f"vscode.{e}", e]
        i18n_path = next((tr_index[c] for c in cand if c in tr_index), None)

        if i18n_path:
            # المسار الفعليّ: احقن contents.package في ملفّ i18n لحزمة اللغة.
            try:
                doc = _read_json(i18n_path)
            except (ValueError, OSError):
                # ملفّ تالف: تخطَّ (لا تكتب فوقه — الكتابة تفقد contents.dist/main صمتًا).
                print(f"⚠️ ملفّ i18n تالف يُتخطّى: {i18n_path}", file=sys.stderr)
                continue
            contents = doc.setdefault("contents", {})
            if not isinstance(contents, dict):
                contents = doc["contents"] = {}
            official = _existing_pkg(contents)
            ar_map, n_ar, n_supp = _build_map(pk, official, supp)
            if not ar_map:
                continue
            contents["package"] = ar_map
            _write_json_atomic(i18n_path, doc)
            n_langpack += 1
            # احذف أيّ package.nls.ar.json بائت من نهج سابق (كان يُتجاوَز، فلا داعي له).
            stale = os.path.join(ed, "package.nls.ar.json")
            if os.path.isfile(stale):
                os.remove(stale)
        else:
            # لا حزمة لغة لهذا الامتداد ⇒ package.nls.ar.json هو الارتداد الأصيل الصحيح.
            ar_map, n_ar, n_supp = _build_map(pk, {}, supp)
            if not ar_map:
                continue
            _write_json_atomic(os.path.join(ed, "package.nls." + LANG + ".json"), ar_map)
            n_nls_fallback += 1

        total_ext += 1
        total_keys += len(ar_map)
        total_ar += n_ar
        total_supp += n_supp

    pct = (total_ar * 100) // total_keys if total_keys else 0
    print(
        f"✅ حُقِنت ترجمة بيانات الامتدادات: {total_ext} امتداد "
        f"({n_langpack} عبر حزمة اللغة + {n_nls_fallback} عبر package.nls.{LANG}.json)، "
        f"{total_ar}/{total_keys} مفتاح مترجَم ({pct}%) — منها تكميليّ-محراب={total_supp}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
