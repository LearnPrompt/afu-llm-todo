import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBatchCalendarCleanupScript,
  buildDeleteEventsByTopicScript,
  buildListEventsScript,
  parseMacOSEventLines,
  planCalendarCleanup,
  toAppleScriptString,
} from '../macos-calendar.mjs';

test('buildDeleteEventsByTopicScript matches topic_id as a whole paragraph, not a prefix', () => {
  const script = buildDeleteEventsByTopicScript('20');
  assert.ok(script.includes('set targetLine to "topic_id: 20"'));
  assert.ok(script.includes('whose description contains targetLine'));
  assert.ok(script.includes('paragraphs of ((description of candidateEvent) as string)) contains targetLine'));
});

test('buildDeleteEventsByTopicScript escapes quotes and backslashes in topic id', () => {
  const script = buildDeleteEventsByTopicScript('a"b\\c');
  assert.ok(script.includes('set targetLine to "topic_id: a\\"b\\\\c"'));
});

test('toAppleScriptString converts newlines to linefeed concatenation', () => {
  assert.equal(toAppleScriptString('line1\nline2'), '"line1" & linefeed & "line2"');
});

test('planCalendarCleanup adds topic sweep when macos uid is missing but card touched macos', () => {
  const actions = planCalendarCleanup({
    topic_id: 'topic-1',
    macos_event_id: '',
    macos_calendar_name: 'Default',
    calendar_provider: 'none',
    lark_event_id: '',
  });
  assert.deepEqual(actions, [{ type: 'macos-topic-sweep', topicId: 'topic-1' }]);
});

test('planCalendarCleanup keeps uid delete and adds sweep when uid exists', () => {
  const actions = planCalendarCleanup({
    topic_id: 'topic-1',
    macos_event_id: 'uid-123',
    macos_calendar_name: 'Default',
    calendar_provider: 'macos',
    lark_event_id: '',
  });
  assert.deepEqual(actions, [
    { type: 'macos-uid', eventUid: 'uid-123' },
    { type: 'macos-topic-sweep', topicId: 'topic-1' },
  ]);
});

test('planCalendarCleanup does not sweep macos calendars for lark-only cards', () => {
  const actions = planCalendarCleanup({
    topic_id: 'topic-1',
    macos_event_id: '',
    macos_calendar_name: '',
    calendar_provider: 'lark',
    lark_event_id: 'lark-evt-1',
  });
  assert.deepEqual(actions, [{ type: 'lark' }]);
});

test('planCalendarCleanup returns nothing for never-synced cards', () => {
  assert.deepEqual(planCalendarCleanup({ topic_id: 'topic-1', calendar_provider: 'none' }), []);
  assert.deepEqual(planCalendarCleanup({}), []);
});

test('buildBatchCalendarCleanupScript merges uids and topic sweeps into one script', () => {
  const script = buildBatchCalendarCleanupScript({
    eventUids: ['uid-1', 'uid-2'],
    topicIds: ['topic-1'],
  });
  assert.ok(script.includes('set targetUids to {"uid-1", "uid-2"}'));
  assert.ok(script.includes('set targetLines to {"topic_id: topic-1"}'));
  assert.ok(script.includes('whose uid is (targetUid as string)'));
  assert.ok(script.includes('paragraphs of ((description of candidateEvent) as string)) contains (targetLine as string)'));
});

test('buildBatchCalendarCleanupScript escapes quotes and drops empty entries', () => {
  const script = buildBatchCalendarCleanupScript({
    eventUids: ['a"b', '', null],
    topicIds: ['', 'x\\y'],
  });
  assert.ok(script.includes('set targetUids to {"a\\"b"}'));
  assert.ok(script.includes('set targetLines to {"topic_id: x\\\\y"}'));
});

test('buildBatchCalendarCleanupScript tolerates empty input', () => {
  const script = buildBatchCalendarCleanupScript();
  assert.ok(script.includes('set targetUids to {}'));
  assert.ok(script.includes('set targetLines to {}'));
});

test('buildListEventsScript embeds calendar names, the window date components, and the 300 hard cap', () => {
  const script = buildListEventsScript({
    calendarNames: ['工作', '生活'],
    startDate: '2026-07-14',
    endDate: '2026-07-16',
  });

  assert.ok(script.includes('"工作"'));
  assert.ok(script.includes('"生活"'));
  // windowStart at startDate 00:00
  assert.ok(script.includes('set year of windowStart to 2026'));
  assert.ok(script.includes('set day of windowStart to 14'));
  // windowEnd rolls to the day *after* endDate (exclusive upper bound)
  assert.ok(script.includes('set year of windowEnd to 2026'));
  assert.ok(script.includes('set day of windowEnd to 17'));
  assert.ok(script.includes('start date < windowEnd and end date > windowStart'));
  assert.ok(script.includes('maxLines to 300'));
});

test('buildListEventsScript rolls the window end over a month/year boundary', () => {
  const script = buildListEventsScript({
    calendarNames: ['工作'],
    startDate: '2026-12-30',
    endDate: '2026-12-31',
  });

  assert.ok(script.includes('set year of windowEnd to 2027'));
  assert.ok(script.includes('set month of windowEnd to January'));
  assert.ok(script.includes('set day of windowEnd to 1'));
});

test('parseMacOSEventLines parses a normal timed event line', () => {
  const line = ['工作', 'uid-1', 'Standup', 'false', '2026', '7', '14', '9', '5', '2026', '7', '14', '9', '30', 'false'].join('\t');
  const events = parseMacOSEventLines(line);
  assert.deepEqual(events, [{
    calendarName: '工作',
    uid: 'uid-1',
    title: 'Standup',
    allDay: false,
    startDate: '2026-07-14',
    startTime: '09:05',
    endDate: '2026-07-14',
    endTime: '09:30',
    hasTopicMarker: false,
  }]);
});

test('parseMacOSEventLines blanks out times for an all-day event', () => {
  const line = ['生活', 'uid-2', 'Birthday', 'true', '2026', '7', '14', '0', '0', '2026', '7', '15', '0', '0', 'false'].join('\t');
  const [event] = parseMacOSEventLines(line);
  assert.equal(event.allDay, true);
  assert.equal(event.startTime, '');
  assert.equal(event.endTime, '');
  assert.equal(event.startDate, '2026-07-14');
  assert.equal(event.endDate, '2026-07-15');
});

test('parseMacOSEventLines flags events carrying a topic_id marker', () => {
  const line = ['工作', 'uid-3', 'Synced', 'false', '2026', '7', '14', '9', '0', '2026', '7', '14', '10', '0', 'true'].join('\t');
  const [event] = parseMacOSEventLines(line);
  assert.equal(event.hasTopicMarker, true);
});

test('parseMacOSEventLines skips malformed lines and blank lines', () => {
  const goodLine = ['工作', 'uid-4', 'OK', 'false', '2026', '7', '14', '9', '0', '2026', '7', '14', '10', '0', 'false'].join('\t');
  const shortLine = ['工作', 'uid-5', 'Bad'].join('\t');
  const output = [goodLine, '', shortLine, '   '].join('\n');
  const events = parseMacOSEventLines(output);
  assert.equal(events.length, 1);
  assert.equal(events[0].uid, 'uid-4');
});

test('parseMacOSEventLines pads single-digit month/day/hour/minute components', () => {
  const line = ['工作', 'uid-6', 'Pad', 'false', '2026', '1', '5', '9', '5', '2026', '1', '5', '9', '5', 'false'].join('\t');
  const [event] = parseMacOSEventLines(line);
  assert.equal(event.startDate, '2026-01-05');
  assert.equal(event.startTime, '09:05');
});
