import { NextResponse, type NextRequest } from "next/server";
import { dedicatedLine, openerFor, smsLink } from "@/lib/line";

export const dynamic = "force-dynamic";

/**
 * The optional "give us a name first" path.
 *
 * On a dedicated line there's no account to create and no phone number to
 * collect — anyone can text in cold. All this does is bake the name into the
 * opener; Pho-pho records it with set_display_name on his first turn.
 */
export async function POST(req: NextRequest) {
  const line = dedicatedLine();
  if (!line) {
    return NextResponse.json(
      { error: "The iMessage line isn't configured on the server yet." },
      { status: 503 }
    );
  }

  let body: { name?: string } | null = null;
  try {
    body = (await req.json()) as { name?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const name = (body?.name ?? "").trim().slice(0, 40);
  if (!name) {
    return NextResponse.json({ error: "Give Pho-pho a name to call you." }, { status: 400 });
  }

  return NextResponse.json({ smsUrl: smsLink(line, openerFor(name)), line, name });
}
