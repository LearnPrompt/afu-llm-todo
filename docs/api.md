# 本地 API

Afu 的网页 UI 使用本地 HTTP API。默认端口是 `4317`。

页面：

- `GET /`：桌面工作台
- `GET /quick`：手机快速排期
- `GET /quick?view=workspace`：从手机返回响应式工作台

核心：

- `GET /api/topics`
- `POST /api/topics/schedule`
- `POST /api/topics/lark-voting`：将选题创建/更新到配置的飞书多维表格，可在排期前使用
- `POST /api/topics/unschedule`
- `POST /api/topics/disposition`
- `GET /api/diagnostics`
- `GET /api/health`

收件箱：

- `GET /api/inbox-candidates`
- `POST /api/inbox/import`
- `POST /api/inbox/import-batch`
- `POST /api/inbox/archive`
- `POST /api/inbox/refetch`

单条和批量导入允许传入用户手动修改后的 `title` 与 `excerpt`。修改只作用于即将生成的选题卡，不会改写收件箱原文。

`/api/inbox/archive` 不永久删除素材，而是将文件移动到 `archiveRoot/<年份>/收件箱/<原相对路径>`；同名文件会自动追加 `-02`、`-03` 等序号。

收件箱列表中的来源路径使用 Obsidian URI。按住 Cmd 点击可直接在 Obsidian 打开对应文件。

重新抓取会按平台分流：

- Threads：解析 `/share/...` 到真实帖子，从公开页面内嵌数据提取主帖与作者连续回复，并以带标记的可更新区块写回 Markdown
- Instagram Reel：使用 `yt-dlp` 下载单条音轨，使用 `openai-whisper` 自动识别语言并转写，同时保留 Reel 的公开说明文字
- 抖音、小红书、B站等既有视频链接：继续使用庖丁采集脚本

Instagram 和其他视频转写要求 `yt-dlp`、`ffmpeg`、`whisper` 位于服务的 `PATH`。推荐使用 `uv tool install yt-dlp` 与 `uv tool install openai-whisper` 安装前两项 Python 工具。

Wiki Mode：

- `POST /api/wiki/compile`
- `POST /api/wiki/todos/generate`
- `POST /api/wiki/todos/accept`
- `POST /api/wiki/todos/reject`

设置：

- `GET /api/settings`
- `POST /api/settings`
- `POST /api/system/select-directory`，仅允许本机调用；在 macOS 打开原生文件夹选择器。独立模式返回绝对路径；Obsidian 模式的子目录会校验位于 Vault 内并返回相对路径

`/api/topics/lark-voting` 的请求体为 `{"path":"...","summary":"一句话解释"}`，不要求已有 `scheduled_date`。首次提交会把完整 Markdown 创建为飞书文档，再把文档链接、入池日期和选题字段写入多维表；未排期选题会进入 `待投票` 阶段，且不会向表格写入虚假的排期时间。文档、表格记录和入池日期的 ID/链接会写回 frontmatter。重复提交会覆盖同一篇飞书文档并更新同一条表格记录，不会覆盖团队维护的投票人和票数。选题之后排期时，Afu 会尽力把真实排期回填到同一篇文档和同一条表格记录；飞书回填失败不会撤销已经保存的本地排期。写入前会读取目标表真实字段；无法匹配的可选字段会跳过，表结构不会被自动修改。

飞书日历创建使用：

```bash
lark-cli calendar events create --params '<JSON>' --data '<JSON>'
```

不要使用旧的 `--calendar-id` 参数。
