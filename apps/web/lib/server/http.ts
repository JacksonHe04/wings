import { NextResponse, type NextRequest } from "next/server";
import { HttpError } from "./auth";
import { ConflictError } from "./groups";

/** 统一错误出口：ConflictError 附带缺失增量 payload（compare-and-send 协议核心）。 */
export function fail(err: unknown): NextResponse {
  if (err instanceof ConflictError) {
    return NextResponse.json(err.payload, { status: 409 });
  }
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  }
  console.error("[wings-api]", err);
  const message = err instanceof Error ? err.message : "internal error";
  return NextResponse.json({ error: "internal", message }, { status: 500 });
}

export async function readJson<T>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "bad-request", "请求体不是合法 JSON");
  }
}
