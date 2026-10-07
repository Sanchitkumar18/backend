"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import Avatar from "../Avatar";
import Modal from "./Modal";
import {
  BellIcon,
  DevicesIcon,
  LockIcon,
  LogoutIcon,
  MoonIcon,
  PaletteIcon,
  StoryIcon,
} from "../Icons";

export default function SettingsModal({
  onClose,
  onEditProfile,
}: {
  onClose: () => void;
  onEditProfile: () => void;
}) {
  const { me, theme, toggleTheme, logout } = useApp();
  const [notif, setNotif] = useState(true);
  const [receipts, setReceipts] = useState(true);
  if (!me) return null;

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="modal-body">
        {/* Profile header */}
        <div
          className="settings-item"
          onClick={onEditProfile}
          style={{ marginBottom: 6 }}
        >
          <Avatar
            name={me.display_name}
            color={me.avatar_color}
            url={me.avatar_url}
            size={56}
          />
          <div className="s-body">
            <div className="s-title" style={{ fontSize: 17 }}>
              {me.display_name}
            </div>
            <div className="s-sub">
              {me.phone || `@${me.username}`} · {me.about || "Edit profile"}
            </div>
          </div>
        </div>

        <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />

        {/* Appearance */}
        <div className="settings-item" onClick={toggleTheme}>
          <div className="s-icon"><MoonIcon size={18} /></div>
          <div className="s-body">
            <div className="s-title">Dark mode</div>
            <div className="s-sub">Switch between light and dark themes</div>
          </div>
          <div className={`toggle ${theme === "dark" ? "on" : ""}`}>
            <div className="knob" />
          </div>
        </div>

        <div className="settings-item" onClick={() => setNotif((n) => !n)}>
          <div className="s-icon"><BellIcon size={18} /></div>
          <div className="s-body">
            <div className="s-title">Notifications</div>
            <div className="s-sub">Message toasts</div>
          </div>
          <div className={`toggle ${notif ? "on" : ""}`}>
            <div className="knob" />
          </div>
        </div>

        <div className="settings-item" onClick={() => setReceipts((r) => !r)}>
          <div className="s-icon"><LockIcon size={18} /></div>
          <div className="s-body">
            <div className="s-title">Read receipts</div>
            <div className="s-sub">Privacy settings</div>
          </div>
          <div className={`toggle ${receipts ? "on" : ""}`}>
            <div className="knob" />
          </div>
        </div>

        <div className="settings-item">
          <div className="s-icon"><PaletteIcon size={18} /></div>
          <div className="s-body">
            <div className="s-title">Chat wallpaper</div>
            <div className="s-sub">Coming soon</div>
          </div>
        </div>

        <div className="settings-item">
          <div className="s-icon"><DevicesIcon size={18} /></div>
          <div className="s-body">
            <div className="s-title">Linked devices</div>
            <div className="s-sub">Coming soon</div>
          </div>
        </div>

        <div className="settings-item">
          <div className="s-icon"><StoryIcon size={18} /></div>
          <div className="s-body">
            <div className="s-title">Stories</div>
            <div className="s-sub">Coming soon</div>
          </div>
        </div>

        <div style={{ height: 1, background: "var(--border)", margin: "8px 0" }} />

        <div
          className="settings-item"
          onClick={() => {
            logout();
            onClose();
          }}
        >
          <div className="s-icon" style={{ color: "var(--danger)" }}>
            <LogoutIcon size={18} />
          </div>
          <div className="s-body">
            <div className="s-title" style={{ color: "var(--danger)" }}>
              Log out
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
