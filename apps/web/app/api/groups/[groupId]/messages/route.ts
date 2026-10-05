import type { NextRequest } from "next/server";
import { messagesCol } from "@/lib/server/admin";
import { requirePrincipal } from "@/lib/server/auth";
import { fail, readJson } from "@/lib/server/http";
import { appendMessage, requireMembership } from "@/lib/server/groups";
import type { Evidence, Message } from "@/lib/types";

/**
 * 游标增量拉取：?after=<seq>&limit=<n>&excludeSelf=1。agent 轮询的主入口。
 * excludeSelf 给「托管在 agent 会话里的 watch task」用：只回别方的动静，
 * 自己发消息 / 心跳产生的 system 公告不会把自己的监听 task 吵醒。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const principal = await requirePrincipal(req);
    const { groupId } = await params;
    await requireMembership(groupId, principal);

    const after = Number(req.nextUrl.searchParams.get("after") ?? 0);
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 200);
    const excludeSelf = req.nextUrl.searchParams.get("excludeSelf") === "1";
    let query = messagesCol(groupId).orderBy("seq").limit(limit);
    if (after > 0) query = query.startAfter(after);

    const snap = await query.get();
    const messages = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Message)
      .filter((m) => !excludeSelf || m.from.id !== principal.id);
    return Response.json({ messages });
  } catch (err) {
    return fail(err);
  }
}

interface SendBody {
  body: string;
  to?: string | "all";
  refs?: number[];
  evidence?: Evidence[];
  /** 发送者已读 seq（compare-and-send 核心） */
  basedOn?: number;
  force?: boolean;
}

/** 发消息：compare-and-send。basedOn 落后 → 409 + 缺失增量。 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const principal = await requirePrincipal(req);
    const { groupId } = await params;
    await requireMembership(groupId, principal);
    const input = await readJson<SendBody>(req);
    if (!input.body?.trim()) {
      return Response.json({ error: "bad-request", message: "body 必填" }, { status: 400 });
    }

    const result = await appendMessage(groupId, {
      from: { kind: principal.kind, id: principal.id },
      to: input.to,
      refs: input.refs,
      body: input.body.trim(),
      evidence: input.evidence,
      basedOn: input.basedOn,
      force: input.force,
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return fail(err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
