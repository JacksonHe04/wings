import type { NextRequest } from "next/server";
import { fail, readJson } from "@/lib/server/http";
import { requirePrincipal } from "@/lib/server/auth";
import { requireMembership, updateProfile } from "@/lib/server/groups";

interface PatchBody {
  ifVersion: number;
  description?: string;
  announcement?: string;
  goalAdd?: string;
  goalDone?: string;
  goalDrop?: string;
}

/** 群状态层 CAS 更新（公告 / 背景 / goals）。冲突 409 返回当前 profile。 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const principal = await requirePrincipal(req);
    const { groupId } = await params;
    await requireMembership(groupId, principal);
    const body = await readJson<PatchBody>(req);
    if (typeof body.ifVersion !== "number") {
      return Response.json({ error: "bad-request", message: "ifVersion 必填" }, { status: 400 });
    }
    const profile = await updateProfile(
      groupId,
      principal,
      {
        description: body.description,
        announcement: body.announcement,
        goalAdd: body.goalAdd,
        goalDone: body.goalDone,
        goalDrop: body.goalDrop,
      },
      body.ifVersion,
    );
    return Response.json({ profile });
  } catch (err) {
    return fail(err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
