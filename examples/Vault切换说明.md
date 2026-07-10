# 演示 Vault 切换说明

当前 examples 里有三套可切换演示 Vault：

| Vault | 用途 | 素材数量 | 日期目录 |
|---|---:|---:|---|
| `general-vault` | 综合任务、工作、生活、隐私边界 | 20 | `2026-06-26` |
| `weekend-vault` | 周末生活、娱乐、聚餐、休息 | 8 | `2026-06-28` |
| `study-vault` | 学业复习、考试、作业、展示 | 8 | `2026-06-29` |

## 启动综合 Vault

```bash
cd /Users/yichenlin/Desktop/Work/afu-llm-todo && TOPIC_PLANNER_VAULT_ROOT=/Users/yichenlin/Desktop/Work/afu-llm-todo/examples/general-vault TOPIC_PLANNER_CONFIG=/Users/yichenlin/Desktop/Work/afu-llm-todo/examples/general-vault/topic-planner.config.json npm run dev
```

每日提醒入口：

```text
http://localhost:4317/?dailyInbox=1&inboxDate=2026-06-26
```

## 启动周末 Vault

```bash
cd /Users/yichenlin/Desktop/Work/afu-llm-todo && TOPIC_PLANNER_VAULT_ROOT=/Users/yichenlin/Desktop/Work/afu-llm-todo/examples/weekend-vault TOPIC_PLANNER_CONFIG=/Users/yichenlin/Desktop/Work/afu-llm-todo/examples/weekend-vault/topic-planner.config.json npm run dev
```

每日提醒入口：

```text
http://localhost:4317/?dailyInbox=1&inboxDate=2026-06-28
```

## 启动学业 Vault

```bash
cd /Users/yichenlin/Desktop/Work/afu-llm-todo && TOPIC_PLANNER_VAULT_ROOT=/Users/yichenlin/Desktop/Work/afu-llm-todo/examples/study-vault TOPIC_PLANNER_CONFIG=/Users/yichenlin/Desktop/Work/afu-llm-todo/examples/study-vault/topic-planner.config.json npm run dev
```

每日提醒入口：

```text
http://localhost:4317/?dailyInbox=1&inboxDate=2026-06-29
```

## 切换时怎么看是否成功

1. 先停掉当前 `npm run dev`。
2. 用另一个 Vault 的命令重新启动。
3. 打开 `http://localhost:4317`。
4. 看“工作区设置”的 Vault 根目录是否变了。
5. 看收件箱候选是否变成对应主题：
   - 综合：QuickNotes、项目、运动、财务、作品集。
   - 周末：聚餐、展览、电影、补觉、购物。
   - 学业：考试、作业、错题、公式、论文展示。

如果某条素材已经转成行动卡，不会再显示在收件箱候选里。要重新选择它，去排期池里点那张卡的“撤回转卡”；这会删除生成卡片，但保留原始收件箱素材。

## 验证命令

综合：

```bash
cd /Users/yichenlin/Desktop/Work/afu-llm-todo && TOPIC_PLANNER_VAULT_ROOT=/Users/yichenlin/Desktop/Work/afu-llm-todo/examples/general-vault TOPIC_PLANNER_CONFIG=/Users/yichenlin/Desktop/Work/afu-llm-todo/examples/general-vault/topic-planner.config.json npm run verify
```

周末：

```bash
cd /Users/yichenlin/Desktop/Work/afu-llm-todo && TOPIC_PLANNER_VAULT_ROOT=/Users/yichenlin/Desktop/Work/afu-llm-todo/examples/weekend-vault TOPIC_PLANNER_CONFIG=/Users/yichenlin/Desktop/Work/afu-llm-todo/examples/weekend-vault/topic-planner.config.json npm run verify
```

学业：

```bash
cd /Users/yichenlin/Desktop/Work/afu-llm-todo && TOPIC_PLANNER_VAULT_ROOT=/Users/yichenlin/Desktop/Work/afu-llm-todo/examples/study-vault TOPIC_PLANNER_CONFIG=/Users/yichenlin/Desktop/Work/afu-llm-todo/examples/study-vault/topic-planner.config.json npm run verify
```
