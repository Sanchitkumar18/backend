"use client";

import { useEffect, useRef } from "react";
import { useApp } from "@/lib/store";
import { dayKey, formatDayDivider } from "@/lib/format";
import type { Conversation, Message } from "@/lib/types";
import MessageBubble from "./MessageBubble";

export default function MessageList({
  conv,
  onReply,
}: {
  conv: Conversation;
  onReply: (m: Message) => void;
}) {
  const { me, messages, typing } = useApp();
  const list = messages[conv.id];
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const typers = (typing[conv.id] || []).filter((t) => t.userId !== me?.id);

  // Auto-scroll to the newest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [conv.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 240;
    if (nearBottom) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [list?.length, typers.length]);

  if (!me) return null;

  if (!list) {
    return (
      <div className="messages" ref={scrollRef}>
        <div style={{ margin: "auto" }} className="spinner" />
      </div>
    );
  }

  let lastDay = "";
  return (
    <div className="messages" ref={scrollRef}>
      {list.map((msg, i) => {
        const prev = list[i - 1];
        const next = list[i + 1];
        const key = dayKey(msg.created_at);
        const showDay = key !== lastDay;
        lastDay = key;

        const isSystem = msg.type === "system";
        // Group consecutive messages from the same sender.
        const groupedWithPrev =
          !!prev &&
          prev.sender_id === msg.sender_id &&
          prev.type !== "system" &&
          !isSystem &&
          dayKey(prev.created_at) === key;
        const groupedWithNext =
          !!next &&
          next.sender_id === msg.sender_id &&
          next.type !== "system" &&
          dayKey(next.created_at) === key;

        return (
          <div key={msg.id}>
            {showDay && (
              <div className="day-divider">
                <span>{formatDayDivider(msg.created_at)}</span>
              </div>
            )}
            {isSystem ? (
              <div className="system-msg">{msg.content}</div>
            ) : (
              <MessageBubble
                msg={msg}
                conv={conv}
                mine={msg.sender_id === me.id}
                showAvatar={conv.type === "group" && !groupedWithNext}
                showName={conv.type === "group" && !groupedWithPrev}
                onReply={onReply}
              />
            )}
          </div>
        );
      })}

      {typers.length > 0 && (
        <div className="msg-row in">
          <div className="typing-bubble">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
