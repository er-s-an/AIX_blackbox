import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
const webPort = process.env.AFR_WEB_PORT || "4310";
const gatewayPort = process.env.AFR_GATEWAY_PORT || "4311";
if (
  !existsSync(".secrets/gateway.env") ||
  !existsSync("apps/web/.next/BUILD_ID")
)
  throw Error(
    "Run pnpm setup:local --recorder-only and pnpm build in a fresh workspace first.",
  );
const children = [
  spawn(process.execPath, ["--import", "tsx", "apps/gateway/src/index.ts"], {
    stdio: "inherit",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      AFR_RECORDER_ONLY: "1",
      AFR_GATEWAY_PORT: gatewayPort,
      AFR_WEB_ORIGIN: process.env.AFR_WEB_ORIGIN || `http://localhost:${webPort}`,
    },
  }),
  spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "-p",
      webPort,
      "--hostname",
      "127.0.0.1",
    ],
    {
      cwd: "apps/web",
      stdio: "inherit",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NEXT_TELEMETRY_DISABLED: "1",
      },
    },
  ),
];
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill("SIGTERM");
};
for (const c of children) {
  c.on("error", () => { process.exitCode = 1; stop(); });
  c.on("exit", (code) => {
    if (!stopping) { process.exitCode = code || 1; stop(); }
  });
}
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, stop);
console.log(
  `Recorder workspace: http://localhost:${webPort}. No model service, wallet funding or contract deployment required for recording.`,
);
