import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { parse } from "dotenv";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { randomHex } from "../packages/core/src/index.ts";
const source = process.env.AFR_SOURCE_ENV || "";
const recorderOnly = process.argv.includes("--recorder-only");
if (recorderOnly && existsSync(".runtime/cases.sqlite"))
  throw Error("RECORDER_SETUP_REQUIRES_FRESH_WORKSPACE");
const existing = existsSync(source) ? parse(readFileSync(source)) : {};
mkdirSync(".secrets", { recursive: true, mode: 0o700 });
chmodSync(".secrets", 0o700);
function put(name: string, data: Record<string, string>) {
  const path = ".secrets/" + name + ".env";
  if (existsSync(path)) return;
  writeFileSync(
    path,
    Object.entries(data)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
}
const gateway = generatePrivateKey(),
  operator = generatePrivateKey(),
  verifier = generatePrivateKey(),
  user = generatePrivateKey();
const sourceKey =
  existing.DEPLOYER_PK || existing.BUYER_B_KEY || process.env.DEPLOYER_PK;
if (sourceKey)
  put("deployer", {
    DEPLOYER_PK: sourceKey,
    RPC_URL: "https://k8s.testnet.json-rpc.injective.network/",
  });
put("gateway", {
  GATEWAY_PK: gateway,
  STORAGE_KEY: randomHex(32),
  SESSION_SECRET: randomHex(32),
  OPERATOR_PASSWORD: randomHex(16),
  USER_PASSWORD: randomHex(16),
  VERIFIER_SERVICE_TOKEN: randomHex(32),
  OPERATOR_SERVICE_TOKEN: randomHex(32),
  AI_BASE_URL: existing.AI_BASE_URL || "",
  AI_API_KEY: existing.AI_API_KEY || "",
  AI_MODEL: existing.AI_MODEL || existing.AI_MODEL_ANALYSIS || "",
  AI_MODEL_AGENT: existing.AI_MODEL_AGENT || existing.AI_MODEL || "",
  RPC_URL: "https://k8s.testnet.json-rpc.injective.network/",
});
const g = parse(readFileSync(".secrets/gateway.env"));
put("verifier", {
  VERIFIER_PK: verifier,
  SERVICE_TOKEN: g.VERIFIER_SERVICE_TOKEN!,
});
put("operator", {
  OPERATOR_PK: operator,
  SERVICE_TOKEN: g.OPERATOR_SERVICE_TOKEN!,
  RPC_URL: "https://k8s.testnet.json-rpc.injective.network/",
});
put("test-user", { TEST_USER_PK: user });
if (recorderOnly) {
  const trustPath = "packages/verifier-cli/trust/trusted_signers.json";
  const trust = JSON.parse(readFileSync(trustPath, "utf8"));
  const now = new Date().toISOString();
  const key = (file: string, name: string) =>
    privateKeyToAccount(
      parse(readFileSync(".secrets/" + file + ".env"))[name] as `0x${string}`,
    ).address.toLowerCase();
  for (const signer of trust.signers) {
    if (signer.role === "gateway")
      signer.address = key("gateway", "GATEWAY_PK");
    else if (signer.role === "operator")
      signer.address = key("operator", "OPERATOR_PK");
    else if (signer.role === "verifier")
      signer.address = key("verifier", "VERIFIER_PK");
    signer.valid_from = now;
    signer.valid_to = new Date(Date.now() + 365 * 24 * 3600000).toISOString();
    signer.status = "active";
  }
  trust.published_at = now;
  trust.repo.url = "urn:afr:local-recorder-instance";
  trust.repo.dirty = true;
  writeFileSync(trustPath, JSON.stringify(trust, null, 2) + "\n");
  console.log(
    "Recorder-only instance trust prepared. Build your instance CLI before sharing evidence; no contracts deployed or funds sent.",
  );
}
console.log(
  "Local service credentials prepared (0600). Existing files preserved. No keys printed.",
);
if (!existsSync(".secrets/deployer.env"))
  console.log(
    "Deployment credential not configured. Set AFR_SOURCE_ENV to your private env containing DEPLOYER_PK before deployment.",
  );
