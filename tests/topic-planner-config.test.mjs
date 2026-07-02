import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  createDefaultPlannerSettings,
  getVaultProfile,
  normalizePlannerSettings,
  resolvePlannerPaths,
} from '../topic-planner-config.mjs';

test('createDefaultPlannerSettings exposes editable relative directories for first-run setup', () => {
  const settings = createDefaultPlannerSettings();

  assert.equal(settings.topicDir, '40_行动卡片');
  assert.equal(settings.inboxDir, '00_收件箱');
  assert.equal(settings.archiveDir, '99_系统/归档/行动卡片');
  assert.deepEqual(settings.vaultProfiles, {});
  assert.equal(settings.calendarProvider, 'none');
  assert.equal(settings.macosCalendarName, '');
  assert.equal(settings.wikiMode, 'off');
  assert.equal(settings.wikiDir, '30_整理Wiki');
  assert.equal(settings.wikiIndexPath, '30_整理Wiki/index.md');
  assert.equal(settings.wikiLogPath, '30_整理Wiki/log.md');
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

test('normalizePlannerSettings keeps complete per-Vault directory profiles', () => {
  const normalized = normalizePlannerSettings({
    vaultProfiles: {
      '/Users/demo/Work Vault/': {
        topicDir: '/内容/选题库/',
        inboxDir: '/收件箱/',
        archiveDir: '/归档/行动卡片/',
        wikiDir: '/研究/Wiki/',
        wikiIndexPath: '/研究/Wiki/index.md/',
        wikiLogPath: '/研究/Wiki/log.md/',
      },
      relative: {
        topicDir: 'topics',
        inboxDir: 'inbox',
        archiveDir: 'archive',
      },
      '/Users/demo/Escapes': {
        topicDir: '../topics',
        inboxDir: 'inbox',
        archiveDir: 'archive',
      },
    },
  });

  assert.deepEqual(normalized.vaultProfiles, {
    '/Users/demo/Work Vault': {
      topicDir: '内容/选题库',
      inboxDir: '收件箱',
      archiveDir: '归档/行动卡片',
      wikiDir: '研究/Wiki',
      wikiIndexPath: '研究/Wiki/index.md',
      wikiLogPath: '研究/Wiki/log.md',
    },
  });
});

test('normalizePlannerSettings keeps Obsidian directories inside the Vault', () => {
  const normalized = normalizePlannerSettings({
    topicDir: '../escape',
    inboxDir: 'safe/inbox',
    archiveDir: '../../archive',
    wikiDir: '../wiki',
  });

  assert.equal(normalized.topicDir, '40_行动卡片');
  assert.equal(normalized.inboxDir, 'safe/inbox');
  assert.equal(normalized.archiveDir, '99_系统/归档/行动卡片');
  assert.equal(normalized.wikiDir, '30_整理Wiki');
});

test('getVaultProfile restores a saved Vault mapping', () => {
  const profile = getVaultProfile({
    vaultProfiles: {
      '/Users/demo/Study Vault': {
        topicDir: '学习/行动卡片',
        inboxDir: '学习/收件箱',
        archiveDir: '学习/归档',
        wikiDir: '学习/Wiki',
        wikiIndexPath: '学习/Wiki/index.md',
        wikiLogPath: '学习/Wiki/log.md',
      },
    },
  }, '/Users/demo/Study Vault');

  assert.deepEqual(profile, {
    topicDir: '学习/行动卡片',
    inboxDir: '学习/收件箱',
    archiveDir: '学习/归档',
    wikiDir: '学习/Wiki',
    wikiIndexPath: '学习/Wiki/index.md',
    wikiLogPath: '学习/Wiki/log.md',
  });
});

test('getVaultProfile treats the active legacy Vault settings as configured', () => {
  const profile = getVaultProfile({
    workspaceMode: 'obsidian',
    vaultRoot: '/Users/demo/Existing Vault',
    topicDir: '40_行动卡片',
    inboxDir: '00_收件箱',
    archiveDir: '99_系统/归档/行动卡片',
  }, '/Users/demo/Existing Vault');

  assert.deepEqual(profile, {
    topicDir: '40_行动卡片',
    inboxDir: '00_收件箱',
    archiveDir: '99_系统/归档/行动卡片',
    wikiDir: '30_整理Wiki',
    wikiIndexPath: '30_整理Wiki/index.md',
    wikiLogPath: '30_整理Wiki/log.md',
  });
});

test('getVaultProfile returns null for a Vault that has not been configured', () => {
  assert.equal(getVaultProfile({
    workspaceMode: 'obsidian',
    vaultRoot: '/Users/demo/Existing Vault',
    topicDir: '40_行动卡片',
    inboxDir: '00_收件箱',
    archiveDir: '99_系统/归档/行动卡片',
  }, '/Users/demo/New Vault'), null);
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
  assert.equal(resolved.wikiRoot, path.join('/Users/demo/My Vault', '30_整理Wiki'));
  assert.equal(resolved.wikiIndexPath, path.join('/Users/demo/My Vault', '30_整理Wiki/index.md'));
  assert.equal(resolved.wikiLogPath, path.join('/Users/demo/My Vault', '30_整理Wiki/log.md'));
});
