import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface WingsConfig {
  token: string;
  api: string;
  currentGroupId?: string;
}

const CONFIG_DIR = join(homedir(), ".wings");
const CONFIG_FILE = join(CONFIG_DIR, "credentials.json");

export function defaultApi(): string {
  return process.env.WINGS_API_URL ?? "https://wings.inon.space";
}

export function loadConfig(): WingsConfig {
  const envKey = process.env.WINGS_API_KEY ?? process.env.WINGS_TOKEN;
  if (envKey) {
    const stored = readStored();
    return { ...(stored ?? {}), token: envKey, api: process.env.WINGS_API_URL ?? stored?.api ?? defaultApi() };
  }
  const stored = readStored();
  if (!stored?.token || !stored?.api) {
    console.error("wings: 未配置 API Key。请先 `wings login --api-key <key>`（或设置 WINGS_API_KEY 环境变量）。");
    process.exit(1);
  }
  return stored;
}

function readStored(): WingsConfig | null {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as WingsConfig;
  } catch {
    return null;
  }
}

export function saveConfig(patch: Partial<WingsConfig>): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const next = { ...readStored(), ...patch };
  writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
}
