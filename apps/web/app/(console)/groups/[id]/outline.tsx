"use client";

/**
 * 左栏消息目录：一条消息一项，只给「第几条 / 谁 / 什么时候」三样。
 * 只列人与 agent 的消息——system 消息（状态跃迁、goal 变更自动产生）量大且无主，
 * 列进来会把目录淹掉；它们仍在中栏显示，只是不进目录。
 */
import { useMemo } from "react";

import { isOutlineItem, messageAuthorName } from "@/lib/messages";
import { hhmm } from "@/lib/time";
import type { Member, Message } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MessageOutline({
  messages,
  members,
  activeSeq,
  onJump,
}: {
  messages: Message[];
  members: Member[];
  /** 当前读到第几条；由滚动位置驱动，点目录也会立刻置上 */
  activeSeq: number | null;
  onJump: (seq: number) => void;
}) {
  const items = useMemo(() => messages.filter(isOutlineItem), [messages]);
  return (
    <nav aria-label="消息目录" className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <span className="plate">目录 · {items.length}</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {items.map((m) => {
          const active = m.seq === activeSeq;
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => onJump(m.seq)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "w-full rounded-lg px-2 py-1.5 text-left transition-colors",
                  active ? "bg-muted" : "hover:bg-row-hover",
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span className={cn("coord text-[11px]", active ? "text-foreground" : "text-text-tertiary")}>
                    #{String(m.seq).padStart(3, "0")}
                  </span>
                  <span className="coord ml-auto text-[11px] text-text-tertiary">{hhmm(m.createdAt)}</span>
                </span>
                <span
                  className={cn(
                    "mt-0.5 block truncate text-xs",
                    active ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {messageAuthorName(m.from, members)}
                </span>
              </button>
            </li>
          );
        })}
        {items.length === 0 && <li className="px-2 py-3 text-xs text-text-tertiary">还没有消息</li>}
      </ul>
    </nav>
  );
}
