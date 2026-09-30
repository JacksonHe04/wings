"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/use-user";

interface GroupSummary {
  id: string;
  name: string;
  status: string;
  seq: number;
  createdAt: number;
  profile: { goals: Array<{ id: string; text: string; status: string }>; description: string };
}

interface AgentSummary {
  agentId: string;
  name: string;
}

function relTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return `今天 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function GroupsPage() {
  const { user, loading, idToken } = useUser();
  const router = useRouter();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [newAgentName, setNewAgentName] = useState("");
  const [minted, setMinted] = useState<{ agentId: string; token: string } | null>(null);
  const [copied, setCopied] = useState<"token" | "command" | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", goals: "" });
  const [error, setError] = useState("");

  const authedFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const token = await idToken();
      const res = await fetch(path, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? `${res.status}`);
      return data;
    },
    [idToken],
  );

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    authedFetch("/api/groups")
      .then((d: { groups: GroupSummary[] }) => setGroups(d.groups))
      .catch((e: Error) => setError(e.message));
    authedFetch("/api/agents")
      .then((d: { agents: AgentSummary[] }) => setAgents(d.agents))
      .catch(() => undefined);
  }, [user, authedFetch]);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    try {
      const data = await authedFetch("/api/groups", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
          goals: form.goals.split("\n").map((s) => s.trim()).filter(Boolean),
        }),
      });
      router.push(`/groups/${data.groupId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "建群失败");
    }
  }

  async function createAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!newAgentName.trim()) return;
    try {
      const data = await authedFetch("/api/agents", {
        method: "POST",
        body: JSON.stringify({ name: newAgentName }),
      });
      setMinted(data);
      setCopied(null);
      setNewAgentName("");
      setAgents((prev) => [...prev, { agentId: data.agentId, name: data.name }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建 agent 失败");
    }
  }

  async function revokeAgent(agentId: string) {
    try {
      await authedFetch(`/api/agents/${agentId}`, { method: "DELETE" });
      setAgents((prev) => prev.filter((a) => a.agentId !== agentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "撤销失败");
    }
  }

  if (loading || !user) {
    return <main className="flex min-h-dvh items-center justify-center" />;
  }

  const active = groups.filter((g) => g.status !== "archived");
  const archived = groups.filter((g) => g.status === "archived");

  return (
    <main className="mx-auto min-h-dvh max-w-4xl px-6 pb-24 pt-10 lg:px-10">
      <header className="mb-12 flex items-baseline justify-between">
        <h1 className="coord text-2xl font-semibold tracking-tight text-paper">wings</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-dim">{user.displayName ?? user.email}</span>
          <button onClick={() => clientSignOut()} className="btn-ghost">退出</button>
        </div>
      </header>

      {error && <p className="mb-6 rounded-md border border-danger/40 px-3 py-2 text-sm text-danger">{error}</p>}

      <section className="mb-14">
        <div className="mb-2 flex items-center justify-between border-b border-line pb-2">
          <span className="plate">群 · 任务</span>
          <button onClick={() => setShowCreate((v) => !v)} className="btn-ghost">
            {showCreate ? "收起" : "+ 建群"}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={createGroup} className="my-5 space-y-3 rounded-xl border border-line bg-panel p-5 shadow-sm">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="群名称 —— 这轮联调任务叫什么"
              className="field"
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="背景：这是什么、为什么存在"
              rows={2}
              className="field"
            />
            <textarea
              value={form.goals}
              onChange={(e) => setForm({ ...form, goals: e.target.value })}
              placeholder={"目标，一行一条（自动编号 g1、g2…）"}
              rows={3}
              className="field coord text-[13px]"
            />
            <button className="btn-primary">立项</button>
          </form>
        )}

        <ul className="divide-y divide-line">
          {active.map((g) => (
            <GroupRow key={g.id} g={g} />
          ))}
        </ul>
        {active.length === 0 && (
          <p className="py-12 text-center text-sm text-dim">
            进行中的群是空的。建一个，或者直接对你的 agent 说一句「把这轮联调管起来」。
          </p>
        )}

        {archived.length > 0 && (
          <details className="mt-6">
            <summary className="plate cursor-pointer select-none">
              已归档 · {archived.length}
            </summary>
            <ul className="mt-2 divide-y divide-line">
              {archived.map((g) => (
                <GroupRow key={g.id} g={g} faded />
              ))}
            </ul>
          </details>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between border-b border-line pb-2">
          <span className="plate">我的 agent</span>
        </div>
        <ul className="divide-y divide-line">
          {agents.map((a) => (
            <li key={a.agentId} className="flex items-center justify-between py-3.5">
              <span className="text-[15px] text-paper">{a.name}</span>
              <span className="flex items-center gap-4">
                <span className="coord hidden text-xs text-dim sm:inline">{a.agentId.slice(0, 10)}…</span>
                <button onClick={() => revokeAgent(a.agentId)} className="text-xs text-dim transition-colors hover:text-danger">
                  撤销
                </button>
              </span>
            </li>
          ))}
          {agents.length === 0 && <li className="py-6 text-sm text-dim">还没有 agent。一个 agent 就是群体里的一双手。</li>}
        </ul>
        <form onSubmit={createAgent} className="mt-4 flex gap-2">
          <input
            value={newAgentName}
            onChange={(e) => setNewAgentName(e.target.value)}
            placeholder="新 agent 名称，如：服务端联调 Agent"
            className="field flex-1"
          />
          <button className="btn-ghost shrink-0">创建</button>
        </form>
        {minted && (
          <div className="mt-4 rounded-xl border border-amber/60 bg-amber-bg p-5">
            <p className="plate" style={{ color: "var(--amber)" }}>Token 只显示这一次</p>
            <code className="coord mt-2 block break-all text-[13px] text-paper">{minted.token}</code>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(minted.token);
                  setCopied("token");
                }}
                className="btn-ghost"
              >
                {copied === "token" ? "已复制 token" : "复制 token"}
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`wings login --token ${minted.token}`);
                  setCopied("command");
                }}
                className="btn-ghost"
              >
                {copied === "command" ? "已复制命令" : "复制登录命令"}
              </button>
              <span className="text-xs text-dim">粘给 agent 即可上岗</span>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function GroupRow({ g, faded = false }: { g: GroupSummary; faded?: boolean }) {
  const done = g.profile.goals.filter((x) => x.status === "done").length;
  return (
    <li>
      <Link href={`/groups/${g.id}`} className="flex items-center gap-4 py-4 transition-colors">
        <span className={`h-2 w-2 shrink-0 rounded-full ${faded ? "bg-line" : "bg-signal live-dot"}`} />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[16px] font-medium ${faded ? "text-dim" : "text-paper"}`}>{g.name}</span>
          {g.profile.description && (
            <span className="mt-0.5 block truncate text-[13px] text-dim">{g.profile.description}</span>
          )}
        </span>
        {g.profile.goals.length > 0 && (
          <span className="coord hidden w-20 shrink-0 text-right text-sm sm:block" title={`${done}/${g.profile.goals.length} 目标完成`}>
            <span className="text-dim">{done}</span>
            <span className="text-dim/50">/{g.profile.goals.length}</span>
          </span>
        )}
        <span className="coord hidden w-20 shrink-0 text-right text-xs text-dim md:block">
          SEQ {String(g.seq).padStart(3, "0")}
        </span>
        <span className="w-24 shrink-0 text-right text-xs text-dim">{relTime(g.createdAt)}</span>
      </Link>
    </li>
  );
}

async function clientSignOut() {
  const { signOut } = await import("firebase/auth");
  const { clientAuth } = await import("@/lib/firebase");
  await signOut(clientAuth);
  location.href = "/login";
}
