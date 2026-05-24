import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool, ToolUseBlock } from "@anthropic-ai/sdk/resources/messages";
import { STATIC_SYSTEM, balanceLine } from "./prompt.ts";
import {
  awardFunds,
  getFund,
  getHistory,
  setDisplayName,
  formatCents,
} from "../lib/db.ts";

const MODEL = process.env.MODEL ?? "claude-sonnet-4-6";
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 8,
  timeout: 120_000,
});

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
}

export async function runTurn(participantId: string, userText: string): Promise<AgentTurn> {
  const total = getFund().total_cents;
  const startRemaining = getFund().remaining_cents;

  const history = getHistory(participantId);
  const messages: MessageParam[] = history.map((h) => ({ role: h.role, content: h.content }));
  messages.push({ role: "user", content: userText });

  for (let hop = 0; hop < 6; hop++) {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 600,
      system: [
        { type: "text", text: STATIC_SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: balanceLine(getFund().remaining_cents, total) },
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
      return { reply: text || fallback, awardedCents: startRemaining - getFund().remaining_cents };
    }

    messages.push({ role: "assistant", content: res.content });
    messages.push({
      role: "user",
      content: toolUses.map((tu) => ({
        type: "tool_result" as const,
        tool_use_id: tu.id,
        content: handleTool(participantId, tu),
      })),
    });
  }

  return {
    reply: "Let's keep it simple — what's your pitch?",
    awardedCents: startRemaining - getFund().remaining_cents,
  };
}

function handleTool(participantId: string, tu: ToolUseBlock): string {
  const input = tu.input as Record<string, unknown>;

  if (tu.name === "set_display_name") {
    const name = String(input.name ?? "").trim();
    if (!name) return "No name provided.";
    setDisplayName(participantId, name);
    return `Leaderboard name set to "${name.slice(0, 40)}".`;
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
