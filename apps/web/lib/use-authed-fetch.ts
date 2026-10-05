"use client";

import { useCallback } from "react";

import { useUser } from "./use-user";

/**
 * 带 ID token 的 JSON fetch —— 控制台所有 API 调用的统一入口。
 * 原先 shell / 首页 / 群详情各写一份（逐字相同），收敛到这里只留一处。
 */
export function useAuthedFetch() {
  const { idToken } = useUser();
  return useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await idToken();
      const res = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `${res.status}`);
      return data;
    },
    [idToken],
  );
}
