---
name: afu-llm-todo
description: Turn an Obsidian inbox into a living wiki, then into todo cards for this week.
---
# Afu · LLM Todo

管家阿福是给 Obsidian Agent 用的 Skill。

它处理的不是普通任务清单，而是这条链路：

```text
Inbox -> Wiki -> Todo Card -> Calendar
```

## 什么时候用

- 用户想整理 Obsidian 收件箱。
- 用户想把一批资料先编译成 Markdown Wiki。
- 用户想从 Wiki 里生成本周待办卡。
- 用户想用本地网页 UI 把待办卡排进周历。

## 工作原则

- 不要求用户使用固定 Vault 目录。
- 先确认收件箱、Wiki、待办卡三个位置。
- Markdown 是唯一真源，不引入外部数据库。
- 第一版不强制外部 LLM API Key。
- 收件箱原文不改写。
- 导入、排期、作废、Wiki 编译都写操作日志。

## Agent 工作流

1. 读取或询问用户的 Vault 根目录。
2. 确认三个目录：收件箱、Wiki、待办卡。
3. 扫描收件箱素材，形成当前批次。
4. 生成 Wiki ingest packet。
5. 从 Wiki 或 packet 中生成 Todo Card。
6. 用户确认后写入待办卡目录。
7. 如需排期，启动本地 UI 或调用排期 API。

## 本地 UI

```bash
npm run demo:reset
npm run demo
```

打开：

```bash
open http://localhost:4317
```

## 回滚

操作日志位于：

```text
99_系统/topic-planner-log/YYYY-MM-DD.md
```

误生成的 Markdown 可以根据日志路径删除，或用 Git、iCloud、Time Machine 回滚。
