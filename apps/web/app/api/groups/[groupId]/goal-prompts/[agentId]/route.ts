import type { NextRequest } from "next/server";
import { db } from "@/lib/server/admin";
import { requirePrincipal, HttpError } from "@/lib/server/auth";
import { fail, readJson } from "@/lib/server/http";
import { appendSystemMessage, requireMembership } from "@/lib/server/groups";

/** 读取某 agent 的 Goal Prompt。 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string; agentId: string }> },
) {
  try {
    const principal = await requirePrincipal(req);
    const { groupId, agentId } = await params;
    await requireMembership(groupId, principal);
    const snap = await db.collection("groups").doc(groupId).collection("goalPrompts").doc(agentId).get();
    if (!snap.exists) {
      throw new HttpError(404, "not-found", `${agentId} 尚无 Goal Prompt`);
    }
    return Response.json({ agentId: snap.id, ...snap.data() });
  } catch (err) {
    return fail(err);
  }
}

interface PutBody {
  content: string;
  /** CAS：当前版本号。首次写入传 0。 */
  ifVersion: number;
}

/** 写 Goal Prompt（CAS）。与公告同地位：群级文书、变更产生 system 消息。 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string; agentId: string }> },
) {
  try {
    const principal = await requirePrincipal(req);
    const { groupId, agentId } = await params;
    await requireMembership(groupId, principal);
    const body = await readJson<PutBody>(req);
    if (!body.content?.trim()) {
      throw new HttpError(400, "bad-request", "content 必填");
    }

    const ref = db.collection("groups").doc(groupId).collection("goalPrompts").doc(agentId);
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const version = snap.exists ? (snap.get("version") as number) : 0;
      if (version !== body.ifVersion) {
        throw new HttpError(409, "conflict", `Goal Prompt 已被更新（当前 v${version}）`);
      }
      const next = {
        agentId,
        content: body.content.trim(),
        version: version + 1,
        updatedBy: `${principal.kind}:${principal.id}`,
        updatedAt: Date.now(),
      };
      tx.set(ref, next);
      return next;
    });

    await appendSystemMessage(
      groupId,
      `${principal.kind}:${principal.id} 更新了 ${agentId} 的 Goal Prompt（v${result.version}）`,
    );
    return Response.json(result);
  } catch (err) {
    return fail(err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
