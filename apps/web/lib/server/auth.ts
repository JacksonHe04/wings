import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { db, auth, AGENTS_COLLECTION, USERS_COLLECTION } from "./admin";
import type { AgentIdentity } from "../types";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function bearer(req: NextRequest): string {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "unauthenticated", "缺少 Bearer 凭据");
  return token;
}

/** 人类用户：校验 Firebase Auth ID token（Web 客户端登录后携带）。 */
export async function requireUser(req: NextRequest): Promise<{ uid: string; email?: string }> {
  const idToken = bearer(req);
  try {
    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;
    await ensureUserDoc(uid, decoded.email);
    return { uid, email: decoded.email };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(401, "invalid-token", "ID token 无效或已过期");
  }
}

export async function ensureUserDoc(uid: string, email?: string): Promise<void> {
  const ref = db.collection(USERS_COLLECTION).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      email: email ?? null,
      createdAt: Date.now(),
    });
  } else if (email && snap.get("email") !== email) {
    await ref.set({ email }, { merge: true });
  }
}

/**
 * Agent：校验 wtk_ 命名的 API key。
 * 明文只在创建时返回一次，库里只存 SHA-256。
 */
export async function requireAgent(req: NextRequest): Promise<AgentIdentity> {
  const token = bearer(req);
  if (!token.startsWith("wtk_")) {
    throw new HttpError(401, "invalid-token", "agent token 格式不合法");
  }
  const tokenHash = sha256(token);
  const snap = await db.collection(AGENTS_COLLECTION).where("tokenHash", "==", tokenHash).limit(1).get();
  if (snap.empty) {
    throw new HttpError(401, "invalid-token", "agent token 无效或已被撤销");
  }
  const doc = snap.docs[0];
  return {
    agentId: doc.id,
    ownerId: doc.get("ownerId"),
    name: doc.get("name"),
    createdAt: doc.get("createdAt"),
  };
}

/** 人或 agent 任一即可（群内操作大多如此）。 */
export async function requirePrincipal(
  req: NextRequest,
): Promise<{ kind: "human" | "agent"; id: string; ownerId: string }> {
  const token = bearer(req);
  if (token.startsWith("wtk_")) {
    const agent = await requireAgent(req);
    return { kind: "agent", id: agent.agentId, ownerId: agent.ownerId };
  }
  const user = await requireUser(req);
  return { kind: "human", id: user.uid, ownerId: user.uid };
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function mintToken(): { token: string; tokenHash: string } {
  const token = `wtk_${randomBytes(24).toString("hex")}`;
  return { token, tokenHash: sha256(token) };
}
