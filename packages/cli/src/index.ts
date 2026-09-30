#!/usr/bin/env node
/**
 * wings CLI — 给 agent 的手，不给 agent 的脑子。
 * 每个命令都是无状态单次调用；协议语义（轮询纪律、回应义务、休眠声明）
 * 在 skill 层（skills/wings），CLI 只做搬运。
 *
 * 退出码约定：0 成功；4 compare-and-send 冲突（data 含缺失增量，agent 须读完重判）；
 * 1 通用错误；2 用法错误。
 */

import { str, bool, multi, parse } from "./args";
import { loadConfig, saveConfig, defaultApi } from "./config";
import { call } from "./api";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";

const VERSION = "0.1.0";
const JSON_OUT = process.argv.includes("--json");

function out(data: unknown, human: string): void {
  if (JSON_OUT) console.log(JSON.stringify(data, null, 2));
  else console.log(human || JSON.stringify(data, null, 2));
}

function errFail(message: string): never {
  console.error(`wings: ${message}`);
  process.exit(1);
}

async function api<T = unknown>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const cfg = loadConfig();
  const res = await call<T>(cfg, method, path, body);
  if (!res.ok) {
    const data = res.data as { error?: string; message?: string };
    if (res.status === 409 && (data as { error?: string })?.error === "conflict") {
      // compare-and-send 冲突：输出缺失增量，交给 agent 重判（退出码 4）
      if (JSON_OUT) console.log(JSON.stringify(res.data, null, 2));
      else {
        console.error(`⚠️  ${data.message ?? "群里有新消息"}`);
        const missed = (res.data as { missed?: Array<{ seq: number; body: string; from: { kind: string; id: string } }> }).missed ?? [];
        for (const m of missed) console.error(`  #${m.seq} 【${m.from.kind}:${m.from.id}】${m.body}`);
        console.error("请先读完上述增量、重新判断后重发（不要盲目 --force）。");
      }
      process.exit(4);
    }
    errFail(`${res.status} ${data?.message ?? data?.error ?? "请求失败"}`);
  }
  return res.data as T;
}

async function currentGroupId(flags: Map<string, string | boolean>): Promise<string> {
  const explicit = str(flags, "group");
  if (explicit) {
    saveConfig({ currentGroupId: explicit });
    return explicit;
  }
  const cfg = loadConfig();
  if (cfg.currentGroupId) return cfg.currentGroupId;
  errFail("未指定群：用 --group <id> 或先 wings group use <id> / group create");
}

// ---------- 命令实现 ----------

async function cmdLogin(flags: Map<string, string | boolean>): Promise<void> {
  const apiKey = str(flags, "api-key") ?? str(flags, "token");
  if (!apiKey) errFail("用法：wings login --api-key <key> [--api <url>]");
  const api = str(flags, "api") ?? defaultApi();
  saveConfig({ token: apiKey, api });
  const res = await call<{ agentId?: string; name?: string }>(
    { token: apiKey, api }, "GET", "/api/groups",
  ).catch(() => ({ ok: false, status: 0, data: {} as object }));
  if (!res.ok) errFail(`API Key 校验失败（api=${api}）`);
  out({ ok: true, api }, `已绑定 API Key（api=${api}）`);
}

async function cmdGroup(argv: string[], rawArgs: string[], flags: Map<string, string | boolean>): Promise<void> {
  const sub = argv[0];
  if (sub === "create") {
    const name = str(flags, "name");
    if (!name) errFail("用法：wings group create --name <名称> [--description <背景>] [--goal <目标>...]");
    const goals = multi(rawArgs, "goal");
    const data = await api<{ groupId: string; profile: { announcementVersion: number; goals: Array<{ id: string; text: string }> } }>(
      "POST", "/api/groups", { name, description: str(flags, "description"), goals },
    );
    saveConfig({ currentGroupId: data.groupId });
    out(
      data,
      `群已建立：${data.groupId}\n${data.profile.goals.map((g) => `  ${g.id} ${g.text}`).join("\n") || "  （无目标）"}`,
    );
    return;
  }
  if (sub === "use") {
    const id = argv[1];
    if (!id) errFail("用法：wings group use <groupId>");
    saveConfig({ currentGroupId: id });
    out({ ok: true, groupId: id }, `当前群：${id}`);
    return;
  }
  if (sub === "get") {
    const groupId = await currentGroupId(flags);
    const data = await api<object>("GET", `/api/groups/${groupId}`);
    out(data, renderGroupDetail(data));
    return;
  }
  if (sub === "member") {
    if (argv[1] !== "add") errFail("用法：wings group member add --agent <id> | --human <email>");
    const groupId = await currentGroupId(flags);
    let agent = str(flags, "agent");
    const human = str(flags, "human");
    if (!agent === !human) errFail("--agent <id|self> 与 --human <email> 二选一");
    if (agent === "self") agent = await selfAgentId(); // 自助入群：主人在群里即可
    const kind = agent ? "agent" : "human";
    const data = await api<{ memberId: string }>("POST", `/api/groups/${groupId}/members`, {
      kind, id: agent ?? human,
    });
    out(data, `已加入成员 ${data.memberId}`);
    return;
  }
  if (sub === "update") {
    const groupId = await currentGroupId(flags);
    const patch: Record<string, unknown> = {};
    const announcement = str(flags, "announcement");
    const description = str(flags, "description");
    const goalAdd = str(flags, "goal-add");
    const goalDone = str(flags, "goal-done");
    const goalDrop = str(flags, "goal-drop");
    if (!announcement && !description && !goalAdd && !goalDone && !goalDrop) {
      errFail("用法：wings group update --announcement <文本> | --description <文本> | --goal-add <文本> | --goal-done <id> | --goal-drop <id>（CAS）");
    }
    if (announcement !== undefined) patch.announcement = announcement;
    if (description !== undefined) patch.description = description;
    if (goalAdd) patch.goalAdd = goalAdd;
    if (goalDone) patch.goalDone = goalDone;
    if (goalDrop) patch.goalDrop = goalDrop;

    // 未显式给 --if-version 时自动取当前版本（CAS 仍然生效：服务端以提交时的版本比对）
    let ifVersion = str(flags, "if-version");
    if (ifVersion === undefined) {
      const detail = await api<{ group: { profile: { announcementVersion: number } } }>("GET", `/api/groups/${groupId}`);
      ifVersion = String(detail.group.profile.announcementVersion);
    }
    patch.ifVersion = Number(ifVersion);
    const data = await api<{ profile: { announcementVersion: number } }>("PATCH", `/api/groups/${groupId}/profile`, patch);
    out(data, `群状态已更新（v${data.profile.announcementVersion}）`);
    return;
  }
  if (sub === "close") {
    const groupId = await currentGroupId(flags);
    const data = await api<{ ok: boolean }>("POST", `/api/groups/${groupId}/close`);
    out(data, "群已收工归档（archived，消息流冻结）");
    return;
  }
  errFail("未知 group 子命令：create | use | get | member add | update | close");
}

async function cmdGoal(argv: string[], flags: Map<string, string | boolean>): Promise<void> {
  const sub = argv[0];
  const groupId = await currentGroupId(flags);
  if (sub === "list") {
    const data = await api<{ goalPrompts: Array<{ agentId: string; version: number; updatedBy: string }> }>(
      "GET", `/api/groups/${groupId}/goal-prompts`,
    );
    out(data, data.goalPrompts.map((g) => `  ${g.agentId} v${g.version}（by ${g.updatedBy}）`).join("\n") || "  （尚无 Goal Prompt）");
    return;
  }
  if (sub === "get") {
    const agentId = str(flags, "agent") ?? "self";
    const data = await api<{ content: string; version: number }>(
      "GET", `/api/groups/${groupId}/goal-prompts/${agentId === "self" ? await selfAgentId() : agentId}`,
    );
    out(data, data.content);
    return;
  }
  if (sub === "set") {
    const agentId = str(flags, "agent") ?? "self";
    const file = str(flags, "file");
    if (!file) errFail("用法：wings goal set [--agent <id>] --file <path> [--if-version <n>]");
    const content = readFileSync(file, "utf8");
    const targetId = agentId === "self" ? await selfAgentId() : agentId;
    let ifVersion = str(flags, "if-version");
    if (ifVersion === undefined) {
      const current = await call<{ version?: number }>(loadConfig(), "GET", `/api/groups/${groupId}/goal-prompts/${targetId}`);
      ifVersion = current.ok ? String(current.data.version ?? 0) : "0";
    }
    const data = await api<{ version: number }>("PUT", `/api/groups/${groupId}/goal-prompts/${targetId}`, {
      content, ifVersion: Number(ifVersion),
    });
    out(data, `Goal Prompt 已写入（${targetId} v${data.version}）`);
    return;
  }
  errFail("未知 goal 子命令：list | get | set");
}

async function selfAgentId(): Promise<string> {
  // CLI 用的是某个 agent 的 token；/api/whoami 返回当前 principal。
  const me = await api<{ kind: string; id: string }>("GET", "/api/whoami");
  if (me.kind !== "agent") errFail("当前凭据不是 agent");
  return me.id;
}

async function cmdPoll(flags: Map<string, string | boolean>): Promise<void> {
  const groupId = await currentGroupId(flags);
  const after = str(flags, "after") ?? "0";
  const [msgs, detail] = await Promise.all([
    api<{ messages: Array<{ id: string; seq: number; from: { kind: string; id: string }; to: string; refs: number[]; type: string; body: string; evidence: Array<{ name: string; content?: string }> }>; }>(
      "GET", `/api/groups/${groupId}/messages?after=${after}&limit=100`,
    ),
    api<{ group: { seq: number; status: string }; presence: Array<{ agentId: string; state: string; activity: string }> }>(
      "GET", `/api/groups/${groupId}`,
    ),
  ]);
  const cursor = detail.group.seq;
  out(
    { cursor, groupStatus: detail.group.status, presence: detail.presence, messages: msgs.messages },
    msgs.messages.length === 0
      ? `（无新消息，当前 seq=${cursor}，群状态=${detail.group.status}）`
      : msgs.messages.map((m) =>
          `#${m.seq} ${m.type === "system" ? "[system] " : ""}【${m.from.kind}:${m.from.id} → ${m.to}】${m.refs.length ? `↩${m.refs.join(",")} ` : ""}${m.body}${
            m.evidence.length ? `\n    证据：${m.evidence.map((e) => `${e.name}${e.content ? "（内联）" : ""}`).join("、")}` : ""
          }`,
        ).join("\n"),
  );
}

function evidenceFrom(path: string): { name: string; mime: string; content: string } {
  const content = readFileSync(path, "utf8");
  const mimes: Record<string, string> = {
    ".md": "text/markdown", ".txt": "text/plain", ".json": "application/json",
    ".log": "text/plain", ".csv": "text/csv",
  };
  return { name: basename(path), mime: mimes[extname(path)] ?? "text/plain", content };
}

async function cmdSend(argv: string[], rawArgs: string[], flags: Map<string, string | boolean>): Promise<void> {
  const groupId = await currentGroupId(flags);
  const body = argv[0];
  if (!body) errFail('用法：wings send "<消息正文>" [--to <id>] [--ref <seq>] [--evidence <path>] [--force]');
  const evidencePaths = multi(rawArgs, "evidence");
  // 自动带 basedOn：先读当前 seq，把「发了再说」变成「看一眼再说」
  const detail = await api<{ group: { seq: number } }>("GET", `/api/groups/${groupId}`);
  const refs = multi(rawArgs, "ref").map(Number).filter((n) => !Number.isNaN(n));
  const data = await api<{ seq: number; messageId: string }>("POST", `/api/groups/${groupId}/messages`, {
    body,
    to: str(flags, "to") ?? "all",
    refs,
    evidence: evidencePaths.map(evidenceFrom),
    basedOn: detail.group.seq,
    force: bool(flags, "force"),
  });
  out(data, `已发送 #${data.seq}`);
}

async function cmdStatus(argv: string[], flags: Map<string, string | boolean>): Promise<void> {
  const groupId = await currentGroupId(flags);
  const activity = argv[0] ?? "";
  const state = str(flags, "state") ?? "online";
  const data = await api<{ stateChanged: boolean }>("POST", `/api/groups/${groupId}/presence`, { state, activity });
  out(data, `presence 已更新：${state}${data.stateChanged ? "（状态跃迁已公告）" : ""}`);
}

async function cmdExport(flags: Map<string, string | boolean>): Promise<void> {
  const groupId = await currentGroupId(flags);
  const cfg = loadConfig();
  const res = await fetch(`${cfg.api.replace(/\/$/, "")}/api/groups/${groupId}/export`, {
    headers: { Authorization: `Bearer ${cfg.token}` },
  });
  if (!res.ok) errFail(`导出失败：${res.status}`);
  const markdown = await res.text();
  const outPath = str(flags, "out") ?? `wings-${groupId.slice(0, 8)}.md`;
  writeFileSync(outPath, markdown);
  out({ ok: true, file: outPath }, `已导出：${outPath}`);
}

async function cmdInit(flags: Map<string, string | boolean>): Promise<void> {
  // skill 内容单一事实源：仓库 skills/wings/SKILL.md，构建时复制进 dist/assets/
  const templatePath = join(__dirname, "assets", "skill.md");
  if (!existsSync(templatePath)) errFail("找不到 skill 模板（安装不完整）");
  const content = readFileSync(templatePath, "utf8");
  const targets: string[] = [];
  if (existsSync(".claude")) {
    const dir = join(".claude", "skills", "wings");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), content);
    targets.push(join(dir, "SKILL.md"));
  }
  if (targets.length === 0) {
    writeFileSync("wings-SKILL.md", content);
    targets.push("wings-SKILL.md");
  }
  out({ ok: true, files: targets }, `skill 已生成：\n  ${targets.join("\n  ")}`);
}

function renderGroupDetail(data: unknown): string {
  const d = data as {
    group: { name: string; status: string; seq: number; profile: { description: string; announcement: string; announcementVersion: number; goals: Array<{ id: string; text: string; status: string }> } };
    members: Array<{ id: string; kind: string; name: string; role: string }>;
    presence: Array<{ agentId: string; state: string; activity: string }>;
  };
  const goals = d.group.profile.goals.map((g) => `  [${g.status === "done" ? "x" : " "}] ${g.id} ${g.text}`).join("\n");
  const members = d.members.map((m) => `  ${m.kind}:${m.id}（${m.name}，${m.role}）`).join("\n");
  const presence = d.presence.map((p) => `  ${p.agentId}：${p.state}（${p.activity}）`).join("\n");
  return [
    `${d.group.name}（${d.group.status}，seq=${d.group.seq}，profile v${d.group.profile.announcementVersion}）`,
    d.group.profile.description ? `背景：${d.group.profile.description}` : "",
    d.group.profile.announcement ? `公告：${d.group.profile.announcement}` : "",
    "目标：", goals || "  （无）",
    "成员：", members,
    presence ? "在场：\n" + presence : "",
  ].filter(Boolean).join("\n");
}

const HELP = `wings v${VERSION} — 跨人、跨机、跨框架的 agent 协作协调层

用法：wings <command> [options]

命令：
  login                 绑定 API Key（--api-key <key> [--api <url>]）
  group create          建群：--name --description --goal "…" [--goal "…"]
  group use <id>        设定当前群（后续命令省略 --group）
  group get             查看群信息、成员、profile、presence
  group member add      加成员：--agent <id|self> | --human <email>
  group update          改 profile：--announcement/--goal-add/--goal-done/--goal-drop（自动 CAS）
  group close           收工归档
  goal list|get|set     Goal Prompt 读写（get/set 默认 --agent self）
  poll [--after <seq>]  增量拉取 + 当前游标 + presence
  send "…"              发消息（自动带 basedOn，冲突退出码 4 并输出缺失增量）
  status "…"            心跳 + 活动陈述 [--state online|idle|sleeping|offline]
  export [--out <path>] 导出归档群 Markdown
  init                  生成 wings skill 到当前项目

全局：--json 输出结构化结果；WINGS_TOKEN / WINGS_API_URL 环境变量优先。`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--version") || argv.includes("-v")) {
    console.log(VERSION);
    return;
  }
  const { positionals, flags } = parse(argv);
  const command = positionals[0];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }

  const rest = positionals.slice(1);
  const rawArgs = argv; // 多值 flag（--goal/--ref/--evidence）要从原始 argv 收集
  switch (command) {
    case "login":
      return cmdLogin(flags);
    case "group":
      return cmdGroup(rest, rawArgs, flags);
    case "goal":
      return cmdGoal(rest, flags);
    case "poll":
      return cmdPoll(flags);
    case "send":
      return cmdSend(rest, rawArgs, flags);
    case "status":
      return cmdStatus(rest, flags);
    case "export":
      return cmdExport(flags);
    case "init":
      return cmdInit(flags);
    default:
      console.error(`wings: 未知命令 "${command}"`);
      console.log(HELP);
      process.exit(2);
  }
}

main().catch((err: unknown) => {
  console.error("wings:", err instanceof Error ? err.message : err);
  process.exit(1);
});
