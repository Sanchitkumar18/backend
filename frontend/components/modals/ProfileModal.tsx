"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import Avatar from "../Avatar";
import Modal from "./Modal";

const COLORS = [
  "#3a76f0", "#d4683b", "#5b9a3f", "#9c6ade",
  "#c74f82", "#2f9e9e", "#b8902f", "#d1495b",
];

export default function ProfileModal({ onClose }: { onClose: () => void }) {
  const { me, refreshMe } = useApp();
  const [name, setName] = useState(me?.display_name || "");
  const [about, setAbout] = useState(me?.about || "");
  const [color, setColor] = useState(me?.avatar_color || COLORS[0]);
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  async function save() {
    setBusy(true);
    try {
      await api.updateProfile({
        display_name: name.trim() || me!.display_name,
        about,
        avatar_color: color,
      });
      await refreshMe();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit profile" onClose={onClose}>
      <div className="modal-body" style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <Avatar name={name || "?"} color={color} size={88} />
        </div>
        <div className="color-picker">
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
        <div className="field">
          <label>Display name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>About</label>
          <input
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder="Add a few words about yourself"
          />
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-accent" onClick={save} disabled={busy || !name.trim()}>
          Save
        </button>
      </div>
    </Modal>
  );
}
