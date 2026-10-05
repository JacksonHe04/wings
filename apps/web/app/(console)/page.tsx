"use client";

/**
 * 首页：群 · 任务的落地页。
 * 建群表单收进右上角「+」拉出的浮层，不再占着正文；桌面端的群导航在侧栏（shell），
 * 移动端侧栏不可见，所以群列表在本页正文里再列一份。
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useGroups } from "@/lib/groups-context";
import { relTime } from "@/lib/time";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import { useUser } from "@/lib/use-user";

export default function HomePage() {
  const { user, loading } = useUser();
  const router = useRouter();
  // 群列表与侧栏共用一份（GroupsProvider）；建群后本页会跳转，回来时列表已随路由刷新
  const { groups, loading: groupsLoading, error: groupsError } = useGroups();
  const authedFetch = useAuthedFetch();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", goals: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

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
      <header className="flex h-(--app-header-height) shrink-0 items-center gap-3 border-b border-border px-6 lg:px-10">
        <span className="plate">群 · 任务</span>
        <span className="plate">{groupsLoading ? "…" : `${active.length} 进行中`}</span>
        <Button
          variant="outline"
          size="icon"
          className="ml-auto"
          onClick={() => setShowNew(true)}
          title="新建任务"
          aria-label="新建任务"
        >
          <Plus />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8 lg:px-10">
          {(error || groupsError) && (
            <p className="mb-6 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
              {error || groupsError}
            </p>
          )}

          {/* 移动端：侧栏不可见，群列表在这里 */}
          <section className="mb-10 lg:hidden">
            <ul className="divide-y divide-border">
              {groupsLoading && (
                <li className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
                  <Spinner className="size-3.5" />
                  加载群列表…
                </li>
              )}
              {!groupsLoading &&
                active.map((g) => (
                  <li key={g.id}>
                    <Link href={`/groups/${g.id}`} className="flex items-center gap-3 py-3.5">
                      <span className="size-1.5 shrink-0 rounded-full bg-presence-online" />
                      <span className="min-w-0 flex-1 truncate text-[15px] text-foreground">{g.name}</span>
                      <span className="coord text-xs text-muted-foreground">{g.seq} 条</span>
                    </Link>
                  </li>
                ))}
              {!groupsLoading && active.length === 0 && (
                <li className="py-6 text-sm text-muted-foreground">还没有进行中的群</li>
              )}
            </ul>
          </section>

          {/* 已归档 */}
          {archived.length > 0 && (
            <section className="mb-10">
              <div className="mb-2 border-b border-border pb-2">
                <span className="plate">已归档 · {archived.length}</span>
              </div>
              <ul className="divide-y divide-border">
                {archived.map((g) => (
                  <li key={g.id}>
                    <Link href={`/groups/${g.id}`} className="flex items-center gap-3 py-3">
                      <span className="size-1.5 shrink-0 rounded-full bg-border" />
                      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{g.name}</span>
                      <span className="coord text-xs text-text-tertiary">{relTime(g.createdAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!groupsLoading && groups.length === 0 && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              还没有群。点右上角 <span className="coord">+</span> 建一个任务——一个群 = 一次联调，有始有终。
            </p>
          )}
        </div>
      </div>

      <Sheet open={showNew} onOpenChange={(open) => !open && setShowNew(false)}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border">
            <SheetTitle>新建任务</SheetTitle>
          </SheetHeader>
          <form onSubmit={createGroup} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="群名称 —— 这轮联调任务叫什么"
            />
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="背景：这是什么、为什么存在"
              rows={3}
            />
            <Textarea
              value={form.goals}
              onChange={(e) => setForm({ ...form, goals: e.target.value })}
              placeholder={"目标，一行一条（自动编号 g1、g2…）"}
              rows={4}
              className="coord text-[13px]"
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={creating} className="w-full">
              {creating ? "立项中…" : "立项"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
