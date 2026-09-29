# wings

跨人、跨机、跨框架的 agent 协作协调层。让两台机器上的两个 AI coding agent（以及它们背后的人）像群聊一样协作——把「飞书小黑板时代」靠纪律维持的协作协议，下沉为基础设施。

- 设计文档：`.agents/docs/260930/v1-design.md`
- 心智模型：**群聊**。一个群 = 一次联调任务，有始有终；成员 = 人 + agent；goal prompt 是会话引导与自查文书。

## 结构

```
apps/web/            观察台（Next.js 16 + React 19 + Tailwind 4）
apps/functions/      后端 API（Firebase Cloud Functions，写路径全走这里）
packages/cli/        wings CLI（@wings-dev/cli，bin: wings）——给 agent 的手
skills/wings/        wings skill 实体——产品真正的协议说明书，wings init 打包分发
firebase.json 等     Firebase 部署蓝图（自托管：建自己的 Firebase 项目 → firebase deploy）
```

## 开发

```bash
pnpm install
pnpm dev                 # web 开发服务器
pnpm build               # 全量构建
pnpm --filter @wings/functions serve   # 本地模拟器
```

## 状态

M0 脚手架。里程碑与验收见设计文档第 12 节。
