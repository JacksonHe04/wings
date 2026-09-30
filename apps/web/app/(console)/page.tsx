"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/use-user";
import type { GroupSummary } from "./shell";

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

export default function HomePage() {
  const { user, loading, idToken } = useUser();
  const router = useRouter();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [newAgentName, setNewAgentName] = useState("");
  const [minted, setMinted] = useState<{ agentId: string; token: string } | null>(null);
  const [copied, setCopied] = useState<"token" | "command" | null>(null);
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
    return <div className="h-full" />;
  }

  const active = groups.filter((g) => g.status !== "archived");
  const archived = groups.filter((g) => g.status === "archived");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8 lg:px-10">
        {/* 移动端：侧栏不可见，群列表在这里 */}
        <section className="mb-12 lg:hidden">
          <div className="mb-2 flex items-center justify-between border-b border-line pb-2">
            <span className="plate">群 · 任务</span>
            <span className="plate">{active.length} 进行中</span>
          </div>
          <ul className="divide-y divide-line">
            {active.map((g) => (
              <li key={g.id}>
                <Link href={`/groups/${g.id}`} className="flex items-center gap-3 py-3.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
                  <span className="min-w-0 flex-1 truncate text-[15px] text-paper">{g.name}</span>
                  <span className="coord text-xs text-dim">SEQ {String(g.seq).padStart(3, "0")}</span>
                </Link>
              </li>
            ))}
            {active.length === 0 && <li className="py-6 text-sm text-dim">还没有进行中的群</li>}
          </ul>
        </section>

        {error && <p className="mb-6 rounded-md border border-danger/40 px-3 py-2 text-sm text-danger">{error}</p>}

        {/* 建群 */}
        <section className="mb-12">
          <div className="mb-2 flex items-center justify-between border-b border-line pb-2">
            <span className="plate">新建任务</span>
          </div>
          <form onSubmit={createGroup} className="mt-4 space-y-3 rounded-xl border border-line bg-panel p-6 shadow-panel">
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
        </section>

        {/* 我的 agent */}
        <section className="mb-12">
          <div className="mb-2 flex items-center justify-between border-b border-line pb-2">
            <span className="plate">我的 agent</span>
          </div>
          <ul className="divide-y divide-line">
            {agents.map((a) => (
              <li key={a.agentId} className="flex items-center justify-between py-3.5">
                <span className="text-[15px] text-paper">{a.name}</span>
                <span className="flex items-center gap-4">
                  <span className="coord hidden text-xs text-faint sm:inline">{a.agentId.slice(0, 10)}…</span>
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
            <div className="mt-4 rounded-xl border border-amber/50 bg-amber-bg p-5">
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

        {/* 已归档 */}
        {archived.length > 0 && (
          <section className="mb-12">
            <div className="mb-2 border-b border-line pb-2">
              <span className="plate">已归档 · {archived.length}</span>
            </div>
            <ul className="divide-y divide-line">
              {archived.map((g) => (
                <li key={g.id}>
                  <Link href={`/groups/${g.id}`} className="flex items-center gap-3 py-3">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-line" />
                    <span className="min-w-0 flex-1 truncate text-sm text-dim">{g.name}</span>
                    <span className="text-xs text-faint">{relTime(g.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
