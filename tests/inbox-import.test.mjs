import test from 'node:test';
import assert from 'node:assert/strict';

import {
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

test('makeTopicFilename sanitizes path-hostile characters', () => {
  const filename = makeTopicFilename('Figma/Claude: Design? 太猛了');
  assert.equal(filename, '【选题】Figma-Claude- Design- 太猛了.md');
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
