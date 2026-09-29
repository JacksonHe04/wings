import { FieldValue } from "firebase-admin/firestore";
import {
  db,
  GROUPS_COLLECTION,
  membersCol,
  messagesCol,
  presenceCol,
  goalPromptsCol,
} from "./admin";
import { HttpError, sha256 } from "./auth";
import type { Goal, GroupProfile, Message, PresenceState } from "../types";

export interface Principal {
  kind: "human" | "agent";
  id: string;
  ownerId: string;
}

/** compare-and-send 冲突：携带缺失增量与群快照，CLI 层交给 agent 重判。 */
export class ConflictError extends HttpError {
  constructor(public payload: {
    error: "conflict";
    message: string;
    currentSeq: number;
    missed: Array<Record<string, unknown>>;
    profile: GroupProfile;
  }) {
    super(409, "conflict", payload.message);
  }
}

async function getGroupDoc(groupId: string) {
  const snap = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
  if (!snap.exists) throw new HttpError(404, "not-found", "群不存在");
  return snap;
}

/** 成员校验：human 的 member doc id = uid；agent 的 member doc id = agentId。 */
export async function requireMembership(groupId: string, principal: Principal) {
  const member = await membersCol(groupId).doc(principal.id).get();
  if (!member.exists) throw new HttpError(403, "not-member", "你不是该群成员");
  return member;
}

async function memberName(principal: Principal): Promise<string> {
  if (principal.kind === "human") {
    const user = await db.collection("users").doc(principal.id).get();
    return user.get("displayName") ?? "human";
  }
  const agent = await db.collection("agents").doc(principal.id).get();
  return agent.get("name") ?? "agent";
}

/** 在群事务内追加一条消息并推进 seq。所有写入路径的唯一出口。 */
export async function appendMessage(
  groupId: string,
  input: {
    from: Message["from"];
    to?: string | "all";
    refs?: number[];
    type?: Message["type"];
    body: string;
    evidence?: Message["evidence"];
    /** 乐观并发：发送者已读到的 seq。与 group.seq 不一致则抛 409。 */
    basedOn?: number;
    force?: boolean;
  },
): Promise<{ seq: number; messageId: string }> {
  const groupRef = db.collection(GROUPS_COLLECTION).doc(groupId);
  const result = await db.runTransaction(async (tx) => {
    const groupSnap = await tx.get(groupRef);
    if (!groupSnap.exists) throw new HttpError(404, "not-found", "群不存在");
    // 归档冻结只挡普通消息；system 消息（仅服务端内部产生，如归档公告本身）放行
    if (groupSnap.get("status") === "archived" && input.type !== "system") {
      throw new HttpError(409, "archived", "群已归档，消息流冻结");
    }

    const currentSeq = groupSnap.get("seq") ?? 0;
    if (
      !input.force &&
      input.type !== "system" &&
      typeof input.basedOn === "number" &&
      input.basedOn < currentSeq
    ) {
      const missedSnap = await tx.get(
        messagesCol(groupId).orderBy("seq").startAfter(input.basedOn).limit(50),
      );
      const profile = groupSnap.get("profile") as GroupProfile;
      throw new ConflictError({
        error: "conflict",
        message: "自你上次读取后，群里有新消息",
        currentSeq,
        missed: missedSnap.docs.map((d) => ({ id: d.id, ...(d.data() as object) })),
        profile,
      });
    }

    const seq = currentSeq + 1;
    const messageRef = messagesCol(groupId).doc();
    tx.set(messageRef, {
      seq,
      from: input.from,
      to: input.to ?? "all",
      refs: input.refs ?? [],
      type: input.type ?? "message",
      body: input.body,
      evidence: input.evidence ?? [],
      createdAt: Date.now(),
    });
    tx.update(groupRef, { seq });
    return { seq, messageId: messageRef.id };
  });
  return result;
}

/** 群级 system 消息（成员变动、状态跃迁、goal 变更、归档）。 */
export async function appendSystemMessage(
  groupId: string,
  body: string,
  refs: number[] = [],
): Promise<{ seq: number; messageId: string }> {
  return appendMessage(groupId, {
    from: { kind: "system", id: "system" },
    type: "system",
    body,
    refs,
  });
}

/** profile CAS 更新（公告 / 背景 / goals）。返回新 version。 */
export async function updateProfile(
  groupId: string,
  principal: Principal,
  patch: {
    description?: string;
    announcement?: string;
    goalAdd?: string;
    goalDone?: string;
    goalDrop?: string;
  },
  ifVersion: number,
): Promise<GroupProfile> {
  const groupRef = db.collection(GROUPS_COLLECTION).doc(groupId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(groupRef);
    if (!snap.exists) throw new HttpError(404, "not-found", "群不存在");
    if (snap.get("status") === "archived") {
      throw new HttpError(409, "archived", "群已归档");
    }
    const profile = snap.get("profile") as GroupProfile;
    if (profile.announcementVersion !== ifVersion) {
      throw new HttpError(409, "conflict", `profile 已被他人更新（当前 v${profile.announcementVersion}）`);
    }

    const goals: Goal[] = [...profile.goals];
    let sysNote = "";
    if (patch.goalAdd) {
      const id = `g${goals.length + 1}`;
      goals.push({ id, text: patch.goalAdd, status: "open" });
      sysNote = `${principal.kind}:${principal.id} 增加目标 ${id}`;
    }
    const markGoal = (goalId: string, status: Goal["status"]) => {
      const goal = goals.find((g) => g.id === goalId);
      if (!goal) throw new HttpError(404, "not-found", `目标 ${goalId} 不存在`);
      goal.status = status;
      sysNote = `${principal.kind}:${principal.id} 将 ${goalId} 置为 ${status}`;
    };
    if (patch.goalDone) markGoal(patch.goalDone, "done");
    if (patch.goalDrop) markGoal(patch.goalDrop, "dropped");

    const next: GroupProfile = {
      description: patch.description ?? profile.description,
      announcement: patch.announcement ?? profile.announcement,
      announcementVersion: profile.announcementVersion + 1,
      goals,
    };
    tx.update(groupRef, { profile: next });

    const changed: string[] = [];
    if (patch.announcement !== undefined) changed.push("公告");
    if (patch.description !== undefined) changed.push("背景");
    if (patch.goalAdd) changed.push(sysNote);
    else if (patch.goalDone || patch.goalDrop) changed.push(sysNote);
    if (changed.length > 0) {
      const seq = (snap.get("seq") ?? 0) + 1;
      const messageRef = messagesCol(groupId).doc();
      tx.set(messageRef, {
        seq,
        from: { kind: "system", id: "system" },
        to: "all",
        refs: [],
        type: "system",
        body: `群状态更新（v${next.announcementVersion}）：${changed.join("；")}`,
        evidence: [],
        createdAt: Date.now(),
      });
      tx.update(groupRef, { seq });
    }
    return next;
  });
}

/** 心跳：更新 presence；状态跃迁自动产生 system 消息（休眠声明强制的实现）。 */
export async function heartbeat(
  groupId: string,
  agentId: string,
  state: PresenceState,
  activity: string,
): Promise<{ stateChanged: boolean }> {
  const ref = presenceCol(groupId).doc(agentId);
  const prev = await ref.get();
  const prevState = prev.exists ? (prev.get("state") as PresenceState) : "offline";
  const stateChanged = prevState !== state;
  await ref.set(
    { agentId, state, activity, lastHeartbeat: Date.now() },
    { merge: true },
  );
  if (stateChanged) {
    await appendSystemMessage(groupId, `${agentId} 状态跃迁：${prevState} → ${state}${activity ? `（${activity}）` : ""}`);
  }
  return { stateChanged };
}

/** 归档：终态，消息流冻结。 */
export async function closeGroup(groupId: string, principal: Principal): Promise<void> {
  const groupRef = db.collection(GROUPS_COLLECTION).doc(groupId);
  const snap = await groupRef.get();
  if (!snap.exists) throw new HttpError(404, "not-found", "群不存在");
  if (snap.get("status") === "archived") return;
  await groupRef.update({ status: "archived", closedBy: principal.id, closedAt: Date.now() });
  await appendSystemMessage(groupId, `群已由 ${principal.kind}:${principal.id} 收工归档。消息流冻结为只读。`);
}

export { sha256, goalPromptsCol, FieldValue };
