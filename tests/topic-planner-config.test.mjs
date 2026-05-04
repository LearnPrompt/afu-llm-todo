import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  createDefaultPlannerSettings,
  normalizePlannerSettings,
  resolvePlannerPaths,
} from '../topic-planner-config.mjs';

test('createDefaultPlannerSettings exposes editable relative directories for first-run setup', () => {
  const settings = createDefaultPlannerSettings();

  assert.equal(settings.topicDir, '15_自媒体/选题库');
  assert.equal(settings.inboxDir, '00_收件箱');
  assert.equal(settings.archiveDir, '99_系统/归档/选题占位');
  assert.equal(settings.calendarProvider, 'none');
  assert.equal(settings.macosCalendarName, '');
  assert.equal(settings.wikiMode, 'off');
  assert.equal(settings.wikiDir, '30_研究/内容Wiki');
  assert.equal(settings.wikiIndexPath, '30_研究/内容Wiki/index.md');
  assert.equal(settings.wikiLogPath, '30_研究/内容Wiki/log.md');
  assert.equal(settings.dailyCapacity, 2);
  assert.deepEqual(settings.scheduleTimeSlots, [
    { label: '上午深度', start: '09:30', end: '11:00' },
    { label: '下午制作', start: '14:00', end: '15:30' },
    { label: '晚上发布', start: '20:00', end: '20:30' },
  ]);
});

test('normalizePlannerSettings trims user input and keeps relative directory layout', () => {
  const normalized = normalizePlannerSettings({
    vaultRoot: ' /Users/demo/My Vault/ ',
    topicDir: ' /内容/选题库/ ',
    inboxDir: ' /收件箱/ ',
    archiveDir: ' /归档/选题占位/ ',
    calendarProvider: 'macos',
    macosCalendarName: ' 内容排期 ',
    wikiMode: 'agent',
    wikiDir: ' /研究/内容Wiki/ ',
    wikiIndexPath: ' /研究/内容Wiki/index.md/ ',
    wikiLogPath: ' /研究/内容Wiki/log.md/ ',
    dailyCapacity: '4',
    scheduleTimeSlots: [
      { label: ' 晨间发布 ', start: '08:30', end: '09:00' },
      { label: 'bad', start: '11:00', end: '10:00' },
    ],
  });

  assert.equal(normalized.vaultRoot, '/Users/demo/My Vault');
  assert.equal(normalized.topicDir, '内容/选题库');
  assert.equal(normalized.inboxDir, '收件箱');
  assert.equal(normalized.archiveDir, '归档/选题占位');
  assert.equal(normalized.calendarProvider, 'macos');
  assert.equal(normalized.macosCalendarName, '内容排期');
  assert.equal(normalized.wikiMode, 'agent');
  assert.equal(normalized.wikiDir, '研究/内容Wiki');
  assert.equal(normalized.wikiIndexPath, '研究/内容Wiki/index.md');
  assert.equal(normalized.wikiLogPath, '研究/内容Wiki/log.md');
  assert.equal(normalized.dailyCapacity, 4);
  assert.deepEqual(normalized.scheduleTimeSlots, [
    { label: '晨间发布', start: '08:30', end: '09:00' },
  ]);
});

test('normalizePlannerSettings falls back on unknown calendar provider', () => {
  const normalized = normalizePlannerSettings({
    calendarProvider: 'google',
    wikiMode: 'api',
    dailyCapacity: 0,
    scheduleTimeSlots: [{ label: '', start: '10:00', end: '11:00' }],
  });

  assert.equal(normalized.calendarProvider, 'none');
  assert.equal(normalized.wikiMode, 'off');
  assert.equal(normalized.dailyCapacity, 1);
  assert.deepEqual(normalized.scheduleTimeSlots, [
    { label: '上午深度', start: '09:30', end: '11:00' },
    { label: '下午制作', start: '14:00', end: '15:30' },
    { label: '晚上发布', start: '20:00', end: '20:30' },
  ]);
});

test('resolvePlannerPaths joins vault root with configured directories', () => {
  const resolved = resolvePlannerPaths({
    vaultRoot: '/Users/demo/My Vault',
    topicDir: '内容/选题库',
    inboxDir: '00_收件箱',
    archiveDir: '99_系统/归档/选题占位',
  });

  assert.equal(resolved.topicDir, path.join('/Users/demo/My Vault', '内容/选题库'));
  assert.equal(resolved.inboxDir, path.join('/Users/demo/My Vault', '00_收件箱'));
  assert.equal(resolved.archiveRoot, path.join('/Users/demo/My Vault', '99_系统/归档/选题占位'));
  assert.equal(resolved.wikiRoot, path.join('/Users/demo/My Vault', '30_研究/内容Wiki'));
  assert.equal(resolved.wikiIndexPath, path.join('/Users/demo/My Vault', '30_研究/内容Wiki/index.md'));
  assert.equal(resolved.wikiLogPath, path.join('/Users/demo/My Vault', '30_研究/内容Wiki/log.md'));
});
