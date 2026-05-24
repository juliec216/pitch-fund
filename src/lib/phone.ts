/**
 * Strict E.164 normalizer. Returns +<country><number> or null.
 *
 * Accepts:
 *  - "+15551234567"               → "+15551234567"   (already E.164)
 *  - "+62 812 3456 7890"          → "+6281234567890" (E.164 with formatting)
 *  - "(555) 123-4567" / "5551234567" → "+15551234567" (10 US digits, +1 assumed)
 *  - "15551234567"                → "+15551234567"  (11 digits starting with 1)
 *
 * Rejects anything that doesn't look like a real reachable number.
 * iMessage handles must match exactly, so a bogus number means Spectrum can't
 * route inbound messages and the line auto-replies "agent not online".
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();

  // Form 1: already starts with + → keep digits only and verify reasonable length.
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    // ITU-T E.164: country code 1-3 digits + subscriber number, total 8-15.
    // Most real-world numbers are at least 10 digits. Be strict.
    if (digits.length >= 10 && digits.length <= 15 && /^[1-9]/.test(digits)) {
      return `+${digits}`;
    }
    return null;
  }

  // Form 2: no + — assume US/Canada (NANP).
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}
