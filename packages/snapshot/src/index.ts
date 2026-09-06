import { readFileSync } from "node:fs";
import { decodeEventLog, parseEther, type PrivateKeyAccount } from "viem";
import {
  canonical,
  digest,
  hash,
  pack,
  unpack,
  strictJson,
  signDigest,
  recoverDigest,
  sameAddress,
  randomHex,
  type Json,
} from "../../core/src/index.ts";
import { validate } from "../../core/src/schema.ts";
import { clients, ensureTestnet, tokenAbi } from "../../chain/src/index.ts";

export async function makeSnapshot(
  account: PrivateKeyAccount,
  record: Json,
  version: number,
  previous: string | null,
) {
  const files: Record<string, Uint8Array> = {
    "record.json": canonical(record),
    "README.md": new TextEncoder().encode(
      "Current evidence snapshot. Not a final claim packet. Sources and gaps are declared in record.json. No payout or insurance eligibility is established. Verify with an independently installed afr-verify.",
    ),
    "salt.txt": new TextEncoder().encode(randomHex()),
  };
  const manifest = {
    format_version: "afr-snapshot/1",
    snapshot_id: randomHex(),
    run_id: record.id,
    version,
    previous_commitment: previous,
    created_at: new Date().toISOString(),
    signer_key_id: "gateway-demo-1",
    disclosure_set_id: "full",
    scope: "collected_evidence_only",
    files: Object.keys(files)
      .sort()
      .map((path) => ({
        path,
        sha256: hash(files[path]!),
        bytes: files[path]!.length,
      })),
  };
  validate("snapshot", manifest);
  files["manifest.json"] = canonical(manifest);
  files["proofs/manifest.sig.json"] = canonical({
    key_id: manifest.signer_key_id,
    digest: digest(manifest),
    signature: await signDigest(account, digest(manifest)),
  });
  return { bytes: pack(files), manifest, commitment: digest(manifest) };
}

export async function verifySnapshot(
  bytes: Uint8Array,
  trust: Json,
  options: { offline?: boolean; rpc?: string; expectSet?: string } = {},
) {
  const checks: Json[] = [],
    warnings = [
      "Evidence snapshot, not a final claim packet. Unobserved activity and source truth cannot be established.",
    ];
  const check = (id: string, status: string, detail: string) =>
    checks.push({ id, status, detail, critical: true });
  const result: any = {
    format_version: "afr-verify/1",
    profile: "snapshot",
    verified_at: new Date().toISOString(),
    mode: options.offline ? "offline" : "online",
    trust_source: { repo_url: trust.repo.url, repo_commit: trust.repo.commit },
    checks,
    warnings,
    caps: [
      "Collector signature is a receipt of disclosed materials, not hardware attestation or proof of complete source capture.",
    ],
    packet: {},
    superseded: { packet: null, auth: null },
  };
  const finish = () => ({
    ...result,
    overall: checks.some((c) => c.status === "Fail") ? "failed" : "incomplete",
  });
  let files: Record<string, Uint8Array>, m: Json, r: Json;
  try {
    files = unpack(bytes);
    m = strictJson(files["manifest.json"]!);
    validate("snapshot", m);
    if (
      m.version === 1
        ? m.previous_commitment !== null
        : m.previous_commitment === null
    )
      throw Error("VERSION_LINK");
    const listed = new Set<string>();
    for (const f of m.files) {
      if (
        listed.has(f.path) ||
        ["manifest.json", "proofs/manifest.sig.json"].includes(f.path) ||
        !files[f.path] ||
        files[f.path]!.length !== f.bytes ||
        hash(files[f.path]!) !== f.sha256
      )
        throw Error("INVENTORY_MISMATCH");
      listed.add(f.path);
    }
    if (
      ["record.json", "README.md", "salt.txt"].some((p) => !listed.has(p)) ||
      Object.keys(files).some(
        (p) =>
          !listed.has(p) &&
          !["manifest.json", "proofs/manifest.sig.json"].includes(p),
      )
    )
      throw Error("INVENTORY_MISMATCH");
    r = strictJson(files["record.json"]!);
    if (
      r.id !== m.run_id ||
      !Array.isArray(r.gaps) ||
      !Array.isArray(r.receipts)
    )
      throw Error("RECORD_FORMAT");
    result.packet = {
      packet_id: m.snapshot_id,
      packet_version: m.version,
      disclosure_set_id: "full",
      commitment: digest(m),
    };
    check("FORMAT", "Pass", "Snapshot format and signed inventory accepted");
    check("INTEGRITY", "Pass", "Every disclosed byte matches the inventory");
  } catch {
    check(
      "FORMAT",
      "Fail",
      "Invalid snapshot format, file inventory or record",
    );
    return finish();
  }
  if (options.expectSet && options.expectSet !== "full")
    check(
      "DISCLOSURE",
      "Fail",
      "Snapshot disclosure does not match requested set",
    );
  try {
    const sig = strictJson(files["proofs/manifest.sig.json"]!);
    if (sig.key_id !== m.signer_key_id || sig.digest !== digest(m))
      throw Error();
    const address = await recoverDigest(digest(m), sig.signature);
    const registered = trust.signers.find(
      (s: Json) =>
        s.key_id === m.signer_key_id &&
        s.role === "gateway" &&
        sameAddress(address, s.address),
    );
    if (!registered) {
      check(
        "SIGNER_TRUST",
        "Unknown",
        "Collector is not registered in installation trust",
      );
    } else if (registered.status === "revoked") {
      check("SIGNER_TRUST", "Fail", "Collector key revoked");
    } else if (
      Date.parse(m.created_at) < Date.parse(registered.valid_from) ||
      (registered.valid_to &&
        Date.parse(m.created_at) > Date.parse(registered.valid_to))
    ) {
      check(
        "SIGNER_TRUST",
        "Unknown",
        "Collector key outside registered time window",
      );
    } else
      check(
        "SIGNER_TRUST",
        "Pass",
        `Signer: gateway/${m.signer_key_id} (per trusted_signers.json @ ${trust.repo.commit})`,
      );
    check("MANIFEST_SIG", "Pass", "Collector signed this inventory");
  } catch {
    check("MANIFEST_SIG", "Fail", "Manifest signature invalid");
  }
  check(
    "COMPLETENESS",
    "Not Present",
    r.gaps.join("; ") || "Interim evidence; no final adjudication",
  );
  check(
    "ANCHOR_PACKET",
    "Not Present",
    "Snapshot has no chain anchor; no pre-incident existence claim",
  );
  check("TEE_ATTESTATION", "Not Present", "Hardware attestation not provided");
  if (!r.receipts.length)
    check(
      "RECEIPT_PAYMENT",
      "Not Present",
      "No transaction reference collected",
    );
  const { publicClient: p } = clients(
    undefined,
    options.rpc || trust.chain.default_rpc,
  );
  for (const [i, receipt] of r.receipts.entries()) {
    const id = "RECEIPT_" + (i + 1);
    if (options.offline) {
      check(id, "Unknown", "Offline: transaction not queried");
      continue;
    }
    if (
      receipt.chain_id !== 1439 ||
      !sameAddress(receipt.asset || "", trust.contracts.test_token.address)
    ) {
      check(
        id,
        "Unknown",
        "Only configured testnet asset can be independently checked",
      );
      continue;
    }
    try {
      await ensureTestnet(p);
      const tx = await p.getTransactionReceipt({ hash: receipt.tx_hash });
      const head = await p.getBlockNumber();
      const match = tx.logs
        .filter((l) => sameAddress(l.address, receipt.asset))
        .some((l) => {
          try {
            const event = decodeEventLog({
              abi: tokenAbi,
              eventName: "Transfer",
              data: l.data,
              topics: l.topics,
            });
            return (
              sameAddress(event.args.from, receipt.from) &&
              sameAddress(event.args.to, receipt.to) &&
              event.args.value === parseEther(receipt.amount)
            );
          } catch {
            return false;
          }
        });
      check(
        id,
        tx.status === "success" &&
          match &&
          head - tx.blockNumber >= BigInt(trust.chain.confirmation_depth)
          ? "Pass"
          : "Fail",
        "Actual ERC-20 transfer compared with the collected fields",
      );
    } catch {
      check(id, "Unknown", "Transaction unavailable; no success inferred");
    }
  }
  return finish();
}
