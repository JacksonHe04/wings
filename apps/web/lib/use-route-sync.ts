"use client";

/**
 * 内嵌时把 iframe 里的路由与父页面的地址栏对齐（消息协议见 embed-auth.ts）。
 *
 * 两个方向共用一个 `syncedRef` 防回环。但**光有它不够**——还得有 `parentSpokeRef`：
 * 我们一挂载就位于某个位置（通常是首页），如果立刻上报，父页面会把地址栏改成那个位置，
 * 于是"用户直接打开 /lab/wings/groups/xxx"这条深链**在父页面还没来得及把它交给我们之前
 * 就被覆盖掉了**，刷新或新标签页打开都会掉回首页。
 *
 * 所以次序是：**父页面先开口**（ready 之后必发一条 NAVIGATE，哪怕就是首页），
 * 那之后我们才上报。父页面没开口就什么都不报。
 */
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { isFramed, onParentNavigate, reportRouteToParent } from "./embed-auth";

export function useRouteSync(): void {
  const pathname = usePathname();
  const router = useRouter();
  const syncedRef = useRef<string | null>(null);
  /** 父页面是否已经表明过它的位置；在那之前我们一律不上报 */
  const parentSpokeRef = useRef(false);
  // 订阅只挂一次：处理器从 ref 读当前位置，省得每次路由变化都重订一遍
  const pathRef = useRef(pathname);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!isFramed()) return;
    return onParentNavigate((path) => {
      parentSpokeRef.current = true;
      if (path === pathRef.current) return;
      syncedRef.current = path;
      router.push(path);
    });
  }, [router]);

  useEffect(() => {
    if (!isFramed() || !parentSpokeRef.current) return;
    if (syncedRef.current === pathname) return; // 本来就是为了响应父页面才来的，别原样报回去
    syncedRef.current = pathname;
    reportRouteToParent(pathname);
  }, [pathname]);
}
