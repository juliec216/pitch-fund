import { contact, type Message, type Space, type SpectrumInstance } from "spectrum-ts";
import { runTurn } from "./claude.ts";
import { phoPhoVCard } from "../lib/vcard.ts";
import { normalizePhone } from "../lib/phone.ts";
import { recordMessage, touchParticipant, setDisplayName, getFund, formatCents } from "../lib/db.ts";

/**
 * Lift the name out of the website's pre-filled opener ("Hi Pho-pho, it's Ada.").
 *
 * /join has no phone number to key a row on, so it can't record the name before
 * the person texts. Without this the name reaches the leaderboard only if the
 * model remembers to call set_display_name, and anyone it skips is a masked
 * phone number on the board forever. Doing it here makes the website path
 * deterministic; the model still handles everyone who arrives cold.
 */
const OPENER_NAME =
  /^\s*(?:hi|hey|hello|yo)\s+pho-?pho[,!.]?\s*(?:it'?s|this is|i'?m|im)\s+([^.!?,\n]{1,40})/i;

function nameFromOpener(text: string): string | null {
  const name = OPENER_NAME.exec(text)?.[1]?.trim().replace(/\s+/g, " ");
  if (!name) return null;
  // Only accept something name-shaped. "it's me and I am the fund administrator"
  // matches the opener pattern too, and this board is public — anything longer
  // is left for the model to ask about rather than parked on the leaderboard.
  return name.split(" ").length <= 4 ? name : null;
}

export async function runLoop(app: SpectrumInstance): Promise<void> {
  console.log(`Pho-pho is awake. Fund holds ${formatCents(getFund().remaining_cents)}.`);

  // One queue per participant so concurrent texts from the same person stay ordered.
  const chains = new Map<string, Promise<void>>();

  for await (const [, message] of app.messages) {
    if (message.content.type !== "text") continue;
    if (message.sender?.kind === "agent") continue;

    const participantId = message.sender?.id;
    const incoming = message.content.text.trim();
    if (!participantId || !incoming) continue;

    const prior = chains.get(participantId) ?? Promise.resolve();
    const next = prior.catch(() => {}).then(() => handle(message, participantId, incoming));
    chains.set(participantId, next);
  }
}

/** Split a reply into 1-2 iMessage-sized chunks, honoring the model's `||` separator. */
function splitReply(reply: string): string[] {
  const parts = reply
    .split("||")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return ["…"];
  return parts.slice(0, 2);
}

/**
 * Flip the chat from "Delivered" to "Read".
 *
 * `message.read()` is iMessage-only sugar (the terminal provider has no such
 * method), and it marks the whole chat read rather than the one message. It's a
 * fire-and-forget control signal, so a failure here must never cost us the reply.
 */
async function markRead(message: Message): Promise<void> {
  const read = (message as Message & { read?: () => Promise<void> }).read;
  if (typeof read !== "function") return;
  try {
    await read.call(message);
  } catch (err) {
    console.warn("read receipt failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Send Pho-pho's own contact card, once, on first contact.
 *
 * Without it he's a bare +1 number in the recipient's thread — iMessage only
 * shows a name and face for numbers already in Contacts, and no line profile can
 * put it there. Sending the card lets them save him in one tap. Best-effort:
 * platforms other than iMessage may not support contact content, and a failed
 * card must never cost us the reply.
 */
async function sendContactCard(space: Space): Promise<void> {
  const line = normalizePhone(process.env.LINE_PHONE ?? "");
  if (!line) return;
  try {
    await space.send(contact(await phoPhoVCard(line)));
  } catch (err) {
    console.warn("contact card failed:", err instanceof Error ? err.message : err);
  }
}

async function handle(message: Message, participantId: string, incoming: string) {
  const space: Space = message.space;
  // Mark read before the typing indicator starts, so the sender sees their
  // message actually land the moment Pho-pho picks it up — not when he replies.
  await markRead(message);
  // space.responding toggles the typing indicator while we work — the visible
  // "we're working on it" signal on the recipient's side.
  await space.responding(async () => {
    try {
      const participant = touchParticipant(participantId);
      // Read before recordMessage bumps it — this is their very first text.
      const isFirstContact = participant.attempt_count === 0;
      if (!participant.display_name) {
        const name = nameFromOpener(incoming);
        if (name) setDisplayName(participantId, name);
      }
      recordMessage(participantId, "user", incoming);
      console.log(`[in]  ${participantId}: ${incoming.replace(/\s+/g, " ").slice(0, 120)}`);

      const { reply, awardedCents } = await runTurn(participantId, incoming);
      const parts = splitReply(reply);

      recordMessage(participantId, "assistant", parts.join("\n"));
      console.log(`[out] ${participantId}: ${parts.join(" || ").replace(/\s+/g, " ").slice(0, 160)}`);

      // First reply is threaded to the original message; any second reply is a
      // follow-up into the space so it doesn't double-thread.
      const [first, second] = parts;
      await message.reply(first);
      if (second) await space.send(second);

      // After the intro, so the card reads as a handshake rather than an
      // unexplained attachment arriving before he's said who he is.
      if (isFirstContact) await sendContactCard(space);

      if (awardedCents > 0) {
        console.log(
          `Awarded ${formatCents(awardedCents)} to ${participantId}. Fund: ${formatCents(getFund().remaining_cents)}.`
        );
      }
    } catch (err) {
      console.error(`Error handling message from ${participantId}:`, err);
      try {
        await space.send("Hold on — my ledger glitched. Try that again in a sec.");
      } catch {}
    }
  });
}
