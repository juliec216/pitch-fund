import { NextResponse, type NextRequest } from "next/server";
import { resetAll, formatCents } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "Admin disabled. Set ADMIN_TOKEN env var to enable." },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { remaining_cents } = resetAll();
  return NextResponse.json({
    ok: true,
    remaining: formatCents(remaining_cents),
    remaining_cents,
  });
}
