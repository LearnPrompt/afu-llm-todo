import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { spawnPlannerServer } from './helpers/spawn-server.mjs';

test('dispose-batch archives multiple cards in one request', async () => {
  const server = await spawnPlannerServer();
  try {
    const cardA = await server.writeTopicCard('【选题】批量删A.md', [
      'type: topic',
      'topic_id: topic-batch-a',
      'status: active',
      'stage: 待排期',
    ], '批量删除对象 A。');
    const cardB = await server.writeTopicCard('【选题】批量删B.md', [
      'type: topic',
      'topic_id: topic-batch-b',
      'status: active',
      'stage: 待排期',
    ], '批量删除对象 B。');

    const { status, json } = await server.request('/api/topics/dispose-batch', {
      method: 'POST',
      body: JSON.stringify({
        paths: [cardA, cardB],
        action: '过期归档',
        reason: '批量清理测试',
        removeFromCalendar: false,
      }),
    });
    assert.equal(status, 200);
    assert.equal(json.disposed.length, 2);
    assert.equal(json.failed.length, 0);

    await assert.rejects(server.readTopicCard('【选题】批量删A.md'));
    await assert.rejects(server.readTopicCard('【选题】批量删B.md'));
    const year = String(new Date().getFullYear());
    const archiveDir = path.join(server.vaultRoot, '99_系统/归档/行动卡片', year);
    const archived = await fs.readdir(archiveDir);
    assert.equal(archived.filter((name) => name.includes('批量删')).length, 2);
  } finally {
    await server.close();
  }
});

test('dispose-batch keeps rejected cards in place and reports per-card failures', async () => {
  const server = await spawnPlannerServer();
  try {
    const card = await server.writeTopicCard('【选题】批量拒绝.md', [
      'type: topic',
      'topic_id: topic-batch-reject',
      'status: active',
      'stage: 待排期',
    ]);

    const { status, json } = await server.request('/api/topics/dispose-batch', {
      method: 'POST',
      body: JSON.stringify({
        paths: [card, '40_行动卡片/不存在的卡.md'],
        action: '拒绝',
        reason: '批量拒绝测试',
        removeFromCalendar: false,
      }),
    });
    assert.equal(status, 200);
    assert.deepEqual(json.disposed, [card]);
    assert.equal(json.failed.length, 1);
    assert.equal(json.failed[0].path, '40_行动卡片/不存在的卡.md');

    const kept = await server.readTopicCard('【选题】批量拒绝.md');
    assert.ok(kept.includes('stage: 已拒绝'));
  } finally {
    await server.close();
  }
});

test('dispose-batch validates inputs', async () => {
  const server = await spawnPlannerServer();
  try {
    const empty = await server.request('/api/topics/dispose-batch', {
      method: 'POST',
      body: JSON.stringify({ paths: [], action: '过期归档', reason: 'x' }),
    });
    assert.equal(empty.status, 400);

    const noReason = await server.request('/api/topics/dispose-batch', {
      method: 'POST',
      body: JSON.stringify({ paths: ['a.md'], action: '过期归档', reason: '' }),
    });
    assert.equal(noReason.status, 400);
  } finally {
    await server.close();
  }
});
