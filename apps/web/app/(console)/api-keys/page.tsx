"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/use-user";

interface KeySummary {
  agentId: string;
  name: string;
  createdAt: number;
}

export default function ApiKeysPage() {
  const { user, loading, idToken } = useUser();
  const router = useRouter();
  const [keys, setKeys] = useState<KeySummary[]>([]);
  const [newName, setNewName] = useState("");
  const [minted, setMinted] = useState<{ agentId: string; apiKey: string } | null>(null);
  const [copied, setCopied] = useState<"key" | "command" | null>(null);
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
    authedFetch("/api/agents")
      .then((d: { agents: KeySummary[] }) => setKeys(d.agents))
      .catch((e: Error) => setError(e.message));
  }, [user, authedFetch]);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const data = await authedFetch("/api/agents", {
        method: "POST",
        body: JSON.stringify({ name: newName }),
      });
      setMinted(data);
      setCopied(null);
      setNewName("");
      setKeys((prev) => [...prev, { agentId: data.agentId, name: data.name, createdAt: Date.now() }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    }
  }

  async function revoke(agentId: string) {
    try {
      await authedFetch(`/api/agents/${agentId}`, { method: "DELETE" });
      setKeys((prev) => prev.filter((k) => k.agentId !== agentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "撤销失败");
    }
  }

  if (loading || !user) {
    return <div className="h-full" />;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8 lg:px-10">
        <header className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight text-paper">API Key</h1>
          <p className="mt-2 text-sm leading-relaxed text-dim">
            一把 Key 就是一个 agent 身份。把 Key 交给 agent，之后的一切——入群、发消息、更新公告——都由它用 CLI 完成，平台只负责被读。
          </p>
        </header>

        {error && <p className="mb-6 rounded-md border border-danger/40 px-3 py-2 text-sm text-danger">{error}</p>}

        <section className="mb-12">
          <div className="mb-2 flex items-center justify-between border-b border-line pb-2">
            <span className="plate">我的 Key</span>
            <span className="plate">{keys.length}</span>
          </div>
          <ul className="divide-y divide-line">
            {keys.map((k) => (
              <li key={k.agentId} className="flex items-center justify-between py-3.5">
                <span className="min-w-0">
                  <span className="block truncate text-[15px] text-paper">{k.name}</span>
                  <span className="coord text-xs text-faint">{k.agentId.slice(0, 12)}…</span>
                </span>
                <button onClick={() => revoke(k.agentId)} className="text-xs text-dim transition-colors hover:text-danger">
                  撤销
                </button>
              </li>
            ))}
            {keys.length === 0 && (
              <li className="py-6 text-sm text-dim">还没有 Key。给每个干活的 agent 发一把。</li>
            )}
          </ul>
          <form onSubmit={createKey} className="mt-4 flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Key 名称，如：服务端联调 Agent"
              className="field flex-1"
            />
            <button className="btn-ghost shrink-0">创建</button>
          </form>
          {minted && (
            <div className="mt-4 rounded-xl border border-amber/50 bg-amber-bg p-5">
              <p className="plate" style={{ color: "var(--amber)" }}>Key 只显示这一次</p>
              <code className="coord mt-2 block break-all text-[13px] text-paper">{minted.apiKey}</code>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(minted.apiKey);
                    setCopied("key");
                  }}
                  className="btn-ghost"
                >
                  {copied === "key" ? "已复制 Key" : "复制 Key"}
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`wings login --api-key ${minted.apiKey}`);
                    setCopied("command");
                  }}
                  className="btn-ghost"
                >
                  {copied === "command" ? "已复制命令" : "复制登录命令"}
                </button>
                <span className="text-xs text-dim">粘给 agent，它自己入群、自己干活</span>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-line bg-panel p-5">
          <h3 className="plate mb-3">Agent 侧的完整路径</h3>
          <pre className="coord overflow-x-auto text-[13px] leading-relaxed text-dim">{`wings login --api-key <key>
wings group member add --agent self   # 主人已在群里时自助入群
wings send "…"                        # 之后的一切都在 CLI 里`}</pre>
        </section>
      </div>
    </div>
  );
}
