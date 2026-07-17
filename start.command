#!/usr/bin/env bash
set -euo pipefail

# 双击时 CWD 是 ~，必须先切到脚本所在目录
cd "$(dirname "$0")"
DIR="$(pwd)"

# node 运行时已移到项目外部（adb 不再随包分发，由 server 自动探测系统 adb）
RUNTIME_ROOT="$HOME/Desktop/xm_project/code/ai_tools/pkg/android_log_runtime"

# ── 选择对应架构的 runtime ──────────────────────────────────────────────────
ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
  RUNTIME="$RUNTIME_ROOT/arm64"
else
  RUNTIME="$RUNTIME_ROOT/x64"
fi

NODE="$RUNTIME/node"

# ── adb：配置好的位置 → PATH → 常见 SDK 目录，都找不到就交互式下载安装 ──────────
ADB_CANDIDATE="$RUNTIME/adb"
ADB_RESOLVED="$("$DIR/install-adb.sh" "$ADB_CANDIDATE")"
if [[ -n "$ADB_RESOLVED" ]]; then
  export ADB_PATH="$ADB_RESOLVED"
fi

# ── 端口占用检查（已有实例直接打开浏览器）──────────────────────────────────
if lsof -i:5174 -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Android Log Viewer 已在运行，正在打开浏览器..."
  open "http://localhost:5174"
  exit 0
fi

# ── 等服务器就绪后自动打开浏览器 ────────────────────────────────────────────
(
  for _ in $(seq 1 30); do
    sleep 0.5
    if curl -sf "http://localhost:5174/" >/dev/null 2>&1; then
      open "http://localhost:5174"
      break
    fi
  done
) &

echo "========================================"
echo "  Android Log Viewer"
echo "  http://localhost:5174"
echo "  关闭此窗口即可停止服务"
echo "========================================"
echo ""

# 首次运行 macOS 可能提示"无法验证开发者"，请右键 → 打开
exec "$NODE" "$DIR/server/index.js"
