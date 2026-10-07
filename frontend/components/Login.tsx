"use client";

// Mocked onboarding: enter phone/username -> OTP (fixed 123456) -> (new users)
// pick a display name + avatar color -> session.

import { useState } from "react";
import { api } from "@/lib/api";
import { useApp } from "@/lib/store";
import { SignalLogo } from "./Icons";

const COLORS = [
  "#3a76f0", "#d4683b", "#5b9a3f", "#9c6ade",
  "#c74f82", "#2f9e9e", "#b8902f", "#d1495b",
];

type Step = "identify" | "otp" | "profile";

export default function Login() {
  const { login } = useApp();
  const [step, setStep] = useState<Step>("identify");
  const [mode, setMode] = useState<"phone" | "username">("phone");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [otp, setOtp] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [isNew, setIsNew] = useState(false);
  const [devOtp, setDevOtp] = useState("123456");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const identity = () =>
    mode === "phone" ? { phone: phone.trim() } : { username: username.trim() };

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const id = identity();
    if (!id.phone && !id.username) return;
    setLoading(true);
    try {
      const res = await api.requestOtp(id);
      setIsNew(res.is_new_user);
      setDevOtp(res.dev_otp);
      setStep("otp");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (isNew && step === "otp") {
      // Collect a profile before creating the account.
      if (otp !== devOtp) {
        setError("Invalid code. Try " + devOtp);
        return;
      }
      setStep("profile");
      return;
    }
    setLoading(true);
    try {
      const res = await api.verifyOtp({
        ...identity(),
        otp,
        display_name: isNew ? displayName.trim() : undefined,
        avatar_color: isNew ? color : undefined,
      });
      login(res.user, res.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-logo">
          <SignalLogo size={40} />
        </div>

        {step === "identify" && (
          <>
            <h1>Signal</h1>
            <p className="sub">
              Enter your {mode === "phone" ? "phone number" : "username"} to sign
              in or create an account.
            </p>
            <form onSubmit={requestOtp}>
              {mode === "phone" ? (
                <div className="field">
                  <label>Phone number</label>
                  <input
                    autoFocus
                    placeholder="+15550000001"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              ) : (
                <div className="field">
                  <label>Username</label>
                  <input
                    autoFocus
                    placeholder="alice"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              )}
              {error && <div className="auth-error">{error}</div>}
              <button className="btn-primary" disabled={loading}>
                {loading ? "Sending…" : "Continue"}
              </button>
            </form>
            <button
              className="btn-text"
              onClick={() => setMode(mode === "phone" ? "username" : "phone")}
            >
              Use {mode === "phone" ? "a username" : "a phone number"} instead
            </button>
          </>
        )}

        {step === "otp" && (
          <>
            <h1>Verify</h1>
            <p className="sub">
              We sent a 6-digit code to{" "}
              <b>{mode === "phone" ? phone : username}</b>.
            </p>
            <div className="otp-hint">
              Demo code: <b>{devOtp}</b>
            </div>
            <form onSubmit={verify}>
              <div className="field">
                <label>Verification code</label>
                <input
                  autoFocus
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  style={{ letterSpacing: 6, textAlign: "center", fontSize: 20 }}
                />
              </div>
              {error && <div className="auth-error">{error}</div>}
              <button className="btn-primary" disabled={loading}>
                {loading ? "Verifying…" : isNew ? "Continue" : "Sign in"}
              </button>
            </form>
            <button className="btn-text" onClick={() => setStep("identify")}>
              Back
            </button>
          </>
        )}

        {step === "profile" && (
          <>
            <h1>Your profile</h1>
            <p className="sub">Choose how you'll appear to others on Signal.</p>
            <div
              className="auth-logo"
              style={{ background: color, fontSize: 28, fontWeight: 700 }}
            >
              {displayName.trim()
                ? displayName.trim()[0].toUpperCase()
                : "?"}
            </div>
            <form onSubmit={verify}>
              <div className="field">
                <label>Display name</label>
                <input
                  autoFocus
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="color-picker">
                {COLORS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`color-swatch ${c === color ? "active" : ""}`}
                    style={{ background: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
              {error && <div className="auth-error">{error}</div>}
              <button
                className="btn-primary"
                disabled={loading || !displayName.trim()}
              >
                {loading ? "Creating…" : "Finish"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
