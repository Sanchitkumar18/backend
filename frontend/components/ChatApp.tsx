"use client";

import { useState } from "react";
import { useApp } from "@/lib/store";
import Sidebar from "./Sidebar";
import ChatView from "./ChatView";
import InfoPanel from "./InfoPanel";
import NewChatModal from "./modals/NewChatModal";
import NewGroupModal from "./modals/NewGroupModal";
import SettingsModal from "./modals/SettingsModal";
import ProfileModal from "./modals/ProfileModal";

export type ModalKind =
  | "new-chat"
  | "new-group"
  | "settings"
  | "profile"
  | null;

export default function ChatApp() {
  const { activeId, selectConversation } = useApp();
  const [modal, setModal] = useState<ModalKind>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div className={`app ${activeId != null ? "chat-open" : ""}`}>
      <Sidebar openModal={setModal} />

      <div className="main">
        <ChatView
          onBack={() => selectConversation(null)}
          onOpenInfo={() => setInfoOpen(true)}
        />
      </div>

      {infoOpen && activeId != null && (
        <InfoPanel onClose={() => setInfoOpen(false)} />
      )}

      {modal === "new-chat" && (
        <NewChatModal
          onClose={() => setModal(null)}
          onNewGroup={() => setModal("new-group")}
        />
      )}
      {modal === "new-group" && (
        <NewGroupModal onClose={() => setModal(null)} />
      )}
      {modal === "settings" && (
        <SettingsModal
          onClose={() => setModal(null)}
          onEditProfile={() => setModal("profile")}
        />
      )}
      {modal === "profile" && <ProfileModal onClose={() => setModal(null)} />}
    </div>
  );
}
