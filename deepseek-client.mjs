const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

function getDeepSeekApiKey(env = process.env) {
  return String(env.DEEPSEEK_API_KEY || "").trim();
}

// 纯函数,便于单测:把候选卡压成给模型看的紧凑清单。
function buildMergeSuggestionPrompt(topics) {
  const lines = topics.map((topic, index) =>
    `${index + 1}. 【${topic.title}】${topic.excerpt ? ` 摘要: ${String(topic.excerpt).slice(0, 120)}` : ""}`,
  );
  return [
    "你是内容选题管理助手。下面是待排期的选题卡列表,有些卡讲法不同但本质是同一个选题(同一事件、同一产品、同一主题的不同来源)。",
    "找出应该合并的组。只输出 JSON,不要解释,格式:",
    '{"groups":[{"indexes":[1,3,4],"reason":"都是微软小红书视频商单","suggestedTitle":"微软小红书视频"}]}',
    "规则:indexes 用上面列表的序号;单独成组的卡不要输出;没有可合并的组就输出 {\"groups\":[]}。",
    "reason 必须具体:点名让这几张卡算同一选题的事件/产品/关键词,禁止“同一主题”“同一产品的不同来源”这类笼统说法。",
    "",
    "选题卡列表:",
    ...lines,
  ].join("\n");
}

// 纯函数,便于单测:解析模型输出,容忍 markdown 代码块包裹。
function parseMergeSuggestion(text, topicCount) {
  const raw = String(text || "").trim();
  const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`DeepSeek 返回的不是合法 JSON: ${raw.slice(0, 120)}`);
  }
  const groups = Array.isArray(parsed?.groups) ? parsed.groups : [];
  return groups
    .map((group) => ({
      indexes: (Array.isArray(group.indexes) ? group.indexes : [])
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= topicCount),
      reason: String(group.reason || "").slice(0, 200),
      suggestedTitle: String(group.suggestedTitle || "").slice(0, 100),
    }))
    .filter((group) => group.indexes.length >= 2);
}

async function suggestMergeGroups({ topics, env = process.env, fetchImpl = fetch, timeoutMs = 90_000 }) {
  const apiKey = getDeepSeekApiKey(env);
  if (!apiKey) {
    const error = new Error("未配置 DEEPSEEK_API_KEY,AI 建议分组不可用;仍可手动勾选合并。");
    error.statusCode = 503;
    throw error;
  }
  if (!Array.isArray(topics) || topics.length < 2) {
    return { groups: [] };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(DEEPSEEK_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: "user", content: buildMergeSuggestionPrompt(topics) }],
        temperature: 0.1,
        // v4-flash 是推理模型,reasoning 也计入 max_tokens;给太小会把
        // 最终 JSON 挤没(content 为空),所以留足余量。
        max_tokens: 8000,
      }),
      signal: controller.signal,
    });
  } catch (cause) {
    const detail = cause?.cause?.message || cause?.message || String(cause);
    const error = new Error(`DeepSeek 请求失败: ${detail};仍可手动勾选合并。`);
    error.statusCode = 502;
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const error = new Error(`DeepSeek 返回 ${response.status}: ${body.slice(0, 200)};仍可手动勾选合并。`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  const choice = payload?.choices?.[0];
  const content = choice?.message?.content;
  if (!String(content || "").trim()) {
    const error = new Error(
      choice?.finish_reason === "length"
        ? "DeepSeek 输出被截断(推理占满 max_tokens),请重试;仍可手动勾选合并。"
        : "DeepSeek 返回了空内容;仍可手动勾选合并。",
    );
    error.statusCode = 502;
    throw error;
  }
  return { groups: parseMergeSuggestion(content, topics.length) };
}

export {
  buildMergeSuggestionPrompt,
  getDeepSeekApiKey,
  parseMergeSuggestion,
  suggestMergeGroups,
};
