import { NextResponse } from "next/server";
import { dedicatedLine, formatLine, openerFor, smsLink } from "@/lib/line";

export const dynamic = "force-dynamic";

/** Tells the dashboard which number to point the QR code at, and to print. */
export function GET() {
  const line = dedicatedLine();
  if (!line) return NextResponse.json({ configured: false });
  return NextResponse.json({
    configured: true,
    line,
    display: formatLine(line),
    smsUrl: smsLink(line, openerFor(null)),
  });
}
