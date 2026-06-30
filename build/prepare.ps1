#!/usr/bin/env pwsh
# تحضير بناء محراب (م0) — نظير ويندوز لـprepare.sh.
# يستنسخ المنبع المثبَّت في upstream.json ويطبّق رُقَع الطبقة الثالثة. لا يبني.
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$UpstreamJson = Join-Path $Root 'upstream.json'
$Work = Join-Path $Root '.upstream'

$pin = Get-Content $UpstreamJson -Raw | ConvertFrom-Json
$repo = $pin.vscodium.repo
$tag  = $pin.vscodium.tag

if (-not $repo -or -not $tag) {
    Write-Error "تعذّر قراءة تثبيت المنبع من $UpstreamJson"
}

Write-Host "▶ المنبع المثبَّت: $repo @ $tag"

if (Test-Path (Join-Path $Work '.git')) {
    Write-Host "▶ تحديث شجرة المنبع الموجودة إلى $tag"
    git -C $Work fetch --depth 1 origin "refs/tags/${tag}:refs/tags/${tag}"
    git -C $Work checkout -f $tag
} else {
    Write-Host "▶ استنساخ المنبع (depth=1) عند $tag"
    if (Test-Path $Work) { Remove-Item -Recurse -Force $Work }
    git clone --depth 1 --branch $tag $repo $Work
}

$patches = Get-ChildItem -Path (Join-Path $Root 'patches') -Filter '*.patch' -ErrorAction SilentlyContinue
if ($patches) {
    Write-Host "▶ تطبيق $($patches.Count) رُقعة (الطبقة الثالثة)"
    foreach ($p in $patches) {
        Write-Host "  - $($p.Name)"
        git -C $Work apply --3way $p.FullName
    }
} else {
    Write-Host "▶ لا رُقَع بعد (م0: بناء نظيف بلا تعديل نواة)."
}

Write-Host "✅ شجرة المنبع جاهزة في: $Work"
Write-Host "   التالي: اتبع توثيق بناء المنبع (راجع build/README.md)."
