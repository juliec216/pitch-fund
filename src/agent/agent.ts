import { Spectrum, type Message } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { runAgent } from "./loop.ts";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}. See .env.local.example.`);
    process.exit(1);
  }
  return v;
}

requireEnv("ANTHROPIC_API_KEY");

function spectrumCredentials(): { projectId: string; projectSecret: string } {
  const projectId = process.env.SPECTRUM_PROJECT_ID;
  const projectSecret = process.env.SPECTRUM_PROJECT_SECRET;
  if (projectId && projectSecret) return { projectId, projectSecret };

  const legacyProjectId = process.env.PROJECT_ID;
  const legacyProjectSecret = process.env.PROJECT_SECRET;
  if (legacyProjectId && legacyProjectSecret) {
    console.warn(
      "PROJECT_ID and PROJECT_SECRET are deprecated; rename them to SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET."
    );
    return { projectId: legacyProjectId, projectSecret: legacyProjectSecret };
  }

  console.error(
    "Missing Spectrum credentials. Set SPECTRUM_PROJECT_ID and SPECTRUM_PROJECT_SECRET (legacy PROJECT_ID and PROJECT_SECRET are temporarily supported)."
  );
  process.exit(1);
}

async function markRead(message: Message): Promise<void> {
  try {
    await message.read();
  } catch (err) {
    console.warn("read receipt failed:", err instanceof Error ? err.message : err);
  }
}

const credentials = spectrumCredentials();
await runAgent(
  () =>
    Spectrum({
      ...credentials,
      providers: [imessage.config()],
    }),
  { beforeTurn: markRead }
);
