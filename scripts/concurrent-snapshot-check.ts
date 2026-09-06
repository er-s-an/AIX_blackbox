import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";
import { privateKeyToAccount } from "viem/accounts";
const e = parse(readFileSync(".secrets/gateway.env"));
let cookie = "";
async function call(path: string, body?: any) {
  const r = await fetch("http://127.0.0.1:4311" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", cookie },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(180000),
  });
  if (r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie")!.split(";")[0]!;
  const data: any = await r.json();
  if (!r.ok) throw Error(data.error);
  return data;
}
await call("/login", { role: "operator", password: e.OPERATOR_PASSWORD });
const user = privateKeyToAccount(
  parse(readFileSync(".secrets/test-user.env")).TEST_USER_PK as `0x${string}`,
);
const c = await call("/cases", { mode: "normal", signer: user.address });
await call("/cases/" + c.id + "/authorize", {
  signature: await user.signTypedData(c.typed_data),
  signer: user.address,
});
let completed = false;
const purchase = call("/cases/" + c.id + "/purchase", {}).finally(() => {
  completed = true;
});
await new Promise((r) => setTimeout(r, 300));
const before = Date.now(),
  mid = await call("/cases/" + c.id + "/snapshot", {});
const during = !completed;
const elapsed = Date.now() - before;
await purchase;
const latest = await call("/cases/" + c.id);
const result = {
  at: new Date().toISOString(),
  id: c.id,
  exported_while_purchase_running: during,
  snapshot_ms: elapsed,
  mid_status: mid.status,
  final_status: latest.status,
  snapshot_survived_long_operation: latest.snapshots?.length === 1,
  source:
    "Real authorization anchor and model purchase, overlapping snapshot request",
};
writeFileSync(
  "runs/beta-concurrent-snapshot.json",
  JSON.stringify(result, null, 2),
);
console.log(result);
if (!during || !result.snapshot_survived_long_operation)
  throw Error("CONCURRENT_SNAPSHOT_FAILED");
