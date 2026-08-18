import { Spectrum } from "spectrum-ts";
import { terminal } from "spectrum-ts/providers/terminal";
import { runLoop } from "./loop.ts";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Missing ANTHROPIC_API_KEY. See .env.local.example.");
  process.exit(1);
}

console.log("Terminal mode: pitch Hugh by typing below. Awards write to the same fund DB the dashboard reads.");

const app = await Spectrum({
  providers: [terminal.config()],
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
