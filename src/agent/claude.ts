import Anthropic from "@anthropic-ai/sdk";
import { Emoji } from "spectrum-ts";
import type { MessageParam, Tool, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { STATIC_SYSTEM, balanceLine, participantLine } from "./prompt.ts";
import {
  awardFunds,
  getFund,
  getHistory,
  setDisplayName,
  formatCents,
  touchParticipant,
} from "../lib/db.ts";

const MODEL = process.env.MODEL ?? "claude-sonnet-4-6";
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 8,
  timeout: 120_000,
});

/**
 * The six native iMessage tapbacks. Named rather than raw emoji so the model
 * picks an intent and can't invent a reaction iMessage would render as a
 * regular message instead of a tapback.
 */
const TAPBACKS: Record<string, string> = {
  love: Emoji.love,
  like: Emoji.like,
  dislike: Emoji.dislike,
  laugh: Emoji.laugh,
  emphasize: Emoji.emphasize,
  question: Emoji.question,
};

const tools: Tool[] = [
  {
    name: "set_display_name",
    description:
      "Record the name or handle this person wants shown on the public leaderboard. Call once when you learn it.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Public display name (max 40 chars)." },
      },
      required: ["name"],
    },
  },
  {
    name: "tapback",
    description:
      "Put an iMessage tapback on the pitch you were just sent. Optional garnish — use it when a reaction lands a beat the text can't, not on every turn. At most one per turn.",
    input_schema: {
      type: "object",
      properties: {
        reaction: {
          type: "string",
          enum: Object.keys(TAPBACKS),
          description:
            "love = you're paying out or genuinely moved; like = solid effort; dislike = lazy; laugh = it actually landed; emphasize = a bold claim; question = baffling.",
        },
      },
      required: ["reaction"],
    },
  },
  {
    name: "award_funds",
    description:
      "Award money from the fund to the current person. Only call when you have genuinely decided to give them money. The award is real and deducts from the fund.",
    input_schema: {
      type: "object",
      properties: {
        amount_usd: { type: "number", description: "Dollar amount to award, e.g. 2.50." },
        reason: { type: "string", description: "One short line on why they earned it." },
      },
      required: ["amount_usd", "reason"],
    },
    cache_control: { type: "ephemeral" },
  },
];

export interface AgentTurn {
  reply: string;
  awardedCents: number;
  /** Emoji to tapback onto the inbound message, if the model asked for one. */
  tapback: string | null;
}

/** Mutable per-turn scratch. An object, not a `let`, so the tool callback's
 *  writes survive TypeScript's narrowing across the closure boundary. */
interface TurnState {
  tapback: string | null;
}

export async function runTurn(participantId: string, userText: string): Promise<AgentTurn> {
  const total = getFund().total_cents;
  const startRemaining = getFund().remaining_cents;
  const state: TurnState = { tapback: null };

  // The caller persists the inbound text before calling us, so it is already the
  // last row of history — appending it again showed Claude (and the fallbacks)
  // every message twice, which read as the person repeating themselves. Check
  // rather than assume, so this can't silently break if the caller changes.
  const history = getHistory(participantId);
  const messages: MessageParam[] = history.map((h) => ({ role: h.role, content: h.content }));
  const last = history.at(-1);
  if (last?.role !== "user" || last.content !== userText) {
    messages.push({ role: "user", content: userText });
  }

  // Per-participant context so Pho-pho knows the captured name and whether this
  // is the first turn — kept out of the cached system block since it changes.
  const participant = touchParticipant(participantId);
  const priorAssistantTurns = history.filter((h) => h.role === "assistant").length;
  const participantContext = participantLine(participant.display_name, priorAssistantTurns);

  for (let hop = 0; hop < 6; hop++) {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: [
        { type: "text", text: STATIC_SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: balanceLine(getFund().remaining_cents, total) },
        { type: "text", text: participantContext },
      ],
      tools,
      messages,
    });

    const toolUses = res.content.filter((b): b is ToolUseBlock => b.type === "tool_use");

    if (res.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = res.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("")
        .trim();
      if (!text) {
        console.warn(
          `[claude] empty text. stop=${res.stop_reason} hop=${hop} blocks=${JSON.stringify(res.content).slice(0, 280)}`
        );
      }
      const fallbacks = [
        "That pitch was so weak it didn't even register. Come back with something I can argue with.",
        "I've heard ATM error messages more compelling than that. Try again.",
        "Sorry, I was waiting for a pitch. Send one and I'll consider it.",
        "I almost replied. Almost. Give me something to work with.",
        "Bold of you to send that and expect money. The answer is no — but I'm curious what comes next.",
      ];
      const fallback = fallbacks[Math.floor(Math.random() * fallbacks.length)]!;
      return {
        reply: text || fallback,
        awardedCents: startRemaining - getFund().remaining_cents,
        tapback: state.tapback,
      };
    }

    messages.push({ role: "assistant", content: res.content });
    messages.push({
      role: "user",
      content: toolUses.map((tu) => ({
        type: "tool_result" as const,
        tool_use_id: tu.id,
        content: handleTool(participantId, tu, state),
      })),
    });
  }

  return {
    reply: "Let's keep it simple — what's your pitch?",
    awardedCents: startRemaining - getFund().remaining_cents,
    tapback: state.tapback,
  };
}

function handleTool(participantId: string, tu: ToolUseBlock, state: TurnState): string {
  const input = tu.input as Record<string, unknown>;

  if (tu.name === "set_display_name") {
    const name = String(input.name ?? "").trim();
    if (!name) return "No name provided.";
    setDisplayName(participantId, name);
    return `Leaderboard name set to "${name.slice(0, 40)}".`;
  }

  if (tu.name === "tapback") {
    const key = String(input.reaction ?? "");
    const emoji = TAPBACKS[key];
    if (!emoji) return `Unknown tapback "${key}". Valid: ${Object.keys(TAPBACKS).join(", ")}.`;
    state.tapback = emoji;
    return `Tapback ${emoji} queued on their message.`;
  }

  if (tu.name === "award_funds") {
    const cents = Math.round(Number(input.amount_usd) * 100);
    const reason = String(input.reason ?? "").slice(0, 200);
    const result = awardFunds(participantId, cents, reason);
    return result.ok
      ? `SUCCESS: awarded ${formatCents(result.amount_cents)}. Fund now holds ${formatCents(result.remaining_cents)}.`
      : `REJECTED: ${result.error}`;
  }

  return `Unknown tool: ${tu.name}`;
}
