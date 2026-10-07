// Shared types mirroring the FastAPI response shapes.

export type ConversationType = "direct" | "group";
export type MemberRole = "admin" | "member";
export type MessageType = "text" | "image" | "system";
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | null;

export interface User {
  id: number;
  phone: string | null;
  username: string | null;
  display_name: string;
  about: string;
  avatar_color: string;
  avatar_url: string | null;
  is_online: boolean;
  last_seen: string;
}

export interface Reaction {
  user_id: number;
  emoji: string;
}

export interface ReplyPreview {
  id: number;
  sender_id: number | null;
  sender_name: string | null;
  content: string;
  type: MessageType;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number | null;
  type: MessageType;
  content: string;
  attachment_url: string | null;
  attachment_name: string | null;
  reply_to_id: number | null;
  edited: boolean;
  deleted: boolean;
  created_at: string;
  reply_to: ReplyPreview | null;
  reactions: Reaction[];
  status: MessageStatus;
  // Client-only: set for optimistic messages awaiting server confirmation.
  client_id?: string;
}

export interface Member {
  user_id: number;
  role: MemberRole;
  is_active: boolean;
  user: User;
}

export interface Conversation {
  id: number;
  type: ConversationType;
  name: string | null;
  avatar_color: string;
  avatar_url: string | null;
  created_by: number | null;
  last_activity: string;
  members: Member[];
  last_message: Message | null;
  unread_count: number;
  other_user: User | null;
}

export interface AuthResponse {
  token: string;
  user: User;
  is_new_user: boolean;
}
