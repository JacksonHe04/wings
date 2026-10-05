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

/** 平台管理员写在 Firebase custom claim 里（签发处见 app/api/auth/session），读处只此一家。 */
export const PLATFORM_ADMIN_CLAIM = "adm";

/** 人类用户：校验 Firebase Auth ID token（Web 客户端登录后携带）。 */
export async function requireUser(
  req: NextRequest,
): Promise<{ uid: string; email?: string; isPlatformAdmin: boolean }> {
  const idToken = bearer(req);
  try {
    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;
    await ensureUserDoc(uid, { email: decoded.email });
    // 平台管理员随 ID token 直读，不查库：身份是登录时定下的，每次请求再查反而引入额外往返
    return { uid, email: decoded.email, isPlatformAdmin: decoded[PLATFORM_ADMIN_CLAIM] === true };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("[wings-api] verifyIdToken/ensureUser 失败:", err);
    throw new HttpError(401, "invalid-token", "ID token 无效或已过期");
  }
}

/** 建立 / 补齐 roster 记录。只补不删：传了值才写，避免把已有的展示名覆盖成空。 */
export async function ensureUserDoc(
  uid: string,
  profile: { email?: string; displayName?: string } = {},
): Promise<void> {
  const ref = db.collection(USERS_COLLECTION).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({
      email: profile.email ?? null,
      displayName: profile.displayName ?? null,
      createdAt: Date.now(),
    });
    return;
  }
  const patch: Record<string, string> = {};
  if (profile.email && snap.get("email") !== profile.email) patch.email = profile.email;
  if (profile.displayName && snap.get("displayName") !== profile.displayName) {
    patch.displayName = profile.displayName;
  }
  if (Object.keys(patch).length > 0) await ref.set(patch, { merge: true });
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
  const agent = await findAgentByToken(token);
  if (!agent) {
    throw new HttpError(401, "invalid-token", "agent token 无效或已被撤销");
  }
  return agent;
}

/** 按明文 API Key 反查 agent 身份；非 wtk_ 前缀或查不到都返回 null。 */
export async function findAgentByToken(token: string): Promise<AgentIdentity | null> {
  if (!token.startsWith("wtk_")) return null;
  const snap = await db
    .collection(AGENTS_COLLECTION)
    .where("tokenHash", "==", sha256(token))
    .limit(1)
    .get();
  if (snap.empty) return null;
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
): Promise<{ kind: "human" | "agent"; id: string; ownerId: string; isPlatformAdmin: boolean }> {
  const token = bearer(req);
  if (token.startsWith("wtk_")) {
    const agent = await requireAgent(req);
    // agent 一律不是平台管理员：它的 token 是给某个 agent 用的窄凭据，
    // 不因为主人是管理员就跟着放大（要管理面就用人的身份走 Web）。
    return { kind: "agent", id: agent.agentId, ownerId: agent.ownerId, isPlatformAdmin: false };
  }
  const user = await requireUser(req);
  return { kind: "human", id: user.uid, ownerId: user.uid, isPlatformAdmin: user.isPlatformAdmin };
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function mintToken(): { token: string; tokenHash: string } {
  const token = `wtk_${randomBytes(24).toString("hex")}`;
  return { token, tokenHash: sha256(token) };
}
