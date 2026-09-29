<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# wings

何锦诚的项目。产品定位与结构待补充——随着第一批功能落地，把「它是什么、怎么用、哪些边界不能破坏」写进这一节。

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
