import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers/imessage";
import { runLoop } from "./loop.ts";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing required env var ${name}. See .env.local.example.`);
    process.exit(1);
  }
  return v;
}

requireEnv("ANTHROPIC_API_KEY");

const app = await Spectrum({
  projectId: requireEnv("SPECTRUM_PROJECT_ID"),
  projectSecret: requireEnv("SPECTRUM_PROJECT_SECRET"),
  providers: [imessage.config()],
});

let stopPromise: Promise<void> | undefined;

function stopOnce(): Promise<void> {
  return (stopPromise ??= app.stop());
}

process.once("SIGINT", () => void stopOnce());
process.once("SIGTERM", () => void stopOnce());

try {
  await runLoop(app);
} finally {
  await stopOnce();
}
