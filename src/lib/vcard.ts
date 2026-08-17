import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Pho-pho's contact card.
 *
 * iMessage shows a stranger the raw number until it's saved in Contacts, and
 * nothing server-side can put it there for them. Handing over a card is the fix:
 * the agent sends it on first contact, and the dashboard links the same bytes.
 *
 * Deliberately free of `@/` path aliases and of anything Next-specific — the
 * agent worker imports this too, and it runs outside the bundler.
 */

/** vCard lines cap at 75 octets; continuations begin with a single space. */
function fold(line: string): string {
  return (line.match(/.{1,73}/g) ?? [line]).join("\r\n ");
}

let photoLine: string | null = null;

/** Base64 photo line, read once. Absent is fine — a nameless card still beats a bare number. */
async function photo(): Promise<string> {
  if (photoLine !== null) return photoLine;
  try {
    const bytes = await readFile(join(process.cwd(), "public", "pho-pho-avatar.png"));
    photoLine = fold(`PHOTO;ENCODING=b;TYPE=PNG:${bytes.toString("base64")}`);
  } catch {
    photoLine = "";
  }
  return photoLine;
}

export async function phoPhoVCard(line: string): Promise<string> {
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:;Pho-pho;;;",
    "FN:Pho-pho",
    "ORG:Convince Pho-pho",
    `TEL;TYPE=CELL,VOICE:${line}`,
    "NOTE:Text me your best pitch. I guard a real fund and I am reluctant to share it.",
    await photo(),
    "END:VCARD",
  ]
    .filter(Boolean)
    .join("\r\n");
}
