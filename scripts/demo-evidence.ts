/** Recording aid: invoke the shipped verifier on an actual download, then a disposable tampered copy. */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { resolve, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { unzipSync, zipSync, strToU8 } from "fflate";

const packetArg = process.argv[2];
if (!packetArg || packetArg.startsWith("--")) throw Error("Usage: pnpm exec tsx scripts/demo-evidence.ts <download.zip> [--cli=/path/afr-verify.mjs] [--offline]");
const packet = resolve(packetArg);
const cli = resolve(process.argv.find(a => a.startsWith("--cli="))?.slice(6) || "dist/afr-verify/afr-verify.mjs");
const offline = process.argv.includes("--offline");
const bytes = readFileSync(packet);
const sha256 = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
mkdirSync("runs", { recursive: true });
const out = mkdtempSync(resolve("runs/demo-verify-") );
const original = out + "/original.zip";
writeFileSync(original, bytes, { flag: "wx" });
function check(file: string, name: string, forceOffline = false) {
  const args = [cli, file, "--json", ...(offline || forceOffline ? ["--offline"] : [])];
  const processResult = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 90000 });
  writeFileSync(out + "/" + name + ".stdout.json", processResult.stdout || "");
  writeFileSync(out + "/" + name + ".stderr.txt", processResult.stderr || "");
  if (processResult.error || ![0, 1, 2, 3].includes(processResult.status ?? -1))
    throw Error("VERIFIER_EXECUTION_FAILED: " + name);
  const result = JSON.parse(processResult.stdout);
  console.log(`\n${name === "original" ? "原始证据" : "篡改副本"} · ${result.overall}`);
  for (const c of result.checks) console.log(`${c.status.padEnd(11)} ${c.id}`);
  return { ...result, cli_exit_code: processResult.status, invocation: [process.execPath, ...args] };
}
console.log("BLACK BOX · 独立核验\n下载文件：" + basename(packet));
console.log("原始 SHA-256：" + sha256(bytes));
const valid = check(original, "original");
const status = (r: any, id: string) => r.checks.find((c: any) => c.id === id)?.status;
if (valid.overall === "failed" || ["FORMAT", "INTEGRITY", "MANIFEST_SIG", "SIGNER_TRUST"].some(id => status(valid, id) !== "Pass"))
  throw Error("ORIGINAL_EVIDENCE_DID_NOT_PASS_FILE_AND_SIGNATURE_CHECKS");
if (!offline && !valid.checks.some((c: any) => c.id.startsWith("RECEIPT_") && c.status === "Pass"))
  throw Error("NO_CONFIRMED_CHAIN_RECEIPT_USE_OFFLINE_FOR_UNRECONCILED_SNAPSHOT");
if (valid.overall === "incomplete") console.log("说明：这是当前记录快照；最终锚定等未提供项仍标为 Not Present，整体不会显示全项通过。");

const files = unzipSync(bytes);
if (!files["record.json"]) throw Error("DEMO_REQUIRES_SNAPSHOT_RECORD_JSON");
const text = Buffer.from(files["record.json"]).toString("utf8");
const record = JSON.parse(text);
if (typeof record.agent_run_id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(record.agent_run_id)) throw Error("DEMO_RUN_ID_MISSING");
const changedRunId = (record.agent_run_id[0] === "x" ? "y" : "x") + record.agent_run_id.slice(1);
const needle = JSON.stringify(record.agent_run_id);
if (!text.includes(needle)) throw Error("DEMO_RUN_ID_NOT_FOUND");
files["record.json"] = strToU8(text.replace(needle, JSON.stringify(changedRunId)));
const bad = zipSync(files);
const changed = out + "/tampered.zip";
writeFileSync(changed, bad, { flag: "wx" });
console.log("\n在副本 record.json 的运行编号中替换一个字符；原始文件保持原样。");
// Integrity rejection is local. Avoid another RPC call for a deliberately invalid artifact.
const invalid = check(changed, "tampered", true);
const report = {
  at: new Date().toISOString(), input: packet, original_sha256: sha256(bytes),
  tampered_sha256: sha256(bad), cli_sha256: sha256(readFileSync(cli)),
  original: valid, tampered: invalid, output: out,
  scope: "Real downloaded snapshot. Original verification mode is explicit in invocation; modified copy is checked offline. No payments, model calls, or original-file edits.",
};
writeFileSync(out + "/RESULT.json", JSON.stringify(report, null, 2));
// The snapshot verifier groups malformed inventories and byte-digest mismatches under FORMAT.
if (invalid.overall !== "failed" || !["FORMAT", "INTEGRITY"].some(id => status(invalid, id) === "Fail")) throw Error("TAMPER_WAS_NOT_REJECTED");
console.log("\n已发现副本被修改。原始证据保留。\n本次核验记录：" + out);
