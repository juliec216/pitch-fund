import { normalizePhone } from "@/lib/phone";

/**
 * The project's dedicated iMessage line.
 *
 * On the Business plan every player texts this one project-owned number, so
 * nobody has to be registered with Spectrum before they can reach Pho-pho —
 * which is what lets the QR code drop someone straight into Messages.
 */
export function dedicatedLine(): string | null {
  const raw = process.env.LINE_PHONE;
  if (!raw) return null;
  return normalizePhone(raw);
}

/** The pre-filled first text. The name (if any) rides in here, not in the DB. */
export function openerFor(name: string | null | undefined): string {
  const clean = (name ?? "").trim().slice(0, 40);
  return clean ? `Hi Pho-pho, it's ${clean}. ` : "Hi Pho-pho. ";
}

/** Deep link that opens Messages with the opener pre-filled. */
export function smsLink(line: string, opener: string): string {
  return `sms:${line}?body=${encodeURIComponent(opener)}`;
}

/** E.164 → something a person can read off a screen and type into Messages. */
export function formatLine(e164: string): string {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return us ? `+1 (${us[1]}) ${us[2]}-${us[3]}` : e164;
}
