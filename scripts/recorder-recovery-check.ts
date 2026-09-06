import { createRecorder } from "../packages/recorder/src/index.ts";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parse } from "dotenv";
const g = parse(readFileSync(".secrets/gateway.env"));
const login = await fetch("http://127.0.0.1:4311/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ role: "operator", password: g.OPERATOR_PASSWORD }),
});
const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
const a: any = await (
  await fetch("http://127.0.0.1:4311/integrations", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ name: "恢复与断网验证" }),
  })
).json();
const directory = mkdtempSync(tmpdir() + "/afr-recovery-"),
  options = { directory, agentId: a.id, runId: "recovery" };
let r = createRecorder({
  ...options,
  endpoint: "http://127.0.0.1:1",
  token: a.token,
});
r.record("order", { order_id: "order-1" });
let offlineRejected = false;
try {
  await r.sync();
} catch {
  offlineRejected = true;
}
r.close();
r = createRecorder({
  ...options,
  endpoint: "http://127.0.0.1:4311",
  token: a.token,
});
const recovered = await r.sync();
const replay = await r.sync();
r.close();
const childCode = `import {createRecorder} from ${JSON.stringify(pathToFileURL(process.cwd() + "/dist/afr-recorder/index.mjs").href)};const r=createRecorder(${JSON.stringify({ ...options, runId: "crash" })});const pay=r.wrapPayment(async()=>process.exit(7),{operationId:()=> 'one',request:()=>({amount:'1'}),result:x=>x});await pay({});`;
const child = spawnSync(process.execPath, [
  "--input-type=module",
  "-e",
  childCode,
]);
r = createRecorder({ ...options, runId: "crash" });
let called = false,
  retryRejected = false;
try {
  await r.wrapPayment(
    async () => {
      called = true;
    },
    { operationId: () => "one", request: () => ({}), result: () => ({}) },
  )({});
} catch {
  retryRejected = true;
}
r.close();
const result = {
  at: new Date().toISOString(),
  offline_failed_without_losing_spool: offlineRejected,
  uploaded_after_reopen: recovered.accepted === 2,
  replay_deduplicated: replay.accepted === 2,
  child_exit: child.status,
  crash_retry_blocked: retryRejected && !called,
  scope:
    "Local fault injection and real collector HTTP; no payment is broadcast by this check",
};
writeFileSync(
  "runs/beta-recorder-recovery.json",
  JSON.stringify(result, null, 2),
);
console.log(result);
if (
  !offlineRejected ||
  recovered.accepted !== 2 ||
  replay.accepted !== 2 ||
  child.status !== 7 ||
  !result.crash_retry_blocked
)
  throw Error("RECOVERY_CHECK_FAILED");
rmSync(directory, { recursive: true });
