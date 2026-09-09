import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyInboxCandidateEdits,
  buildInboxArchiveRelativePath,
  buildTopicDraftFromInbox,
  deriveInboxCandidate,
  makeTopicFilename,
  normalizeUrl,
} from '../inbox-import.mjs';

const sampleInboxPath = '00_收件箱/2026-04-18/宝玉- Anthropic 自家设计师 Ryan Mather，一人负责公司 7 个产品.md';

const sampleInboxRaw = `---
author: 宝玉
source: 微信
url: https://x.com/dotey/status/2045327385763913731?s=46
saved: 2026-04-18 12:50:28
tags:
  - 笔记同步助手
id: d4c482c8-9a43-4d83-b5ef-4ceb8272d9bc
---

Anthropic 自家设计师 Ryan Mather，一人负责公司 7 个产品线。

1. 别急着干活，先花一小时搭你的设计系统。

2. 别再玩接力，跟工程师一起边聊边改。
`;

test('deriveInboxCandidate extracts a usable candidate from inbox clipping', () => {
  const candidate = deriveInboxCandidate({
    filePath: sampleInboxPath,
    raw: sampleInboxRaw,
  });

  assert.equal(candidate.sourcePath, sampleInboxPath);
  assert.equal(candidate.sourceUrl, 'https://x.com/dotey/status/2045327385763913731?s=46');
  assert.match(candidate.title, /Ryan Mather/);
  assert.equal(candidate.author, '宝玉');
  assert.ok(candidate.excerpt.includes('Anthropic 自家设计师'));
  assert.equal(candidate.suggestedStage, '去重中');
  assert.equal(candidate.confidence, 'high');
});

test('deriveInboxCandidate falls back to body when title is generic thread', () => {
  const raw = `---\ntitle: Thread by @someone\nauthor: someone\nurl: https://x.com/someone/status/1\n---\n\n真正值得讲的不是工具本身，而是它把审美系统前置了。\n\n第二段。`;
  const candidate = deriveInboxCandidate({
    filePath: '00_收件箱/Thread by @someone.md',
    raw,
  });

  assert.doesNotMatch(candidate.title, /^Thread by/);
  assert.match(candidate.title, /真正值得讲的不是工具本身/);
  assert.equal(candidate.confidence, 'low');
});

test('deriveInboxCandidate marks sparse clips as low confidence', () => {
  const raw = `---\nauthor: someone\nsource: Web Clipper\n---\n\nClaude Design 很强。`;
  const candidate = deriveInboxCandidate({
    filePath: '00_收件箱/稀薄素材.md',
    raw,
  });

  assert.equal(candidate.confidence, 'low');
  assert.ok(candidate.reasons.length >= 1);
});

test('deriveInboxCandidate flags quota-failure notices even when url is present', () => {
  const raw = `---\nauthor: unknown\nsource: v.douyin.com\nurl: https://v.douyin.com/HJhdr2YooTQ/\n---\n\n[标题](https://v.douyin.com/HJhdr2YooTQ/)\n\n> 积分余额不足，视频转图文已跳过，仅保留原链接。\n\n---\n\n<sub>**积分余额不足，视频转图文已跳过**</sub>`;
  const candidate = deriveInboxCandidate({
    filePath: '00_收件箱/积分不足.md',
    raw,
  });

  assert.ok(!candidate.reasons.includes('缺少原始链接'));
  assert.ok(candidate.reasons.includes('内容疑似未完整抓取'));
});

test('deriveInboxCandidate prefers fetched Threads text over preserved sync boilerplate', () => {
  const raw = `---\ntitle: 雪豹镜头提示词\nauthor: liq_media\nurl: https://www.threads.com/@liq_media/post/ROOT123\n---\n\n<!-- afu-threads:ROOT123:start -->\n主帖真正正文\n\n## 作者连续回复\n\n### 1. https://www.threads.com/@liq_media/post/REPLY1\n\n作者补充正文\n\n---\n- 来源链接：https://www.threads.com/@liq_media/post/ROOT123\n- 作者：@liq_media\n- Threads 抓取日期：2026-08-08\n- 连续正文：2 条\n\n<!-- afu-threads:ROOT123:end -->\n\n## 原始同步内容\n\nThreads • Log in`;
  const candidate = deriveInboxCandidate({
    filePath: '00_收件箱/Threads • Log in.md',
    raw,
  });

  assert.equal(candidate.title, '雪豹镜头提示词');
  assert.equal(candidate.excerpt, '主帖真正正文 作者补充正文');
});

test('buildTopicDraftFromInbox creates planner-compatible topic card markdown', () => {
  const candidate = deriveInboxCandidate({
    filePath: sampleInboxPath,
    raw: sampleInboxRaw,
  });

  const draft = buildTopicDraftFromInbox(candidate);

  assert.ok(draft.filename.startsWith('【选题】'));
  assert.match(draft.filename, /\.md$/);
  assert.match(draft.content, /^---/);
  assert.match(draft.content, /type: 选题策划/);
  assert.match(draft.content, /stage: 去重中/);
  assert.match(draft.content, /target_forms:/);
  assert.match(draft.content, /- 视频/);
  assert.match(draft.content, /source_inbox_path:/);
  assert.match(draft.content, /source_url:/);
  assert.match(draft.content, /## 选题判断/);
  assert.match(draft.content, /## 可拍主张/);
  assert.match(draft.content, /## 当前素材/);
  assert.match(draft.content, /## 下一步/);
  assert.doesNotMatch(draft.content, /决定目标平台与形式/);
  assert.match(draft.content, /决定目标形式：视频 \/ 图文 \/ 短图文/);
  assert.match(draft.content, /\[\[00_收件箱\/2026-04-18\/宝玉- Anthropic 自家设计师 Ryan Mather，一人负责公司 7 个产品\.md\]\]/);
});

test('applyInboxCandidateEdits overrides the transfer copy without mutating the source candidate', () => {
  const candidate = deriveInboxCandidate({
    filePath: sampleInboxPath,
    raw: sampleInboxRaw,
  });
  const edited = applyInboxCandidateEdits(candidate, {
    title: '人工确认后的标题',
    excerpt: '人工补充后的正文内容，转卡时直接使用。',
  });

  assert.equal(candidate.title.includes('Ryan Mather'), true);
  assert.equal(edited.title, '人工确认后的标题');
  assert.equal(edited.excerpt, '人工补充后的正文内容，转卡时直接使用。');

  const draft = buildTopicDraftFromInbox(edited, '2026-08-04');
  assert.equal(draft.filename, '【选题】人工确认后的标题.md');
  assert.match(draft.content, /为什么值得看：人工补充后的正文内容，转卡时直接使用。/);
  assert.match(draft.content, new RegExp(sampleInboxPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('applyInboxCandidateEdits rejects empty or oversized user edits', () => {
  const candidate = deriveInboxCandidate({
    filePath: sampleInboxPath,
    raw: sampleInboxRaw,
  });

  assert.throws(() => applyInboxCandidateEdits(candidate, { title: '   ' }), /标题不能为空/);
  assert.throws(() => applyInboxCandidateEdits(candidate, { excerpt: 'x'.repeat(2001) }), /2000/);
});

test('makeTopicFilename sanitizes path-hostile characters', () => {
  const filename = makeTopicFilename('Figma/Claude: Design? 太猛了');
  assert.equal(filename, '【选题】Figma-Claude- Design- 太猛了.md');
});

test('buildInboxArchiveRelativePath preserves inbox nesting under the archive year', () => {
  const result = buildInboxArchiveRelativePath({
    sourcePath: '/vault/00_收件箱/2026-08-04/待判断.md',
    inboxRoot: '/vault/00_收件箱',
    year: '2026',
  });

  assert.equal(result, '2026/收件箱/2026-08-04/待判断.md');
});

test('buildInboxArchiveRelativePath rejects files outside the configured inbox', () => {
  assert.throws(() => buildInboxArchiveRelativePath({
    sourcePath: '/vault/15_自媒体/选题库/越界.md',
    inboxRoot: '/vault/00_收件箱',
    year: '2026',
  }), /只能归档收件箱目录内的文件/);
});

test('normalizeUrl strips utm_ params regardless of order', () => {
  const a = normalizeUrl('https://example.com/post?utm_source=wechat&id=42&utm_campaign=abc');
  const b = normalizeUrl('https://example.com/post?id=42&utm_campaign=abc&utm_source=wechat');
  assert.equal(a, b);
  assert.equal(a, 'https://example.com/post?id=42');
});

test('normalizeUrl strips known tracking params like from and share_from', () => {
  const url = normalizeUrl('https://x.com/dotey/status/123?from=timeline&share_from=wechat&s=46');
  assert.equal(url, 'https://x.com/dotey/status/123?s=46');
});

test('normalizeUrl drops trailing slash and fragment', () => {
  assert.equal(normalizeUrl('https://example.com/post/'), normalizeUrl('https://example.com/post'));
  assert.equal(normalizeUrl('https://example.com/post#section'), 'https://example.com/post');
});

test('normalizeUrl falls back to trimmed original value when unparsable', () => {
  assert.equal(normalizeUrl('  not a url  '), 'not a url');
  assert.equal(normalizeUrl(''), '');
});
