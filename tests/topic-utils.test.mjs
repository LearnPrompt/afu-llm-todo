import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeDisplayTitle, stripTopicPrefix } from '../topic-utils.mjs';

test('stripTopicPrefix removes planner prefix without touching real title', () => {
  assert.equal(stripTopicPrefix('【选题】AI 浏览器开始接管资料整理'), 'AI 浏览器开始接管资料整理');
  assert.equal(stripTopicPrefix('普通标题'), '普通标题');
});

test('normalizeDisplayTitle falls back to trimmed title', () => {
  assert.equal(normalizeDisplayTitle('  【选题】内容创作者的收件箱不是垃圾堆  '), '内容创作者的收件箱不是垃圾堆');
});
