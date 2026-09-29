import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { db, auth, GROUPS_COLLECTION, membersCol } from "@/lib/server/admin";
import { requirePrincipal, ensureUserDoc, HttpError } from "@/lib/server/auth";
import { fail, readJson } from "@/lib/server/http";
import { appendSystemMessage, requireMembership } from "@/lib/server/groups";

interface AddBody {
  kind: "human" | "agent";
  /** human：按 email 查找 uid；agent：直接给 agentId */
  id: string;
}

/** 加成员（成员即可操作）。一次性加人，无 per-group 邀请码仪式。 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const principal = await requirePrincipal(req);
    const { groupId } = await params;
    await requireMembership(groupId, principal);
    const body = await readJson<AddBody>(req);

    const groupRef = db.collection(GROUPS_COLLECTION).doc(groupId);
    const groupSnap = await groupRef.get();
    if (!groupSnap.exists) throw new HttpError(404, "not-found", "群不存在");
    if (groupSnap.get("status") === "archived") {
      throw new HttpError(409, "archived", "群已归档");
    }

    let memberId: string;
    let memberName: string;
    if (body.kind === "agent") {
      memberId = body.id;
      const agentSnap = await db.collection("agents").doc(memberId).get();
      if (!agentSnap.exists) throw new HttpError(404, "not-found", "agent 不存在");
      memberName = agentSnap.get("name");
    } else {
      try {
        const user = await auth.getUserByEmail(body.id);
        memberId = user.uid;
        memberName = user.displayName ?? user.email ?? "human";
        await ensureUserDoc(memberId, user.email ?? undefined);
      } catch {
        throw new HttpError(404, "not-found", `找不到用户 ${body.id}（对方需先在 Web 注册）`);
      }
    }

    const memberRef = membersCol(groupId).doc(memberId);
    if ((await memberRef.get()).exists) {
      throw new HttpError(409, "already-member", "该成员已在群里");
    }
    await memberRef.set({ kind: body.kind, role: "member", name: memberName, joinedAt: Date.now() });
    await groupRef.update({ memberIds: FieldValue.arrayUnion(memberId) });
    await appendSystemMessage(groupId, `${body.kind}:${memberId}（${memberName}）加入群聊`);

    return Response.json({ ok: true, memberId });
  } catch (err) {
    return fail(err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
