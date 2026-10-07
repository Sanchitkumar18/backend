"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { convMeta } from "@/lib/convUtil";
import { formatLastSeen } from "@/lib/format";
import type { Message } from "@/lib/types";
import Avatar from "./Avatar";
import MessageList from "./MessageList";
import Composer from "./Composer";
import {
  BackIcon,
  InfoIcon,
  PhoneIcon,
  SignalLogo,
  VideoIcon,
} from "./Icons";

export default function ChatView({
  onBack,
  onOpenInfo,
}: {
  onBack: () => void;
  onOpenInfo: () => void;
}) {
  const { me, conversations, activeId, typing } = useApp();
  const [replyTo, setReplyTo] = useState<Message | null>(null);

  const conv = conversations.find((c) => c.id === activeId) || null;

  useEffect(() => {
    setReplyTo(null);
  }, [activeId]);

  if (!me) return null;

  if (!conv) {
    return (
      <div className="chat-empty">
        <div className="ring">
          <SignalLogo size={56} />
        </div>
        <h2 style={{ color: "var(--text)" }}>Signal</h2>
        <p style={{ maxWidth: 360 }}>
          Select a conversation to start messaging. Your messages are end-to-end
          encrypted.
        </p>
      </div>
    );
  }

  const meta = convMeta(conv, me.id);
  const typers = (typing[conv.id] || []).filter((t) => t.userId !== me.id);

  let status: React.ReactNode = null;
  if (typers.length > 0) {
    status = (
      <span className="status typing">
        {conv.type === "group"
          ? `${typers.map((t) => t.name.split(" ")[0]).join(", ")} ${
              typers.length > 1 ? "are" : "is"
            } typing…`
          : "typing…"}
      </span>
    );
  } else if (conv.type === "group") {
    status = <span className="status">{meta.subtitle}</span>;
  } else {
    const other = conv.other_user;
    status = (
      <span className="status">
        {other?.is_online
          ? "Online"
          : other
          ? formatLastSeen(other.last_seen)
          : ""}
      </span>
    );
  }

  const comingSoon = (label: string) =>
    alert(`${label} calls are coming soon.`);

  return (
    <>
      <div className="chat-header">
        <button className="icon-btn back-btn" onClick={onBack}>
          <BackIcon />
        </button>
        <Avatar
          name={meta.title}
          color={meta.color}
          url={meta.url}
          size={40}
          showPresence={!meta.isGroup}
          online={meta.online}
        />
        <div className="title" onClick={onOpenInfo}>
          <h2>{meta.title}</h2>
          {status}
        </div>
        <div className="header-actions">
          <button
            className="icon-btn"
            title="Voice call"
            onClick={() => comingSoon("Voice")}
          >
            <PhoneIcon />
          </button>
          <button
            className="icon-btn"
            title="Video call"
            onClick={() => comingSoon("Video")}
          >
            <VideoIcon />
          </button>
          <button className="icon-btn" title="Conversation info" onClick={onOpenInfo}>
            <InfoIcon />
          </button>
        </div>
      </div>

      <MessageList conv={conv} onReply={setReplyTo} />

      <Composer
        conv={conv}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
      />
    </>
  );
}
