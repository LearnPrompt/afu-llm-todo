# 管家阿福 · Afu

**中文** | [English](README_EN.md)

> LLM Todo for Obsidian agents
>
> Inbox -> Wiki -> Todo Card -> Calendar

![Afu hero](docs/assets/afu-hero.png)

<video src="docs/assets/afu-demo-10s.mp4" controls muted loop playsinline></video>

## 先说人话

事情是这样的。

我自己的 Obsidian 里，收件箱经常不是没有东西，是东西太多了。网页、帖子、论文、灵感、项目记录，全都在里面。真要开始做事的时候，反而会卡住。

普通 Todo 只能催你一声，告诉你还有一件事没做。

但很多时候，真正难的不是执行，是先从一堆材料里判断，哪几件事值得进入这周。

所以才有了管家阿福。

它不是来替代 Obsidian 的，也不是又一个任务管理器。它更像站在 Vault 门口的管家，先把收件箱里的材料整理成 Wiki，再把 Wiki 里已经长出来的判断，变成可以排进日历的待办卡。

```text
Inbox -> Wiki -> Todo Card -> Calendar
```

## 安装给 Agent 用

如果你的 Agent 支持 Skill 安装，优先用这个方式：

```bash
npx skills add LearnPrompt/afu-llm-todo
```

安装后，把需求直接交给 Agent：

```text
用管家阿福整理我的 Obsidian 收件箱，先编译 Wiki，再给我生成这周的待办卡。
```

阿福会让 Agent 按这个顺序工作：

1. 找到你的收件箱、Wiki、待办卡目录。
2. 把一批素材整理成 Wiki packet。
3. 从 Wiki 里生成 Todo Card。
4. 需要网页 UI 时，再启动本地排期面板。

## 想先看 UI

Demo 跑在 sample vault 里，你自己的笔记先原地不动。

```bash
git clone https://github.com/LearnPrompt/afu-llm-todo.git
cd afu-llm-todo
npm install
npm run demo:reset
npm run demo
```

打开：

```bash
open http://localhost:4317
```

你会看到三条 sample 素材。把它们送进 Wiki，生成待办卡，再拖进周排期。

## 不要求你的 Vault 长得像我的

默认 sample vault 用的是这几个目录：

```text
00_收件箱
30_研究/内容Wiki
15_自媒体/选题库
```

但这只是示例。

你自己的 Vault 可以叫别的名字。阿福真正需要知道的只有三个位置：

- 粗素材在哪里
- Wiki 写到哪里
- 待办卡写到哪里

剩下的路径，都可以在配置里改。Markdown 还在你的本地，阿福只是帮 Agent 找到入口和写回位置。

## LLM Wiki 是关键

这里借了一点 Karpathy 的 LLM Wiki 思路。

参考：<https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f>

我理解这件事的重点，不是再套一个 RAG 壳，也不是每次问问题都临时翻资料。

更有意思的是，让 Agent 持续维护一个能读、能改、能回链的 Markdown Wiki。然后下一步行动，不是凭空从 Todo 里冒出来，而是从 Wiki 里长出来。

这就是 Afu 的核心。

```text
收件箱里的材料
  -> 变成 Wiki
  -> 长出 Todo Card
  -> 排进 Calendar
```

## 现在先专注一件事

Afu 现在先服务个人 Obsidian 工作流。

它适合你把资料、灵感、项目记录、阅读摘录都丢进 Obsidian，然后希望 Agent 帮你把它们整理成一周能推进的事情。

团队协作、云端数据库、复杂权限，这些先不急。

先把自己的收件箱救出来。

## 更多

- 配置和目录适配：[docs/config.md](docs/config.md)
- 本地 API：[docs/api.md](docs/api.md)
- 引用和品牌边界：[docs/credits.md](docs/credits.md)
- ClawHub 文案：[docs/launch/clawhub.md](docs/launch/clawhub.md)
- 录屏脚本：[docs/launch/demo-script.md](docs/launch/demo-script.md)
