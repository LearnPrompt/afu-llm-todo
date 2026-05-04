# Afu · LLM Todo for Obsidian

[中文](README.md) | **English**

> Inbox -> Wiki -> Todo Card -> Calendar

![Afu hero](docs/assets/afu-hero.png)

<video src="docs/assets/afu-demo-10s.mp4" controls muted loop playsinline></video>

## What Is Afu

Afu is a local-first Skill for people who keep their notes, links, research, ideas, and project logs in Obsidian.

It is not another todo app.

A normal todo list can remind you that something is unfinished. Afu helps one step earlier. It turns messy inbox material into a living Markdown Wiki, then lets the Wiki produce todo cards that can be scheduled onto a calendar.

```text
Inbox -> Wiki -> Todo Card -> Calendar
```

## Install For Your Agent

If your agent supports Skill installation:

```bash
npx skills add LearnPrompt/afu-llm-todo
```

Then ask your agent:

```text
Use Afu to process my Obsidian inbox. Compile the batch into a wiki, then generate this week's todo cards.
```

## Run The Local Demo

The demo uses a sample vault. Your real notes stay untouched.

```bash
git clone https://github.com/LearnPrompt/afu-llm-todo.git
cd afu-llm-todo
npm install
npm run demo:reset
npm run demo
open http://localhost:4317
```

## Your Vault Structure Can Be Different

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

## Why LLM Wiki

Inspired by Karpathy's LLM Wiki idea:

<https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f>

The point is not to wrap another RAG interface around your files. The more interesting move is to let an agent maintain a readable, editable, linkable Markdown wiki, then let actions emerge from that wiki.

## More

- Config and vault paths: [docs/config.md](docs/config.md)
- Local API: [docs/api.md](docs/api.md)
- Credits and boundaries: [docs/credits.md](docs/credits.md)
