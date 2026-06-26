# Afu · LLM Todo for Obsidian

[中文](README.md) | **English**

> Inbox -> Wiki -> Todo Card -> Calendar

![Afu hero](docs/assets/afu-hero.png)

## Demo Video

<video src="https://github.com/LearnPrompt/afu-llm-todo/releases/download/demo-video-v1/afu-demo.mp4" poster="docs/assets/afu-demo-poster.png" controls muted loop playsinline></video>

[Open the demo video](https://github.com/LearnPrompt/afu-llm-todo/releases/download/demo-video-v1/afu-demo.mp4)

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

## Daily Inbox Reminder

Afu can also run as a lightweight daily inbox reminder.

```text
Remind me every day at 23:30 to process my Obsidian inbox. First check the `00_收件箱/YYYY-MM-DD/` date folder, then check today's modified auto-ingest and candidate-topic files. Do not rely only on file modification time, and do not describe historical leftovers as today's new inbox. If there is nothing new today, say so clearly. Then list historical backlog separately, pick the 3-5 candidates most worth handling, and say whether each one should stay in the inbox, be compiled into the wiki, become a todo card, or wait for my decision. Do not delete, move, or rewrite original notes unless I confirm.
```

The reminder should not be a vague nudge. It should surface the next few decisions so the user can start from judgment, not from rummaging through raw notes.

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
