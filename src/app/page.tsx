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
interface LineInfo { configured: boolean; line?: string; display?: string; smsUrl?: string; }

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

  // The QR points straight at Messages when a dedicated line is configured, so
  // scanning it starts a conversation with no signup at all. Without one we fall
  // back to sending people to the name form.
  const [line, setLine] = useState<LineInfo | null>(null);
  const [joinUrl, setJoinUrl] = useState<string>("");
  useEffect(() => {
    if (typeof window !== "undefined") setJoinUrl(`${window.location.origin}/join`);
    getJSON<LineInfo>("/api/line").then(setLine);
  }, []);

  const qrTarget = line?.configured ? line.smsUrl : joinUrl;
  const qrSrc = qrTarget ? `/api/qr?data=${encodeURIComponent(qrTarget)}` : "";

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
          Pho-pho guards a real fund. Scan the code, text him your best pitch.
          Every dollar he gives is real.
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
            <h2>{line?.configured ? "Scan or text to play" : "Join the game"}</h2>
            {line?.configured ? (
              <>
                <a className="qr-number" href={line.smsUrl}>{line.display}</a>
                <p>Scan the code or text that number. No signup, no account.</p>
                <div className="qr-links">
                  <a className="qr-cta" href="/join">Tell him your name first →</a>
                  {/* iMessage shows strangers a bare number until it's saved. */}
                  <a className="qr-cta subtle" href="/api/vcard">Save Pho-pho to contacts</a>
                </div>
              </>
            ) : (
              <a className="qr-cta" href="/join">Or tap to sign up →</a>
            )}
          </div>
          {/* On a phone you can't scan your own screen, so the code is also a tap target. */}
          <a className="qr-img" href={qrTarget || "/join"}>
            {qrSrc ? (
              <img
                src={qrSrc}
                alt={line?.configured ? "Scan to text Pho-pho" : "Scan to join"}
                width={96}
                height={96}
              />
            ) : (
              <div className="qr-placeholder" />
            )}
          </a>
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
