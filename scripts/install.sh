#!/usr/bin/env bash
# Proma (ai-jiaqian fork) macOS 安装 / 更新脚本
#
#   curl -fsSL https://raw.githubusercontent.com/ai-jiaqian/Proma/main/scripts/install.sh | bash
#
# 跑一次：检测最新版 → 本地已是最新则跳过，否则下载安装并绕过 Gatekeeper。
# 选项： --check 只检测不安装；--force 忽略版本对比强制重装。

set -euo pipefail

REPO="ai-jiaqian/Proma"
APP="/Applications/Proma.app"
API="https://api.github.com/repos/${REPO}/releases/latest"

CHECK_ONLY=false
FORCE=false
DRY_RUN=false
for a in "$@"; do
  case "$a" in
    --check) CHECK_ONLY=true ;;
    --force) FORCE=true ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

if [ "$(uname)" != "Darwin" ]; then
  echo "本脚本仅支持 macOS。Windows 请用 install.ps1；本项目无 Linux 构建。" >&2
  exit 1
fi

echo "→ 查询最新版本…"
JSON=$(curl -fsSL "$API")

TAG=$(printf '%s' "$JSON" | grep -o '"tag_name"[^,]*' | head -1 | sed -E 's/.*"tag_name" *: *"([^"]+)".*/\1/')
LATEST="${TAG#v}"
if [ -z "$LATEST" ]; then
  echo "无法解析最新版本号（可能触发 GitHub API 限流，稍后再试）。" >&2
  exit 1
fi

# 选架构对应的 dmg：Apple 芯片取 *-arm64.dmg，Intel 取不含 arm64 的 *.dmg
URL=$(printf '%s' "$JSON" \
  | grep -o '"browser_download_url" *: *"[^"]*\.dmg"' \
  | sed -E 's/.*"(https[^"]+)".*/\1/' \
  | while read -r u; do
      case "$(uname -m)" in
        arm64) case "$u" in *-arm64.dmg) echo "$u"; break;; esac ;;
        *)     case "$u" in *-arm64.dmg) : ;; *.dmg) echo "$u"; break;; esac ;;
      esac
    done)

if [ -z "$URL" ]; then
  echo "未找到匹配当前架构（$(uname -m)）的 DMG。" >&2
  exit 1
fi

# 本地已装版本
INSTALLED=""
if [ -d "$APP" ]; then
  INSTALLED=$(defaults read "$APP/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "")
fi

echo "  最新版本：$LATEST"
echo "  已装版本：${INSTALLED:-未安装}"
echo "  下载链接：$URL"

if [ "$CHECK_ONLY" = true ]; then
  if [ "$INSTALLED" = "$LATEST" ]; then echo "✓ 已是最新。"; else echo "↑ 有新版本可更新。"; fi
  exit 0
fi

if [ "$INSTALLED" = "$LATEST" ] && [ "$FORCE" != true ]; then
  echo "✓ 已是最新（$LATEST），无需更新。需强制重装加 --force。"
  exit 0
fi

TMP=$(mktemp -d)
MNT=""
trap '[ -n "$MNT" ] && hdiutil detach "$MNT" >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
DMG="$TMP/Proma.dmg"

echo "→ 下载中…"
curl -fL --progress-bar "$URL" -o "$DMG"

echo "→ 挂载并安装…"
MNT=$(hdiutil attach "$DMG" -nobrowse -noautoopen | sed -nE 's#.*(/Volumes/.*)#\1#p' | tail -1)
if [ -z "$MNT" ] || [ ! -d "$MNT/Proma.app" ]; then
  echo "挂载失败或 DMG 内未找到 Proma.app。" >&2
  exit 1
fi

if [ "$DRY_RUN" = true ]; then
  DMGVER=$(defaults read "$MNT/Proma.app/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "?")
  echo "  DMG 内 Proma.app 版本：$DMGVER"
  if [ "$DMGVER" = "$LATEST" ]; then
    echo "✅ dry-run 通过：下载/挂载/校验 OK，包内版本与最新一致。未替换 /Applications、未退出 Proma。"
  else
    echo "⚠️ dry-run：包内版本($DMGVER) 与最新($LATEST) 不一致，请检查。" >&2
  fi
  exit 0
fi

# 关闭正在运行的 Proma，避免覆盖时占用
osascript -e 'quit app "Proma"' >/dev/null 2>&1 || true
sleep 3
rm -rf "$APP"
cp -R "$MNT/Proma.app" /Applications/

echo "→ 移除 Gatekeeper 隔离标记…"
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true

echo "✅ 已安装 Proma $LATEST 到 /Applications。直接打开即可（无需右键绕过）。"
