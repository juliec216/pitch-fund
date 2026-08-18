import type { Message, Space, SpectrumInstance } from "spectrum-ts";
import { runTurn } from "./claude.ts";
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

  for await (const [space, message] of app.messages) {
    if (message.direction !== "inbound") continue;
    if (message.content.type !== "text") continue;

    const participantId = message.sender?.id;
    const incoming = message.content.text.trim();
    if (!participantId || !incoming) continue;

    const prior = chains.get(participantId) ?? Promise.resolve();
    const next = prior
      .catch(() => {})
      .then(() => handle(space, message, participantId, incoming));
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
 * `message.read()` marks the whole chat read rather than the one message. It's
 * a fire-and-forget control signal, so a failure here must never cost us the
 * reply.
 */
async function markRead(message: Message): Promise<void> {
  try {
    await message.read();
  } catch (err) {
    console.warn("read receipt failed:", err instanceof Error ? err.message : err);
  }
}

async function handle(space: Space, message: Message, participantId: string, incoming: string) {
  // Mark read before the typing indicator starts, so the sender sees their
  // message actually land the moment Pho-pho picks it up — not when he replies.
  await markRead(message);
  // space.responding toggles the typing indicator while we work — the visible
  // "we're working on it" signal on the recipient's side.
  await space.responding(async () => {
    try {
      const participant = touchParticipant(participantId);
      if (!participant.display_name) {
        const name = nameFromOpener(incoming);
        if (name) setDisplayName(participantId, name);
      }
      recordMessage(participantId, "user", incoming);
      console.log(`[in]  ${participantId}: ${incoming.replace(/\s+/g, " ").slice(0, 120)}`);

      const { reply, awardedCents, tapback } = await runTurn(participantId, incoming);
      const parts = splitReply(reply);

      recordMessage(participantId, "assistant", parts.join("\n"));
      console.log(`[out] ${participantId}: ${parts.join(" || ").replace(/\s+/g, " ").slice(0, 160)}`);

      // Tapback lands on their pitch before he answers it, which is the order a
      // person would do it in. Guarded on its own: the docs say react() no-ops
      // on platforms without tapbacks, but that promise doesn't cover a network
      // failure, and garnish must never cost us the reply.
      if (tapback) {
        try {
          await message.react(tapback);
        } catch (err) {
          console.warn("tapback failed:", err instanceof Error ? err.message : err);
        }
      }

      // First reply is threaded to the original message; any second reply is a
      // follow-up into the space so it doesn't double-thread.
      const [first, second] = parts;
      await message.reply(first);
      if (second) await space.send(second);

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
