import test from 'node:test';
import assert from 'node:assert/strict';

import { spawnPlannerServer } from './helpers/spawn-server.mjs';
import { buildLarkStubScript } from './helpers/lark-stub.mjs';

const BASE_URL = 'https://example.feishu.cn/base/base_demo?table=tbl_vote';

function buildVotingStub() {
  return buildLarkStubScript({
    responses: {
      'base +url-resolve --url': JSON.stringify({
        base_token: 'base_demo',
        table_id: 'tbl_vote',
      }),
      'base +field-list --base-token': JSON.stringify({
        items: [
          { field_id: 'fld_title', field_name: '选题', type: 1, is_primary: true },
          { field_id: 'fld_summary', field_name: '一句话', type: 1 },
          { field_id: 'fld_tags', field_name: '标签', type: 1 },
          { field_id: 'fld_source', field_name: '来源链接', type: 15 },
          { field_id: 'fld_schedule', field_name: '排期时间', type: 5 },
          { field_id: 'fld_path', field_name: 'Afu路径', type: 1 },
        ],
      }),
      'base +record-upsert --base-token': JSON.stringify({
        ok: true,
        data: {
          created: true,
          record: { record_id_list: ['rec_vote_1'] },
        },
      }),
    },
  });
}

test('scheduled topic creates one Base record and later updates the same record', async () => {
  const server = await spawnPlannerServer({
    settings: { larkVotingBaseUrl: BASE_URL },
    larkStub: buildVotingStub(),
  });
  try {
    const relPath = await server.writeTopicCard('【选题】黄毛理论.md', [
      'type: topic',
      'topic_id: topic-vote-1',
      'status: active',
      'stage: 已排期',
      'scheduled_date: 2026-08-08',
      'scheduled_start: 14:00',
      'scheduled_end: 15:00',
      'source_url: https://example.com/source',
      'tags:',
      '  - 内容创作',
      '  - 大众传播',
    ], '# 【选题】黄毛理论\n\n用一句大白话说清选题。\n');

    const created = await server.request('/api/topics/lark-voting', {
      method: 'POST',
      body: JSON.stringify({ path: relPath, summary: '任何人都能在一句话内听懂这个选题。' }),
    });
    assert.equal(created.status, 200, created.text);
    assert.equal(created.json.created, true);
    assert.equal(created.json.recordId, 'rec_vote_1');
    assert.deepEqual(created.json.warnings, []);

    const savedAfterCreate = await server.readTopicCard('【选题】黄毛理论.md');
    assert.match(savedAfterCreate, /lark_voting_record_id: rec_vote_1/);
    assert.match(savedAfterCreate, /lark_voting_table_id: tbl_vote/);
    assert.match(savedAfterCreate, /lark_voting_summary: .*\u4efb\u4f55\u4eba\u90fd能在一句话内听懂这个选题/);

    const updated = await server.request('/api/topics/lark-voting', {
      method: 'POST',
      body: JSON.stringify({ path: relPath, summary: '第二版一句话。' }),
    });
    assert.equal(updated.status, 200, updated.text);
    assert.equal(updated.json.created, false);

    const logLines = (await server.readStubLog()).split('\n').filter(Boolean);
    const upserts = logLines.filter((line) => line.startsWith('base +record-upsert'));
    assert.equal(upserts.length, 2);
    assert.doesNotMatch(upserts[0], /--record-id/);
    assert.match(upserts[1], /--record-id rec_vote_1/);
    assert.match(upserts[1], /第二版一句话/);
  } finally {
    await server.close();
  }
});

test('topic must be scheduled before it can enter the Base voting pool', async () => {
  const server = await spawnPlannerServer({
    settings: { larkVotingBaseUrl: BASE_URL },
    larkStub: buildVotingStub(),
  });
  try {
    const relPath = await server.writeTopicCard('【选题】还没排期.md', [
      'type: topic',
      'topic_id: topic-vote-2',
      'status: active',
      'stage: 待排期',
    ]);

    const response = await server.request('/api/topics/lark-voting', {
      method: 'POST',
      body: JSON.stringify({ path: relPath, summary: '一句话' }),
    });
    assert.equal(response.status, 400);
    assert.match(response.json.error, /正式排期后/);
    assert.equal(await server.readStubLog(), '');
  } finally {
    await server.close();
  }
});

test('missing optional Base fields are skipped without changing the table schema', async () => {
  const larkStub = buildLarkStubScript({
    responses: {
      'base +url-resolve --url': JSON.stringify({ baseToken: 'base_demo', tableId: 'tbl_vote' }),
      'base +field-list --base-token': JSON.stringify({ fields: [
        { fieldId: 'fld_title', fieldName: '选题', type: 1, isPrimary: true },
      ] }),
      'base +record-upsert --base-token': JSON.stringify({ data: { record: { recordId: 'rec_minimal' } } }),
    },
  });
  const server = await spawnPlannerServer({
    settings: { larkVotingBaseUrl: BASE_URL },
    larkStub,
  });
  try {
    const relPath = await server.writeTopicCard('【选题】最小表.md', [
      'type: topic',
      'topic_id: topic-vote-3',
      'stage: 已排期',
      'scheduled_date: 2026-08-08',
      'scheduled_start: 09:30',
    ], '# 【选题】最小表\n\n一句话。\n');

    const response = await server.request('/api/topics/lark-voting', {
      method: 'POST',
      body: JSON.stringify({ path: relPath, summary: '一句话。' }),
    });
    assert.equal(response.status, 200, response.text);
    assert.equal(response.json.warnings.length, 3);

    const upsert = (await server.readStubLog()).split('\n').find((line) => line.startsWith('base +record-upsert'));
    assert.match(upsert, /\{"\u9009\u9898":"\u6700\u5c0f\u8868"\}/u);
    assert.doesNotMatch(upsert, /一句话/);
  } finally {
    await server.close();
  }
});
