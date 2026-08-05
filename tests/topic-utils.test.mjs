import test from 'node:test';
import assert from 'node:assert/strict';

import { formatCalendarSyncError, normalizeDisplayTitle, stripTopicPrefix } from '../topic-utils.mjs';

test('stripTopicPrefix removes planner prefix without touching real title', () => {
  assert.equal(stripTopicPrefix('【选题】AI 浏览器开始接管资料整理'), 'AI 浏览器开始接管资料整理');
  assert.equal(stripTopicPrefix('普通标题'), '普通标题');
});

test('normalizeDisplayTitle falls back to trimmed title', () => {
  assert.equal(normalizeDisplayTitle('  【选题】内容创作者的收件箱不是垃圾堆  '), '内容创作者的收件箱不是垃圾堆');
});

test('formatCalendarSyncError extracts first line of Error message', () => {
  assert.equal(formatCalendarSyncError(new Error('lark-cli exited 1\nstack line 2')), 'lark-cli exited 1');
});

test('formatCalendarSyncError accepts plain strings and non-errors', () => {
  assert.equal(formatCalendarSyncError('日历不可写'), '日历不可写');
  assert.equal(formatCalendarSyncError(42), '42');
});

test('formatCalendarSyncError falls back to 未知错误 for empty input', () => {
  assert.equal(formatCalendarSyncError(undefined), '未知错误');
  assert.equal(formatCalendarSyncError(new Error('')), '未知错误');
  assert.equal(formatCalendarSyncError('   \n  '), '未知错误');
});

test('formatCalendarSyncError truncates very long messages to 200 chars', () => {
  const formatted = formatCalendarSyncError(new Error('x'.repeat(300)));
  assert.equal(formatted.length, 201);
  assert.ok(formatted.endsWith('…'));
});
