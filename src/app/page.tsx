"use client";

import { useEffect, useState } from "react";

interface Award { name: string; amount: string; reason: string | null; at: number; }
interface Stats {
  total: string; remaining: string; awarded: string; pct_remaining: number;
  participant_count: number; funded_count: number; attempt_count: number;
  today_participant_count: number; today_attempt_count: number; today_awarded: string;
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
      <section className="hero">
        <img
          className="phoreal"
          src="/pho-pho.png"
          alt="Pho-pho, a smiling bowl of pho with a noodle moustache"
        />

        <h1>Convince Pho-pho to win $100</h1>
        <p className="subtitle">
          Pho-pho guards a real fund. Sign up to get your own iMessage line, then
          text your best pitch. Every dollar he gives is real.
        </p>

        <div className="fundbar">
          <div className="row">
            <div className="remaining">{stats?.remaining ?? "—"}</div>
            <div className="of">left of {stats?.total ?? "—"}</div>
          </div>
          <div className="track"><div className="fill" style={{ width: `${pct}%` }} /></div>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="n">{stats?.awarded ?? "—"}</div>
            <div className="l">given away</div>
            <div className="sub">{stats?.today_awarded ?? "$0.00"} today</div>
          </div>
          <div className="stat">
            <div className="n">{stats?.funded_count ?? 0}</div>
            <div className="l">funded</div>
            <div className="sub">{stats?.today_attempt_count ?? 0} pitches today</div>
          </div>
          <div className="stat">
            <div className="n">{stats?.participant_count ?? 0}</div>
            <div className="l">challengers</div>
            <div className="sub">{stats?.today_participant_count ?? 0} new today</div>
          </div>
        </div>

        <div className="qr-card">
          <div className="qr-text">
            <h2>Join the game</h2>
            <a className="qr-cta" href="/join">Or tap to sign up →</a>
          </div>
          <div className="qr-img">
            {qrSrc ? <img src={qrSrc} alt="Scan to join" width={96} height={96} /> : <div className="qr-placeholder" />}
          </div>
        </div>
      </section>

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
            <div className="empty">Pho-pho hasn&apos;t given a cent yet.</div>
          )}
          {stats?.recent_awards.map((a, i) => (
            <div className="award" key={i}>
              <div className="top"><span>{a.name}</span><b>{a.amount}</b></div>
              {a.reason && <div className="reason">{a.reason}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="foot">
        <div><span className="dot" />live · refreshes every 3s</div>
        <div>
          This is open source and built on{" "}
          <a href="https://tryphoton.ai" target="_blank" rel="noopener noreferrer">Photon</a>.
        </div>
      </div>
    </div>
  );
}
