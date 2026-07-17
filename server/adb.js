import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

const INSTALL_HINT =
  '未检测到 adb（Android Debug Bridge）。\n' +
  '请安装 Android SDK Platform Tools：https://developer.android.com/tools/releases/platform-tools\n' +
  '安装后请确保 adb 在 PATH 中，或将其放入默认 SDK 目录（如 macOS 的 ~/Library/Android/sdk/platform-tools），然后重新启动本工具。';

// 按平台列出常见的 Android SDK 安装位置，找不到 PATH 里的 adb 时兜底探测
function candidateSdkPaths() {
  const os = platform();
  const exe = os === 'win32' ? 'adb.exe' : 'adb';
  const roots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT].filter(Boolean);
  if (os === 'win32') {
    if (process.env.LOCALAPPDATA) roots.push(join(process.env.LOCALAPPDATA, 'Android', 'Sdk'));
  } else if (os === 'darwin') {
    roots.push(join(homedir(), 'Library', 'Android', 'sdk'));
  } else {
    roots.push(join(homedir(), 'Android', 'Sdk'));
  }
  return roots.map((root) => join(root, 'platform-tools', exe));
}

// 探测结果只需算一次：{ ok: true, path } 或 { ok: false, message }
let adbState = null;

export async function initAdb() {
  if (adbState) return adbState;

  if (process.env.ADB_PATH) {
    adbState = { ok: true, path: process.env.ADB_PATH };
    return adbState;
  }

  try {
    await execFileAsync('adb', ['version']);
    adbState = { ok: true, path: 'adb' };
    return adbState;
  } catch {
    // adb 不在 PATH 里，继续往下探测常见 SDK 目录
  }

  for (const p of candidateSdkPaths()) {
    if (existsSync(p)) {
      adbState = { ok: true, path: p };
      return adbState;
    }
  }

  adbState = { ok: false, message: INSTALL_HINT };
  return adbState;
}

export function getAdbStatus() {
  return adbState;
}

function requireAdbPath() {
  if (!adbState) throw new Error('adb 尚未初始化，请先调用 initAdb()');
  if (!adbState.ok) throw new Error(adbState.message);
  return adbState.path;
}

export async function listDevices() {
  const adbPath = requireAdbPath();
  const { stdout } = await execFileAsync(adbPath, ['devices', '-l']);
  const lines = stdout.split('\n').slice(1);
  const devices = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [serial, state, ...rest] = trimmed.split(/\s+/);
    if (state !== 'device') continue;
    const meta = {};
    for (const part of rest) {
      const idx = part.indexOf(':');
      if (idx > 0) meta[part.slice(0, idx)] = part.slice(idx + 1);
    }
    devices.push({ serial, state, model: meta.model || '', product: meta.product || '' });
  }
  return devices;
}

// 解析 threadtime 格式：[YYYY-]MM-DD HH:MM:SS.mmm[mmm] PID TID LEVEL TAG: MESSAGE
// 兼容 6 位微秒、4 位年份开头
const LINE_RE = /^(?:\d{4}-)?(\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}\.\d{3,6})\s+(\d+)\s+(\d+)\s+([VDIWEFSA])\s+([^:]*?):\s?(.*)$/;

export function parseLine(line) {
  const m = line.match(LINE_RE);
  if (!m) return null;
  return {
    date: m[1],
    time: m[2],
    pid: m[3],
    tid: m[4],
    level: m[5],
    tag: m[6].trim(),
    message: m[7],
  };
}

// 维护 PID → 包名 的映射，定时刷新
async function fetchPidMap(serial) {
  const args = [];
  if (serial) args.push('-s', serial);
  args.push('shell', 'ps', '-A', '-o', 'PID,NAME');
  try {
    const adbPath = requireAdbPath();
    const { stdout } = await execFileAsync(adbPath, args, { maxBuffer: 8 * 1024 * 1024 });
    const map = new Map();
    const lines = stdout.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('PID')) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) continue;
      const pid = parts[0];
      const name = parts[parts.length - 1];
      if (/^\d+$/.test(pid)) map.set(pid, name);
    }
    return map;
  } catch {
    return new Map();
  }
}

export function startLogcat(serial, onLine, onError, onClose) {
  const adbPath = requireAdbPath();
  // -b all 拿到所有日志缓冲区；-T 1 只从当前时间开始，避免一连接就 dump 上百万行
  const args = [];
  if (serial) args.push('-s', serial);
  args.push('logcat', '-b', 'all', '-v', 'threadtime', '-T', '1');

  const child = spawn(adbPath, args);
  // 关键：让 stdout 自己处理 UTF-8 多字节字符的边界，避免 │ 等字符被切坏
  child.stdout.setEncoding('utf8');

  let pidMap = new Map();
  let pidMapTimer = null;
  const refreshPidMap = async () => {
    pidMap = await fetchPidMap(serial);
  };
  refreshPidMap();
  pidMapTimer = setInterval(refreshPidMap, 3000);

  let buffer = '';

  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const raw of lines) {
      if (!raw) continue;
      const parsed = parseLine(raw);
      const entry = parsed || {
        raw,
        level: 'I',
        tag: '',
        message: raw,
        pid: '',
        tid: '',
        date: '',
        time: '',
      };
      entry.pkg = entry.pid ? pidMap.get(entry.pid) || '' : '';
      onLine(entry);
    }
  });

  child.stderr.on('data', (chunk) => {
    onError?.(chunk.toString('utf8'));
  });

  child.on('close', (code) => {
    if (pidMapTimer) clearInterval(pidMapTimer);
    onClose?.(code);
  });

  return child;
}
