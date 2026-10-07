"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { convMeta, previewText } from "@/lib/convUtil";
import { formatListTime } from "@/lib/format";
import Avatar from "./Avatar";
import StatusTicks from "./StatusTicks";
import {
  ComposeIcon,
  MuteIcon,
  SearchIcon,
} from "./Icons";
import type { ModalKind } from "./ChatApp";

export default function Sidebar({
  openModal,
}: {
  openModal: (m: ModalKind) => void;
}) {
  const { me, conversations, activeId, selectConversation } = useApp();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!me) return [];
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const meta = convMeta(c, me.id);
      const inTitle = meta.title.toLowerCase().includes(q);
      const inPreview = (c.last_message?.content || "")
        .toLowerCase()
        .includes(q);
      return inTitle || inPreview;
    });
  }, [conversations, query, me]);

  if (!me) return null;

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <button
          onClick={() => openModal("settings")}
          title="Profile & settings"
          style={{ borderRadius: "50%" }}
        >
          <Avatar
            name={me.display_name}
            color={me.avatar_color}
            url={me.avatar_url}
            size={38}
          />
        </button>
        <div className="search-wrap">
          <SearchIcon />
          <input
            className="search-input"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          className="icon-btn"
          title="New chat"
          onClick={() => openModal("new-chat")}
        >
          <ComposeIcon />
        </button>
      </div>

      <div className="conv-list">
        {filtered.length === 0 && (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--text-secondary)",
            }}
          >
            {query ? "No results found" : "No conversations yet"}
          </div>
        )}
        {filtered.map((c) => {
          const meta = convMeta(c, me.id);
          const unread = c.unread_count > 0;
          const lastFromMe = c.last_message?.sender_id === me.id;
          return (
            <div
              key={c.id}
              className={`conv-item ${activeId === c.id ? "active" : ""}`}
              onClick={() => selectConversation(c.id)}
            >
              <Avatar
                name={meta.title}
                color={meta.color}
                url={meta.url}
                size={48}
                showPresence={!meta.isGroup}
                online={meta.online}
              />
              <div className="conv-body">
                <div className="conv-top">
                  <span className="conv-name">{meta.title}</span>
                  {c.last_message && (
                    <span className={`conv-time ${unread ? "unread" : ""}`}>
                      {formatListTime(c.last_message.created_at)}
                    </span>
                  )}
                </div>
                <div className="conv-bottom">
                  <span className={`conv-preview ${unread ? "unread" : ""}`}>
                    {lastFromMe &&
                      c.last_message &&
                      c.last_message.type !== "system" &&
                      !c.last_message.deleted && (
                        <StatusTicks status={c.last_message.status} small />
                      )}
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {previewText(c.last_message, me.id)}
                    </span>
                  </span>
                  {unread && (
                    <span className="unread-badge">{c.unread_count}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
