#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""حقن ترجمة بيانات الامتدادات المدمجة (package.nls.ar.json) — مساهمة بناء (الطبقة 2).

السبب الجذريّ: مفاتيح `package.nls.json` (عناوين الأوامر، أوصاف الإعدادات، تسميات
القوائم — الأعلى ظهورًا في «الإعدادات» و«لوحة الأوامر») لا تغطّيها حزمة اللغة المنبعيّة
(1.85) إلّا جزئيًّا (~23%). النواة تحلّ ترجمة البيان عبر `getLocalizedMessages` التي
تبحث عن `package.nls.<locale>.json` بجانب `package.nls.json` وترتدّ للإنجليزيّة —
آليّة أصيلة مستقلّة عن كاش حزمة اللغة (CLP).

الحلّ: نكتب `package.nls.ar.json` **كاملًا** لكلّ امتداد وقت البناء = لكلّ مفتاح:
  ترجمة حزمة اللغة إن وُجدت ⟵ وإلّا التكميليّ (بمفتاح نصّ الإنجليزيّة) ⟵ وإلّا الإنجليزيّة.
كامل ⇒ لا انحدار مهما كانت أسبقيّة الحلّ؛ idempotent (يُشتَقّ حتميًّا في كلّ تشغيل من
package.nls.json الإنجليزيّ الثابت). لا يمسّ package.nls.json الأصليّ.

الاستعمال: python patch_extension_nls.py <مسار resources/app>
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


def _en_value(v):
    """قيمة package.nls قد تكون نصًّا أو {message, comment}."""
    if isinstance(v, dict):
        return v.get("message")
    return v if isinstance(v, str) else None


def _pkg_bundle(i18n):
    """يستخرج حزمة «package» (ترجمة البيان) من ملفّ i18n لحزمة اللغة."""
    contents = i18n.get("contents", {}) if isinstance(i18n, dict) else {}
    pkg = contents.get("package", {})
    out = {}
    for k, v in pkg.items():
        s = v if isinstance(v, str) else (v.get("message") if isinstance(v, dict) else None)
        if isinstance(s, str) and s:
            out[k] = s
    return out


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

    # فهرس ملفّات i18n لحزمة اللغة بالاسم الأساس (يُطابَق لاحقًا بالأسبقيّة:
    # vscode.<e> ⟵ <publisher>.<name> ⟵ اسم المجلّد <e>).
    lp_tr_dir = os.path.join(ext_dir, "language-pack-ar", "translations", "extensions")
    tr_index = {}
    if os.path.isdir(lp_tr_dir):
        for f in os.listdir(lp_tr_dir):
            if f.endswith(".i18n.json"):
                tr_index[f[:-len(".i18n.json")]] = os.path.join(lp_tr_dir, f)

    total_ext = total_keys = total_ar = total_supp = 0
    written = 0
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
        # حزمة اللغة لهذا الامتداد (إن وُجدت). المعرّف الحقيقيّ = publisher.name من
        # package.json (حتميّ)، لا تخمين بلاحقة اسم المجلّد (قد يطابق امتدادًا آخر).
        pub_id = None
        try:
            pkg_json = _read_json(os.path.join(ed, "package.json"))
            pub, nm = pkg_json.get("publisher"), pkg_json.get("name")
            if isinstance(pub, str) and isinstance(nm, str):
                pub_id = f"{pub}.{nm}"
        except (ValueError, OSError):
            pub_id = None
        # الأسبقيّة: vscode.<e> ⟵ <publisher>.<name> ⟵ اسم المجلّد <e>.
        cand = [f"vscode.{e}"] + ([pub_id] if pub_id else []) + [e]
        lp_pkg = {}
        for c in cand:
            if c in tr_index:
                try:
                    lp_pkg = _pkg_bundle(_read_json(tr_index[c]))
                except (ValueError, OSError):
                    lp_pkg = {}
                break

        ar_map = {}
        n_ar = n_supp = 0
        for key, val in pk.items():
            en = _en_value(val)
            if en is None:
                continue
            if key in lp_pkg:
                ar_map[key] = lp_pkg[key]
                n_ar += 1
            elif en in supp:
                ar_map[key] = supp[en]
                n_ar += 1
                n_supp += 1
            else:
                ar_map[key] = en  # ارتداد إنجليزيّ (يبقى النصّ الأصليّ)
        if not ar_map:
            continue
        total_ext += 1
        total_keys += len(ar_map)
        total_ar += n_ar
        total_supp += n_supp
        # كتابة ذرّيّة لـpackage.nls.ar.json (بجانب package.nls.json).
        out_path = os.path.join(ed, "package.nls.ar.json")
        tmp = out_path + ".tmp"
        with open(tmp, "w", encoding="utf-8", newline="") as f:
            json.dump(ar_map, f, ensure_ascii=False)
        os.replace(tmp, out_path)
        written += 1

    pct = (total_ar * 100) // total_keys if total_keys else 0
    print(
        f"✅ حُقِنت ترجمة بيانات الامتدادات: {written} ملفّ package.nls.ar.json، "
        f"{total_ar}/{total_keys} مفتاح مترجَم ({pct}%) — منها تكميليّ-محراب={total_supp}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
