"use client";

import { useEffect, useState } from "react";

interface Award { name: string; amount: string; reason: string | null; at: number; }
interface Stats {
  total: string; remaining: string; awarded: string; pct_remaining: number;
  participant_count: number; funded_count: number; attempt_count: number;
  recent_awards: Award[];
}
interface Leader { name: string; awarded: string; awarded_cents: number; attempts: number; funded: boolean; }

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export default function Page() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [board, setBoard] = useState<Leader[]>([]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const [s, b] = await Promise.all([
        getJSON<Stats>("/api/stats"),
        getJSON<{ participants: Leader[] }>("/api/leaderboard"),
      ]);
      if (!alive) return;
      if (s) setStats(s);
      if (b) setBoard(b.participants);
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const pct = stats?.pct_remaining ?? 100;

  const [joinUrl, setJoinUrl] = useState<string>("");
  useEffect(() => {
    if (typeof window !== "undefined") setJoinUrl(`${window.location.origin}/join`);
  }, []);
  const qrSrc = joinUrl ? `/api/qr?data=${encodeURIComponent(joinUrl)}` : "";

  return (
    <div className="wrap">
      <div className="header">
        <h1>Convince Hugh</h1>
        <p>
          Hugh guards a real fund. Sign up below to get your own iMessage line, then
          text him your best pitch. Every dollar he gives is real.
        </p>
      </div>

      <div className="fundbar">
        <div className="row">
          <div className="remaining">{stats?.remaining ?? "—"}</div>
          <div className="of">left of {stats?.total ?? "—"}</div>
        </div>
        <div className="track"><div className="fill" style={{ width: `${pct}%` }} /></div>
      </div>

      <div className="stats">
        <div className="stat"><div className="n">{stats?.awarded ?? "—"}</div><div className="l">given away</div></div>
        <div className="stat"><div className="n">{stats?.funded_count ?? 0}</div><div className="l">people funded</div></div>
        <div className="stat"><div className="n">{stats?.participant_count ?? 0}</div><div className="l">challengers</div></div>
      </div>

      <div className="qr-card">
        <div className="qr-text">
          <h2>Join the game</h2>
          <p>Scan to sign up, then text Hugh from your phone.</p>
          <a className="qr-cta" href="/join">Or tap to sign up →</a>
        </div>
        <div className="qr-img">
          {qrSrc ? <img src={qrSrc} alt="Scan to join" width={180} height={180} /> : <div className="qr-placeholder" />}
        </div>
      </div>

      <div className="cols">
        <div className="card">
          <h2>Leaderboard</h2>
          <div className="lb">
            {board.length === 0 && <div className="empty">No challengers yet. Be the first.</div>}
            {board.map((p, i) => (
              <div className={`lb-row${p.funded ? " funded" : ""}`} key={`${p.name}-${i}`}>
                <div className="rank">{p.funded ? i + 1 : "–"}</div>
                <div className="who">
                  {p.name}
                  <span className="att">{p.attempts} {p.attempts === 1 ? "msg" : "msgs"}</span>
                </div>
                <div className={`amt${p.awarded_cents > 0 ? "" : " zero"}`}>{p.awarded}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Latest payouts</h2>
          {(!stats || stats.recent_awards.length === 0) && (
            <div className="empty">Hugh hasn&apos;t given a cent yet.</div>
          )}
          {stats?.recent_awards.map((a, i) => (
            <div className="award" key={i}>
              <div className="top"><span>{a.name}</span><b>{a.amount}</b></div>
              {a.reason && <div className="reason">{a.reason}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="foot"><span className="dot" />live · refreshes every 3s</div>
    </div>
  );
}
