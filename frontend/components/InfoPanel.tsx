"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { api } from "@/lib/api";
import { convMeta } from "@/lib/convUtil";
import { formatLastSeen } from "@/lib/format";
import type { User } from "@/lib/types";
import Avatar from "./Avatar";
import Modal from "./modals/Modal";
import { CloseIcon, LockIcon, PlusIcon, TrashIcon } from "./Icons";

export default function InfoPanel({ onClose }: { onClose: () => void }) {
  const {
    me,
    conversations,
    activeId,
    updateGroup,
    addMembers,
    removeMember,
    selectConversation,
  } = useApp();
  const conv = conversations.find((c) => c.id === activeId);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [muted, setMuted] = useState(false);

  if (!conv || !me) return null;
  const meta = convMeta(conv, me.id);
  const myMember = conv.members.find((m) => m.user_id === me.id);
  const isAdmin = myMember?.role === "admin";
  const activeMembers = conv.members.filter((m) => m.is_active);

  async function saveName() {
    if (nameDraft.trim()) await updateGroup(conv!.id, { name: nameDraft.trim() });
    setEditingName(false);
  }

  return (
    <div className="info-panel">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          gap: 12,
        }}
      >
        <button className="icon-btn" onClick={onClose}>
          <CloseIcon />
        </button>
        <b style={{ fontSize: 16 }}>
          {conv.type === "group" ? "Group info" : "Contact info"}
        </b>
      </div>

      <div className="info-hero">
        <Avatar
          name={meta.title}
          color={meta.color}
          url={meta.url}
          size={96}
          showPresence={!meta.isGroup}
          online={meta.online}
        />
        {conv.type === "group" && isAdmin && editingName ? (
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <input
              className="search-input"
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              style={{ paddingLeft: 12 }}
            />
            <button className="btn-accent" onClick={saveName}>
              Save
            </button>
          </div>
        ) : (
          <h2
            onClick={() => {
              if (conv.type === "group" && isAdmin) {
                setNameDraft(conv.name || "");
                setEditingName(true);
              }
            }}
            style={{ cursor: conv.type === "group" && isAdmin ? "pointer" : "default" }}
          >
            {meta.title}
          </h2>
        )}
        <div className="sub">
          {conv.type === "group"
            ? `${activeMembers.length} members`
            : conv.other_user?.is_online
            ? "Online"
            : conv.other_user
            ? formatLastSeen(conv.other_user.last_seen)
            : ""}
        </div>
      </div>

      {conv.type === "direct" && conv.other_user && (
        <div className="info-section">
          <div className="label">About</div>
          <div style={{ fontSize: 15 }}>
            {conv.other_user.about || "No status"}
          </div>
          {conv.other_user.phone && (
            <div style={{ marginTop: 12 }}>
              <div className="label">Phone</div>
              <div style={{ fontSize: 15 }}>{conv.other_user.phone}</div>
            </div>
          )}
        </div>
      )}

      <div className="info-section">
        <div
          className="settings-item"
          onClick={() => setMuted((m) => !m)}
          style={{ padding: "10px 0" }}
        >
          <div className="s-body">
            <div className="s-title">Mute notifications</div>
          </div>
          <div className={`toggle ${muted ? "on" : ""}`}>
            <div className="knob" />
          </div>
        </div>
        <div className="settings-item" style={{ padding: "10px 0" }}>
          <LockIcon size={18} />
          <div className="s-body">
            <div className="s-title">Disappearing messages</div>
            <div className="s-sub">Off · coming soon</div>
          </div>
        </div>
      </div>

      {conv.type === "group" && (
        <div className="info-section">
          <div
            className="label"
            style={{ display: "flex", justifyContent: "space-between" }}
          >
            <span>{activeMembers.length} members</span>
          </div>

          {isAdmin && (
            <div
              className="settings-item"
              onClick={() => setShowAdd(true)}
              style={{ padding: "8px 0" }}
            >
              <div
                className="s-icon"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                <PlusIcon size={18} />
              </div>
              <div className="s-body">
                <div className="s-title">Add members</div>
              </div>
            </div>
          )}

          {activeMembers.map((m) => (
            <div className="member-row" key={m.user_id}>
              <Avatar
                name={m.user.display_name}
                color={m.user.avatar_color}
                url={m.user.avatar_url}
                size={38}
                showPresence
                online={m.user.is_online}
              />
              <span className="m-name">
                {m.user_id === me.id ? "You" : m.user.display_name}
              </span>
              {m.role === "admin" && <span className="admin-tag">Admin</span>}
              {isAdmin && m.user_id !== me.id && (
                <button
                  className="icon-btn"
                  title="Remove"
                  onClick={() => removeMember(conv.id, m.user_id)}
                >
                  <TrashIcon size={16} />
                </button>
              )}
            </div>
          ))}

          <button
            className="btn-danger"
            style={{ marginTop: 14, padding: "10px 0" }}
            onClick={async () => {
              if (confirm("Leave this group?")) {
                await removeMember(conv.id, me.id);
                onClose();
                selectConversation(null);
              }
            }}
          >
            Leave group
          </button>
        </div>
      )}

      {showAdd && (
        <AddMembersModal
          existingIds={conv.members.map((m) => m.user_id)}
          onClose={() => setShowAdd(false)}
          onAdd={async (ids) => {
            await addMembers(conv.id, ids);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function AddMembersModal({
  existingIds,
  onClose,
  onAdd,
}: {
  existingIds: number[];
  onClose: () => void;
  onAdd: (ids: number[]) => void;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<number[]>([]);

  useEffect(() => {
    api.listUsers().then((u) =>
      setUsers(u.filter((x) => !existingIds.includes(x.id)))
    );
  }, [existingIds]);

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Modal title="Add members" onClose={onClose}>
      <div className="modal-body">
        {users.length === 0 && (
          <div style={{ color: "var(--text-secondary)", padding: 20 }}>
            Everyone is already in this group.
          </div>
        )}
        {users.map((u) => (
          <div className="user-row" key={u.id} onClick={() => toggle(u.id)}>
            <Avatar name={u.display_name} color={u.avatar_color} url={u.avatar_url} size={42} />
            <div style={{ flex: 1 }}>
              <div className="u-name">{u.display_name}</div>
              <div className="u-sub">{u.about || u.phone}</div>
            </div>
            <div className={`checkbox ${selected.includes(u.id) ? "checked" : ""}`}>
              {selected.includes(u.id) && "✓"}
            </div>
          </div>
        ))}
      </div>
      <div className="modal-footer">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-accent"
          disabled={selected.length === 0}
          onClick={() => onAdd(selected)}
        >
          Add {selected.length > 0 && `(${selected.length})`}
        </button>
      </div>
    </Modal>
  );
}
