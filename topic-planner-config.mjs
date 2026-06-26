import path from 'node:path';
import { promises as fs } from 'node:fs';

const CONFIG_FILENAME = 'topic-planner.config.json';
const DEFAULT_DIRS = {
  topicDir: '15_自媒体/选题库',
  inboxDir: '00_收件箱',
  archiveDir: '99_系统/归档/选题占位',
  wikiDir: '30_研究/内容Wiki',
  wikiIndexPath: '30_研究/内容Wiki/index.md',
  wikiLogPath: '30_研究/内容Wiki/log.md',
};

const DEFAULT_CALENDAR = {
  calendarProvider: 'none',
  macosCalendarName: '',
};

const DEFAULT_WIKI = {
  wikiMode: 'off',
};

const DEFAULT_WORKSPACE = {
  workspaceMode: 'obsidian',
};

const DEFAULT_SCHEDULE = {
  dailyCapacity: 2,
  scheduleTimeSlots: [
    { label: '上午深度', start: '09:30', end: '11:00' },
    { label: '下午制作', start: '14:00', end: '15:30' },
    { label: '晚上发布', start: '20:00', end: '20:30' },
  ],
};

function defaultVaultRoot(projectRoot = process.cwd()) {
  if (process.env.TOPIC_PLANNER_VAULT_ROOT) {
    return path.resolve(process.env.TOPIC_PLANNER_VAULT_ROOT);
  }
  return path.resolve(projectRoot, '../../..');
}

function createDefaultPlannerSettings(projectRoot = process.cwd()) {
  return {
    vaultRoot: defaultVaultRoot(projectRoot),
    ...DEFAULT_WORKSPACE,
    ...DEFAULT_DIRS,
    ...DEFAULT_CALENDAR,
    ...DEFAULT_WIKI,
    ...DEFAULT_SCHEDULE,
  };
}

function trimTrailingSlashes(value) {
  return String(value || '').trim().replace(/[\\/]+$/g, '');
}

function normalizeRelativeDir(value, fallback) {
  const trimmed = trimTrailingSlashes(value).replace(/^[\\/]+/g, '');
  return trimmed || fallback;
}

function normalizeWorkspaceMode(value) {
  return ['obsidian', 'standalone'].includes(String(value || '').trim()) ? value : 'obsidian';
}

function normalizeDirForMode(value, fallback, mode) {
  if (mode === 'standalone') {
    const trimmed = trimTrailingSlashes(value);
    return trimmed || fallback;
  }
  return normalizeRelativeDir(value, fallback);
}

function normalizeCalendarProvider(value, fallback = DEFAULT_CALENDAR.calendarProvider) {
  const provider = String(value || fallback).trim();
  return ['none', 'lark', 'macos'].includes(provider) ? provider : fallback;
}

function normalizeWikiMode(value, fallback = DEFAULT_WIKI.wikiMode) {
  const mode = String(value || fallback).trim();
  return ['off', 'agent'].includes(mode) ? mode : fallback;
}

function normalizeDailyCapacity(value, fallback = DEFAULT_SCHEDULE.dailyCapacity) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(12, Math.round(number)));
}

function normalizeTimeSlot(slot) {
  const label = String(slot?.label || '').trim();
  const start = String(slot?.start || '').trim();
  const end = String(slot?.end || '').trim();
  if (!label || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end) || start >= end) {
    return null;
  }
  return { label, start, end };
}

function normalizeScheduleTimeSlots(value, fallback = DEFAULT_SCHEDULE.scheduleTimeSlots) {
  const slots = Array.isArray(value) ? value.map(normalizeTimeSlot).filter(Boolean) : [];
  return slots.length ? slots.slice(0, 8) : fallback;
}

function normalizePlannerSettings(settings = {}, projectRoot = process.cwd()) {
  const defaults = createDefaultPlannerSettings(projectRoot);
  const workspaceMode = normalizeWorkspaceMode(settings.workspaceMode);
  return {
    workspaceMode,
    vaultRoot: trimTrailingSlashes(settings.vaultRoot || defaults.vaultRoot) || defaults.vaultRoot,
    topicDir: normalizeDirForMode(settings.topicDir, defaults.topicDir, workspaceMode),
    inboxDir: normalizeDirForMode(settings.inboxDir, defaults.inboxDir, workspaceMode),
    archiveDir: normalizeDirForMode(settings.archiveDir, defaults.archiveDir, workspaceMode),
    calendarProvider: normalizeCalendarProvider(settings.calendarProvider, defaults.calendarProvider),
    macosCalendarName: String(settings.macosCalendarName || defaults.macosCalendarName).trim(),
    wikiMode: normalizeWikiMode(settings.wikiMode, defaults.wikiMode),
    wikiDir: normalizeRelativeDir(settings.wikiDir, defaults.wikiDir),
    wikiIndexPath: normalizeRelativeDir(settings.wikiIndexPath, defaults.wikiIndexPath),
    wikiLogPath: normalizeRelativeDir(settings.wikiLogPath, defaults.wikiLogPath),
    dailyCapacity: normalizeDailyCapacity(settings.dailyCapacity, defaults.dailyCapacity),
    scheduleTimeSlots: normalizeScheduleTimeSlots(settings.scheduleTimeSlots, defaults.scheduleTimeSlots),
  };
}

function resolvePlannerPaths(settings) {
  const normalized = normalizePlannerSettings(settings);
  if (normalized.workspaceMode === 'standalone') {
    const topicDir = path.resolve(normalized.topicDir);
    const inboxDir = path.resolve(normalized.inboxDir);
    const archiveRoot = path.resolve(normalized.archiveDir);
    // Use the filesystem root so path.relative(vaultRoot, ...) still produces valid strings
    const vaultRoot = path.parse(topicDir).root;
    return { vaultRoot, topicDir, inboxDir, archiveRoot, wikiRoot: topicDir, wikiIndexPath: '', wikiLogPath: '' };
  }
  return {
    vaultRoot: normalized.vaultRoot,
    topicDir: path.join(normalized.vaultRoot, normalized.topicDir),
    inboxDir: path.join(normalized.vaultRoot, normalized.inboxDir),
    archiveRoot: path.join(normalized.vaultRoot, normalized.archiveDir),
    wikiRoot: path.join(normalized.vaultRoot, normalized.wikiDir),
    wikiIndexPath: path.join(normalized.vaultRoot, normalized.wikiIndexPath),
    wikiLogPath: path.join(normalized.vaultRoot, normalized.wikiLogPath),
  };
}

function getPlannerConfigPath(projectRoot = process.cwd()) {
  if (process.env.TOPIC_PLANNER_CONFIG) {
    return path.resolve(process.env.TOPIC_PLANNER_CONFIG);
  }
  return path.join(projectRoot, CONFIG_FILENAME);
}

async function loadPlannerSettings({ projectRoot = process.cwd() } = {}) {
  const configPath = getPlannerConfigPath(projectRoot);
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    return normalizePlannerSettings(JSON.parse(raw), projectRoot);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return createDefaultPlannerSettings(projectRoot);
    }
    throw error;
  }
}

async function savePlannerSettings(settings, { projectRoot = process.cwd() } = {}) {
  const normalized = normalizePlannerSettings(settings, projectRoot);
  await fs.writeFile(getPlannerConfigPath(projectRoot), `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export {
  createDefaultPlannerSettings,
  getPlannerConfigPath,
  loadPlannerSettings,
  normalizePlannerSettings,
  resolvePlannerPaths,
  savePlannerSettings,
};
