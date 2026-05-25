// Boots the Spectrum agent worker AND the Next.js dashboard in one process,
// so a single Railway service can host both halves of the app on the same
// SQLite file. If either child exits, the other is killed so Railway notices
// and restarts the whole thing.
import { spawn } from "node:child_process";

const procs = new Map();

function run(name, cmd, args) {
  const p = spawn(cmd, args, { stdio: "inherit", env: process.env });
  procs.set(name, p);
  p.on("exit", (code, signal) => {
    console.error(`[${name}] exited code=${code} signal=${signal} — killing siblings`);
    for (const [n, other] of procs) {
      if (n !== name) {
        try { other.kill("SIGTERM"); } catch {}
      }
    }
    process.exit(code ?? 1);
  });
}

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    for (const p of procs.values()) {
      try { p.kill(sig); } catch {}
    }
  });
}

run("agent", "node", ["--no-warnings", "src/agent/agent.ts"]);
run("dashboard", "node", ["node_modules/next/dist/bin/next", "start", "-p", process.env.PORT ?? "3000"]);
