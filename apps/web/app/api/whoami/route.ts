import type { NextRequest } from "next/server";
import { requirePrincipal } from "@/lib/server/auth";
import { fail } from "@/lib/server/http";

/** 当前凭据是谁（CLI 的 goal set --agent self 等依赖它）。 */
export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    return Response.json(principal);
  } catch (err) {
    return fail(err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
