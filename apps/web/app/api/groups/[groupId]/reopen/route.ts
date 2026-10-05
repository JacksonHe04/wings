import type { NextRequest } from "next/server";
import { fail } from "@/lib/server/http";
import { reopenGroup, requireMembership } from "@/lib/server/groups";
import { requirePrincipal } from "@/lib/server/auth";

/** 取消归档：close 的逆操作。消息流解冻，群回到进行中。 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const principal = await requirePrincipal(req);
    const { groupId } = await params;
    await requireMembership(groupId, principal);
    await reopenGroup(groupId, principal);
    return Response.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
