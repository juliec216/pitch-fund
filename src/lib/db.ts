import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const FUND_USD = Number(process.env.FUND_USD ?? 100);
const FUND_CENTS = Math.round(FUND_USD * 100);
const DB_PATH = resolve(process.env.DB_PATH ?? "./fund.db");

let _db: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (_db) return _db;
  const d = new DatabaseSync(DB_PATH);
  d.exec("PRAGMA journal_mode = WAL;");
  d.exec("PRAGMA busy_timeout = 5000;");
  d.exec(`
    CREATE TABLE IF NOT EXISTS fund (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      total_cents INTEGER NOT NULL,
      remaining_cents INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      awarded_cents INTEGER NOT NULL DEFAULT 0,
      assigned_line TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS awards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      reason TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  // Idempotent migration for existing DBs created before assigned_line existed.
  try { d.exec("ALTER TABLE participants ADD COLUMN assigned_line TEXT"); } catch {}

  d.prepare(
    "INSERT OR IGNORE INTO fund (id, total_cents, remaining_cents) VALUES (1, ?, ?)"
  ).run(FUND_CENTS, FUND_CENTS);
  _db = d;
  return d;
}

const now = () => Date.now();

export interface Fund {
  total_cents: number;
  remaining_cents: number;
}

export function getFund(): Fund {
  return db().prepare("SELECT total_cents, remaining_cents FROM fund WHERE id = 1").get() as unknown as Fund;
}

export interface Participant {
  id: string;
  display_name: string | null;
  first_seen: number;
  last_seen: number;
  attempt_count: number;
  awarded_cents: number;
}

export function touchParticipant(id: string): Participant {
  const ts = now();
  db()
    .prepare(
      `INSERT INTO participants (id, first_seen, last_seen) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen`
    )
    .run(id, ts, ts);
  return db().prepare("SELECT * FROM participants WHERE id = ?").get(id) as unknown as Participant;
}

export function setDisplayName(id: string, name: string): void {
  const clean = name.trim().slice(0, 40);
  db().prepare("UPDATE participants SET display_name = ? WHERE id = ?").run(clean, id);
}

export function setAssignedLine(id: string, line: string): void {
  db().prepare("UPDATE participants SET assigned_line = ? WHERE id = ?").run(line, id);
}

export function recordMessage(id: string, role: "user" | "assistant", content: string): void {
  db()
    .prepare(
      "INSERT INTO messages (participant_id, role, content, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(id, role, content, now());
  if (role === "user") {
    db().prepare("UPDATE participants SET attempt_count = attempt_count + 1 WHERE id = ?").run(id);
  }
}

export interface HistoryItem {
  role: "user" | "assistant";
  content: string;
}

export function getHistory(id: string, limit = 40): HistoryItem[] {
  const rows = db()
    .prepare(
      "SELECT role, content FROM messages WHERE participant_id = ? ORDER BY id DESC LIMIT ?"
    )
    .all(id, limit) as unknown as HistoryItem[];
  return rows.reverse();
}

export type AwardResult =
  | { ok: true; amount_cents: number; remaining_cents: number }
  | { ok: false; error: string; remaining_cents: number };

/** Atomically award funds if the pool can cover it. */
export function awardFunds(id: string, amountCents: number, reason: string): AwardResult {
  const d = db();
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, error: "Amount must be a positive number.", remaining_cents: getFund().remaining_cents };
  }
  d.exec("BEGIN IMMEDIATE");
  try {
    const fund = d.prepare("SELECT remaining_cents FROM fund WHERE id = 1").get() as unknown as { remaining_cents: number };
    if (amountCents > fund.remaining_cents) {
      d.exec("ROLLBACK");
      return {
        ok: false,
        error: `Only ${formatCents(fund.remaining_cents)} remains in the fund; cannot award ${formatCents(amountCents)}.`,
        remaining_cents: fund.remaining_cents,
      };
    }
    d.prepare("UPDATE fund SET remaining_cents = remaining_cents - ? WHERE id = 1").run(amountCents);
    d.prepare("UPDATE participants SET awarded_cents = awarded_cents + ? WHERE id = ?").run(amountCents, id);
    d.prepare(
      "INSERT INTO awards (participant_id, amount_cents, reason, created_at) VALUES (?, ?, ?, ?)"
    ).run(id, amountCents, reason, now());
    const remaining = (d.prepare("SELECT remaining_cents FROM fund WHERE id = 1").get() as unknown as { remaining_cents: number }).remaining_cents;
    d.exec("COMMIT");
    return { ok: true, amount_cents: amountCents, remaining_cents: remaining };
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export interface LeaderRow {
  id: string;
  display_name: string | null;
  awarded_cents: number;
  attempt_count: number;
  last_seen: number;
}

export function leaderboard(): LeaderRow[] {
  return db()
    .prepare(
      `SELECT id, display_name, awarded_cents, attempt_count, last_seen
       FROM participants ORDER BY awarded_cents DESC, last_seen DESC`
    )
    .all() as unknown as LeaderRow[];
}

export interface AwardRow {
  participant_id: string;
  display_name: string | null;
  amount_cents: number;
  reason: string | null;
  created_at: number;
}

export function recentAwards(limit = 25): AwardRow[] {
  return db()
    .prepare(
      `SELECT a.participant_id, p.display_name, a.amount_cents, a.reason, a.created_at
       FROM awards a LEFT JOIN participants p ON p.id = a.participant_id
       ORDER BY a.id DESC LIMIT ?`
    )
    .all(limit) as unknown as AwardRow[];
}

export interface Stats {
  total_cents: number;
  remaining_cents: number;
  awarded_cents: number;
  participant_count: number;
  funded_count: number;
  attempt_count: number;
}

export function stats(): Stats {
  const fund = getFund();
  const agg = db()
    .prepare(
      `SELECT COUNT(*) AS participant_count,
              COALESCE(SUM(CASE WHEN awarded_cents > 0 THEN 1 ELSE 0 END), 0) AS funded_count,
              COALESCE(SUM(attempt_count), 0) AS attempt_count
       FROM participants`
    )
    .get() as unknown as { participant_count: number; funded_count: number; attempt_count: number };
  return {
    total_cents: fund.total_cents,
    remaining_cents: fund.remaining_cents,
    awarded_cents: fund.total_cents - fund.remaining_cents,
    participant_count: agg.participant_count,
    funded_count: agg.funded_count,
    attempt_count: agg.attempt_count,
  };
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Public-safe display name: explicit name, else masked id. */
export function displayLabel(id: string, name: string | null): string {
  if (name && name.trim()) return name.trim();
  const digits = id.replace(/[^0-9]/g, "");
  if (digits.length >= 4) return `••••${digits.slice(-4)}`;
  return "anonymous";
}

export { DB_PATH, FUND_CENTS };
