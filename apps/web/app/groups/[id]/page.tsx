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

  const authedFetch = useCallback(
    async (path: string) => {
      const token = await idToken();
      const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
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
      q,
      (snap) => setMessages(snap.docs.map((d) => d.data() as Message)),
      (err) => setError(err.message),
    );
  }, [user, id]);

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

  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-6 pb-24 pt-8">
      <Link href="/" className="plate transition-colors hover:text-paper">← wings</Link>

      {/* 任务简报条 */}
      <header className="mb-8 mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line pb-4">
        <span
          className={`h-1.5 w-1.5 shrink-0 self-center rounded-full ${archived ? "bg-line" : "bg-signal live-dot"}`}
        />
        <h1 className={`text-xl font-semibold tracking-tight ${archived ? "text-dim" : "text-paper"}`}>
          {group.name}
        </h1>
        <span className="plate">
          {archived ? "已归档" : "进行中"} · SEQ {String(group.seq).padStart(3, "0")} · V{group.profile.announcementVersion}
        </span>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
        {/* 消息流 */}
        <section className="order-2 lg:order-1">
          <ul className="space-y-1">
            {messages.map((m) =>
              m.type === "system" ? (
                <li key={m.id} className="flex items-baseline gap-3 py-2 text-[13px] text-dim">
                  <span className="coord w-12 shrink-0 text-right text-[11px] text-dim/60">#{String(m.seq).padStart(3, "0")}</span>
                  <span className="border-l border-dashed border-line pl-3">{m.body}</span>
                </li>
              ) : (
                <li key={m.id} className="group flex gap-3 rounded-md py-2.5 transition-colors hover:bg-panel-2/60">
                  <span className="coord w-12 shrink-0 pt-0.5 text-right text-[11px] text-dim">
                    #{String(m.seq).padStart(3, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[13px] font-medium text-paper">{nameOf(m.from, members)}</span>
                      {m.to !== "all" && (
                        <span className="coord text-[11px] text-dim">→ {m.to.slice(0, 8)}</span>
                      )}
                      {m.refs.length > 0 && (
                        <span className="coord text-[11px] text-amber/80">↩#{m.refs.join(" #")}</span>
                      )}
                      <span className="coord ml-auto text-[11px] text-dim/60">{timeStr(m.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-paper/90">{m.body}</p>
                    {m.evidence.length > 0 && <EvidenceList evidence={m.evidence} />}
                  </div>
                </li>
              ),
            )}
          </ul>
          {messages.length === 0 && (
            <p className="py-10 text-center text-sm text-dim">
              还没有消息。让 agent 说第一句：<code className="coord text-xs">wings send "…"</code>
            </p>
          )}
        </section>

        {/* 侧栏：控制面板 */}
        <aside className="order-1 space-y-8 lg:order-2 lg:sticky lg:top-8 lg:self-start">
          <section>
            <h3 className="plate mb-2 border-b border-line pb-1.5">目标 · {doneGoals}/{group.profile.goals.length}</h3>
            <ul className="space-y-1.5">
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
              <h3 className="plate mb-2 border-b border-line pb-1.5">公告</h3>
              <p className="rounded-md border-l-2 border-amber bg-panel px-3 py-2 text-sm text-paper/90">
                {group.profile.announcement}
              </p>
            </section>
          )}

          {group.profile.description && (
            <section>
              <h3 className="plate mb-2 border-b border-line pb-1.5">背景</h3>
              <p className="text-sm leading-relaxed text-paper/70">{group.profile.description}</p>
            </section>
          )}

          <section>
            <h3 className="plate mb-2 border-b border-line pb-1.5">成员 · 在场</h3>
            <ul className="space-y-1.5">
              {members.map((m) => {
                const p = presence.find((x) => x.agentId === m.id);
                return (
                  <li key={m.id} className="flex items-center justify-between text-sm">
                    <span className="text-paper/90">
                      <span className="mr-1.5 text-dim">{m.kind === "agent" ? "◆" : "○"}</span>
                      {m.name}
                    </span>
                    {p ? (
                      <span className="flex items-center gap-1.5 text-xs text-dim">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            p.state === "online" ? "bg-signal live-dot" : p.state === "sleeping" ? "bg-amber" : "bg-line"
                          }`}
                        />
                        {p.activity || p.state}
                      </span>
                    ) : (
                      <span className="text-xs text-dim/50">{m.role === "owner" ? "owner" : ""}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {goalPrompts.length > 0 && (
            <section>
              <h3 className="plate mb-2 border-b border-line pb-1.5">Goal Prompts</h3>
              <div className="space-y-1.5">
                {goalPrompts.map((gp) => (
                  <details key={gp.agentId} className="rounded-md border border-line bg-panel">
                    <summary className="cursor-pointer px-3 py-2 text-[13px] text-paper/80">
                      {members.find((m) => m.id === gp.agentId)?.name ?? gp.agentId.slice(0, 8)}
                      <span className="coord ml-2 text-[11px] text-dim">v{gp.version}</span>
                    </summary>
                    <pre className="whitespace-pre-wrap px-3 pb-3 text-xs leading-relaxed text-dim">{gp.content}</pre>
                  </details>
                ))}
              </div>
            </section>
          )}

          <button onClick={downloadExport} className="btn-ghost w-full">
            导出 Markdown
          </button>
        </aside>
      </div>
    </main>
  );
}

function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mt-1.5">
      {evidence.map((e) => (
        <div key={e.name} className="text-xs">
          <button
            onClick={() => setOpen(open === e.name ? null : e.name)}
            className="coord text-dim transition-colors hover:text-amber"
          >
            📎 {e.name}{e.content ? "" : ""}
          </button>
          {open === e.name && e.content && (
            <pre className="mt-1 max-h-60 overflow-auto rounded-md border border-line bg-panel p-2 text-xs text-paper/80">
              {e.content}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
