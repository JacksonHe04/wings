import type { NextRequest } from "next/server";
import { db, GROUPS_COLLECTION, membersCol } from "@/lib/server/admin";
import { requirePrincipal, ensureUserDoc, HttpError } from "@/lib/server/auth";
import { fail, readJson } from "@/lib/server/http";
import { appendSystemMessage } from "@/lib/server/groups";
import type { Goal, Member } from "@/lib/types";

interface CreateBody {
  name: string;
  description?: string;
  goals?: string[];
}

/** 建群即立项：人（Web）或 agent（CLI）都可创建，创建者成为 owner。 */
export async function POST(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const body = await readJson<CreateBody>(req);
    if (!body.name?.trim()) {
      throw new HttpError(400, "bad-request", "name 必填");
    }

    const goals: Goal[] = (body.goals ?? [])
      .map((text) => text.trim())
      .filter(Boolean)
      .map((text, i) => ({ id: `g${i + 1}`, text, status: "open" as const }));

    const ref = db.collection(GROUPS_COLLECTION).doc();
    const now = Date.now();
    const profile = {
      description: body.description?.trim() ?? "",
      announcement: "",
      announcementVersion: 1,
      goals,
    };
    await ref.set({
      name: body.name.trim(),
      createdBy: principal.id,
      createdAt: now,
      status: "active",
      seq: 0,
      profile,
      // 冗余成员数组：Firestore 无法跨子集合查询，列表页靠它反查「我在的群」
      memberIds: [principal.id],
    });

    const member: Member = {
      id: principal.id,
      kind: principal.kind,
      role: "owner",
      name:
        principal.kind === "agent"
          ? (await db.collection("agents").doc(principal.id).get()).get("name") ?? "agent"
          : "human",
      joinedAt: now,
    };
    await membersCol(ref.id).doc(principal.id).set(member);
    await appendSystemMessage(
      ref.id,
      `群由 ${principal.kind}:${principal.id} 创建。目标：${goals.map((g) => `${g.id} ${g.text}`).join("；") || "（立项时未填）"}`,
    );

    if (principal.kind === "human") await ensureUserDoc(principal.id);
    return Response.json({ groupId: ref.id, profile });
  } catch (err) {
    return fail(err);
  }
}

/** 我参与的群列表（memberIds 冗余数组反查）。 */
export async function GET(req: NextRequest) {
  try {
    const principal = await requirePrincipal(req);
    const snap = await db
      .collection(GROUPS_COLLECTION)
      .where("memberIds", "array-contains", principal.id)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();
    const groups = snap.docs.map((d) => ({
      id: d.id,
      name: d.get("name"),
      status: d.get("status"),
      seq: d.get("seq"),
      createdAt: d.get("createdAt"),
      profile: d.get("profile"),
    }));
    return Response.json({ groups });
  } catch (err) {
    return fail(err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
