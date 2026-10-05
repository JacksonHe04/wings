"use client";

/**
 * 首页：群 · 任务的落地页。
 * 建群表单收进右上角「+」拉出的抽屉，不再占着正文；桌面端的群导航在侧栏（shell），
 * 移动端侧栏不可见，所以群列表在本页正文里再列一份。
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/use-user";
import { Drawer } from "./drawer";
import { Spinner } from "./spinner";
import type { GroupSummary } from "./shell";

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
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", goals: "" });
  const [creating, setCreating] = useState(false);
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
      .catch((e: Error) => setError(e.message))
      .finally(() => setGroupsLoading(false));
  }, [user, authedFetch]);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
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
      setCreating(false);
    }
  }

  if (loading || !user) {
    return <div className="h-full" />;
  }

  const active = groups.filter((g) => g.status !== "archived");
  const archived = groups.filter((g) => g.status === "archived");

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 顶栏：新建任务收在右上角「+」里 */}
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-line px-6 lg:px-10">
        <span className="plate">群 · 任务</span>
        <span className="plate">{groupsLoading ? "…" : `${active.length} 进行中`}</span>
        <button
          onClick={() => setShowNew(true)}
          title="新建任务"
          aria-label="新建任务"
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-panel text-lg leading-none text-dim transition-colors hover:border-dim hover:text-paper"
        >
          +
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8 lg:px-10">
          {error && (
            <p className="mb-6 rounded-md border border-danger/40 px-3 py-2 text-sm text-danger">{error}</p>
          )}

          {/* 移动端：侧栏不可见，群列表在这里 */}
          <section className="mb-10 lg:hidden">
            <ul className="divide-y divide-line">
              {groupsLoading && (
                <li className="py-6">
                  <Spinner label="加载群列表…" />
                </li>
              )}
              {!groupsLoading &&
                active.map((g) => (
                  <li key={g.id}>
                    <Link href={`/groups/${g.id}`} className="flex items-center gap-3 py-3.5">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
                      <span className="min-w-0 flex-1 truncate text-[15px] text-paper">{g.name}</span>
                      <span className="coord text-xs text-dim">SEQ {String(g.seq).padStart(3, "0")}</span>
                    </Link>
                  </li>
                ))}
              {!groupsLoading && active.length === 0 && (
                <li className="py-6 text-sm text-dim">还没有进行中的群</li>
              )}
            </ul>
          </section>

          {/* 已归档 */}
          {archived.length > 0 && (
            <section className="mb-10">
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

          {!groupsLoading && groups.length === 0 && (
            <p className="text-sm leading-relaxed text-dim">
              还没有群。点右上角 <span className="coord">+</span> 建一个任务——一个群 = 一次联调，有始有终。
            </p>
          )}
        </div>
      </div>

      <Drawer open={showNew} onClose={() => setShowNew(false)} title="新建任务">
        <form onSubmit={createGroup} className="space-y-3">
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
            rows={3}
            className="field"
          />
          <textarea
            value={form.goals}
            onChange={(e) => setForm({ ...form, goals: e.target.value })}
            placeholder={"目标，一行一条（自动编号 g1、g2…）"}
            rows={4}
            className="field coord text-[13px]"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <button disabled={creating} className="btn-primary w-full">
            {creating ? "立项中…" : "立项"}
          </button>
        </form>
      </Drawer>
    </div>
  );
}
