import type { Member, Message } from "./types";

/** 消息作者的显示名：system 归"系统"，成员名优先，查不到就退回落 uuid 前缀。 */
export function messageAuthorName(from: Message["from"], members: Member[]): string {
  if (from.kind === "system") return "系统";
  const member = members.find((m) => m.id === from.id);
  return member ? member.name : `${from.kind}:${from.id.slice(0, 8)}`;
}

/** 目录与消息流认同一批消息：system 不进目录（它量大且无主），其余照旧。 */
export function isOutlineItem(message: Message): boolean {
  return message.type !== "system";
}
