import { NextResponse } from "next/server";
import { leaderboard, displayLabel, formatCents } from "@/lib/db";

export const dynamic = "force-dynamic";

// See the note in ../stats/route.ts — dynamic rendering alone doesn't stop a
// shared cache from serving a stale leaderboard.
const LIVE = { "Cache-Control": "no-store, must-revalidate" };

export function GET() {
  const rows = leaderboard().map((r) => ({
    name: displayLabel(r.id, r.display_name),
    awarded: formatCents(r.awarded_cents),
    awarded_cents: r.awarded_cents,
    attempts: r.attempt_count,
    funded: r.awarded_cents > 0,
    last_seen: r.last_seen,
  }));
  return NextResponse.json({ participants: rows }, { headers: LIVE });
}
