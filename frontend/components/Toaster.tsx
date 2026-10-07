"use client";

import { useApp } from "@/lib/store";
import Avatar from "./Avatar";

export default function Toaster() {
  const { toasts, dismissToast } = useApp();
  return (
    <div className="toaster">
      {toasts.map((t) => (
        <div key={t.id} className="toast" onClick={() => dismissToast(t.id)}>
          <Avatar name={t.title} color={t.color} size={40} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="t-title">{t.title}</div>
            <div className="t-body">{t.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
