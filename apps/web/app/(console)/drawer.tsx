"use client";

/**
 * 右侧抽屉：新建任务、群详情等浮层的统一容器。
 * 面板常驻 DOM、靠 translate 出屏——这样开关有过渡动画，不会闪一下再滑出。
 * 关着时给面板挂 inert：既让出点击，也把里面的控件移出 Tab 焦点序列。
 */
import { useEffect } from "react";

export function Drawer({
  open,
  onClose,
  title,
  children,
  widthClass = "w-full max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** 面板宽度，默认窄抽屉；需要全屏时传 "w-full" */
  widthClass?: string;
}) {
  // Esc 关闭：只在开着时挂监听，免得和页面其它键盘操作打架
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* 遮罩：关着时同时让出点击，否则一个透明层会盖住整页 */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-paper/25 transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        inert={!open}
        className={`fixed inset-y-0 right-0 z-50 flex flex-col border-l border-line bg-panel shadow-panel transition-transform duration-200 ${widthClass} ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
          <span className="plate">{title}</span>
          <button onClick={onClose} className="btn-ghost">关闭</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </>
  );
}
