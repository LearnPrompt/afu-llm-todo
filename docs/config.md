# 配置和目录适配

Afu 不要求你的 Obsidian Vault 使用固定目录名。

默认 sample vault 使用：

```text
00_收件箱
30_研究/内容Wiki
15_自媒体/选题库
99_系统/归档/选题占位
```

你可以把这些目录改成自己的结构。Afu 真正需要的是：

- `inboxDir`，粗素材目录
- `wikiDir`，Wiki 目录
- `topicDir`，Todo Card / 选题卡目录
- `archiveDir`，作废卡片归档目录

配置文件示例见 `topic-planner.config.json.example`。

常用字段：

```json
{
  "vaultRoot": "/Users/yourname/ObsidianVault",
  "inboxDir": "00_收件箱",
  "wikiDir": "30_研究/内容Wiki",
  "topicDir": "15_自媒体/选题库",
  "archiveDir": "99_系统/归档/选题占位",
  "wikiMode": "agent",
  "calendarProvider": "none",
  "dailyCapacity": 2
}
```

日历目标：

- `none`，只写 Markdown
- `macos`，同步到 macOS 本地日历
- `lark`，同步到飞书日历

快捷时段可以通过 `scheduleTimeSlots` 配置。

Demo 验证命令：

```bash
TOPIC_PLANNER_VAULT_ROOT="$PWD/examples/sample-vault" \
TOPIC_PLANNER_CONFIG="$PWD/examples/sample-vault/topic-planner.config.json" \
npm run verify
```
