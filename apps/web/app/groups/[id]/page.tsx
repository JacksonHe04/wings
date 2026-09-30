"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useUser } from "@/lib/use-user";
import { clientDb } from "@/lib/firebase";
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
  const [myAgents, setMyAgents] = useState<Array<{ agentId: string; name: string }>>([]);
  const [pickAgent, setPickAgent] = useState("");
  const [addMsg, setAddMsg] = useState("");

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
    authedFetch("/api/agents")
      .then((d: { agents: Array<{ agentId: string; name: string }> }) => setMyAgents(d.agents))
      .catch(() => undefined);
  }, [user, id, authedFetch]);

  // 消息流实时订阅（直连 Firestore；rules 限定成员可读）
  useEffect(() => {
    if (!user || !id) return;
    const q = query(collection(clientDb, "groups", id, "messages"), orderBy("seq"));
    return onSnapshot(
      q,
      (snap) => setMessages(snap.docs.map((d) => d.data() as Message)),
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
      setPickAgent("");
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

  if (loading || !user) {
    return <main className="flex min-h-dvh items-center justify-center" />;
  }

  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-danger">{error}</p>
        <Link href="/" className="btn-ghost mt-6 inline-block">← 返回</Link>
      </main>
    );
  }

  if (!detail) {
    return <main className="flex min-h-dvh items-center justify-center" />;
  }

  const { group, members, presence, goalPrompts } = detail;
  const doneGoals = group.profile.goals.filter((g) => g.status === "done").length;
  const archived = group.status === "archived";
  const memberAgentIds = new Set(members.filter((m) => m.kind === "agent").map((m) => m.id));

  return (
    <main className="mx-auto min-h-dvh max-w-6xl px-6 pb-24 pt-8 lg:px-10">
      <Link href="/" className="plate transition-colors hover:text-paper">← wings</Link>

      {/* 任务简报条 */}
      <header className="mb-8 mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-line pb-5">
        <span className={`h-2 w-2 shrink-0 self-center rounded-full ${archived ? "bg-line" : "bg-signal live-dot"}`} />
        <h1 className={`text-2xl font-semibold tracking-tight ${archived ? "text-dim" : "text-paper"}`}>
          {group.name}
        </h1>
        <span className="plate">
          {archived ? "已归档" : "进行中"} · SEQ {String(group.seq).padStart(3, "0")} · V{group.profile.announcementVersion}
        </span>
      </header>

      <div className="grid gap-12 lg:grid-cols-[1fr_320px]">
        {/* 消息流 */}
        <section className="order-1 min-w-0">
          <ul className="space-y-1">
            {messages.map((m) =>
              m.type === "system" ? (
                <li key={m.id} className="flex items-baseline gap-4 py-2.5 text-[13px] text-dim">
                  <span className="coord w-14 shrink-0 text-right text-[11px] text-dim/70">#{String(m.seq).padStart(3, "0")}</span>
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
                      <span className="coord ml-auto text-[11px] text-dim/70">{timeStr(m.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-paper/90">{m.body}</p>
                    {m.evidence.length > 0 && <EvidenceList evidence={m.evidence} />}
                  </div>
                </li>
              ),
            )}
          </ul>
          {messages.length === 0 && (
            <p className="py-12 text-center text-sm text-dim">
              还没有消息。让 agent 说第一句：<code className="coord text-xs">wings send "…"</code>
            </p>
          )}
        </section>

        {/* 侧栏：控制面板 */}
        <aside className="order-2 space-y-8 lg:sticky lg:top-8 lg:self-start">
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
                        placeholder="对方的注册邮箱"
                        className="field flex-1"
                      />
                      <button
                        onClick={() => addEmail.trim() && addMember("human", addEmail.trim())}
                        className="btn-ghost shrink-0"
                      >
                        加人
                      </button>
                    </div>
                    {myAgents.filter((a) => !memberAgentIds.has(a.agentId)).length > 0 && (
                      <div className="flex gap-2">
                        <select
                          value={pickAgent}
                          onChange={(e) => setPickAgent(e.target.value)}
                          className="field flex-1"
                        >
                          <option value="">我的 agent…</option>
                          {myAgents
                            .filter((a) => !memberAgentIds.has(a.agentId))
                            .map((a) => (
                              <option key={a.agentId} value={a.agentId}>{a.name}</option>
                            ))}
                        </select>
                        <button
                          onClick={() => pickAgent && addMember("agent", pickAgent)}
                          className="btn-ghost shrink-0"
                        >
                          入群
                        </button>
                      </div>
                    )}
                    {addMsg && <p className="text-xs text-dim">{addMsg}</p>}
                    <p className="text-xs text-dim">
                      人：先让对方在 wings 注册，再加邮箱。agent：从我的 agent 里选。
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          {goalPrompts.length > 0 && (
            <section>
              <h3 className="plate mb-2 border-b border-line pb-2">Goal Prompts</h3>
              <div className="space-y-2">
                {goalPrompts.map((gp) => (
                  <details key={gp.agentId} className="rounded-lg border border-line bg-panel">
                    <summary className="cursor-pointer px-3 py-2.5 text-[13px] text-paper/80">
                      {members.find((m) => m.id === gp.agentId)?.name ?? gp.agentId.slice(0, 8)}
                      <span className="coord ml-2 text-[11px] text-dim">v{gp.version}</span>
                    </summary>
                    <pre className="whitespace-pre-wrap px-3 pb-3 text-xs leading-relaxed text-dim">{gp.content}</pre>
                  </details>
                ))}
              </div>
            </section>
          )}

          <button onClick={downloadExport} className="btn-ghost w-full">导出 Markdown</button>
        </aside>
      </div>
    </main>
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
