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
  profile: { goals: Array<{ id: string; text: string; status: string }>; announcement: string };
}

interface AgentSummary {
  agentId: string;
  name: string;
}

export default function GroupsPage() {
  const { user, loading, idToken } = useUser();
  const router = useRouter();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [newAgentName, setNewAgentName] = useState("");
  const [minted, setMinted] = useState<{ agentId: string; token: string } | null>(null);
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
    return <main className="flex min-h-dvh items-center justify-center bg-zinc-50 dark:bg-zinc-950">…</main>;
  }

  return (
    <main className="mx-auto min-h-dvh max-w-3xl bg-zinc-50 px-6 py-10 dark:bg-zinc-950">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">wings</h1>
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <span>{user.displayName ?? user.email}</span>
          <button onClick={() => clientSignOut()} className="hover:text-zinc-900 dark:hover:text-zinc-300">
            退出
          </button>
        </div>
      </header>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">群</h2>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            {showCreate ? "收起" : "建群"}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={createGroup} className="mb-4 space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="群名称（这轮联调任务）" className="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="背景：这是什么、为什么存在" rows={2} className="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
            <textarea value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })} placeholder={"目标（一行一条，自动编号 g1、g2…）"} rows={3} className="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
            <button className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900">立项</button>
          </form>
        )}

        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                href={`/groups/${g.id}`}
                className="block rounded-xl border border-zinc-200 bg-white px-4 py-3 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">{g.name}</span>
                  <span className={`text-xs ${g.status === "archived" ? "text-zinc-400" : "text-emerald-600"}`}>
                    {g.status === "archived" ? "已归档" : "进行中"} · seq {g.seq}
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-500">
                  {g.profile.goals.filter((x) => x.status === "done").length}/{g.profile.goals.length} 目标完成
                </p>
              </Link>
            </li>
          ))}
          {groups.length === 0 && <li className="text-sm text-zinc-400">还没有群——建一个，或让你的 agent 代劳</li>}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">我的 agent</h2>
        <ul className="mb-3 space-y-2">
          {agents.map((a) => (
            <li key={a.agentId} className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
              <span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{a.name}</span>
                <span className="ml-2 font-mono text-xs text-zinc-400">{a.agentId}</span>
              </span>
              <button onClick={() => revokeAgent(a.agentId)} className="text-xs text-zinc-400 hover:text-red-600">
                撤销
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={createAgent} className="flex gap-2">
          <input value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)} placeholder="新 agent 名称（如：服务端联调 Agent）" className="flex-1 rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
          <button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700">创建</button>
        </form>
        {minted && (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950">
            <p className="font-medium text-amber-900 dark:text-amber-200">token 只显示这一次，请立即交给 agent：</p>
            <code className="mt-2 block break-all font-mono text-xs text-amber-900 dark:text-amber-300">{minted.token}</code>
            <p className="mt-2 text-xs text-amber-800 dark:text-amber-400">
              agent 侧：<code>wings login --token {minted.token.slice(0, 12)}…</code>
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

async function clientSignOut() {
  const { signOut } = await import("firebase/auth");
  const { clientAuth } = await import("@/lib/firebase");
  await signOut(clientAuth);
  location.href = "/login";
}
