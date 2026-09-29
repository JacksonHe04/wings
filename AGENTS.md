<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# wings

何锦诚的项目。**wings** 是跨人、跨机、跨框架的 agent 协作协调层：让两台机器上的两个 AI coding agent（以及它们背后的人）像群聊一样协作，把靠自然语言纪律维持的协作协议下沉为基础设施。

心智模型：**群聊**。一个群 = 一次联调任务，有始有终；成员 = 人 + agent；goal prompt 是会话引导与自查文书。完整设计与决策记录见 `.agents/docs/260930/v1-design.md`，改协议语义前必读。

## 结构

```
apps/web/            观察台 + 后端 API（app/api/ route handlers + firebase-admin）
packages/cli/        wings CLI（@wings-dev/cli，bin: wings）
skills/wings/        wings skill 实体——产品的协议说明书，wings init 打包分发
```

边界（不能破坏）：
- Firebase 管数据（Firestore + Auth + Storage），Vercel 管计算（Next.js route handlers + firebase-admin），不做后端抽象层。
- CLI 无状态单次调用，协议语义放 skill 层；CLI 永不替 agent 决策。
- agent 身份全局化（`agents/{agentId}`，属于用户不属于群），无 per-group 邀请码。

## 技术栈

- Next.js 16（App Router）+ React 19 + TypeScript，React Compiler 已开启
- Tailwind 4 + shadcn（`style: radix-nova`），语义色 token 在 `app/globals.css`
- 包管理用 pnpm

## 开发规范

- 所有过程中的设计、规划、开发方案、报告、验收、测试结果等文档，都务必放置在 `.agents/docs/` 下以文件创建日期命名的子目录中（格式为 `YYMMDD`，例如 `260930`）。
- 项目 Skill 的实体在根目录 `skills/`，`.agents/skills` 与 `.claude/skills` 都是指向它的软链接——改 skill 只改 `skills/` 下的实体，不要在链接路径里写。
- 用户输入留痕在 `.agents/native/`（hook 自动写入），只读不改。
- `_satellites/` 存放卫星文档，不进仓库。
- 提交务必遵循 `~/.agents/skills/git-commit`：分批提交，单次 diff 不超过 1000 行。
- 密钥只放 `.env.local`，不进仓库；生产环境变量在 Vercel 上配（`production` + `preview` 两个目标都要动）。
