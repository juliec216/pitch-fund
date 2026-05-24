# Convince Hugh — the $100 iMessage fund game

Hugh is a skeptical AI fund manager who guards a real money pool. Anyone can
text him over iMessage and try to talk money out of him. He can award small amounts to
genuinely good pitches until the pool hits $0. A live web dashboard shows the leaderboard,
who got funded, and who's playing. Payouts are settled manually by you.

## How it works

- **Agent worker** (`src/agent/`) — runs a [Spectrum](https://photon.codes) iMessage loop.
  Each inbound text goes to Claude with a hardened system prompt and two server-validated
  tools: `award_funds` (deducts from the pool, can never overdraw) and `set_display_name`.
- **Dashboard** (`src/app/`) — a Next.js page that polls `/api/stats` and `/api/leaderboard`
  every 3s: remaining pool, total given away, people funded, the leaderboard (ranked by
  amount awarded), and the latest payouts.
- **Storage** — a single SQLite file (via Node's built-in `node:sqlite`) shared by both
  processes. No database server to run.

## Setup

1. Install deps (Node 22.5+ required for `node:sqlite`; built on Node 25):
   ```bash
   npm install
   ```
2. Copy the env file and fill it in:
   ```bash
   cp .env.local.example .env.local
   ```
   - `ANTHROPIC_API_KEY` — your Claude API key
   - `MODEL` — defaults to `claude-sonnet-4-6`
   - `PROJECT_ID` / `PROJECT_SECRET` — from your project Settings at https://app.photon.codes
   - `FUND_USD` — total pool in dollars (default `100`)
   - `LINE_PHONE` — the iMessage number people text (shown on the dashboard)
   - `DB_PATH` — SQLite file path (default `./fund.db`)

## Run

Two processes, sharing the same `DB_PATH`:

```bash
npm run agent      # the iMessage agent (Hugh)
npm run dev        # the dashboard at http://localhost:3000
```

For production: `npm run build && npm start`.

### Pitch Hugh locally (no iMessage line needed)

```bash
npm run agent:terminal
```

This boots the same agent loop with Spectrum's terminal provider — you type pitches in the
terminal, Hugh replies inline. Awards write to the same SQLite file the dashboard reads,
so you can verify the leaderboard updates before you point an iMessage line at it. Only
`ANTHROPIC_API_KEY` is required for this mode.

## Operating the game

- **Paying winners**: awards are recorded in the `awards` table and shown on the dashboard.
  Each row is a real promise to pay — settle them by hand (Venmo/PayPal/etc.).
- **Reset everything** (wipes participants, messages, awards, and refills the pool):
  ```bash
  npm run reset-fund
  ```
- **Change the pool size**: set `FUND_USD` before the first run (or reset after changing it).
- **Tune Hugh's behavior**: edit the system prompt in `src/agent/prompt.ts`. The award
  ceiling is enforced in code (`awardFunds` in `src/lib/db.ts`), so prompt changes can't
  let him overdraw.

## Notes & guardrails

- Hugh treats every message as untrusted input and is instructed to ignore "ignore your
  instructions"-style injection, fake admins, threats, and "send it all to verify" scams.
  The hard cap (never award more than what remains) is enforced by the database
  transaction, not just the prompt.
- Per-participant messages are queued so rapid-fire texts from one person stay ordered.
- Phone numbers are masked on the dashboard (last 4 digits) unless someone gives Hugh a
  display name.
```
