import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, cpSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { canonical, digest, hash, pack, unpack, strictJson } from "../packages/core/src/index.ts";

// Mutants are built only in a disposable directory; no runtime switches or weakened shipped code.
const temp = mkdtempSync(tmpdir() + "/afr-ablation-");
const output = process.argv.find(a => a.startsWith("--output="))?.slice(9)
  || `runs/ablation-${new Date().toISOString().replaceAll(":", "-")}.json`;
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const sdkPath = "packages/recorder/src/index.ts", snapshotPath = "packages/snapshot/src/index.ts";
const sdk = readFileSync(sdkPath, "utf8"), snapshot = readFileSync(snapshotPath, "utf8");
const replaceOnce = (s: string, from: string, to: string) => {
  if (s.split(from).length !== 2) throw Error("ABLATION_SOURCE_CHANGED");
  return s.replace(from, to);
};
async function moduleFor(name: string, path: string, source: string) {
  const file = temp + "/" + name + ".mjs";
  await build({ stdin: { contents: source, resolveDir: resolve(dirname(path)), loader: "ts" },
    outfile: file, bundle: true, platform: "node", format: "esm", target: "node22",
    alias: { "jsonc-parser": "jsonc-parser/lib/esm/main.js" },
    banner: { js: "import {createRequire as __afrCreateRequire} from 'node:module'; const require=__afrCreateRequire(import.meta.url);" } });
  return import(pathToFileURL(file).href);
}
cpSync("schemas", temp + "/schemas", { recursive: true });
async function paymentTrial(m: any, name: string) {
  const r = m.createRecorder({ directory: temp + "/" + name, agentId: "agent_trial", runId: "run_1" });
  let calls = 0, intentBeforeCall = false;
  const pay = r.wrapPayment(async () => {
    calls++;
    intentBeforeCall = readFileSync(temp + "/" + name + "/agent_trial/run_1/events.jsonl", "utf8").includes("payment_requested");
    return { receipt: "synthetic-test" };
  }, { operationId: () => "order_1", request: () => ({ amount: "1" }), result: (v: any) => v });
  try { await pay(undefined); try { await pay(undefined); } catch {} }
  finally { r.close(); }
  return { calls, intent_before_call: intentBeforeCall };
}
const full = await paymentTrial(await moduleFor("sdk-full", sdkPath, sdk), "full");
const noDuplicate = await paymentTrial(await moduleFor("sdk-no-duplicate", sdkPath,
  replaceOnce(sdk, 'throw Error("OPERATION_ALREADY_RECORDED_RECONCILE_FIRST");', "void 0;")), "no-duplicate");
const noIntent = await paymentTrial(await moduleFor("sdk-no-intent", sdkPath,
  replaceOnce(sdk, 'append("payment_requested", request, id, 2);', "void request;")), "no-intent");

const verifier = await moduleFor("snapshot-full", snapshotPath, snapshot);
const noSignature = await moduleFor("snapshot-no-signature-gate", snapshotPath,
  replaceOnce(snapshot, 'checks.some((c) => c.status === "Fail")', 'checks.some((c) => c.status === "Fail" && c.id !== "MANIFEST_SIG")'));
const account = privateKeyToAccount(generatePrivateKey());
const trust = { repo: { url: "urn:afr:ablation", commit: "local-experiment" },
  signers: [{ key_id: "gateway-demo-1", role: "gateway", address: account.address, status: "active", valid_from: "2020-01-01T00:00:00Z" }],
  chain: { default_rpc: "http://127.0.0.1:1", confirmation_depth: 1 },
  contracts: { test_token: { address: account.address } } };
const signed = await verifier.makeSnapshot(account, { id: "trial", gaps: [], receipts: [] }, 1, null);
const files = unpack(signed.bytes);
files["record.json"] = canonical({ id: "trial", gaps: [], receipts: [], fabricated_amount: "999" });
const manifest = strictJson(files["manifest.json"]!);
const entry = manifest.files.find((f: any) => f.path === "record.json");
entry.sha256 = hash(files["record.json"]); entry.bytes = files["record.json"].length;
files["manifest.json"] = canonical(manifest);
const tampered = pack(files);
const checked = await verifier.verifySnapshot(tampered, trust, { offline: true });
const weakened = await noSignature.verifySnapshot(tampered, trust, { offline: true });

// Re-score archived real model outputs on the same inputs; this does not call or revalidate the provider.
let ai: any = { status: "NOT_RUN", reason: "No archived evaluation supplied" };
const suite = process.argv.find(a => a.startsWith("--suite="))?.slice(8);
if (suite && existsSync(suite + "/results.json")) {
  const rows: any[] = [];
  const filesForDigest: any[] = [];
  for (const item of read(suite + "/results.json")) {
    const dir = suite + "/" + item.name;
    if (!existsSync(dir + "/analysis.json")) throw Error("ARCHIVED_ANALYSIS_MISSING");
    const requestFiles = readdirSync(dir).filter(n => n.endsWith(".request.json"));
    const attempts = read(dir + "/attempts.json");
    const accepted = attempts.attempts.slice().reverse().find((a: any) => a.status === "valid");
    const requestFile = requestFiles.find(n => digest(read(dir + "/" + n)) === accepted?.request_digest);
    if (!requestFile) throw Error("ARCHIVED_REQUEST_DIGEST_MISMATCH");
    const request = read(dir + "/" + requestFile);
    const input = JSON.parse(request.messages[1].content);
    // This candidate sees only hard facts; no fixture IDs, labels or semantic attack keywords.
    const category = input.rules.duplicate_settlements > 1 ? "Duplicate Execution"
      : input.evidence.some((e: any) => e.kind === "second_confirmation" && e.content.signature_verified) ? "User-Authorized Action"
      : input.evidence.some((e: any) => e.content.missing === true) ? "Evidence Failure" : "Undetermined";
    const truth = read(dir + "/ground_truth.private.json");
    const actual = read(dir + "/analysis.json");
    rows.push({ name: item.name, expected: truth.expected_category,
      model_category: actual.primary_hypothesis.category, rule_category: category,
      model_correct: actual.primary_hypothesis.category === truth.expected_category,
      rule_correct: category === truth.expected_category });
    for (const name of [requestFile, "analysis.json", "ground_truth.private.json"])
      filesForDigest.push({ path: item.name + "/" + name, sha256: hash(readFileSync(dir + "/" + name)) });
  }
  ai = { status: "ARCHIVED_OUTPUT_COMPARISON", suite, input_digest: digest(filesForDigest),
    cases: rows.length, independent_scenarios: new Set(rows.map(r => r.name.split("-")[0])).size,
    model_correct: rows.filter(r => r.model_correct).length, rules_correct: rows.filter(r => r.rule_correct).length,
    new_model_calls: 0, rows,
    limitation: "Primary category only, six synthetic scenarios with repeated variants; not production accuracy or a fresh provider test." };
}
const controls = [
  { name: "duplicate operation guard", full: full.calls, removed: noDuplicate.calls, metric: "payment function calls for two identical requests", pass: full.calls === 1 && noDuplicate.calls === 2 },
  { name: "durable intent recording", full: full.intent_before_call, removed: noIntent.intent_before_call, metric: "intent on disk before payment function", pass: full.intent_before_call && !noIntent.intent_before_call },
  { name: "manifest signature rejection", full: checked.overall, removed: weakened.overall, metric: "tampered record with recomputed inventory", pass: checked.overall === "failed" && weakened.overall === "incomplete" },
];
const report = { at: new Date().toISOString(), controls, ai,
  source_hashes: { recorder: hash(sdk), snapshot: hash(snapshot) },
  experiment_directory: temp, real_payments: false, runtime_switches_added: false,
  scope: "Controlled local software ablations. No power-loss, TEE or chain-removal experiment claimed." };
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2));
console.log({ controls, ai: { status: ai.status, cases: ai.cases, model_correct: ai.model_correct, rules_correct: ai.rules_correct }, report: output });
if (!controls.every(r => r.pass)) process.exitCode = 1;
