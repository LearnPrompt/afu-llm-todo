import { createServer } from "node:http";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildTopicDraftFromInbox, deriveInboxCandidate, normalizeUrl } from "./inbox-import.mjs";
import { suggestMergeGroups } from "./deepseek-client.mjs";
import {
  buildAppleScriptDate,
  buildBatchCalendarCleanupScript,
  buildDeleteEventsByTopicScript,
  buildListEventsScript,
  parseMacOSEventLines,
  planCalendarCleanup,
  toAppleScriptString,
} from "./macos-calendar.mjs";
import { appendOperationLog } from "./operation-log.mjs";
import {
  formatPlannerDirectorySelection,
  resolvePlannerDirectoryPickerStart,
  selectNativeDirectory,
} from "./native-directory-picker.mjs";
import {
  getPlannerConfigPath,
  getVaultProfile,
  loadPlannerSettings,
  resolvePlannerPaths,
  savePlannerSettings,
} from "./topic-planner-config.mjs";
import {
  appendWikiLog,
  buildTodoCandidateStore,
  buildTodoCandidatesFromWiki,
  buildTopicDraftFromTodo,
  buildWikiIngestPacket,
  ensureWikiFiles,
} from "./wiki-mode.mjs";
import { formatCalendarSyncError, normalizeDisplayTitle } from "./topic-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = __dirname;
const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
const SAMPLE_VAULT_ROOT = path.join(PROJECT_ROOT, "examples", "sample-vault");
const PORT = Number(process.env.PORT || 4317);
const TIMEZONE = "Asia/Shanghai";
const LARK_CLI_CANDIDATES = [
  process.env.LARK_CLI_PATH,
  process.env.HOME ? path.join(process.env.HOME, ".npm-global/bin/lark-cli") : "",
  "/opt/homebrew/bin/lark-cli",
  "/usr/local/bin/lark-cli",
].filter(Boolean);

const FRONTMATTER_ORDER = [
  "type",
  "topic_id",
  "status",
  "stage",
  "priority",
  "created",
  "updated",
  "platforms",
  "target_forms",
  "dedupe_key",
  "scheduled_date",
  "scheduled_start",
  "scheduled_end",
  "completed_date",
  "calendar_provider",
  "calendar_sync_status",
  "lark_calendar_id",
  "lark_event_id",
  "macos_calendar_name",
  "macos_event_id",
  "source_wiki_pages",
  "llm_todo_reason",
  "llm_todo_confidence",
  "llm_todo_status",
  "drop_action",
  "drop_reason",
  "tags",
];

let authCache = { expiresAt: 0, value: null };
let calendarCache = { expiresAt: 0, value: null };
let authFlowCache = { expiresAt: 0, value: null };
let larkCalendarListCache = { expiresAt: 0, value: null };
let plannerSettingsCache = null;
let externalEventsCache = new Map();
const topicMutationLocks = new Map();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/topics" && req.method === "GET") {
      return respondJson(res, await buildTopicsPayload());
    }

    if (url.pathname === "/api/topics/day" && req.method === "GET") {
      return respondJson(res, await buildDayPayload(url.searchParams.get("date")));
    }

    if (url.pathname === "/api/topics/completed-week" && req.method === "GET") {
      return respondJson(res, await buildCompletedWeekPayload(url.searchParams.get("start"), url.searchParams.get("end")));
    }

    if (url.pathname === "/api/calendar/external-events" && req.method === "GET") {
      return respondJson(res, await buildExternalEventsPayload(url.searchParams.get("start"), url.searchParams.get("end")));
    }

    if (url.pathname === "/api/inbox-candidates" && req.method === "GET") {
      return respondJson(res, await buildInboxCandidatesPayload());
    }

    if (url.pathname === "/api/inbox/import" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await importInboxCandidate(body));
    }

    if (url.pathname === "/api/inbox/dismiss" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await setInboxFileProcessed(body.sourcePath));
    }

    if (url.pathname === "/api/inbox/refetch" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await refetchInboxCandidate({ sourcePath: body.sourcePath }));
    }

    if (url.pathname === "/api/inbox/import-batch" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await importInboxCandidateBatch(body));
    }

    if (url.pathname === "/api/settings" && req.method === "GET") {
      return respondJson(res, await getPlannerSettingsPayload());
    }

    if (url.pathname === "/api/settings" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await savePlannerSettingsPayload(body));
    }

    if (url.pathname === "/api/system/select-directory" && req.method === "POST") {
      assertLocalRequest(req);
      const body = await readJsonBody(req);
      return respondJson(res, await selectPlannerDirectory(body));
    }

    if (url.pathname === "/api/diagnostics" && req.method === "GET") {
      return respondJson(res, await buildDiagnosticsPayload());
    }

    if (url.pathname === "/api/wiki/compile" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await compileWikiPacket(body));
    }

    if (url.pathname === "/api/wiki/todos/generate" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await generateWikiTodos(body));
    }

    if (url.pathname === "/api/wiki/todos/accept" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await acceptWikiTodo(body));
    }

    if (url.pathname === "/api/wiki/todos/reject" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await rejectWikiTodo(body));
    }

    if (url.pathname === "/api/topics/schedule" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await withTopicMutationLock(body.path, () => scheduleTopic(body)));
    }

    if (url.pathname === "/api/topics/disposition" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await withTopicMutationLock(body.path, () => disposeTopic(body)));
    }

    if (url.pathname === "/api/topics/complete" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await withTopicMutationLock(body.path, () => completeTopic(body)));
    }

    if (url.pathname === "/api/topics/dispose-batch" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await disposeTopicsBatch(body));
    }

    if (url.pathname === "/api/topics/revert-import" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await withTopicMutationLock(body.path, () => revertImportedTopic(body)));
    }

    if (url.pathname === "/api/topics/unschedule" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await withTopicMutationLock(body.path, () => unscheduleTopic(body)));
    }

    if (url.pathname === "/api/topics/merge" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await withTopicMutationLock(body.primaryPath, () => mergeTopics(body)));
    }

    if (url.pathname === "/api/topics/suggest-merge-groups" && req.method === "POST") {
      return respondJson(res, await buildMergeSuggestionsPayload());
    }

    if (url.pathname === "/api/lark/repair/start" && req.method === "POST") {
      return respondJson(res, await startLarkAuthRepair());
    }

    if (url.pathname === "/api/lark/repair/finish" && req.method === "POST") {
      return respondJson(res, await finishLarkAuthRepair());
    }

    if (url.pathname === "/api/macos/calendars" && req.method === "GET") {
      return respondJson(res, await getMacOSCalendarsPayload());
    }

    if (url.pathname === "/api/lark/calendars" && req.method === "GET") {
      return respondJson(res, await getLarkCalendarsPayload());
    }

    if (url.pathname === "/api/health" && req.method === "GET") {
      return respondJson(res, { ok: true, now: new Date().toISOString() });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    return respondError(res, error);
  }
}).listen(PORT, () => {
  console.log(`Topic planner running on http://localhost:${PORT}`);
});

async function buildTopicsPayload() {
  const topics = await listTopics();
  const lark = await getLarkStatus();
  const inboxAnalysis = await analyzeInboxCandidates(topics);
  const settings = await getPlannerSettings();
  return {
    configPath: getPlannerConfigPath(PROJECT_ROOT),
    hasSavedConfig: await plannerConfigExists(),
    workspace: settings.vaultRoot,
    generatedAt: new Date().toISOString(),
    timezone: TIMEZONE,
    settings,
    lark,
    topics,
    inboxCandidates: inboxAnalysis.candidates,
    inboxSummary: inboxAnalysis.summary,
  };
}

async function withTopicMutationLock(topicPath, operation) {
  const key = optionalString(topicPath) || "__unknown_topic__";
  const previous = topicMutationLocks.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  topicMutationLocks.set(key, current);
  try {
    return await current;
  } finally {
    if (topicMutationLocks.get(key) === current) {
      topicMutationLocks.delete(key);
    }
  }
}

async function buildInboxCandidatesPayload() {
  const topics = await listTopics();
  const inboxAnalysis = await analyzeInboxCandidates(topics);
  return {
    generatedAt: new Date().toISOString(),
    candidates: inboxAnalysis.candidates,
    summary: inboxAnalysis.summary,
  };
}

const DAY_HIDDEN_STAGES = new Set(["已拒绝", "已归档", "已发布"]);

// 本地时区的"今天"。todayString() 是 UTC slice,北京时间 0-8 点会算成昨天,
// 每日视图不能用它。
function localDateString(timeZone = TIMEZONE) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone }).format(new Date());
}

async function buildDayPayload(requestedDate) {
  const date = requestedDate ? normalizeDateString(requestedDate) : localDateString();
  if (!date) {
    throw badRequest("date 参数格式必须是 YYYY-MM-DD");
  }

  const topics = await listTopics();
  const active = topics.filter((topic) => topic.scheduledDate && !DAY_HIDDEN_STAGES.has(topic.stage));
  const scheduled = active
    .filter((topic) => topic.scheduledDate === date)
    .sort((a, b) => String(a.scheduledStart || "").localeCompare(String(b.scheduledStart || "")));
  const overdue = active
    .filter((topic) => topic.scheduledDate < date)
    .sort((a, b) => String(b.scheduledDate).localeCompare(String(a.scheduledDate)));

  const { inboxDir } = await resolvePlannerDirs();
  const inboxAnalysis = await analyzeInboxCandidates(topics);
  const prefix = `${inboxDir.replace(/\/+$/g, "")}/${date}/`;
  const inboxCandidates = inboxAnalysis.candidates.filter((candidate) =>
    String(candidate.sourcePath || "").replace(/\\/g, "/").startsWith(prefix),
  );

  return {
    ok: true,
    date,
    generatedAt: new Date().toISOString(),
    timezone: TIMEZONE,
    scheduled,
    overdue,
    inboxCandidates,
    summary: {
      scheduledCount: scheduled.length,
      overdueCount: overdue.length,
      inboxCount: inboxCandidates.length,
    },
  };
}

async function resolvePlannerDirs() {
  const settings = await getPlannerSettings();
  return { inboxDir: optionalString(settings.inboxDir) || "00_收件箱" };
}

// 手动多选合并:把 mergePaths 的卡并进 primaryPath。
// 被合并卡先清外部日历事件,再归档留底;正文以"合并进来的选题"小节
// 追加进主卡,来源回链和原卡归档位置都保留,合并不丢信息。
async function mergeTopics(payload) {
  const primaryAbsPath = await resolveTopicPath(payload.primaryPath);
  const mergeRelPaths = normalizeArray(payload.mergePaths);
  if (!mergeRelPaths.length) {
    throw badRequest("必须提供要合并的卡片");
  }

  const primarySource = await loadTopicSource(primaryAbsPath);
  const primaryTitle = extractTitle(primarySource.body, path.basename(primaryAbsPath, ".md"));
  const primaryTopic = normalizeTopic(primarySource.frontmatter, primaryTitle, primarySource.relPath);

  const merged = [];
  const calendarWarnings = [];
  let appendBody = "";

  for (const relPath of mergeRelPaths) {
    const filePath = await resolveTopicPath(relPath);
    if (filePath === primaryAbsPath) continue;

    const source = await loadTopicSource(filePath);
    const title = extractTitle(source.body, path.basename(filePath, ".md"));
    const topic = normalizeTopic(source.frontmatter, title, source.relPath);

    try {
      await deleteSyncedCalendarEvent(topic);
    } catch (error) {
      calendarWarnings.push(`${title}: ${formatCalendarSyncError(error)}`);
    }

    topic.stage = "已归档";
    topic.drop_action = "合并";
    topic.drop_reason = `合并进 ${primarySource.relPath}`;
    topic.updated = todayString();
    const archivePath = await buildArchivePath(filePath);
    await fs.mkdir(path.dirname(archivePath), { recursive: true });
    await fs.writeFile(archivePath, composeMarkdown(topic, source.body), "utf8");
    await fs.unlink(filePath);

    const { vaultRoot } = await getPlannerPaths();
    appendBody += buildMergeSection({
      title,
      topic,
      body: source.body,
      archiveRelPath: path.relative(vaultRoot, archivePath),
    });
    merged.push({ path: source.relPath, title });
  }

  if (!merged.length) {
    throw badRequest("没有可合并的卡片(不能把卡片合并进自己)");
  }

  const newTitle = optionalString(payload.newTitle);
  let primaryBody = primarySource.body;
  let finalTitle = primaryTitle;
  if (newTitle && newTitle !== primaryTitle) {
    // 合并后的卡应该呈现合并后的新主题，而不是沿用某一张成员卡的标题
    primaryBody = /^#\s+.+$/m.test(primaryBody)
      ? primaryBody.replace(/^#\s+.+$/m, `# ${newTitle}`)
      : `# ${newTitle}\n\n${primaryBody.replace(/^\n+/, "")}`;
    finalTitle = newTitle;
  }

  primaryTopic.updated = todayString();
  await writeTopicFile(primaryAbsPath, primaryTopic, primaryBody + appendBody);
  await appendPlannerLog("topic-merge", finalTitle, {
    path: primarySource.relPath,
    mergedCount: merged.length,
    merged: merged.map((item) => item.path),
    ...(newTitle && { newTitle }),
  });

  return {
    ok: true,
    merged,
    calendarWarnings,
    topic: await readTopic(primaryAbsPath),
  };
}

function buildMergeSection({ title, topic, body, archiveRelPath }) {
  const lines = [
    "",
    "---",
    "",
    `## 合并进来的选题(${todayString()}):${title}`,
    "",
    `**原卡归档:** ${archiveRelPath}`,
  ];
  if (topic.source_url) {
    lines.push(`**来源:** ${topic.source_url}`);
  }
  if (topic.source_inbox_path) {
    lines.push(`**收件箱原文:** ${topic.source_inbox_path}`);
  }
  const trimmedBody = String(body || "").trim();
  if (trimmedBody) {
    lines.push("", trimmedBody);
  }
  lines.push("");
  return lines.join("\n");
}

// AI 建议分组:把非终态卡的标题+摘要交给 DeepSeek 判断哪些是同一选题。
// 只出建议不动数据;没配 key / 调用失败会抛 503/502,前端降级回手动勾选。
async function buildMergeSuggestionsPayload() {
  const topics = await listTopics();
  const mergeable = topics.filter((topic) => !DAY_HIDDEN_STAGES.has(topic.stage));
  const { groups } = await suggestMergeGroups({
    topics: mergeable.map((topic) => ({ title: topic.title, excerpt: topic.excerpt })),
  });
  return {
    ok: true,
    groups: groups.map((group) => ({
      reason: group.reason,
      suggestedTitle: group.suggestedTitle,
      topics: group.indexes
        .map((index) => mergeable[index - 1])
        .filter(Boolean)
        .map((topic) => ({ path: topic.path, title: topic.title })),
    })).filter((group) => group.topics.length >= 2),
  };
}

async function getPlannerSettingsPayload() {
  const settings = await getPlannerSettings();
  return {
    ok: true,
    configPath: getPlannerConfigPath(PROJECT_ROOT),
    hasSavedConfig: await plannerConfigExists(),
    settings,
  };
}

async function savePlannerSettingsPayload(payload) {
  const workspaceMode = payload.workspaceMode === 'standalone' ? 'standalone' : 'obsidian';
  const requestedVaultRoot = optionalString(payload.vaultRoot);
  if (workspaceMode === 'obsidian' && !requestedVaultRoot) {
    throw badRequest("Obsidian 模式必须填写 Vault 根目录");
  }
  if (workspaceMode === 'obsidian' && !path.isAbsolute(requestedVaultRoot)) {
    throw badRequest("Obsidian 模式的 Vault 根目录必须是本机绝对路径");
  }

  if (isDemoConfigRun()) {
    const resolvedRequestedVaultRoot = path.resolve(requestedVaultRoot);
    if (resolvedRequestedVaultRoot !== SAMPLE_VAULT_ROOT) {
      throw badRequest("当前 4317 运行在 Sample Vault 演示环境，不能把 demo 配置保存成真实 Vault。请切回真实服务后再保存真实路径。");
    }
  }

  const currentSettings = await getPlannerSettings();
  const vaultProfiles = { ...(currentSettings.vaultProfiles || {}) };
  const hasPlannerConfig = await plannerConfigExists();
  if (hasPlannerConfig && currentSettings.workspaceMode === "obsidian") {
    const currentVaultRoot = path.resolve(currentSettings.vaultRoot);
    vaultProfiles[currentVaultRoot] = {
      ...(vaultProfiles[currentVaultRoot] || {}),
      ...buildVaultProfileFromSettings(currentSettings),
    };
  }
  const nextPayload = { ...payload, vaultProfiles };
  if (workspaceMode === "obsidian") {
    const vaultRoot = path.resolve(requestedVaultRoot);
    const existingProfile = vaultProfiles[vaultRoot] || {};
    const switchingVault = currentSettings.workspaceMode !== "obsidian"
      || path.resolve(currentSettings.vaultRoot) !== vaultRoot;
    const topicDir = validateVaultRelativeDirectory(payload.topicDir, "选题目录");
    const inboxDir = validateVaultRelativeDirectory(payload.inboxDir, "收件箱目录");
    const archiveDir = validateVaultRelativeDirectory(payload.archiveDir, "归档目录");
    if (!topicDir || !inboxDir || !archiveDir) {
      throw badRequest("首次使用这个 Vault 时，请先选择选题、收件箱和归档目录");
    }
    const profileWikiDir = optionalString(existingProfile.wikiDir);
    const wikiDirSource = switchingVault && profileWikiDir
      ? profileWikiDir
      : (optionalString(payload.wikiDir) || profileWikiDir || currentSettings.wikiDir);
    const wikiDir = validateVaultRelativeDirectory(wikiDirSource, "Wiki 目录");
    const wikiIndexPath = validateVaultRelativeDirectory(
      switchingVault && optionalString(existingProfile.wikiIndexPath)
        ? existingProfile.wikiIndexPath
        : (optionalString(payload.wikiIndexPath) || `${wikiDir}/index.md`),
      "Wiki Index",
    );
    const wikiLogPath = validateVaultRelativeDirectory(
      switchingVault && optionalString(existingProfile.wikiLogPath)
        ? existingProfile.wikiLogPath
        : (optionalString(payload.wikiLogPath) || `${wikiDir}/log.md`),
      "Wiki Log",
    );
    nextPayload.vaultRoot = vaultRoot;
    nextPayload.topicDir = topicDir;
    nextPayload.inboxDir = inboxDir;
    nextPayload.archiveDir = archiveDir;
    nextPayload.wikiDir = wikiDir;
    nextPayload.wikiIndexPath = wikiIndexPath;
    nextPayload.wikiLogPath = wikiLogPath;
    nextPayload.vaultProfiles[vaultRoot] = {
      topicDir,
      inboxDir,
      archiveDir,
      wikiDir,
      wikiIndexPath,
      wikiLogPath,
    };
  }

  const settings = await savePlannerSettings(nextPayload, { projectRoot: PROJECT_ROOT });
  plannerSettingsCache = settings;
  resetRuntimeCaches();
  return {
    ok: true,
    configPath: getPlannerConfigPath(PROJECT_ROOT),
    settings,
  };
}

function buildVaultProfileFromSettings(settings) {
  return {
    topicDir: settings.topicDir,
    inboxDir: settings.inboxDir,
    archiveDir: settings.archiveDir,
    wikiDir: settings.wikiDir,
    wikiIndexPath: settings.wikiIndexPath,
    wikiLogPath: settings.wikiLogPath,
  };
}

async function selectPlannerDirectory(payload) {
  const prompts = {
    vault: "选择 Obsidian Vault 根目录",
    topic: "选择选题目录",
    inbox: "选择收件箱目录",
    archive: "选择归档目录",
  };
  const target = optionalString(payload.target);
  if (!prompts[target]) {
    throw badRequest("未知的目录类型");
  }

  const currentPath = optionalString(payload.currentPath);
  const vaultRoot = optionalString(payload.vaultRoot);
  if (currentPath.length > 4096 || vaultRoot.length > 4096) {
    throw badRequest("目录路径过长");
  }
  const workspaceMode = payload.workspaceMode === "obsidian" ? "obsidian" : "standalone";
  const pickerCurrentPath = resolvePlannerDirectoryPickerStart({
    target,
    currentPath,
    vaultRoot,
    workspaceMode,
  });

  const result = await selectNativeDirectory({
    currentPath: pickerCurrentPath,
    prompt: prompts[target],
  });
  if (result.canceled) {
    return { ok: true, ...result };
  }

  if (target === "vault") {
    const settings = await getPlannerSettings();
    const profile = await plannerConfigExists() ? getVaultProfile(settings, result.path) : null;
    return {
      ok: true,
      canceled: false,
      path: result.path,
      vault: {
        vaultRoot: result.path,
        configured: Boolean(profile),
        directories: profile || { topicDir: "", inboxDir: "", archiveDir: "" },
      },
    };
  }

  return {
    ok: true,
    canceled: false,
    path: formatPlannerDirectorySelection({
      target,
      selectedPath: result.path,
      vaultRoot,
      workspaceMode,
    }),
  };
}

async function buildDiagnosticsPayload() {
  const paths = await getPlannerPaths();
  const checks = [];
  if (paths.settings.workspaceMode !== 'standalone') {
    await pushDirCheck(checks, "Vault 根目录", paths.vaultRoot);
  }
  await pushDirCheck(checks, "选题目录", paths.topicDir);
  await pushDirCheck(checks, "收件箱目录", paths.inboxDir);
  await pushDirCheck(checks, "归档目录", paths.archiveRoot);
  await pushOptionalDirCheck(checks, "Wiki 目录", paths.wikiRoot);
  await pushOptionalFileCheck(checks, "Wiki Index", paths.wikiIndexPath);
  await pushOptionalFileCheck(checks, "Wiki Log", paths.wikiLogPath);

  const topicCount = checks.find((item) => item.label === "选题目录")?.count || 0;
  const inboxCount = checks.find((item) => item.label === "收件箱目录")?.recursiveMarkdownCount || 0;
  const topics = await listTopics();
  const inboxAnalysis = await analyzeInboxCandidates(topics);
  const failed = checks.filter((item) => !item.ok);
  return {
    ok: failed.length === 0,
    settings: paths.settings,
    checks,
    summary: {
      topicDirectoryEntries: topicCount,
      inboxMarkdownFiles: inboxCount,
      ...inboxAnalysis.summary,
      calendarProvider: paths.settings.calendarProvider,
      wikiMode: paths.settings.wikiMode,
      dailyCapacity: paths.settings.dailyCapacity,
    },
  };
}

async function pushDirCheck(checks, label, dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const markdownCount = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).length;
    const recursiveMarkdownCount = await countMarkdownFiles(dirPath);
    checks.push({ label, ok: true, path: dirPath, count: entries.length, markdownCount, recursiveMarkdownCount });
  } catch (error) {
    checks.push({ label, ok: false, path: dirPath, error: error.message });
  }
}

async function countMarkdownFiles(dirPath) {
  let count = 0;
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const childPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      count += await countMarkdownFiles(childPath);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      count += 1;
    }
  }
  return count;
}

async function pushFileCheck(checks, label, filePath) {
  try {
    await fs.access(filePath);
    checks.push({ label, ok: true, path: filePath });
  } catch (error) {
    checks.push({ label, ok: false, path: filePath, error: error.message });
  }
}

async function pushOptionalDirCheck(checks, label, dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const markdownCount = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).length;
    const recursiveMarkdownCount = await countMarkdownFiles(dirPath);
    checks.push({ label, ok: true, path: dirPath, count: entries.length, markdownCount, recursiveMarkdownCount });
  } catch (error) {
    checks.push({ label, ok: true, path: dirPath, count: 0, markdownCount: 0, recursiveMarkdownCount: 0, note: "首次编译时自动创建" });
  }
}

async function pushOptionalFileCheck(checks, label, filePath) {
  try {
    await fs.access(filePath);
    checks.push({ label, ok: true, path: filePath });
  } catch {
    checks.push({ label, ok: true, path: filePath, note: "首次编译时自动创建" });
  }
}

async function getPlannerSettings(forceReload = false) {
  if (!plannerSettingsCache || forceReload) {
    plannerSettingsCache = await loadPlannerSettings({ projectRoot: PROJECT_ROOT });
  }
  return plannerSettingsCache;
}

async function getPlannerPaths(forceReload = false) {
  const settings = await getPlannerSettings(forceReload);
  return {
    settings,
    ...resolvePlannerPaths(settings),
  };
}

function resetRuntimeCaches() {
  authCache = { expiresAt: 0, value: null };
  calendarCache = { expiresAt: 0, value: null };
  authFlowCache = { expiresAt: 0, value: null };
  larkCalendarListCache = { expiresAt: 0, value: null };
  externalEventsCache = new Map();
}

async function listTopics() {
  const { topicDir } = await getPlannerPaths();
  let entries = [];
  try {
    entries = await fs.readdir(topicDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .filter((entry) => !["README.md", "00-AI工具选题索引.md"].includes(entry.name))
    .map((entry) => path.join(topicDir, entry.name));

  const topics = await Promise.all(files.map((filePath) => readTopic(filePath)));
  return topics.sort(compareTopics);
}

async function listInboxCandidates(existingTopics = []) {
  return (await analyzeInboxCandidates(existingTopics)).candidates;
}

async function analyzeInboxCandidates(existingTopics = []) {
  const { inboxDir, vaultRoot } = await getPlannerPaths();
  const files = await listMarkdownFiles(inboxDir);
  const takenPaths = new Set(existingTopics.map((topic) => optionalString(topic.sourceInboxPath || "")).filter(Boolean));
  const takenUrls = new Set(existingTopics.map((topic) => optionalString(topic.sourceUrl || "")).filter(Boolean));
  const candidates = [];
  const summary = {
    inboxMarkdownFiles: files.length,
    inboxCandidateFiles: 0,
    inboxSkippedProcessed: 0,
    inboxSkippedAlreadyImported: 0,
    inboxSkippedShort: 0,
    inboxLowInformation: 0,
    inboxSkippedSystem: 0,
    inboxSkippedDuplicate: 0,
  };

  for (const filePath of files) {
    const relPath = path.relative(vaultRoot, filePath);
    const raw = await fs.readFile(filePath, "utf8");
    const { frontmatter } = parseFrontmatter(raw);
    if (isSystemInboxFile(relPath)) {
      summary.inboxSkippedSystem += 1;
      continue;
    }
    if (optionalString(frontmatter.status) === 'processed') {
      summary.inboxSkippedProcessed += 1;
      continue;
    }
    const candidate = deriveInboxCandidate({ filePath: relPath, raw });
    if (!candidate.title || candidate.title === "README") {
      summary.inboxSkippedSystem += 1;
      continue;
    }
    if (candidate.excerpt.length < 16) {
      summary.inboxLowInformation += 1;
    }
    if (takenPaths.has(candidate.sourcePath) || (candidate.sourceUrl && takenUrls.has(candidate.sourceUrl))) {
      summary.inboxSkippedAlreadyImported += 1;
      continue;
    }
    candidates.push(candidate);
  }

  candidates.sort((left, right) => (right.savedAt || "").localeCompare(left.savedAt || "") || left.title.localeCompare(right.title, "zh-CN"));

  const dedupedCandidates = dedupeInboxCandidatesByKey(candidates, summary);

  summary.inboxCandidateFiles = dedupedCandidates.length;
  return { candidates: dedupedCandidates, summary };
}

const INBOX_CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 };

function dedupeInboxCandidatesByKey(candidates, summary) {
  const winners = new Map();
  for (const candidate of candidates) {
    const key = candidate.dedupeKey;
    const existing = winners.get(key);
    if (!existing) {
      winners.set(key, candidate);
      continue;
    }
    const existingRank = INBOX_CONFIDENCE_RANK[existing.confidence] || 0;
    const candidateRank = INBOX_CONFIDENCE_RANK[candidate.confidence] || 0;
    const candidateWins =
      candidateRank > existingRank ||
      (candidateRank === existingRank && (candidate.savedAt || "") > (existing.savedAt || ""));
    if (candidateWins) {
      winners.set(key, candidate);
    }
    summary.inboxSkippedDuplicate += 1;
  }
  return candidates.filter((candidate) => winners.get(candidate.dedupeKey) === candidate);
}

function isSystemInboxFile(relPath) {
  const basename = path.basename(relPath);
  return basename === "README.md" || basename.startsWith(".") || /^同步助手_\d{4}-\d{2}-\d{2}\.md$/.test(basename);
}

function buildAppendSection(candidate) {
  const date = new Date().toISOString().slice(0, 10);
  return [
    '',
    '---',
    '',
    `## 补充素材（${date}）`,
    '',
    `**来源：** ${candidate.sourceUrl || candidate.sourcePath}`,
    `**作者：** ${candidate.author || '未知'}`,
    '',
    candidate.excerpt || '',
    '',
  ].join('\n');
}

async function importInboxCandidate(payload) {
  const { vaultRoot } = await getPlannerPaths();
  const sourcePath = optionalString(payload.sourcePath);
  if (!sourcePath) {
    throw badRequest("必须提供收件箱路径");
  }

  const absolutePath = await resolveInboxPath(sourcePath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const candidate = deriveInboxCandidate({ filePath: sourcePath, raw });

  // Dedup: 归一化 URL 完全一致才自动合并。标题相似不再触发自动合并——
  // 抖音/小红书分享标题里「复制打开抖音，看看【…的作品】」这类模板文字
  // 会让不相干的卡片重叠率虚高，相似合并只能走手动确认的合并建议。
  const topics = await listTopics();
  const normalizedUrl = candidate.sourceUrl ? normalizeUrl(candidate.sourceUrl) : "";
  const duplicate = normalizedUrl
    ? topics.find(t => t.sourceUrl && normalizeUrl(t.sourceUrl) === normalizedUrl)
    : null;
  if (duplicate) {
    const absoluteTopicPath = path.join(vaultRoot, duplicate.path);
    const existing = await fs.readFile(absoluteTopicPath, "utf8");
    await fs.writeFile(absoluteTopicPath, existing + buildAppendSection(candidate), "utf8");
    await fs.writeFile(absolutePath, patchFrontmatterField(raw, "status", "processed"), "utf8");
    await appendPlannerLog("inbox-merge", candidate.title, {
      source: candidate.sourcePath,
      mergedInto: duplicate.path,
    });
    return {
      ok: true,
      merged: true,
      mergedInto: duplicate.path,
      mergedTitle: duplicate.title,
      topic: await readTopic(absoluteTopicPath),
    };
  }

  const draft = buildTopicDraftFromInbox(candidate);
  const targetPath = await reserveTopicPath(draft.filename);
  await fs.writeFile(targetPath, draft.content, "utf8");
  await appendPlannerLog("inbox-import", candidate.title, {
    source: candidate.sourcePath,
    created: path.relative(vaultRoot, targetPath),
  });

  return {
    ok: true,
    merged: false,
    created: path.relative(vaultRoot, targetPath),
    topic: await readTopic(targetPath),
  };
}

async function importInboxCandidateBatch(payload) {
  const sourcePaths = normalizeArray(payload.sourcePaths);
  if (!sourcePaths.length) {
    throw badRequest("必须提供至少一条收件箱路径");
  }

  const created = [];
  const failed = [];
  for (const sourcePath of sourcePaths) {
    try {
      const result = await importInboxCandidate({ sourcePath });
      created.push({
        path: result.created || result.mergedInto,
        title: result.topic?.title || "",
        sourcePath,
        merged: Boolean(result.merged),
      });
    } catch (error) {
      failed.push({
        sourcePath,
        error: error.message || "转卡失败",
      });
    }
  }

  return {
    ok: failed.length === 0,
    created,
    failed,
  };
}

async function compileWikiPacket(payload = {}) {
  const topics = await listTopics();
  const candidates = await getInboxCandidatesForWiki(topics, normalizeArray(payload.sourcePaths));
  const { vaultRoot, settings } = await getPlannerPaths();
  await ensureWikiFiles({ vaultRoot, settings });
  const packet = buildWikiIngestPacket({ candidates, settings });
  const packetDir = path.join(vaultRoot, settings.wikiDir, "inbox-packets");
  await fs.mkdir(packetDir, { recursive: true });
  const packetPath = path.join(packetDir, packet.filename);
  await fs.writeFile(packetPath, packet.content, "utf8");
  const relPacketPath = path.relative(vaultRoot, packetPath);
  await appendWikiLog({
    vaultRoot,
    settings,
    message: `ingest-packet | ${relPacketPath} | sources=${packet.sourceCount}`,
  });
  await appendPlannerLog("wiki-compile", packet.title, {
    packet: relPacketPath,
    sources: String(packet.sourceCount),
  });
  return {
    ok: true,
    packet: {
      path: relPacketPath,
      title: packet.title,
      sourceCount: packet.sourceCount,
      requestedCount: candidates.length,
    },
  };
}

async function generateWikiTodos(payload = {}) {
  const topics = await listTopics();
  const candidates = await getInboxCandidatesForWiki(topics, normalizeArray(payload.sourcePaths));
  const { vaultRoot, settings } = await getPlannerPaths();
  await ensureWikiFiles({ vaultRoot, settings });
  const packet = buildWikiIngestPacket({ candidates, settings });
  const packetDir = path.join(vaultRoot, settings.wikiDir, "inbox-packets");
  await fs.mkdir(packetDir, { recursive: true });
  const absolutePacketPath = path.join(packetDir, packet.filename);
  await fs.writeFile(absolutePacketPath, packet.content, "utf8");
  const relPacketPath = path.relative(vaultRoot, absolutePacketPath);
  const todos = buildTodoCandidatesFromWiki({ candidates, settings, packetPath: relPacketPath });
  const store = buildTodoCandidateStore({ todos, packetPath: relPacketPath, settings });
  const todoDir = path.join(vaultRoot, settings.wikiDir, "todo-candidates");
  await fs.mkdir(todoDir, { recursive: true });
  const todoStorePath = path.join(todoDir, store.filename);
  await fs.writeFile(todoStorePath, store.content, "utf8");
  const relTodoStorePath = path.relative(vaultRoot, todoStorePath);
  await appendWikiLog({
    vaultRoot,
    settings,
    message: `todo-candidates | ${relTodoStorePath} | packet=${relPacketPath} | count=${todos.length}`,
  });
  await appendPlannerLog("wiki-todo-generate", "生成 LLM Todo 候选", {
    packet: relPacketPath,
    store: relTodoStorePath,
    count: String(todos.length),
  });
  return {
    ok: true,
    todos,
    packetPath: relPacketPath,
    storePath: relTodoStorePath,
    sourceCount: candidates.length,
  };
}

function selectInboxCandidates(candidates, sourcePaths = []) {
  if (!sourcePaths.length) {
    return candidates.slice(0, 20);
  }
  const requested = new Set(sourcePaths.map((item) => optionalString(item)).filter(Boolean));
  return candidates.filter((candidate) => requested.has(candidate.sourcePath));
}

async function getInboxCandidatesForWiki(topics, sourcePaths = []) {
  if (!sourcePaths.length) {
    return selectInboxCandidates(await listInboxCandidates(topics), []);
  }

  const candidates = [];
  for (const sourcePath of sourcePaths) {
    const absolutePath = await resolveInboxPath(sourcePath);
    const raw = await fs.readFile(absolutePath, "utf8");
    const candidate = deriveInboxCandidate({ filePath: sourcePath, raw });
    if (!candidate.title || candidate.title === "README" || candidate.excerpt.length < 16 || isSystemInboxFile(sourcePath)) {
      continue;
    }
    candidates.push(candidate);
  }
  return candidates;
}

async function acceptWikiTodo(payload) {
  const todo = normalizeIncomingTodo(payload.todo || payload);
  const { vaultRoot } = await getPlannerPaths();
  const draft = buildTopicDraftFromTodo(todo);
  const targetPath = await reserveTopicPath(draft.filename);
  await fs.writeFile(targetPath, draft.content, "utf8");
  const relPath = path.relative(vaultRoot, targetPath);
  await appendPlannerLog("wiki-todo-accept", todo.title, {
    created: relPath,
    source: todo.sourceInboxPath,
  });
  return {
    ok: true,
    created: relPath,
    topic: await readTopic(targetPath),
  };
}

async function rejectWikiTodo(payload) {
  const todo = normalizeIncomingTodo(payload.todo || payload);
  const { vaultRoot, settings } = await getPlannerPaths();
  await ensureWikiFiles({ vaultRoot, settings });
  await appendWikiLog({
    vaultRoot,
    settings,
    message: `todo-rejected | ${todo.id} | ${todo.title}`,
  });
  await appendPlannerLog("wiki-todo-reject", todo.title, {
    todo_id: todo.id,
    source: todo.sourceInboxPath,
  });
  return { ok: true, todoId: todo.id };
}

function normalizeIncomingTodo(todo) {
  const title = optionalString(todo.title);
  const id = optionalString(todo.id) || `todo-${slugify(title)}-${stableHash(JSON.stringify(todo)).slice(0, 6)}`;
  if (!title) {
    throw badRequest("Todo 标题不能为空");
  }
  return {
    id,
    title,
    sourceInboxPath: optionalString(todo.sourceInboxPath),
    sourceUrl: optionalString(todo.sourceUrl),
    sourceWikiPages: normalizeArray(todo.sourceWikiPages),
    reason: optionalString(todo.reason) || "来自 Wiki Mode 的行动卡。",
    confidence: ["high", "medium", "low"].includes(optionalString(todo.confidence)) ? optionalString(todo.confidence) : "medium",
    targetForms: normalizeArray(todo.targetForms).length ? normalizeArray(todo.targetForms) : ["视频"],
    estimatedMinutes: Number(todo.estimatedMinutes) || 45,
    status: "accepted",
  };
}

async function listMarkdownFiles(rootDir) {
  const results = [];
  let entries = [];
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  for (const entry of entries) {
    if (["attachments", "images"].includes(entry.name)) continue;
    const absolute = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listMarkdownFiles(absolute)));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    results.push(absolute);
  }
  return results;
}

async function reserveTopicPath(filename) {
  const { topicDir } = await getPlannerPaths();
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let attempt = 0;
  while (true) {
    const name = attempt === 0 ? `${base}${ext}` : `${base}-${String(attempt + 1).padStart(2, '0')}${ext}`;
    const target = path.join(topicDir, name);
    try {
      await fs.access(target);
      attempt += 1;
    } catch {
      return target;
    }
  }
}

async function resolveInboxPath(relPath) {
  const { vaultRoot, inboxDir } = await getPlannerPaths();
  const absolute = path.resolve(vaultRoot, relPath);
  if (!absolute.startsWith(inboxDir + path.sep) && absolute !== inboxDir) {
    throw badRequest("收件箱路径不合法");
  }
  return absolute;
}

// Minimal-invasion patch of a single frontmatter field: replaces an existing
// `key: ...` line in the `---`-delimited block, or inserts one right after
// the opening `---` if the key isn't present. Deliberately avoids the full
// parseFrontmatter/serializeFrontmatter round trip so unknown third-party
// fields keep their original formatting and ordering.
function patchFrontmatterField(raw, key, value) {
  const blockRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
  const match = raw.match(blockRegex);
  if (!match) {
    return `---\n${key}: ${value}\n---\n\n${raw}`;
  }

  const fmBody = match[1];
  const lineRegex = new RegExp(`(^|\\n)${key}:[^\\n]*`);
  let newFmBody;
  if (lineRegex.test(fmBody)) {
    newFmBody = fmBody.replace(lineRegex, `$1${key}: ${value}`);
  } else {
    newFmBody = `${key}: ${value}\n${fmBody}`;
  }

  const newBlock = `---\n${newFmBody}\n---\n`;
  return raw.slice(0, match.index) + newBlock + raw.slice(match.index + match[0].length);
}

async function setInboxFileProcessed(sourcePath) {
  const relPath = optionalString(sourcePath);
  if (!relPath) {
    throw badRequest("必须提供收件箱路径");
  }
  const absolutePath = await resolveInboxPath(relPath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const updated = patchFrontmatterField(raw, "status", "processed");
  await fs.writeFile(absolutePath, updated, "utf8");
  await appendPlannerLog("inbox-dismiss", path.basename(relPath, ".md"), {
    source: relPath,
  });
  return { ok: true, sourcePath: relPath };
}

const INBOX_SHORT_LINK_PATTERN = /https?:\/\/(?:v\.douyin\.com|xhslink\.com|b23\.tv)\/[A-Za-z0-9\/]+/;
const REFETCH_SCRIPT_PATH = path.join(process.env.HOME || "", "projects/paoding-skill/skills/paoding/scripts/collect.sh");
const REFETCH_TIMEOUT_MS = 300000;

function runRefetchScript(url, tmpDir) {
  return new Promise((resolve) => {
    const child = spawn("bash", [REFETCH_SCRIPT_PATH, url, tmpDir, "--browser", "chrome"]);
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, REFETCH_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

async function refetchInboxCandidate({ sourcePath }) {
  const relPath = optionalString(sourcePath);
  if (!relPath) {
    throw badRequest("必须提供收件箱路径");
  }
  const absolutePath = await resolveInboxPath(relPath);
  const raw = await fs.readFile(absolutePath, "utf8");
  const { frontmatter, body } = parseFrontmatter(raw);

  let sourceUrl = optionalString(frontmatter.url || frontmatter.source_url || "");
  let urlIsNew = false;
  if (!sourceUrl) {
    const bodyMatch = String(body || "").match(INBOX_SHORT_LINK_PATTERN);
    if (bodyMatch) {
      sourceUrl = bodyMatch[0];
      urlIsNew = true;
    }
  }
  if (!sourceUrl) {
    throw badRequest("正文里也没找到可识别的分享链接，需要人工补链接");
  }

  const tmpDir = path.join(os.tmpdir(), `afu-refetch-${Date.now()}`);
  await fs.mkdir(tmpDir, { recursive: true });

  const { code, stderr, timedOut } = await runRefetchScript(sourceUrl, tmpDir);

  let result;
  if (!timedOut && code === 0) {
    const files = await fs.readdir(tmpDir);
    const transcriptFile = files.find((name) => name.endsWith(".txt"));
    const transcript = transcriptFile ? await fs.readFile(path.join(tmpDir, transcriptFile), "utf8") : "";
    const date = new Date().toISOString().slice(0, 10);
    const section = ["", `## 补充素材（抓取日期 ${date}）`, `- 来源链接：${sourceUrl}`, "", transcript, ""].join("\n");

    let updatedRaw = raw + section;
    if (urlIsNew) {
      updatedRaw = patchFrontmatterField(updatedRaw, "url", sourceUrl);
    }
    await fs.writeFile(absolutePath, updatedRaw, "utf8");

    result = { ok: true, message: "已追加转写内容", sourcePath: relPath, url: sourceUrl };
  } else if (timedOut) {
    result = {
      ok: false,
      reason: "timeout",
      message: `超过 5 分钟未完成，建议手动跑命令行：bash ~/projects/paoding-skill/skills/paoding/scripts/collect.sh ${sourceUrl}`,
    };
  } else if (code === 3) {
    result = { ok: false, reason: "need_login", message: stderr.slice(0, 500) };
  } else if (code === 4) {
    result = { ok: false, reason: "download_failed", message: stderr.slice(0, 500) };
  } else if (code === 5) {
    result = {
      ok: false,
      reason: "transcribe_failed",
      message: `${stderr.slice(0, 500)}（音频已保留在 ${tmpDir}，可手动重试）`,
    };
  } else {
    result = {
      ok: false,
      reason: "unknown",
      message: stderr.slice(0, 500) || `未知错误，退出码 ${code}`,
    };
  }

  await appendPlannerLog("inbox-refetch", path.basename(relPath, ".md"), {
    source: relPath,
    reason: result.reason || "success",
    code: String(code),
  });

  return result;
}

async function readTopic(filePath) {
  const { vaultRoot } = await getPlannerPaths();
  const stat = await fs.stat(filePath);
  const raw = await fs.readFile(filePath, "utf8");
  const { frontmatter, body } = parseFrontmatter(raw);
  const relPath = path.relative(vaultRoot, filePath);
  const title = normalizeDisplayTitle(extractTitle(body, path.basename(filePath, ".md")));
  const normalized = normalizeTopic(frontmatter, title, relPath);
  return {
    path: relPath,
    title,
    stage: normalized.stage,
    status: normalized.status,
    priority: normalized.priority,
    updated: normalized.updated,
    fileModifiedAt: stat.mtime.toISOString(),
    platforms: normalized.platforms,
    targetForms: normalized.target_forms,
    tags: normalized.tags,
    scheduledDate: normalized.scheduled_date || "",
    scheduledStart: normalized.scheduled_start || "",
    scheduledEnd: normalized.scheduled_end || "",
    calendarSyncStatus: normalized.calendar_sync_status || "",
    calendarProvider: normalized.calendar_provider || "",
    larkEventId: normalized.lark_event_id || "",
    larkCalendarId: normalized.lark_calendar_id || "",
    macosEventId: normalized.macos_event_id || "",
    macosCalendarName: normalized.macos_calendar_name || "",
    sourceWikiPages: normalized.source_wiki_pages,
    llmTodoReason: normalized.llm_todo_reason || "",
    llmTodoConfidence: normalized.llm_todo_confidence || "",
    llmTodoStatus: normalized.llm_todo_status || "",
    sourceInboxPath: optionalString(normalized.source_inbox_path),
    sourceUrl: optionalString(normalized.source_url),
    topicId: normalized.topic_id,
    dedupeKey: normalized.dedupe_key || "",
    dropAction: normalized.drop_action || "",
    dropReason: normalized.drop_reason || "",
    excerpt: extractExcerpt(body, title, normalized),
    hasSchedule: Boolean(normalized.scheduled_date),
  };
}

async function scheduleTopic(payload) {
  const filePath = await resolveTopicPath(payload.path);
  const date = normalizeDateString(payload.scheduledDate);
  const startTime = normalizeTimeString(payload.scheduledStart || "10:00");
  const endTime = normalizeTimeString(payload.scheduledEnd || "11:00");
  const titleOverride = optionalString(payload.title);

  if (!date) {
    throw badRequest("排期日期不能为空");
  }
  if (!startTime || !endTime) {
    throw badRequest("开始时间和结束时间不能为空");
  }
  if (startTime >= endTime) {
    throw badRequest("结束时间必须晚于开始时间");
  }

  const source = await loadTopicSource(filePath);
  const title = titleOverride || extractTitle(source.body, path.basename(filePath, ".md"));
  const topic = normalizeTopic(source.frontmatter, title, source.relPath);

  topic.scheduled_date = date;
  topic.scheduled_start = startTime;
  topic.scheduled_end = endTime;
  topic.stage = "已排期";
  topic.status = "active";
  topic.updated = todayString();
  topic.drop_action = "";
  topic.drop_reason = "";

  const calendarProvider = normalizeCalendarProvider(payload.calendarProvider || (payload.syncToLark ? "lark" : "none"));

  if (calendarProvider !== "none") {
    try {
      await deleteCalendarEventsExcept(topic, calendarProvider);
      const syncResult = await syncTopicToCalendar({
        title,
        topic,
        path: source.relPath,
        provider: calendarProvider,
      });
      topic.calendar_provider = syncResult.provider;
      topic.calendar_sync_status = syncResult.syncStatus;
      topic.lark_event_id = syncResult.eventId || "";
      topic.lark_calendar_id = syncResult.calendarId || "";
      topic.macos_event_id = syncResult.macosEventId || "";
      topic.macos_calendar_name = syncResult.macosCalendarName || "";
    } catch (error) {
      topic.calendar_provider = calendarProvider;
      topic.calendar_sync_status = `同步失败：${formatCalendarSyncError(error)}`;
      topic.lark_event_id = "";
      topic.lark_calendar_id = "";
      topic.macos_event_id = "";
      topic.macos_calendar_name = "";
    }
  } else {
    try {
      await deleteCalendarEventsExcept(topic, calendarProvider);
    } catch (error) {
      console.warn("Failed to clean external calendar event while scheduling Markdown-only:", error);
    }
    topic.calendar_provider = "none";
    topic.calendar_sync_status = "未同步";
    topic.lark_event_id = "";
    topic.lark_calendar_id = "";
    topic.macos_event_id = "";
    topic.macos_calendar_name = "";
  }

  await writeTopicFile(filePath, topic, source.body);
  await appendPlannerLog("topic-schedule", title, {
    path: source.relPath,
    date,
    time: `${startTime}-${endTime}`,
    calendarProvider,
    calendarSyncStatus: topic.calendar_sync_status,
  });
  return { ok: true, topic: await readTopic(filePath) };
}

async function unscheduleTopic(payload) {
  const filePath = await resolveTopicPath(payload.path);
  const source = await loadTopicSource(filePath);
  const title = extractTitle(source.body, path.basename(filePath, ".md"));
  const topic = normalizeTopic(source.frontmatter, title, source.relPath);

  if (payload.removeFromCalendar) {
    await deleteSyncedCalendarEvent(topic);
  }

  topic.scheduled_date = "";
  topic.scheduled_start = "";
  topic.scheduled_end = "";
  topic.stage = "待排期";
  topic.updated = todayString();

  await writeTopicFile(filePath, topic, source.body);
  await appendPlannerLog("topic-unschedule", title, {
    path: source.relPath,
    removeFromCalendar: String(Boolean(payload.removeFromCalendar)),
  });
  return { ok: true, topic: await readTopic(filePath) };
}

async function disposeTopic(payload, options = {}) {
  const filePath = await resolveTopicPath(payload.path);
  const action = optionalString(payload.action);
  const reason = optionalString(payload.reason);
  const removeFromCalendar = Boolean(payload.removeFromCalendar ?? payload.removeFromLark);

  if (!action) {
    throw badRequest("必须提供作废动作");
  }
  if (!reason) {
    throw badRequest("必须填写作废原因");
  }

  const source = await loadTopicSource(filePath);
  const title = extractTitle(source.body, path.basename(filePath, ".md"));
  const topic = normalizeTopic(source.frontmatter, title, source.relPath);

  if (removeFromCalendar && !options.skipCalendarCleanup) {
    await deleteSyncedCalendarEvent(topic);
  } else if (removeFromCalendar && options.skipCalendarCleanup) {
    // 批量流程已在外层统一清理日历事件,这里只同步清掉卡上的引用字段。
    topic.calendar_provider = "none";
    topic.calendar_sync_status = "未同步";
    topic.lark_event_id = "";
    topic.lark_calendar_id = "";
    topic.macos_event_id = "";
    topic.macos_calendar_name = "";
  }

  topic.drop_action = action;
  topic.drop_reason = reason;
  topic.updated = todayString();

  if (action === "拒绝") {
    topic.stage = "已拒绝";
    await writeTopicFile(filePath, topic, source.body);
    await appendPlannerLog("topic-disposition", title, {
      path: source.relPath,
      action,
      reason,
    });
    return { ok: true, topic: await readTopic(filePath) };
  }

  topic.stage = "已归档";
  const updatedContent = composeMarkdown(topic, source.body);
  const archivePath = await buildArchivePath(filePath);
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await fs.writeFile(archivePath, updatedContent, "utf8");
  await fs.unlink(filePath);

  let inboxSourceDeleted = false;
  if (topic.source_inbox_path) {
    try {
      const inboxSourceAbs = await resolveInboxPath(topic.source_inbox_path);
      await fs.unlink(inboxSourceAbs);
      inboxSourceDeleted = true;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }

  await appendPlannerLog("topic-disposition", title, {
    path: source.relPath,
    action,
    reason,
    archivePath: path.relative((await getPlannerPaths()).vaultRoot, archivePath),
    ...(topic.source_inbox_path && { inboxSourcePath: topic.source_inbox_path, inboxSourceDeleted }),
  });

  return {
    ok: true,
    archived: true,
    archivePath: path.relative((await getPlannerPaths()).vaultRoot, archivePath),
  };
}

// 正向完成通道:和 disposeTopic 的归档分支很像,但事情真实发生过——
// 不清日历事件、不清 calendar 相关字段,只把 stage 打成"已发布"再归档留底。
async function completeTopic(payload) {
  const filePath = await resolveTopicPath(payload.path);
  const source = await loadTopicSource(filePath);
  const title = extractTitle(source.body, path.basename(filePath, ".md"));
  const topic = normalizeTopic(source.frontmatter, title, source.relPath);

  if (["已发布", "已归档", "已拒绝"].includes(topic.stage)) {
    throw badRequest("这张卡已经结束,不能重复标记完成");
  }

  topic.stage = "已发布";
  topic.updated = todayString();
  // completed-week 按日期串比对,必须用本地时区的今天(todayString 0-8 点会差一天)
  topic.completed_date = localDateString();

  const updatedContent = composeMarkdown(topic, source.body);
  const archivePath = await buildArchivePath(filePath);
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await fs.writeFile(archivePath, updatedContent, "utf8");
  await fs.unlink(filePath);

  let inboxSourceDeleted = false;
  if (topic.source_inbox_path) {
    try {
      const inboxSourceAbs = await resolveInboxPath(topic.source_inbox_path);
      await fs.unlink(inboxSourceAbs);
      inboxSourceDeleted = true;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }

  const relativeArchivePath = path.relative((await getPlannerPaths()).vaultRoot, archivePath);
  await appendPlannerLog("topic-complete", title, {
    path: source.relPath,
    archivePath: relativeArchivePath,
    ...(topic.source_inbox_path && { inboxSourcePath: topic.source_inbox_path, inboxSourceDeleted }),
  });

  return {
    ok: true,
    completed: true,
    archivePath: relativeArchivePath,
  };
}

// 本周已完成查询:扫归档目录里 stage === 已发布 的卡,给周面板的折叠区用。
// scheduled_date 缺失时用 completed_date 兜底判断区间,单卡解析失败跳过不中断。
async function buildCompletedWeekPayload(startParam, endParam) {
  const start = normalizeDateString(startParam);
  const end = normalizeDateString(endParam);
  if (!start || !end) {
    throw badRequest("start/end 参数格式必须是 YYYY-MM-DD");
  }

  const { archiveRoot, vaultRoot } = await getPlannerPaths();
  const years = new Set([start.slice(0, 4), end.slice(0, 4)]);
  const topics = [];

  for (const year of years) {
    const yearDir = path.join(archiveRoot, year);
    let entries = [];
    try {
      entries = await fs.readdir(yearDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }

    const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md"));
    for (const entry of files) {
      const filePath = path.join(yearDir, entry.name);
      try {
        const raw = await fs.readFile(filePath, "utf8");
        const { frontmatter, body } = parseFrontmatter(raw);
        const title = normalizeDisplayTitle(extractTitle(body, path.basename(filePath, ".md")));
        const normalized = normalizeTopic(frontmatter, title, path.relative(vaultRoot, filePath));

        if (normalized.stage !== "已发布") continue;
        const compareDate = normalized.scheduled_date || normalized.completed_date;
        if (!compareDate || compareDate < start || compareDate > end) continue;

        topics.push({
          title,
          scheduledDate: normalized.scheduled_date || "",
          scheduledStart: normalized.scheduled_start || "",
          scheduledEnd: normalized.scheduled_end || "",
          completedDate: normalized.completed_date || "",
          archivePath: path.relative(vaultRoot, filePath),
        });
      } catch {
        // 单个归档文件解析失败不影响整体查询
        continue;
      }
    }
  }

  return { ok: true, topics };
}

const EXTERNAL_EVENTS_CACHE_TTL_MS = 90_000;
const EXTERNAL_EVENTS_CACHE_MAX_KEYS = 20;
const EXTERNAL_EVENTS_MAX_TOTAL = 500;
const EXTERNAL_EVENTS_MAX_RANGE_DAYS = 31;

// 纯日历天数差(不含时区换算),用于校验 start/end 区间长度。
function daysBetweenDateStrings(start, end) {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const startUTC = Date.UTC(sy, sm - 1, sd);
  const endUTC = Date.UTC(ey, em - 1, ed);
  return Math.round((endUTC - startUTC) / 86_400_000);
}

// startDate..endDate(含两端)逐日展开成 "YYYY-MM-DD" 列表,纯日历算术。
function iterateDateRange(startDate, endDate) {
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ey, em, ed] = endDate.split("-").map(Number);
  const startUTC = Date.UTC(sy, sm - 1, sd);
  const endUTC = Date.UTC(ey, em - 1, ed);
  const dates = [];
  for (let t = startUTC; t <= endUTC; t += 86_400_000) {
    const cursor = new Date(t);
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cursor.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
  }
  return dates;
}

// 飞书 +agenda 的 start_time/end_time 归一化成 { date, time, allDay }。
// datetime 自带偏移,new Date() 后按 TIMEZONE 重新格式化即可得到本地日期/时间。
function larkTimePartsToLocal(timeObj) {
  if (!timeObj || typeof timeObj !== "object") return null;
  if (optionalString(timeObj.date)) {
    return { date: optionalString(timeObj.date), time: "", allDay: true };
  }
  if (optionalString(timeObj.datetime)) {
    const parsed = new Date(timeObj.datetime);
    if (Number.isNaN(parsed.getTime())) return null;
    const date = new Intl.DateTimeFormat("sv-SE", { timeZone: TIMEZONE }).format(parsed);
    const time = new Intl.DateTimeFormat("sv-SE", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(parsed);
    return { date, time, allDay: false };
  }
  return null;
}

function normalizeLarkExternalEvent(item, calendarLabel) {
  const startParts = larkTimePartsToLocal(item?.start_time);
  if (!startParts) return null;
  const endParts = larkTimePartsToLocal(item?.end_time);
  return {
    source: "lark",
    calendarLabel,
    eventId: optionalString(item?.event_id),
    title: optionalString(item?.summary) || "(无标题)",
    allDay: Boolean(startParts.allDay),
    startDate: startParts.date,
    startTime: startParts.time,
    endDate: (endParts && endParts.date) || startParts.date,
    endTime: (endParts && endParts.time) || startParts.time,
    freeBusy: optionalString(item?.free_busy_status),
    hasTopicMarker: false,
  };
}

async function fetchLarkExternalEvents(calendarIds, start, end) {
  // calendarLabel 尽量给日历名而不是原始 id;列表拉不到时降级用 id。
  let labelById = new Map();
  try {
    labelById = new Map((await listLarkCalendars()).map((calendar) => [calendar.id, calendar.summary]));
  } catch {
    // 忽略,label 降级为 calendarId
  }
  const events = [];
  for (const calendarId of calendarIds) {
    const result = await execJson("lark-cli", [
      "calendar",
      "+agenda",
      "--start",
      start,
      "--end",
      end,
      "--calendar-id",
      calendarId,
    ]);
    const list = Array.isArray(result?.data) ? result.data : [];
    for (const item of list) {
      const normalized = normalizeLarkExternalEvent(item, labelById.get(calendarId) || calendarId);
      if (normalized) events.push(normalized);
    }
  }
  return events;
}

async function fetchMacOSExternalEvents(calendarNames, start, end) {
  if (!calendarNames.length) return [];
  const script = buildListEventsScript({ calendarNames, startDate: start, endDate: end });
  const output = await execText("osascript", ["-e", script], { timeoutMs: 30_000 });
  return parseMacOSEventLines(output).map((event) => ({
    source: "macos",
    calendarLabel: event.calendarName,
    eventId: event.uid,
    title: event.title || "(无标题)",
    allDay: event.allDay,
    startDate: event.startDate,
    startTime: event.startTime,
    endDate: event.endDate || event.startDate,
    endTime: event.endTime,
    freeBusy: "",
    hasTopicMarker: event.hasTopicMarker,
  }));
}

// 跨天事件展开成逐日条目:首日保留真实开始时间、末日保留真实结束时间,
// 中间日按整天处理。单日事件原样返回一条。
function expandExternalEvent(event) {
  const startDate = event.startDate;
  const endDate = event.endDate || event.startDate;
  const base = (date) => ({
    source: event.source,
    calendarLabel: event.calendarLabel,
    eventId: event.eventId,
    title: event.title,
    date,
    freeBusy: event.freeBusy || "",
    hasTopicMarker: Boolean(event.hasTopicMarker),
  });

  if (!startDate) return [];
  if (!endDate || endDate <= startDate) {
    return [{
      ...base(startDate),
      start: event.startTime || "",
      end: event.endTime || "",
      allDay: Boolean(event.allDay),
    }];
  }

  const dates = iterateDateRange(startDate, endDate);
  return dates.map((date, index) => {
    const isFirst = index === 0;
    const isLast = index === dates.length - 1;
    if (!isFirst && !isLast) {
      return { ...base(date), start: "", end: "", allDay: true };
    }
    return {
      ...base(date),
      start: isFirst ? (event.startTime || "") : "",
      end: isLast ? (event.endTime || "") : "",
      allDay: Boolean(event.allDay),
    };
  });
}

// 两源并发拉取,单源失败只警告不挡另一源。返回未去重的展开事件(封顶 500)+ warnings,
// 这一整包会被 externalEventsCache 缓存,去重留到每次响应时再做(见 buildExternalEventsPayload)。
async function fetchAndNormalizeExternalEvents({ start, end, larkCalendarIds, macosCalendarNames }) {
  const warnings = [];
  const [larkResult, macosResult] = await Promise.allSettled([
    larkCalendarIds.length ? fetchLarkExternalEvents(larkCalendarIds, start, end) : Promise.resolve([]),
    macosCalendarNames.length ? fetchMacOSExternalEvents(macosCalendarNames, start, end) : Promise.resolve([]),
  ]);

  let larkEvents = [];
  if (larkResult.status === "fulfilled") {
    larkEvents = larkResult.value;
  } else {
    warnings.push({ source: "lark", message: formatCalendarSyncError(larkResult.reason) });
  }

  let macosEvents = [];
  if (macosResult.status === "fulfilled") {
    macosEvents = macosResult.value;
  } else {
    warnings.push({ source: "macos", message: formatCalendarSyncError(macosResult.reason) });
  }

  const expanded = [...larkEvents, ...macosEvents].flatMap(expandExternalEvent);
  return { events: expanded.slice(0, EXTERNAL_EVENTS_MAX_TOTAL), warnings };
}

// 去重(每次响应时做,不缓存去重结果):阿福自己建的事件(卡片 frontmatter 记过 id)
// 不重复展示;macOS 事件 description 里带 topic_id 标记的也过滤,兜底 uid 丢失的情况。
function dedupeExternalEvents(entries, topics) {
  const larkIds = new Set(topics.map((topic) => topic.larkEventId).filter(Boolean));
  const macosIds = new Set(topics.map((topic) => topic.macosEventId).filter(Boolean));
  return entries.filter((entry) => {
    if (entry.source === "lark") {
      return !(entry.eventId && larkIds.has(entry.eventId));
    }
    if (entry.source === "macos") {
      if (entry.hasTopicMarker) return false;
      return !(entry.eventId && macosIds.has(entry.eventId));
    }
    return true;
  });
}

// 外部日历只读聚合:周面板展示飞书 + macOS 日历里已有的事件,不写入、不同步。
// 来源为空(未配置聚合源且未选主排期日历)时直接短路,不碰任何 CLI。
async function buildExternalEventsPayload(startParam, endParam) {
  const start = normalizeDateString(startParam);
  const end = normalizeDateString(endParam);
  if (!start || !end) {
    throw badRequest("start/end 参数格式必须是 YYYY-MM-DD");
  }
  if (start > end) {
    throw badRequest("start 不能晚于 end");
  }
  if (daysBetweenDateStrings(start, end) > EXTERNAL_EVENTS_MAX_RANGE_DAYS) {
    throw badRequest(`查询区间不能超过 ${EXTERNAL_EVENTS_MAX_RANGE_DAYS} 天`);
  }

  const settings = await getPlannerSettings();
  const resolutionWarnings = [];

  let larkCalendarIds = normalizeArray(settings.externalLarkCalendarIds);
  if (!larkCalendarIds.length && settings.calendarProvider === "lark") {
    try {
      const targetId = await getTargetLarkCalendarId();
      if (targetId) larkCalendarIds = [targetId];
    } catch (error) {
      resolutionWarnings.push({ source: "lark", message: formatCalendarSyncError(error) });
    }
  }

  let macosCalendarNames = normalizeArray(settings.externalMacosCalendarNames);
  if (!macosCalendarNames.length && settings.calendarProvider === "macos" && optionalString(settings.macosCalendarName)) {
    macosCalendarNames = [settings.macosCalendarName];
  }

  if (!larkCalendarIds.length && !macosCalendarNames.length) {
    return { ok: true, events: [], warnings: resolutionWarnings, sources: { lark: [], macos: [] } };
  }

  const cacheKey = [
    start,
    end,
    [...larkCalendarIds].sort().join(","),
    [...macosCalendarNames].sort().join(","),
  ].join("|");

  let cacheEntry = externalEventsCache.get(cacheKey);
  if (!cacheEntry || Date.now() >= cacheEntry.expiresAt) {
    const fetched = await fetchAndNormalizeExternalEvents({ start, end, larkCalendarIds, macosCalendarNames });
    if (externalEventsCache.size >= EXTERNAL_EVENTS_CACHE_MAX_KEYS) {
      externalEventsCache.clear();
    }
    cacheEntry = { value: fetched, expiresAt: Date.now() + EXTERNAL_EVENTS_CACHE_TTL_MS };
    externalEventsCache.set(cacheKey, cacheEntry);
  }

  const topics = await listTopics();
  const events = dedupeExternalEvents(cacheEntry.value.events, topics).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return String(a.start || "").localeCompare(String(b.start || ""));
  });

  return {
    ok: true,
    events,
    warnings: [...resolutionWarnings, ...cacheEntry.value.warnings],
    sources: { lark: larkCalendarIds, macos: macosCalendarNames },
  };
}

// 批量作废:先把所有卡的日历事件合成一次 osascript 清掉,再逐卡走 disposeTopic 落盘,
// 单卡失败不挡整批,失败项带原因返回给前端。
async function disposeTopicsBatch(payload) {
  const relPaths = normalizeArray(payload.paths);
  if (!relPaths.length) {
    throw badRequest("必须提供要处理的卡片");
  }
  const action = optionalString(payload.action);
  const reason = optionalString(payload.reason);
  if (!action) throw badRequest("必须提供作废动作");
  if (!reason) throw badRequest("必须填写作废原因");
  const removeFromCalendar = Boolean(payload.removeFromCalendar);

  let calendarWarnings = [];
  if (removeFromCalendar) {
    const entries = [];
    for (const relPath of relPaths) {
      try {
        const filePath = await resolveTopicPath(relPath);
        const source = await loadTopicSource(filePath);
        const title = extractTitle(source.body, path.basename(filePath, ".md"));
        entries.push({ topic: normalizeTopic(source.frontmatter, title, source.relPath), title });
      } catch {
        // 读取失败的卡留给下面 disposeTopic 报错,不在这里中断日历清理。
      }
    }
    calendarWarnings = await deleteSyncedCalendarEventsBatch(entries);
  }

  const disposed = [];
  const failed = [];
  for (const relPath of relPaths) {
    try {
      await withTopicMutationLock(relPath, () =>
        disposeTopic(
          { path: relPath, action, reason, removeFromCalendar },
          { skipCalendarCleanup: true },
        ),
      );
      disposed.push(relPath);
    } catch (error) {
      failed.push({ path: relPath, error: error.message });
    }
  }

  await appendPlannerLog("topic-disposition-batch", `${disposed.length} 张卡`, {
    action,
    reason,
    disposedCount: String(disposed.length),
    failedCount: String(failed.length),
    removeFromCalendar: String(removeFromCalendar),
  });

  return { ok: true, disposed, failed, calendarWarnings };
}

async function revertImportedTopic(payload) {
  const filePath = await resolveTopicPath(payload.path);
  const source = await loadTopicSource(filePath);
  const title = extractTitle(source.body, path.basename(filePath, ".md"));
  const topic = normalizeTopic(source.frontmatter, title, source.relPath);
  const sourceInboxPath = topic.source_inbox_path;

  if (!sourceInboxPath) {
    throw badRequest("这张卡没有关联收件箱来源，不能撤回到候选。");
  }

  if (topic.lark_event_id || topic.macos_event_id) {
    await deleteSyncedCalendarEvent(topic);
  }

  await fs.unlink(filePath);
  await appendPlannerLog("topic-revert-import", title, {
    path: source.relPath,
    source: sourceInboxPath,
  });

  return {
    ok: true,
    reverted: true,
    sourceInboxPath,
  };
}

async function loadTopicSource(filePath) {
  const { vaultRoot } = await getPlannerPaths();
  const raw = await fs.readFile(filePath, "utf8");
  const { frontmatter, body } = parseFrontmatter(raw);
  return {
    frontmatter,
    body,
    relPath: path.relative(vaultRoot, filePath),
  };
}

async function writeTopicFile(filePath, frontmatter, body) {
  await fs.writeFile(filePath, composeMarkdown(frontmatter, body), "utf8");
}

async function appendPlannerLog(action, title = "", details = {}) {
  const { vaultRoot } = await getPlannerPaths();
  return appendOperationLog({
    vaultRoot,
    action,
    title,
    details,
  });
}

function composeMarkdown(frontmatter, body) {
  const lines = ["---", ...serializeFrontmatter(frontmatter), "---"];
  return `${lines.join("\n")}\n${body.startsWith("\n") ? body.slice(1) : body}`;
}

function normalizeTopic(frontmatter, title, relPath) {
  const normalized = { ...frontmatter };
  normalized.type = normalized.type || "选题策划";
  normalized.topic_id =
    optionalString(normalized.topic_id) ||
    `topic-${slugify(title)}-${stableHash(relPath).slice(0, 6)}`;
  normalized.status = optionalString(normalized.status) || "active";
  normalized.stage = deriveStage(normalized);
  normalized.priority = optionalString(normalized.priority) || "⭐⭐⭐";
  normalized.created = optionalString(normalized.created) || todayString();
  normalized.updated = optionalString(normalized.updated) || todayString();
  normalized.platforms = normalizeArray(normalized.platforms);
  normalized.target_forms = normalizeTargetForms(normalized.target_forms, normalized.platforms);
  normalized.tags = normalizeArray(normalized.tags);
  normalized.dedupe_key = optionalString(normalized.dedupe_key) || slugify(title);
  normalized.scheduled_date = optionalString(normalized.scheduled_date);
  normalized.scheduled_start = optionalString(normalized.scheduled_start);
  normalized.scheduled_end = optionalString(normalized.scheduled_end);
  normalized.calendar_sync_status =
    optionalString(normalized.calendar_sync_status) || "未同步";
  normalized.calendar_provider = optionalString(normalized.calendar_provider);
  normalized.lark_calendar_id = optionalString(normalized.lark_calendar_id);
  normalized.lark_event_id = optionalString(normalized.lark_event_id);
  normalized.macos_calendar_name = optionalString(normalized.macos_calendar_name);
  normalized.macos_event_id = optionalString(normalized.macos_event_id);
  normalized.source_wiki_pages = normalizeArray(normalized.source_wiki_pages);
  normalized.llm_todo_reason = optionalString(normalized.llm_todo_reason);
  normalized.llm_todo_confidence = optionalString(normalized.llm_todo_confidence);
  normalized.llm_todo_status = optionalString(normalized.llm_todo_status);
  normalized.drop_action = optionalString(normalized.drop_action);
  normalized.drop_reason = optionalString(normalized.drop_reason);
  normalized.source_inbox_path = optionalString(normalized.source_inbox_path);
  normalized.source_url = optionalString(normalized.source_url);
  return normalized;
}

function deriveStage(frontmatter) {
  const stage = optionalString(frontmatter.stage);
  if (stage) {
    // "去重中" 是旧版 Wiki 流程遗留状态，现在去重内置于转卡流程，回退为待排期
    return stage === "去重中" ? "待排期" : stage;
  }
  if (optionalString(frontmatter.drop_reason)) {
    return "已归档";
  }
  if (optionalString(frontmatter.scheduled_date)) {
    return "已排期";
  }
  const status = optionalString(frontmatter.status);
  if (status === "已发布") return "已发布";
  if (status === "已拒绝") return "已拒绝";
  if (status === "已归档") return "已归档";
  return "待排期";
}

function parseFrontmatter(raw) {
  if (!raw.startsWith("---")) {
    return { frontmatter: {}, body: raw };
  }
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const lines = match[1].split(/\r?\n/);
  const frontmatter = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const keyMatch = line.match(/^([A-Za-z0-9_\-]+):\s*(.*)$/);
    if (!keyMatch) {
      continue;
    }

    const key = keyMatch[1];
    const rawValue = keyMatch[2];

    if (rawValue === "" && lines[index + 1]?.match(/^\s+-\s+/)) {
      const items = [];
      index += 1;
      while (index < lines.length && lines[index].match(/^\s+-\s+/)) {
        items.push(parseScalar(lines[index].replace(/^\s+-\s+/, "")));
        index += 1;
      }
      index -= 1;
      frontmatter[key] = items;
      continue;
    }

    frontmatter[key] = parseScalar(rawValue);
  }

  return { frontmatter, body: match[2] };
}

function serializeFrontmatter(frontmatter) {
  const lines = [];
  const seen = new Set();

  for (const key of FRONTMATTER_ORDER) {
    if (!(key in frontmatter)) continue;
    seen.add(key);
    lines.push(...serializeField(key, frontmatter[key]));
  }

  for (const key of Object.keys(frontmatter).sort()) {
    if (seen.has(key)) continue;
    lines.push(...serializeField(key, frontmatter[key]));
  }

  return lines;
}

function serializeField(key, value) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${key}:`];
    }
    return [`${key}:`, ...value.map((item) => `  - ${formatScalar(item)}`)];
  }
  if (value === undefined || value === null || value === "") {
    return [`${key}:`];
  }
  return [`${key}: ${formatScalar(value)}`];
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function formatScalar(value) {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "number") {
    return String(value);
  }

  const text = String(value);
  if (/^[\p{L}\p{N}\s_\-⭐+.\/@]+$/u.test(text) && !text.includes(": ")) {
    return text;
  }
  return JSON.stringify(text);
}

function normalizeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function normalizeTargetForms(value, platforms = []) {
  const normalized = normalizeArray(value);
  if (normalized.length) {
    return normalized;
  }

  const inferred = new Set();
  for (const item of normalizeArray(platforms)) {
    if (/短图文|小红书|朋友圈/u.test(item)) {
      inferred.add("短图文");
      continue;
    }
    if (/视频|视频号|抖音|快手|B站/u.test(item)) {
      inferred.add("视频");
      continue;
    }
    if (/图文|公众号|文章|博客/u.test(item)) {
      inferred.add("图文");
    }
  }

  return [...inferred];
}

function extractTitle(body, fallback) {
  const match = body.match(/^#\s+(.+)$/m);
  return (match?.[1] || fallback).trim();
}

function extractExcerpt(body, title = "", frontmatter = {}) {
  if (optionalString(frontmatter.llm_todo_reason)) {
    return optionalString(frontmatter.llm_todo_reason);
  }
  const displayTitle = normalizeDisplayTitle(title);
  const text = body
    .replace(/^#+\s+/gm, "")
    .replace(/!\[\[.*?\]\]/g, "")
    .replace(/\[\[(.*?)\]\]/g, "$1")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && normalizeDisplayTitle(line) !== displayTitle && !line.startsWith("##") && !line.startsWith("###"));

  return text || "";
}

function compareTopics(left, right) {
  const bothUnscheduled = !left.scheduledDate && !right.scheduledDate;
  if (bothUnscheduled) {
    const leftAccepted = left.llmTodoStatus === "accepted" ? 1 : 0;
    const rightAccepted = right.llmTodoStatus === "accepted" ? 1 : 0;
    if (leftAccepted !== rightAccepted) return rightAccepted - leftAccepted;

    const confidenceScore = { high: 3, medium: 2, low: 1 };
    const leftConfidence = confidenceScore[left.llmTodoConfidence] || 0;
    const rightConfidence = confidenceScore[right.llmTodoConfidence] || 0;
    if (leftConfidence !== rightConfidence) return rightConfidence - leftConfidence;

    if (left.updated && right.updated && left.updated !== right.updated) {
      return right.updated.localeCompare(left.updated);
    }
    if (left.fileModifiedAt && right.fileModifiedAt && left.fileModifiedAt !== right.fileModifiedAt) {
      return right.fileModifiedAt.localeCompare(left.fileModifiedAt);
    }
  }

  const stageOrder = ["待排期", "去重中", "已排期", "制作中", "已发布", "已拒绝", "已归档"];
  const leftStage = stageOrder.indexOf(left.stage);
  const rightStage = stageOrder.indexOf(right.stage);
  if (leftStage !== rightStage) {
    return leftStage - rightStage;
  }
  if (left.scheduledDate && right.scheduledDate && left.scheduledDate !== right.scheduledDate) {
    return left.scheduledDate.localeCompare(right.scheduledDate);
  }
  return right.priority.length - left.priority.length || left.title.localeCompare(right.title, "zh-CN");
}

let larkCliVersionCache = { value: undefined, expiresAt: 0 };

async function getLarkCliVersion() {
  if (Date.now() < larkCliVersionCache.expiresAt && larkCliVersionCache.value !== undefined) {
    return larkCliVersionCache.value;
  }
  let version = null;
  try {
    const stdout = await execText("lark-cli", ["--version"], { timeoutMs: 15_000 });
    const match = String(stdout).match(/\d+\.\d+\.\d+/);
    version = match ? match[0] : (stdout.trim() || null);
  } catch {
    version = null;
  }
  larkCliVersionCache = { value: version, expiresAt: Date.now() + 300_000 };
  return version;
}

async function getLarkStatus() {
  if (Date.now() < authCache.expiresAt && authCache.value) {
    return authCache.value;
  }

  try {
    const status = await execJson("lark-cli", ["auth", "status"]);
    let value = normalizeLarkStatus(status, { canRepair: true });

    if (["valid", "needs_refresh"].includes(value.tokenStatus)) {
      value = await probeLarkAvailability(value);
    }

    value.cliVersion = await getLarkCliVersion();
    authCache = { value, expiresAt: Date.now() + 60_000 };
    return value;
  } catch (error) {
    const value = createLarkUnavailableStatus(error);
    value.cliVersion = await getLarkCliVersion();
    authCache = { value, expiresAt: Date.now() + 15_000 };
    return value;
  }
}

async function getPrimaryCalendarId() {
  if (Date.now() < calendarCache.expiresAt && calendarCache.value) {
    return calendarCache.value;
  }

  const calendarId = await fetchPrimaryCalendarId();
  calendarCache = { value: calendarId, expiresAt: Date.now() + 300_000 };
  return calendarId;
}

async function getTargetLarkCalendarId() {
  const settings = await getPlannerSettings();
  return settings.larkCalendarId || (await getPrimaryCalendarId());
}

async function syncTopicToCalendar({ title, topic, path: topicPath, provider }) {
  if (provider === "lark") {
    return syncTopicToLark({ title, topic, path: topicPath });
  }
  if (provider === "macos") {
    return syncTopicToMacOSCalendar({ title, topic, path: topicPath });
  }
  return {
    provider: "none",
    syncStatus: "未同步",
    eventId: "",
    calendarId: "",
    macosEventId: "",
    macosCalendarName: "",
  };
}

async function syncTopicToLark({ title, topic, path: topicPath }) {
  const auth = await getLarkStatus();
  if (!auth.available) {
    return {
      provider: "lark",
      syncStatus: "同步失败",
      eventId: topic.lark_event_id || "",
      calendarId: topic.lark_calendar_id || "",
    };
  }

  const calendarId = await getTargetLarkCalendarId();
  const startTs = toEpochSeconds(topic.scheduled_date, topic.scheduled_start);
  const endTs = toEpochSeconds(topic.scheduled_date, topic.scheduled_end);
  const data = {
    summary: title,
    description: [
      "由 Topic Planner 自动同步",
      `topic_id: ${topic.topic_id}`,
      `路径: ${topicPath}`,
    ].join("\n"),
    start_time: { timestamp: String(startTs), timezone: TIMEZONE },
    end_time: { timestamp: String(endTs), timezone: TIMEZONE },
    attendee_ability: "can_modify_event",
    free_busy_status: "busy",
  };

  // 目标日历和卡片上次写入的日历不一致时先做迁移:老事件删不掉也不阻塞,
  // 只记一条警告日志,照样在目标日历新建事件,保证排期本身不失败。
  let existingEventId = topic.lark_event_id || "";
  if (existingEventId && topic.lark_calendar_id && topic.lark_calendar_id !== calendarId) {
    try {
      await execJson("lark-cli", [
        "calendar",
        "events",
        "delete",
        "--params",
        JSON.stringify({
          calendar_id: topic.lark_calendar_id,
          event_id: existingEventId,
          need_notification: "false",
        }),
      ]);
    } catch (error) {
      await appendPlannerLog("lark-migrate-delete-failed", title, {
        oldCalendarId: topic.lark_calendar_id,
        newCalendarId: calendarId,
        eventId: existingEventId,
        error: error.message,
      });
    }
    existingEventId = "";
  }

  if (existingEventId) {
    await execJson("lark-cli", [
      "calendar",
      "events",
      "patch",
      "--params",
      JSON.stringify({ calendar_id: calendarId, event_id: existingEventId }),
      "--data",
      JSON.stringify(data),
    ]);

    return {
      provider: "lark",
      syncStatus: "已同步",
      eventId: existingEventId,
      calendarId,
    };
  }

  const created = await execJson("lark-cli", [
    "calendar",
    "events",
    "create",
    "--params",
    JSON.stringify({ calendar_id: calendarId }),
    "--data",
    JSON.stringify(data),
  ]);

  const eventId = created?.event?.event_id || created?.event_id || "";
  const wrappedEventId = created?.data?.event?.event_id || created?.data?.event_id || "";
  return {
    provider: "lark",
    syncStatus: eventId || wrappedEventId ? "已同步" : "同步失败",
    eventId: eventId || wrappedEventId,
    calendarId,
  };
}

async function syncTopicToMacOSCalendar({ title, topic, path: topicPath }) {
  const settings = await getPlannerSettings();
  if (topic.macos_event_id) {
    await deleteMacOSCalendarEvent(topic.macos_event_id);
  }
  await deleteMacOSCalendarEventsForTopic(topic.topic_id);

  const description = [
    "由 Topic Planner 自动同步",
    `topic_id: ${topic.topic_id}`,
    `路径: ${topicPath}`,
  ].join("\n");
  const eventUid = await createMacOSCalendarEvent({
    title,
    description,
    date: topic.scheduled_date,
    startTime: topic.scheduled_start,
    endTime: topic.scheduled_end,
    calendarName: settings.macosCalendarName,
  });
  const [uid, actualCalendarName] = eventUid.split("\t");

  return {
    provider: "macos",
    syncStatus: uid ? "已同步" : "同步失败",
    eventId: "",
    calendarId: "",
    macosEventId: uid,
    macosCalendarName: actualCalendarName || settings.macosCalendarName || "默认可写日历",
  };
}

async function deleteLarkEvent(topic) {
  if (!topic.lark_event_id) return;
  const calendarId = topic.lark_calendar_id || (await getTargetLarkCalendarId());
  await execJson("lark-cli", [
    "calendar",
    "events",
    "delete",
    "--params",
    JSON.stringify({ calendar_id: calendarId, event_id: topic.lark_event_id, need_notification: "false" }),
  ]);
}

async function deleteSyncedCalendarEvent(topic) {
  let uidDeleteResult = "";
  for (const action of planCalendarCleanup(topic)) {
    if (action.type === "lark") {
      await deleteLarkEvent(topic);
    } else if (action.type === "macos-uid") {
      uidDeleteResult = await deleteMacOSCalendarEvent(action.eventUid);
    } else if (action.type === "macos-topic-sweep") {
      // UID 可能因手工编辑/同步冲突丢失,按 topic_id 兜底清扫,避免日历攒重复日程。
      // UID 精确命中时事件已删,跳过全量扫描,省一整个 osascript 进程 + Calendar 遍历。
      if (uidDeleteResult !== "deleted") {
        await deleteMacOSCalendarEventsForTopic(action.topicId);
      }
    }
  }

  topic.calendar_provider = "none";
  topic.calendar_sync_status = "未同步";
  topic.lark_event_id = "";
  topic.lark_calendar_id = "";
  topic.macos_event_id = "";
  topic.macos_calendar_name = "";
}

// 批量作废时的日历清理:所有卡的 UID 删除 + 兜底扫描合成一次 osascript,
// lark 事件仍逐个走 API。返回逐卡警告,不让单卡失败挡住整批。
async function deleteSyncedCalendarEventsBatch(entries) {
  const warnings = [];
  const eventUids = [];
  const topicIds = [];

  for (const { topic, title } of entries) {
    for (const action of planCalendarCleanup(topic)) {
      if (action.type === "lark") {
        try {
          await deleteLarkEvent(topic);
        } catch (error) {
          warnings.push(`${title}: ${formatCalendarSyncError(error)}`);
        }
      } else if (action.type === "macos-uid") {
        eventUids.push(action.eventUid);
      } else if (action.type === "macos-topic-sweep") {
        topicIds.push(action.topicId);
      }
    }
  }

  if (eventUids.length || topicIds.length) {
    try {
      const script = buildBatchCalendarCleanupScript({ eventUids, topicIds });
      await execText("osascript", ["-e", script], { timeoutMs: 120_000 });
    } catch (error) {
      warnings.push(`macOS 日历批量清理失败: ${formatCalendarSyncError(error)}`);
    }
  }

  return warnings;
}

async function deleteCalendarEventsExcept(topic, provider) {
  if (provider !== "lark" && topic.lark_event_id) {
    await deleteLarkEvent(topic);
    topic.lark_event_id = "";
    topic.lark_calendar_id = "";
  }
  if (provider !== "macos" && topic.macos_event_id) {
    await deleteMacOSCalendarEvent(topic.macos_event_id);
    topic.macos_event_id = "";
    topic.macos_calendar_name = "";
  }
}

async function createMacOSCalendarEvent({ title, description, date, startTime, endTime, calendarName }) {
  const startDateScript = buildAppleScriptDate("startDate", date, startTime);
  const endDateScript = buildAppleScriptDate("endDate", date, endTime);
  const script = `
tell application id "com.apple.iCal"
  set preferredName to ${toAppleScriptString(calendarName || "")}
  set targetCalendar to missing value
  if preferredName is not "" then
    repeat with candidateCalendar in calendars
      if name of candidateCalendar is preferredName then
        set targetCalendar to candidateCalendar
        exit repeat
      end if
    end repeat
    if targetCalendar is missing value then error "找不到 macOS 日历「" & preferredName & "」"
  else
    repeat with candidateCalendar in calendars
      if writable of candidateCalendar is true then
        set targetCalendar to candidateCalendar
        exit repeat
      end if
    end repeat
    if targetCalendar is missing value then error "macOS 日历里没有可写日历"
  end if
  if writable of targetCalendar is false then error "macOS 日历「" & (name of targetCalendar) & "」是只读日历"

${startDateScript}
${endDateScript}
  set createdEvent to make new event at end of events of targetCalendar with properties {summary:${toAppleScriptString(title)}, start date:startDate, end date:endDate, description:${toAppleScriptString(description)}}
  return (uid of createdEvent) & tab & (name of targetCalendar)
end tell
`;
  return optionalString(await execText("osascript", ["-e", script], { timeoutMs: 60_000 }));
}

async function deleteMacOSCalendarEvent(eventUid) {
  if (!eventUid) return "missing";
  const script = `
tell application id "com.apple.iCal"
  set targetUid to ${toAppleScriptString(eventUid)}
  repeat with candidateCalendar in calendars
    set matchingEvents to every event of candidateCalendar whose uid is targetUid
    if (count of matchingEvents) > 0 then
      delete item 1 of matchingEvents
      return "deleted"
    end if
  end repeat
  return "missing"
end tell
`;
  const result = await execText("osascript", ["-e", script], { timeoutMs: 60_000 });
  return optionalString(result);
}

async function deleteMacOSCalendarEventsForTopic(topicId) {
  const normalizedTopicId = optionalString(topicId);
  if (!normalizedTopicId) return;
  const script = buildDeleteEventsByTopicScript(normalizedTopicId);
  await execText("osascript", ["-e", script], { timeoutMs: 60_000 });
}

async function getMacOSCalendarsPayload() {
  const calendars = await listMacOSCalendars();
  return {
    ok: true,
    calendars,
    writableCalendars: calendars.filter((calendar) => calendar.writable),
  };
}

async function getLarkCalendarsPayload() {
  const calendars = await listLarkCalendars();
  return {
    ok: true,
    calendars,
    writableCalendars: calendars.filter((calendar) => calendar.writable),
  };
}

async function listLarkCalendars() {
  if (Date.now() < larkCalendarListCache.expiresAt && larkCalendarListCache.value) {
    return larkCalendarListCache.value;
  }

  const result = await execJson("lark-cli", ["calendar", "calendars", "list"]);
  const list = result?.data?.calendar_list || result?.calendar_list || [];
  const calendars = list
    .map((calendar) => ({
      id: optionalString(calendar.calendar_id),
      summary: optionalString(calendar.summary_alias) || optionalString(calendar.summary),
      type: optionalString(calendar.type),
      role: optionalString(calendar.role),
      // google 等第三方日历 role 可能是 owner 但实际只读,不能当同步目标
      writable:
        ["writer", "owner"].includes(optionalString(calendar.role)) &&
        !calendar.is_third_party &&
        optionalString(calendar.type) !== "google",
    }))
    .filter((calendar) => calendar.id);

  larkCalendarListCache = { value: calendars, expiresAt: Date.now() + 60_000 };
  return calendars;
}

async function listMacOSCalendars() {
  const script = `
tell application id "com.apple.iCal"
  set calendarLines to ""
  repeat with candidateCalendar in calendars
    set calendarLines to calendarLines & (name of candidateCalendar) & tab & ((writable of candidateCalendar) as string) & linefeed
  end repeat
  return calendarLines
end tell
`;
  const output = await execText("osascript", ["-e", script], { timeoutMs: 30_000 });
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, writableText = "false"] = line.split("\t");
      return {
        name: optionalString(name),
        writable: writableText === "true",
      };
    })
    .filter((calendar) => calendar.name);
}

async function startLarkAuthRepair() {
  const status = await getLarkStatus();
  if (status.available) {
    return { ok: true, lark: status };
  }
  if (["cli_missing", "cli_uninitialized"].includes(status.setupState)) {
    throw badRequest(status.message || "请先完成 lark-cli 初始化，再开始飞书授权。");
  }
  if (status.setupState === "network_unavailable") {
    throw badRequest("当前网络不可用，无法打开飞书授权流程。网络恢复后再重试。");
  }

  const result = await execJson("lark-cli", ["auth", "login", "--domain", "calendar", "--json", "--no-wait"]);
  const verificationUrl = optionalString(result.verification_url);
  const deviceCode = optionalString(result.device_code);
  const expiresIn = Number(result.expires_in) || 600;
  const userCode = extractUserCode(verificationUrl);

  if (!verificationUrl || !deviceCode) {
    throw new Error("未能生成飞书授权链接");
  }

  const flow = {
    deviceCode,
    verificationUrl,
    userCode,
    expiresIn,
    startedAt: new Date().toISOString(),
  };

  authFlowCache = {
    value: flow,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return { ok: true, flow };
}

async function finishLarkAuthRepair() {
  if (!authFlowCache.value || Date.now() > authFlowCache.expiresAt) {
    throw badRequest("授权会话已过期，请重新点击“修复授权”");
  }

  try {
    await execText("lark-cli", ["auth", "login", "--device-code", authFlowCache.value.deviceCode], {
      timeoutMs: 120_000,
    });
  } catch (error) {
    const lark = await getLarkStatusForce();
    if (lark.available) {
      authFlowCache = { expiresAt: 0, value: null };
      return { ok: true, lark };
    }
    throw badRequest(`还没有完成飞书授权：${error.message}`);
  }

  authFlowCache = { expiresAt: 0, value: null };
  return { ok: true, lark: await getLarkStatusForce() };
}

async function probeLarkAvailability(currentStatus) {
  try {
    const calendar = await fetchPrimaryCalendar();
    const refreshed = await execJson("lark-cli", ["auth", "status"]);
    const next = normalizeLarkStatus(refreshed, {
      canRepair: true,
      autoRecovered: true,
    });
    next.available = true;
    next.setupState = "connected";
    next.statusLabel = "已连接";
    next.message = "飞书授权可用，可以同步主日历。";
    next.calendarId = calendar.id;
    next.calendarName = calendar.summary;

    const settings = await getPlannerSettings();
    if (settings.larkCalendarId) {
      next.calendarId = settings.larkCalendarId;
      next.calendarName = settings.larkCalendarName || calendar.summary;
    }

    return next;
  } catch (error) {
    const networkUnavailable = isNetworkError(error);
    return {
      ...currentStatus,
      available: false,
      setupState: networkUnavailable ? "network_unavailable" : "calendar_unavailable",
      statusLabel: networkUnavailable ? "网络不可用" : "日历不可用",
      message: networkUnavailable
        ? "飞书授权可能已就绪，但当前网络无法读取主日历。"
        : `飞书账号已授权，但读取主日历失败：${error.message}`,
      canRepair: !networkUnavailable,
    };
  }
}

async function fetchPrimaryCalendarId() {
  const calendar = await fetchPrimaryCalendar();
  return calendar.id;
}

async function fetchPrimaryCalendar() {
  const result = await execJson("lark-cli", ["calendar", "calendars", "primary"]);
  const calendar = result?.data?.calendars?.[0]?.calendar || result?.calendars?.[0]?.calendar || {};
  return {
    id: calendar.calendar_id || "primary",
    summary: calendar.summary || "主日历",
  };
}

async function getLarkStatusForce() {
  authCache = { expiresAt: 0, value: null };
  calendarCache = { expiresAt: 0, value: null };
  return getLarkStatus();
}

function normalizeLarkStatus(status, overrides = {}) {
  // lark-cli >=1.x 把用户授权信息嵌套到 identities.user.*；旧版是顶层字段，做兼容回退
  const user = (status && status.identities && status.identities.user) || {};
  const tokenStatus = user.tokenStatus || status.tokenStatus || "unknown";
  const value = {
    available: false,
    identity: user.openId || status.identity || "",
    userName: user.userName || status.userName || "",
    tokenStatus,
    expiresAt: user.expiresAt || status.expiresAt || "",
    canRepair: overrides.canRepair ?? true,
    autoRecovered: Boolean(overrides.autoRecovered),
    setupState: tokenStatus === "valid" ? "calendar_checking" : tokenStatus === "needs_refresh" ? "auth_refresh_needed" : "auth_invalid",
    statusLabel: tokenStatus === "valid" ? "检查日历中" : tokenStatus === "needs_refresh" ? "授权待刷新" : "待授权",
    message: tokenStatus === "valid" ? "飞书用户授权存在，正在确认主日历是否可用。" : "需要重新授权飞书日历权限。",
    calendarId: "",
    calendarName: "",
  };
  return value;
}

function createLarkUnavailableStatus(error) {
  const message = optionalString(error?.message);
  const code = optionalString(error?.code);
  const cliMissing = code === "ENOENT" || /ENOENT|spawn .*lark-cli|not found/i.test(message);
  const cliUninitialized = /config init|not initialized|no config|appId|appSecret|配置|初始化/i.test(message);
  const networkUnavailable = isNetworkError(error);

  if (cliMissing) {
    return {
      available: false,
      identity: "",
      userName: "",
      tokenStatus: "cli_missing",
      expiresAt: "",
      canRepair: false,
      autoRecovered: false,
      setupState: "cli_missing",
      statusLabel: "待初始化 CLI",
      message: "服务端没有找到 lark-cli。请安装或把 LARK_CLI_PATH 指到 lark-cli 可执行文件。",
      calendarId: "",
      calendarName: "",
    };
  }

  if (cliUninitialized) {
    return {
      available: false,
      identity: "",
      userName: "",
      tokenStatus: "unconfigured",
      expiresAt: "",
      canRepair: false,
      autoRecovered: false,
      setupState: "cli_uninitialized",
      statusLabel: "待初始化 CLI",
      message: "lark-cli 还没有应用配置。先运行 lark-cli config init --new。",
      calendarId: "",
      calendarName: "",
    };
  }

  if (networkUnavailable) {
    return {
      available: false,
      identity: "",
      userName: "",
      tokenStatus: "network_unavailable",
      expiresAt: "",
      canRepair: false,
      autoRecovered: false,
      setupState: "network_unavailable",
      statusLabel: "网络不可用",
      message: "当前网络无法访问飞书，网络恢复后再检测。",
      calendarId: "",
      calendarName: "",
    };
  }

  return {
    available: false,
    identity: "",
    userName: "",
    tokenStatus: "invalid",
    expiresAt: "",
    canRepair: true,
    autoRecovered: false,
    setupState: "auth_invalid",
    statusLabel: "待授权",
    message: message || "需要完成飞书用户日历授权。",
    calendarId: "",
    calendarName: "",
  };
}

function isNetworkError(error) {
  const message = optionalString(error?.message);
  return /ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|network|timeout|TLS|EAI_AGAIN|网络/i.test(message);
}

function extractUserCode(verificationUrl) {
  try {
    const url = new URL(verificationUrl);
    return url.searchParams.get("user_code") || "";
  } catch {
    return "";
  }
}

async function execJson(command, args) {
  const stdout = await execText(command, args);
  const trimmed = stdout.trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed);
}

function execText(command, args, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const { vaultRoot } = await getPlannerPaths();
      const executable = await resolveCommand(command);
      execFile(
        executable,
        args,
        {
          cwd: vaultRoot,
          env: buildCommandEnv(command),
          maxBuffer: 4 * 1024 * 1024,
          timeout: options.timeoutMs || 90_000,
        },
        (error, stdout, stderr) => {
          if (error) {
            const detail = stderr?.trim() || stdout?.trim() || error.message;
            const commandError = new Error(detail);
            commandError.code = error.code;
            reject(commandError);
            return;
          }
          resolve(stdout);
        },
      );
    } catch (error) {
      reject(error);
    }
  });
}

async function resolveCommand(command) {
  if (command === "osascript" && process.env.OSASCRIPT_PATH) {
    return process.env.OSASCRIPT_PATH;
  }
  if (command !== "lark-cli") return command;
  for (const candidate of LARK_CLI_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Try the next known install location before falling back to PATH.
    }
  }
  return command;
}

function buildCommandEnv(command) {
  if (command !== "lark-cli") return process.env;
  const pathEntries = [
    path.dirname(process.env.LARK_CLI_PATH || ""),
    process.env.HOME ? path.join(process.env.HOME, ".npm-global/bin") : "",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    process.env.PATH || "",
  ].filter(Boolean);
  return {
    ...process.env,
    PATH: Array.from(new Set(pathEntries.join(":").split(":").filter(Boolean))).join(":"),
  };
}

function isDemoConfigRun() {
  const configPath = getPlannerConfigPath(PROJECT_ROOT);
  return isPathInside(SAMPLE_VAULT_ROOT, configPath);
}

async function plannerConfigExists() {
  try {
    await fs.access(getPlannerConfigPath(PROJECT_ROOT));
    return true;
  } catch {
    return false;
  }
}

function isPathInside(parentPath, childPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function buildArchivePath(filePath) {
  const { archiveRoot } = await getPlannerPaths();
  const year = new Date().getFullYear().toString();
  const archiveDir = path.join(archiveRoot, year);
  const baseName = path.basename(filePath);
  const target = path.join(archiveDir, baseName);

  try {
    await fs.access(target);
    const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
    return path.join(archiveDir, `${path.basename(baseName, ".md")}-${stamp}.md`);
  } catch {
    return target;
  }
}

async function resolveTopicPath(relPath) {
  const clean = optionalString(relPath);
  if (!clean) {
    throw badRequest("缺少选题路径");
  }
  const { vaultRoot, topicDir } = await getPlannerPaths();
  const resolved = path.resolve(vaultRoot, clean);
  if (!resolved.startsWith(topicDir)) {
    throw badRequest("非法的选题路径");
  }
  return resolved;
}

function normalizeDateString(value) {
  const text = optionalString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeTimeString(value) {
  const text = optionalString(value);
  return /^\d{2}:\d{2}$/.test(text) ? text : "";
}

function toEpochSeconds(date, time) {
  const iso = `${date}T${time}:00+08:00`;
  return Math.floor(new Date(iso).getTime() / 1000);
}

function normalizeCalendarProvider(value) {
  const provider = optionalString(value);
  return ["none", "lark", "macos"].includes(provider) ? provider : "none";
}

function optionalString(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function validateVaultRelativeDirectory(value, label) {
  const rawValue = optionalString(value).replace(/\\/g, "/");
  const withoutTrailingSlashes = rawValue.replace(/\/+$/g, "");
  if (!withoutTrailingSlashes) return "";
  if (path.posix.isAbsolute(withoutTrailingSlashes)) {
    throw badRequest(`${label}必须是当前 Vault 内的相对路径`);
  }
  const normalized = path.posix.normalize(withoutTrailingSlashes);
  if (normalized === ".." || normalized.startsWith("../")) {
    throw badRequest(`${label}不能指向 Vault 外部`);
  }
  return normalized;
}

function assertLocalRequest(req) {
  const address = optionalString(req.socket?.remoteAddress).toLowerCase();
  const isLoopback = address === "::1"
    || address.startsWith("127.")
    || address.startsWith("::ffff:127.");
  if (!isLoopback) {
    const error = new Error("文件夹选择器只能从本机打开");
    error.statusCode = 403;
    throw error;
  }
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function slugify(value) {
  const stripped = String(value)
    .replace(/^【选题】/, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (stripped) return stripped;
  return stableHash(value).slice(0, 10);
}

function stableHash(value) {
  return createHash("sha1").update(String(value)).digest("hex");
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function serveStatic(pathname, res) {
  const targetPath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(targetPath).replace(/^(\.\.[/\\])+/, ""));

  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": "no-store",
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function respondJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function respondError(res, error) {
  const status = error?.statusCode || 500;
  respondJson(
    res,
    {
      ok: false,
      error: error.message || "未知错误",
    },
    status,
  );
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
