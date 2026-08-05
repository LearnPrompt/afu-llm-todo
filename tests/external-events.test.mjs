import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { spawnPlannerServer } from './helpers/spawn-server.mjs';
import { buildLarkStubScript } from './helpers/lark-stub.mjs';

async function writeFakeOsascript(lines) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'afu-osascript-'));
  const scriptPath = path.join(dir, 'osascript');
  const content = ['#!/bin/bash', "cat <<'SCRIPT_EOF'", ...lines, 'SCRIPT_EOF', ''].join('\n');
  await fs.writeFile(scriptPath, content);
  await fs.chmod(scriptPath, 0o755);
  return { dir, scriptPath };
}

test('GET /api/calendar/external-events rejects missing/invalid/out-of-order/too-wide date ranges', async () => {
  const server = await spawnPlannerServer();
  try {
    const missing = await server.request('/api/calendar/external-events');
    assert.equal(missing.status, 400);

    const missingEnd = await server.request('/api/calendar/external-events?start=2026-07-14');
    assert.equal(missingEnd.status, 400);

    const badFormat = await server.request('/api/calendar/external-events?start=notadate&end=2026-07-14');
    assert.equal(badFormat.status, 400);

    const reversed = await server.request('/api/calendar/external-events?start=2026-07-20&end=2026-07-14');
    assert.equal(reversed.status, 400);

    const tooWide = await server.request('/api/calendar/external-events?start=2026-01-01&end=2026-03-05');
    assert.equal(tooWide.status, 400);
  } finally {
    await server.close();
  }
});

test('GET /api/calendar/external-events short-circuits to empty events without touching any CLI when no sources are configured', async () => {
  const server = await spawnPlannerServer();
  try {
    const { status, json } = await server.request('/api/calendar/external-events?start=2026-07-14&end=2026-07-15');
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.ok, true);
    assert.deepEqual(json.events, []);
    assert.deepEqual(json.warnings, []);
    assert.deepEqual(json.sources, { lark: [], macos: [] });

    const stubLog = await server.readStubLog();
    assert.equal(stubLog.trim(), '', 'no lark-cli invocation should happen when no lark source is configured');
  } finally {
    await server.close();
  }
});

test('GET /api/calendar/external-events pulls lark agenda events and filters out ones already imported as topic cards', async () => {
  const larkStub = buildLarkStubScript({
    responses: {
      'calendar +agenda --start': JSON.stringify({
        ok: true,
        data: [
          {
            event_id: 'evt_1',
            summary: '晨会',
            start_time: { datetime: '2026-07-14T09:00:00+08:00', timezone: 'Asia/Shanghai' },
            end_time: { datetime: '2026-07-14T09:30:00+08:00', timezone: 'Asia/Shanghai' },
            free_busy_status: 'busy',
          },
          {
            event_id: 'evt_2',
            summary: '午餐',
            start_time: { datetime: '2026-07-14T12:00:00+08:00', timezone: 'Asia/Shanghai' },
            end_time: { datetime: '2026-07-14T13:00:00+08:00', timezone: 'Asia/Shanghai' },
            free_busy_status: 'busy',
          },
          {
            event_id: 'evt_dup',
            summary: '已导入的事件',
            start_time: { datetime: '2026-07-15T10:00:00+08:00', timezone: 'Asia/Shanghai' },
            end_time: { datetime: '2026-07-15T11:00:00+08:00', timezone: 'Asia/Shanghai' },
            free_busy_status: 'busy',
          },
        ],
        meta: {},
        _notice: '',
      }),
    },
  });

  const server = await spawnPlannerServer({
    larkStub,
    settings: { externalLarkCalendarIds: ['cal_ext'] },
  });
  try {
    await server.writeTopicCard('【选题】已导入.md', [
      'type: topic',
      'topic_id: topic-dup-1',
      'status: active',
      'stage: 已排期',
      'scheduled_date: 2026-07-15',
      'scheduled_start: "10:00"',
      'scheduled_end: "11:00"',
      'calendar_provider: lark',
      'lark_event_id: evt_dup',
    ]);

    const { status, json } = await server.request('/api/calendar/external-events?start=2026-07-14&end=2026-07-15');
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.events.length, 2, JSON.stringify(json.events));

    const ids = json.events.map((event) => event.eventId).sort();
    assert.deepEqual(ids, ['evt_1', 'evt_2']);

    const morning = json.events.find((event) => event.eventId === 'evt_1');
    assert.equal(morning.source, 'lark');
    assert.equal(morning.calendarLabel, 'cal_ext');
    assert.equal(morning.title, '晨会');
    assert.equal(morning.date, '2026-07-14');
    assert.equal(morning.start, '09:00');
    assert.equal(morning.end, '09:30');
    assert.equal(morning.allDay, false);
    assert.equal(morning.freeBusy, 'busy');

    assert.deepEqual(json.sources, { lark: ['cal_ext'], macos: [] });
  } finally {
    await server.close();
  }
});

test('GET /api/calendar/external-events surfaces lark-cli failures as a warning without failing the request', async () => {
  const larkStub = buildLarkStubScript({
    responses: { 'calendar +agenda --start': 'boom' },
    failures: ['calendar +agenda --start'],
  });
  const server = await spawnPlannerServer({
    larkStub,
    settings: { externalLarkCalendarIds: ['cal_ext'] },
  });
  try {
    const { status, json } = await server.request('/api/calendar/external-events?start=2026-07-14&end=2026-07-15');
    assert.equal(status, 200, JSON.stringify(json));
    assert.deepEqual(json.events, []);
    assert.equal(json.warnings.length, 1);
    assert.equal(json.warnings[0].source, 'lark');
  } finally {
    await server.close();
  }
});

test('GET /api/calendar/external-events caches lark results so repeated requests only hit the CLI once', async () => {
  const larkStub = buildLarkStubScript({
    responses: {
      'calendar +agenda --start': JSON.stringify({
        ok: true,
        data: [
          {
            event_id: 'evt_cached',
            summary: '缓存事件',
            start_time: { datetime: '2026-07-14T09:00:00+08:00', timezone: 'Asia/Shanghai' },
            end_time: { datetime: '2026-07-14T09:30:00+08:00', timezone: 'Asia/Shanghai' },
            free_busy_status: 'busy',
          },
        ],
      }),
    },
  });
  const server = await spawnPlannerServer({
    larkStub,
    settings: { externalLarkCalendarIds: ['cal_ext'] },
  });
  try {
    const first = await server.request('/api/calendar/external-events?start=2026-07-14&end=2026-07-15');
    assert.equal(first.status, 200, JSON.stringify(first.json));
    const second = await server.request('/api/calendar/external-events?start=2026-07-14&end=2026-07-15');
    assert.equal(second.status, 200, JSON.stringify(second.json));

    const stubLog = await server.readStubLog();
    const agendaCalls = stubLog.split('\n').filter((line) => line.includes('+agenda')).length;
    assert.equal(agendaCalls, 1, `expected exactly 1 +agenda call, got:\n${stubLog}`);
  } finally {
    await server.close();
  }
});

test('GET /api/calendar/external-events lists macOS calendar events, marking all-day events and filtering topic-marked ones', async () => {
  const alldayLine = ['工作', 'uid-allday', 'All day event', 'true', '2026', '7', '14', '0', '0', '2026', '7', '14', '0', '0', 'false'].join('\t');
  const topicMarkedLine = ['工作', 'uid-topic', 'Synced event', 'false', '2026', '7', '14', '9', '0', '2026', '7', '14', '10', '0', 'true'].join('\t');
  const { dir, scriptPath } = await writeFakeOsascript([alldayLine, topicMarkedLine]);

  const server = await spawnPlannerServer({
    settings: { externalMacosCalendarNames: ['工作'] },
    extraEnv: { OSASCRIPT_PATH: scriptPath },
  });
  try {
    const { status, json } = await server.request('/api/calendar/external-events?start=2026-07-14&end=2026-07-15');
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.events.length, 1, JSON.stringify(json.events));

    const [event] = json.events;
    assert.equal(event.source, 'macos');
    assert.equal(event.eventId, 'uid-allday');
    assert.equal(event.allDay, true);
    assert.equal(event.date, '2026-07-14');
    assert.equal(event.start, '');
    assert.equal(event.end, '');

    assert.deepEqual(json.sources, { lark: [], macos: ['工作'] });
  } finally {
    await server.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('GET /api/calendar/external-events expands all-day and cross-day events into per-day entries', async () => {
  const larkStub = buildLarkStubScript({
    responses: {
      'calendar +agenda --start': JSON.stringify({
        ok: true,
        data: [
          {
            event_id: 'evt_allday',
            summary: '全天事件',
            start_time: { date: '2026-07-16' },
            end_time: { date: '2026-07-16' },
          },
          {
            event_id: 'evt_cross',
            summary: '跨天事件',
            start_time: { datetime: '2026-07-16T22:00:00+08:00', timezone: 'Asia/Shanghai' },
            end_time: { datetime: '2026-07-17T01:00:00+08:00', timezone: 'Asia/Shanghai' },
          },
        ],
      }),
    },
  });
  const server = await spawnPlannerServer({
    larkStub,
    settings: { externalLarkCalendarIds: ['cal_multi'] },
  });
  try {
    const { status, json } = await server.request('/api/calendar/external-events?start=2026-07-16&end=2026-07-17');
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.events.length, 3, JSON.stringify(json.events));

    const alldayEntries = json.events.filter((event) => event.eventId === 'evt_allday');
    assert.equal(alldayEntries.length, 1);
    assert.equal(alldayEntries[0].date, '2026-07-16');
    assert.equal(alldayEntries[0].allDay, true);
    assert.equal(alldayEntries[0].start, '');
    assert.equal(alldayEntries[0].end, '');

    const crossEntries = json.events
      .filter((event) => event.eventId === 'evt_cross')
      .sort((a, b) => a.date.localeCompare(b.date));
    assert.equal(crossEntries.length, 2);
    assert.equal(crossEntries[0].date, '2026-07-16');
    assert.equal(crossEntries[0].start, '22:00');
    assert.equal(crossEntries[0].end, '');
    assert.equal(crossEntries[1].date, '2026-07-17');
    assert.equal(crossEntries[1].start, '');
    assert.equal(crossEntries[1].end, '01:00');
  } finally {
    await server.close();
  }
});
