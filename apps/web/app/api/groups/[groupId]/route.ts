import type { NextRequest } from "next/server";
import { db, GROUPS_COLLECTION, presenceCol } from "@/lib/server/admin";
import { requirePrincipal } from "@/lib/server/auth";
import { fail } from "@/lib/server/http";
import { requireMembership } from "@/lib/server/groups";

/** 群详情：group + members + presence + goalPrompts 元信息。 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const principal = await requirePrincipal(req);
    const { groupId } = await params;
    await requireMembership(groupId, principal);

    const [groupSnap, membersSnap, presenceSnap, goalPromptsSnap] = await Promise.all([
      db.collection(GROUPS_COLLECTION).doc(groupId).get(),
      db.collection(GROUPS_COLLECTION).doc(groupId).collection("members").get(),
      presenceCol(groupId).get(),
      db.collection(GROUPS_COLLECTION).doc(groupId).collection("goalPrompts").get(),
    ]);

    return Response.json({
      group: { id: groupSnap.id, ...groupSnap.data() },
      members: membersSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      presence: presenceSnap.docs.map((d) => d.data()),
      goalPrompts: goalPromptsSnap.docs.map((d) => ({
        agentId: d.id,
        version: d.get("version"),
        updatedBy: d.get("updatedBy"),
        updatedAt: d.get("updatedAt"),
        content: d.get("content"),
      })),
    });
  } catch (err) {
    return fail(err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
