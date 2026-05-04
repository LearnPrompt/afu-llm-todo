import path from 'node:path';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';

const PLANNER_TIME_ZONE = process.env.TOPIC_PLANNER_TIME_ZONE || 'Asia/Shanghai';

function todayString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PLANNER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function timestampSlug(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PLANNER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}T${values.hour}${values.minute}${values.second}`;
}

function stableHash(input) {
  return createHash('sha1').update(String(input)).digest('hex');
}

function slugify(input) {
  const text = String(input || '')
    .toLowerCase()
    .replace(/\[\[|\]\]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return text.slice(0, 48) || stableHash(input).slice(0, 10);
}

function formatScalar(value) {
  const text = String(value ?? '');
  if (text === '') return '';
  if (/^[\p{L}\p{N}\s_\-⭐+.\/@:]+$/u.test(text)) return text;
  return JSON.stringify(text);
}

function serializeField(key, value) {
  if (Array.isArray(value)) {
    if (!value.length) return [`${key}:`];
    return [`${key}:`, ...value.map((item) => `  - ${formatScalar(item)}`)];
  }
  if (value === undefined || value === null || value === '') return [`${key}:`];
  return [`${key}: ${formatScalar(value)}`];
}

function serializeFrontmatter(frontmatter) {
  return Object.entries(frontmatter).flatMap(([key, value]) => serializeField(key, value));
}

function frontmatterBlock(frontmatter) {
  return ['---', ...serializeFrontmatter(frontmatter), '---'].join('\n');
}

function buildWikiIngestPacket({ candidates = [], settings, now = new Date() }) {
  const date = todayString(now);
  const title = `内容收件箱 Wiki 编译包 ${date}`;
  const limitedCandidates = candidates;
  const sources = limitedCandidates.map((candidate) => candidate.sourcePath);
  const frontmatter = {
    type: 'llm-wiki-ingest-packet',
    status: 'draft',
    created: date,
    sources,
    wiki_dir: settings.wikiDir,
    candidate_count: String(limitedCandidates.length),
  };
  const sourceSections = limitedCandidates.map((candidate, index) => [
    `### ${index + 1}. ${candidate.title}`,
    `- 收件箱路径：[[${candidate.sourcePath}]]`,
    candidate.sourceUrl ? `- 原始链接：${candidate.sourceUrl}` : '- 原始链接：待补',
    candidate.author ? `- 作者：${candidate.author}` : '- 作者：待补',
    candidate.source ? `- 来源：${candidate.source}` : '- 来源：收件箱',
    `- 置信度：${candidate.confidence || 'medium'}`,
    `- 摘要：${candidate.excerpt || '待补'}`,
    '',
  ].join('\n'));

  const body = [
    `# ${title}`,
    '## 给 Agent 的任务',
    '请按 Karpathy LLM Wiki 的方式，把下面素材编译进内容 Wiki：',
    '- 更新或新建主题页、概念页、产品页。',
    '- 给每条判断保留来源回链。',
    '- 标出冲突、缺口和待验证项。',
    '- 最后生成 3-5 个可执行的内容 Todo 候选。',
    '',
    '## 输出要求',
    `- Wiki 目录：${settings.wikiDir}`,
    `- Index：${settings.wikiIndexPath}`,
    `- Log：${settings.wikiLogPath}`,
    '- Todo 候选要包含：标题、为什么现在做、来源、目标形式、预计耗时、置信度。',
    '',
    '## 待编译素材',
    ...sourceSections,
  ].join('\n');

  return {
    filename: `${timestampSlug(now)}-inbox-wiki-packet.md`,
    title,
    content: `${frontmatterBlock(frontmatter)}\n${body}\n`,
    sourceCount: limitedCandidates.length,
  };
}

function buildTodoCandidatesFromWiki({ candidates = [], settings, packetPath = '', now = new Date() }) {
  return candidates.map((candidate, index) => {
    const confidence = candidate.confidence === 'high' ? 'high' : candidate.confidence === 'low' ? 'low' : 'medium';
    return {
      id: `todo-${slugify(candidate.title)}-${stableHash(`${candidate.sourcePath}:${index}`).slice(0, 6)}`,
      title: candidate.title,
      sourceInboxPath: candidate.sourcePath,
      sourceUrl: candidate.sourceUrl || '',
      sourceWikiPages: packetPath ? [packetPath] : [settings.wikiIndexPath],
      reason: candidate.excerpt
        ? `这条素材已经有明确信息密度，可以先做成一张内容行动卡：${candidate.excerpt.slice(0, 96)}`
        : '这条素材来自收件箱候选，适合作为 Wiki Mode 的第一轮行动卡。',
      confidence,
      targetForms: inferTargetForms(candidate),
      estimatedMinutes: confidence === 'low' ? 60 : 45,
      status: 'proposed',
    };
  });
}

function inferTargetForms(candidate) {
  const text = `${candidate.title} ${candidate.excerpt} ${(candidate.tags || []).join(' ')}`;
  if (/小红书|短图文|卡片/u.test(text)) return ['短图文'];
  if (/公众号|文章|长文|博客|教程/u.test(text)) return ['图文'];
  return ['视频'];
}

function buildTodoCandidateStore({ todos, packetPath = '', settings, now = new Date() }) {
  const date = todayString(now);
  const frontmatter = {
    type: 'llm-todo-candidates',
    status: 'active',
    created: date,
    source_packet: packetPath,
    candidate_count: String(todos.length),
  };
  const body = [
    `# LLM Todo 候选 ${date}`,
    '## 使用方式',
    '这些候选由 Wiki Mode 从收件箱/Wiki 编译包生成。接受后会进入选题库；拒绝后只更新候选状态，不删除来源素材。',
    '',
    '## 候选',
    ...todos.map((todo, index) => [
      `### ${index + 1}. ${todo.title}`,
      `- id: ${todo.id}`,
      `- status: ${todo.status}`,
      `- confidence: ${todo.confidence}`,
      `- estimated_minutes: ${todo.estimatedMinutes}`,
      `- source_inbox_path: [[${todo.sourceInboxPath}]]`,
      `- source_wiki_pages: ${todo.sourceWikiPages.map((item) => `[[${item}]]`).join(', ')}`,
      `- reason: ${todo.reason}`,
      `- target_forms: ${todo.targetForms.join(', ')}`,
      '',
    ].join('\n')),
  ].join('\n');
  return {
    filename: `${timestampSlug(now)}-llm-todo-candidates.md`,
    content: `${frontmatterBlock(frontmatter)}\n${body}\n`,
  };
}

function buildTopicDraftFromTodo(todo, today = todayString()) {
  const frontmatter = {
    type: '选题策划',
    topic_id: `topic-${slugify(todo.title)}-${stableHash(todo.id).slice(0, 6)}`,
    status: 'active',
    stage: '去重中',
    priority: todo.confidence === 'high' ? '⭐⭐⭐' : '⭐⭐',
    created: today,
    updated: today,
    target_forms: todo.targetForms?.length ? todo.targetForms : ['视频'],
    platforms: [],
    dedupe_key: slugify(todo.title),
    scheduled_date: '',
    scheduled_start: '',
    scheduled_end: '',
    calendar_sync_status: '未同步',
    source_inbox_path: todo.sourceInboxPath,
    source_url: todo.sourceUrl || '',
    source_wiki_pages: todo.sourceWikiPages || [],
    llm_todo_reason: todo.reason,
    llm_todo_confidence: todo.confidence,
    llm_todo_status: 'accepted',
    tags: ['LLM Todo'],
  };
  const body = [
    `# 【选题】${todo.title}`,
    '## LLM Todo 判断',
    `- 为什么现在做：${todo.reason}`,
    `- 置信度：${todo.confidence}`,
    `- 预计投入：${todo.estimatedMinutes || 45} 分钟`,
    `- 来源 Wiki：${(todo.sourceWikiPages || []).map((item) => `[[${item}]]`).join('、') || '待补'}`,
    '',
    '## 选题判断',
    '- 给谁看：待补',
    '- 核心主张：待补',
    '- 为什么现在做：见 LLM Todo 判断',
    '',
    '## 可拍主张',
    '- 开头钩子：待补',
    '- 主体结构：待补',
    '- 结果展示：待补',
    '',
    '## 当前素材',
    `- 原始收件箱：[[${todo.sourceInboxPath}]]`,
    todo.sourceUrl ? `- 原文链接：${todo.sourceUrl}` : '- 原文链接：待补',
  ].join('\n');
  return {
    filename: `【选题】${todo.title.replace(/[\\/:*?"<>|]/g, '-')}.md`,
    content: `${frontmatterBlock(frontmatter)}\n${body}\n`,
  };
}

async function ensureWikiFiles({ vaultRoot, settings }) {
  const wikiRoot = path.join(vaultRoot, settings.wikiDir);
  const indexPath = path.join(vaultRoot, settings.wikiIndexPath);
  const logPath = path.join(vaultRoot, settings.wikiLogPath);
  await fs.mkdir(wikiRoot, { recursive: true });
  await fs.mkdir(path.dirname(indexPath), { recursive: true });
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  await ensureFile(indexPath, [
    '---',
    'type: llm-wiki-index',
    'status: active',
    '---',
    '# 内容 Wiki Index',
    '## 入口',
    '- Inbox packets 会记录收件箱批次。',
    '- Todo candidates 会记录可执行行动卡。',
    '',
  ].join('\n'));
  await ensureFile(logPath, [
    '---',
    'type: llm-wiki-log',
    'status: active',
    '---',
    '# 内容 Wiki Log',
    '',
  ].join('\n'));
}

async function ensureFile(filePath, content) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, `${content}\n`, 'utf8');
  }
}

async function appendWikiLog({ vaultRoot, settings, message, now = new Date() }) {
  const logPath = path.join(vaultRoot, settings.wikiLogPath);
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, `## [${now.toISOString()}] ${message}\n\n`, 'utf8');
  return path.relative(vaultRoot, logPath);
}

export {
  appendWikiLog,
  buildTodoCandidateStore,
  buildTodoCandidatesFromWiki,
  buildTopicDraftFromTodo,
  buildWikiIngestPacket,
  ensureWikiFiles,
};
