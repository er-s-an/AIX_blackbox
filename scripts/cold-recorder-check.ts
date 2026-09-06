import { execFileSync, spawn } from "node:child_process";
import {
  mkdtempSync,
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { parse } from "dotenv";
const source = process.cwd(),
  root = mkdtempSync(tmpdir() + "/afr-cold-recorder-");
const outputPath = process.argv.find(a => a.startsWith("--output="))?.slice(9)
  || `${source}/runs/cold-recorder-${new Date().toISOString().replaceAll(":", "-")}.json`;
mkdirSync(dirname(outputPath), { recursive: true });
const paths = [
  ...new Set(
    execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"])
      .toString()
      .split("\0")
      .filter(Boolean),
  ),
];
for (const p of paths) {
  mkdirSync(dirname(root + "/" + p), { recursive: true });
  cpSync(p, root + "/" + p);
}
const env = {
  PATH: dirname(process.execPath) + ":" + process.env.PATH,
  HOME: process.env.HOME,
  CI: "true",
};
function cmd(args: string[]) {
  return execFileSync(args[0]!, args.slice(1), {
    cwd: root,
    env,
    timeout: 180000,
    stdio: "pipe",
  }).toString();
}
cmd(["pnpm", "install", "--frozen-lockfile"]);
cmd(["pnpm", "setup:local", "--recorder-only"]);
cmd(["pnpm", "build:cli"]);
cmd(["pnpm", "build:recorder"]);
const consumer = mkdtempSync(tmpdir() + "/afr-cold-consumer-");
writeFileSync(consumer + "/package.json", JSON.stringify({ private: true, type: "module" }));
execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", root + "/dist/afr-recorder-0.2.0-beta.1.tgz"], {
  cwd: consumer, env, timeout: 60000, stdio: "pipe",
});
const { createRecorder } = await import(pathToFileURL(consumer + "/node_modules/@afr/recorder/index.mjs").href);
writeFileSync(consumer + "/check.ts", `import { createRecorder, type RecorderOptions } from '@afr/recorder';
const options: RecorderOptions = {directory: '.afr', agentId: 'agent_test', runId: 'first'};
const recorder = createRecorder(options);
const pay = recorder.wrapPayment(async (a: {id: string}) => ({receipt: a.id}), {
  operationId: a => a.id, request: a => ({id: a.id}), result: r => ({receipt: r.receipt}),
});
void pay;
recorder.close();
`);
execFileSync(process.execPath, [root + "/node_modules/typescript/bin/tsc", "check.ts", "--noEmit", "--strict", "--skipLibCheck", "--module", "nodenext", "--moduleResolution", "nodenext", "--target", "es2022"], {
  cwd: consumer, env, timeout: 60000, stdio: "pipe",
});
const child = spawn(
  process.execPath,
  ["--import", "tsx", "apps/gateway/src/index.ts"],
  {
    cwd: root,
    env: { ...env, AFR_RECORDER_ONLY: "1", AFR_GATEWAY_PORT: "4315" },
    stdio: "pipe",
  },
);
let output = "";
child.stdout.on("data", (b) => (output += b.toString()));
child.stderr.on("data", (b) => (output += b.toString()));
try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      if ((await fetch("http://127.0.0.1:4315/health")).ok) {
        ready = true;
        break;
      }
    } catch {}
  }
  if (!ready) throw Error("COLD_START_FAILED");
  const unauthenticated = await fetch("http://127.0.0.1:4315/cases");
  const malformed = await fetch("http://127.0.0.1:4315/login", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
  });
  const oversized = await fetch("http://127.0.0.1:4315/recorder/runs/first/events", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: "x".repeat(1024 * 1024) }),
  });
  if (unauthenticated.status !== 401 || malformed.status !== 400 || oversized.status !== 413)
    throw Error("HTTP_STATUS_CONTRACT_FAILED");
  const credentials = parse(readFileSync(root + "/.secrets/gateway.env"));
  const login = await fetch("http://127.0.0.1:4315/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "user", password: credentials.USER_PASSWORD }),
  });
  const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  async function api(path: string, body?: any) {
    const r = await fetch("http://127.0.0.1:4315" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!r.ok) throw Error("COLD_API_" + r.status);
    return r;
  }
  const a: any = await (
    await api("/integrations", { name: "Fresh machine" })
  ).json();
  const recorder = createRecorder({
    directory: root + "/.afr",
    agentId: a.id,
    runId: "first",
    endpoint: "http://127.0.0.1:4315",
    token: a.token,
  });
  recorder.record("incident", {
    reason: "Installation test. No payment broadcast.",
  });
  await recorder.sync();
  recorder.close();
  const runs: any = await (await api("/cases")).json();
  const c: any = await (
    await api("/cases/" + runs[0].id + "/snapshot", {})
  ).json();
  const bytes = Buffer.from(
    await (await api("/cases/" + c.id + "/packet?set=snapshot")).arrayBuffer(),
  );
  writeFileSync(root + "/downloaded.zip", bytes);
  const verify = spawn(
    process.execPath,
    ["dist/afr-verify/afr-verify.mjs", "downloaded.zip", "--offline", "--json"],
    { cwd: root, env, stdio: "pipe" },
  );
  let text = "",
    stderr = "";
  verify.stderr.on("data", (b) => (stderr += b.toString()));
  verify.stdout.on("data", (b) => (text += b.toString()));
  const code = await new Promise<number | null>((resolve) =>
    verify.on("close", resolve),
  );
  if (!text) throw Error("COLD_CLI_" + stderr);
  const v = JSON.parse(text);
  if (
    code !== 3 ||
    v.overall !== "incomplete" ||
    v.checks.find((x: any) => x.id === "SIGNER_TRUST").status !== "Pass"
  )
    throw Error("COLD_VERIFY_FAILED");
  const cap: any = await (await api("/capabilities")).json();
  const refused = await fetch("http://127.0.0.1:4315/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ mode: "normal", signer: "0x" + "11".repeat(20) }),
  });
  const result = {
    at: new Date().toISOString(),
    source_working_tree: true,
    git_repository_created: false,
    sdk_installed_from_tgz: true,
    consumer_typescript_checked: true,
    cli_source_commit: JSON.parse(readFileSync(root + "/dist/afr-verify/BUILD.json", "utf8")).source_commit,
    install: "pnpm install --frozen-lockfile",
    new_keys: true,
    wallet_funding: false,
    model_api_used: false,
    contracts_deployed: false,
    recording_only: cap.recorder_only,
    protected_workflow_disabled: refused.status === 409,
    snapshot_result: v.overall,
    signature_trust: v.checks.find((x: any) => x.id === "SIGNER_TRUST").status,
    cold_directory: root,
    http_statuses: { unauthenticated: unauthenticated.status, malformed: malformed.status, oversized: oversized.status },
  };
  const statuses = await Promise.all(Array.from({ length: 181 }, async () =>
    (await fetch("http://127.0.0.1:4315/health")).status));
  if (!statuses.includes(429) || statuses.some(s => s !== 200 && s !== 429))
    throw Error("RATE_LIMIT_STATUS_CONTRACT_FAILED");
  Object.assign(result, { rate_limit_status: 429 });
  writeFileSync(
    outputPath,
    JSON.stringify(result, null, 2),
  );
  console.log(result);
} finally {
  child.kill("SIGTERM");
  writeFileSync(outputPath.replace(/\.json$/, "") + ".service.log", output);
}
