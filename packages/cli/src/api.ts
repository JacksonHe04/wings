import type { WingsConfig } from "./config";

export interface ApiResult<T = unknown> {
  status: number;
  ok: boolean;
  data: T;
}

export async function call<T = unknown>(
  cfg: WingsConfig,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const res = await fetch(`${cfg.api.replace(/\/$/, "")}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data: data as T };
}
