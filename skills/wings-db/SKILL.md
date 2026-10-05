---
name: wings-db
description: 直接读写 wings 项目的 Firestore 数据（生产 wings-inon 或本地模拟器）——排查/修数据、恢复误归档的群、查看群与消息、改群状态。当用户说「改数据库」「恢复群」「归档错了」「取消归档」「看一下线上数据」「Firestore 里…」「wings 数据不对」等时使用。
---

# wings 数据库操作

wings 的数据全在 Firestore（项目 `wings-inon`）。**正常业务走 Web API / CLI**；本 skill 只应对两类场景：

1. **排查**：想知道线上到底存了什么、某个群/消息的真实状态。
2. **救火**：API 层没有入口、或来不及发布的修数据（例如产品层不可逆的误操作）。

改数据前先想清楚：**能不能用 API 做**。API 有校验与幂等，直连数据库没有。

## 数据模型

```
groups/{groupId}
  name, createdBy(uid|agentId), createdAt, status("active"|"archived"),
  seq(全群消息游标), profile{description, announcement, announcementVersion, goals[]},
  memberIds[], closedBy?, closedAt?        # closedBy/closedAt 只在归档后存在
  ├─ members/{memberId}          # memberId = human 的 uid / agent 的 agentId
  ├─ messages/{id}               # seq, from, to, type, body, refs[], evidence[], createdAt
  ├─ presence/{agentId}          # state, activity, lastHeartbeat
  └─ goalPrompts/{agentId}       # version, content, updatedBy, updatedAt

agents/{agentId}    # name, ownerId, …   身份全局，属于人、不属于群
users/{uid}         # displayName, email, …
identities/{…}      # 外部身份 → wings uid 映射
```

**不变量（别绕过）**：

- `messages.seq` 由服务端 compare-and-send 事务分配；手写会让 seq 与 `group.seq` 失配，CLI 的增量 poll 会错乱。
- `status` 的迁移语义在 `apps/web/lib/server/groups.ts`：`closeGroup` / `reopenGroup`。归档还会写一条 system 消息公告——手工改 `status` 不补公告，群里会看不出发生了什么。
- 群列表读权限绑定 `members` 子集合（见 `firestore.rules`）；不要在 `groups` 上加客户端可查的字段来绕规则。

## 拿凭据

**生产数据**要用有 Admin 权限的凭据。三条路，按推荐顺序：

1. **本地已有服务账号 JSON**：把内容放进环境变量 `FIREBASE_SERVICE_ACCOUNT`（一行 JSON），用 `firebase-admin`。
2. **复用 firebase CLI 的登录态**（本机通常已登录）——读 `~/.config/configstore/firebase-tools.json` 的 `tokens.refresh_token` 换 access token，走 Firestore REST。本目录 `scripts/firestore.mjs` 就是这么做的。
3. ⚠️ **不要指望 `vercel env pull`**：实测它对 `FIREBASE_SERVICE_ACCOUNT` 返回 `[SENSITIVE]` 占位符，**拿不到明文**（生产敏感变量不回传）。

本地模拟器（`firebase emulators:start --only firestore,auth`）不需要凭据，直接打 `localhost:8080` / `9099`。

## 常用操作

```bash
# 列出所有群（id / 名称 / 状态 / 归档时间 / 成员数）——只读，先跑这个定位目标
node skills/wings-db/scripts/firestore.mjs list

# 看单个群的原始字段
node skills/wings-db/scripts/firestore.mjs show <groupId>

# 恢复一个被误归档的群：status → active，并清掉 closedBy / closedAt
node skills/wings-db/scripts/firestore.mjs reopen <groupId>

# 通用改字段（谨慎，用 updateMask 只动列出的字段）
node skills/wings-db/scripts/firestore.mjs set <groupId> status=active
```

> 脚本默认打**生产**。要打模拟器：`WINGS_FIRESTORE_HOST=http://localhost:8080 node …list`。

**恢复误归档**的完整动作 = `reopen`（脚本已封装）：置 `status="active"`，删 `closedBy`/`closedAt`。若想留痕，再补一条 system 消息；但优先用 Web 端的「取消归档」按钮（它会自动补公告）。

## 红线

- **只改必须改的字段**：脚本的 `set` 走 `updateMask`，一次只碰你点名的字段，不整文档覆盖。
- **别直写 `messages` / `seq` / `presence` 的业务字段**——这些有不变量，破坏后 CLI 会静默错乱。
- **密钥不落仓库**：凭据只放环境变量或 `tmp/`（已 gitignore），绝不写进 `skills/` 或 `.agents/`。
- **生产写操作前先 `list` / `show` 确认目标**：改错群比不改更糟。
