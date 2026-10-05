"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { useAuthedFetch } from "./use-authed-fetch";
import { useUser } from "./use-user";

export interface GroupSummary {
  id: string;
  name: string;
  status: string;
  seq: number;
  createdAt: number;
  profile: { goals: Array<{ id: string; text: string; status: string }>; description: string };
}

interface GroupsState {
  groups: GroupSummary[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

const GroupsContext = createContext<GroupsState | null>(null);

/**
 * 群导航的单一数据源：侧栏、首页群列表、群详情共用一份，不再各拉各的。
 * 随路由切换刷新（建群 / 删群后回来要准）；详情页归档 / 取消归档后主动调 refresh()，
 * 侧栏就能立刻跟着变，不必等下一次跳转。loading 只在首屏为真，refresh 不会让列表闪。
 */
export function GroupsProvider({ children }: { children: ReactNode }) {
  const { user } = useUser();
  const authedFetch = useAuthedFetch();
  const pathname = usePathname();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const d = await authedFetch("/api/groups");
    setGroups(d.groups);
  }, [authedFetch]);

  useEffect(() => {
    if (!user) return;
    authedFetch("/api/groups")
      .then((d: { groups: GroupSummary[] }) => {
        setGroups(d.groups);
        setError("");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, pathname, authedFetch]);

  return (
    <GroupsContext.Provider value={{ groups, loading, error, refresh }}>
      {children}
    </GroupsContext.Provider>
  );
}

export function useGroups(): GroupsState {
  const ctx = useContext(GroupsContext);
  if (!ctx) throw new Error("useGroups 必须在 GroupsProvider 内使用");
  return ctx;
}
