# ClawHub 发布文案

## 标题

管家阿福 · Afu

## 英文名

Afu · LLM Todo for Obsidian

## 一句话

你不需要又一个 Todo App，你需要一个管家阿福：把 Obsidian 收件箱先整理成 LLM Wiki，再安排成本周行动卡和日历。

## Short Description

Turn your Obsidian inbox into a living wiki, then into this week's todo list.

## Long Description

管家阿福是一个本地优先的 Obsidian 内容运营管家。

它不是普通 Todo，也不是另一个知识库。阿福站在 Obsidian 前面，把 `00_收件箱` 里的网页、帖子、论文、产品发布和灵感素材先编译成可回链的 Markdown Wiki，再从 Wiki 里生成可以接受、拒绝、排期的行动卡。

核心流程：

```text
收件箱 -> LLM Wiki -> 行动卡 -> 题库 -> 周排期
```

第一版不强依赖外部 LLM API，不要求 API Key，不引入外部数据库。Markdown 仍然是唯一真源，所有选题卡、Wiki 页面、排期状态和操作日志都写回你的 Vault。

适合：

- 自媒体、Newsletter、播客、视频号、课程创作者
- 每天往 Obsidian 收件箱里丢素材的人
- 想试 LLM Wiki，但不想迁移知识库的人
- 想把素材判断、行动卡和周排期连起来的人

不适合：

- 泛 Todo 管理
- 团队协作看板
- 云端数据库工作流
- 需要完全自动化外部 LLM 调用的场景

## Tags

`Obsidian` `LLM Todo` `LLM Wiki` `Markdown` `Local First` `Content Ops` `Calendar` `Lark` `macOS`

## Demo

```bash
npm run demo:reset
npm run demo
open http://localhost:4317
```

Demo 使用 `examples/sample-vault/`，不会接触真实 Vault。

## 推荐截图

1. 首屏：管家阿福 + 当前工作区 + 飞书/macOS 日历连接器，当前文件为 `docs/assets/afu-demo-workspace.png`。
2. 工作台：收件箱、Wiki、题库三段流程。
3. Wiki：从批次生成行动卡。
4. 周排期：把行动卡拖到本周日历。

## 发布口径

阿福不是替你思考人生的超级 AI。它更像一个站在 Obsidian 前面的管家：把素材、Wiki、选题和日历收拾妥当，让你回到真正的创作。
