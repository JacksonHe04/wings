"use client";

import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { clientAuth } from "./firebase";
import { connectToParent, isFramed } from "./embed-auth";

/**
 * 会话状态。用一个状态机而不是几个布尔量：
 * ` loading` 是从它**派生**出来的，不在 effect 里同步改状态（那会引发级联渲染，
 * React Compiler 的 set-state-in-effect 规则也会拦下）。
 */
type Session =
  | { phase: "restoring" } // 本地持久化的会话还没判定完
  | { phase: "embedding" } // 内嵌中：正等父页面（FDEA）递票据
  | { phase: "ready"; user: User }
  | { phase: "anonymous" }; // 确实没登录，该去登录页

/**
 * 当前登录的人类用户 + ID token 获取器（API 调用用）。
 *
 * 会话有两个来源，**内嵌时 FDEA 身份优先**：被 FDEA 嵌着就是它在说你是谁，
 * 本地遗留的会话不能压过它。反过来（本地优先、没有才握手）会出真事故——
 * 实测踩到过：以 `odb` 进 FDEA，wings 里显示的却是上一次登录留下的 Luke。
 * 只有在**没有父页面可问**（失败/超时）时，才回落到本地会话。
 */
export function useUser(): {
  user: User | null;
  loading: boolean;
  idToken: () => Promise<string>;
} {
  const [session, setSession] = useState<Session>({ phase: "restoring" });
  /** 内嵌握手一轮页面只试一次：否则退出登录会被立刻自动登回去 */
  const embedTried = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = onAuthStateChanged(clientAuth, (u) => {
      if (cancelled) return;
      if (isFramed() && !embedTried.current) {
        embedTried.current = true;
        setSession({ phase: "embedding" });
        void connectToParent().then((ok) => {
          if (cancelled) return;
          // 成功时 signInWithCustomToken 多半会再触发一次本回调；这里直接读当前用户兜底，
          // 免得万一那次回调没来就永远停在 embedding。
          const current = clientAuth.currentUser;
          if (ok && current) setSession({ phase: "ready", user: current });
          else setSession(u ? { phase: "ready", user: u } : { phase: "anonymous" });
        });
        return;
      }
      setSession(u ? { phase: "ready", user: u } : { phase: "anonymous" });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return {
    user: session.phase === "ready" ? session.user : null,
    loading: session.phase === "restoring" || session.phase === "embedding",
    idToken: async () => {
      const current = clientAuth.currentUser;
      if (!current) throw new Error("未登录");
      return current.getIdToken();
    },
  };
}
