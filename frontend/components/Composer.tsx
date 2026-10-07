"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { uploadFile } from "@/lib/api";
import type { Conversation, Message } from "@/lib/types";
import { CloseIcon, PaperclipIcon, SendIcon, SmileIcon } from "./Icons";

const EMOJIS = ["😀","😂","😍","🥳","👍","🙏","❤️","🔥","🎉","😮","😢","😎","🤔","👏","💯","✅"];

export default function Composer({
  conv,
  replyTo,
  onClearReply,
}: {
  conv: Conversation;
  replyTo: Message | null;
  onClearReply: () => void;
}) {
  const { me, sendMessage, sendTyping } = useApp();
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingRef = useRef(false);
  const typingTimeout = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setText("");
    setShowEmoji(false);
  }, [conv.id]);

  // Auto-grow the textarea.
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 140) + "px";
    }
  }, [text]);

  function emitTyping() {
    if (!typingRef.current) {
      typingRef.current = true;
      sendTyping(conv.id, true);
    }
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      typingRef.current = false;
      sendTyping(conv.id, false);
    }, 2500);
  }

  function stopTyping() {
    clearTimeout(typingTimeout.current);
    if (typingRef.current) {
      typingRef.current = false;
      sendTyping(conv.id, false);
    }
  }

  async function handleSend() {
    const content = text.trim();
    if (!content) return;
    stopTyping();
    setText("");
    await sendMessage(conv.id, {
      content,
      reply_to_id: replyTo?.id ?? null,
    });
    onClearReply();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url, name } = await uploadFile(file);
      await sendMessage(conv.id, {
        content: "",
        type: "image",
        attachment_url: url,
        attachment_name: name,
        reply_to_id: replyTo?.id ?? null,
      });
      onClearReply();
    } catch {
      alert("Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="composer">
      {replyTo && (
        <div className="composer-reply">
          <div className="r-body">
            <div className="r-name">
              Replying to{" "}
              {replyTo.sender_id === me?.id
                ? "yourself"
                : conv.members.find((m) => m.user_id === replyTo.sender_id)
                    ?.user.display_name || "Unknown"}
            </div>
            <div className="r-text">
              {replyTo.type === "image" ? "📷 Photo" : replyTo.content}
            </div>
          </div>
          <button className="icon-btn" onClick={onClearReply}>
            <CloseIcon size={18} />
          </button>
        </div>
      )}

      <div className="composer-row" style={{ position: "relative" }}>
        {showEmoji && (
          <div
            className="emoji-bar"
            style={{
              bottom: 56,
              left: 0,
              flexWrap: "wrap",
              maxWidth: 320,
              borderRadius: 16,
            }}
            onMouseLeave={() => setShowEmoji(false)}
          >
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => {
                  setText((t) => t + e);
                  textareaRef.current?.focus();
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}

        <button
          className="icon-btn"
          title="Emoji"
          onClick={() => setShowEmoji((s) => !s)}
        >
          <SmileIcon size={22} />
        </button>
        <button
          className="icon-btn"
          title="Attach"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <PaperclipIcon size={22} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={handleFile}
        />

        <textarea
          ref={textareaRef}
          className="composer-input"
          placeholder={uploading ? "Uploading…" : "Message"}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            emitTyping();
          }}
          onBlur={stopTyping}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        {text.trim() && (
          <button className="send-btn" title="Send" onClick={handleSend}>
            <SendIcon size={20} />
          </button>
        )}
      </div>
    </div>
  );
}
