import { NextResponse } from "next/server";
import { stats, recentAwards, displayLabel, formatCents } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  const s = stats();
  const awards = recentAwards(15).map((a) => ({
    name: displayLabel(a.participant_id, a.display_name),
    amount: formatCents(a.amount_cents),
    amount_cents: a.amount_cents,
    reason: a.reason,
    at: a.created_at,
  }));
  return NextResponse.json({
    total: formatCents(s.total_cents),
    remaining: formatCents(s.remaining_cents),
    awarded: formatCents(s.awarded_cents),
    remaining_cents: s.remaining_cents,
    total_cents: s.total_cents,
    pct_remaining: s.total_cents ? Math.round((s.remaining_cents / s.total_cents) * 100) : 0,
    participant_count: s.participant_count,
    funded_count: s.funded_count,
    attempt_count: s.attempt_count,
    recent_awards: awards,
  });
}
