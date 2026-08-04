# 本地 API

Afu 的网页 UI 使用本地 HTTP API。默认端口是 `4317`。

页面：

- `GET /`：桌面工作台
- `GET /quick`：手机快速排期
- `GET /quick?view=workspace`：从手机返回响应式工作台

核心：

- `GET /api/topics`
- `POST /api/topics/schedule`
- `POST /api/topics/unschedule`
- `POST /api/topics/disposition`
- `GET /api/diagnostics`
- `GET /api/health`

收件箱：

- `GET /api/inbox-candidates`
- `POST /api/inbox/import`
- `POST /api/inbox/import-batch`
- `POST /api/inbox/archive`

单条和批量导入允许传入用户手动修改后的 `title` 与 `excerpt`。修改只作用于即将生成的选题卡，不会改写收件箱原文。

`/api/inbox/archive` 不永久删除素材，而是将文件移动到 `archiveRoot/<年份>/收件箱/<原相对路径>`；同名文件会自动追加 `-02`、`-03` 等序号。

收件箱列表中的来源路径使用 Obsidian URI。按住 Cmd 点击可直接在 Obsidian 打开对应文件。

Wiki Mode：

- `POST /api/wiki/compile`
- `POST /api/wiki/todos/generate`
- `POST /api/wiki/todos/accept`
- `POST /api/wiki/todos/reject`

设置：

- `GET /api/settings`
- `POST /api/settings`
- `POST /api/system/select-directory`，仅允许本机调用；在 macOS 打开原生文件夹选择器。独立模式返回绝对路径；Obsidian 模式的子目录会校验位于 Vault 内并返回相对路径

飞书日历创建使用：

```bash
lark-cli calendar events create --params '<JSON>' --data '<JSON>'
```

不要使用旧的 `--calendar-id` 参数。
