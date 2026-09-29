# lib/server

服务端专用代码（route handlers 专用，绝不能被客户端组件 import）：

- `admin.ts`（M1）— firebase-admin 初始化（凭据来自环境变量，进 Vercel 环境变量 / `.env.local`，不进仓库）
- 写路径仲裁逻辑：seq 事务、compare-and-send、CAS、token 签发与校验
