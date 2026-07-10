import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildBatchCalendarCleanupScript,
  buildDeleteEventsByTopicScript,
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
