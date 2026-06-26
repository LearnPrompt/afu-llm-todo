import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildTopicDraftFromInbox, deriveInboxCandidate } from "./inbox-import.mjs";
import { appendOperationLog } from "./operation-log.mjs";
import {
  getPlannerConfigPath,
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
import { normalizeDisplayTitle } from "./topic-utils.mjs";

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
let plannerSettingsCache = null;

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/topics" && req.method === "GET") {
      return respondJson(res, await buildTopicsPayload());
    }

    if (url.pathname === "/api/inbox-candidates" && req.method === "GET") {
      return respondJson(res, await buildInboxCandidatesPayload());
    }

    if (url.pathname === "/api/inbox/import" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await importInboxCandidate(body));
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
      return respondJson(res, await scheduleTopic(body));
    }

    if (url.pathname === "/api/topics/disposition" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await disposeTopic(body));
    }

    if (url.pathname === "/api/topics/unschedule" && req.method === "POST") {
      const body = await readJsonBody(req);
      return respondJson(res, await unscheduleTopic(body));
    }

    if (url.pathname === "/api/lark/repair/start" && req.method === "POST") {
      return respondJson(res, await startLarkAuthRepair());
    }

    if (url.pathname === "/api/lark/repair/finish" && req.method === "POST") {
      return respondJson(res, await finishLarkAuthRepair());
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

async function buildInboxCandidatesPayload() {
  const topics = await listTopics();
  const inboxAnalysis = await analyzeInboxCandidates(topics);
  return {
    generatedAt: new Date().toISOString(),
    candidates: inboxAnalysis.candidates,
    summary: inboxAnalysis.summary,
  };
}

async function getPlannerSettingsPayload() {
  const settings = await getPlannerSettings();
  return {
    ok: true,
    configPath: getPlannerConfigPath(PROJECT_ROOT),
    settings,
  };
}

async function savePlannerSettingsPayload(payload) {
  const workspaceMode = payload.workspaceMode === 'standalone' ? 'standalone' : 'obsidian';
  if (workspaceMode === 'obsidian' && !optionalString(payload.vaultRoot)) {
    throw badRequest("Obsidian 模式必须填写 Vault 根目录");
  }

  if (isDemoConfigRun()) {
    const requestedVaultRoot = path.resolve(optionalString(payload.vaultRoot));
    if (requestedVaultRoot !== SAMPLE_VAULT_ROOT) {
      throw badRequest("当前 4317 运行在 Sample Vault 演示环境，不能把 demo 配置保存成真实 Vault。请切回真实服务后再保存真实路径。");
    }
  }

  const settings = await savePlannerSettings(payload, { projectRoot: PROJECT_ROOT });
  plannerSettingsCache = settings;
  resetRuntimeCaches();
  return {
    ok: true,
    configPath: getPlannerConfigPath(PROJECT_ROOT),
    settings,
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
}

async function listTopics() {
  const { topicDir } = await getPlannerPaths();
  const entries = await fs.readdir(topicDir, { withFileTypes: true });
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
  summary.inboxCandidateFiles = candidates.length;
  return { candidates, summary };
}

function isSystemInboxFile(relPath) {
  const basename = path.basename(relPath);
  return basename === "README.md" || basename.startsWith(".");
}

function titleKeywords(title) {
  const stops = new Set(['的', '了', '是', '在', '有', '和', '与', '从', '为', '把', '被', '对', '让', '能', '也', '都', '就', '到', '中', '上', '下', '来', '去', '会', '要', '这', '那', '个', '着', '过', '一', '不', '我', '你', '他', '她']);
  return new Set(
    title
      .replace(/[，。！？、：；「」【】《》()（）[\]\/\\,.!?;:\-_\s]/g, ' ')
      .split(/\s+/)
      .flatMap(t => /[一-鿿]/.test(t) ? [...t] : [t])
      .filter(t => t.length > 0 && !stops.has(t))
      .map(t => t.toLowerCase())
  );
}

function keywordOverlap(a, b) {
  const ka = titleKeywords(a);
  const kb = titleKeywords(b);
  if (!ka.size || !kb.size) return 0;
  let shared = 0;
  for (const k of ka) if (kb.has(k)) shared++;
  return shared / Math.min(ka.size, kb.size);
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

  // Dedup: 标题关键词重叠 ≥50% 时合并到已有卡
  const topics = await listTopics();
  const duplicate = topics.find(t => keywordOverlap(candidate.title, t.title) >= 0.5);
  if (duplicate) {
    const absoluteTopicPath = path.join(vaultRoot, duplicate.path);
    const existing = await fs.readFile(absoluteTopicPath, "utf8");
    await fs.writeFile(absoluteTopicPath, existing + buildAppendSection(candidate), "utf8");
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
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
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
  await deleteCalendarEventsExcept(topic, calendarProvider);

  if (calendarProvider !== "none") {
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
  } else {
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

async function disposeTopic(payload) {
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

  if (removeFromCalendar) {
    await deleteSyncedCalendarEvent(topic);
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
  if (topic.sourceInboxPath) {
    try {
      const inboxSourceAbs = await resolveInboxPath(topic.sourceInboxPath);
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
    ...(topic.sourceInboxPath && { inboxSourcePath: topic.sourceInboxPath, inboxSourceDeleted }),
  });

  return {
    ok: true,
    archived: true,
    archivePath: path.relative((await getPlannerPaths()).vaultRoot, archivePath),
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

  const calendarId = topic.lark_calendar_id || (await getPrimaryCalendarId());
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

  if (topic.lark_event_id) {
    await execJson("lark-cli", [
      "calendar",
      "events",
      "patch",
      "--params",
      JSON.stringify({ calendar_id: calendarId, event_id: topic.lark_event_id }),
      "--data",
      JSON.stringify(data),
    ]);

    return {
      provider: "lark",
      syncStatus: "已同步",
      eventId: topic.lark_event_id,
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

  const description = [
    "由 Topic Planner 自动同步",
    `topic_id: ${topic.topic_id}`,
    `路径: ${topicPath}`,
  ].join("\n");
  const eventUid = await createMacOSCalendarEvent({
    title,
    description,
    startMs: toEpochMilliseconds(topic.scheduled_date, topic.scheduled_start),
    endMs: toEpochMilliseconds(topic.scheduled_date, topic.scheduled_end),
    calendarName: settings.macosCalendarName,
  });

  return {
    provider: "macos",
    syncStatus: eventUid ? "已同步" : "同步失败",
    eventId: "",
    calendarId: "",
    macosEventId: eventUid,
    macosCalendarName: settings.macosCalendarName || "默认日历",
  };
}

async function deleteLarkEvent(topic) {
  if (!topic.lark_event_id) return;
  const calendarId = topic.lark_calendar_id || (await getPrimaryCalendarId());
  await execJson("lark-cli", [
    "calendar",
    "events",
    "delete",
    "--params",
    JSON.stringify({ calendar_id: calendarId, event_id: topic.lark_event_id, need_notification: "false" }),
  ]);
}

async function deleteSyncedCalendarEvent(topic) {
  if (topic.lark_event_id) {
    await deleteLarkEvent(topic);
  }
  if (topic.macos_event_id) {
    await deleteMacOSCalendarEvent(topic.macos_event_id);
  }

  topic.calendar_provider = "none";
  topic.calendar_sync_status = "未同步";
  topic.lark_event_id = "";
  topic.lark_calendar_id = "";
  topic.macos_event_id = "";
  topic.macos_calendar_name = "";
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

async function createMacOSCalendarEvent({ title, description, startMs, endMs, calendarName }) {
  const script = `
(() => {
const Calendar = Application('Calendar');
Calendar.includeStandardAdditions = true;
const title = ${JSON.stringify(title)};
const description = ${JSON.stringify(description)};
const preferredName = ${JSON.stringify(calendarName || "")};
const startDate = new Date(${JSON.stringify(startMs)});
const endDate = new Date(${JSON.stringify(endMs)});
const calendars = Calendar.calendars();
let target = null;
if (preferredName) {
  target = calendars.find((calendar) => calendar.name() === preferredName);
}
if (!target) {
  target = calendars[0];
}
if (!target) {
  throw new Error('macOS 日历里没有可用日历');
}
const event = Calendar.Event({ summary: title, startDate, endDate, description });
target.events.push(event);
return event.uid();
})();
`;
  return optionalString(await execText("osascript", ["-l", "JavaScript", "-e", script], { timeoutMs: 60_000 }));
}

async function deleteMacOSCalendarEvent(eventUid) {
  if (!eventUid) return;
  const script = `
(() => {
const Calendar = Application('Calendar');
const uid = ${JSON.stringify(eventUid)};
const calendars = Calendar.calendars();
for (const calendar of calendars) {
  const matches = calendar.events.whose({ uid })();
  if (matches.length > 0) {
    matches[0].delete();
    return 'deleted';
  }
}
return 'missing';
})();
`;
  await execText("osascript", ["-l", "JavaScript", "-e", script], { timeoutMs: 60_000 });
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

function toEpochMilliseconds(date, time) {
  const iso = `${date}T${time}:00+08:00`;
  return new Date(iso).getTime();
}

function normalizeCalendarProvider(value) {
  const provider = optionalString(value);
  return ["none", "lark", "macos"].includes(provider) ? provider : "none";
}

function optionalString(value) {
  return value === undefined || value === null ? "" : String(value).trim();
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
