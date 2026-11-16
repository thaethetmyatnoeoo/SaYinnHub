import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
mkdirSync("data", { recursive: true });
// Keep the sample workspace separate from the real first-run database.
const run = spawn(
  process.execPath,
  [
    "node_modules/concurrently/dist/bin/index.js",
    "-k",
    "node --watch server/index.js",
    "vite --host 127.0.0.1",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      DEMO: "true",
      DB_FILE: "data/demo.sqlite",
      DATABASE_URL: "",
    },
  },
);
run.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => run.kill(signal));
