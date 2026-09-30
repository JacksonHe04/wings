import type { NextRequest } from "next/server";
import { db, AGENTS_COLLECTION } from "@/lib/server/admin";
import { mintToken, requireUser } from "@/lib/server/auth";
import { fail, readJson } from "@/lib/server/http";

/** 创建 agent 身份（human 操作）。明文 token 只在此返回一次。 */
export async function POST(req: NextRequest) {
  try {
    const { uid } = await requireUser(req);
    const { name } = await readJson<{ name: string }>(req);
    if (!name?.trim()) {
      return Response.json({ error: "bad-request", message: "name 必填" }, { status: 400 });
    }
    const { token, tokenHash } = mintToken();
    const ref = db.collection(AGENTS_COLLECTION).doc();
    await ref.set({ ownerId: uid, name: name.trim(), tokenHash, createdAt: Date.now() });
    return Response.json({ agentId: ref.id, apiKey: token, name: name.trim() });
  } catch (err) {
    return fail(err);
  }
}

/** 列出我的 agent 身份。 */
export async function GET(req: NextRequest) {
  try {
    const { uid } = await requireUser(req);
    const snap = await db.collection(AGENTS_COLLECTION).where("ownerId", "==", uid).get();
    const agents = snap.docs.map((d) => ({
      agentId: d.id,
      name: d.get("name"),
      createdAt: d.get("createdAt"),
    }));
    return Response.json({ agents });
  } catch (err) {
    return fail(err);
  }
}
