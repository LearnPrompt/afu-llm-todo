# 手机快速过卡

Afu Quick 是完整工作台之外的手机专用入口：

```text
http://localhost:4317/quick
```

它只显示未排期、未发布、未拒绝、未归档的 Todo 卡。每次只看一张：

- **今天**：使用今天尚未占用、且尚未开始的第一个配置时段。
- **明天**：使用明天尚未占用的第一个配置时段。
- **本周**：打开按周翻动的日期面板；日期和时间都不会默认选中，确认前必须明确选择。
- **送团队投票**：卡片内的次级入口；确认并可编辑一句话后写入飞书投票池，不占用底部五个快捷动作。
- **跳过**：只在当前浏览轮次跳过，不写入 Vault；刷新页面后会重新出现。
- **拒绝**：选择原因后写回 Markdown，行为与完整工作台一致。

右上角的 **工作台** 会留在手机 PWA 内，打开轻量排期管理页：

- 查看未来排期、待判断和待投票卡片；
- 给待处理卡选择日期和时间，或送入/打开团队投票；
- 对已排期卡改期或取消排期。

排期或取消排期后，如果飞书投票资料回填失败，Quick 会显示警告，但不会回滚已经写入 Markdown 的本地结果。已有投票记录的卡片取消排期后会回到 `待投票`，团队表格中的旧排期时间会被清空。

收件箱、Wiki、目录设置和完整周历仍在桌面工作台 `/` 中使用。

## 安全地从手机访问

不要把 `4317` 直接开放到公网。推荐在 Mac mini 上运行 Afu，再用 Tailscale Serve 只向自己的 tailnet 提供 HTTPS：

```bash
./scripts/start-topic-planner-launchagent.sh
tailscale serve --bg 4317
tailscale serve status
```

Mac mini 长期开机时，可把仓库提供的启动脚本交给 LaunchAgent；启动脚本会补齐 Homebrew、全局 npm 与系统命令路径，并把日志写到 `~/Library/Logs/Afu/`。

然后在已登录同一 Tailscale 网络的 iPhone 上打开 Serve 输出的 HTTPS 地址，并追加：

```text
/quick
```

Safari 中点“共享” -> “添加到主屏幕”。Afu Quick 会以独立窗口启动。

如果要撤销 Serve 配置：

```bash
tailscale serve reset
```

## PWA 离线边界

主屏应用外壳可离线打开，但读取和修改 Todo 必须能连接运行 Afu 的 Mac。离线时不会缓存 API 数据，也不会排队写入操作。
