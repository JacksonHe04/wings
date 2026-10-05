/**
 * 身份解析：把外部凭据解析成 wings 内的稳定 uid。
 *
 * wings 的 uid 贯穿整个数据面（`users/{uid}`、`agents.ownerId`、群成员 doc id、消息 `from.id`），
 * 所以**外部身份不直接当 uid 用**，中间隔一层映射：
 *
 *     identities/{provider}:{providerUserId} → { uid }
 *
 * 好处是既有的 Firebase uid 一个都不用搬——把 FDEA 身份指到旧 uid 上就完成了绑定，
 * 撤销绑定也只是删一条 doc。这与「换一种登录方式」是同一件事的两面：
 * 登录方式的差别只到这一层为止，往下全是同一份数据。
 */
import { db, IDENTITIES_COLLECTION } from "./admin";
import { HttpError, findAgentByToken } from "./auth";

/** 一种登录方式解析出的身份。`providerUserId` 是该身份在来源侧的稳定 id。 */
export interface IdentityResolution {
  /** 数据面真正使用的 uid */
  uid: string;
  /** 来源标识，用于审计与排查（`api-key` / `fdea`） */
  provider: string;
  /** 来源侧的稳定 id：api-key 是 agentId，fdea 是 FDEA 的用户 id */
  providerUserId: string;
  /** 来源侧的账号名，用于 roster 展示 */
  account?: string;
  /** 平台管理员：凭它读写所有群，不受群成员限制 */
  isPlatformAdmin?: boolean;
}

/** 一种登录方式：吃到凭据，吐出身份。 */
export type IdentityProvider = (credential: unknown) => Promise<IdentityResolution>;

/** identities 的 doc id —— 直接按 doc 取，不需要索引。 */
export function identityDocId(provider: string, providerUserId: string): string {
  return `${provider}:${providerUserId}`;
}

/**
 * 外部身份 → wings uid。
 * 绑过就用既有 uid；没绑过则以 `{provider}:{providerUserId}` 作新 uid 落一条映射。
 * 绑定一个既有用户 = 把这条 doc 的 uid 改成他的旧 uid（`boundAt` 不变，便于分辨）。
 */
export async function resolveWingsUid(provider: string, providerUserId: string): Promise<string> {
  const ref = db.collection(IDENTITIES_COLLECTION).doc(identityDocId(provider, providerUserId));
  const snap = await ref.get();
  if (snap.exists) return snap.get("uid") as string;
  const uid = identityDocId(provider, providerUserId);
  await ref.set({ uid, provider, providerUserId, boundAt: Date.now() });
  return uid;
}

/**
 * API Key：凭据是一把 agent token。
 * 它是唯一**不走映射层**的方式——token 本来就由某个 owner 创建，解析出的 ownerId 已是 wings uid。
 */
export const apiKeyProvider: IdentityProvider = async (credential) => {
  const apiKey = typeof credential === "string" ? credential.trim() : "";
  const agent = await findAgentByToken(apiKey);
  if (!agent) throw new HttpError(401, "invalid-token", "API Key 无效或已被撤销");
  return {
    uid: agent.ownerId,
    provider: "api-key",
    providerUserId: agent.agentId,
    account: agent.name,
  };
};
