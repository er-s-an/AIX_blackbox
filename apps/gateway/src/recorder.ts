import { createHash, randomBytes } from "node:crypto";
import { digest } from "../../../packages/core/src/index.ts";
import type { RecordEvent } from "../../../packages/recorder/src/index.ts";
const idPattern = /^[a-zA-Z0-9_-]{1,80}$/;
export function recorderService(db: {
  get: (id: string) => any;
  list: () => any[];
  put: (v: any) => void;
}) {
  const publicAgent = (a: any) => ({
    id: a.agent_id,
    name: a.name,
    created_at: a.created_at,
    last_event_at: a.last_event_at,
    revoked: !!a.revoked,
  });
  return {
    agents: () =>
      db
        .list()
        .filter((c) => c.kind === "integration")
        .map(publicAgent),
    create(name: string) {
      if (typeof name !== "string" || !name.trim() || name.length > 80)
        throw Error("INVALID_AGENT_NAME");
      const id = "agent_" + randomBytes(8).toString("hex"),
        token = "afr_" + randomBytes(32).toString("hex");
      const c = {
        id: "integration_" + id,
        kind: "integration",
        agent_id: id,
        name: name.trim(),
        token_hash: createHash("sha256").update(token).digest("hex"),
        created_at: new Date().toISOString(),
        last_event_at: null,
      };
      db.put(c);
      return { ...publicAgent(c), token };
    },
    revoke(id: string) {
      const a = db.get("integration_" + id);
      if (!a) throw Error("AGENT_NOT_FOUND");
      a.revoked = true;
      db.put(a);
      return { ok: true };
    },
    accept(token: string, runId: string, input: any) {
      if (!idPattern.test(runId)) throw Error("INVALID_RUN_ID");
      const key = createHash("sha256").update(token).digest("hex");
      const a = db
        .list()
        .find(
          (c) => c.kind === "integration" && c.token_hash === key && !c.revoked,
        );
      if (!a) throw Error("INVALID_RECORDER_TOKEN");
      if (
        !Array.isArray(input?.events) ||
        !input.events.length ||
        input.events.length > 40
      )
        throw Error("INVALID_EVENT_BATCH");
      const id = "rec_" + a.agent_id + "_" + runId;
      const c = db.get(id) || {
        id,
        kind: "recording",
        agent_id: a.agent_id,
        agent_name: a.name,
        agent_run_id: runId,
        mode: "external",
        source: "agent-reported",
        status: "Recording",
        protection: "Recording only",
        ai_status: "Not configured for this source",
        created_at: new Date().toISOString(),
        events: [],
        timeline: [],
        evidence: [],
        versions: [],
        snapshots: [],
        claim_status: null,
      };
      for (const event of input.events as RecordEvent[]) {
        if (Buffer.byteLength(JSON.stringify(event) + "\n") > 128000)
          throw Error("EVENT_TOO_LARGE");
        const { hash, ...body } = event;
        if (
          Object.keys(event).sort().join(",") !==
            "at,data,hash,kind,operation_id,previous,seq" ||
          !Number.isInteger(event.seq) ||
          event.seq < 1 ||
          !Number.isFinite(Date.parse(event.at)) ||
          ![
            "run_started",
            "authorization",
            "external_input",
            "order",
            "delivery",
            "incident",
            "payment_requested",
            "payment_unknown",
            "payment_result",
            "payment_reconciled",
          ].includes(event.kind) ||
          !(
            event.operation_id === null ||
            (typeof event.operation_id === "string" &&
              idPattern.test(event.operation_id))
          ) ||
          digest(body) !== hash
        )
          throw Error("INVALID_EVENT");
        const prior = c.events[event.seq - 1];
        if (prior) {
          if (prior.hash !== hash) throw Error("EVENT_CONFLICT");
          continue;
        }
        if (
          event.seq !== c.events.length + 1 ||
          event.previous !== (c.events.at(-1)?.hash || null)
        )
          throw Error("EVENT_GAP");
        if (
          event.seq === 1 &&
          (event.kind !== "run_started" ||
            event.data.agent_id !== a.agent_id ||
            event.data.run_id !== runId)
        )
          throw Error("RUN_BINDING_MISMATCH");
        if (
          event.kind === "payment_requested" &&
          c.events.some(
            (e: RecordEvent) =>
              e.kind === "payment_requested" &&
              e.operation_id === event.operation_id,
          )
        )
          throw Error("DUPLICATE_OPERATION");
        if (
          ["payment_result", "payment_unknown", "payment_reconciled"].includes(
            event.kind,
          ) &&
          !c.events.some(
            (e: RecordEvent) =>
              e.kind === "payment_requested" &&
              e.operation_id === event.operation_id,
          )
        )
          throw Error("ORPHAN_RESULT");
        if (
          c.events.length >= 2000 ||
          Buffer.byteLength(JSON.stringify([...c.events, event])) >
            8 * 1024 * 1024
        )
          throw Error("RUN_EVENT_LIMIT");
        c.events.push(event);
        c.timeline.push({
          at: event.at,
          event: event.kind,
          detail: event.operation_id || "",
        });
      }
      const requests = c.events.filter(
        (e: RecordEvent) => e.kind === "payment_requested",
      );
      const unresolved = requests.some(
        (request: RecordEvent) =>
          !c.events.some(
            (e: RecordEvent) =>
              e.operation_id === request.operation_id &&
              ["payment_result", "payment_reconciled"].includes(e.kind),
          ),
      );
      c.status = unresolved
        ? "Needs attention"
        : requests.length
          ? "Recorded"
          : "Recording";
      c.incident = c.events.some(
        (e: RecordEvent) =>
          e.kind === "incident" || e.kind === "payment_unknown",
      );
      c.updated_at = new Date().toISOString();
      a.last_event_at = c.updated_at;
      db.put(c);
      db.put(a);
      return { id, accepted: c.events.length };
    },
  };
}
