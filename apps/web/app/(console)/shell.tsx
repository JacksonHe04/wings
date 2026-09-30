"use client";

/**
 * 控制台外壳：白侧栏（群导航）+ 主区。
 * 对齐 fde-anything Studio 的骨架——外壳不滚动，页面自管滚动区。
 * 移动端侧栏隐藏，首页主区自带群列表（见 page.tsx 的 lg:hidden 区块）。
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/lib/use-user";

export interface GroupSummary {
  id: string;
  name: string;
  status: string;
  seq: number;
  createdAt: number;
  profile: { goals: Array<{ id: string; text: string; status: string }>; description: string };
}

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const { user, loading, idToken } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [groups, setGroups] = useState<GroupSummary[]>([]);

  const authedFetch = useCallback(
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

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    authedFetch("/api/groups")
      .then((d: { groups: GroupSummary[] }) => setGroups(d.groups))
      .catch(() => undefined);
  }, [user, pathname, authedFetch]);

  if (loading || !user) {
    return <div className="flex h-svh items-center justify-center" />;
  }

  const active = groups.filter((g) => g.status !== "archived");

  return (
    <div className="flex h-svh overflow-hidden">
      {/* 侧栏：群导航 */}
      <aside className="hidden w-(--sidebar-w) shrink-0 flex-col border-r border-line bg-panel lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-line px-4">
          <Link href="/" className="coord text-lg font-semibold tracking-tight text-paper">wings</Link>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          <p className="plate px-2 pb-1.5 pt-2">群 · 任务</p>
          <ul>
            {active.map((g) => {
              const isActive = pathname === `/groups/${g.id}`;
              return (
                <li key={g.id}>
                  <Link
                    href={`/groups/${g.id}`}
                    className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors ${
                      isActive ? "bg-panel-2 font-medium text-paper" : "text-dim hover:bg-panel-2/60 hover:text-paper"
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${g.status === "archived" ? "bg-line" : "bg-signal"}`} />
                    <span className="truncate">{g.name}</span>
                  </Link>
                </li>
              );
            })}
            {active.length === 0 && <li className="px-2 py-3 text-xs text-faint">还没有进行中的群</li>}
          </ul>
        </nav>
        <div className="flex h-16 shrink-0 items-center gap-3 border-t border-line px-4">
          <span className="min-w-0 flex-1 truncate text-xs text-dim">{user.displayName ?? user.email}</span>
          <button onClick={() => clientSignOut()} className="btn-ghost shrink-0">退出</button>
        </div>
      </aside>

      {/* 主区：页面自管滚动 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

async function clientSignOut() {
  const { signOut } = await import("firebase/auth");
  const { clientAuth } = await import("@/lib/firebase");
  await signOut(clientAuth);
  location.href = "/login";
}
