/**
 * 加载转圈：异步内容（群列表、群详情等）未就绪时的统一占位。
 * 全站只有这一处转圈实现，别再各页面手写 border + animate-spin。
 */
export function Spinner({ label }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-xs text-faint">
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-line border-t-dim"
      />
      <span>{label ?? "加载中"}</span>
    </span>
  );
}
