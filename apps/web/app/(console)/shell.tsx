"use client";

/**
 * 控制台外壳：侧栏（群导航）+ 主区。
 *
 * 侧栏取值按 fde-anything Studio 的侧栏来——同样的 `--sidebar-*` 令牌、同样的
 * `--app-header-height` 顶栏高度、同样的条目圆角与悬停底色：两个产品并排时不该看得出接缝。
 * 外壳永远不滚动，各页面自管滚动区（`h-svh overflow-hidden`）；
 * 移动端侧栏隐藏，首页主区自带群列表（见 page.tsx 的 lg:hidden 区块）。
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useRouteSync } from "@/lib/use-route-sync";
import { useUser } from "@/lib/use-user";
import { cn } from "@/lib/utils";

export interface GroupSummary {
  id: string;
  name: string;
  status: string;
  seq: number;
  createdAt: number;
  profile: { goals: Array<{ id: string; text: string; status: string }>; description: string };
}

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  // 内嵌时让父页面的地址栏跟上 iframe 里的位置（不嵌则什么也不做）
  useRouteSync();
  const { user, loading, idToken } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);

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

  // 群导航随路由刷新（建群 / 删群后回来要准）；loading 只在首屏为真，切页时不闪
  useEffect(() => {
    if (!user) return;
    authedFetch("/api/groups")
      .then((d: { groups: GroupSummary[] }) => setGroups(d.groups))
      .catch(() => undefined)
      .finally(() => setGroupsLoading(false));
  }, [user, pathname, authedFetch]);

  if (loading || !user) {
    return <div className="flex h-svh items-center justify-center" />;
  }

  const active = groups.filter((g) => g.status !== "archived");
  const archived = groups.filter((g) => g.status === "archived");

  return (
    <div className="flex h-svh overflow-hidden">
      {/* 侧栏：群导航 */}
      <aside className="hidden w-(--sidebar-w) shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-(--app-header-height) shrink-0 items-center border-b border-sidebar-border px-4">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            wings
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          <p className="plate px-2 pt-2 pb-1.5">群 · 任务</p>
          <ul>
            {groupsLoading && (
              <li className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
                <Spinner className="size-3.5" />
                加载中
              </li>
            )}
            {!groupsLoading &&
              active.map((g) => (
                <GroupRow key={g.id} group={g} current={pathname === `/groups/${g.id}`} />
              ))}
            {!groupsLoading && active.length === 0 && (
              <li className="px-2 py-3 text-xs text-text-tertiary">还没有进行中的群</li>
            )}
          </ul>
          {!groupsLoading && archived.length > 0 && (
            <>
              <p className="plate px-2 pt-4 pb-1.5">已归档 · {archived.length}</p>
              <ul>
                {archived.map((g) => (
                  <GroupRow key={g.id} group={g} current={pathname === `/groups/${g.id}`} />
                ))}
              </ul>
            </>
          )}
          <p className="plate px-2 pt-4 pb-1.5">凭证</p>
          <ul>
            <li>
              <NavRow href="/api-keys" current={pathname === "/api-keys"} dot="outline">
                API Key
              </NavRow>
            </li>
          </ul>
        </nav>
        <div className="flex h-(--app-header-height) shrink-0 items-center gap-2 border-t border-sidebar-border px-4">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {user.displayName ?? user.email ?? user.uid.slice(0, 8)}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => clientSignOut()} title="退出" aria-label="退出">
            <LogOut />
          </Button>
        </div>
      </aside>

      {/* 主区：页面自管滚动 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

/** 侧栏条目：进行中用信号绿点，归档弱化成灰点，当前页高亮。 */
function GroupRow({ group, current }: { group: GroupSummary; current: boolean }) {
  const archived = group.status === "archived";
  return (
    <li>
      <NavRow href={`/groups/${group.id}`} current={current} muted={archived} dot={archived ? "muted" : "online"}>
        {group.name}
      </NavRow>
    </li>
  );
}

/** 侧栏一行的统一形态：圆点 + 文本，悬停/选中的底色与圆角取自 `--sidebar-accent`。 */
function NavRow({
  href,
  current,
  children,
  dot,
  muted,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
  dot: "online" | "outline" | "muted";
  muted?: boolean;
}) {
  const dotClass =
    dot === "online" ? "bg-presence-online" : dot === "outline" ? "border border-muted-foreground" : "bg-border";
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors",
        current
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : cn(
              "hover:bg-sidebar-accent/60",
              muted ? "text-text-tertiary" : "text-muted-foreground hover:text-foreground",
            ),
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", dotClass)} />
      <span className="truncate">{children}</span>
    </Link>
  );
}

async function clientSignOut() {
  const { signOut } = await import("firebase/auth");
  const { clientAuth } = await import("@/lib/firebase");
  await signOut(clientAuth);
  location.href = "/login";
}
