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

await runLoop(app);
