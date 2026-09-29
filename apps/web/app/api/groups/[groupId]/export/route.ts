import type { NextRequest } from "next/server";
import { db } from "@/lib/server/admin";
import { requirePrincipal } from "@/lib/server/auth";
import { fail } from "@/lib/server/http";
import { requireMembership } from "@/lib/server/groups";
import type { Group, GoalPrompt, Member, Message, Presence } from "@/lib/types";

/** 导出归档群为 Markdown：背景 + 目标 + Goal Prompt + 全部消息 + 证据。留痕闭环的交付物。 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const principal = await requirePrincipal(req);
    const { groupId } = await params;
    await requireMembership(groupId, principal);

    const [groupSnap, membersSnap, presenceSnap, goalPromptsSnap, messagesSnap] = await Promise.all([
      db.collection("groups").doc(groupId).get(),
      db.collection("groups").doc(groupId).collection("members").get(),
      db.collection("groups").doc(groupId).collection("presence").get(),
      db.collection("groups").doc(groupId).collection("goalPrompts").get(),
      db.collection("groups").doc(groupId).collection("messages").orderBy("seq").get(),
    ]);

    const group = { id: groupSnap.id, ...groupSnap.data() } as Group;
    const members = membersSnap.docs.map((d) => d.data() as Member);
    const presence = presenceSnap.docs.map((d) => d.data() as Presence);
    const goalPrompts = goalPromptsSnap.docs.map((d) => d.data() as GoalPrompt);
    const messages = messagesSnap.docs.map((d) => d.data() as Message);

    const profile = group.profile;
    const lines: string[] = [
      `# ${group.name}`,
      "",
      `> wings 导出 · ${new Date(group.createdAt).toISOString()} 创建 · 状态：${group.status}`,
      "",
      "## 背景",
      "",
      profile.description || "（未填写）",
      "",
      "## 目标",
      "",
      ...(profile.goals.length > 0
        ? profile.goals.map((g) => `- [${g.status === "done" ? "x" : " "}] ${g.id} ${g.text}（${g.status}）`)
        : ["（无）"]),
      "",
      "## 公告",
      "",
      profile.announcement || "（无）",
      "",
      "## 成员",
      "",
      ...members.map((m) => `- ${m.kind}:${m.id}（${m.name}，${m.role}）`),
      "",
      ...(presence.length > 0 ? ["## 最后在场", "", ...presence.map((p) => `- ${p.agentId}：${p.state}（${p.activity}）`), ""] : []),
    ];

    for (const gp of goalPrompts) {
      lines.push(`## Goal Prompt · ${gp.agentId}`, "", `<version:${gp.version} · by ${gp.updatedBy}>`, "", gp.content, "");
    }

    lines.push("---", "", "## 消息流", "");
    for (const msg of messages) {
      const from = `${msg.from.kind}:${msg.from.id}`;
      const to = msg.to === "all" ? "all" : msg.to;
      const refs = msg.refs.length > 0 ? ` ↩ ${msg.refs.join(",")}` : "";
      const evidence = msg.evidence.length > 0
        ? `\n\n  证据：${msg.evidence.map((e) => e.name).join("、")}\n\n${msg.evidence
            .filter((e) => e.content)
            .map((e) => `  \`\`\`\n  ${e.content}\n  \`\`\``)
            .join("\n")}`
        : "";
      lines.push(
        `### #${msg.seq} · ${new Date(msg.createdAt).toISOString()} · 【${from} → ${to}】${refs}${evidence}`,
        "",
        msg.body,
        "",
      );
    }

    const markdown = lines.join("\n");
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="wings-${group.id.slice(0, 8)}.md"`,
      },
    });
  } catch (err) {
    return fail(err);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
