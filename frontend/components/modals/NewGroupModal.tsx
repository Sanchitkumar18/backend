"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import type { User } from "@/lib/types";
import Avatar from "../Avatar";
import Modal from "./Modal";
import { CloseIcon } from "../Icons";

const COLORS = ["#6b7280", "#3a76f0", "#d4683b", "#5b9a3f", "#9c6ade", "#c74f82"];

export default function NewGroupModal({ onClose }: { onClose: () => void }) {
  const { createGroup, selectConversation } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<User[]>([]);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.listUsers().then(setUsers).catch(() => {});
  }, []);

  const toggle = (u: User) =>
    setSelected((s) =>
      s.some((x) => x.id === u.id) ? s.filter((x) => x.id !== u.id) : [...s, u]
    );

  const filtered = users.filter((u) =>
    u.display_name.toLowerCase().includes(query.trim().toLowerCase())
  );

  async function create() {
    if (!name.trim() || selected.length === 0) return;
    setBusy(true);
    try {
      const conv = await createGroup(
        name.trim(),
        selected.map((u) => u.id),
        color
      );
      await selectConversation(conv.id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="New group" onClose={onClose} wide>
      <div className="modal-body">
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
          <Avatar name={name || "G"} color={color} size={56} />
          <input
            className="search-input"
            style={{ flex: 1, paddingLeft: 14, borderRadius: 8 }}
            placeholder="Group name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        <div className="color-picker" style={{ justifyContent: "flex-start", margin: "0 0 16px" }}>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-swatch ${c === color ? "active" : ""}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>

        {selected.length > 0 && (
          <div className="chip-row">
            {selected.map((u) => (
              <span className="chip" key={u.id}>
                <Avatar name={u.display_name} color={u.avatar_color} url={u.avatar_url} size={24} />
                {u.display_name.split(" ")[0]}
                <button onClick={() => toggle(u)}>
                  <CloseIcon size={14} />
                </button>
              </span>
            ))}
          </div>
        )}

        <input
          className="search-input"
          style={{ paddingLeft: 14, marginBottom: 10 }}
          placeholder="Search people to add"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          {filtered.map((u) => {
            const checked = selected.some((x) => x.id === u.id);
            return (
              <div className="user-row" key={u.id} onClick={() => toggle(u)}>
                <Avatar name={u.display_name} color={u.avatar_color} url={u.avatar_url} size={42} />
                <div style={{ flex: 1 }}>
                  <div className="u-name">{u.display_name}</div>
                  <div className="u-sub">{u.about || u.phone}</div>
                </div>
                <div className={`checkbox ${checked ? "checked" : ""}`}>
                  {checked && "✓"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-accent"
          disabled={!name.trim() || selected.length === 0 || busy}
          onClick={create}
        >
          Create group
        </button>
      </div>
    </Modal>
  );
}
