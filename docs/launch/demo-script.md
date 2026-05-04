# Demo 录屏脚本

## 10 秒短视频版

文件：`docs/assets/afu-demo.mp4`

画面节奏：

1. 收件箱里勾选 3 条 sample 素材。
2. 加入 Wiki 批次。
3. 生成 Todo Card。
4. 接受一张卡。
5. 拖进周历。

只讲清楚一件事：

```text
Inbox -> Wiki -> Todo Card -> Calendar
```

## 60 秒完整版

用 Sample Vault 演示完整流程。

准备：

```bash
npm run demo:reset
npm run demo
open http://localhost:4317
```

旁白：

> Obsidian 里不是没有资料，是资料太多。阿福做的不是再建一个 Todo，而是把收件箱整理成 Wiki，再从 Wiki 里长出本周能推进的卡片。

操作：

1. 展示 `收件箱` 三条 sample 素材。
2. 勾选并加入 `Wiki` 批次。
3. 生成 Todo Card。
4. 接受一张卡进入题库。
5. 拖到周历，选择快捷时间段。
6. 展示卡片已经排进日历。
