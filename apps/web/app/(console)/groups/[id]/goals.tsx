"use client";

/**
 * 右栏：只放目标。
 *
 * 三种状态各自说清自己是什么。从前只靠一个字符区分（☑ / ☐ / ☒），
 * "打叉"到底什么意思没人看得出来——所以 dropped 在底部图例里给一句人话解释。
 */
import { Square, SquareCheck, SquareX, type LucideIcon } from "lucide-react";

import type { Goal, GroupProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATES: Record<Goal["status"], { icon: LucideIcon; tone: string }> = {
  open: { icon: Square, tone: "text-muted-foreground" },
  done: { icon: SquareCheck, tone: "text-presence-online" },
  dropped: { icon: SquareX, tone: "text-text-tertiary" },
};

export function GoalsPanel({ profile }: { profile: GroupProfile }) {
  const done = profile.goals.filter((g) => g.status === "done").length;
  return (
    <section aria-label="目标" className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <span className="plate">
          目标 · {done}/{profile.goals.length}
        </span>
      </div>
      <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {profile.goals.map((g) => {
          const { icon: Icon, tone } = STATES[g.status];
          return (
            <li key={g.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm">
              <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone)} />
              <span
                className={cn(
                  "min-w-0 flex-1 leading-relaxed",
                  g.status === "open" ? "text-foreground/90" : "text-muted-foreground line-through",
                )}
              >
                <span className="coord mr-1 text-[11px] text-text-tertiary">{g.id}</span>
                {g.text}
              </span>
            </li>
          );
        })}
        {profile.goals.length === 0 && <li className="px-2 py-3 text-xs text-text-tertiary">（立项时未填目标）</li>}
      </ul>
      {/* 图例：把三个状态一次说清，省得每次都要猜 */}
      {profile.goals.length > 0 && (
        <div className="shrink-0 border-t border-border px-4 py-2.5 text-[11px] leading-relaxed text-text-tertiary">
          <span className="mr-2">☐ 待办</span>
          <span className="mr-2">☑ 已完成</span>
          <span>☒ 已放弃（撤销的目标，不计入未完成）</span>
        </div>
      )}
    </section>
  );
}
