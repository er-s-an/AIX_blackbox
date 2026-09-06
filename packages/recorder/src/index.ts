import {
  mkdirSync,
  readFileSync,
  existsSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { digest } from "../../core/src/index.ts";
export type RecordEvent = {
  seq: number;
  at: string;
  kind: string;
  operation_id: string | null;
  data: any;
  previous: string | null;
  hash: string;
};
export type RecorderOptions = {
  directory: string;
  agentId: string;
  runId: string;
  endpoint?: string;
  token?: string;
};
const identifier = (s: string) => /^[a-zA-Z0-9_-]{1,80}$/.test(s);
const secretKey =
  /^(authorization|cookie|set-cookie|password|private_?key|api_?key|access_?token|secret|mnemonic|seed_phrase)$/i;
export function safeFields(value: any): any {
  if (value === undefined) return null;
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  )
    return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(safeFields);
  if (typeof value !== "object") throw Error("UNSUPPORTED_RECORD_VALUE");
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      secretKey.test(k) ? "[REDACTED]" : safeFields(v),
    ]),
  );
}
/** Node-only, single process per run. Record only explicitly mapped fields; arbitrary text may contain secrets. */
export function createRecorder(options: RecorderOptions) {
  if (!identifier(options.agentId) || !identifier(options.runId))
    throw Error("INVALID_RECORDER_ID");
  const dir = join(options.directory, options.agentId, options.runId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = join(dir, "writer.lock");
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch (e: any) {
      if (e.code === "ESRCH") alive = false;
    }
    if (alive) throw Error("RECORDER_ALREADY_OPEN");
    unlinkSync(lock);
  }
  const lockFd = openSync(lock, "wx", 0o600);
  writeSync(lockFd, String(process.pid));
  fsyncSync(lockFd);
  closeSync(lockFd);
  const path = join(dir, "events.jsonl");
  const events: RecordEvent[] = [];
  try {
    if (existsSync(path))
      for (const line of readFileSync(path, "utf8")
        .split("\n")
        .filter(Boolean)) {
        const e = JSON.parse(line);
        const { hash, ...body } = e;
        if (
          e.seq !== events.length + 1 ||
          e.previous !== (events.at(-1)?.hash || null) ||
          digest(body) !== hash
        )
          throw Error("SPOOL_INTEGRITY_FAILED");
        events.push(e);
      }
  } catch (e) {
    unlinkSync(lock);
    throw e;
  }
  const fd = openSync(path, "a", 0o600);
  let closed = false,
    active = false,
    totalBytes = Buffer.byteLength(
      events.map((e) => JSON.stringify(e) + "\n").join(""),
    );
  function append(kind: string, data: any, operation_id: string | null = null, reserve = 0) {
    if (closed) throw Error("RECORDER_CLOSED");
    const body = {
      seq: events.length + 1,
      at: new Date().toISOString(),
      kind,
      operation_id,
      data: safeFields(data),
      previous: events.at(-1)?.hash || null,
    };
    const e = { ...body, hash: digest(body) },
      bytes = Buffer.from(JSON.stringify(e) + "\n");
    if (bytes.length > 128000) throw Error("EVENT_TOO_LARGE");
    if (totalBytes + bytes.length + reserve * 128000 > 8 * 1024 * 1024 || events.length + 1 + reserve > 2000)
      throw Error("RUN_RECORD_LIMIT");
    let offset = 0;
    while (offset < bytes.length)
      offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
    events.push(e);
    totalBytes += bytes.length;
    return e;
  }
  if (!events.length)
    append("run_started", {
      agent_id: options.agentId,
      run_id: options.runId,
      coverage: "wrapped_tools_only",
    });
  return {
    record: (
      kind:
        | "authorization"
        | "external_input"
        | "order"
        | "delivery"
        | "incident",
      data: any,
    ) => {
      if (active) throw Error("RECORDER_BUSY");
      return append(kind, data);
    },
    events: () => structuredClone(events),
    wrapPayment<A, R>(
      tool: (args: A) => Promise<R>,
      mapping: {
        operationId: (a: A) => string;
        request: (a: A) => any;
        result: (r: R) => any;
      },
    ) {
      return async (args: A): Promise<R> => {
        if (active) throw Error("RECORDER_BUSY");
        const id = mapping.operationId(args);
        if (!identifier(id)) throw Error("INVALID_OPERATION_ID");
        if (
          events.some(
            (e) => e.operation_id === id && e.kind === "payment_requested",
          )
        )
          throw Error("OPERATION_ALREADY_RECORDED_RECONCILE_FIRST");
        const request = mapping.request(args);
        active = true;
        try {
          // Reserve an outcome and a reconciliation record before any side effect.
          append("payment_requested", request, id, 2);
          let result: R;
          try {
            result = await tool(args);
          } catch {
            append(
              "payment_unknown",
              {
                reason:
                  "Tool threw; payment may have executed. Query the original provider before any retry.",
              },
              id,
            );
            throw Error("PAYMENT_OUTCOME_UNKNOWN");
          }
          try {
            append("payment_result", mapping.result(result), id);
          } catch {
            throw Error("PAYMENT_EXECUTED_RECORD_INCOMPLETE_RECONCILE_FIRST");
          }
          return result;
        } finally {
          active = false;
        }
      };
    },
    reconcile(operationId: string, receipt: any) {
      if (active) throw Error("RECORDER_BUSY");
      if (
        !events.some(
          (e) =>
            e.operation_id === operationId && e.kind === "payment_requested",
        )
      )
        throw Error("UNKNOWN_OPERATION");
      return append("payment_reconciled", { receipt }, operationId);
    },
    async sync() {
      if (!options.endpoint || !options.token)
        throw Error("RECORDER_SYNC_NOT_CONFIGURED");
      const url = new URL(options.endpoint);
      if (
        url.protocol !== "https:" &&
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )
        throw Error("HTTPS_REQUIRED");
      const batch = structuredClone(events);
      let accepted = 0;
      for (let start = 0; start < batch.length; ) {
        const chunk: RecordEvent[] = [];
        let size = 0;
        while (start < batch.length && chunk.length < 40) {
          const next = batch[start]!;
          const length = Buffer.byteLength(JSON.stringify(next));
          if (chunk.length && size + length > 800000) break;
          chunk.push(next);
          size += length;
          start++;
        }
        const response = await fetch(
          new URL("/recorder/runs/" + options.runId + "/events", url),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + options.token,
            },
            body: JSON.stringify({ events: chunk }),
            signal: AbortSignal.timeout(15000),
          },
        );
        if (!response.ok) throw Error("RECORDER_SYNC_" + response.status);
        accepted = ((await response.json()) as any).accepted;
      }
      return { accepted };
    },
    close() {
      if (active) throw Error("RECORDER_BUSY");
      if (!closed) {
        fsyncSync(fd);
        closeSync(fd);
        unlinkSync(lock);
        closed = true;
      }
    },
  };
}
