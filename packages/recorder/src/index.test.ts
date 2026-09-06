import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRecorder } from "./index.ts";
import { recorderService } from "../../../apps/gateway/src/recorder.ts";
const setup = () => {
  const directory = mkdtempSync(tmpdir() + "/afr-sdk-");
  return { directory, agentId: "agent_test", runId: "run_1" };
};
describe("durable payment boundary", () => {
  it("records before the real side effect and refuses duplicate execution across reopen", async () => {
    const options = setup();
    let calls = 0;
    let r = createRecorder(options);
    const invoke = () =>
      r.wrapPayment(
        async () => {
          calls++;
          expect(
            readFileSync(
              options.directory + "/agent_test/run_1/events.jsonl",
              "utf8",
            ),
          ).toContain("payment_requested");
          return { tx: "receipt" };
        },
        {
          operationId: () => "order_1",
          request: () => ({ amount: "1", api_key: "do-not-record" }),
          result: (x) => x,
        },
      )(undefined);
    await invoke();
    r.close();
    r = createRecorder(options);
    await expect(invoke()).rejects.toThrow("RECONCILE_FIRST");
    expect(calls).toBe(1);
    expect(JSON.stringify(r.events())).not.toContain("do-not-record");
    r.close();
    rmSync(options.directory, { recursive: true });
  });
  it("ambiguous result remains unknown and cannot silently execute again", async () => {
    const o = setup(),
      r = createRecorder(o);
    const pay = r.wrapPayment(
      async () => {
        throw Error("provider token secret");
      },
      {
        operationId: () => "order_2",
        request: () => ({ amount: "1" }),
        result: (x) => x,
      },
    );
    await expect(pay(undefined)).rejects.toThrow("PAYMENT_OUTCOME_UNKNOWN");
    expect(r.events().at(-1)?.kind).toBe("payment_unknown");
    await expect(pay(undefined)).rejects.toThrow("RECONCILE_FIRST");
    expect(JSON.stringify(r.events())).not.toContain("provider token secret");
    r.close();
    rmSync(o.directory, { recursive: true });
  });
  it("prevents two writers sharing a run", () => {
    const o = setup(),
      r = createRecorder(o);
    expect(() => createRecorder(o)).toThrow("ALREADY_OPEN");
    r.close();
    rmSync(o.directory, { recursive: true });
  });
  it("does not execute payment after recorder is closed", async () => {
    const o = setup(),
      r = createRecorder(o);
    r.close();
    let called = false;
    const pay = r.wrapPayment(
      async () => {
        called = true;
      },
      { operationId: () => "order_3", request: () => ({}), result: () => ({}) },
    );
    await expect(pay(undefined)).rejects.toThrow("CLOSED");
    expect(called).toBe(false);
    rmSync(o.directory, { recursive: true });
  });
});
describe("collector authorization and batch integrity", () => {
  it("deduplicates replay and rejects gaps, altered history and revoked tokens", () => {
    const rows = new Map<string, any>();
    const svc = recorderService({
      get: (id) => structuredClone(rows.get(id)),
      list: () => [...rows.values()].map((v) => structuredClone(v)),
      put: (v) => rows.set(v.id, structuredClone(v)),
    });
    const a = svc.create("My agent"),
      b = svc.create("Another agent");
    const o = { ...setup(), agentId: a.id };
    const r = createRecorder(o);
    r.record("order", { order_id: "order_1" });
    const events = r.events();
    expect(svc.accept(a.token, o.runId, { events }).accepted).toBe(2);
    expect(svc.accept(a.token, o.runId, { events }).accepted).toBe(2);
    expect(() => svc.accept(b.token, o.runId, { events })).toThrow(
      "RUN_BINDING",
    );
    expect(() =>
      svc.accept(a.token, "fresh", { events: events.slice(1) }),
    ).toThrow("GAP");
    const bad = structuredClone(events);
    bad[0]!.data.agent_id = "changed";
    expect(() => svc.accept(a.token, o.runId, { events: bad })).toThrow(
      "INVALID_EVENT",
    );
    svc.revoke(a.id);
    expect(() => svc.accept(a.token, o.runId, { events })).toThrow("TOKEN");
    r.close();
    rmSync(o.directory, { recursive: true });
  });
});
