# 本地 API

Afu 的网页 UI 使用本地 HTTP API。默认端口是 `4317`。

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
