"use client";

// Central application store: auth, conversations, messages, real-time socket,
// typing, presence and all mutating actions. Consumed via the useApp() hook.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  api,
  clearToken,
  getToken,
  setToken,
  WS_URL,
} from "./api";
import type { Conversation, Message, User } from "./types";

// ----------------------------------------------------------------- state
interface State {
  me: User | null;
  conversations: Conversation[];
  activeId: number | null;
  messages: Record<number, Message[]>;
  typing: Record<number, { userId: number; name: string }[]>;
  online: Record<number, boolean>;
}

type Action =
  | { type: "SET_ME"; me: User | null }
  | { type: "SET_CONVERSATIONS"; conversations: Conversation[] }
  | { type: "UPSERT_CONVERSATION"; conversation: Conversation }
  | { type: "SET_ACTIVE"; id: number | null }
  | { type: "SET_MESSAGES"; convId: number; messages: Message[] }
  | { type: "ADD_MESSAGE"; message: Message; myId: number | null }
  | { type: "REPLACE_OPTIMISTIC"; clientId: string; message: Message }
  | { type: "UPDATE_MESSAGE"; message: Message }
  | { type: "SET_STATUS"; convId: number; id: number; status: Message["status"] }
  | { type: "LOCAL_READ"; convId: number }
  | { type: "SET_TYPING"; convId: number; userId: number; name: string; isTyping: boolean }
  | { type: "PRESENCE"; userId: number; isOnline: boolean }
  | { type: "PRESENCE_INIT"; ids: number[] };

function sortConvs(convs: Conversation[]): Conversation[] {
  return [...convs].sort(
    (a, b) =>
      new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime()
  );
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_ME":
      return { ...state, me: action.me };

    case "SET_CONVERSATIONS":
      return { ...state, conversations: sortConvs(action.conversations) };

    case "UPSERT_CONVERSATION": {
      const rest = state.conversations.filter(
        (c) => c.id !== action.conversation.id
      );
      return {
        ...state,
        conversations: sortConvs([action.conversation, ...rest]),
      };
    }

    case "SET_ACTIVE":
      return { ...state, activeId: action.id };

    case "SET_MESSAGES":
      return {
        ...state,
        messages: { ...state.messages, [action.convId]: action.messages },
      };

    case "ADD_MESSAGE": {
      const { message, myId } = action;
      const list = state.messages[message.conversation_id] || [];
      if (list.some((m) => m.id === message.id)) return state; // de-dupe
      const nextMsgs = {
        ...state.messages,
        [message.conversation_id]: [...list, message],
      };
      const isActive = state.activeId === message.conversation_id;
      const fromMe = message.sender_id === myId;
      const convs = state.conversations.map((c) => {
        if (c.id !== message.conversation_id) return c;
        const bumpUnread = !isActive && !fromMe && message.type !== "system";
        return {
          ...c,
          last_message: message,
          last_activity: message.created_at,
          unread_count: bumpUnread ? c.unread_count + 1 : c.unread_count,
        };
      });
      return { ...state, messages: nextMsgs, conversations: sortConvs(convs) };
    }

    case "REPLACE_OPTIMISTIC": {
      const convId = action.message.conversation_id;
      const list = state.messages[convId] || [];
      // Drop the optimistic placeholder, then append the real message only if
      // the socket echo hasn't already added it (avoids a race duplicate).
      const withoutTmp = list.filter((m) => m.client_id !== action.clientId);
      const exists = withoutTmp.some((m) => m.id === action.message.id);
      const replaced = exists ? withoutTmp : [...withoutTmp, action.message];
      const convs = state.conversations.map((c) =>
        c.id === convId ? { ...c, last_message: action.message } : c
      );
      return {
        ...state,
        messages: { ...state.messages, [convId]: replaced },
        conversations: convs,
      };
    }

    case "UPDATE_MESSAGE": {
      const convId = action.message.conversation_id;
      const list = state.messages[convId] || [];
      const updated = list.map((m) =>
        m.id === action.message.id ? action.message : m
      );
      const convs = state.conversations.map((c) =>
        c.id === convId && c.last_message?.id === action.message.id
          ? { ...c, last_message: action.message }
          : c
      );
      return {
        ...state,
        messages: { ...state.messages, [convId]: updated },
        conversations: convs,
      };
    }

    case "SET_STATUS": {
      const list = state.messages[action.convId] || [];
      const updated = list.map((m) =>
        m.id === action.id ? { ...m, status: action.status } : m
      );
      const convs = state.conversations.map((c) =>
        c.id === action.convId && c.last_message?.id === action.id
          ? { ...c, last_message: { ...c.last_message!, status: action.status } }
          : c
      );
      return {
        ...state,
        messages: { ...state.messages, [action.convId]: updated },
        conversations: convs,
      };
    }

    case "LOCAL_READ":
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === action.convId ? { ...c, unread_count: 0 } : c
        ),
      };

    case "SET_TYPING": {
      const current = state.typing[action.convId] || [];
      let next;
      if (action.isTyping) {
        next = current.some((t) => t.userId === action.userId)
          ? current
          : [...current, { userId: action.userId, name: action.name }];
      } else {
        next = current.filter((t) => t.userId !== action.userId);
      }
      return { ...state, typing: { ...state.typing, [action.convId]: next } };
    }

    case "PRESENCE": {
      const convs = state.conversations.map((c) => ({
        ...c,
        members: c.members.map((m) =>
          m.user_id === action.userId
            ? { ...m, user: { ...m.user, is_online: action.isOnline } }
            : m
        ),
        other_user:
          c.other_user && c.other_user.id === action.userId
            ? { ...c.other_user, is_online: action.isOnline }
            : c.other_user,
      }));
      return {
        ...state,
        online: { ...state.online, [action.userId]: action.isOnline },
        conversations: convs,
      };
    }

    case "PRESENCE_INIT": {
      const online: Record<number, boolean> = {};
      action.ids.forEach((id) => (online[id] = true));
      return { ...state, online };
    }

    default:
      return state;
  }
}

const initialState: State = {
  me: null,
  conversations: [],
  activeId: null,
  messages: {},
  typing: {},
  online: {},
};

// ----------------------------------------------------------------- toasts
export interface Toast {
  id: number;
  title: string;
  body: string;
  color: string;
}

// ----------------------------------------------------------------- context
interface AppContextValue extends State {
  ready: boolean;
  toasts: Toast[];
  theme: "light" | "dark";
  toggleTheme: () => void;
  login: (user: User, token: string) => void;
  logout: () => void;
  refreshMe: () => Promise<void>;
  loadConversations: () => Promise<void>;
  selectConversation: (id: number | null) => Promise<void>;
  sendMessage: (
    convId: number,
    body: { content: string; reply_to_id?: number | null; type?: string; attachment_url?: string | null; attachment_name?: string | null }
  ) => Promise<void>;
  editMessage: (id: number, content: string) => Promise<void>;
  deleteMessage: (id: number) => Promise<void>;
  react: (id: number, emoji: string) => Promise<void>;
  createDirect: (userId: number) => Promise<Conversation>;
  createGroup: (name: string, memberIds: number[], color?: string) => Promise<Conversation>;
  updateGroup: (id: number, body: { name?: string; avatar_color?: string }) => Promise<void>;
  addMembers: (id: number, memberIds: number[]) => Promise<void>;
  removeMember: (id: number, userId: number) => Promise<void>;
  sendTyping: (convId: number, isTyping: boolean) => void;
  dismissToast: (id: number) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const socketRef = useRef<WebSocket | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // ---- theme
  useEffect(() => {
    const saved = (localStorage.getItem("signal_theme") as "light" | "dark") || "light";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);
  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next = t === "light" ? "dark" : "light";
      localStorage.setItem("signal_theme", next);
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  }, []);

  // ---- toasts
  const pushToast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4000);
  }, []);
  const dismissToast = useCallback(
    (id: number) => setToasts((prev) => prev.filter((x) => x.id !== id)),
    []
  );

  // ---- WebSocket
  const connectSocket = useCallback(() => {
    const token = getToken();
    if (!token) return;
    if (socketRef.current) socketRef.current.close();

    const ws = new WebSocket(`${WS_URL}/ws?token=${token}`);
    socketRef.current = ws;

    ws.onmessage = (ev) => {
      const { type, data } = JSON.parse(ev.data);
      const s = stateRef.current;
      const myId = s.me?.id ?? null;

      switch (type) {
        case "message:new": {
          const msg: Message = data;
          dispatch({ type: "ADD_MESSAGE", message: msg, myId });
          // Notify + auto-read when the chat is open and focused.
          if (msg.sender_id !== myId) {
            if (s.activeId === msg.conversation_id && document.hasFocus()) {
              api.markRead(msg.conversation_id).catch(() => {});
              dispatch({ type: "LOCAL_READ", convId: msg.conversation_id });
            } else if (msg.type !== "system") {
              const conv = s.conversations.find((c) => c.id === msg.conversation_id);
              const sender = conv?.members.find((m) => m.user_id === msg.sender_id)?.user;
              pushToast({
                title:
                  conv?.type === "group"
                    ? `${sender?.display_name ?? "Someone"} • ${conv.name}`
                    : sender?.display_name ?? "New message",
                body: msg.type === "image" ? "📷 Photo" : msg.content,
                color: sender?.avatar_color ?? "#3a76f0",
              });
            }
          }
          break;
        }
        case "message:update":
          dispatch({ type: "UPDATE_MESSAGE", message: data });
          break;
        case "message:status":
          dispatch({
            type: "SET_STATUS",
            convId: data.conversation_id,
            id: data.id,
            status: data.status,
          });
          break;
        case "conversation:update":
          dispatch({ type: "UPSERT_CONVERSATION", conversation: data });
          break;
        case "typing":
          dispatch({
            type: "SET_TYPING",
            convId: data.conversation_id,
            userId: data.user_id,
            name: data.display_name,
            isTyping: data.is_typing,
          });
          if (data.is_typing) {
            setTimeout(
              () =>
                dispatch({
                  type: "SET_TYPING",
                  convId: data.conversation_id,
                  userId: data.user_id,
                  name: data.display_name,
                  isTyping: false,
                }),
              5000
            );
          }
          break;
        case "presence":
          dispatch({
            type: "PRESENCE",
            userId: data.user_id,
            isOnline: data.is_online,
          });
          break;
        case "presence:init":
          dispatch({ type: "PRESENCE_INIT", ids: data.online_user_ids });
          break;
      }
    };

    ws.onclose = () => {
      // Reconnect after a short delay if still logged in.
      if (getToken()) setTimeout(connectSocket, 2000);
    };
  }, [pushToast]);

  // ---- bootstrap session from a stored token
  useEffect(() => {
    (async () => {
      const token = getToken();
      if (token) {
        try {
          const user = await api.me();
          dispatch({ type: "SET_ME", me: user });
          const convs = await api.listConversations();
          dispatch({ type: "SET_CONVERSATIONS", conversations: convs });
          connectSocket();
        } catch {
          clearToken();
        }
      }
      setReady(true);
    })();
    return () => socketRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- actions
  const login = useCallback(
    (user: User, token: string) => {
      setToken(token);
      dispatch({ type: "SET_ME", me: user });
      api.listConversations().then((convs) =>
        dispatch({ type: "SET_CONVERSATIONS", conversations: convs })
      );
      connectSocket();
    },
    [connectSocket]
  );

  const logout = useCallback(() => {
    api.logout().catch(() => {});
    socketRef.current?.close();
    clearToken();
    dispatch({ type: "SET_ME", me: null });
    dispatch({ type: "SET_CONVERSATIONS", conversations: [] });
    dispatch({ type: "SET_ACTIVE", id: null });
  }, []);

  const refreshMe = useCallback(async () => {
    const user = await api.me();
    dispatch({ type: "SET_ME", me: user });
  }, []);

  const loadConversations = useCallback(async () => {
    const convs = await api.listConversations();
    dispatch({ type: "SET_CONVERSATIONS", conversations: convs });
  }, []);

  const selectConversation = useCallback(async (id: number | null) => {
    dispatch({ type: "SET_ACTIVE", id });
    if (id == null) return;
    const msgs = await api.getMessages(id);
    dispatch({ type: "SET_MESSAGES", convId: id, messages: msgs });
    await api.markRead(id).catch(() => {});
    dispatch({ type: "LOCAL_READ", convId: id });
  }, []);

  const sendMessage: AppContextValue["sendMessage"] = useCallback(
    async (convId, body) => {
      const myId = stateRef.current.me?.id ?? null;
      const clientId = `tmp-${Date.now()}-${Math.random()}`;
      const optimistic: Message = {
        id: -Date.now(),
        conversation_id: convId,
        sender_id: myId,
        type: (body.type as Message["type"]) || "text",
        content: body.content,
        attachment_url: body.attachment_url ?? null,
        attachment_name: body.attachment_name ?? null,
        reply_to_id: body.reply_to_id ?? null,
        edited: false,
        deleted: false,
        created_at: new Date().toISOString(),
        reply_to: null,
        reactions: [],
        status: "sending",
        client_id: clientId,
      };
      dispatch({ type: "ADD_MESSAGE", message: optimistic, myId });
      try {
        const saved = await api.sendMessage(convId, { ...body, client_id: clientId });
        dispatch({ type: "REPLACE_OPTIMISTIC", clientId, message: saved });
      } catch (e) {
        /* leave optimistic bubble as "sending" on failure */
      }
    },
    []
  );

  const editMessage = useCallback(async (id: number, content: string) => {
    await api.editMessage(id, content);
  }, []);
  const deleteMessage = useCallback(async (id: number) => {
    await api.deleteMessage(id);
  }, []);
  const react = useCallback(async (id: number, emoji: string) => {
    await api.react(id, emoji);
  }, []);

  const createDirect = useCallback(async (userId: number) => {
    const conv = await api.createDirect(userId);
    dispatch({ type: "UPSERT_CONVERSATION", conversation: conv });
    return conv;
  }, []);

  const createGroup = useCallback(
    async (name: string, memberIds: number[], color?: string) => {
      const conv = await api.createGroup({
        name,
        member_ids: memberIds,
        avatar_color: color,
      });
      dispatch({ type: "UPSERT_CONVERSATION", conversation: conv });
      return conv;
    },
    []
  );

  const updateGroup = useCallback(
    async (id: number, body: { name?: string; avatar_color?: string }) => {
      const conv = await api.updateGroup(id, body);
      dispatch({ type: "UPSERT_CONVERSATION", conversation: conv });
    },
    []
  );
  const addMembers = useCallback(async (id: number, memberIds: number[]) => {
    const conv = await api.addMembers(id, memberIds);
    dispatch({ type: "UPSERT_CONVERSATION", conversation: conv });
  }, []);
  const removeMember = useCallback(async (id: number, userId: number) => {
    const conv = await api.removeMember(id, userId);
    dispatch({ type: "UPSERT_CONVERSATION", conversation: conv });
  }, []);

  const sendTyping = useCallback((convId: number, isTyping: boolean) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "typing",
          data: { conversation_id: convId, is_typing: isTyping },
        })
      );
    }
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      ...state,
      ready,
      toasts,
      theme,
      toggleTheme,
      login,
      logout,
      refreshMe,
      loadConversations,
      selectConversation,
      sendMessage,
      editMessage,
      deleteMessage,
      react,
      createDirect,
      createGroup,
      updateGroup,
      addMembers,
      removeMember,
      sendTyping,
      dismissToast,
    }),
    [
      state, ready, toasts, theme, toggleTheme, login, logout, refreshMe,
      loadConversations, selectConversation, sendMessage, editMessage,
      deleteMessage, react, createDirect, createGroup, updateGroup, addMembers,
      removeMember, sendTyping, dismissToast,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
