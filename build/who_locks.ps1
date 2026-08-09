# ‏من يُمسك هذا الملفّ؟ — عبر Restart Manager (rstrtmgr.dll)، بلا صلاحيّات مرتفعة.
#
# لماذا سكربتٌ منفصل: رسالةُ القفل في build.sh كانت تقول «أغلق أيّ نسخة محراب قيد
# التشغيل» — وقِيس أنّ المُمسِك كان **عمليّةَ خدمةٍ تابعة لـVS Code** ولا نسخةَ محرابٍ
# تعمل. رسالةٌ تسمّي سببًا خاطئًا أسوأُ من رسالةٍ صامتة: تُرسِل القارئَ إلى فحصٍ
# لا يجد فيه شيئًا، فيستنتج أنّ الخطأ عرضيّ.
#
# الخرجُ سطرٌ لكلّ مالك: «<PID><TAB><اسم التطبيق>». لا عربيّةَ في هذا الملفّ لأنّ
# PowerShell 5.1 يقرأ ‎.ps1‎ بترميز النظام (cp1255 هنا) فيتلف كلَّ محرفٍ غيرِ ASCII،
# ويصير تحليلُ السكربت نفسِه خطأً نحويًّا. الصياغةُ العربيّة في bash المُنادي.
param([Parameter(Mandatory=$true)][string]$Path)

$src = @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class MihrabRM {
  [StructLayout(LayoutKind.Sequential)] public struct FILETIME { public uint lo; public uint hi; }
  [StructLayout(LayoutKind.Sequential)] public struct RM_UNIQUE_PROCESS { public int dwProcessId; public FILETIME ProcessStartTime; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct RM_PROCESS_INFO {
    public RM_UNIQUE_PROCESS Process;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=256)] public string strAppName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=64)] public string strServiceShortName;
    public int ApplicationType; public uint AppStatus; public uint TSSessionId;
    [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
  }
  [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] static extern int RmStartSession(out uint h, int flags, string key);
  [DllImport("rstrtmgr.dll")] static extern int RmEndSession(uint h);
  [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)] static extern int RmRegisterResources(uint h, uint nf, string[] files, uint na, RM_UNIQUE_PROCESS[] apps, uint ns, string[] svc);
  [DllImport("rstrtmgr.dll")] static extern int RmGetList(uint h, out uint needed, ref uint n, [In,Out] RM_PROCESS_INFO[] info, ref uint reason);
  public static List<string> Who(string path) {
    var res = new List<string>(); uint h;
    if (RmStartSession(out h, 0, Guid.NewGuid().ToString()) != 0) return res;
    try {
      if (RmRegisterResources(h, 1, new[]{path}, 0, null, 0, null) != 0) return res;
      uint needed = 0, n = 0, reason = 0;
      RmGetList(h, out needed, ref n, null, ref reason);
      if (needed == 0) return res;
      var arr = new RM_PROCESS_INFO[needed]; n = needed;
      if (RmGetList(h, out needed, ref n, arr, ref reason) != 0) return res;
      for (int i = 0; i < n; i++) res.Add(arr[i].Process.dwProcessId + "\t" + arr[i].strAppName);
    } finally { RmEndSession(h); }
    return res;
  }
}
"@
try { Add-Type -TypeDefinition $src -Language CSharp -ErrorAction Stop } catch { exit 0 }
# UTF-8 on the way out. Measured: the app name comes back from Restart Manager as
# real Unicode, then the console codepage (cp1255 here) turns every Arabic letter
# into "?" before bash ever sees it - so the caller printed "PID 18352 - ?????".
# A message whose whole purpose is to NAME the holder must not lose the name.
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }
try { [MihrabRM]::Who($Path) | ForEach-Object { $_ } } catch { }
