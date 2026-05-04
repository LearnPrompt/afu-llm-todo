---
name: afu-llm-todo-for-obsidian
description: Turn your Obsidian inbox into a living wiki, then into this week's todo list.
---
# Afu · LLM Todo for Obsidian

管家阿福用于把 Obsidian 收件箱里的粗素材，整理成可回链的内容 Wiki，再生成本周可排期的 Todo / 选题卡。

它的产品人格是“站在 Obsidian 前面的内容管家”：不替用户思考人生，不替代 Obsidian，也不把 Markdown 搬去外部数据库。阿福负责把素材、Wiki、选题和日历收拾妥当，让用户回到真正的创作。

## 什么时候使用

- 用户想整理 `00_收件箱`，并把素材变成选题卡。
- 用户想从 LLM Wiki / 内容 Wiki 里生成本周行动卡。
- 用户想用本地网页 UI 做内容排期。
- 用户想验证 Vault 目录、日历目标、Wiki Mode 配置是否正确。

## 核心原则

- Markdown 是唯一真源，不引入外部数据库。
- 第一版不直接调用外部 LLM API，不要求 API Key。
- 收件箱原文不被改写。
- 任何导入、排期、作废、Wiki 编译都要留下操作日志。
- 对外口径使用 `Afu · LLM Todo for Obsidian`，中文名保留 `管家阿福`。
- 对外人设句：`管家阿福不替你思考人生，但会把素材、Wiki、选题和日历收拾妥当。`
- 每日容量是推荐值，不是硬限制；最终同步时间以排期弹窗里的开始/结束时间为准。

## 常用命令

在 skill 目录或项目根目录运行：

```bash
npm run demo:reset
npm run demo
```

验证当前配置：

```bash
npm run verify
```

启动真实 Vault：

```bash
npm run dev
```

生成 Wiki ingest packet：

```bash
bash scripts/wiki-compile-packet.sh
```

## 工作流

### Planner Mode

1. 打开网页 UI。
2. 在首次配置里确认 Vault 根目录、选题目录、收件箱目录、归档目录。
3. 选择日历目标：只写 Markdown、飞书日历、macOS 本地日历。
4. 在 `收件箱` tab 确认素材来源和过滤原因。
5. 在 `Wiki` tab 按顺序编译批次、生成行动卡。
6. 在 `题库` tab 把接受后的卡片拖进周历，并用快捷时段补时间。

### Wiki Mode

1. 在配置里把 `wikiMode` 设置为 `agent`。
2. 打开 `Wiki` tab。
3. 点击 `编译收件箱批次`，生成结构化 Markdown packet。
4. 点击 `生成行动卡`，得到可接受或拒绝的 Todo 候选。
5. 接受候选后，应用会写入现有选题卡格式，并保留 Wiki 回链字段。

## 数据约定

Wiki 页面 frontmatter：

```yaml
type: llm-wiki-topic
status: active
sources: []
last_ingested: YYYY-MM-DD
candidate_todos: []
```

选题卡可选字段：

```yaml
source_wiki_pages: []
llm_todo_reason: ""
llm_todo_confidence: medium
llm_todo_status: proposed
```

## 回滚

操作日志位于：

```text
99_系统/topic-planner-log/YYYY-MM-DD.md
```

回滚时先查看日志中的相对路径，再用 Git、iCloud、Time Machine 或手动删除误生成的 Markdown 文件恢复。
