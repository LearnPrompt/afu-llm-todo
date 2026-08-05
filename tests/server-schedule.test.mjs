import test from 'node:test';
import assert from 'node:assert/strict';

import { spawnPlannerServer } from './helpers/spawn-server.mjs';
import { buildLarkStubScript } from './helpers/lark-stub.mjs';

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

// 一组可用的飞书 lark-cli 假响应:授权有效、探测主日历成功,create/delete 按需覆盖。
function larkAvailabilityResponses(overrides = {}) {
  return {
    'auth status': JSON.stringify({ identities: { user: { tokenStatus: 'valid' } } }),
    'calendar calendars primary': JSON.stringify({
      data: { calendars: [{ calendar: { calendar_id: 'cal_primary', summary: '主日历' } }] },
    }),
    ...overrides,
  };
}

// Phase 1「飞书目标日历选择」:settings.larkCalendarId 配置为 cal_B 时,
// 新排期应该直接写入 cal_B,而不是主日历。
test('schedule syncs to the configured lark target calendar (cal_B)', async () => {
  const larkStub = buildLarkStubScript({
    responses: larkAvailabilityResponses({
      'calendar events create': JSON.stringify({ event: { event_id: 'evt_new' } }),
    }),
  });
  const server = await spawnPlannerServer({
    settings: { calendarProvider: 'lark', larkCalendarId: 'cal_B', larkCalendarName: 'Cal B' },
    larkStub,
  });
  try {
    const relPath = await server.writeTopicCard('【选题】目标日历卡.md', [
      'type: topic',
      'topic_id: topic-target-cal-1',
      'status: active',
      'stage: 已转卡',
    ]);

    const { status, json } = await server.request('/api/topics/schedule', {
      method: 'POST',
      body: JSON.stringify({
        path: relPath,
        scheduledDate: '2026-07-10',
        scheduledStart: '09:30',
        scheduledEnd: '10:30',
        calendarProvider: 'lark',
      }),
    });
    assert.equal(status, 200, JSON.stringify(json));

    const saved = await server.readTopicCard('【选题】目标日历卡.md');
    assert.ok(saved.includes('lark_calendar_id: cal_B'), 'frontmatter must record the configured target calendar');
    assert.ok(saved.includes('calendar_sync_status: 已同步'));

    const stubLines = (await server.readStubLog()).split('\n').filter(Boolean);
    const createCall = stubLines.find((line) => line.startsWith('calendar events create'));
    assert.ok(createCall, 'expected a create call in the stub log');
    assert.ok(createCall.includes('cal_B'), `create call should target cal_B: ${createCall}`);
  } finally {
    await server.close();
  }
});

// 迁移场景:卡片原来挂在 cal_A 上的事件,目标日历切到 cal_B 后重新排期,
// 应该先删掉 cal_A 上的旧事件,再在 cal_B 上建新事件。
test('rescheduling migrates an existing lark event from cal_A to cal_B', async () => {
  const larkStub = buildLarkStubScript({
    responses: larkAvailabilityResponses({
      'calendar events delete': '',
      'calendar events create': JSON.stringify({ event: { event_id: 'evt_2' } }),
    }),
  });
  const server = await spawnPlannerServer({
    settings: { calendarProvider: 'lark', larkCalendarId: 'cal_B', larkCalendarName: 'Cal B' },
    larkStub,
  });
  try {
    const relPath = await server.writeTopicCard('【选题】迁移测试卡.md', [
      'type: topic',
      'topic_id: topic-migrate-1',
      'status: active',
      'stage: 已排期',
      'calendar_provider: lark',
      'lark_calendar_id: cal_A',
      'lark_event_id: evt_1',
      'scheduled_date: 2026-07-01',
      'scheduled_start: 09:00',
      'scheduled_end: 10:00',
    ]);

    const { status, json } = await server.request('/api/topics/schedule', {
      method: 'POST',
      body: JSON.stringify({
        path: relPath,
        scheduledDate: '2026-07-11',
        scheduledStart: '09:30',
        scheduledEnd: '10:30',
        calendarProvider: 'lark',
      }),
    });
    assert.equal(status, 200, JSON.stringify(json));

    const saved = await server.readTopicCard('【选题】迁移测试卡.md');
    assert.ok(saved.includes('lark_calendar_id: cal_B'));
    assert.ok(saved.includes('lark_event_id: evt_2'));

    const stubLines = (await server.readStubLog()).split('\n').filter(Boolean);
    const deleteIndex = stubLines.findIndex((line) => line.startsWith('calendar events delete'));
    const createIndex = stubLines.findIndex((line) => line.startsWith('calendar events create'));
    assert.ok(deleteIndex !== -1, 'expected a delete call');
    assert.ok(createIndex !== -1, 'expected a create call');
    assert.ok(deleteIndex < createIndex, 'delete must happen before create during migration');
    assert.ok(stubLines[deleteIndex].includes('cal_A'), `delete call should target cal_A: ${stubLines[deleteIndex]}`);
    assert.ok(stubLines[deleteIndex].includes('evt_1'), `delete call should target evt_1: ${stubLines[deleteIndex]}`);
    assert.ok(stubLines[createIndex].includes('cal_B'), `create call should target cal_B: ${stubLines[createIndex]}`);
  } finally {
    await server.close();
  }
});

// 迁移的删除步骤失败不应该挡住整个排期:旧事件删不掉只记警告,
// 新事件照样在目标日历建出来,卡片落盘状态仍是"已同步"。
test('rescheduling still succeeds when deleting the stale lark event fails', async () => {
  const larkStub = buildLarkStubScript({
    responses: larkAvailabilityResponses({
      'calendar events delete': 'stub: delete failed',
      'calendar events create': JSON.stringify({ event: { event_id: 'evt_3' } }),
    }),
    failures: ['calendar events delete'],
  });
  const server = await spawnPlannerServer({
    settings: { calendarProvider: 'lark', larkCalendarId: 'cal_B', larkCalendarName: 'Cal B' },
    larkStub,
  });
  try {
    const relPath = await server.writeTopicCard('【选题】迁移失败测试卡.md', [
      'type: topic',
      'topic_id: topic-migrate-2',
      'status: active',
      'stage: 已排期',
      'calendar_provider: lark',
      'lark_calendar_id: cal_A',
      'lark_event_id: evt_1',
      'scheduled_date: 2026-07-01',
      'scheduled_start: 09:00',
      'scheduled_end: 10:00',
    ]);

    const { status, json } = await server.request('/api/topics/schedule', {
      method: 'POST',
      body: JSON.stringify({
        path: relPath,
        scheduledDate: '2026-07-12',
        scheduledStart: '11:00',
        scheduledEnd: '12:00',
        calendarProvider: 'lark',
      }),
    });
    assert.equal(status, 200, JSON.stringify(json));

    const saved = await server.readTopicCard('【选题】迁移失败测试卡.md');
    assert.ok(saved.includes('lark_calendar_id: cal_B'));
    assert.ok(saved.includes('calendar_sync_status: 已同步'));
  } finally {
    await server.close();
  }
});
