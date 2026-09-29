import type { NextRequest } from "next/server";
import { db, AGENTS_COLLECTION } from "@/lib/server/admin";
import { requireUser } from "@/lib/server/auth";
import { fail } from "@/lib/server/http";

/** 撤销 agent 身份（token 随之失效——tokenHash 随文档删除）。 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  try {
    const { uid } = await requireUser(req);
    const { agentId } = await params;
    const ref = db.collection(AGENTS_COLLECTION).doc(agentId);
    const snap = await ref.get();
    if (!snap.exists || snap.get("ownerId") !== uid) {
      return Response.json({ error: "not-found", message: "agent 不存在" }, { status: 404 });
    }
    await ref.delete();
    return Response.json({ ok: true });
  } catch (err) {
    return fail(err);
  }
}
