"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useUser } from "@/lib/use-user";
import { clientDb } from "@/lib/firebase";
import { CopyButton } from "../../copy-button";
import type { Evidence, Message, Presence } from "@/lib/types";

interface Detail {
  group: {
    id: string;
    name: string;
    status: string;
    seq: number;
    createdAt: number;
    profile: {
      description: string;
      announcement: string;
      announcementVersion: number;
      goals: Array<{ id: string; text: string; status: string }>;
    };
  };
  members: Array<{ id: string; kind: string; name: string; role: string }>;
  presence: Array<Presence>;
  goalPrompts: Array<{ agentId: string; content: string; version: number; updatedBy: string }>;
  canDelete: boolean;
}

function timeStr(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function nameOf(from: Message["from"], members: Detail["members"]): string {
  if (from.kind === "system") return "系统";
  const m = members.find((x) => x.id === from.id);
  const short = from.id.slice(0, 8);
  return m ? m.name : `${from.kind}:${short}`;
}

export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading, idToken } = useUser();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addMsg, setAddMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const authedFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await idToken();
      const res = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? `${res.status}`);
      return data;
    },
    [idToken],
  );

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user || !id) return;
    authedFetch(`/api/groups/${id}`)
      .then((d: Detail) => setDetail(d))
      .catch((e: Error) => setError(e.message));
  }, [user, id, authedFetch]);

  // 消息流实时订阅（直连 Firestore；rules 限定成员可读）
  useEffect(() => {
    if (!user || !id) return;
    const q = query(collection(clientDb, "groups", id, "messages"), orderBy("seq"));
    return onSnapshot(
      // 文档 id 不在 data() 里，得显式补上——否则列表 key 全是 undefined
      q,
      (snap) => setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Message)),
      (err) => setError(err.message),
    );
  }, [user, id]);

  async function addMember(kind: "human" | "agent", mid: string) {
    setAddMsg("");
    try {
      await authedFetch(`/api/groups/${id}/members`, {
        method: "POST",
        body: JSON.stringify({ kind, id: mid }),
      });
      setAddEmail("");
      setShowAdd(false);
      const d: Detail = await authedFetch(`/api/groups/${id}`);
      setDetail(d);
      setAddMsg(kind === "human" ? "已加入，让对方刷新即可看到" : "Agent 已入群");
    } catch (err) {
      setAddMsg(err instanceof Error ? err.message : "加成员失败");
    }
  }

  async function downloadExport() {
    const token = await idToken();
    const res = await fetch(`/api/groups/${id}/export`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `wings-${id.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** 删除群：硬删不可逆，owner-only（按钮按 canDelete 显示），二次确认后才真正调用。 */
  async function removeGroup() {
    setDeleting(true);
    try {
      await authedFetch(`/api/groups/${id}`, { method: "DELETE" });
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  /** 右栏 Goal Prompt 在移动端落在消息流下方，用跳转按钮兜住「找不到」。 */
  function jumpToGoalPrompts() {
    document.getElementById("goal-prompts")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (error) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <p className="text-sm text-danger">{error}</p>
          <Link href="/" className="btn-ghost mt-6 inline-block">← 返回</Link>
        </div>
      </div>
    );
  }

  if (!detail) {
    return <div className="h-full" />;
  }

  const { group, members, presence, goalPrompts, canDelete } = detail;
  const doneGoals = group.profile.goals.filter((g) => g.status === "done").length;
  const archived = group.status === "archived";
  const nameOfAgent = (agentId: string) =>
    members.find((m) => m.id === agentId)?.name ?? agentId.slice(0, 8);
  // 「全部复制」的纯文本形态：按 agent 分节，粘到新会话即可直接上岗
  const allGoalPromptsText = goalPrompts
    .map((gp) => `【${nameOfAgent(gp.agentId)}】\n${gp.content}`)
    .join("\n\n");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 任务简报条 */}
      <header className="flex shrink-0 flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-line px-6 py-4 lg:px-8">
        <Link href="/" className="plate transition-colors hover:text-paper lg:hidden">←</Link>
        <span className={`h-2 w-2 shrink-0 self-center rounded-full ${archived ? "bg-line" : "bg-signal live-dot"}`} />
        <h1 className={`text-xl font-semibold tracking-tight ${archived ? "text-dim" : "text-paper"}`}>
          {group.name}
        </h1>
        <span className="plate">
          {archived ? "已归档" : "进行中"} · SEQ {String(group.seq).padStart(3, "0")} · V{group.profile.announcementVersion}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {goalPrompts.length > 0 && (
            <button onClick={jumpToGoalPrompts} className="btn-ghost">
              Goal Prompt ×{goalPrompts.length}
            </button>
          )}
          <button onClick={downloadExport} className="btn-ghost">导出</button>
          {canDelete &&
            (confirmDelete ? (
              <>
                <button onClick={removeGroup} disabled={deleting} className="btn-danger">
                  {deleting ? "删除中…" : "确认删除"}
                </button>
                <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="btn-ghost">
                  取消
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="btn-danger">删除</button>
            ))}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 max-lg:overflow-y-auto lg:grid-cols-[1fr_320px] lg:overflow-hidden">
        {/* 消息流：桌面端独立滚动 */}
        <section className="min-w-0 lg:overflow-y-auto">
          <ul className="mx-auto max-w-3xl space-y-1 px-6 py-5 lg:px-10">
            {messages.map((m) =>
              m.type === "system" ? (
                <li key={m.id} className="flex items-baseline gap-4 py-2.5 text-[13px] text-dim">
                  <span className="coord w-14 shrink-0 text-right text-[11px] text-faint">#{String(m.seq).padStart(3, "0")}</span>
                  <span className="border-l-2 border-dashed border-line pl-4">{m.body}</span>
                </li>
              ) : (
                <li key={m.id} className="flex gap-4 rounded-lg py-3 transition-colors hover:bg-panel-2">
                  <span className="coord w-14 shrink-0 pt-0.5 text-right text-[11px] text-dim">
                    #{String(m.seq).padStart(3, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
                      <span className="text-sm font-medium text-paper">{nameOf(m.from, members)}</span>
                      {m.to !== "all" && (
                        <span className="coord text-[11px] text-dim">→ {m.to.slice(0, 8)}</span>
                      )}
                      {m.refs.length > 0 && (
                        <span className="coord text-[11px] font-medium text-amber">↩#{m.refs.join(" #")}</span>
                      )}
                      <span className="coord ml-auto text-[11px] text-faint">{timeStr(m.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-paper/90">{m.body}</p>
                    {m.evidence.length > 0 && <EvidenceList evidence={m.evidence} />}
                  </div>
                </li>
              ),
            )}
            {messages.length === 0 && (
              <li className="py-12 text-center text-sm text-dim">
                还没有消息。让 agent 说第一句：<code className="coord text-xs">wings send &ldquo;…&rdquo;</code>
              </li>
            )}
          </ul>
        </section>

        {/* 控制面板：桌面端独立滚动 */}
        <aside className="space-y-8 border-line px-6 py-6 lg:overflow-y-auto lg:border-l lg:px-6">
          {/* Goal Prompt 是 agent 上岗的第一读物，放右栏最前，默认展开并可一键复制 */}
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
                        onClick={() => addEmail.trim() && addMember("human", addEmail.trim())}
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
        </aside>
      </div>
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mt-2">
      {evidence.map((e) => (
        <div key={e.name} className="text-xs">
          <button
            onClick={() => setOpen(open === e.name ? null : e.name)}
            className="coord text-dim transition-colors hover:text-amber"
          >
            📎 {e.name}
          </button>
          {open === e.name && e.content && (
            <pre className="mt-1.5 max-h-60 overflow-auto rounded-lg border border-line bg-panel p-3 text-xs text-paper/80">
              {e.content}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
