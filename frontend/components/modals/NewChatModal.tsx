"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import type { User } from "@/lib/types";
import Avatar from "../Avatar";
import Modal from "./Modal";
import { SearchIcon, UsersIcon } from "../Icons";

export default function NewChatModal({
  onClose,
  onNewGroup,
}: {
  onClose: () => void;
  onNewGroup: () => void;
}) {
  const { createDirect, selectConversation } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [query, setQuery] = useState("");
  const [addMode, setAddMode] = useState(false);
  const [newId, setNewId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.listUsers().then(setUsers).catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.display_name.toLowerCase().includes(q) ||
        (u.username || "").toLowerCase().includes(q) ||
        (u.phone || "").includes(q)
    );
  }, [users, query]);

  async function startChat(userId: number) {
    const conv = await createDirect(userId);
    await selectConversation(conv.id);
    onClose();
  }

  async function addByIdentifier(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const val = newId.trim();
    if (!val) return;
    try {
      const body = val.startsWith("+") ? { phone: val } : { username: val };
      const user = await api.addContact(body);
      await startChat(user.id);
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <Modal title="New chat" onClose={onClose}>
      <div className="modal-body">
        <div
          className="settings-item"
          onClick={onNewGroup}
          style={{ marginBottom: 6 }}
        >
          <div className="s-icon" style={{ background: "var(--accent)", color: "#fff" }}>
            <UsersIcon size={20} />
          </div>
          <div className="s-body">
            <div className="s-title">New group</div>
            <div className="s-sub">Start a group conversation</div>
          </div>
        </div>

        {addMode ? (
          <form onSubmit={addByIdentifier} style={{ margin: "10px 0" }}>
            <div className="field">
              <label>Phone number or username</label>
              <input
                autoFocus
                placeholder="+15550000006 or frank"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
              />
            </div>
            {error && <div className="auth-error">{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" className="btn-accent">
                Add & chat
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setAddMode(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            className="btn-text"
            style={{ marginTop: 0, marginBottom: 10 }}
            onClick={() => setAddMode(true)}
          >
            + Add a new contact by phone / username
          </button>
        )}

        <div className="search-wrap" style={{ position: "relative", margin: "6px 0 12px" }}>
          <SearchIcon />
          <input
            className="search-input"
            placeholder="Search contacts"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="conv-section-label" style={{ padding: "0 0 6px" }}>
          Contacts
        </div>
        {filtered.map((u) => (
          <div className="user-row" key={u.id} onClick={() => startChat(u.id)}>
            <Avatar
              name={u.display_name}
              color={u.avatar_color}
              url={u.avatar_url}
              size={44}
              showPresence
              online={u.is_online}
            />
            <div>
              <div className="u-name">{u.display_name}</div>
              <div className="u-sub">{u.about || u.phone}</div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ color: "var(--text-secondary)", padding: 16 }}>
            No contacts found.
          </div>
        )}
      </div>
    </Modal>
  );
}
