"use client";

/**
 * 内嵌时把 iframe 里的路由与父页面的地址栏对齐（消息协议见 embed-auth.ts）。
 *
 * 两个方向共用一个 `syncedRef`，靠它防回环：
 * 自己动了 → 记下并上报；父页面让我们去哪儿 → 先记下再跳，
 * 跳完 pathname 变化时一看"正是同步过的那个值"，就不再报回去。
 */
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { isFramed, onParentNavigate, reportRouteToParent } from "./embed-auth";

export function useRouteSync(): void {
  const pathname = usePathname();
  const router = useRouter();
  const syncedRef = useRef<string | null>(null);
  // 订阅只挂一次：处理器从 ref 读当前位置，省得每次路由变化都重订一遍
  const pathRef = useRef(pathname);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!isFramed()) return;
    return onParentNavigate((path) => {
      if (path === pathRef.current) return;
      syncedRef.current = path;
      router.push(path);
    });
  }, [router]);

  useEffect(() => {
    if (!isFramed()) return;
    if (syncedRef.current === pathname) return; // 本来就是为了响应父页面才来的，别原样报回去
    syncedRef.current = pathname;
    reportRouteToParent(pathname);
  }, [pathname]);
}
