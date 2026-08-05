import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { spawnPlannerServer } from './helpers/spawn-server.mjs';

test('archive disposition deletes the linked inbox source file', async () => {
  const server = await spawnPlannerServer();
  try {
    const inboxSourceRelPath = path.join(server.inboxDir, '2026-07-01', '过期素材.md');
    const inboxSourcePath = path.join(server.vaultRoot, inboxSourceRelPath);
    await fs.mkdir(path.dirname(inboxSourcePath), { recursive: true });
    await fs.writeFile(inboxSourcePath, '过期的原始素材内容。\n', 'utf8');

    const topicPath = await server.writeTopicCard('【选题】过期归档删除素材.md', [
      'type: topic',
      'topic_id: topic-expired-card',
      'status: active',
      'stage: 待排期',
      'priority: ⭐⭐⭐',
      `source_inbox_path: ${inboxSourceRelPath}`,
    ]);

    const { status, json } = await server.request('/api/topics/disposition', {
      method: 'POST',
      body: JSON.stringify({
        path: topicPath,
        action: '过期归档',
        reason: '时效已过',
      }),
    });

    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.ok, true);
    assert.equal(json.archived, true);
    await assert.rejects(fs.access(inboxSourcePath), { code: 'ENOENT' });
  } finally {
    await server.close();
  }
});
