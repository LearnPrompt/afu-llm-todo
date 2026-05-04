# 管家阿福 · Afu

**中文** | [English](README_EN.md)

> LLM Todo for Obsidian agents
>
> Inbox -> Wiki -> Todo Card -> Calendar

![Afu hero](docs/assets/afu-hero.png)

## 演示视频

<video src="docs/assets/afu-demo.mp4" controls muted loop playsinline></video>

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

## 不需要跟我一模一样的 Vault，你可以随便改

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

## 工作原理

阿福不是直接把收件箱里的每条东西都变成任务。

它先做一次中间整理。

```text
Inbox
  -> Wiki packet
  -> Markdown Wiki
  -> Todo Card
  -> Calendar
```

这一步很关键。

因为收件箱里的东西通常是乱的。一个链接里可能只有半个观点，一段摘录里可能只有一个线索，一个项目记录里可能藏着真正要做的下一步。

阿福会先把这些材料放进 Wiki 语境里，让 Agent 有地方沉淀判断。等 Wiki 里已经能看出方向了，再生成待办卡。

所以它不是在帮你多列几个任务。

它是在帮你把资料变成能动起来的东西。

## 背后故事

这个项目一开始不是为了发布。

它只是我自己在 Obsidian 前面补的一层小工具。因为我真的经常遇到一个问题，收件箱里明明有很多好东西，但每次要排这一周的时候，还是得从头翻一遍。

翻着翻着就累了。

后来 Karpathy 提到 LLM Wiki，我一下子觉得这个方向很对。资料不应该永远躺在收件箱里，也不应该每次都靠临时搜索重新理解一遍。更好的方式，是让 Agent 把它们整理成一个会生长的 Wiki。

参考：<https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f>

再往前走一步，Wiki 不应该只是被查询。

它应该长出行动。

这就是 Afu。

## 更多

- 配置和目录适配：[docs/config.md](docs/config.md)
- 本地 API：[docs/api.md](docs/api.md)
- 引用和品牌边界：[docs/credits.md](docs/credits.md)
- ClawHub 文案：[docs/launch/clawhub.md](docs/launch/clawhub.md)
- 录屏脚本：[docs/launch/demo-script.md](docs/launch/demo-script.md)
