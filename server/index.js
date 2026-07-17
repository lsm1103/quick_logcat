import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { listDevices, startLogcat, initAdb, getAdbStatus } from './adb.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const PORT = process.env.PORT || 5174;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const adbStatus = await initAdb();
if (adbStatus.ok) {
  console.log(`[adb] 使用 ${adbStatus.path}`);
} else {
  console.warn(`\n[adb] ${adbStatus.message}\n`);
}

const app = express();
app.use(cors());
app.use(express.json());

// portable 模式：伺服 vite build 产物（dev 时 client/dist 不存在，跳过）
const clientDist = path.join(__dirname, '../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

app.get('/api/adb-status', (_req, res) => {
  res.json(getAdbStatus());
});

app.get('/api/devices', async (_req, res) => {
  try {
    const devices = await listDevices();
    res.json({ devices });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
});

const wss = new WebSocketServer({ server, path: '/ws/logcat' });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const serial = url.searchParams.get('serial') || '';

  console.log(`[ws] client connected, serial="${serial}"`);

  let batch = [];
  let flushTimer = null;
  const flush = () => {
    if (batch.length === 0) return;
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'logs', items: batch }));
    }
    batch = [];
  };
  const scheduleFlush = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, 50);
  };

  let child;
  let deviceWatchTimer = null;
  let aliveTimer = null;

  const sendSafe = (obj) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
  };

  try {
    child = startLogcat(
      serial,
      (entry) => {
        batch.push(entry);
        if (batch.length >= 200) flush();
        else scheduleFlush();
      },
      (errMsg) => {
        sendSafe({ type: 'stderr', message: errMsg });
      },
      (code) => {
        sendSafe({ type: 'closed', code });
        // logcat 子进程退出（多半是设备断了或 adb 杀了），主动关闭 ws
        try { ws.close(); } catch {}
      },
    );
  } catch (e) {
    sendSafe({ type: 'error', message: e.message });
    ws.close();
    return;
  }

  // 每 2 秒看一下选中的设备是否还在线，不在了就主动通知前端并关闭 ws
  deviceWatchTimer = setInterval(async () => {
    try {
      const devices = await listDevices();
      const stillOnline = serial
        ? devices.some((d) => d.serial === serial)
        : devices.length > 0;
      if (!stillOnline) {
        sendSafe({ type: 'device_lost', serial });
        try { ws.close(); } catch {}
      }
    } catch {
      // ignore transient adb errors
    }
  }, 2000);

  // ws 保活 ping，浏览器睡眠/网络故障可以更快感知
  aliveTimer = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;
    try { ws.ping(); } catch {}
  }, 15000);

  ws.on('close', () => {
    console.log('[ws] client disconnected, killing logcat');
    if (flushTimer) clearTimeout(flushTimer);
    if (deviceWatchTimer) clearInterval(deviceWatchTimer);
    if (aliveTimer) clearInterval(aliveTimer);
    child?.kill('SIGTERM');
  });
});
