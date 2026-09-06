import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  cpSync,
  mkdtempSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { parse } from "dotenv";
import { privateKeyToAccount } from "viem/accounts";
import { parseEther, type Hex } from "viem";
import {
  clients,
  ensureTestnet,
  gas,
  confirmed,
  tokenAbi,
} from "../packages/chain/src/index.ts";
import { build } from "esbuild";
const demo = process.argv.includes("--demo");
if (demo && !process.stdin.isTTY) throw Error("DEMO_REQUIRES_INTERACTIVE_TERMINAL");
const sdk = resolve(process.argv.find(a => a.startsWith("--sdk="))?.slice(6)
  || "dist/afr-recorder-0.2.0-beta.1.tgz");
const sdkSha256 = createHash("sha256").update(readFileSync(sdk)).digest("hex");
const g = parse(readFileSync(".secrets/gateway.env")),
  d = parse(readFileSync(".secrets/deployer.env")),
  u = parse(readFileSync(".secrets/test-user.env")),
  contracts = JSON.parse(
    readFileSync("deployments/injective-testnet.json", "utf8"),
  ).contracts;
const owner = privateKeyToAccount(
    (d.DEPLOYER_PK!.startsWith("0x")
      ? d.DEPLOYER_PK
      : "0x" + d.DEPLOYER_PK) as Hex,
  ),
  user = privateKeyToAccount(u.TEST_USER_PK as Hex),
  { publicClient: p, wallet } = clients(owner);
await ensureTestnet(p);
if ((await p.getBalance({ address: user.address })) < parseEther("0.005")) {
  if (demo) throw Error("DEMO_TEST_GAS_LOW_PREPARE_BEFORE_RECORDING");
  await confirmed(
    p,
    await wallet!.sendTransaction({
      to: user.address,
      value: parseEther("0.02"),
      ...gas,
    }),
  );
}
if (
  (await p.readContract({
    address: contracts.AFRTestUSD,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: [user.address],
  })) < parseEther("0.1")
) {
  if (demo) throw Error("DEMO_TEST_TOKEN_LOW_PREPARE_BEFORE_RECORDING");
  await confirmed(
    p,
    await wallet!.writeContract({
      address: contracts.AFRTestUSD,
      abi: tokenAbi,
      functionName: "mint",
      args: [user.address, parseEther("1")],
      ...gas,
    }),
  );
}
const login = await fetch("http://127.0.0.1:4311/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ role: "operator", password: g.OPERATOR_PASSWORD }),
});
if (!login.ok || !login.headers.get("set-cookie")) throw Error("OPERATOR_LOGIN_FAILED");
const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
const response = await fetch("http://127.0.0.1:4311/integrations", {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie },
  body: JSON.stringify({ name: demo ? "BLACK BOX · 三分钟实录" : "独立采购 Agent · 实测" }),
});
if (!response.ok) throw Error("INTEGRATION_CREATE_FAILED");
const agent: any = await response.json();
const root = mkdtempSync(tmpdir() + "/afr-external-agent-");
writeFileSync(
  root + "/package.json",
  JSON.stringify({ private: true, type: "module" }),
);
execFileSync(
  "npm",
  [
    "install",
    "--ignore-scripts",
    sdk,
    "viem@2.56.3",
  ],
  { cwd: root, stdio: "pipe" },
);
await build({
  entryPoints: ["examples/external-agent.ts"],
  outfile: root + "/agent.mjs",
  bundle: false,
  format: "esm",
  platform: "node",
  target: "node22",
});
const run = (demo ? "demo_" : "qa_") + Date.now(),
  output = process.cwd() + "/runs/" + (demo ? "video-" : "beta-external-") + run;
mkdirSync(output, { recursive: true });
const session = {
  case_id: "rec_" + agent.id + "_" + run,
  output, cold_project: root, sdk, sdk_sha256: sdkSha256,
  source_sha256: createHash("sha256").update(readFileSync("examples/external-agent.ts")).digest("hex"),
  model: g.AI_MODEL, chain_id: 1439, amount: "0.01 AFR-TEST-USD",
  scope: "Real model and testnet transfer; synthetic order; deliberately injected application error. Existing local gateway, installed SDK artifact.",
};
writeFileSync(output + "/SESSION.json", JSON.stringify(session, null, 2));
if (demo) {
  writeFileSync("runs/DEMO-LATEST.json", JSON.stringify(session, null, 2));
  console.log("BLACK BOX — 真实运行录制\n测试网资产 / 合成订单 / 人为注入应用异常");
  console.log("工作台：http://127.0.0.1:4310\n运行：" + run + "\n记录：" + session.case_id + "\n输出：" + output);
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await prompt.question("环境已准备。输入 start 并回车，启动模型和一笔 0.01 测试资产付款： ");
    if (answer.trim() !== "start") throw Error("DEMO_CANCELLED_BEFORE_PAYMENT");
  } finally { prompt.close(); }
}
const result = spawnSync(process.execPath, [root + "/agent.mjs"], {
  cwd: root,
  env: {
    PATH: process.env.PATH,
    AFR_AGENT_ID: agent.id,
    AFR_RUN_ID: run,
    AFR_TOKEN: agent.token,
    PAYMENT_KEY: u.TEST_USER_PK,
    TEST_TOKEN: contracts.AFRTestUSD,
    PAYEE: "0x000000000000000000000000000000000000aF12",
    AI_BASE_URL: g.AI_BASE_URL,
    AI_API_KEY: g.AI_API_KEY,
    AI_MODEL: g.AI_MODEL,
    OUTPUT_DIR: output,
    AFR_DEMO_PAUSE: demo ? "1" : "0",
  },
  stdio: demo ? "inherit" : "pipe",
  encoding: "utf8",
  timeout: demo ? 900000 : 300000,
});
if (!demo) writeFileSync(output + "/process.log", result.stdout + "\n" + result.stderr);
writeFileSync(output + "/PROCESS.json", JSON.stringify({ exit_code: result.status, signal: result.signal, error: result.error?.message || null }, null, 2));
if (!demo)
writeFileSync(
  "runs/BETA-LATEST.json",
  JSON.stringify(
    {
      case_id: "rec_" + agent.id + "_" + run,
      output,
      cold_project: root,
      exit_code: result.status,
    },
    null,
    2,
  ),
);
console.log({ exit_code: result.status, output });
if (result.status !== 0) throw Error("EXTERNAL_AGENT_CHECK_FAILED");
console.log(readFileSync(output + "/RESULT.json", "utf8"));
