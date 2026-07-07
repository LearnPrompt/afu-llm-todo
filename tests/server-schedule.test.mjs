import test from 'node:test';
import assert from 'node:assert/strict';

import { spawnPlannerServer } from './helpers/spawn-server.mjs';

// 回归:外部日历操作失败时,本地 Markdown 必须仍然落盘(PR #1 blocker:
// formatCalendarSyncError 未定义导致 catch 二次抛 ReferenceError,连本地都不保存)。
// 触发方式:卡片带旧 lark 事件,排期时切换 provider 到 macos,
// deleteCalendarEventsExcept 会先删 lark 事件——stub lark-cli 必然失败并抛错,
// 正好落进 scheduleTopic 的同步 catch,且全程不碰 osascript/TCC。
test('schedule keeps local markdown when external calendar sync fails', async () => {
  const server = await spawnPlannerServer();
  try {
    const relPath = await server.writeTopicCard('【选题】降级测试卡.md', [
      'type: topic',
      'topic_id: topic-degrade-1',
      'status: active',
      'stage: 已转卡',
      'calendar_provider: lark',
      'lark_calendar_id: fake-calendar-id',
      'lark_event_id: fake-event-id',
    ]);

    const { status, json } = await server.request('/api/topics/schedule', {
      method: 'POST',
      body: JSON.stringify({
        path: relPath,
        scheduledDate: '2026-07-08',
        scheduledStart: '09:30',
        scheduledEnd: '10:30',
        calendarProvider: 'macos',
      }),
    });

    assert.equal(status, 200, `expected degraded success, got ${status}: ${JSON.stringify(json)}`);

    const saved = await server.readTopicCard('【选题】降级测试卡.md');
    assert.ok(saved.includes('scheduled_date: 2026-07-08'), 'scheduled_date must be persisted to disk');
    assert.ok(saved.includes('同步失败'), 'calendar_sync_status failure must be persisted to disk');
  } finally {
    await server.close();
  }
});

// 对照组:纯 Markdown 排期本来就应该成功。
test('schedule succeeds with markdown-only provider', async () => {
  const server = await spawnPlannerServer();
  try {
    const relPath = await server.writeTopicCard('【选题】纯本地卡.md', [
      'type: topic',
      'topic_id: topic-md-1',
      'status: active',
      'stage: 已转卡',
    ]);

    const { status } = await server.request('/api/topics/schedule', {
      method: 'POST',
      body: JSON.stringify({
        path: relPath,
        scheduledDate: '2026-07-09',
        scheduledStart: '14:00',
        scheduledEnd: '15:30',
        calendarProvider: 'none',
      }),
    });
    assert.equal(status, 200);

    const saved = await server.readTopicCard('【选题】纯本地卡.md');
    assert.ok(saved.includes('scheduled_date: 2026-07-09'));
    assert.ok(saved.includes('calendar_sync_status: 未同步'));
  } finally {
    await server.close();
  }
});
