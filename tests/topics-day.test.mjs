import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { spawnPlannerServer } from './helpers/spawn-server.mjs';

test('day endpoint buckets scheduled, overdue and daily inbox correctly', async () => {
  const server = await spawnPlannerServer();
  try {
    const today = '2026-07-07';

    await server.writeTopicCard('【选题】今天要做.md', [
      'type: topic',
      'topic_id: topic-today-1',
      'status: active',
      'stage: 已排期',
      `scheduled_date: ${today}`,
      'scheduled_start: "09:30"',
      'scheduled_end: "10:30"',
    ]);
    await server.writeTopicCard('【选题】昨天欠的.md', [
      'type: topic',
      'topic_id: topic-overdue-1',
      'status: active',
      'stage: 已排期',
      'scheduled_date: 2026-07-01',
      'scheduled_start: "14:00"',
      'scheduled_end: "15:00"',
    ]);
    await server.writeTopicCard('【选题】还没排期.md', [
      'type: topic',
      'topic_id: topic-unscheduled-1',
      'status: active',
      'stage: 待排期',
    ]);
    await server.writeTopicCard('【选题】早就发布了.md', [
      'type: topic',
      'topic_id: topic-published-1',
      'status: done',
      'stage: 已发布',
      'scheduled_date: 2026-07-01',
    ]);

    const inboxDayDir = path.join(server.vaultRoot, server.inboxDir, today);
    await fs.mkdir(inboxDayDir, { recursive: true });
    await fs.writeFile(path.join(inboxDayDir, '新素材.md'), [
      '# 一条足够长的新素材',
      '',
      '这里是今天新进收件箱的素材正文,长度要超过候选过滤的最小阈值,',
      '所以多写几句话,确保它会被 analyzeInboxCandidates 识别为有效候选。',
      '来源: https://example.com/some-article',
    ].join('\n'));

    const { status, json } = await server.request(`/api/topics/day?date=${today}`);
    assert.equal(status, 200);
    assert.equal(json.date, today);
    assert.equal(json.scheduled.length, 1, 'exactly one card scheduled today');
    assert.equal(json.scheduled[0].topicId, 'topic-today-1');
    assert.equal(json.overdue.length, 1, 'published/unscheduled cards must not count as overdue');
    assert.equal(json.overdue[0].topicId, 'topic-overdue-1');
    assert.equal(json.inboxCandidates.length, 1, 'daily inbox picks up only the date folder');
    assert.equal(json.summary.scheduledCount, 1);
    assert.equal(json.summary.overdueCount, 1);
    assert.equal(json.summary.inboxCount, 1);
  } finally {
    await server.close();
  }
});

test('day endpoint rejects malformed dates', async () => {
  const server = await spawnPlannerServer();
  try {
    const { status } = await server.request('/api/topics/day?date=07-07-2026');
    assert.equal(status, 400);
  } finally {
    await server.close();
  }
});

test('day endpoint defaults to a valid local date when date is omitted', async () => {
  const server = await spawnPlannerServer();
  try {
    const { status, json } = await server.request('/api/topics/day');
    assert.equal(status, 200);
    assert.match(json.date, /^\d{4}-\d{2}-\d{2}$/);
  } finally {
    await server.close();
  }
});
