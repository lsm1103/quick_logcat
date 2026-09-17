import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine } from '../server/adb.js';

// 这些是纯函数级别的冒烟测试，不依赖真机 / adb，CI 里可直接跑。
// 重点守护「Windows CRLF 行尾导致 Tag、包名解析失败」这个已修复的回归点。

test('parseLine 解析标准 threadtime 行（LF）', () => {
  const e = parseLine('07-17 10:23:45.123  1234  5678 I ActivityManager: Start proc');
  assert.ok(e, '标准行应能解析');
  assert.equal(e.tag, 'ActivityManager');
  assert.equal(e.pid, '1234');
  assert.equal(e.tid, '5678');
  assert.equal(e.level, 'I');
  assert.equal(e.message, 'Start proc');
});

test('parseLine 兼容 Windows CRLF 行尾', () => {
  const e = parseLine('07-17 10:23:45.123  1234  5678 E MyTag: boom\r');
  assert.ok(e, 'CRLF 行不应解析失败（否则 Tag / 包名会全空）');
  assert.equal(e.tag, 'MyTag');
  assert.equal(e.message, 'boom');
});

test('parseLine 兼容四位年份与六位微秒', () => {
  const e = parseLine('2026-07-17 10:23:45.123456  1  2 W Sys: hi');
  assert.ok(e);
  assert.equal(e.tag, 'Sys');
  assert.equal(e.level, 'W');
});

test('parseLine 对非日志行返回 null', () => {
  assert.equal(parseLine('--------- beginning of main'), null);
});
