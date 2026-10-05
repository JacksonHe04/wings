/**
 * FDEA 登录：校验 FDEA 为 wings 签的短时票据。
 *
 * 契约与 fde-anything 的签发端成对（`server/fde/wings_ticket.py`），**改一头必须改另一头**：
 *
 *     HS256 JWT · WINGS_TICKET_SECRET 签名 · aud=wings · TTL 60s
 *     claims: sub = FDEA 用户 id · act = 账号名 · adm = 是否平台管理员
 *
 * 用**专用密钥**而不是复用 FDEA 的主 JWT 密钥：否则 wings 手里就握着签发 FDEA 全权 token 的能力，
 * 一次泄露跨两个产品。专用密钥下，最坏情况也只是伪造一张 wings 票据。
 */
import { jwtVerify, type JWTPayload } from "jose";
import { HttpError } from "./auth";
import { resolveWingsUid, type IdentityResolution } from "./identity";

/** 票据只发给 wings，防止同一把密钥签出的别的用途的票据被拿来登录。 */
const AUDIENCE = "wings";

function ticketSecret(): Uint8Array {
  const raw = process.env.WINGS_TICKET_SECRET;
  if (!raw) throw new HttpError(500, "misconfigured", "WINGS_TICKET_SECRET 未配置");
  return new TextEncoder().encode(raw);
}

export const fdeaProvider = async (credential: unknown): Promise<IdentityResolution> => {
  const ticket = typeof credential === "string" ? credential.trim() : "";
  if (!ticket) throw new HttpError(400, "bad-request", "缺少票据");

  let claims: JWTPayload;
  try {
    // exp 由 jose 校验；aud 也在这里卡死，不接受其他受众的票据
    ({ payload: claims } = await jwtVerify(ticket, ticketSecret(), {
      algorithms: ["HS256"],
      audience: AUDIENCE,
    }));
  } catch {
    // 过期 / 篡改 / 格式不对统一一句话，不给探测者分辨的余地
    throw new HttpError(401, "invalid-ticket", "票据无效或已过期");
  }

  const providerUserId = typeof claims.sub === "string" ? claims.sub : "";
  if (!providerUserId) throw new HttpError(401, "invalid-ticket", "票据缺少 sub");

  return {
    uid: await resolveWingsUid("fdea", providerUserId),
    provider: "fdea",
    providerUserId,
    account: typeof claims.act === "string" ? claims.act : undefined,
    isPlatformAdmin: claims.adm === true,
  };
};
