"use client";

/**
 * 一键复制按钮：全站唯一的剪贴板出口。
 * 复制成功后 1.5s 内把文案换成「已复制」，避免各处重复手写 navigator.clipboard。
 */
import { useEffect, useRef, useState } from "react";

export function CopyButton({
  text,
  label = "复制",
  copiedLabel = "已复制",
  className = "btn-ghost",
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 卸载时清掉待触发的复位定时器，避免往已卸载组件写状态
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy(e: React.MouseEvent) {
    // 场景多嵌在 <summary> / 卡片里，别让点击冒泡成展开收起
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return; // 浏览器拒绝剪贴板时保持原样，不做假成功
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button type="button" onClick={copy} className={`${className} shrink-0`}>
      {copied ? copiedLabel : label}
    </button>
  );
}
