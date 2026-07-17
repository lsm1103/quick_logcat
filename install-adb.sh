#!/usr/bin/env bash
# 检测 / 自动安装 adb（Android Debug Bridge）。
#
# 用法：./install-adb.sh [已知的 adb 候选路径]
#
# 查找顺序：调用方传入的候选路径 → PATH 里的 adb → 常见 Android SDK 默认目录。
# 全都找不到时，会询问是否从 Google 官方地址下载 Platform Tools 并安装到默认 SDK 目录。
#
# 找到或安装成功：把 adb 的绝对路径打印到 stdout（其余状态信息在 stderr，不影响 stdout 结果）。
# 找不到也装不上：stdout 不输出任何内容，exit code 仍是 0（由调用方决定如何处理）。
set -euo pipefail

log() {
  echo "[install-adb] $*" >&2
}

MANUAL_URL="https://developer.android.com/tools/releases/platform-tools"
CANDIDATE="${1:-}"

# 1. 调用方传入的已知候选路径（比如随包分发的 runtime 目录）
if [[ -n "$CANDIDATE" && -x "$CANDIDATE" ]]; then
  log "使用已配置的 adb：$CANDIDATE"
  echo "$CANDIDATE"
  exit 0
fi

# 2. PATH 里的 adb
if command -v adb >/dev/null 2>&1; then
  FOUND="$(command -v adb)"
  log "使用 PATH 中的 adb：$FOUND"
  echo "$FOUND"
  exit 0
fi

# 3. 常见 SDK 默认目录
OS="$(uname -s)"
case "$OS" in
  Darwin) DEFAULT_SDK="$HOME/Library/Android/sdk" ;;
  *)      DEFAULT_SDK="$HOME/Android/Sdk" ;;
esac
SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$DEFAULT_SDK}}"
SDK_ADB="$SDK_ROOT/platform-tools/adb"

if [[ -x "$SDK_ADB" ]]; then
  log "使用 SDK 默认目录里的 adb：$SDK_ADB"
  echo "$SDK_ADB"
  exit 0
fi

log "系统里没有找到 adb。"

case "$OS" in
  Darwin) PLATFORM="darwin" ;;
  Linux)  PLATFORM="linux" ;;
  *)
    log "当前系统（$OS）不支持自动安装，请手动前往 $MANUAL_URL 下载安装。"
    exit 0
    ;;
esac

ZIP_URL="https://dl.google.com/android/repository/platform-tools-latest-${PLATFORM}.zip"

# 支持 ADB_INSTALL_YES=1 跳过交互确认（比如脚本化 / CI 场景），默认必须交互确认才会下载
if [[ "${ADB_INSTALL_YES:-}" != "1" ]]; then
  if [[ ! -t 0 ]]; then
    log "非交互环境，跳过自动下载安装。请手动安装：$MANUAL_URL"
    exit 0
  fi
  read -r -p "[install-adb] 未检测到 adb，是否从 Google 官方地址下载并安装到 $SDK_ROOT ？(约 10MB) [y/N] " REPLY
  if [[ ! "$REPLY" =~ ^[Yy]$ ]]; then
    log "已取消。请手动安装：$MANUAL_URL"
    exit 0
  fi
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
TMP_ZIP="$TMP_DIR/platform-tools.zip"

log "正在从 $ZIP_URL 下载..."
if ! curl -fSL "$ZIP_URL" -o "$TMP_ZIP"; then
  log "下载失败，请检查网络后重试，或手动安装：$MANUAL_URL"
  exit 0
fi

mkdir -p "$SDK_ROOT"
log "正在解压到 $SDK_ROOT ..."
if ! unzip -oq "$TMP_ZIP" -d "$SDK_ROOT"; then
  log "解压失败，请手动安装：$MANUAL_URL"
  exit 0
fi

if [[ ! -x "$SDK_ADB" ]]; then
  log "解压后没有找到可执行的 adb（$SDK_ADB），请手动安装：$MANUAL_URL"
  exit 0
fi

chmod +x "$SDK_ADB"

if ! "$SDK_ADB" version >/dev/null 2>&1; then
  log "adb 装好了但无法正常运行，请手动安装：$MANUAL_URL"
  exit 0
fi

log "安装成功：$SDK_ADB"
echo "$SDK_ADB"
