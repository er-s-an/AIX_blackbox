import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import * as s from "./service.ts";
const streams = new Set<any>();
const webOrigin = process.env.AFR_WEB_ORIGIN || "http://localhost:4310";
const app = Fastify({
  logger: {
    level: "info",
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      'res.headers["set-cookie"]',
    ],
  },
  bodyLimit: 1024 * 1024,
  disableRequestLogging: true,
});
await app.register(cookie, { secret: s.env.SESSION_SECRET! });
await app.register(cors, {
  origin: webOrigin,
  credentials: true,
});
await app.register(helmet);
await app.register(rateLimit, { max: 180, timeWindow: "1 minute" });
app.setErrorHandler((e, req, reply) => {
  const code = (e as Error).message;
  const status = (e as { statusCode?: unknown }).statusCode;
  const safe = /^[A-Z0-9_]+$/.test(code) ? code : "REQUEST_FAILED";
  reply
    .code(safe === "CASE_NOT_FOUND" ? 404 :
      typeof status === "number" && status >= 400 && status < 500 ? status : 409)
    .send({ error: safe, request_id: req.id });
});
const role = (req: any) => {
  const raw = req.cookies.afr_session;
  if (!raw) return null;
  const token = req.unsignCookie(raw);
  if (!token.valid) return null;
  try {
    const value = JSON.parse(token.value);
    return value.expires > Date.now() ? value.role : null;
  } catch {
    return null;
  }
};
app.get("/health", async () => ({
  ok: true,
  network: 1439,
  synthetic: true,
  ai_configured: !!s.env.AI_API_KEY,
}));
app.post("/login", async (req, reply) => {
  const b = req.body as any;
  if (!["operator", "user"].includes(b?.role) || typeof b?.password !== "string")
    return reply.code(401).send({ error: "Unauthorized" });
  const expected = Buffer.from(
      s.env[b.role === "operator" ? "OPERATOR_PASSWORD" : "USER_PASSWORD"]!,
    ),
    got = Buffer.from(b.password);
  if (got.length !== expected.length || !timingSafeEqual(got, expected))
    return reply.code(401).send({ error: "Unauthorized" });
  reply.setCookie(
    "afr_session",
    JSON.stringify({ role: b.role, expires: Date.now() + 8 * 3600000 }),
    {
      signed: true,
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 3600,
    },
  );
  s.audit(b.role, "login");
  return { role: b.role };
});
app.post("/logout", async (_, reply) => {
  reply.clearCookie("afr_session", { path: "/" });
  return { ok: true };
});
app.addHook("preHandler", async (req, reply) => {
  if (
    ["/health", "/login", "/logout"].includes(req.url) ||
    /^\/recorder\/runs\/[a-zA-Z0-9_-]{1,80}\/events$/.test(req.url)
  )
    return;
  if (
    process.env.AFR_RECORDER_ONLY === "1" &&
    req.method !== "GET" &&
    !(
      req.url === "/integrations" ||
      /^\/integrations\/[^/]+\/revoke$/.test(req.url) ||
      /^\/cases\/[^/]+\/(snapshot|check)$/.test(req.url)
    )
  )
    return reply.code(409).send({ error: "RECORDER_ONLY_MODE" });
  if (!role(req)) return reply.code(401).send({ error: "Unauthorized" });
  if (
    req.method !== "GET" &&
    req.headers.origin &&
    req.headers.origin !== webOrigin
  )
    return reply.code(403).send({ error: "Origin rejected" });
});
app.get("/integrations", async () => s.recorder.agents());
app.post("/integrations", async (req) =>
  s.recorder.create((req.body as any)?.name),
);
app.post("/integrations/:id/revoke", async (req, reply) => {
  if (role(req) !== "operator")
    return reply.code(403).send({ error: "Operator required" });
  return s.recorder.revoke((req.params as any).id);
});
app.post("/recorder/runs/:id/events", async (req, reply) => {
  const token = req.headers.authorization?.replace(/^Bearer /, "") || "";
  try {
    return s.recorder.accept(token, (req.params as any).id, req.body);
  } catch (e: any) {
    if (e.message === "INVALID_RECORDER_TOKEN")
      return reply.code(401).send({ error: "Unauthorized" });
    throw e;
  }
});
app.get("/evaluation", async () => {
  try {
    return JSON.parse(readFileSync("runs/AI-STATUS.json", "utf8"));
  } catch {
    return { status: "NOT RUN" };
  }
});
app.get("/capabilities", async () => ({
  recorder_only: process.env.AFR_RECORDER_ONLY === "1",
}));
app.get("/session", async (req) => ({ role: role(req) }));
app.get("/cases", async (req) => {
  s.audit(role(req), "list");
  return s.list();
});
app.get("/cases/:id", async (req) => s.get((req.params as any).id));
app.post("/cases", async (req) => {
  const b = req.body as any;
  s.audit(role(req), "create");
  return s.create(b.mode, b.signer);
});
app.post("/cases/:id/authorize", async (req) => {
  const b = req.body as any;
  return s.exclusive((req.params as any).id, () =>
    s.authorize((req.params as any).id, b.signature, b.signer),
  );
});
for (const [action, fn] of Object.entries({
  snapshot: s.snapshot,
  check: s.verifyLatest,
  reconcile: s.reconcile,
  purchase: s.purchase,
  analysis: s.analysis,
  payout: s.payout,
  export: s.exportPacket,
  "export-public": s.exportPublic,
}))
  app.post(`/cases/:id/${action}`, async (req, reply) => {
    if (
      ["payout", "export", "export-public", "reconcile"].includes(action) &&
      role(req) !== "operator"
    )
      return reply.code(403).send({ error: "Operator required" });
    const id = (req.params as any).id;
    s.audit(role(req), action, id);
    return s.exclusive(action === "snapshot" ? "snapshot:" + id : id, () =>
      fn(id),
    );
  });
app.post("/cases/:id/decision", async (req, reply) => {
  if (role(req) !== "operator")
    return reply.code(403).send({ error: "Operator required" });
  const id = (req.params as any).id;
  s.audit(role(req), "decision", id);
  return s.exclusive(id, () => s.decide(id, req.body));
});
app.get("/cases/:id/packet", async (req, reply) => {
  const c = s.get((req.params as any).id);
  const q = req.query as any;
  const packet =
    q.set === "snapshot"
      ? c.snapshots?.find(
          (v: any) =>
            v.version ===
            (q.version ? Number(q.version) : c.snapshots.at(-1).version),
        )?.path
      : q.set === "public"
        ? c.public_packet
        : c.packet;
  if (!packet) return reply.code(404).send({ error: "No final packet" });
  s.audit(role(req), "export-download", c.id);
  reply
    .header("Content-Type", "application/zip")
    .header("Content-Disposition", `attachment; filename="afr-${c.id}.zip"`);
  return readFileSync(packet);
});
app.get("/events", async (req, reply) => {
  reply.hijack();
  streams.add(reply.raw);
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": webOrigin,
    "Access-Control-Allow-Credentials": "true",
  });
  const send = () => {
    if (!role(req)) {
      reply.raw.end();
      return;
    }
    reply.raw.write("data: " + JSON.stringify(s.list()) + "\n\n");
  };
  send();
  const interval = setInterval(send, 1500);
  req.raw.on("close", () => {
    clearInterval(interval);
    streams.delete(reply.raw);
  });
});
await app.listen({
  host: "127.0.0.1",
  port: Number(process.env.AFR_GATEWAY_PORT || 4311),
});
for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => {
    for (const stream of streams) stream.end();
    void app.close().then(() => s.close());
  });
