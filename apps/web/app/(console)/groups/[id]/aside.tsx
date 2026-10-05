"use client";

/**
 * 群详情：Goal Prompt / 目标 / 公告 / 背景 / 成员·在场。
 * 桌面端落在右栏，移动端收进「详情」全屏浮层——同一份内容两处渲染，
 * 所以抽成一个组件，别在浮层里再抄一遍。加成员的 UI 状态由本组件自己持有。
 */
import { useState } from "react";
import { CopyButton } from "../../copy-button";
import type { GoalPrompt, Group, Member, Presence } from "@/lib/types";

export function GroupAside({
  group,
  members,
  presence,
  goalPrompts,
  nameOfAgent,
  allGoalPromptsText,
  onAddMember,
}: {
  group: Group;
  members: Member[];
  presence: Presence[];
  goalPrompts: GoalPrompt[];
  /** agentId → 显示名 */
  nameOfAgent: (agentId: string) => string;
  /** 全部 Goal Prompt 拼成的纯文本，供「全部复制」 */
  allGoalPromptsText: string;
  /** 加成员；失败时抛错，由本组件展示 */
  onAddMember: (kind: "human" | "agent", id: string) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addMsg, setAddMsg] = useState("");

  const archived = group.status === "archived";
  const doneGoals = group.profile.goals.filter((g) => g.status === "done").length;

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
    <div className="space-y-8">
      {/* Goal Prompt 是 agent 上岗的第一读物，放最前，默认展开并可一键复制 */}
      {goalPrompts.length > 0 && (
        <section id="goal-prompts" className="scroll-mt-4">
          <div className="mb-2 flex items-center justify-between gap-2 border-b border-line pb-2">
            <h3 className="plate">Goal Prompts · {goalPrompts.length}</h3>
            <CopyButton text={allGoalPromptsText} label="全部复制" className="btn-ghost" />
          </div>
          <div className="space-y-2">
            {goalPrompts.map((gp) => (
              <details key={gp.agentId} open className="rounded-lg border border-line bg-panel">
                <summary className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-[13px] text-paper/80">
                  <span className="min-w-0 flex-1 truncate">
                    {nameOfAgent(gp.agentId)}
                    <span className="coord ml-2 text-[11px] text-dim">v{gp.version}</span>
                  </span>
                  <CopyButton text={gp.content} label="复制" />
                </summary>
                <pre className="whitespace-pre-wrap border-t border-line px-3 py-2.5 text-xs leading-relaxed text-dim">
                  {gp.content}
                </pre>
              </details>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="plate mb-2 border-b border-line pb-2">目标 · {doneGoals}/{group.profile.goals.length}</h3>
        <ul className="space-y-2">
          {group.profile.goals.map((g) => (
            <li key={g.id} className="flex items-start gap-2 text-sm">
              <span className={g.status === "done" ? "text-signal" : g.status === "dropped" ? "text-line" : "text-dim"}>
                {g.status === "done" ? "☑" : g.status === "dropped" ? "☒" : "☐"}
              </span>
              <span className={g.status === "done" ? "text-dim line-through" : "text-paper/90"}>
                <span className="coord mr-1 text-[11px] text-dim">{g.id}</span>
                {g.text}
              </span>
            </li>
          ))}
          {group.profile.goals.length === 0 && <li className="text-sm text-dim">（立项时未填目标）</li>}
        </ul>
      </section>

      {group.profile.announcement && (
        <section>
          <h3 className="plate mb-2 border-b border-line pb-2">公告</h3>
          <p className="rounded-lg border-l-[3px] border-amber bg-amber-bg px-3 py-2.5 text-sm text-paper/90">
            {group.profile.announcement}
          </p>
        </section>
      )}

      {group.profile.description && (
        <section>
          <h3 className="plate mb-2 border-b border-line pb-2">背景</h3>
          <p className="text-sm leading-relaxed text-paper/70">{group.profile.description}</p>
        </section>
      )}

      <section>
        <h3 className="plate mb-2 border-b border-line pb-2">成员 · 在场</h3>
        <ul className="space-y-2">
          {members.map((m) => {
            const p = presence.find((x) => x.agentId === m.id);
            return (
              <li key={m.id} className="flex items-center justify-between text-sm">
                <span className="truncate text-paper/90">
                  <span className="mr-1.5 text-dim">{m.kind === "agent" ? "◆" : "○"}</span>
                  {m.name}
                </span>
                {p ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-dim">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        p.state === "online" ? "bg-signal live-dot" : p.state === "sleeping" ? "bg-amber" : "bg-line"
                      }`}
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

        {!archived && (
          <div className="mt-3">
            {!showAdd ? (
              <button onClick={() => setShowAdd(true)} className="btn-ghost w-full">+ 添加成员</button>
            ) : (
              <div className="space-y-2 rounded-lg border border-line bg-panel p-3">
                <div className="flex gap-2">
                  <input
                    value={addEmail}
                    onChange={(e) => setAddEmail(e.target.value)}
                    placeholder="对方的账号邮箱"
                    className="field flex-1"
                  />
                  <button
                    onClick={() => addEmail.trim() && submitAdd("human", addEmail.trim())}
                    className="btn-ghost shrink-0"
                  >
                    加人
                  </button>
                </div>
                {addMsg && <p className="text-xs text-dim">{addMsg}</p>}
                <p className="text-xs leading-relaxed text-dim">
                  人：填对方账号邮箱（对方需已是 wings 用户）。agent：从我的 agent 里选——
                  拉 agent 入群时它的主人会自动跟着进群，这才是常规姿势。
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
