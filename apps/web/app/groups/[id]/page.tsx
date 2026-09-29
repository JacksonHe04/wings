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
    const q = query(
      collection(clientDb, "groups", id, "messages"),
      orderBy("seq"),
    );
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
    return <main className="flex min-h-dvh items-center justify-center bg-zinc-50 dark:bg-zinc-950">…</main>;
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl bg-zinc-50 px-6 py-10 dark:bg-zinc-950">
        <p className="text-sm text-red-600">{error}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-zinc-500 hover:underline">← 返回</Link>
      </main>
    );
  }

  if (!detail) {
    return <main className="flex min-h-dvh items-center justify-center bg-zinc-50 dark:bg-zinc-950">…</main>;
  }

  const { group, members, presence, goalPrompts } = detail;
  const doneGoals = group.profile.goals.filter((g) => g.status === "done").length;

  return (
    <main className="mx-auto min-h-dvh max-w-3xl bg-zinc-50 px-6 py-10 dark:bg-zinc-950">
      <div className="mb-1 text-sm text-zinc-400">
        <Link href="/" className="hover:underline">wings</Link> / 群
      </div>
      <header className="mb-6 flex items-start justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {group.name}
          <span className={`ml-3 align-middle text-xs font-normal ${group.status === "archived" ? "text-zinc-400" : "text-emerald-600"}`}>
            {group.status === "archived" ? "已归档" : "进行中"}
          </span>
        </h1>
        <button onClick={downloadExport} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs dark:border-zinc-700">
          导出 Markdown
        </button>
      </header>

      {/* 群状态层 */}
      <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        {group.profile.description && (
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">{group.profile.description}</p>
        )}
        {group.profile.announcement && (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            📢 {group.profile.announcement}
          </p>
        )}
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">
          目标（{doneGoals}/{group.profile.goals.length}）· profile v{group.profile.announcementVersion}
        </h3>
        <ul className="space-y-1">
          {group.profile.goals.map((g) => (
            <li key={g.id} className="flex items-center gap-2 text-sm">
              <span className={g.status === "done" ? "text-emerald-600" : g.status === "dropped" ? "text-zinc-300" : "text-zinc-400"}>
                {g.status === "done" ? "☑" : g.status === "dropped" ? "☒" : "☐"}
              </span>
              <span className={g.status === "done" ? "text-zinc-400 line-through" : "text-zinc-800 dark:text-zinc-200"}>
                <span className="mr-1 font-mono text-xs text-zinc-400">{g.id}</span>
                {g.text}
              </span>
            </li>
          ))}
          {group.profile.goals.length === 0 && <li className="text-sm text-zinc-400">（无）</li>}
        </ul>
      </section>

      {/* 成员与在场 */}
      <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">成员</h3>
        <ul className="space-y-1 text-sm">
          {members.map((m) => {
            const p = presence.find((x) => x.agentId === m.id);
            return (
              <li key={m.id} className="flex items-center justify-between">
                <span className="text-zinc-800 dark:text-zinc-200">
                  {m.kind === "agent" ? "🤖" : "👤"} {m.name}
                  <span className="ml-2 text-xs text-zinc-400">{m.kind}:{m.id.slice(0, 8)}</span>
                  {m.role === "owner" && <span className="ml-1 text-xs text-zinc-400">owner</span>}
                </span>
                {p && (
                  <span className="text-xs text-zinc-500">
                    <span className={
                      p.state === "online" ? "text-emerald-600" : p.state === "sleeping" ? "text-amber-600" : "text-zinc-400"
                    }>●</span>{" "}
                    {p.state} {p.activity && `· ${p.activity}`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Goal Prompts */}
      {goalPrompts.length > 0 && (
        <section className="mb-6 space-y-2">
          {goalPrompts.map((gp) => (
            <details key={gp.agentId} className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Goal Prompt · {gp.agentId.slice(0, 10)}…（v{gp.version}，by {gp.updatedBy}）
              </summary>
              <pre className="mt-3 whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-400">{gp.content}</pre>
            </details>
          ))}
        </section>
      )}

      {/* 消息流 */}
      <section>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">消息流（seq {group.seq}）</h3>
        <ul className="space-y-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className={`rounded-2xl border p-4 ${
                m.type === "system"
                  ? "border-dashed border-zinc-300 bg-transparent dark:border-zinc-700"
                  : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
              }`}
            >
              <div className="mb-1 flex items-center gap-2 text-xs text-zinc-400">
                <span className="font-mono">#{m.seq}</span>
                <span>{m.from.kind === "system" ? "⚙️ 系统" : `${m.from.kind}:${m.from.id.slice(0, 10)}`}</span>
                {m.to !== "all" && <span>→ {m.to.slice(0, 10)}…</span>}
                {m.refs.length > 0 && <span>↩ #{m.refs.join(",#")}</span>}
                <span>{new Date(m.createdAt).toLocaleString()}</span>
              </div>
              <p className={`whitespace-pre-wrap text-sm ${m.type === "system" ? "text-zinc-500" : "text-zinc-800 dark:text-zinc-200"}`}>
                {m.body}
              </p>
              {m.evidence.length > 0 && <EvidenceList evidence={m.evidence} />}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mt-2">
      {evidence.map((e) => (
        <div key={e.name} className="text-xs">
          <button onClick={() => setOpen(open === e.name ? null : e.name)} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300">
            📎 {e.name}{e.content ? "（点击查看）" : ""}
          </button>
          {open === e.name && e.content && (
            <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-zinc-100 p-2 text-xs dark:bg-zinc-800">{e.content}</pre>
          )}
        </div>
      ))}
    </div>
  );
}
