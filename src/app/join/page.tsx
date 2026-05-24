"use client";

import { useState } from "react";

export default function JoinPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [smsUrl, setSmsUrl] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone }),
      });
      const data = (await r.json()) as { smsUrl?: string; error?: string };
      if (!r.ok || !data.smsUrl) {
        setErr(data.error ?? "Something went sideways. Try again.");
        return;
      }
      setSmsUrl(data.smsUrl);
      window.location.href = data.smsUrl;
    } catch {
      setErr("Network hiccup. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap">
      <div className="header">
        <h1>Pitch Hugh</h1>
        <p>
          Drop your number, get a private iMessage line with Hugh. He&apos;s stingy,
          witty, and might give you a dollar if your pitch lands.
        </p>
      </div>

      <form className="card join-form" onSubmit={submit}>
        <label>
          <span>Your name or handle</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ada"
            maxLength={40}
            autoComplete="given-name"
          />
        </label>
        <label>
          <span>Your phone (your iMessage handle — country code included)</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555 123 4567"
            inputMode="tel"
            autoComplete="tel"
            required
          />
        </label>

        {err && <div className="err">{err}</div>}

        <button type="submit" disabled={busy}>
          {busy ? "Connecting…" : "Open iMessage to Hugh →"}
        </button>

        {smsUrl && (
          <a className="fallback" href={smsUrl}>
            iMessage didn&apos;t open? Tap here.
          </a>
        )}

        <p className="fineprint">
          By entering your number you&apos;re only signing up to text Hugh — no marketing,
          no list, just a pitch.
        </p>
      </form>

      <div className="foot">
        <a href="/">← back to the live leaderboard</a>
      </div>
    </div>
  );
}
