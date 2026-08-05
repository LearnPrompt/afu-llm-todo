import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMergeSuggestionPrompt,
  getDeepSeekApiKey,
  parseMergeSuggestion,
  suggestMergeGroups,
} from '../deepseek-client.mjs';

test('buildMergeSuggestionPrompt lists topics with 1-based indexes', () => {
  const prompt = buildMergeSuggestionPrompt([
    { title: '微软小红书视频', excerpt: '商单' },
    { title: '微软 rednote 合作拆解', excerpt: '' },
  ]);
  assert.ok(prompt.includes('1. 【微软小红书视频】 摘要: 商单'));
  assert.ok(prompt.includes('2. 【微软 rednote 合作拆解】'));
  assert.ok(prompt.includes('"groups"'));
});

test('parseMergeSuggestion accepts plain and fenced JSON', () => {
  const expected = [{ indexes: [1, 3], reason: '同一商单', suggestedTitle: '微软视频' }];
  const plain = parseMergeSuggestion('{"groups":[{"indexes":[1,3],"reason":"同一商单","suggestedTitle":"微软视频"}]}', 4);
  assert.deepEqual(plain, expected);
  const fenced = parseMergeSuggestion('```json\n{"groups":[{"indexes":[1,3],"reason":"同一商单","suggestedTitle":"微软视频"}]}\n```', 4);
  assert.deepEqual(fenced, expected);
});

test('parseMergeSuggestion drops out-of-range indexes and singleton groups', () => {
  const groups = parseMergeSuggestion(
    '{"groups":[{"indexes":[1,99],"reason":"越界后只剩一张"},{"indexes":[2],"reason":"单张"},{"indexes":[3,4],"reason":"有效"}]}',
    4,
  );
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].indexes, [3, 4]);
});

test('parseMergeSuggestion throws a clear error on garbage output', () => {
  assert.throws(() => parseMergeSuggestion('抱歉,我无法完成这个任务', 4), /不是合法 JSON/);
});

test('suggestMergeGroups fails with 503 when key is missing', async () => {
  await assert.rejects(
    suggestMergeGroups({ topics: [{ title: 'a' }, { title: 'b' }], env: {} }),
    (error) => error.statusCode === 503 && /DEEPSEEK_API_KEY/.test(error.message),
  );
});

test('suggestMergeGroups calls the API and maps the response', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"groups":[{"indexes":[1,2],"reason":"同一事件","suggestedTitle":"合并题"}]}' } }],
      }),
    };
  };
  const result = await suggestMergeGroups({
    topics: [{ title: '甲' }, { title: '乙' }],
    env: { DEEPSEEK_API_KEY: 'sk-test' },
    fetchImpl,
  });
  assert.equal(captured.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(captured.options.headers.authorization, 'Bearer sk-test');
  assert.deepEqual(result.groups, [{ indexes: [1, 2], reason: '同一事件', suggestedTitle: '合并题' }]);
});

test('suggestMergeGroups surfaces HTTP errors as 502 with manual fallback hint', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401, text: async () => 'invalid key' });
  await assert.rejects(
    suggestMergeGroups({ topics: [{ title: 'a' }, { title: 'b' }], env: { DEEPSEEK_API_KEY: 'sk-x' }, fetchImpl }),
    (error) => error.statusCode === 502 && /手动勾选/.test(error.message),
  );
});

test('getDeepSeekApiKey trims and defaults to empty', () => {
  assert.equal(getDeepSeekApiKey({ DEEPSEEK_API_KEY: '  sk-1  ' }), 'sk-1');
  assert.equal(getDeepSeekApiKey({}), '');
});
