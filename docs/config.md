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

网页里的两种工作区模式都支持直接选择文件夹：

- Obsidian 模式先选择 Vault 根目录，再选择 Vault 内的选题、收件箱和归档目录；后三项会自动转换为相对路径，不能选择 Vault 外的文件夹。
- 独立模式直接选择三个本机目录，配置保存绝对路径。

每个 Obsidian Vault 都有独立的目录映射。第一次选择新 Vault 时，需要分别选择选题、收件箱和归档目录，再点击“保存工作区设置”。保存后，这组三个相对路径会记录在该 Vault 名下；如果这个 Vault 有自己的 Wiki 路径，`vaultProfiles` 里也会一起记录 `wikiDir`、`wikiIndexPath` 和 `wikiLogPath`。以后切换回这个 Vault 会自动恢复对应工作区，无需重新选择。独立模式仍由用户分别选择三个本机目录。

选择完成后仍需点击“保存工作区设置”才会写入配置；取消选择不会覆盖原路径。
路径框只显示最后一级文件夹名，便于快速确认选择结果；完整路径仍保留在控件的悬停提示和配置数据中。

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
  "larkCalendarId": "",
  "larkCalendarName": "",
  "macosCalendarName": "",
  "larkVotingBaseUrl": "",
  "larkVotingFieldNames": {
    "title": "选题",
    "summary": "一句话",
    "tags": "标签",
    "sourceUrl": "来源链接",
    "scheduledAt": "排期时间",
    "afuPath": "Afu路径"
  },
  "dailyCapacity": 2
}
```

日历目标：

- `none`，只写 Markdown
- `macos`，同步到 macOS 本地日历
- `lark`，同步到飞书日历

选择飞书时，`larkCalendarId` / `larkCalendarName` 记录默认写入的飞书日历；留空时回退到主日历。选择 macOS 时，`macosCalendarName` 记录 Calendar.app 里的目标日历名。

团队投票池：

- `larkVotingBaseUrl` 填写包含 `table` 参数的完整飞书多维表格链接。
- `larkVotingFieldNames` 对应表中的真实字段名；`选题` 是必填文本字段，其他字段缺失时会跳过。
- `标签` 建议使用文本字段。Afu 不会自动创建多选选项，也不会写入或覆盖票数/投票人字段。
- 首次提交成功后，飞书记录 ID 会写回选题卡；后续点“更新投票”只更新同一行。

快捷时段可以通过 `scheduleTimeSlots` 配置。

Demo 验证命令：

```bash
TOPIC_PLANNER_VAULT_ROOT="$PWD/examples/sample-vault" \
TOPIC_PLANNER_CONFIG="$PWD/examples/sample-vault/topic-planner.config.json" \
npm run verify
```
