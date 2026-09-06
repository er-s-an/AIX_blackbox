import { readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";
import { privateKeyToAccount } from "viem/accounts";
import { verify } from "../packages/verifier-cli/src/index.ts";
import { hash } from "../packages/core/src/index.ts";
const env = parse(readFileSync(".secrets/gateway.env"));
const rows: any[] = [];
let cookie = "";
async function call(path: string, body?: any, token?: string) {
  const r = await fetch("http://127.0.0.1:4311" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : { cookie }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (r.headers.get("set-cookie"))
    cookie = r.headers.get("set-cookie")!.split(";")[0]!;
  return r;
}
function check(name: string, pass: boolean, detail?: any) {
  rows.push({ name, pass, detail });
  if (!pass) throw Error("BETA_CHECK_FAILED:" + name);
}
await call("/login", { role: "user", password: env.USER_PASSWORD });
const agent: any = await (
  await call("/integrations", { name: "权限与重传验证" })
).json();
check(
  "Token cannot read workspace",
  (await call("/cases", undefined, agent.token)).status === 401,
);
const start = {
  seq: 1,
  at: new Date().toISOString(),
  kind: "run_started",
  operation_id: null,
  data: { agent_id: agent.id, run_id: "api_boundary" },
  previous: null,
};
const { digest } = await import("../packages/core/src/index.ts");
const event = { ...start, hash: digest(start) };
check(
  "Scoped SDK upload accepted",
  (
    await call(
      "/recorder/runs/api_boundary/events",
      { events: [event] },
      agent.token,
    )
  ).status === 200,
);
const replay: any = await (
  await call(
    "/recorder/runs/api_boundary/events",
    { events: [event] },
    agent.token,
  )
).json();
check("Replay remains one event", replay.accepted === 1);
const bad = await call(
  "/recorder/runs/api_boundary/events",
  { events: [{ ...event, seq: 3 }] },
  agent.token,
);
check("Altered sequence rejected", bad.status === 409);
check(
  "Unknown token rejected",
  (
    await call(
      "/recorder/runs/api_boundary/events",
      { events: [event] },
      "invalid",
    )
  ).status === 401,
);
check(
  "User cannot revoke",
  (await call("/integrations/" + agent.id + "/revoke", {})).status === 403,
);
const user = privateKeyToAccount(
  parse(readFileSync(".secrets/test-user.env")).TEST_USER_PK as `0x${string}`,
);
const draft: any = await (
  await call("/cases", { mode: "normal", signer: user.address })
).json();
const snap: any = await (
  await call("/cases/" + draft.id + "/snapshot", {})
).json();
check(
  "Draft can export without signature, payment, AI or decision",
  snap.snapshots.length === 1,
);
const bytes = new Uint8Array(
  await (
    await call("/cases/" + draft.id + "/packet?set=snapshot&version=1")
  ).arrayBuffer(),
);
const verified = await verify(bytes, { offline: true });
check("Draft snapshot honestly incomplete", verified.overall === "incomplete");
const second: any = await (
  await call("/cases/" + draft.id + "/snapshot", {})
).json();
check("Second snapshot preserves old version", second.snapshots.length === 2);
const old = new Uint8Array(
  await (
    await call("/cases/" + draft.id + "/packet?set=snapshot&version=1")
  ).arrayBuffer(),
);
check("Old downloaded bytes unchanged", hash(old) === hash(bytes));
await call("/login", { role: "operator", password: env.OPERATOR_PASSWORD });
await call("/integrations/" + agent.id + "/revoke", {});
check(
  "Revoked token rejected",
  (
    await call(
      "/recorder/runs/api_boundary/events",
      { events: [event] },
      agent.token,
    )
  ).status === 401,
);
writeFileSync(
  "runs/beta-api-check.json",
  JSON.stringify({ at: new Date().toISOString(), rows }, null, 2),
);
console.log(rows.map((x) => ({ name: x.name, pass: x.pass })));
