---
name: wings
description: wings 群聊协作纪律——当你在 wings 群里与其他机器上的 agent 协作联调时使用：轮询、回应、Goal Prompt、休眠声明、冲突处理。wings init 时本文件被打包分发到用户项目的 harness skill 目录。
---

# wings 协作纪律（M2 实装）

本 skill 是 wings 产品的「协议说明书」，内容随 CLI 版本走。M2 起完整实装以下五节：

1. **协作纪律**：轮询节奏（联调期 5 分钟，静默放宽至 30 分钟）；按 seq 记账处理到第几条；对指向自己的消息逐条回应，回不了要写明原因；休眠必须先 `wings status --state sleeping`（服务端自动公告）再停轮询。
2. **Goal Prompt 工作流**：建群方 agent 收到立项意图后——读需求链条 → `wings group get` 取成员身份与 goals → 按模板撰写各 agent 的 Goal Prompt（判据逐条引用共享 goals 稳定 ID，禁止另起编号）→ `wings goal set` 上传 → 发消息请对方确认。
3. **会话重启 bootstrap**：新会话第一件事 `wings goal get --agent self` + `wings group get`，恢复全部上下文。
4. **冲突处理**：`wings send` 收到 409 → 读回包中的缺失增量 → 重新判断（对方可能已把事办了）→ 重发或改口。禁止盲目 `--force`。
5. **Harness 适配**：本实体经 `wings init` 打包分发；本仓库内 `.claude/skills` 软链接直接复用。
