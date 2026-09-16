import type { Message, Space, SpectrumInstance } from "spectrum-ts";
import { runTurn } from "./claude.ts";
import { recordMessage, touchParticipant, setDisplayName, getFund, formatCents } from "../lib/db.ts";

const SHUTDOWN_SIGNALS = ["SIGINT", "SIGTERM"] as const;
type ShutdownSignal = (typeof SHUTDOWN_SIGNALS)[number];

interface RunAgentOptions {
  beforeTurn?: (message: Message) => Promise<void>;
}

type SignalListener = (...args: unknown[]) => void;

/**
 * Spectrum installs eager signal handlers while it starts. This runner owns
 * the application lifecycle instead, so it can stop intake and drain turns
 * before asking Spectrum to tear down its providers.
 */
function signalListeners(): Map<ShutdownSignal, SignalListener[]> {
  return new Map(
    SHUTDOWN_SIGNALS.map((signal) => [signal, process.listeners(signal) as SignalListener[]])
  );
}

function removeAddedSignalListeners(baseline: Map<ShutdownSignal, SignalListener[]>): void {
  for (const signal of SHUTDOWN_SIGNALS) {
    const inherited = [...(baseline.get(signal) ?? [])];
    for (const listener of process.listeners(signal) as SignalListener[]) {
      const inheritedIndex = inherited.indexOf(listener);
      if (inheritedIndex >= 0) {
        inherited.splice(inheritedIndex, 1);
      } else {
        process.off(signal, listener);
      }
    }
  }
}

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

export async function runAgent(
  createApp: () => Promise<SpectrumInstance>,
  options: RunAgentOptions = {}
): Promise<void> {
  const baselineListeners = signalListeners();
  const app = await createApp();
  removeAddedSignalListeners(baselineListeners);

  const messages = app.messages[Symbol.asyncIterator]();
  // One queue per participant so concurrent texts from the same person stay ordered.
  const chains = new Map<string, Promise<void>>();
  let stopIntakePromise: Promise<void> | undefined;

  function stopIntake(): Promise<void> {
    return (stopIntakePromise ??= Promise.resolve(messages.return?.()).then(() => undefined));
  }

  const requestShutdown = () => {
    void stopIntake().catch((err) => {
      console.error("Error stopping message intake:", err);
    });
  };

  // Keep the listener installed while draining. The process supervisor may
  // forward the same signal again when its sibling exits.
  for (const signal of SHUTDOWN_SIGNALS) process.on(signal, requestShutdown);

  try {
    console.log(`Pho-pho is awake. Fund holds ${formatCents(getFund().remaining_cents)}.`);

    while (true) {
      const item = await messages.next();
      if (item.done) break;

      const [space, message] = item.value;
      if (message.direction !== "inbound") continue;
      if (message.content.type !== "text") continue;

      const participantId = message.sender?.id;
      const incoming = message.content.text.trim();
      if (!participantId || !incoming) continue;

      const prior = chains.get(participantId) ?? Promise.resolve();
      const next = prior
        .then(() => handle(space, message, participantId, incoming, options.beforeTurn))
        .catch((err) => {
          console.error(`Error running message chain for ${participantId}:`, err);
        });
      chains.set(participantId, next);
      void next.then(() => {
        if (chains.get(participantId) === next) chains.delete(participantId);
      });
    }
  } finally {
    for (const signal of SHUTDOWN_SIGNALS) process.off(signal, requestShutdown);
    try {
      await stopIntake();
      await Promise.allSettled(chains.values());
    } finally {
      await app.stop();
    }
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

async function handle(
  space: Space,
  message: Message,
  participantId: string,
  incoming: string,
  beforeTurn?: (message: Message) => Promise<void>
) {
  // Run provider-specific signals (iMessage read receipts, for example)
  // before the typing indicator starts.
  await beforeTurn?.(message);
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
