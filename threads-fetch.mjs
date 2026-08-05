const THREADS_HOSTS = new Set(['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net']);
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);
const THREADS_USER_AGENTS = [
  'Googlebot/2.1 (+https://www.google.com/bot.html)',
  'facebookexternalhit/1.1',
];
const MAX_THREADS_HTML_BYTES = 8 * 1024 * 1024;

function parseHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function isThreadsUrl(value) {
  const url = parseHttpUrl(value);
  return Boolean(url && THREADS_HOSTS.has(url.hostname.toLowerCase()));
}

function isInstagramUrl(value) {
  const url = parseHttpUrl(value);
  return Boolean(url && INSTAGRAM_HOSTS.has(url.hostname.toLowerCase()) && /^\/(?:reel|p|tv)\//i.test(url.pathname));
}

function getInstagramMediaReference(value) {
  const url = parseHttpUrl(value);
  if (!url || !INSTAGRAM_HOSTS.has(url.hostname.toLowerCase())) return null;
  const match = url.pathname.match(/^\/(reel|p|tv)\/([^/?#]+)/i);
  if (!match) return null;
  return {
    type: match[1].toLowerCase(),
    code: decodeURIComponent(match[2]),
    canonicalUrl: `https://www.instagram.com/${match[1].toLowerCase()}/${encodeURIComponent(decodeURIComponent(match[2]))}/`,
  };
}

function findRecoverableSocialUrl(text) {
  const matches = String(text || '').match(/https?:\/\/[^\s<>\]]+/gi) || [];
  for (const match of matches) {
    const candidate = match.replace(/[),.;!?，。；！？]+$/u, '');
    if (isThreadsUrl(candidate) || isInstagramUrl(candidate)) return candidate;
    const url = parseHttpUrl(candidate);
    const host = url?.hostname.toLowerCase();
    if (host === 'v.douyin.com' || host === 'xhslink.com' || host === 'b23.tv') return candidate;
  }
  return '';
}

function getThreadsPostReference(value) {
  const url = parseHttpUrl(value);
  if (!url || !THREADS_HOSTS.has(url.hostname.toLowerCase())) return null;
  const match = url.pathname.match(/^\/@([^/]+)\/post\/([^/?#]+)/i);
  if (!match) return null;
  return {
    username: decodeURIComponent(match[1]),
    code: decodeURIComponent(match[2]),
    canonicalUrl: `https://www.threads.com/@${encodeURIComponent(decodeURIComponent(match[1]))}/post/${encodeURIComponent(decodeURIComponent(match[2]))}`,
  };
}

function findThreadsPostReferenceInHtml(html) {
  const normalized = decodeHtmlEntities(String(html || ''))
    .replace(/\\u002f/gi, '/')
    .replace(/\\\//g, '/');
  const match = normalized.match(/https?:\/\/(?:www\.)?threads\.(?:com|net)\/@[^/"'<>\s]+\/post\/[^/?#"'<>\s]+/i);
  return match ? getThreadsPostReference(match[0]) : null;
}

function decodeHtmlEntities(value) {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  };
  return String(value || '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, token) => {
    if (token[0] !== '#') return named[token.toLowerCase()] ?? entity;
    const radix = token[1]?.toLowerCase() === 'x' ? 16 : 10;
    const number = Number.parseInt(token.slice(radix === 16 ? 2 : 1), radix);
    return Number.isFinite(number) ? String.fromCodePoint(number) : entity;
  });
}

function normalizeThreadsPost(post) {
  const text = String(post?.caption?.text || '').trim();
  const code = String(post?.code || '').trim();
  const username = String(post?.user?.username || '').trim();
  if (!text || !code || !username) return null;
  return {
    code,
    username,
    text,
    url: `https://www.threads.com/@${encodeURIComponent(username)}/post/${encodeURIComponent(code)}`,
    takenAt: Number(post.taken_at) || null,
  };
}

function getDirectThreadPosts(edge) {
  const items = edge?.node?.thread_items;
  if (!Array.isArray(items)) return [];
  return items.map((item) => normalizeThreadsPost(item?.post)).filter(Boolean);
}

function findMatchingEdgeArrays(value, rootCode, results = [], seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return results;
  seen.add(value);
  if (Array.isArray(value)) {
    const firstEdgePosts = getDirectThreadPosts(value[0]);
    if (firstEdgePosts.some((post) => post.code === rootCode)) results.push(value);
    for (const item of value) findMatchingEdgeArrays(item, rootCode, results, seen);
    return results;
  }
  for (const item of Object.values(value)) findMatchingEdgeArrays(item, rootCode, results, seen);
  return results;
}

function findPost(value, code, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  const normalized = normalizeThreadsPost(value?.post || value);
  if (normalized?.code === code) return normalized;
  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const result = findPost(child, code, seen);
    if (result) return result;
  }
  return null;
}

function extractJsonPayloads(html) {
  const payloads = [];
  const pattern = /<script\b[^>]*\btype=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of String(html || '').matchAll(pattern)) {
    try {
      payloads.push(JSON.parse(match[1]));
    } catch {
      // Threads includes unrelated script blocks; only valid JSON payloads matter.
    }
  }
  return payloads;
}

function extractEmbedText(html) {
  const match = String(html || '').match(/<span class=["']BodyTextContainer["']><span>([\s\S]*?)<\/span><\/span>/i);
  if (!match) return '';
  return decodeHtmlEntities(
    match[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:div|p)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  ).replace(/\n{3,}/g, '\n\n').trim();
}

function parseThreadsThreadHtml(html, canonicalUrl) {
  const reference = getThreadsPostReference(canonicalUrl);
  if (!reference) throw new Error('Threads 分享链接没有解析到真实帖子');
  const payloads = extractJsonPayloads(html);
  const roots = payloads.map((payload) => findPost(payload, reference.code)).filter(Boolean);
  const root = roots[0] || null;
  const edgeArrays = payloads.flatMap((payload) => findMatchingEdgeArrays(payload, reference.code));
  const bestEdges = edgeArrays.sort((left, right) => right.length - left.length)[0] || null;
  const posts = [];

  if (bestEdges && root) {
    for (let index = 0; index < bestEdges.length; index += 1) {
      const edgePosts = getDirectThreadPosts(bestEdges[index]);
      if (index === 0) {
        posts.push(...edgePosts.filter((post) => post.code === root.code));
        continue;
      }
      if (!edgePosts.length || edgePosts[0].username !== root.username) break;
      posts.push(...edgePosts.filter((post) => post.username === root.username));
    }
  } else if (root) {
    posts.push(root);
  }

  const uniquePosts = [...new Map(posts.map((post) => [post.code, post])).values()];
  return {
    canonicalUrl: reference.canonicalUrl,
    rootCode: reference.code,
    author: root?.username || reference.username,
    posts: uniquePosts,
  };
}

function parseThreadsEmbedHtml(html, canonicalUrl) {
  const reference = getThreadsPostReference(canonicalUrl);
  const text = extractEmbedText(html);
  if (!reference || !text) return null;
  return {
    canonicalUrl: reference.canonicalUrl,
    rootCode: reference.code,
    author: reference.username,
    posts: [{
      code: reference.code,
      username: reference.username,
      text,
      url: reference.canonicalUrl,
      takenAt: null,
    }],
  };
}

async function readHtmlResponse(response) {
  if (!response?.ok) throw new Error(`Threads 返回 HTTP ${response?.status || '未知状态'}`);
  const html = await response.text();
  if (Buffer.byteLength(html, 'utf8') > MAX_THREADS_HTML_BYTES) {
    throw new Error('Threads 页面超过 8MB，已停止解析');
  }
  return html;
}

async function fetchThreadsThread(sourceUrl, { fetchImpl = fetch } = {}) {
  if (!isThreadsUrl(sourceUrl)) throw new Error('不是可识别的 Threads 链接');
  let html = '';
  let reference = null;
  let headers = null;
  for (const userAgent of THREADS_USER_AGENTS) {
    headers = {
      accept: 'text/html,application/xhtml+xml',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.7',
      'cache-control': 'no-cache',
      'user-agent': userAgent,
    };
    const response = await fetchImpl(sourceUrl, { headers, redirect: 'follow' });
    html = await readHtmlResponse(response);
    reference = getThreadsPostReference(response.url) || findThreadsPostReferenceInHtml(html);
    if (reference) break;
  }
  if (!reference) throw new Error('Threads 分享链接没有跳转到真实帖子');
  let thread = parseThreadsThreadHtml(html, reference.canonicalUrl);

  if (!thread.posts.length) {
    const embedResponse = await fetchImpl(`${reference.canonicalUrl}/embed`, { headers, redirect: 'follow' });
    const embedHtml = await readHtmlResponse(embedResponse);
    thread = parseThreadsEmbedHtml(embedHtml, reference.canonicalUrl) || thread;
  }
  if (!thread.posts.length) throw new Error('Threads 页面已打开，但没有提取到公开正文');
  return thread;
}

function buildThreadsMarkdownSection(thread, date = new Date().toISOString().slice(0, 10)) {
  const marker = `afu-threads:${thread.rootCode}`;
  const lines = [
    `<!-- ${marker}:start -->`,
    `## 补充素材（Threads 抓取日期 ${date}）`,
    `- 来源链接：${thread.canonicalUrl}`,
    `- 作者：@${thread.author}`,
    `- 连续正文：${thread.posts.length} 条`,
    '',
  ];
  thread.posts.forEach((post, index) => {
    lines.push(`### ${index + 1}. ${post.url}`, '', post.text, '');
  });
  lines.push(`<!-- ${marker}:end -->`);
  return lines.join('\n');
}

function upsertThreadsMarkdownSection(raw, thread, date) {
  const section = buildThreadsMarkdownSection(thread, date);
  const marker = `afu-threads:${thread.rootCode}`;
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const existing = new RegExp(`\\n?<!-- ${escapedMarker}:start -->[\\s\\S]*?<!-- ${escapedMarker}:end -->\\n?`);
  if (existing.test(raw)) return String(raw).replace(existing, `\n\n${section}\n`);
  return `${String(raw).trimEnd()}\n\n${section}\n`;
}

function buildInstagramMarkdownSection(capture, date = new Date().toISOString().slice(0, 10)) {
  const reference = getInstagramMediaReference(capture.sourceUrl);
  if (!reference) throw new Error('不是可识别的 Instagram 内容链接');
  const marker = `afu-instagram:${reference.code}`;
  const lines = [
    `<!-- ${marker}:start -->`,
    `## 补充素材（Instagram 抓取日期 ${date}）`,
    `- 来源链接：${reference.canonicalUrl}`,
    '',
  ];
  if (capture.description) lines.push('### Instagram 说明', '', capture.description.trim(), '');
  if (capture.transcript) {
    lines.push('### 视频语音转写（自动识别语言，可能有误）', '', capture.transcript.trim(), '');
  }
  lines.push(`<!-- ${marker}:end -->`);
  return { marker, reference, section: lines.join('\n') };
}

function upsertInstagramMarkdownSection(raw, capture, date) {
  const { marker, section } = buildInstagramMarkdownSection(capture, date);
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const marked = new RegExp(`\\n?<!-- ${escapedMarker}:start -->[\\s\\S]*?<!-- ${escapedMarker}:end -->\\n?`);
  if (marked.test(raw)) return String(raw).replace(marked, `\n\n${section}\n`);

  const escapedSource = String(capture.sourceUrl).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const legacy = new RegExp(
    `\\n## 补充素材（抓取日期 \\d{4}-\\d{2}-\\d{2}）\\n- 来源链接：${escapedSource}\\n[\\s\\S]*$`,
  );
  if (legacy.test(raw)) return String(raw).replace(legacy, `\n\n${section}\n`);
  return `${String(raw).trimEnd()}\n\n${section}\n`;
}

export {
  buildInstagramMarkdownSection,
  buildThreadsMarkdownSection,
  fetchThreadsThread,
  findRecoverableSocialUrl,
  getInstagramMediaReference,
  getThreadsPostReference,
  isInstagramUrl,
  isThreadsUrl,
  parseThreadsThreadHtml,
  upsertInstagramMarkdownSection,
  upsertThreadsMarkdownSection,
};
