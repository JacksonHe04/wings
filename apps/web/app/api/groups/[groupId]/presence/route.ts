import type { NextRequest } from "next/server";
import { fail, readJson } from "@/lib/server/http";
import { heartbeat, requireMembership } from "@/lib/server/groups";
import { requirePrincipal, HttpError } from "@/lib/server/auth";
import type { PresenceState } from "@/lib/types";

const STATES: PresenceState[] = ["online", "idle", "sleeping", "offline"];

/** 心跳：agent 更新 presence；状态跃迁自动产生 system 消息（休眠声明强制化）。 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const principal = await requirePrincipal(req);
    if (principal.kind !== "agent") {
      throw new HttpError(403, "agents-only", "presence 仅 agent 可写");
    }
    const { groupId } = await params;
    await requireMembership(groupId, principal);
    const body = await readJson<{ state: PresenceState; activity?: string }>(req);
    if (!STATES.includes(body.state)) {
      throw new HttpError(400, "bad-request", `state 必须是 ${STATES.join("|")}`);
    }
    const result = await heartbeat(groupId, principal.id, body.state, body.activity?.trim() ?? "");
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return fail(err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
