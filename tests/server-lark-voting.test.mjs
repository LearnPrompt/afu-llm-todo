import test from 'node:test';
import assert from 'node:assert/strict';

import { spawnPlannerServer } from './helpers/spawn-server.mjs';
import { buildLarkStubScript } from './helpers/lark-stub.mjs';

const BASE_URL = 'https://example.feishu.cn/base/base_demo?table=tbl_vote';

function buildVotingStub({ failures = [], responseOverrides = {} } = {}) {
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
          { field_id: 'fld_doc', field_name: '飞书文档', type: 15 },
          { field_id: 'fld_vote_date', field_name: '入池日期', type: 5 },
        ],
      }),
      'docs +create --doc-format': JSON.stringify({
        ok: true,
        data: {
          document: {
            document_id: 'docx_vote_1',
            url: 'https://example.feishu.cn/docx/docx_vote_1',
          },
        },
      }),
      'docs +update --doc': JSON.stringify({ ok: true, data: { result: 'success' } }),
      'base +record-upsert --base-token': JSON.stringify({
        ok: true,
        data: {
          created: true,
          record: { record_id_list: ['rec_vote_1'] },
        },
      }),
      ...responseOverrides,
    },
    failures,
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
    assert.equal(created.json.documentCreated, true);
    assert.equal(created.json.recordId, 'rec_vote_1');
    assert.equal(created.json.documentUrl, 'https://example.feishu.cn/docx/docx_vote_1');
    assert.deepEqual(created.json.warnings, []);

    const savedAfterCreate = await server.readTopicCard('【选题】黄毛理论.md');
    assert.match(savedAfterCreate, /lark_voting_record_id: rec_vote_1/);
    assert.match(savedAfterCreate, /lark_voting_table_id: tbl_vote/);
    assert.match(savedAfterCreate, /lark_voting_doc_id: docx_vote_1/);
    assert.match(savedAfterCreate, /lark_voting_doc_url: "https:\/\/example\.feishu\.cn\/docx\/docx_vote_1"/);
    assert.match(savedAfterCreate, /lark_voting_date: \d{4}-\d{2}-\d{2}/);
    assert.match(savedAfterCreate, /lark_voting_summary: .*\u4efb\u4f55\u4eba\u90fd能在一句话内听懂这个选题/);

    const updated = await server.request('/api/topics/lark-voting', {
      method: 'POST',
      body: JSON.stringify({ path: relPath, summary: '第二版一句话。' }),
    });
    assert.equal(updated.status, 200, updated.text);
    assert.equal(updated.json.created, false);
    assert.equal(updated.json.documentCreated, false);
    assert.equal(updated.json.documentUrl, 'https://example.feishu.cn/docx/docx_vote_1');

    const logLines = (await server.readStubLog()).split('\n').filter(Boolean);
    const documentCreates = logLines.filter((line) => line.startsWith('docs +create'));
    const documentUpdates = logLines.filter((line) => line.startsWith('docs +update'));
    const upserts = logLines.filter((line) => line.startsWith('base +record-upsert'));
    assert.equal(documentCreates.length, 1);
    assert.equal(documentUpdates.length, 1);
    assert.match(documentCreates[0], /--title 选题｜黄毛理论/);
    assert.match(documentUpdates[0], /--doc docx_vote_1 --command overwrite/);
    assert.equal(upserts.length, 2);
    assert.doesNotMatch(upserts[0], /--record-id/);
    assert.match(upserts[0], /飞书文档/);
    assert.match(upserts[0], /https:\/\/example\.feishu\.cn\/docx\/docx_vote_1/);
    assert.match(upserts[0], /入池日期/);
    assert.match(upserts[1], /--record-id rec_vote_1/);
    assert.match(upserts[1], /第二版一句话/);
  } finally {
    await server.close();
  }
});

test('unscheduled topic enters the Base voting pool without writing a fake schedule', async () => {
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
    assert.equal(response.status, 200, response.text);
    assert.equal(response.json.created, true);
    assert.equal(response.json.topic.stage, '待投票');
    assert.equal(response.json.topic.scheduledDate, '');

    const saved = await server.readTopicCard('【选题】还没排期.md');
    assert.match(saved, /stage: 待投票/);
    assert.match(saved, /lark_voting_doc_id: docx_vote_1/);
    assert.match(saved, /lark_voting_record_id: rec_vote_1/);

    const upsert = (await server.readStubLog()).split('\n').find((line) => line.startsWith('base +record-upsert'));
    assert.ok(upsert);
    assert.doesNotMatch(upsert, /排期时间/);
  } finally {
    await server.close();
  }
});

test('scheduling a voting topic refreshes the same Feishu document and record', async () => {
  const server = await spawnPlannerServer({
    settings: { larkVotingBaseUrl: BASE_URL },
    larkStub: buildVotingStub(),
  });
  try {
    const relPath = await server.writeTopicCard('【选题】先投票再排期.md', [
      'type: topic',
      'topic_id: topic-vote-then-schedule',
      'status: active',
      'stage: 待排期',
    ]);

    const voted = await server.request('/api/topics/lark-voting', {
      method: 'POST',
      body: JSON.stringify({ path: relPath, summary: '先让团队判断是否值得做。' }),
    });
    assert.equal(voted.status, 200, voted.text);

    const scheduled = await server.request('/api/topics/schedule', {
      method: 'POST',
      body: JSON.stringify({
        path: relPath,
        scheduledDate: '2026-08-12',
        scheduledStart: '14:00',
        scheduledEnd: '15:00',
        calendarProvider: 'none',
      }),
    });
    assert.equal(scheduled.status, 200, scheduled.text);
    assert.equal(scheduled.json.topic.stage, '已排期');
    assert.equal(scheduled.json.topic.scheduledDate, '2026-08-12');

    const logLines = (await server.readStubLog()).split('\n').filter(Boolean);
    assert.equal(logLines.filter((line) => line.startsWith('docs +create')).length, 1);
    assert.equal(logLines.filter((line) => line.startsWith('docs +update')).length, 1);
    const upserts = logLines.filter((line) => line.startsWith('base +record-upsert'));
    assert.equal(upserts.length, 2);
    assert.match(upserts[1], /--record-id rec_vote_1/);
    assert.match(upserts[1], /排期时间/);
    assert.match(upserts[1], /2026-08-12 14:00:00/);

    const unscheduled = await server.request('/api/topics/unschedule', {
      method: 'POST',
      body: JSON.stringify({ path: relPath, removeFromCalendar: false }),
    });
    assert.equal(unscheduled.status, 200, unscheduled.text);
    assert.equal(unscheduled.json.topic.stage, '待投票');
    assert.deepEqual(unscheduled.json.warnings, []);

    const afterUnschedule = (await server.readStubLog()).split('\n').filter(Boolean);
    assert.equal(afterUnschedule.filter((line) => line.startsWith('docs +update')).length, 2);
    const afterUnscheduleUpserts = afterUnschedule.filter((line) => line.startsWith('base +record-upsert'));
    assert.equal(afterUnscheduleUpserts.length, 3);
    assert.match(afterUnscheduleUpserts[2], /--record-id rec_vote_1/);
    assert.match(afterUnscheduleUpserts[2], /排期时间[^}]*null/);
  } finally {
    await server.close();
  }
});

test('unscheduling a never-voted topic returns it to the scheduling pool without touching Feishu', async () => {
  const server = await spawnPlannerServer({
    settings: { larkVotingBaseUrl: BASE_URL },
    larkStub: buildVotingStub(),
  });
  try {
    const relPath = await server.writeTopicCard('【选题】普通已排期.md', [
      'type: topic',
      'topic_id: topic-unschedule-without-vote',
      'status: active',
      'stage: 已排期',
      'scheduled_date: 2026-08-15',
      'scheduled_start: 09:30',
      'scheduled_end: 11:00',
    ]);

    const response = await server.request('/api/topics/unschedule', {
      method: 'POST',
      body: JSON.stringify({ path: relPath, removeFromCalendar: false }),
    });
    assert.equal(response.status, 200, response.text);
    assert.equal(response.json.topic.stage, '待排期');
    assert.equal(response.json.topic.scheduledDate, '');
    assert.deepEqual(response.json.warnings, []);
    assert.equal(await server.readStubLog(), '');
  } finally {
    await server.close();
  }
});

test('Feishu refresh failure does not roll back a cancelled schedule', async () => {
  const server = await spawnPlannerServer({
    settings: { larkVotingBaseUrl: BASE_URL },
    larkStub: buildVotingStub({ failures: ['docs +update --doc'] }),
  });
  try {
    const relPath = await server.writeTopicCard('【选题】取消排期回填失败.md', [
      'type: topic',
      'topic_id: topic-unschedule-refresh-failure',
      'status: active',
      'stage: 已排期',
      'scheduled_date: 2026-08-16',
      'scheduled_start: 14:00',
      'scheduled_end: 15:00',
      'lark_voting_doc_id: docx_vote_1',
      'lark_voting_doc_url: https://example.feishu.cn/docx/docx_vote_1',
      'lark_voting_record_id: rec_vote_1',
      'lark_voting_summary: 测试取消排期',
    ]);

    const response = await server.request('/api/topics/unschedule', {
      method: 'POST',
      body: JSON.stringify({ path: relPath, removeFromCalendar: false }),
    });
    assert.equal(response.status, 200, response.text);
    assert.equal(response.json.topic.stage, '待投票');
    assert.equal(response.json.topic.scheduledDate, '');
    assert.match(response.json.topic.larkVotingSyncStatus, /取消排期已保存，飞书回填失败/);
    assert.equal(response.json.warnings.length, 1);
  } finally {
    await server.close();
  }
});

test('submitting an unscheduled in-progress topic preserves its workflow stage', async () => {
  const server = await spawnPlannerServer({
    settings: { larkVotingBaseUrl: BASE_URL },
    larkStub: buildVotingStub(),
  });
  try {
    const relPath = await server.writeTopicCard('【选题】正在制作.md', [
      'type: topic',
      'topic_id: topic-in-progress-vote',
      'status: active',
      'stage: 制作中',
    ]);

    const response = await server.request('/api/topics/lark-voting', {
      method: 'POST',
      body: JSON.stringify({ path: relPath, summary: '保持原工作流阶段。' }),
    });
    assert.equal(response.status, 200, response.text);
    assert.equal(response.json.topic.stage, '制作中');
  } finally {
    await server.close();
  }
});

test('a missing document URL is recovered from the configured Feishu origin', async () => {
  const server = await spawnPlannerServer({
    settings: { larkVotingBaseUrl: BASE_URL },
    larkStub: buildVotingStub(),
  });
  try {
    const relPath = await server.writeTopicCard('【选题】恢复文档链接.md', [
      'type: topic',
      'topic_id: topic-recover-doc-url',
      'status: active',
      'stage: 待投票',
      'lark_voting_doc_id: docx_vote_1',
      'lark_voting_record_id: rec_vote_1',
    ]);

    const response = await server.request('/api/topics/lark-voting', {
      method: 'POST',
      body: JSON.stringify({ path: relPath, summary: '恢复链接后继续更新。' }),
    });
    assert.equal(response.status, 200, response.text);
    assert.equal(response.json.documentCreated, false);
    assert.equal(response.json.documentUrl, 'https://example.feishu.cn/docx/docx_vote_1');
    const saved = await server.readTopicCard('【选题】恢复文档链接.md');
    assert.match(saved, /lark_voting_doc_url: "https:\/\/example\.feishu\.cn\/docx\/docx_vote_1"/);
  } finally {
    await server.close();
  }
});

test('a deleted Feishu document is recreated and the existing Base record is reused', async () => {
  const server = await spawnPlannerServer({
    settings: { larkVotingBaseUrl: BASE_URL },
    larkStub: buildVotingStub({
      failures: ['docs +update --doc'],
      responseOverrides: { 'docs +update --doc': 'document not found' },
    }),
  });
  try {
    const relPath = await server.writeTopicCard('【选题】重建飞书文档.md', [
      'type: topic',
      'topic_id: topic-recreate-doc',
      'status: active',
      'stage: 待投票',
      'lark_voting_doc_id: docx_deleted',
      'lark_voting_doc_url: https://example.feishu.cn/docx/docx_deleted',
      'lark_voting_record_id: rec_vote_1',
    ]);

    const response = await server.request('/api/topics/lark-voting', {
      method: 'POST',
      body: JSON.stringify({ path: relPath, summary: '文档删除后安全重建。' }),
    });
    assert.equal(response.status, 200, response.text);
    assert.equal(response.json.documentCreated, true);
    assert.equal(response.json.recordId, 'rec_vote_1');
    const logLines = (await server.readStubLog()).split('\n').filter(Boolean);
    assert.equal(logLines.filter((line) => line.startsWith('docs +create')).length, 1);
    assert.match(logLines.find((line) => line.startsWith('base +record-upsert')), /--record-id rec_vote_1/);
  } finally {
    await server.close();
  }
});

test('Feishu refresh failure does not roll back a saved schedule', async () => {
  const server = await spawnPlannerServer({
    settings: { larkVotingBaseUrl: BASE_URL },
    larkStub: buildVotingStub({ failures: ['docs +update --doc'] }),
  });
  try {
    const relPath = await server.writeTopicCard('【选题】排期回填失败.md', [
      'type: topic',
      'topic_id: topic-vote-refresh-failure',
      'status: active',
      'stage: 待排期',
    ]);
    const voted = await server.request('/api/topics/lark-voting', {
      method: 'POST',
      body: JSON.stringify({ path: relPath, summary: '先投票。' }),
    });
    assert.equal(voted.status, 200, voted.text);

    const scheduled = await server.request('/api/topics/schedule', {
      method: 'POST',
      body: JSON.stringify({
        path: relPath,
        scheduledDate: '2026-08-13',
        scheduledStart: '09:30',
        scheduledEnd: '11:00',
        calendarProvider: 'none',
      }),
    });
    assert.equal(scheduled.status, 200, scheduled.text);
    assert.equal(scheduled.json.topic.stage, '已排期');
    assert.equal(scheduled.json.topic.scheduledDate, '2026-08-13');
    assert.match(scheduled.json.topic.larkVotingSyncStatus, /回填失败/);
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
      'docs +create --doc-format': JSON.stringify({
        data: { document: { documentId: 'docx_minimal', url: 'https://example.feishu.cn/docx/docx_minimal' } },
      }),
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
    assert.equal(response.json.warnings.length, 5);

    const upsert = (await server.readStubLog()).split('\n').find((line) => line.startsWith('base +record-upsert'));
    assert.match(upsert, /\{"\u9009\u9898":"\u6700\u5c0f\u8868"\}/u);
    assert.doesNotMatch(upsert, /一句话/);
  } finally {
    await server.close();
  }
});

test('a created document is persisted before Base failure so retry updates it instead of duplicating it', async () => {
  const larkStub = buildLarkStubScript({
    responses: {
      'base +url-resolve --url': JSON.stringify({ baseToken: 'base_demo', tableId: 'tbl_vote' }),
      'base +field-list --base-token': JSON.stringify({ fields: [
        { fieldId: 'fld_title', fieldName: '选题', type: 1, isPrimary: true },
      ] }),
      'docs +create --doc-format': JSON.stringify({
        data: { document: { document_id: 'docx_retry', url: 'https://example.feishu.cn/docx/docx_retry' } },
      }),
      'docs +update --doc': JSON.stringify({ ok: true, data: { result: 'success' } }),
      'base +record-upsert --base-token': 'simulated Base failure',
    },
    failures: ['base +record-upsert --base-token'],
  });
  const server = await spawnPlannerServer({
    settings: { larkVotingBaseUrl: BASE_URL },
    larkStub,
  });
  try {
    const relPath = await server.writeTopicCard('【选题】失败重试.md', [
      'type: topic',
      'topic_id: topic-vote-retry',
      'stage: 已排期',
      'scheduled_date: 2026-08-08',
      'scheduled_start: 09:30',
    ], '# 【选题】失败重试\n\n正文。\n');

    const first = await server.request('/api/topics/lark-voting', {
      method: 'POST',
      body: JSON.stringify({ path: relPath, summary: '第一次。' }),
    });
    assert.equal(first.status, 500);
    const saved = await server.readTopicCard('【选题】失败重试.md');
    assert.match(saved, /lark_voting_doc_id: docx_retry/);
    assert.match(saved, /lark_voting_sync_status: .*待重试/);

    const second = await server.request('/api/topics/lark-voting', {
      method: 'POST',
      body: JSON.stringify({ path: relPath, summary: '第二次。' }),
    });
    assert.equal(second.status, 500);

    const logLines = (await server.readStubLog()).split('\n').filter(Boolean);
    assert.equal(logLines.filter((line) => line.startsWith('docs +create')).length, 1);
    assert.equal(logLines.filter((line) => line.startsWith('docs +update')).length, 1);
  } finally {
    await server.close();
  }
});
