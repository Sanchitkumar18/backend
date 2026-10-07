"use client";

import { useApp } from "@/lib/store";
import Login from "@/components/Login";
import ChatApp from "@/components/ChatApp";

export default function Home() {
  const { ready, me } = useApp();

  if (!ready) {
    return (
      <div className="center-screen">
        <div className="spinner" />
      </div>
    );
  }
  return me ? <ChatApp /> : <Login />;
}
