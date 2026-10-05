"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Trash2 } from "lucide-react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { clientDb } from "@/lib/firebase";
import { useGroups } from "@/lib/groups-context";
import { messageAuthorName } from "@/lib/messages";
import { hhmmss, relTime } from "@/lib/time";
import type { Evidence, GoalPrompt, Group, Member, Message, Presence } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuthedFetch } from "@/lib/use-authed-fetch";
import { useUser } from "@/lib/use-user";

import { GoalsPanel } from "./goals";
import { MessageOutline } from "./outline";
import { DetailSheet, type DetailPanel } from "./panels";

interface Detail {
  group: Group;
  members: Member[];
  presence: Presence[];
  goalPrompts: GoalPrompt[];
  canDelete: boolean;
}

/** 顶栏的三个入口，顺序即 Jackson 定的顺序（261005）。 */
const ENTRIES: Array<{ key: DetailPanel; label: string }> = [
  { key: "description", label: "背景" },
  { key: "goalPrompts", label: "Goal Prompt" },
  { key: "members", label: "成员" },
];

/** 路由壳：给视图挂 key，换群时整块重挂载——详情、消息、浮层状态自然归零。 */
export default function GroupPage() {
  const { id } = useParams<{ id: string }>();
  return <GroupView key={id} id={id} />;
}

function GroupView({ id }: { id: string }) {
  const { user, loading, idToken } = useUser();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<DetailPanel | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  /** 目录里高亮到哪一条：由滚动位置驱动，点目录也会立刻置上 */
  const [activeSeq, setActiveSeq] = useState<number | null>(null);
  // 消息区滚动落底：首次进入要停在最新消息处
  const listRef = useRef<HTMLElement | null>(null);
  const landedRef = useRef(false);

  const authedFetch = useAuthedFetch();
  /** 归档状态一变，侧栏（GroupsProvider）要立刻跟着分组——不能等下一次跳转 */
  const refreshGroups = useGroups().refresh;

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

  /**
   * 滚动定位：进群默认停在最新消息处；此后只有用户本就贴着底部时才跟随新消息，
   * 免得他正翻历史记录被一条新消息拽走。
   * 依赖里带 detail 是因为消息（Firestore 实时订阅）常常比群详情先到，
   * 那会儿 `!detail` 整页还在转圈、滚动容器没挂上，只盯着 messages 会永远错过落底。
   */
  useEffect(() => {
    const el = listRef.current;
    if (!el || !detail || messages.length === 0) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (!landedRef.current || nearBottom) {
      el.scrollTop = el.scrollHeight;
      landedRef.current = true;
    }
  }, [messages, detail]);

  /**
   * 目录高亮跟随滚动：取最后一条已经越过容器顶端（留一点余量）的消息。
   * 用 rAF 收口——滚动事件比帧还密，逐次全量量一遍 DOM 是白烧。
   */
  const rafRef = useRef<number | null>(null);
  const syncActiveOnScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const container = listRef.current;
      if (!container) return;
      const top = container.getBoundingClientRect().top;
      let current: number | null = null;
      for (const el of container.querySelectorAll<HTMLElement>("[data-seq]")) {
        if (el.getBoundingClientRect().top - top <= 32) current = Number(el.dataset.seq);
        else break;
      }
      setActiveSeq((prev) => (prev === current ? prev : current));
    });
  }, []);
  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  /** 点目录：把那条消息滚到视野顶部，并把高亮立刻置过去（不等滚动事件回填）。 */
  function jumpToMessage(seq: number) {
    setActiveSeq(seq);
    listRef.current?.querySelector<HTMLElement>(`[data-seq="${seq}"]`)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  /** 加成员：成功后刷新详情；失败直接抛给调用方（成员面板）展示。 */
  async function addMember(kind: "human" | "agent", mid: string) {
    await authedFetch(`/api/groups/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ kind, id: mid }),
    });
    setDetail(await authedFetch(`/api/groups/${id}`));
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

  /** 收工归档：把群推向终态（消息流冻结只读），因此是删除的**前置**。 */
  async function archiveGroup() {
    setArchiving(true);
    try {
      await authedFetch(`/api/groups/${id}/close`, { method: "POST" });
      setDetail(await authedFetch(`/api/groups/${id}`));
      await refreshGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "归档失败");
    } finally {
      setArchiving(false);
    }
  }

  /** 取消归档：close 的逆操作，把群拉回进行中并解冻消息流（误归档的补救）。 */
  async function reopenGroup() {
    setArchiving(true);
    try {
      await authedFetch(`/api/groups/${id}/reopen`, { method: "POST" });
      setDetail(await authedFetch(`/api/groups/${id}`));
      await refreshGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "取消归档失败");
    } finally {
      setArchiving(false);
    }
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

  const nameOfAgent = useMemo(
    () => (agentId: string) => detail?.members.find((m) => m.id === agentId)?.name ?? agentId.slice(0, 8),
    [detail],
  );
  // 「全部复制」的纯文本形态：按 agent 分节，粘到新会话即可直接上岗
  const allGoalPromptsText = useMemo(
    () => (detail?.goalPrompts ?? []).map((gp) => `【${nameOfAgent(gp.agentId)}】\n${gp.content}`).join("\n\n"),
    [detail, nameOfAgent],
  );

  if (error) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <p className="text-sm text-destructive">{error}</p>
          <Button asChild variant="ghost" size="sm" className="mt-6">
            <Link href="/"><ArrowLeft /> 返回</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }

  const { group, members, presence, goalPrompts, canDelete } = detail;
  const archived = group.status === "archived";
  const lastAt = messages.length > 0 ? messages[messages.length - 1].createdAt : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 任务简报条：状态 + 有多少消息 + 最新到什么时间；群级文书收进右侧三个入口 */}
      <header className="flex min-h-(--app-header-height) shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2.5 lg:px-6">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            archived ? "bg-border" : "bg-presence-online live-dot",
          )}
        />
        <h1 className={cn("text-lg font-semibold tracking-tight", archived ? "text-muted-foreground" : "text-foreground")}>
          {group.name}
        </h1>
        <span className="plate">
          {archived ? "已归档" : "进行中"} · {group.seq} 条消息
          {lastAt ? ` · 最新 ${relTime(lastAt)}` : ""}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          {ENTRIES.map((entry) => (
            <Button key={entry.key} variant="ghost" size="sm" onClick={() => setPanel(entry.key)}>
              {entry.label}
              {entry.key === "goalPrompts" && goalPrompts.length > 0 && (
                <span className="coord text-text-tertiary">{goalPrompts.length}</span>
              )}
            </Button>
          ))}
          <Button variant="ghost" size="icon-sm" onClick={downloadExport} title="导出 Markdown" aria-label="导出 Markdown">
            <Download />
          </Button>
          {/* 先归档再删除：没收工的群只给归档，归档之后才谈得上删（Jackson 裁定 261005） */}
          {!archived && (
            <Button variant="ghost" size="sm" onClick={archiveGroup} disabled={archiving}>
              {archiving ? "归档中…" : "归档"}
            </Button>
          )}
          {/* 归档可逆：误归档时，任何能归档的成员都能把群拉回来 */}
          {archived && (
            <Button variant="ghost" size="sm" onClick={reopenGroup} disabled={archiving}>
              {archiving ? "处理中…" : "取消归档"}
            </Button>
          )}
          {archived &&
            canDelete &&
            (confirmDelete ? (
              <>
                <Button variant="destructive" size="sm" onClick={removeGroup} disabled={deleting}>
                  {deleting ? "删除中…" : "确认删除"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                  取消
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="icon-sm" onClick={() => setConfirmDelete(true)} title="删除群" aria-label="删除群">
                <Trash2 />
              </Button>
            ))}
        </div>
      </header>

      {/* 消息区：自管滚动，各断点都是它 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[13rem_minmax(0,1fr)_16rem]">
        {/* 左栏：目录（窄屏收起，靠中栏顺序阅读） */}
        <aside className="hidden min-h-0 border-r border-border lg:block">
          <MessageOutline messages={messages} members={members} activeSeq={activeSeq} onJump={jumpToMessage} />
        </aside>

        <section ref={listRef} onScroll={syncActiveOnScroll} className="min-h-0 flex-1 overflow-y-auto">
          <ul className="mx-auto max-w-3xl space-y-1 px-6 py-5 lg:px-8">
            {messages.map((m) =>
              m.type === "system" ? (
                <li key={m.id} data-seq={m.seq} className="flex items-baseline gap-4 py-2.5 text-[13px] text-muted-foreground">
                  <span className="coord w-14 shrink-0 text-right text-[11px] text-text-tertiary">#{String(m.seq).padStart(3, "0")}</span>
                  <span className="border-l-2 border-dashed border-border pl-4">{m.body}</span>
                </li>
              ) : (
                <li key={m.id} data-seq={m.seq} className="flex gap-4 rounded-lg py-3 transition-colors hover:bg-row-hover">
                  <span className="coord w-14 shrink-0 pt-0.5 text-right text-[11px] text-muted-foreground">
                    #{String(m.seq).padStart(3, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
                      <span className="text-sm font-medium text-foreground">{messageAuthorName(m.from, members)}</span>
                      {m.to !== "all" && (
                        <span className="coord text-[11px] text-muted-foreground">→ {m.to.slice(0, 8)}</span>
                      )}
                      {m.refs.length > 0 && (
                        <span className="coord text-[11px] font-medium text-notice">↩#{m.refs.join(" #")}</span>
                      )}
                      <span className="coord ml-auto text-[11px] text-text-tertiary">{hhmmss(m.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">{m.body}</p>
                    {m.evidence.length > 0 && <EvidenceList evidence={m.evidence} />}
                  </div>
                </li>
              ),
            )}
            {messages.length === 0 && (
              <li className="py-12 text-center text-sm text-muted-foreground">
                还没有消息。让 agent 说第一句：<code className="coord text-xs">wings send &ldquo;…&rdquo;</code>
              </li>
            )}
          </ul>
        </section>

        {/* 右栏：只放目标 */}
        <aside className="hidden min-h-0 border-l border-border lg:block">
          <GoalsPanel profile={group.profile} />
        </aside>
      </div>

      <DetailSheet
        panel={panel}
        onClose={() => setPanel(null)}
        group={group}
        members={members}
        presence={presence}
        goalPrompts={goalPrompts}
        nameOfAgent={nameOfAgent}
        allGoalPromptsText={allGoalPromptsText}
        onAddMember={addMember}
      />
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
            className="coord text-muted-foreground transition-colors hover:text-notice"
          >
            📎 {e.name}
          </button>
          {open === e.name && e.content && (
            <pre className="mt-1.5 max-h-60 overflow-auto rounded-lg border border-border bg-card p-3 text-xs text-foreground/80">
              {e.content}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
