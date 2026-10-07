"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import { assetUrl } from "@/lib/api";
import { formatTime } from "@/lib/format";
import type { Conversation, Message } from "@/lib/types";
import Avatar from "./Avatar";
import StatusTicks from "./StatusTicks";
import { EditIcon, ReplyIcon, SmileIcon, TrashIcon } from "./Icons";

const QUICK_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export default function MessageBubble({
  msg,
  conv,
  mine,
  showAvatar,
  showName,
  onReply,
}: {
  msg: Message;
  conv: Conversation;
  mine: boolean;
  showAvatar: boolean;
  showName: boolean;
  onReply: (m: Message) => void;
}) {
  const { me, react, deleteMessage, editMessage } = useApp();
  const [showEmoji, setShowEmoji] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);

  const sender = conv.members.find((m) => m.user_id === msg.sender_id)?.user;

  // Aggregate reactions by emoji.
  const reactionMap = new Map<string, number>();
  msg.reactions.forEach((r) =>
    reactionMap.set(r.emoji, (reactionMap.get(r.emoji) || 0) + 1)
  );

  async function submitEdit() {
    const text = draft.trim();
    if (text && text !== msg.content) await editMessage(msg.id, text);
    setEditing(false);
  }

  const actions = (
    <div className="msg-inline-actions">
      <div style={{ position: "relative" }}>
        {showEmoji && (
          <div
            className="emoji-bar"
            style={{ bottom: 40, [mine ? "right" : "left"]: 0 }}
            onMouseLeave={() => setShowEmoji(false)}
          >
            {QUICK_EMOJI.map((e) => (
              <button
                key={e}
                onClick={() => {
                  const mustToggle = msg.reactions.find(
                    (r) => r.user_id === me?.id && r.emoji === e
                  );
                  react(msg.id, mustToggle ? "" : e);
                  setShowEmoji(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        <button
          className="msg-action-btn"
          title="React"
          onClick={() => setShowEmoji((s) => !s)}
        >
          <SmileIcon />
        </button>
      </div>
      <button
        className="msg-action-btn"
        title="Reply"
        onClick={() => onReply(msg)}
      >
        <ReplyIcon />
      </button>
      {mine && (
        <>
          <button
            className="msg-action-btn"
            title="Edit"
            onClick={() => {
              setDraft(msg.content);
              setEditing(true);
            }}
          >
            <EditIcon />
          </button>
          <button
            className="msg-action-btn"
            title="Delete"
            onClick={() => deleteMessage(msg.id)}
          >
            <TrashIcon />
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className={`msg-row ${mine ? "out" : "in"}`}>
      {!mine && conv.type === "group" && (
        <div style={{ width: 30 }} className="msg-avatar">
          {showAvatar && sender && (
            <Avatar
              name={sender.display_name}
              color={sender.avatar_color}
              url={sender.avatar_url}
              size={30}
            />
          )}
        </div>
      )}

      <div className="msg-content-wrap">
        <div className="bubble">
          {showName && !mine && sender && (
            <div
              className="sender-name"
              style={{ color: sender.avatar_color }}
            >
              {sender.display_name}
            </div>
          )}

          {msg.reply_to && (
            <div className="reply-quote">
              <span className="r-name">
                {msg.reply_to.sender_name || "Unknown"}
              </span>
              <span className="r-text">
                {msg.reply_to.type === "image"
                  ? "📷 Photo"
                  : msg.reply_to.content}
              </span>
            </div>
          )}

          {msg.deleted ? (
            <span className="deleted-text">🚫 This message was deleted</span>
          ) : editing ? (
            <div>
              <textarea
                autoFocus
                className="composer-input"
                style={{ width: 240, background: "rgba(0,0,0,0.1)" }}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitEdit();
                  }
                  if (e.key === "Escape") setEditing(false);
                }}
              />
              <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>
                Enter to save · Esc to cancel
              </div>
            </div>
          ) : (
            <>
              {msg.type === "image" && msg.attachment_url && (
                <img
                  className="attachment"
                  src={assetUrl(msg.attachment_url)}
                  alt={msg.attachment_name || "image"}
                />
              )}
              {msg.content && <span>{msg.content}</span>}
            </>
          )}

          {!msg.deleted && !editing && (
            <span className="msg-meta">
              {msg.edited && <span className="msg-edited">edited</span>}
              <span>{formatTime(msg.created_at)}</span>
              {mine && <StatusTicks status={msg.status} />}
            </span>
          )}
        </div>

        {reactionMap.size > 0 && (
          <div className="reactions">
            {Array.from(reactionMap.entries()).map(([emoji, count]) => {
              const byMe = msg.reactions.some(
                (r) => r.user_id === me?.id && r.emoji === emoji
              );
              return (
                <span
                  key={emoji}
                  className="reaction-chip"
                  style={{
                    borderColor: byMe ? "var(--accent)" : undefined,
                    cursor: "pointer",
                  }}
                  onClick={() => react(msg.id, byMe ? "" : emoji)}
                >
                  {emoji}
                  {count > 1 && <span className="count">{count}</span>}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {!msg.deleted && !editing && actions}
    </div>
  );
}
