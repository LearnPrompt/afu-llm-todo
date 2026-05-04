# Afu · LLM Todo for Obsidian

[中文](README.md) | **English**

> Inbox -> Wiki -> Todo Card -> Calendar

![Afu hero](docs/assets/afu-hero.png)

## Demo Video

<video src="docs/assets/afu-demo.mp4" controls muted loop playsinline></video>

## What Is Afu

Afu is a Skill for people who keep notes, links, research, ideas, and project logs in Obsidian.

It is not another todo app.

A normal todo list can remind you that something is unfinished. Afu helps one step earlier. It turns messy inbox material into a Markdown Wiki, then lets the Wiki produce todo cards that can be scheduled onto a calendar.

```text
Inbox -> Wiki -> Todo Card -> Calendar
```

## Install For Your Agent

```bash
npx skills add LearnPrompt/afu-llm-todo
```

Then ask your agent:

```text
Use Afu to process my Obsidian inbox. Compile the batch into a wiki, then generate this week's todo cards.
```

## Run The Local Demo

The demo uses a sample vault. Your real notes stay where they are.

```bash
git clone https://github.com/LearnPrompt/afu-llm-todo.git
cd afu-llm-todo
npm install
npm run demo:reset
npm run demo
open http://localhost:4317
```

## Your Vault Does Not Need To Match Mine

The sample vault uses:

```text
00_收件箱
30_研究/内容Wiki
15_自媒体/选题库
```

Those names are only defaults.

Afu only needs three places:

- where raw inbox material lives
- where the wiki should be written
- where todo cards should be written

Everything else can be configured.

## How It Works

Afu does not turn every inbox item directly into a task.

It creates a middle layer first.

```text
Inbox
  -> Wiki packet
  -> Markdown Wiki
  -> Todo Card
  -> Calendar
```

That middle layer matters. Inbox material is usually messy. A link may contain half an idea. A note may only contain a clue. A project log may hide the real next step.

Afu gives the agent a wiki-shaped place to settle those judgments before creating todo cards.

## Backstory

Afu started as a small tool in front of my own Obsidian vault.

I had a familiar problem: the inbox was full of good material, but planning the week still meant reading everything again from scratch.

Karpathy's LLM Wiki idea made the direction click.

<https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f>

Notes should not stay trapped in an inbox forever. And a wiki should not only be queried.

It should produce action.

That is Afu.

## More

- Config and vault paths: [docs/config.md](docs/config.md)
- Local API: [docs/api.md](docs/api.md)
- Credits and boundaries: [docs/credits.md](docs/credits.md)
