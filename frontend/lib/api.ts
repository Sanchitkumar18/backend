// Thin typed fetch wrapper around the FastAPI backend.
import type {
  AuthResponse,
  Conversation,
  Message,
  User,
} from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

const TOKEN_KEY = "signal_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---- Auth
export const api = {
  requestOtp: (body: { phone?: string; username?: string }) =>
    request<{ message: string; is_new_user: boolean; dev_otp: string }>(
      "/auth/request-otp",
      { method: "POST", body: JSON.stringify(body) }
    ),

  verifyOtp: (body: {
    phone?: string;
    username?: string;
    otp: string;
    display_name?: string;
    avatar_color?: string;
  }) =>
    request<AuthResponse>("/auth/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  me: () => request<User>("/auth/me"),

  logout: () => request<{ message: string }>("/auth/logout", { method: "POST" }),

  updateProfile: (body: Partial<User>) =>
    request<User>("/users/me", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  // ---- Users / contacts
  searchUsers: (q: string) =>
    request<User[]>(`/users/search?q=${encodeURIComponent(q)}`),
  listUsers: () => request<User[]>("/users"),
  listContacts: () => request<User[]>("/contacts"),
  addContact: (body: { phone?: string; username?: string; nickname?: string }) =>
    request<User>("/contacts", { method: "POST", body: JSON.stringify(body) }),

  // ---- Conversations
  listConversations: () => request<Conversation[]>("/conversations"),
  getConversation: (id: number) =>
    request<Conversation>(`/conversations/${id}`),
  createDirect: (user_id: number) =>
    request<Conversation>("/conversations/direct", {
      method: "POST",
      body: JSON.stringify({ user_id }),
    }),
  createGroup: (body: {
    name: string;
    member_ids: number[];
    avatar_color?: string;
  }) =>
    request<Conversation>("/conversations/group", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateGroup: (id: number, body: { name?: string; avatar_color?: string }) =>
    request<Conversation>(`/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  addMembers: (id: number, member_ids: number[]) =>
    request<Conversation>(`/conversations/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ member_ids }),
    }),
  removeMember: (id: number, user_id: number) =>
    request<Conversation>(`/conversations/${id}/members/${user_id}`, {
      method: "DELETE",
    }),

  // ---- Messages
  getMessages: (id: number, before?: number) =>
    request<Message[]>(
      `/conversations/${id}/messages${before ? `?before=${before}` : ""}`
    ),
  sendMessage: (
    id: number,
    body: {
      content: string;
      type?: string;
      reply_to_id?: number | null;
      attachment_url?: string | null;
      attachment_name?: string | null;
      client_id?: string;
    }
  ) =>
    request<Message>(`/conversations/${id}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  editMessage: (id: number, content: string) =>
    request<Message>(`/messages/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    }),
  deleteMessage: (id: number) =>
    request<Message>(`/messages/${id}`, { method: "DELETE" }),
  react: (id: number, emoji: string) =>
    request<Message>(`/messages/${id}/react`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    }),
  markRead: (id: number) =>
    request<{ message: string }>(`/conversations/${id}/read`, {
      method: "POST",
    }),
  markDelivered: (messageId: number) =>
    request<{ message: string }>(`/messages/${messageId}/delivered`, {
      method: "POST",
    }),
};

export async function uploadFile(file: File): Promise<{ url: string; name: string }> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

export function assetUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (path.startsWith("http")) return path;
  return `${API_URL}${path}`;
}
