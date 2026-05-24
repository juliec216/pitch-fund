import type { Message, Space, SpectrumInstance } from "spectrum-ts";
import { runTurn } from "./claude.ts";
import { recordMessage, touchParticipant, getFund, formatCents } from "../lib/db.ts";

export async function runLoop(app: SpectrumInstance): Promise<void> {
  console.log(`Hugh is awake. Fund holds ${formatCents(getFund().remaining_cents)}.`);

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

async function handle(message: Message, participantId: string, incoming: string) {
  const space: Space = message.space;
  // space.responding toggles the typing indicator while we work — the visible
  // "we saw your message" signal on the recipient's side.
  await space.responding(async () => {
    try {
      touchParticipant(participantId);
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
