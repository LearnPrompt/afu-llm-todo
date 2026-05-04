# 社媒发布文案

## GitHub 发布帖

我做了一个给 Obsidian 用的 LLM Todo，中文名叫“管家阿福”。

它不想替代 Obsidian，也不是又一个 Todo App。它做一件事：

```text
收件箱 -> LLM Wiki -> 行动卡 -> 周排期
```

如果你的 Obsidian 收件箱里也堆满了网页、帖子、论文、产品发布和“以后再看”，阿福会先把这些素材整理成可回链的 Markdown Wiki，再从 Wiki 里长出本周真正该做的行动卡。

本地优先，不需要外部数据库。第一版也不强依赖 LLM API Key，走 agent packet 工作流。

Repo: <REPO_URL>

## ClawHub 发布帖

谁不想拥有一个自己的管家阿福？

我给 Obsidian 做了一个内容管家：Afu · LLM Todo for Obsidian。

它不是普通 Todo，而是把收件箱里的混乱素材先编译成 LLM Wiki，再安排成本周行动卡和日历。

适合自媒体、Newsletter、播客、研究型内容和任何“收件箱已经变成素材坟场”的人。

Demo：

```bash
npm run demo:reset
npm run demo
```

## X / Twitter 版本

Built Afu: LLM Todo for Obsidian.

Not another todo app.

It turns your Obsidian inbox into a living Markdown wiki, then into this week's actionable cards and calendar plan.

Inbox -> Wiki -> Todo -> Calendar.

Local-first. No database. No required LLM API key in v1.

## 朋友圈版本

最近把自己的 Obsidian 选题排期工具整理成了一个可以公开试用的 Skill。

名字叫“管家阿福”。

它的定位不是 Todo App，而是内容管家：先把收件箱里的素材整理成 LLM Wiki，再从 Wiki 里生成本周可执行的选题卡，最后排进日历。

适合那种每天存很多资料，但真正要做的时候又不知道从哪开始的人。

## 小红书 / 即刻版本

如果你的 Obsidian 收件箱已经变成“以后再看”的黑洞，可以试试这个思路：

不要直接做 Todo。

先把素材变成 Wiki，再让 Wiki 长出 Todo。

我把这个流程做成了一个本地工具：管家阿福。

它把 `00_收件箱` 里的内容整理成 LLM Wiki，再生成本周行动卡，最后拖进周排期。Markdown 仍然是唯一真源，不需要外部数据库。

## 三个 Hook

1. 你不需要又一个 Todo App，你需要一个管家阿福。
2. Obsidian 收件箱不是垃圾堆，它应该是行动卡的矿场。
3. LLM Todo 的重点不是“列任务”，而是让 Wiki 告诉你这周该做什么。
