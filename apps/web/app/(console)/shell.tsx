"use client";

/**
 * 控制台外壳：侧栏（群导航）+ 主区。
 *
 * 侧栏直接用 fde-anything 同款的 shadcn `Sidebar`——同一套折叠机制、同一个折叠图标、
 * 同样的 14rem 宽度，两个产品并排才看不出接缝。**默认折叠**（Jackson 261005）。
 * 外壳永远不滚动，各页面自管滚动区。
 *
 * 内嵌在 FDEA 里时**不提供身份与登出**：这两件事都归 FDEA 管，这边再来一份只是重复，
 * 而且"登出"根本没有意义——登不登出取决于 FDEA。
 */
import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { KeyRound, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { isFramed } from "@/lib/embed-auth";
import { GroupsProvider, useGroups, type GroupSummary } from "@/lib/groups-context";
import { useRouteSync } from "@/lib/use-route-sync";
import { useUser } from "@/lib/use-user";
import { cn } from "@/lib/utils";

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  // 内嵌时让父页面的地址栏跟上 iframe 里的位置（不嵌则什么也不做）
  useRouteSync();
  const { user, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  // 鉴权未落定前整块占位：SSR 与首次客户端渲染都走这条，不会有水合不一致
  if (loading || !user) {
    return <div className="flex h-svh items-center justify-center" />;
  }

  // 内嵌时身份与登出归 FDEA
  const embedded = isFramed();

  return (
    <GroupsProvider>
      <SidebarProvider defaultOpen={false} className="h-svh overflow-hidden">
        <Sidebar collapsible="icon" className="border-r">
          {/* 头部高度与主区顶栏同源(--app-header-height):两条分隔线才对得齐 */}
          <SidebarHeader className="h-(--app-header-height) shrink-0 justify-center border-b border-sidebar-border px-2">
            <Link
              href="/"
              className="flex h-8 items-center px-2 text-lg font-semibold tracking-tight group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            >
              <span className="group-data-[collapsible=icon]:hidden">wings</span>
              <span className="hidden text-base group-data-[collapsible=icon]:inline">w</span>
            </Link>
          </SidebarHeader>

          <SidebarNav />

          {/* 底部与头部同高(--app-header-height):侧栏上下两条分隔线对称 */}
          <SidebarFooter className="h-(--app-header-height) shrink-0 justify-center border-t border-sidebar-border p-2">
            <div className="flex h-9 items-center gap-2 overflow-hidden rounded-md px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
              {!embedded && (
                <>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                    {user.displayName ?? user.email ?? user.uid.slice(0, 8)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 group-data-[collapsible=icon]:hidden"
                    onClick={() => clientSignOut()}
                    title="退出"
                    aria-label="退出"
                  >
                    <LogOut />
                  </Button>
                </>
              )}
              <SidebarTrigger className="shrink-0" />
            </div>
          </SidebarFooter>

          {/* 折叠热区从头部下沿开始,避免压在品牌上 */}
          <SidebarRail className="top-(--app-header-height)" />
        </Sidebar>
        {/* 主区：页面自管滚动 */}
        <SidebarInset className="flex h-svh min-w-0 flex-col overflow-hidden bg-canvas">{children}</SidebarInset>
      </SidebarProvider>
    </GroupsProvider>
  );
}

/**
 * 群导航内容。数据来自 GroupsProvider——与首页群列表、群详情共用一份，
 * 详情页归档 / 取消归档后调 refresh()，这里立刻跟着分组变化。
 */
function SidebarNav() {
  const { groups, loading } = useGroups();
  const pathname = usePathname();
  const active = groups.filter((g) => g.status !== "archived");
  const archived = groups.filter((g) => g.status === "archived");

  return (
    <SidebarContent className="py-2">
      <NavSection label="群 · 任务">
        {loading && (
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="加载中">
              <Spinner className="size-4 shrink-0" />
              <span>加载中</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
        {!loading &&
          active.map((g) => (
            <GroupItem key={g.id} group={g} current={pathname === `/groups/${g.id}`} />
          ))}
        {!loading && active.length === 0 && (
          <li className="px-2 py-2 text-xs text-text-tertiary group-data-[collapsible=icon]:hidden">
            还没有进行中的群
          </li>
        )}
      </NavSection>

      {!loading && archived.length > 0 && (
        <NavSection label={`已归档 · ${archived.length}`}>
          {archived.map((g) => (
            <GroupItem key={g.id} group={g} current={pathname === `/groups/${g.id}`} />
          ))}
        </NavSection>
      )}

      <NavSection label="凭证">
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={pathname === "/api-keys"} tooltip="API Key">
            <Link href="/api-keys">
              <KeyRound />
              <span>API Key</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </NavSection>
    </SidebarContent>
  );
}

/** 分组：标题 + 圆角框只做视觉分区（与 FDEA 侧栏同构），折叠态收掉框与标题。 */
function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <SidebarGroup className="px-2 py-1">
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent className="rounded-xl border border-sidebar-border p-1 group-data-[collapsible=icon]:rounded-none group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:p-0">
        <SidebarMenu>{children}</SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function GroupItem({ group, current }: { group: GroupSummary; current: boolean }) {
  const archived = group.status === "archived";
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={current} tooltip={group.name}>
        <Link href={`/groups/${group.id}`}>
          {/* 折叠态只剩这个字形，所以它得能区分不同的群——取名字首字。
              16px 是为了放得进折叠后的 32px 按钮（内边距 8px，内容区正好 16px）。 */}
          <span
            aria-hidden
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded-sm border text-[9px] leading-none font-medium",
              archived
                ? "border-sidebar-border text-text-tertiary"
                : "border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            {group.name.slice(0, 1)}
          </span>
          <span>{group.name}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

async function clientSignOut() {
  const { signOut } = await import("firebase/auth");
  const { clientAuth } = await import("@/lib/firebase");
  await signOut(clientAuth);
  location.href = "/login";
}
