import type { Conversation, Message } from "./types";

export interface ConvMeta {
  title: string;
  color: string;
  url: string | null;
  isGroup: boolean;
  online: boolean;
  subtitle: string; // members count or presence
}

export function convMeta(conv: Conversation, meId: number): ConvMeta {
  if (conv.type === "group") {
    const active = conv.members.filter((m) => m.is_active);
    return {
      title: conv.name || "Group",
      color: conv.avatar_color,
      url: conv.avatar_url,
      isGroup: true,
      online: false,
      subtitle: `${active.length} members`,
    };
  }
  const other =
    conv.other_user ||
    conv.members.find((m) => m.user_id !== meId)?.user;
  return {
    title: other?.display_name || "Unknown",
    color: other?.avatar_color || "#6b7280",
    url: other?.avatar_url ?? null,
    isGroup: false,
    online: other?.is_online ?? false,
    subtitle: other?.is_online ? "Online" : "",
  };
}

export function previewText(msg: Message | null, meId: number): string {
  if (!msg) return "";
  if (msg.type === "system") return msg.content;
  if (msg.deleted) return "This message was deleted";
  const prefix = msg.sender_id === meId ? "You: " : "";
  if (msg.type === "image") return `${prefix}📷 Photo`;
  return prefix + msg.content;
}
