import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { spawnPlannerServer } from './helpers/spawn-server.mjs';

test('merge folds cards into primary, archives the rest with backlinks', async () => {
  const server = await spawnPlannerServer();
  try {
    const primary = await server.writeTopicCard('【选题】微软小红书视频.md', [
      'type: topic',
      'topic_id: topic-ms-main',
      'status: active',
      'stage: 待排期',
    ], '微软和小红书合作的商单视频,主卡正文。');
    const dupA = await server.writeTopicCard('【选题】微软 rednote 合作拆解.md', [
      'type: topic',
      'topic_id: topic-ms-a',
      'status: active',
      'stage: 待排期',
      'source_url: https://example.com/a',
    ], '同一件事的另一个来源 A。');
    const dupB = await server.writeTopicCard('【选题】微软联手小红书怎么看.md', [
      'type: topic',
      'topic_id: topic-ms-b',
      'status: active',
      'stage: 待排期',
    ], '同一件事的另一个来源 B。');

    const { status, json } = await server.request('/api/topics/merge', {
      method: 'POST',
      body: JSON.stringify({ primaryPath: primary, mergePaths: [dupA, dupB] }),
    });
    assert.equal(status, 200);
    assert.equal(json.merged.length, 2);

    const primaryContent = await server.readTopicCard('【选题】微软小红书视频.md');
    assert.ok(primaryContent.includes('主卡正文'));
    assert.ok(primaryContent.includes('合并进来的选题'));
    assert.ok(primaryContent.includes('另一个来源 A'));
    assert.ok(primaryContent.includes('另一个来源 B'));
    assert.ok(primaryContent.includes('**来源:** https://example.com/a'), 'source backlink preserved');

    // merged-away originals removed from topic dir, archived copies exist
    await assert.rejects(server.readTopicCard('【选题】微软 rednote 合作拆解.md'));
    const year = String(new Date().getFullYear());
    const archiveDir = path.join(server.vaultRoot, '99_系统/归档/行动卡片', year);
    const archived = await fs.readdir(archiveDir);
    assert.equal(archived.filter((name) => name.endsWith('.md')).length, 2);
    const archivedContent = await fs.readFile(path.join(archiveDir, archived.find((n) => n.includes('rednote'))), 'utf8');
    assert.ok(archivedContent.includes('drop_action: 合并'));
    assert.ok(archivedContent.includes('合并进 40_行动卡片/【选题】微软小红书视频.md'));
  } finally {
    await server.close();
  }
});

test('merge rejects merging a card into itself only', async () => {
  const server = await spawnPlannerServer();
  try {
    const only = await server.writeTopicCard('【选题】孤卡.md', [
      'type: topic',
      'topic_id: topic-solo',
      'status: active',
      'stage: 待排期',
    ]);
    const { status } = await server.request('/api/topics/merge', {
      method: 'POST',
      body: JSON.stringify({ primaryPath: only, mergePaths: [only] }),
    });
    assert.equal(status, 400);
  } finally {
    await server.close();
  }
});

test('suggest-merge-groups degrades to 503 without DEEPSEEK_API_KEY', async () => {
  const server = await spawnPlannerServer();
  try {
    const { status, json } = await server.request('/api/topics/suggest-merge-groups', { method: 'POST' });
    assert.equal(status, 503);
    assert.match(String(json.error || ''), /DEEPSEEK_API_KEY/);
  } finally {
    await server.close();
  }
});
