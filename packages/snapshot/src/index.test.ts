import { it, expect } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { makeSnapshot, verifySnapshot } from "./index.ts";
import {
  unpack,
  pack,
  strictJson,
  canonical,
  digest,
} from "../../core/src/index.ts";
const account = privateKeyToAccount(generatePrivateKey());
const trust = {
  repo: { url: "urn:local", commit: "test" },
  signers: [
    {
      key_id: "gateway-demo-1",
      role: "gateway",
      address: account.address,
      status: "active",
      valid_from: "2020-01-01T00:00:00Z",
      valid_to: null,
    },
  ],
  chain: { default_rpc: "http://127.0.0.1:1", confirmation_depth: 1 },
  contracts: { test_token: { address: account.address } },
};
it("exports unsigned-authorization and pre-review evidence without implying finality", async () => {
  const p = await makeSnapshot(
    account,
    { id: "draft", gaps: ["Authorization unsigned"], receipts: [], events: [] },
    1,
    null,
  );
  const r = await verifySnapshot(p.bytes, trust, { offline: true });
  expect(r.overall).toBe("incomplete");
  expect(r.checks.find((c: any) => c.id === "MANIFEST_SIG").status).toBe(
    "Pass",
  );
});
it("rejects changed evidence, rehashed inventory and wrong disclosed set", async () => {
  const p = await makeSnapshot(
    account,
    { id: "draft", gaps: [], receipts: [] },
    1,
    null,
  );
  const files = unpack(p.bytes);
  files["record.json"] = canonical({
    id: "draft",
    gaps: [],
    receipts: [],
    forged: true,
  });
  expect((await verifySnapshot(pack(files), trust)).overall).toBe("failed");
  const m = strictJson(files["manifest.json"]!);
  m.files.find((f: any) => f.path === "record.json").sha256 = digest(
    strictJson(files["record.json"]!),
  );
  m.files.find((f: any) => f.path === "record.json").bytes =
    files["record.json"]!.length;
  files["manifest.json"] = canonical(m);
  expect(
    (await verifySnapshot(pack(files), trust)).checks.find(
      (c: any) => c.id === "MANIFEST_SIG",
    ).status,
  ).toBe("Fail");
  expect(
    (await verifySnapshot(p.bytes, trust, { expectSet: "public" })).overall,
  ).toBe("failed");
});
