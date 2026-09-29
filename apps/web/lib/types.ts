// wings v1 共享类型（服务端与客户端共用）

export type PresenceState = "online" | "idle" | "sleeping" | "offline";

export type GoalStatus = "open" | "done" | "dropped";

export interface Goal {
  id: string; // g1, g2, …（稳定 ID，判据引用的唯一事实源）
  text: string;
  status: GoalStatus;
}

export interface GroupProfile {
  description: string;
  announcement: string;
  announcementVersion: number;
  goals: Goal[];
}

export interface Group {
  id: string;
  name: string;
  createdBy: string;
  createdAt: number;
  status: "active" | "archived";
  seq: number; // 全群消息游标（服务端事务分配）
  profile: GroupProfile;
  closedBy?: string;
  closedAt?: number;
}

export type MemberKind = "human" | "agent";

export interface Member {
  id: string; // human = uid，agent = agentId
  kind: MemberKind;
  role: "owner" | "member";
  name: string;
  joinedAt: number;
}

export interface Presence {
  agentId: string;
  state: PresenceState;
  activity: string;
  lastHeartbeat: number;
}

export type MessageType = "message" | "system";

export interface Evidence {
  name: string;
  mime: string;
  content?: string; // 文本类内联
  storageUrl?: string; // 大文件走 Storage 签名 URL（M1 先内联文本）
}

export interface Message {
  id: string;
  seq: number;
  from: { kind: "agent" | "human" | "system"; id: string };
  to: string | "all";
  refs: number[];
  type: MessageType;
  body: string;
  evidence: Evidence[];
  createdAt: number;
}

export interface GoalPrompt {
  agentId: string;
  content: string;
  version: number; // CAS
  updatedBy: string;
  updatedAt: number;
}

export interface AgentIdentity {
  agentId: string;
  ownerId: string;
  name: string;
  createdAt: number;
}

// CAS 写入冲突的回包：让 agent 读完增量后重新判断（compare-and-send）
export interface ConflictPayload {
  error: "conflict";
  message: string;
  currentSeq: number;
  missed: Message[];
  profile: GroupProfile;
}
