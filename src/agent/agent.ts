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

const PROJECT_ID = requireEnv("PROJECT_ID");
const PROJECT_SECRET = requireEnv("PROJECT_SECRET");
requireEnv("ANTHROPIC_API_KEY");

const app = await Spectrum({
  projectId: PROJECT_ID,
  projectSecret: PROJECT_SECRET,
  providers: [imessage.config()],
});

await runLoop(app);
