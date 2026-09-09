import path from 'node:path';
import { promises as fs } from 'node:fs';

const CONFIG_FILENAME = 'topic-planner.config.json';
const DEFAULT_DIRS = {
  topicDir: '40_行动卡片',
  inboxDir: '00_收件箱',
  archiveDir: '99_系统/归档/行动卡片',
  wikiDir: '30_整理Wiki',
  wikiIndexPath: '30_整理Wiki/index.md',
  wikiLogPath: '30_整理Wiki/log.md',
};

const DEFAULT_CALENDAR = {
  calendarProvider: 'none',
  larkCalendarId: '',
  larkCalendarName: '',
  macosCalendarName: '',
  larkCalendarId: '',
  larkCalendarName: '',
};

const DEFAULT_EXTERNAL_CALENDAR = {
  externalLarkCalendarIds: [],
  externalMacosCalendarNames: [],
};

const DEFAULT_LARK_VOTING = {
  larkVotingBaseUrl: '',
  larkVotingFieldNames: {
    title: '选题',
    summary: '一句话',
    tags: '标签',
    sourceUrl: '来源链接',
    scheduledAt: '排期时间',
    afuPath: 'Afu路径',
    documentUrl: '飞书文档',
    votingDate: '入池日期',
  },
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
    vaultProfiles: {},
    ...DEFAULT_WORKSPACE,
    ...DEFAULT_DIRS,
    ...DEFAULT_CALENDAR,
    ...DEFAULT_EXTERNAL_CALENDAR,
    ...DEFAULT_LARK_VOTING,
    ...DEFAULT_WIKI,
    ...DEFAULT_SCHEDULE,
  };
}

// 只读聚合源列表:非数组回退到空数组;元素 trim 后滤空;去重;上限 10 条截断,
// 避免用户误粘贴超长列表拖慢每次外部日历拉取。
function normalizeStringListField(value, { max = 10 } = {}) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const trimmed = String(item ?? '').trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= max) break;
  }
  return result;
}

function trimTrailingSlashes(value) {
  return String(value || '').trim().replace(/[\\/]+$/g, '');
}

function normalizeRelativeDir(value, fallback) {
  const trimmed = trimTrailingSlashes(value).replace(/^[\\/]+/g, '').replace(/\\/g, '/');
  const normalized = trimmed ? path.posix.normalize(trimmed) : '';
  if (normalized === '..' || normalized.startsWith('../')) return fallback;
  if (normalized === '.') return normalized;
  return normalized || fallback;
}

function normalizeWorkspaceMode(value) {
  return ['obsidian', 'standalone'].includes(String(value || '').trim()) ? value : 'obsidian';
}

function normalizeOptionalRelativeDir(value) {
  return normalizeRelativeDir(value, '');
}

function normalizeVaultProfiles(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const profiles = {};
  for (const [vaultRoot, profile] of Object.entries(value)) {
    const normalizedRoot = trimTrailingSlashes(vaultRoot);
    if (!path.isAbsolute(normalizedRoot) || !profile || typeof profile !== 'object') continue;
    const topicDir = normalizeOptionalRelativeDir(profile.topicDir);
    const inboxDir = normalizeOptionalRelativeDir(profile.inboxDir);
    const archiveDir = normalizeOptionalRelativeDir(profile.archiveDir);
    if (!topicDir || !inboxDir || !archiveDir) continue;
    const wikiDir = normalizeOptionalRelativeDir(profile.wikiDir);
    const wikiIndexPath = normalizeOptionalRelativeDir(profile.wikiIndexPath);
    const wikiLogPath = normalizeOptionalRelativeDir(profile.wikiLogPath);
    profiles[path.resolve(normalizedRoot)] = {
      topicDir,
      inboxDir,
      archiveDir,
      ...(wikiDir ? { wikiDir } : {}),
      ...(wikiIndexPath ? { wikiIndexPath } : {}),
      ...(wikiLogPath ? { wikiLogPath } : {}),
    };
  }
  return profiles;
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

function normalizeLarkVotingFieldNames(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(
    Object.entries(DEFAULT_LARK_VOTING.larkVotingFieldNames).map(([key, fallback]) => [
      key,
      String(input[key] || fallback).trim() || fallback,
    ]),
  );
}

function normalizePlannerSettings(settings = {}, projectRoot = process.cwd()) {
  const defaults = createDefaultPlannerSettings(projectRoot);
  const workspaceMode = normalizeWorkspaceMode(settings.workspaceMode);
  return {
    workspaceMode,
    vaultRoot: trimTrailingSlashes(settings.vaultRoot || defaults.vaultRoot) || defaults.vaultRoot,
    vaultProfiles: normalizeVaultProfiles(settings.vaultProfiles),
    topicDir: normalizeDirForMode(settings.topicDir, defaults.topicDir, workspaceMode),
    inboxDir: normalizeDirForMode(settings.inboxDir, defaults.inboxDir, workspaceMode),
    archiveDir: normalizeDirForMode(settings.archiveDir, defaults.archiveDir, workspaceMode),
    calendarProvider: normalizeCalendarProvider(settings.calendarProvider, defaults.calendarProvider),
    larkCalendarId: String(settings.larkCalendarId || defaults.larkCalendarId).trim(),
    larkCalendarName: String(settings.larkCalendarName || defaults.larkCalendarName).trim(),
    macosCalendarName: String(settings.macosCalendarName || defaults.macosCalendarName).trim(),
    larkCalendarId: String(settings.larkCalendarId || defaults.larkCalendarId).trim(),
    larkCalendarName: String(settings.larkCalendarName || defaults.larkCalendarName).trim(),
    externalLarkCalendarIds: normalizeStringListField(settings.externalLarkCalendarIds),
    externalMacosCalendarNames: normalizeStringListField(settings.externalMacosCalendarNames),
    larkVotingBaseUrl: String(settings.larkVotingBaseUrl || defaults.larkVotingBaseUrl).trim(),
    larkVotingFieldNames: normalizeLarkVotingFieldNames(settings.larkVotingFieldNames),
    wikiMode: normalizeWikiMode(settings.wikiMode, defaults.wikiMode),
    wikiDir: normalizeRelativeDir(settings.wikiDir, defaults.wikiDir),
    wikiIndexPath: normalizeRelativeDir(settings.wikiIndexPath, defaults.wikiIndexPath),
    wikiLogPath: normalizeRelativeDir(settings.wikiLogPath, defaults.wikiLogPath),
    dailyCapacity: normalizeDailyCapacity(settings.dailyCapacity, defaults.dailyCapacity),
    scheduleTimeSlots: normalizeScheduleTimeSlots(settings.scheduleTimeSlots, defaults.scheduleTimeSlots),
  };
}

function getVaultProfile(settings, vaultRoot) {
  const normalized = normalizePlannerSettings(settings);
  const normalizedRoot = trimTrailingSlashes(vaultRoot);
  if (!path.isAbsolute(normalizedRoot)) return null;
  const resolvedRoot = path.resolve(normalizedRoot);
  if (normalized.vaultProfiles[resolvedRoot]) {
    return { ...normalized.vaultProfiles[resolvedRoot] };
  }
  if (normalized.workspaceMode === 'obsidian' && path.resolve(normalized.vaultRoot) === resolvedRoot) {
    return {
      topicDir: normalized.topicDir,
      inboxDir: normalized.inboxDir,
      archiveDir: normalized.archiveDir,
      wikiDir: normalized.wikiDir,
      wikiIndexPath: normalized.wikiIndexPath,
      wikiLogPath: normalized.wikiLogPath,
    };
  }
  return null;
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
  getVaultProfile,
  loadPlannerSettings,
  normalizePlannerSettings,
  resolvePlannerPaths,
  savePlannerSettings,
};
