#!/usr/bin/env node
/**
 * wings v1 闭环 e2e：Firestore/Auth 模拟器 + 生产构建 web + wings CLI，
 * 验证「两个 agent 经 wings 完成一轮真实协作」的全链路。
 *
 * 前置：firebase emulators:start --only firestore,auth 已在 8080/9090 端口运行；
 *       web 已以模拟器 env 启动在 WINGS_API_URL（默认 http://localhost:3100）。
 *
 * 覆盖：健康检查 / 注册与 agent 铸造 / 建群立项 / goal prompt / 加成员 /
 *       发消息与增量 poll / compare-and-send 409 / profile CAS 409 /
 *       presence 跃迁 system 消息 / 归档冻结 / Markdown 导出 / Web 页面可达。
 */
import { writeFileSync, readFileSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const API = process.env.WINGS_API_URL ?? "http://localhost:3100";
const AUTH_EMU = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "http://localhost:9099";
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "wings-inon";
const CLI = new URL("../../../packages/cli/dist/index.js", import.meta.url).pathname;

let passed = 0;
let failed = 0;
function check(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.error(`  ❌ ${name} ${detail}`);
  }
}

async function api(path, { method = "GET", token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

/** Auth 模拟器注册用户并取 ID token */
async function signUp(email, password) {
  const res = await fetch(
    `${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-key`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) },
  );
  const data = await res.json();
  if (!res.ok && data?.error?.message !== "EMAIL_EXISTS") throw new Error(`signUp ${email}: ${data?.error?.message}`);
  if (data?.idToken) return data.idToken;
  const signIn = await fetch(
    `${AUTH_EMU}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) },
  );
  const d2 = await signIn.json();
  if (!signIn.ok) throw new Error(`signIn ${email}: ${d2?.error?.message}`);
  return d2.idToken;
}

/** 以指定 agent token 跑 CLI（每次显式 --group，避免共享 config 的 currentGroupId） */
function wings(token, args, { expectCode = 0 } = {}) {
  const res = spawnSync("node", [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, WINGS_TOKEN: token, WINGS_API_URL: API },
  });
  if (expectCode !== null && res.status !== expectCode) {
    throw new Error(`wings ${args.join(" ")} 退出码 ${res.status}（期望 ${expectCode}）\nstdout: ${res.stdout}\nstderr: ${res.stderr}`);
  }
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

console.log("\n=== wings v1 闭环 e2e ===\n");

// 清空 Firestore 模拟器数据，保证可重跑（Auth 模拟器账号保留，signUp 兼容已存在）
await fetch(`http://localhost:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
  method: "DELETE",
});

// 0. 健康检查
console.log("[0] 健康检查");
const health = await api("/api/health");
check("GET /api/health", health.ok && health.data?.service === "wings-api");

// 1. 两个人类用户 + 各自铸造 agent
console.log("[1] 用户注册与 agent 铸造");
const user1 = await signUp("server-side@test.local", "password123");
const user2 = await signUp("device-side@test.local", "password123");
check("人类用户注册（Auth 模拟器）", Boolean(user1 && user2));

const agentA = await api("/api/agents", { method: "POST", token: user1, body: { name: "服务端联调 Agent" } });
const agentB = await api("/api/agents", { method: "POST", token: user2, body: { name: "设备侧联调 Agent" } });
check("agent A 铸造（token 只此一次）", agentA.ok && agentA.data?.token?.startsWith("wtk_"));
check("agent B 铸造", agentB.ok && agentB.data?.token?.startsWith("wtk_"));
const tokenA = agentA.data.token;
const tokenB = agentB.data.token;

const dupToken = await api("/api/agents", { method: "POST", token: "wtk_bogus" });
check("伪造 token 被拒（401）", dupToken.status === 401);

// 2. 建群立项（agent A 代劳）
console.log("[2] 建群立项（agent A）");
wings(tokenA, ["group", "create",
  "--name", "摄像头一键调参联调",
  "--description", "真机 ROI 标定 + 调参链路",
  "--goal", "ROI 标定通过",
  "--goal", "调参候选评分收敛",
  "--goal", "Studio 展示验收",
]);
const groupsA = await api("/api/groups", { token: tokenA });
const groupId = groupsA.data.groups[0].id;
check("建群 + 立项（g1-g3）", groupsA.ok && groupsA.data.groups[0].profile.goals.length === 3);
const groupsOwner = await api("/api/groups", { token: user1 });
check("主人（human）能看到自己 agent 建的群", groupsOwner.ok && groupsOwner.data.groups.some((g) => g.id === groupId));

// 2.5 先拉 B 进群（成员才能读写 Goal Prompt）
wings(tokenA, ["group", "member", "add", "--group", groupId, "--agent", agentB.data.agentId]);

// 3. Goal Prompt（A 给自己和 B 写）
console.log("[3] Goal Prompt");
const tmp = mkdtempSync(join(tmpdir(), "wings-e2e-"));
const gpA = join(tmp, "gp-a.md");
const gpB = join(tmp, "gp-b.md");
writeFileSync(gpA, "【角色】服务端联调 Agent\n【判据清单】g1 g2 g3（引用共享目标稳定 ID）\n【自查方法】对照 calibration.task_ready");
writeFileSync(gpB, "【角色】设备侧联调 Agent\n【判据清单】g1 g2 g3\n【自查方法】对照串口日志");
wings(tokenA, ["goal", "set", "--group", groupId, "--file", gpA]);
wings(tokenA, ["goal", "set", "--group", groupId, "--agent", agentB.data.agentId, "--file", gpB]);
const gpList = await api(`/api/groups/${groupId}/goal-prompts`, { token: tokenA });
check("两侧 Goal Prompt 已写入", gpList.ok && gpList.data.goalPrompts.length === 2);
const gpBRead = await api(`/api/groups/${groupId}/goal-prompts/${agentB.data.agentId}`, { token: tokenB });
check("B 经 goal get --agent self 可读取自己的 GP", gpBRead.ok && gpBRead.data.content.includes("设备侧"));

// 4. 首条消息 + 增量 poll（成员已在 [2.5] 加入）
console.log("[4] 成员与消息流");
const send1 = wings(tokenA, ["send", "--group", groupId, "联调开工，请设备侧确认现场可擦除"]);
check("A 发首条消息", send1.code === 0 && send1.stdout.includes("#"));

const pollB = wings(tokenB, ["poll", "--group", groupId, "--json"]);
const pollData = JSON.parse(pollB.stdout);
check("B poll 收到增量消息", pollData.messages.length >= 2 && pollData.cursor >= 2);
check("poll 输出含 presence 与群状态", Array.isArray(pollData.presence) && pollData.groupStatus === "active");

// 5. compare-and-send：陈旧 basedOn → 409 + 缺失增量
console.log("[5] compare-and-send 冲突");
const currentDetail = await api(`/api/groups/${groupId}`, { token: tokenB });
const staleBasedOn = currentDetail.data.group.seq; // 此后 A 再发一条，B 的 basedOn 即陈旧
await api(`/api/groups/${groupId}/messages`, { method: "POST", token: tokenA, body: { body: "A 抢先发的一条" } });
const conflict = await api(`/api/groups/${groupId}/messages`, {
  method: "POST", token: tokenB,
  body: { body: "B 基于陈旧视图的回复", basedOn: staleBasedOn },
});
check("陈旧 basedOn 被拒（409）", conflict.status === 409 && conflict.data?.error === "conflict");
check("冲突回包含缺失增量", conflict.data?.missed?.length === 1 && conflict.data.missed[0].body.includes("抢先"));
check("冲突回包含当前 profile 快照", conflict.data?.profile?.announcementVersion === 1);

// --force 逃生口
const forced = await api(`/api/groups/${groupId}/messages`, {
  method: "POST", token: tokenB, body: { body: "B 确认增量无关后强制发送", basedOn: staleBasedOn, force: true },
});
check("--force 逃生口可用", forced.ok && forced.data.seq === conflict.data.currentSeq + 1);

// 6. profile CAS
console.log("[6] profile CAS");
const detailNow = await api(`/api/groups/${groupId}`, { token: tokenA });
const v = detailNow.data.group.profile.announcementVersion;
wings(tokenA, ["group", "update", "--group", groupId, "--announcement", "本轮验收从串口扩为全链路"]);
const staleCas = await api(`/api/groups/${groupId}/profile`, {
  method: "PATCH", token: tokenA, body: { ifVersion: v, announcement: "旧版本写入" },
});
check("陈旧 ifVersion 被拒（409）", staleCas.status === 409);
const goalDone = wings(tokenA, ["group", "update", "--group", groupId, "--goal-done", "g1"]);
check("goal-done 更新成功", goalDone.code === 0);

// 7. presence 跃迁 → system 消息
console.log("[7] presence 与休眠声明");
wings(tokenB, ["status", "--group", groupId, "等待现场 BTN3", "--state", "online"]);
const sleepResult = wings(tokenB, ["status", "--group", groupId, "今天到此为止", "--state", "sleeping"]);
check("sleeping 心跳成功", sleepResult.code === 0 && sleepResult.stdout.includes("跃迁"));
const msgsAfterPresence = await api(`/api/groups/${groupId}/messages?after=0&limit=100`, { token: tokenA });
const sysMsgs = msgsAfterPresence.data.messages.filter((m) => m.type === "system" && m.body.includes("sleeping"));
check("状态跃迁自动公告（system 消息）", sysMsgs.length >= 1);

// 8. 非成员被拒
const outsider = await signUp("outsider@test.local", "password123");
const outsiderAgent = await api("/api/agents", { method: "POST", token: outsider, body: { name: "局外人" } });
const outsiderSend = await api(`/api/groups/${groupId}/messages`, {
  method: "POST", token: outsiderAgent.data.token, body: { body: "我不是成员" },
});
check("非成员发消息被拒（403）", outsiderSend.status === 403);

// 9. 归档冻结
console.log("[9] 收工归档");
wings(tokenA, ["group", "close", "--group", groupId]);
const afterClose = await api(`/api/groups/${groupId}/messages`, {
  method: "POST", token: tokenA, body: { body: "归档后还想说话" },
});
check("归档后写入被拒（409 archived）", afterClose.status === 409 && afterClose.data?.error === "archived");

// 10. Markdown 导出
console.log("[10] 导出交付物");
const exportPath = join(tmp, "export.md");
wings(tokenA, ["export", "--group", groupId, "--out", exportPath]);
const md = readFileSync(exportPath, "utf8");
check("导出含背景/目标/消息流", md.includes("## 背景") && md.includes("## 目标") && md.includes("## 消息流"));
check("导出含 Goal Prompt 与判据引用", md.includes("Goal Prompt") && md.includes("g1"));
check("导出含休眠公告与抢发消息", md.includes("sleeping") && md.includes("抢先"));

// 11. CLI init 与 web 页面
console.log("[11] init 与页面");
const initDir = mkdtempSync(join(tmpdir(), "wings-init-"));
const initRes = spawnSync("node", [CLI, "init"], {
  encoding: "utf8", cwd: initDir,
  env: { ...process.env, WINGS_TOKEN: tokenA, WINGS_API_URL: API },
});
check("wings init 生成 skill（无 .claude/ 时落到 wings-SKILL.md）",
  initRes.status === 0 && existsSync(join(initDir, "wings-SKILL.md")));
const pageHome = await fetch(`${API}/`);
const pageLogin = await fetch(`${API}/login`);
check("首页与登录页可达（200）", pageHome.ok && pageLogin.ok);

console.log(`\n=== 结果：${passed} 通过 / ${failed} 失败 ===`);
process.exit(failed > 0 ? 1 : 0);
