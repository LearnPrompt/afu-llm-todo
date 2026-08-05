import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchThreadsThread,
  findRecoverableSocialUrl,
  getInstagramMediaReference,
  getThreadsPostReference,
  isInstagramUrl,
  isThreadsUrl,
  parseThreadsThreadHtml,
  upsertInstagramMarkdownSection,
  upsertThreadsMarkdownSection,
} from '../threads-fetch.mjs';

function post(code, username, text) {
  return {
    code,
    user: { username },
    caption: { text },
    taken_at: 1_700_000_000,
  };
}

function threadsHtml() {
  const payload = {
    require: [{
      result: {
        data: {
          data: {
            edges: [
              { node: { thread_items: [{ post: post('ROOT123', 'author', '主帖正文') }] } },
              {
                node: {
                  thread_items: [
                    { post: post('REPLY1', 'author', '作者连续回复一') },
                    { post: post('REPLY2', 'author', '作者连续回复二') },
                  ],
                },
              },
              { node: { thread_items: [{ post: post('COMMENT1', 'reader', '读者评论') }] } },
              { node: { thread_items: [{ post: post('LATE1', 'author', '评论之后的其他回复') }] } },
            ],
          },
          relatedPosts: {
            threads: [{ thread_items: [{ post: post('RELATED1', 'other', '相关推荐') }] }],
          },
        },
      },
    }],
  };
  return `<html><script type="application/json">${JSON.stringify(payload)}</script></html>`;
}

test('recognizes Threads and Instagram social links', () => {
  assert.equal(isThreadsUrl('https://www.threads.com/share/ABC123/'), true);
  assert.equal(isThreadsUrl('https://www.threads.net/@author/post/ROOT123'), true);
  assert.equal(isThreadsUrl('https://example.com/share/ABC123'), false);
  assert.equal(isInstagramUrl('https://www.instagram.com/reel/DbZJSzsqZ8H/?igsh=test'), true);
  assert.equal(isInstagramUrl('https://www.instagram.com/accounts/login/'), false);
});

test('findRecoverableSocialUrl extracts supported links from Markdown', () => {
  assert.equal(
    findRecoverableSocialUrl('[Threads](https://www.threads.com/share/ABC123/)'),
    'https://www.threads.com/share/ABC123/',
  );
  assert.equal(
    findRecoverableSocialUrl('视频：https://www.instagram.com/reel/DbZJSzsqZ8H/?igsh=abc。'),
    'https://www.instagram.com/reel/DbZJSzsqZ8H/?igsh=abc',
  );
  assert.equal(findRecoverableSocialUrl('https://example.com/article'), '');
});

test('getThreadsPostReference normalizes tracking parameters away', () => {
  assert.deepEqual(
    getThreadsPostReference('https://threads.com/@author/post/ROOT123?xmt=tracking'),
    {
      username: 'author',
      code: 'ROOT123',
      canonicalUrl: 'https://www.threads.com/@author/post/ROOT123',
    },
  );
});

test('getInstagramMediaReference normalizes Reel tracking parameters away', () => {
  assert.deepEqual(
    getInstagramMediaReference('https://www.instagram.com/reel/DbZJSzsqZ8H/?igsh=tracking'),
    {
      type: 'reel',
      code: 'DbZJSzsqZ8H',
      canonicalUrl: 'https://www.instagram.com/reel/DbZJSzsqZ8H/',
    },
  );
});

test('parseThreadsThreadHtml keeps the root and contiguous author replies only', () => {
  const result = parseThreadsThreadHtml(
    threadsHtml(),
    'https://www.threads.com/@author/post/ROOT123',
  );
  assert.equal(result.author, 'author');
  assert.deepEqual(result.posts.map((item) => item.code), ['ROOT123', 'REPLY1', 'REPLY2']);
  assert.ok(!result.posts.some((item) => item.code === 'COMMENT1'));
  assert.ok(!result.posts.some((item) => item.code === 'RELATED1'));
  assert.ok(!result.posts.some((item) => item.code === 'LATE1'));
});

test('fetchThreadsThread follows a share redirect and requests crawler HTML', async () => {
  let requestOptions;
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://www.threads.com/share/SHARE123/');
    requestOptions = options;
    return {
      ok: true,
      status: 200,
      url: 'https://www.threads.com/@author/post/ROOT123?xmt=tracking',
      text: async () => threadsHtml(),
    };
  };
  const result = await fetchThreadsThread('https://www.threads.com/share/SHARE123/', { fetchImpl });
  assert.match(requestOptions.headers['user-agent'], /Googlebot/);
  assert.equal(requestOptions.redirect, 'follow');
  assert.equal(result.canonicalUrl, 'https://www.threads.com/@author/post/ROOT123');
  assert.equal(result.posts.length, 3);
});

test('fetchThreadsThread retries a share shell with the alternate crawler identity', async () => {
  const userAgents = [];
  const fetchImpl = async (_url, options) => {
    userAgents.push(options.headers['user-agent']);
    if (userAgents.length === 1) {
      return {
        ok: true,
        status: 200,
        url: 'https://www.threads.com/share/SHARE123/',
        text: async () => '<html>share shell</html>',
      };
    }
    return {
      ok: true,
      status: 200,
      url: 'https://www.threads.com/@author/post/ROOT123',
      text: async () => threadsHtml(),
    };
  };
  const result = await fetchThreadsThread('https://www.threads.com/share/SHARE123/', { fetchImpl });
  assert.equal(userAgents.length, 2);
  assert.match(userAgents[1], /facebookexternalhit/);
  assert.equal(result.posts.length, 3);
});

test('upsertThreadsMarkdownSection is idempotent and refreshes generated content', () => {
  const thread = parseThreadsThreadHtml(threadsHtml(), 'https://www.threads.com/@author/post/ROOT123');
  const first = upsertThreadsMarkdownSection('---\ntitle: 原文\n---\n\n原始内容', thread, '2026-08-05');
  assert.match(first, /连续正文：3 条/);
  assert.match(first, /作者连续回复二/);
  const refreshed = upsertThreadsMarkdownSection(first, {
    ...thread,
    posts: thread.posts.slice(0, 2),
  }, '2026-08-06');
  assert.equal((refreshed.match(/afu-threads:ROOT123:start/g) || []).length, 1);
  assert.match(refreshed, /Threads 抓取日期 2026-08-06/);
  assert.doesNotMatch(refreshed, /作者连续回复二/);
});

test('upsertInstagramMarkdownSection upgrades the legacy append and stays idempotent', () => {
  const sourceUrl = 'https://www.instagram.com/reel/DbZJSzsqZ8H/?igsh=tracking';
  const legacy = [
    '---',
    'title: Reel',
    '---',
    '',
    '原始内容',
    '## 补充素材（抓取日期 2026-08-04）',
    `- 来源链接：${sourceUrl}`,
    '',
    '旧转写',
    '',
  ].join('\n');
  const first = upsertInstagramMarkdownSection(legacy, {
    sourceUrl,
    description: 'Instagram caption',
    transcript: 'First transcript',
  }, '2026-08-05');
  assert.doesNotMatch(first, /旧转写/);
  assert.match(first, /afu-instagram:DbZJSzsqZ8H:start/);
  assert.match(first, /Instagram caption/);

  const refreshed = upsertInstagramMarkdownSection(first, {
    sourceUrl,
    description: 'Updated caption',
    transcript: 'Updated transcript',
  }, '2026-08-06');
  assert.equal((refreshed.match(/afu-instagram:DbZJSzsqZ8H:start/g) || []).length, 1);
  assert.doesNotMatch(refreshed, /First transcript/);
  assert.match(refreshed, /Updated transcript/);
});
