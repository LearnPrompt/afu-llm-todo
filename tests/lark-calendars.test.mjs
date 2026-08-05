import test from 'node:test';
import assert from 'node:assert/strict';

import { spawnPlannerServer } from './helpers/spawn-server.mjs';
import { buildLarkStubScript } from './helpers/lark-stub.mjs';

test('GET /api/lark/calendars only marks owner/writer calendars as writable', async () => {
  const larkStub = buildLarkStubScript({
    responses: {
      'calendar calendars list': JSON.stringify({
        data: {
          calendar_list: [
            { calendar_id: 'cal_owner', summary: '我的主日历', type: 'primary', role: 'owner' },
            { calendar_id: 'cal_writer', summary: '团队共享日历', summary_alias: '团队日历', type: 'shared', role: 'writer' },
            { calendar_id: 'cal_reader', summary: '只读共享日历', type: 'shared', role: 'reader' },
            { calendar_id: 'cal_google', summary: 'Google 日历', type: 'google', role: 'owner', is_third_party: true },
          ],
          has_more: false,
        },
      }),
    },
  });
  const server = await spawnPlannerServer({ larkStub });
  try {
    const { status, json } = await server.request('/api/lark/calendars');
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.ok, true);
    assert.equal(json.calendars.length, 4);

    const writableIds = json.writableCalendars.map((calendar) => calendar.id).sort();
    assert.deepEqual(writableIds, ['cal_owner', 'cal_writer']);

    const writerCalendar = json.calendars.find((calendar) => calendar.id === 'cal_writer');
    assert.equal(writerCalendar.summary, '团队日历', 'summary_alias should win over summary');
  } finally {
    await server.close();
  }
});

test('GET /api/lark/calendars surfaces lark-cli failures as an error response', async () => {
  // Default stub (no override) always exits non-zero — mirrors the existing
  // fail-fast fixture used across the suite.
  const server = await spawnPlannerServer();
  try {
    const { status, json } = await server.request('/api/lark/calendars');
    assert.ok(status >= 500 || json?.ok === false, `expected an error shape, got ${status}: ${JSON.stringify(json)}`);
  } finally {
    await server.close();
  }
});

test('POST /api/settings persists larkCalendarId/larkCalendarName and GET reads them back', async () => {
  const server = await spawnPlannerServer();
  try {
    const before = await server.request('/api/settings');
    assert.equal(before.status, 200);
    assert.equal(before.json.settings.larkCalendarId, '');
    assert.equal(before.json.settings.larkCalendarName, '');

    const payload = {
      ...before.json.settings,
      calendarProvider: 'lark',
      larkCalendarId: 'cal_target',
      larkCalendarName: '目标日历',
    };
    const posted = await server.request('/api/settings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    assert.equal(posted.status, 200, JSON.stringify(posted.json));
    assert.equal(posted.json.settings.larkCalendarId, 'cal_target');
    assert.equal(posted.json.settings.larkCalendarName, '目标日历');

    const after = await server.request('/api/settings');
    assert.equal(after.status, 200);
    assert.equal(after.json.settings.larkCalendarId, 'cal_target');
    assert.equal(after.json.settings.larkCalendarName, '目标日历');
  } finally {
    await server.close();
  }
});
