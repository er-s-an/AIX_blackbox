import { it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRecorder } from "./index.ts";
import { digest } from "../../core/src/index.ts";
import { recorderService } from "../../../apps/gateway/src/recorder.ts";

it("stops payment before exhausting space for its outcome and reconciliation", async () => {
  const directory = mkdtempSync(tmpdir() + "/afr-limit-test-");
  const dir = directory + "/agent_test/run_1";
  mkdirSync(dir, { recursive: true });
  const events: any[] = [];
  for (let i = 0; i < 1999; i++) {
    const body = { seq: i + 1, at: "2026-09-06T00:00:00Z",
      kind: i ? "order" : "run_started", operation_id: null,
      data: i ? {} : { agent_id: "agent_test", run_id: "run_1" },
      previous: events.at(-1)?.hash || null };
    events.push({ ...body, hash: digest(body) });
  }
  writeFileSync(dir + "/events.jsonl", events.map(e => JSON.stringify(e)).join("\n") + "\n");
  const r = createRecorder({ directory, agentId: "agent_test", runId: "run_1" });
  let calls = 0;
  try {
    const pay = r.wrapPayment(async () => { calls++; return {}; }, {
      operationId: () => "last_order", request: () => ({}), result: x => x,
    });
    await expect(pay(undefined)).rejects.toThrow("RUN_RECORD_LIMIT");
    expect(calls).toBe(0);
  } finally { r.close(); rmSync(directory, { recursive: true, force: true }); }
});

it("enforces the documented event size limit on direct collector uploads", () => {
  const rows = new Map<string, any>();
  const svc = recorderService({ get: id => structuredClone(rows.get(id)),
    list: () => [...rows.values()].map(v => structuredClone(v)),
    put: v => rows.set(v.id, structuredClone(v)) });
  const agent = svc.create("Size boundary");
  const body = { seq: 1, at: "2026-09-06T00:00:00Z", kind: "run_started",
    operation_id: null, previous: null,
    data: { agent_id: agent.id, run_id: "large", text: "x".repeat(128000) } };
  expect(() => svc.accept(agent.token, "large", {
    events: [{ ...body, hash: digest(body) }],
  })).toThrow("EVENT_TOO_LARGE");
  expect(rows.size).toBe(1);
});
