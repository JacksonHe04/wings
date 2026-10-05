"use client";

/**
 * 内嵌接入：被 FDEA 嵌在 iframe 里时，直接借用父页面的登录态，不出现 wings 登录页。
 *
 * 票据走 postMessage 而**不是 URL**——URL 会进浏览器历史、referrer 与各级访问日志，
 * 一张票据就那样摊在好几处；postMessage 只在父子窗口之间过一手。
 *
 * 时序：wings 广播「我在这儿」→ 父页面回一张 60s 票据 → wings 拿去换会话。
 * 没等到就落回登录页——父页面可能不是 FDEA，或者 FDEA 自己也没登录。
 */
import { signInWithCustomToken } from "firebase/auth";
import { clientAuth } from "./firebase";

/** 只接受这些来源递来的票据（NEXT_PUBLIC_WINGS_EMBED_PARENTS，逗号分隔）。 */
const ALLOWED_PARENTS = (process.env.NEXT_PUBLIC_WINGS_EMBED_PARENTS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const READY = "wings:ready";
const TICKET = "wings:ticket";

/** 握手等待上限：到点就走登录页，不留白屏。 */
const HANDSHAKE_TIMEOUT_MS = 5000;

/** 是否被嵌在 iframe 里（顶层窗口的 parent 就是它自己）。 */
export function isFramed(): boolean {
  return typeof window !== "undefined" && window.parent !== window;
}

/** 向父页面要一张票据；超时或来源不可信都返回 null。 */
function requestTicketFromParent(): Promise<string | null> {
  return new Promise((resolve) => {
    // 白名单为空表示不做来源预判——票据本身还要服务端验签，这一步只是多一道闸
    const trusted = (origin: string) => ALLOWED_PARENTS.length === 0 || ALLOWED_PARENTS.includes(origin);

    const finish = (ticket: string | null) => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(ticket);
    };
    const timer = setTimeout(() => finish(null), HANDSHAKE_TIMEOUT_MS);
    function onMessage(event: MessageEvent) {
      if (!trusted(event.origin)) return;
      const data = event.data as { type?: string; ticket?: string } | null;
      if (data?.type !== TICKET || typeof data.ticket !== "string") return;
      finish(data.ticket);
    }

    window.addEventListener("message", onMessage);
    // 广播 readiness：父页面不必猜什么时候该发，收到就回
    window.parent.postMessage({ type: READY }, "*");
  });
}

/**
 * 完成内嵌接入。成功返回 true（此时 Firebase 会话已建立，onAuthStateChanged 会跟上），
 * 失败返回 false，由调用方决定回落到登录页。
 */
export async function connectToParent(): Promise<boolean> {
  const ticket = await requestTicketFromParent();
  if (!ticket) return false;
  try {
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "fdea", credential: ticket }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "接入失败");
    await signInWithCustomToken(clientAuth, data.token);
    return true;
  } catch {
    return false;
  }
}
