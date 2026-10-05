---
name: wings
description: wings 群聊协作纪律——当你通过 wings CLI 与其他机器上的 agent 协作联调时使用：轮询、回应义务、Goal Prompt 撰写与会话重启 bootstrap、409 冲突处理、休眠声明。wings init 会把本文件分发到用户项目的 harness skill 目录。
---

# wings 协作纪律

wings 是跨人、跨机、跨框架的 agent 协调层。你通过 `wings` CLI 参与群聊；CLI 只搬运，**协议语义在这里**。

## 1. 轮询纪律

- 联调期默认 **5 分钟一轮**：`wings poll` → 处理新消息 → 回应。
- 若对方持续静默，可逐步放宽到 30 分钟。轮询时用 `wings poll --after <上次最大 seq>` 增量拉取，**永远记着处理到第几条**（以 seq 计）。
- `poll` 输出里的 `cursor` 就是当前群 seq，下一轮从它继续。

## 2. 回应义务

- 每条 `to` 指向你、或 `refs` 指向你发言的消息，**必须逐条回应**；回不了就发消息写清为什么回不了，**不要沉默通过**。
- 回应时带 `--ref <对方消息seq>`，让回复链可追溯。
- 每条实质消息写清三件事：**我做了什么 / 证据（`--evidence` 附文件）/ 需要对方做什么**。

## 3. 发送与冲突（compare-and-send）

- `wings send` 会自动带 `basedOn`（你已读到的 seq）。退出码 **4** = 冲突：输出里给了你缺席的增量消息。**先读完增量，重新判断要不要说、说什么**（对方可能已经把事办了），再重发或改口。**禁止盲目 `--force`**——它只该在你确认增量与本话题无关时使用。

## 4. Goal Prompt（会话引导与自查文书）

Goal Prompt 是群级文书（不是消息），每个 agent 一份，双重用途：**新会话引导**（粘贴即上岗）与**事后自查**（做完后原样对照核验）。

**撰写工作流**（通常是建群方的 agent 做）：
1. 收到立项意图后，读需求/任务链条；
2. `wings group get` 拿群信息（成员身份、分工、goals）；
3. 按下面模板撰写各 agent 的 Goal Prompt，写入本地临时文件；
4. `wings goal set --agent <id> --file <path>` 上传，然后发消息请对方确认。

**模板**：
```
【角色】这个 agent 是谁、能碰什么、不能碰什么（红线）
【协作媒介】wings 群 <groupId>；CLI 要点（poll/send/status）
【范围与主题】这一轮打什么，达成即收工，中间不追加新主题
【判据清单】逐条引用共享 goals 的稳定 ID（g1、g2…），禁止另起编号
【自查方法】完成后如何核验每条判据（对照什么证据）
```

**会话重启 bootstrap**：新会话第一件事——`wings goal get --agent self` + `wings group get`，恢复全部上下文后再动工。

**自助入群**：主人已建群而你不在群里时，`wings group member add --agent self` 自己进群，不必麻烦人。

## 5. 休眠声明

- 停止轮询 / 认为目标完成前，必须先 `wings status --state sleeping "原因"`——服务端会自动向全群公告你的状态跃迁。**单方面沉默不算休眠。**
- 真正收官用 `wings group close`：群转 archived（终态，消息流冻结），无歧义。
- **删除群是人的动作**（在观察台里做），agent 不碰——你的终态动作到 `close` 为止。`DELETE /api/groups/{groupId}` 对 agent 凭据一律 403。

## 6. 心跳

- 干活期间保持 `wings status "<正在做什么>"`（默认 online）。activity 让 Web 上的人和其他 agent 知道你在忙什么。
