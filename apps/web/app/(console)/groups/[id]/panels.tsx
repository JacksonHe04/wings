"use client";

/**
 * 顶栏三个入口共用的浮层：背景 / Goal Prompt / 成员。
 *
 * 这三块从前挤在右栏一条长列里，跟消息抢宽度；现在各自成一个按需打开的浮层。
 * 移动端本来就是靠这样一个入口看非消息区内容的，所以两端共用同一份实现——
 * 不再出现「桌面右栏一份、移动浮层再抄一份」。
 *
 * 公告并入「背景」：它和背景同属群级文书，且都不常在改。
 */
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { GoalPrompt, Group, Member, Presence } from "@/lib/types";
import { cn } from "@/lib/utils";

import { CopyButton } from "../../copy-button";

export type DetailPanel = "description" | "goalPrompts" | "members";

const TITLES: Record<DetailPanel, string> = {
  description: "背景",
  goalPrompts: "Goal Prompt",
  members: "成员",
};

export interface DetailSheetProps {
  panel: DetailPanel | null;
  onClose: () => void;
  group: Group;
  members: Member[];
  presence: Presence[];
  goalPrompts: GoalPrompt[];
  /** agentId → 显示名 */
  nameOfAgent: (agentId: string) => string;
  /** 全部 Goal Prompt 拼成的纯文本，供「全部复制」 */
  allGoalPromptsText: string;
  /** 加成员；失败时抛错，由成员面板展示 */
  onAddMember: (kind: "human" | "agent", id: string) => Promise<void>;
}

export function DetailSheet({ panel, onClose, ...rest }: DetailSheetProps) {
  return (
    <Sheet open={panel !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle>{panel ? TITLES[panel] : ""}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {panel === "description" && <DescriptionPanel group={rest.group} />}
          {panel === "goalPrompts" && (
            <GoalPromptsPanel
              goalPrompts={rest.goalPrompts}
              nameOfAgent={rest.nameOfAgent}
              allGoalPromptsText={rest.allGoalPromptsText}
            />
          )}
          {panel === "members" && (
            <MembersPanel
              group={rest.group}
              members={rest.members}
              presence={rest.presence}
              onAddMember={rest.onAddMember}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DescriptionPanel({ group }: { group: Group }) {
  return (
    <div className="space-y-6">
      {group.profile.announcement && (
        <section>
          <h3 className="plate mb-2">公告</h3>
          <p className="rounded-lg border-l-[3px] border-notice bg-notice-bg px-3 py-2.5 text-sm leading-relaxed text-foreground/90">
            {group.profile.announcement}
          </p>
        </section>
      )}
      <section>
        <h3 className="plate mb-2">背景</h3>
        <p className="text-sm leading-relaxed text-foreground/80">
          {group.profile.description || "（立项时未填背景）"}
        </p>
      </section>
    </div>
  );
}

function GoalPromptsPanel({
  goalPrompts,
  nameOfAgent,
  allGoalPromptsText,
}: {
  goalPrompts: GoalPrompt[];
  nameOfAgent: (agentId: string) => string;
  allGoalPromptsText: string;
}) {
  if (goalPrompts.length === 0) {
    return <p className="text-sm text-muted-foreground">还没有 Goal Prompt。让 agent 用 wings goal set 写上自己的那份。</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="plate">{goalPrompts.length} 份</span>
        <CopyButton text={allGoalPromptsText} label="全部复制" />
      </div>
      {goalPrompts.map((gp) => (
        <details key={gp.agentId} open className="rounded-lg border border-border bg-card">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-[13px] text-foreground/80">
            <span className="min-w-0 flex-1 truncate">
              {nameOfAgent(gp.agentId)}
              <span className="coord ml-2 text-[11px] text-text-tertiary">v{gp.version}</span>
            </span>
            <CopyButton text={gp.content} />
          </summary>
          <pre className="whitespace-pre-wrap border-t border-border px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            {gp.content}
          </pre>
        </details>
      ))}
    </div>
  );
}

function MembersPanel({
  group,
  members,
  presence,
  onAddMember,
}: {
  group: Group;
  members: Member[];
  presence: Presence[];
  onAddMember: (kind: "human" | "agent", id: string) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addMsg, setAddMsg] = useState("");

  async function submitAdd(kind: "human" | "agent", id: string) {
    setAddMsg("");
    try {
      await onAddMember(kind, id);
      setAddEmail("");
      setShowAdd(false);
      setAddMsg(kind === "human" ? "已加入，让对方刷新即可看到" : "Agent 已入群");
    } catch (err) {
      setAddMsg(err instanceof Error ? err.message : "加成员失败");
    }
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-1">
        {members.map((m) => {
          const p = presence.find((x) => x.agentId === m.id);
          return (
            <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm">
              <span className="truncate text-foreground/90">
                <span className="mr-1.5 text-muted-foreground">{m.kind === "agent" ? "◆" : "○"}</span>
                {m.name}
              </span>
              {p ? (
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      p.state === "online" ? "bg-presence-online live-dot" : p.state === "sleeping" ? "bg-notice" : "bg-border",
                    )}
                  />
                  {p.activity || p.state}
                </span>
              ) : m.role === "owner" ? (
                <span className="plate shrink-0">owner</span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {group.status !== "archived" && (
        <div>
          {!showAdd ? (
            <Button variant="outline" size="sm" onClick={() => setShowAdd(true)} className="w-full">
              + 添加成员
            </Button>
          ) : (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex gap-2">
                <Input
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="对方的账号邮箱"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => addEmail.trim() && submitAdd("human", addEmail.trim())}
                >
                  加人
                </Button>
              </div>
              {addMsg && <p className="text-xs text-muted-foreground">{addMsg}</p>}
              <p className="text-xs leading-relaxed text-muted-foreground">
                人：填对方账号邮箱（对方需已是 wings 用户）。agent：从我的 agent 里选——
                拉 agent 入群时它的主人会自动跟着进群，这才是常规姿势。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
