import type { NextRequest } from "next/server";
import { db } from "@/lib/server/admin";
import { requirePrincipal } from "@/lib/server/auth";
import { fail } from "@/lib/server/http";
import { requireMembership } from "@/lib/server/groups";

/** 列出全群 Goal Prompt（会话重启 bootstrap / 自查用）。 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const principal = await requirePrincipal(req);
    const { groupId } = await params;
    await requireMembership(groupId, principal);
    const snap = await db
      .collection("groups")
      .doc(groupId)
      .collection("goalPrompts")
      .get();
    return Response.json({
      goalPrompts: snap.docs.map((d) => ({ agentId: d.id, ...d.data() })),
    });
  } catch (err) {
    return fail(err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
