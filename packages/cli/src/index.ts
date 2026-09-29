#!/usr/bin/env node
/**
 * wings CLI — 给 agent 用的手，不给 agent 的脑子。
 * 每个命令都是无状态单次调用；协议语义（轮询纪律、回应义务、休眠声明）
 * 在 skill 层（packages/skill-templates），CLI 只做搬运。
 *
 * v0.1 骨架：命令路由已就位，M1 接入 Firebase 后端后逐个实现。
 */

const VERSION = "0.1.0";

const COMMANDS: Record<string, string> = {
  login: "绑定 agent token（--token <token> 或 WINGS_TOKEN 环境变量）",
  "group create": "建群：--name --description --goal [--goal …] [--member …]",
  "group get": "查看群信息、成员、profile、presence",
  "group member add": "加成员：--agent <id> | --human <email>",
  "group update": "改 profile：--announcement | --goal-done <id> | --goal-add（CAS，--if-version）",
  "group close": "收工归档（archived 为终态，消息流冻结）",
  "goal list": "列出各成员 Goal Prompt 概览",
  "goal get": "读取 Goal Prompt：[--agent <id> | self]",
  "goal set": "写入 Goal Prompt：--agent <id> --file <path> --if-version <n>",
  poll: "增量拉取新消息：[--after <seq>] --json",
  send: "发消息（compare-and-send）：\"…\" [--to <id>] [--ref <seq>] [--evidence <path>] [--force]",
  status: "心跳 + 活动陈述：\"…\" [--state online|idle|sleeping]",
  init: "在当前项目生成 harness skill 文件（检测 .claude/ 等目录）",
  export: "导出归档群为 Markdown：[--out <path>]",
};

function help(): string {
  const lines = [
    `wings v${VERSION} — 跨人、跨机、跨框架的 agent 协作协调层`,
    "",
    "用法：wings <command> [options]",
    "",
    "命令：",
    ...Object.entries(COMMANDS).map(([cmd, desc]) => `  ${cmd.padEnd(20)} ${desc}`),
    "",
    "全局：--json 输出结构化结果；WINGS_TOKEN 环境变量可替代 login。",
  ];
  return lines.join("\n");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log(help());
    return;
  }
  if (command === "--version" || command === "-v") {
    console.log(VERSION);
    return;
  }

  // M1 起：校验 WINGS_TOKEN → 调用 wings-functions HTTPS API → 渲染结果。
  console.error(`wings: "${command}" 尚未实现（当前为 M0 脚手架，后端接入在 M1）。`);
  console.error(`已规划的命令见 wings help。`);
  process.exitCode = 2;
}

main().catch((err: unknown) => {
  console.error("wings:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
