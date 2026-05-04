import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { appendOperationLog } from '../operation-log.mjs';
import {
  buildTodoCandidateStore,
  buildTodoCandidatesFromWiki,
  buildTopicDraftFromTodo,
  buildWikiIngestPacket,
  ensureWikiFiles,
} from '../wiki-mode.mjs';

const settings = {
  wikiMode: 'agent',
  wikiDir: '30_研究/内容Wiki',
  wikiIndexPath: '30_研究/内容Wiki/index.md',
  wikiLogPath: '30_研究/内容Wiki/log.md',
};

const candidates = [
  {
    sourcePath: '00_收件箱/LLM Wiki.md',
    sourceUrl: 'https://example.com/llm-wiki',
    title: 'Karpathy LLM Wiki 正在变成内容工作流',
    author: 'Demo',
    source: 'Web',
    confidence: 'high',
    excerpt: 'LLM Wiki 的重点不是检索，而是让知识持续编译并长出行动。',
    tags: ['LLM Wiki'],
  },
];

test('buildWikiIngestPacket creates markdown packet with source backlinks', () => {
  const packet = buildWikiIngestPacket({ candidates, settings, now: new Date('2026-05-04T01:00:00Z') });

  assert.equal(packet.sourceCount, 1);
  assert.match(packet.filename, /inbox-wiki-packet\.md$/);
  assert.match(packet.content, /type: llm-wiki-ingest-packet/);
  assert.match(packet.content, /\[\[00_收件箱\/LLM Wiki\.md\]\]/);
  assert.match(packet.content, /Todo 候选/);
});

test('buildTodoCandidatesFromWiki converts candidates to actionable todos', () => {
  const todos = buildTodoCandidatesFromWiki({ candidates, settings, packetPath: '30_研究/内容Wiki/inbox-packets/demo.md' });

  assert.equal(todos.length, 1);
  assert.equal(todos[0].status, 'proposed');
  assert.equal(todos[0].confidence, 'high');
  assert.deepEqual(todos[0].sourceWikiPages, ['30_研究/内容Wiki/inbox-packets/demo.md']);
});

test('buildTodoCandidatesFromWiki keeps the whole selected batch', () => {
  const batch = Array.from({ length: 8 }, (_, index) => ({
    ...candidates[0],
    sourcePath: `00_收件箱/demo-${index + 1}.md`,
    title: `批量素材 ${index + 1}`,
  }));
  const packet = buildWikiIngestPacket({ candidates: batch, settings, now: new Date('2026-05-04T01:00:00Z') });
  const todos = buildTodoCandidatesFromWiki({ candidates: batch, settings });

  assert.equal(packet.sourceCount, 8);
  assert.equal(todos.length, 8);
});

test('buildTopicDraftFromTodo creates planner-compatible topic card', () => {
  const [todo] = buildTodoCandidatesFromWiki({ candidates, settings });
  const draft = buildTopicDraftFromTodo(todo, '2026-05-04');

  assert.match(draft.filename, /^【选题】/);
  assert.match(draft.content, /source_wiki_pages:/);
  assert.match(draft.content, /llm_todo_status: accepted/);
  assert.match(draft.content, /## LLM Todo 判断/);
});

test('buildTodoCandidateStore and logs are writable', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'topic-planner-wiki-'));
  try {
    await ensureWikiFiles({ vaultRoot: root, settings });
    const todos = buildTodoCandidatesFromWiki({ candidates, settings });
    const store = buildTodoCandidateStore({ todos, settings });
    assert.match(store.content, /type: llm-todo-candidates/);

    const logPath = await appendOperationLog({
      vaultRoot: root,
      action: 'wiki-todo-generate',
      title: '生成 LLM Todo 候选',
      details: { count: '1' },
      now: new Date('2026-05-04T01:00:00Z'),
    });
    const raw = await readFile(path.join(root, logPath), 'utf8');
    assert.match(raw, /wiki-todo-generate/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
