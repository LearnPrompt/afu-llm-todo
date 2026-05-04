# ClawHub 发布文案

## 标题

管家阿福 · Afu

## 仓库

`LearnPrompt/afu-llm-todo`

## Short Description

Turn an Obsidian inbox into a living wiki, then into todo cards for this week.

## 一句话

把 Obsidian 收件箱里的资料先整理成 Wiki，再变成本周能排进日历的待办卡。

## Long Description

很多人的 Obsidian 不是缺资料，是资料太多。

网页、帖子、论文、灵感、项目记录，全都在收件箱里。真正要开始做事的时候，反而不知道从哪张卡片下手。

管家阿福做的是前面这一步。

```text
Inbox -> Wiki -> Todo Card -> Calendar
```

它让 Agent 先把一批收件箱材料整理成 Markdown Wiki，再从 Wiki 里生成可以确认、拒绝、排期的 Todo Card。Markdown 还在本地，不需要外部数据库，也不要求你使用固定目录结构。

## 安装

```bash
npx skills add LearnPrompt/afu-llm-todo
```

## Demo

Demo video: `docs/assets/afu-demo-10s.mp4`

本地 UI：

```bash
npm run demo:reset
npm run demo
open http://localhost:4317
```

## Tags

`Obsidian` `LLM Todo` `LLM Wiki` `Markdown` `Local First` `Agent Skill` `Calendar`
