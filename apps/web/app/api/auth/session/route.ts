import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/admin";
import { ensureUserDoc, HttpError, PLATFORM_ADMIN_CLAIM } from "@/lib/server/auth";
import { fdeaProvider } from "@/lib/server/fdea";
import { apiKeyProvider, type IdentityProvider } from "@/lib/server/identity";
import { fail, readJson } from "@/lib/server/http";

/**
 * 登录：任一种凭据换一个观察台会话。
 *
 * 换到的**永远是 Firebase 自定义令牌**，前端 signInWithCustomToken 登入后一切照旧——
 * 实时订阅、Firestore rules、页面里的 ID token 都不需要改。所以"多一种登录方式"
 * 在这里收敛为一件事：**把外部身份解析成 uid**（见 lib/server/identity.ts 的映射层）。
 *
 * 请求体两种形态，等价：
 *   { apiKey }                              ← 既有调用方，API Key 就是账号凭据
 *   { provider: "fdea", credential: ticket } ← FDEA 内嵌时由父页面递来的短时票据
 */
type SessionBody = { apiKey?: string; provider?: string; credential?: unknown };

const providers: Record<string, IdentityProvider> = {
  "api-key": apiKeyProvider,
  fdea: fdeaProvider,
};

export async function POST(req: NextRequest) {
  try {
    const body = await readJson<SessionBody>(req);
    // body 里只有 apiKey 时按 api-key 走，老客户端与 e2e 不用改
    const provider = body.provider ?? (body.apiKey !== undefined ? "api-key" : "");
    const impl = providers[provider];
    if (!impl) throw new HttpError(400, "unknown-provider", `不支持的登录方式：${provider || "(空)"}`);
    const credential = provider === "api-key" ? body.apiKey : body.credential;

    const identity = await impl(credential);
    await ensureUserDoc(identity.uid, { displayName: identity.account });

    const token = await auth.createCustomToken(identity.uid, {
      // 平台管理员随令牌下发：每个请求从 ID token 直读，不必再查库。
      // 代价是 FDEA 侧撤管理员后最长滞后一个 ID token 周期（已记入设计文档）。
      [PLATFORM_ADMIN_CLAIM]: identity.isPlatformAdmin === true,
      provider: identity.provider,
    });
    // account 一并回给客户端：新身份没有 Firebase displayName，由它补上
    return Response.json({ token, account: identity.account ?? null });
  } catch (err) {
    return fail(err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
