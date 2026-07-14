import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { spawnPlannerServer } from './helpers/spawn-server.mjs';

async function writeInboxFile(server, fileName, content) {
  const filePath = path.join(server.vaultRoot, server.inboxDir, fileName);
  await fs.writeFile(filePath, content);
  return path.join(server.inboxDir, fileName);
}

test('inbox scan skips 同步助手 daily digest files', async () => {
  const server = await spawnPlannerServer();
  try {
    await writeInboxFile(
      server,
      '同步助手_2026-07-13.md',
      ['---', 'title: 每日同步汇总', '---', '', '今天同步了 12 条内容。'].join('\n'),
    );
    await writeInboxFile(
      server,
      '真实素材.md',
      [
        '---',
        'author: 某人',
        'url: https://example.com/real-article',
        '---',
        '',
        '这是一条正常的、信息量足够的收件箱素材正文，用来验证候选提取逻辑没有被误伤。',
      ].join('\n'),
    );

    const { status, json } = await server.request('/api/topics');
    assert.equal(status, 200);
    assert.equal(json.inboxSummary.inboxSkippedSystem, 1);
    assert.equal(json.inboxCandidates.length, 1);
    assert.ok(!json.inboxCandidates.some((c) => c.sourcePath.includes('同步助手')));
  } finally {
    await server.close();
  }
});

test('inbox scan dedupes candidates that normalize to the same URL, keeping the higher-confidence one', async () => {
  const server = await spawnPlannerServer();
  try {
    // Low confidence: short excerpt, tracked URL variant.
    await writeInboxFile(
      server,
      '低质量副本.md',
      [
        '---',
        'url: https://example.com/post?utm_source=wechat&from=timeline',
        '---',
        '',
        '太短了。',
      ].join('\n'),
    );
    // High confidence: long excerpt, canonical URL (no tracking params).
    await writeInboxFile(
      server,
      '高质量原文.md',
      [
        '---',
        'author: 某人',
        'url: https://example.com/post',
        '---',
        '',
        '这是同一篇文章更完整的收件箱记录，正文信息量足够，应该在去重时胜出并被保留下来。',
      ].join('\n'),
    );

    const { status, json } = await server.request('/api/topics');
    assert.equal(status, 200);
    assert.equal(json.inboxSummary.inboxSkippedDuplicate, 1);
    assert.equal(json.inboxCandidates.length, 1);
    assert.equal(json.inboxCandidates[0].sourcePath, path.join(server.inboxDir, '高质量原文.md'));
  } finally {
    await server.close();
  }
});

test('POST /api/inbox/dismiss marks the file processed and removes it from candidates', async () => {
  const server = await spawnPlannerServer();
  try {
    const relPath = await writeInboxFile(
      server,
      '待删除.md',
      [
        '---',
        'author: 某人',
        'url: https://example.com/to-dismiss',
        '---',
        '',
        '这条素材足够长，应该正常出现在候选列表中，直到被标记为已处理为止。',
      ].join('\n'),
    );

    const before = await server.request('/api/topics');
    assert.equal(before.json.inboxCandidates.length, 1);

    const { status, json } = await server.request('/api/inbox/dismiss', {
      method: 'POST',
      body: JSON.stringify({ sourcePath: relPath }),
    });
    assert.equal(status, 200);
    assert.equal(json.ok, true);

    const raw = await fs.readFile(path.join(server.vaultRoot, relPath), 'utf8');
    assert.match(raw, /^status: processed$/m);
    assert.match(raw, /url: https:\/\/example\.com\/to-dismiss/);

    const after = await server.request('/api/topics');
    assert.equal(after.json.inboxCandidates.length, 0);
  } finally {
    await server.close();
  }
});

test('POST /api/inbox/refetch rejects candidates with no recoverable link', async () => {
  const server = await spawnPlannerServer();
  try {
    const relPath = await writeInboxFile(
      server,
      '没有链接.md',
      ['---', 'author: 某人', '---', '', '这条正文里没有任何可识别的分享短链，应该直接报错。'].join('\n'),
    );

    const { status, json } = await server.request('/api/inbox/refetch', {
      method: 'POST',
      body: JSON.stringify({ sourcePath: relPath }),
    });
    assert.equal(status, 400);
    assert.match(json.error, /人工补链接/);
  } finally {
    await server.close();
  }
});
