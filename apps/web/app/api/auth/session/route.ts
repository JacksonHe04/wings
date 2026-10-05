import type { NextRequest } from "next/server";
import { auth } from "@/lib/server/admin";
import { findAgentByToken, HttpError } from "@/lib/server/auth";
import { fail, readJson } from "@/lib/server/http";

/**
 * 用 API Key 换一个观察台会话。
 *
 * API Key 就是账号凭据（等价于密码）：换到的 Firebase 自定义令牌属于这把 Key 的
 * 主人（owner），前端用 signInWithCustomToken 登入后，一切照旧——实时订阅、rules、
 * 页面里的 ID token 都不需要改。
 */
export async function POST(req: NextRequest) {
  try {
    const { apiKey } = await readJson<{ apiKey?: string }>(req);
    const agent = await findAgentByToken(apiKey?.trim() ?? "");
    if (!agent) {
      throw new HttpError(401, "invalid-token", "API Key 无效或已被撤销");
    }
    const token = await auth.createCustomToken(agent.ownerId);
    return Response.json({ token });
  } catch (err) {
    return fail(err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
