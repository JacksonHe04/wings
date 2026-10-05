import * as React from "react";

const MOBILE_BREAKPOINT = 768;

/**
 * 是否窄屏。
 *
 * **与 shadcn 上游（以及 fde-anything 的那份）实现不同**：上游在 effect 里同步
 * `setState` 读宽度，因此 fde-anything 只能把 `react-hooks/set-state-in-effect`
 * 整条规则关掉。这里改用 `useSyncExternalStore`——它本来就是"订阅外部可变值"的正解，
 * 既不用在 effect 里写状态，也顺带把 SSR 的快照说清楚了。于是 wings 能留着那条规则
 * （它抓到过真 bug，见 lib/use-user.ts 的会话状态机）。
 */
function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    // 服务端没有窗口：一律按非移动渲染，客户端首帧再校正
    () => false,
  );
}
