"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useUser } from "@/lib/use-user";
import { clientDb } from "@/lib/firebase";
import { Spinner } from "../../spinner";
import { GroupAside } from "./aside";
import type { Evidence, GoalPrompt, Group, Member, Message, Presence } from "@/lib/types";

interface Detail {
  group: Group;
  members: Member[];
  presence: Presence[];
  goalPrompts: GoalPrompt[];
  canDelete: boolean;
}

function timeStr(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function nameOf(from: Message["from"], members: Member[]): string {
  if (from.kind === "system") return "系统";
  const m = members.find((x) => x.id === from.id);
  const short = from.id.slice(0, 8);
  return m ? m.name : `${from.kind}:${short}`;
}

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
  const [showDetail, setShowDetail] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // 消息区滚动落底：首次进入要停在最新消息处
  const listRef = useRef<HTMLElement | null>(null);
  const landedRef = useRef(false);

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

  /** 加成员：成功后刷新详情；失败直接抛给调用方（GroupAside）展示。 */
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

  /** 桌面端右栏在视口内，直接滚过去；移动端右栏在浮层里，交给「详情」按钮。 */
  function jumpToGoalPrompts() {
    document.getElementById("goal-prompts")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (error) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-16">
          <p className="text-sm text-danger">{error}</p>
          <Link href="/" className="btn-ghost mt-6 inline-block">← 返回</Link>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="加载群…" />
      </div>
    );
  }

  const { group, members, presence, goalPrompts, canDelete } = detail;
  const archived = group.status === "archived";
  const nameOfAgent = (agentId: string) => members.find((m) => m.id === agentId)?.name ?? agentId.slice(0, 8);
  // 「全部复制」的纯文本形态：按 agent 分节，粘到新会话即可直接上岗
  const allGoalPromptsText = goalPrompts.map((gp) => `【${nameOfAgent(gp.agentId)}】\n${gp.content}`).join("\n\n");
  // 桌面端右栏 vs 移动端全屏浮层，两处渲染同一份内容
  const aside = (
    <GroupAside
      group={group}
      members={members}
      presence={presence}
      goalPrompts={goalPrompts}
      nameOfAgent={nameOfAgent}
      allGoalPromptsText={allGoalPromptsText}
      onAddMember={addMember}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 任务简报条 */}
      <header className="flex shrink-0 flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-line px-6 py-4 lg:px-8">
        <Link href="/" className="plate transition-colors hover:text-paper lg:hidden">←</Link>
        <span className={`h-2 w-2 shrink-0 self-center rounded-full ${archived ? "bg-line" : "bg-signal live-dot"}`} />
        <h1 className={`text-xl font-semibold tracking-tight ${archived ? "text-dim" : "text-paper"}`}>
          {group.name}
        </h1>
        <span className="plate">
          {archived ? "已归档" : "进行中"} · SEQ {String(group.seq).padStart(3, "0")} · V{group.profile.announcementVersion}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {goalPrompts.length > 0 && (
            <button onClick={jumpToGoalPrompts} className="btn-ghost max-lg:hidden">
              Goal Prompt ×{goalPrompts.length}
            </button>
          )}
          {/* 移动端：右栏在这里看不见，非消息区内容收进全屏浮层 */}
          <button onClick={() => setShowDetail(true)} className="btn-ghost lg:hidden">详情</button>
          <button onClick={downloadExport} className="btn-ghost">导出</button>
          {canDelete &&
            (confirmDelete ? (
              <>
                <button onClick={removeGroup} disabled={deleting} className="btn-danger">
                  {deleting ? "删除中…" : "确认删除"}
                </button>
                <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="btn-ghost">
                  取消
                </button>
              </>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="btn-danger">删除</button>
            ))}
        </div>
      </header>

      {/* 移动端单列（群详情已收进浮层），桌面端两栏 */}
      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[1fr_320px] lg:overflow-hidden">
        {/* 消息流：自管滚动，各断点都是它 */}
        <section ref={listRef} className="min-w-0 flex-1 overflow-y-auto">
          <ul className="mx-auto max-w-3xl space-y-1 px-6 py-5 lg:px-10">
            {messages.map((m) =>
              m.type === "system" ? (
                <li key={m.id} className="flex items-baseline gap-4 py-2.5 text-[13px] text-dim">
                  <span className="coord w-14 shrink-0 text-right text-[11px] text-faint">#{String(m.seq).padStart(3, "0")}</span>
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
                      <span className="coord ml-auto text-[11px] text-faint">{timeStr(m.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-paper/90">{m.body}</p>
                    {m.evidence.length > 0 && <EvidenceList evidence={m.evidence} />}
                  </div>
                </li>
              ),
            )}
            {messages.length === 0 && (
              <li className="py-12 text-center text-sm text-dim">
                还没有消息。让 agent 说第一句：<code className="coord text-xs">wings send &ldquo;…&rdquo;</code>
              </li>
            )}
          </ul>
        </section>

        {/* 控制面板：桌面端右栏（移动端走下面的全屏浮层） */}
        <aside className="hidden border-line lg:block lg:overflow-y-auto lg:border-l lg:px-6 lg:py-6">
          {aside}
        </aside>
      </div>

      {/* 移动端：非消息区内容（Goal Prompt / 目标 / 公告 / 背景 / 成员）全屏展示 */}
      {showDetail && (
        <div className="fixed inset-0 z-50 flex flex-col bg-canvas lg:hidden">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-6">
            <span className="plate">任务详情</span>
            <button onClick={() => setShowDetail(false)} className="btn-ghost">关闭</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{aside}</div>
        </div>
      )}
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
