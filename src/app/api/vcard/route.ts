import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { dedicatedLine } from "@/lib/line";

export const dynamic = "force-dynamic";

/**
 * A saveable contact for the line.
 *
 * iMessage shows a stranger the raw phone number — a name and photo only appear
 * once the number is in Contacts, and nothing the app or the Photon line profile
 * does can force that onto someone else's phone. Handing out a vCard is the one
 * reliable route: tap it on iOS and Messages starts saying "Pho-pho" with a face.
 */

/** vCard lines cap at 75 octets; continuations start with a single space. */
function fold(line: string): string {
  const chunks = line.match(/.{1,73}/g) ?? [line];
  return chunks.join("\r\n ");
}

export async function GET() {
  const line = dedicatedLine();
  if (!line) return new Response("line not configured", { status: 503 });

  let photo = "";
  try {
    const bytes = await readFile(join(process.cwd(), "public", "pho-pho-avatar.png"));
    photo = fold(`PHOTO;ENCODING=b;TYPE=PNG:${bytes.toString("base64")}`);
  } catch {
    // A contact without a face still beats a bare number.
  }

  const card = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:;Pho-pho;;;",
    "FN:Pho-pho",
    "ORG:Convince Pho-pho",
    `TEL;TYPE=CELL,VOICE:${line}`,
    "NOTE:Text me your best pitch. I guard a real fund and I am reluctant to share it.",
    photo,
    "END:VCARD",
  ]
    .filter(Boolean)
    .join("\r\n");

  return new Response(card, {
    headers: {
      "Content-Type": "text/vcard; charset=utf-8",
      "Content-Disposition": 'attachment; filename="pho-pho.vcf"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
