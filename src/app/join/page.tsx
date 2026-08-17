"use client";

import { useState } from "react";

export default function JoinPage() {
  const [name, setName] = useState("");
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
        body: JSON.stringify({ name }),
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
        <h1>Pitch Pho-pho</h1>
        <p>
          Tell him what to call you and he&apos;ll open in Messages, ready to
          judge. He&apos;s stingy, witty, and might give you a dollar if your
          pitch lands.
        </p>
      </div>

      <form className="card join-form" onSubmit={submit}>
        <label>
          <span>What&apos;s your name?</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ada"
            maxLength={40}
            autoComplete="given-name"
            autoFocus
            required
          />
        </label>

        {err && <div className="err">{err}</div>}

        <button type="submit" disabled={busy}>
          {busy ? "Opening…" : "Open iMessage to Pho-pho →"}
        </button>

        {smsUrl && (
          <a className="fallback" href={smsUrl}>
            iMessage didn&apos;t open? Tap here.
          </a>
        )}

        <p className="fineprint">
          No phone number, no account — your name just goes on the leaderboard.
        </p>
      </form>

      <div className="foot">
        <a href="/">← back to the live leaderboard</a>
      </div>
    </div>
  );
}
