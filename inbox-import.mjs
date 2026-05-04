import path from 'node:path';
import { createHash } from 'node:crypto';

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) {
    return { frontmatter: {}, body: raw };
  }
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };

  const lines = match[1].split(/\r?\n/);
  const frontmatter = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const keyMatch = line.match(/^([A-Za-z0-9_\-]+):\s*(.*)$/);
    if (!keyMatch) continue;

    const key = keyMatch[1];
    const rawValue = keyMatch[2];

    if (rawValue === '' && lines[index + 1]?.match(/^\s+-\s+/)) {
      const items = [];
      index += 1;
      while (index < lines.length && lines[index].match(/^\s+-\s+/)) {
        items.push(parseScalar(lines[index].replace(/^\s+-\s+/, '')));
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

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function stableHash(input) {
  return createHash('sha1').update(String(input)).digest('hex');
}

function slugify(input) {
  return String(input)
    .toLowerCase()
    .replace(/\[\[|\]\]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function normalizeWhitespace(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/\u200b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstMeaningfulLine(body) {
  const lines = String(body || '')
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line.replace(/^#+\s+/, '').replace(/^>\s?/, '')))
    .filter(Boolean);
  return lines.find((line) => line.length >= 8) || lines[0] || '';
}

function isGenericTitle(title) {
  const text = normalizeWhitespace(title);
  if (!text) return true;
  return /^thread by @/i.test(text) || /^untitled/i.test(text);
}

function trimTitle(text, max = 36) {
  const value = normalizeWhitespace(text).replace(/[。！？.!?]+$/u, '');
  if (value.length <= max) return value;
  return value.slice(0, max).replace(/[，、；：,.!！?？\-]+$/u, '').trim();
}

function extractTitleFromInbox(frontmatter, body, filePath) {
  const candidates = [frontmatter.title, frontmatter.description, path.basename(filePath, '.md'), firstMeaningfulLine(body)];
  for (const item of candidates) {
    if (!item) continue;
    if (item === path.basename(filePath, '.md') && isGenericTitle(item)) continue;
    const title = trimTitle(item);
    if (title && !isGenericTitle(title)) return title;
  }
  return trimTitle(path.basename(filePath, '.md'));
}

function extractExcerpt(body) {
  const lines = String(body || '')
    .replace(/!\[\[.*?\]\]/g, '')
    .replace(/\[\[(.*?)\]\]/g, '$1')
    .split(/\r?\n/)
    .map((line) => normalizeWhitespace(line.replace(/^#+\s+/, '').replace(/^>\s?/, '')))
    .filter(Boolean);
  return lines.slice(0, 3).join(' ').slice(0, 180);
}

function deriveInboxCandidate({ filePath, raw }) {
  const { frontmatter, body } = parseFrontmatter(raw);
  const title = extractTitleFromInbox(frontmatter, body, filePath);
  const sourceUrl = normalizeWhitespace(frontmatter.url || frontmatter.source_url || '');
  const excerpt = extractExcerpt(body);
  const reasons = [];
  if (!sourceUrl) reasons.push('缺少原始链接');
  if (excerpt.length < 32) reasons.push('正文信息太少');
  if (isGenericTitle(frontmatter.title || path.basename(filePath, '.md'))) reasons.push('标题需要人工确认');
  const confidence = reasons.length >= 2 ? 'low' : reasons.length === 1 ? 'medium' : 'high';
  return {
    sourcePath: filePath,
    sourceUrl,
    title,
    author: normalizeWhitespace(frontmatter.author || ''),
    source: normalizeWhitespace(frontmatter.source || ''),
    savedAt: normalizeWhitespace(frontmatter.saved || frontmatter.created || ''),
    tags: normalizeArray(frontmatter.tags),
    excerpt,
    dedupeKey: sourceUrl ? stableHash(sourceUrl).slice(0, 10) : stableHash(`${filePath}:${title}`).slice(0, 10),
    suggestedStage: '去重中',
    confidence,
    reasons,
  };
}

function formatScalar(value) {
  const text = String(value ?? '');
  if (text === '') return '';
  if (/^[\p{L}\p{N}\s_\-⭐+.\/@:]+$/u.test(text)) return text;
  return JSON.stringify(text);
}

function serializeField(key, value) {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${key}:`];
    return [`${key}:`, ...value.map((item) => `  - ${formatScalar(item)}`)];
  }
  if (value === undefined || value === null || value === '') return [`${key}:`];
  return [`${key}: ${formatScalar(value)}`];
}

function makeTopicFilename(title) {
  const safe = String(title)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return `【选题】${safe}.md`;
}

function buildTopicDraftFromInbox(candidate, today = new Date().toISOString().slice(0, 10)) {
  const frontmatter = {
    type: '选题策划',
    topic_id: `topic-${slugify(candidate.title)}-${candidate.dedupeKey.slice(0, 6)}`,
    status: 'active',
    stage: candidate.suggestedStage,
    priority: '⭐⭐',
    created: today,
    updated: today,
    target_forms: ['视频'],
    platforms: [],
    dedupe_key: slugify(candidate.title) || candidate.dedupeKey,
    scheduled_date: '',
    scheduled_start: '',
    scheduled_end: '',
    calendar_sync_status: '未同步',
    lark_calendar_id: '',
    lark_event_id: '',
    drop_action: '',
    drop_reason: '',
    source_inbox_path: candidate.sourcePath,
    source_url: candidate.sourceUrl,
    tags: candidate.tags.length ? candidate.tags.slice(0, 5) : ['待整理'],
  };

  const fmLines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    fmLines.push(...serializeField(key, value));
  }
  fmLines.push('---');

  const body = [
    `# ${makeTopicFilename(candidate.title).replace(/\.md$/, '')}`,
    '## 选题判断',
    `- 来源：[[${candidate.sourcePath}]]`,
    `- 为什么值得看：${candidate.excerpt || '先保留原文，待补核心判断。'}`,
    `- 当前状态：这是从收件箱基础素材自动生成的候选选题卡，优先补“给谁看、为什么现在做、能拍成什么”。`,
    '',
    '## 可拍主张',
    '- 开头钩子：待补',
    '- 主体结构：待补',
    '- 结果展示：待补',
    '',
    '## 当前素材',
    `- 原始收件箱：[[${candidate.sourcePath}]]`,
    candidate.sourceUrl ? `- 原文链接：${candidate.sourceUrl}` : '- 原文链接：待补',
    candidate.author ? `- 作者/来源：${candidate.author}${candidate.source ? ` / ${candidate.source}` : ''}` : (candidate.source ? `- 来源：${candidate.source}` : '- 来源：待补'),
    '',
    '## 下一步',
    '- 补一句明确结论：这条内容到底讲什么。',
    '- 决定目标形式：视频 / 图文 / 短图文。',
    '- 如果证据不足，先补 1-2 个对标案例或原始资料。',
  ].join('\n');

  return {
    filename: makeTopicFilename(candidate.title),
    content: `${fmLines.join('\n')}\n${body}\n`,
  };
}

export {
  buildTopicDraftFromInbox,
  deriveInboxCandidate,
  makeTopicFilename,
};
