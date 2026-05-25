import { NextResponse, type NextRequest } from "next/server";
import { touchParticipant, setDisplayName, setAssignedLine } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { createSharedUser } from "@/lib/spectrum";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!process.env.PROJECT_ID || !process.env.PROJECT_SECRET) {
    return NextResponse.json(
      { error: "Spectrum credentials not configured on the server." },
      { status: 503 }
    );
  }
  // Note: opener text below addresses the agent as Pho-pho.

  let body: { phone?: string; name?: string } | null = null;
  try {
    body = (await req.json()) as { phone?: string; name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!body?.phone) {
    return NextResponse.json({ error: "Phone number is required." }, { status: 400 });
  }
  const phone = normalizePhone(body.phone);
  if (!phone) {
    return NextResponse.json(
      { error: "That doesn't look like a phone number. Try the +15551234567 format." },
      { status: 400 }
    );
  }

  const name = (body.name ?? "").trim();

  let user;
  try {
    user = await createSharedUser({ phoneNumber: phone, firstName: name || null });
  } catch (err) {
    console.error("signup: createSharedUser failed", err);
    return NextResponse.json(
      { error: "Couldn't assign you a line right now. Try again in a minute." },
      { status: 502 }
    );
  }

  const assignedLine = user!.assignedPhoneNumber;

  touchParticipant(phone);
  setAssignedLine(phone, assignedLine);
  if (name) setDisplayName(phone, name);

  const opener = name ? `Hi Pho-pho, it's ${name}. ` : "Hi Pho-pho. ";
  const smsUrl = `sms:${assignedLine}?body=${encodeURIComponent(opener)}`;

  return NextResponse.json({ smsUrl, line: assignedLine, name: name || null });
}
