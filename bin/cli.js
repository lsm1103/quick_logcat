#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 5174;
const URL = `http://localhost:${PORT}`;

function openBrowser(url) {
  const os = platform();
  const cmd = os === 'darwin' ? 'open' : os === 'win32' ? 'cmd' : 'xdg-open';
  const args = os === 'win32' ? ['/c', 'start', '""', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    // 打不开浏览器不影响服务本身，忽略
  }
}

async function isServerUp() {
  try {
    const res = await fetch(URL);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForServerThenOpen() {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isServerUp()) {
      openBrowser(URL);
      return;
    }
  }
}

// 已经有一份在跑：直接打开浏览器，不重复启动
if (await isServerUp()) {
  console.log('Android Log Viewer 已在运行，正在打开浏览器...');
  openBrowser(URL);
  process.exit(0);
}

// adb：mac / linux 下用打包的 install-adb.sh 做检测/自动安装；Windows 交给 server 自己的探测逻辑给出安装提示
if (platform() !== 'win32' && !process.env.ADB_PATH) {
  const installScript = path.join(ROOT, 'install-adb.sh');
  if (existsSync(installScript)) {
    const result = spawnSync(installScript, [], {
      stdio: ['inherit', 'pipe', 'inherit'],
      encoding: 'utf8',
    });
    const resolved = (result.stdout || '').trim();
    if (resolved) process.env.ADB_PATH = resolved;
  }
}

console.log('========================================');
console.log('  Android Log Viewer');
console.log(`  ${URL}`);
console.log('  Ctrl+C 停止服务');
console.log('========================================');

waitForServerThenOpen();
await import(path.join(ROOT, 'server/index.js'));
