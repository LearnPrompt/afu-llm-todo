import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { spawnPlannerServer } from './helpers/spawn-server.mjs';

function localDateString(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

test('complete archives the card as 已发布 and completed-week can find it', async () => {
  const server = await spawnPlannerServer();
  try {
    const today = localDateString();
    const cardPath = await server.writeTopicCard('【选题】锐评 codex 16 大功能.md', [
      'type: topic',
      'topic_id: topic-codex-review',
      'status: active',
      'stage: 已排期',
      `scheduled_date: ${today}`,
      'scheduled_start: "20:00"',
      'scheduled_end: "20:30"',
    ], '今晚录完就算交付。');

    const { status, json } = await server.request('/api/topics/complete', {
      method: 'POST',
      body: JSON.stringify({ path: cardPath }),
    });
    assert.equal(status, 200);
    assert.equal(json.completed, true);
    assert.ok(json.archivePath, 'archivePath returned');

    // 原文件应该被搬走
    await assert.rejects(server.readTopicCard('【选题】锐评 codex 16 大功能.md'));

    // 归档目录出现留底文件,stage 已发布 + completed_date 落盘
    const archived = await fs.readFile(path.join(server.vaultRoot, json.archivePath), 'utf8');
    assert.ok(archived.includes('stage: 已发布'));
    assert.ok(archived.includes(`completed_date: ${today}`));
    assert.ok(archived.includes('今晚录完就算交付'));

    // 本周已完成查询能找到这张卡
    const week = await server.request(
      `/api/topics/completed-week?start=${localDateString(-3)}&end=${localDateString(3)}`,
    );
    assert.equal(week.status, 200);
    const hit = week.json.topics.find((t) => t.title.includes('锐评 codex 16 大功能'));
    assert.ok(hit, 'completed card appears in completed-week');
    assert.equal(hit.scheduledDate, today);
    assert.equal(hit.scheduledStart, '20:00');
    assert.equal(hit.completedDate, today);
  } finally {
    await server.close();
  }
});

test('complete works for an unscheduled backlog card via completed_date fallback', async () => {
  const server = await spawnPlannerServer();
  try {
    const today = localDateString();
    const cardPath = await server.writeTopicCard('【选题】没排期直接做完的卡.md', [
      'type: topic',
      'topic_id: topic-no-schedule',
      'status: active',
      'stage: 待排期',
    ], '顺手做完了。');

    const { status } = await server.request('/api/topics/complete', {
      method: 'POST',
      body: JSON.stringify({ path: cardPath }),
    });
    assert.equal(status, 200);

    const week = await server.request(
      `/api/topics/completed-week?start=${today}&end=${today}`,
    );
    assert.equal(week.status, 200);
    const hit = week.json.topics.find((t) => t.title.includes('没排期直接做完的卡'));
    assert.ok(hit, 'unscheduled card matched by completed_date');
    assert.equal(hit.scheduledDate, '');
  } finally {
    await server.close();
  }
});

test('complete rejects a card that is already finished, and requires a path', async () => {
  const server = await spawnPlannerServer();
  try {
    const cardPath = await server.writeTopicCard('【选题】已经发布过的卡.md', [
      'type: topic',
      'topic_id: topic-done-already',
      'status: active',
      'stage: 已发布',
    ], '之前就发过了。');

    const again = await server.request('/api/topics/complete', {
      method: 'POST',
      body: JSON.stringify({ path: cardPath }),
    });
    assert.ok(again.status >= 400, `already-finished card rejected, got ${again.status}`);

    const missing = await server.request('/api/topics/complete', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.ok(missing.status >= 400, `missing path rejected, got ${missing.status}`);
  } finally {
    await server.close();
  }
});

test('completed-week validates date params', async () => {
  const server = await spawnPlannerServer();
  try {
    const bad = await server.request('/api/topics/completed-week?start=oops&end=2026-07-19');
    assert.ok(bad.status >= 400);

    const empty = await server.request('/api/topics/completed-week?start=2020-01-01&end=2020-01-07');
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.json.topics, []);
  } finally {
    await server.close();
  }
});
