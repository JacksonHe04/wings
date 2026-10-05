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
 * 会话有两个来源，**顺序不能反**：先用本地持久化的 Firebase 会话；
 * 确实没有时，如果被 FDEA 嵌着，才去借父页面的登录态（见 embed-auth.ts）。
 * 反过来先握手的话，每次刷新都要白等一轮父页面回话。
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
      if (u) {
        setSession({ phase: "ready", user: u });
        return;
      }
      // 本地确实没有会话。没被嵌着就到此为止，由调用方送去登录页。
      if (!isFramed() || embedTried.current) {
        setSession({ phase: "anonymous" });
        return;
      }
      embedTried.current = true;
      setSession({ phase: "embedding" });
      void connectToParent().then((ok) => {
        if (cancelled) return;
        // 成功时 signInWithCustomToken 会再触发一次本回调并带上 u，这里只处理失败
        if (!ok) setSession({ phase: "anonymous" });
      });
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
