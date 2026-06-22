# Proma (ai-jiaqian fork) Windows 安装脚本
#
#   irm https://raw.githubusercontent.com/ai-jiaqian/Proma/main/scripts/install.ps1 | iex
#
# 下载最新版安装器并运行。装好后 App 会每 4 小时自动检查更新，无需再跑本脚本。

$ErrorActionPreference = "Stop"
$repo = "ai-jiaqian/Proma"

Write-Host "→ 查询最新版本…"
$headers = @{ "User-Agent" = "proma-installer" }
$rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers $headers
$tag = $rel.tag_name
$asset = $rel.assets | Where-Object { $_.name -like "*.exe" } | Select-Object -First 1

if (-not $asset) {
  Write-Error "未找到 Windows 安装器（.exe）。"
  exit 1
}

Write-Host "  最新版本：$tag"
Write-Host "  下载链接：$($asset.browser_download_url)"

$out = Join-Path $env:TEMP $asset.name
Write-Host "→ 下载中…"
Invoke-WebRequest $asset.browser_download_url -OutFile $out -UseBasicParsing

Write-Host "→ 启动安装器（SmartScreen 拦截时点「更多信息」→「仍要运行」）…"
Start-Process $out

Write-Host "✅ 安装器已启动。装好后 App 会自动检查更新。"
