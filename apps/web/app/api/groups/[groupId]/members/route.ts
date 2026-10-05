import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { db, auth, GROUPS_COLLECTION, membersCol } from "@/lib/server/admin";
import { requirePrincipal, ensureUserDoc, HttpError } from "@/lib/server/auth";
import { fail, readJson } from "@/lib/server/http";
import { appendSystemMessage } from "@/lib/server/groups";

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
    const body = await readJson<AddBody>(req);

    // 成员可加人；另开一条自助通道：主人在群里时，agent 可凭 API Key
    // 把自己加入主人的群（`wings group member add --agent self`），
    // 让人不必上平台替 agent 操作。
    const self = await membersCol(groupId).doc(principal.id).get();
    let selfEnroll = false;
    if (!self.exists && body.kind === "agent" && body.id === principal.id) {
      const ownerMember = await membersCol(groupId).doc(principal.ownerId).get();
      if (ownerMember.exists) {
        selfEnroll = true;
      }
    }
    if (!self.exists && !selfEnroll) {
      throw new HttpError(403, "not-member", "你不是该群成员");
    }

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
        await ensureUserDoc(memberId, { email: user.email ?? undefined, displayName: memberName });
      } catch {
        throw new HttpError(404, "not-found", `找不到用户 ${body.id}（该邮箱还没有账号）`);
      }
    }

    const memberRef = membersCol(groupId).doc(memberId);
    if ((await memberRef.get()).exists) {
      throw new HttpError(409, "already-member", "该成员已在群里");
    }
    await memberRef.set({ kind: body.kind, role: "member", name: memberName, joinedAt: Date.now() });

    // 观察台可见性：agent 入群时把主人（human uid）也写进 memberIds 与成员表，
    // 否则主人既查不到这个群，onSnapshot 也会被 rules 拒绝。
    const updateIds = [memberId];
    if (body.kind === "agent") {
      const agentDoc = await db.collection("agents").doc(memberId).get();
      const ownerId = agentDoc.get("ownerId");
      if (ownerId && ownerId !== memberId) {
        updateIds.push(ownerId);
        const ownerRef = membersCol(groupId).doc(ownerId);
        if (!(await ownerRef.get()).exists) {
          let ownerName = "human";
          try {
            const u = await auth.getUser(ownerId);
            ownerName = u.displayName ?? u.email ?? "human";
          } catch { /* 用户已删除时兜底 */ }
          await ownerRef.set({ kind: "human", role: "member", name: ownerName, joinedAt: Date.now() });
        }
      }
    }
    await groupRef.update({ memberIds: FieldValue.arrayUnion(...updateIds) });
    await appendSystemMessage(groupId, `${body.kind}:${memberId}（${memberName}）加入群聊`);

    return Response.json({ ok: true, memberId });
  } catch (err) {
    return fail(err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
