import type { NextRequest } from "next/server";
import { fail } from "@/lib/server/http";
import { closeGroup, requireMembership } from "@/lib/server/groups";
import { requirePrincipal } from "@/lib/server/auth";

/** 收工归档：终态。消息流冻结，presence 全员下线意义消解。 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const principal = await requirePrincipal(req);
    const { groupId } = await params;
    await requireMembership(groupId, principal);
    await closeGroup(groupId, principal);
    return Response.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
