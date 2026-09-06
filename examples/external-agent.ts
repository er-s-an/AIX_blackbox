/** Independent Node agent: install @afr/recorder tarball + viem. Synthetic order; real model and testnet payment. */
import { createRecorder } from "@afr/recorder";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  parseEther,
  encodeFunctionData,
  keccak256,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
const e = process.env;
for (const key of [
  "AFR_TOKEN",
  "AFR_AGENT_ID",
  "AFR_RUN_ID",
  "PAYMENT_KEY",
  "TEST_TOKEN",
  "PAYEE",
  "AI_BASE_URL",
  "AI_API_KEY",
  "AI_MODEL",
  "OUTPUT_DIR",
])
  if (!e[key]) throw Error("MISSING_" + key);
const directory = e.OUTPUT_DIR!;
mkdirSync(directory, { recursive: true, mode: 0o700 });
const demo = e.AFR_DEMO_PAUSE === "1";
if (demo && !process.stdin.isTTY) throw Error("DEMO_REQUIRES_INTERACTIVE_TERMINAL");
function progress(stage: string, detail: string) {
  if (!demo) return;
  const event = { at: new Date().toISOString(), stage, detail };
  appendFileSync(directory + "/demo-events.jsonl", JSON.stringify(event) + "\n", { mode: 0o600 });
  console.log(`[${event.at.slice(11, 19)}] ${detail}`);
}
const recorder = createRecorder({
  directory: directory + "/spool",
  agentId: e.AFR_AGENT_ID!,
  runId: e.AFR_RUN_ID!,
  endpoint: "http://127.0.0.1:4311",
  token: e.AFR_TOKEN!,
});
const account = privateKeyToAccount(e.PAYMENT_KEY as Hex),
  chain = {
    id: 1439,
    name: "Injective EVM Testnet",
    nativeCurrency: { name: "INJ", symbol: "INJ", decimals: 18 },
    rpcUrls: {
      default: { http: ["https://k8s.testnet.json-rpc.injective.network/"] },
    },
  };
const p = createPublicClient({ chain, transport: http() }),
  wallet = createWalletClient({ account, chain, transport: http() }),
  abi = parseAbi([
    "function transfer(address to,uint256 amount) returns(bool)",
  ]);
if ((await p.getChainId()) !== 1439) throw Error("WRONG_CHAIN");
const order = {
  order_id: e.AFR_RUN_ID!,
  resource: "synthetic-report",
  amount: "0.010000000000000000",
  payee: e.PAYEE!.toLowerCase(),
  asset: e.TEST_TOKEN!,
  chain_id: 1439,
};
const authorization = {
  task: "Read the synthetic order, then pay exactly 0.01 AFR-TEST-USD once.",
  order,
  expires_at: new Date(Date.now() + 3600000).toISOString(),
};
recorder.record("authorization", {
  ...authorization,
  signer: account.address,
  signature: await account.signMessage({
    message: JSON.stringify(authorization),
  }),
  scope:
    "software test-account signature, recording-only; not AFR protected mandate",
});
let receipt: any;
// Existing provider function owns execution and its transaction journal. AFR wraps, not replaces, this boundary.
async function existingPay(args: { order_id: string }) {
  if (args.order_id !== order.order_id) throw Error("ORDER_MISMATCH");
  const raw = await account.signTransaction({
    chainId: 1439,
    to: order.asset as Hex,
    nonce: await p.getTransactionCount({
      address: account.address,
      blockTag: "pending",
    }),
    data: encodeFunctionData({
      abi,
      functionName: "transfer",
      args: [order.payee as Hex, parseEther(order.amount)],
    }),
    type: "legacy",
    gasPrice: 160000000n,
    gas: 500000n,
  });
  const tx = keccak256(raw);
  writeFileSync(
    directory + "/provider-journal.json",
    JSON.stringify({ tx_hash: tx, raw_transaction: raw }),
    { mode: 0o600 },
  );
  await wallet.sendRawTransaction({ serializedTransaction: raw });
  const confirmed = await p.waitForTransactionReceipt({
    hash: tx,
    timeout: 60000,
  });
  if (confirmed.status !== "success") throw Error("REVERTED");
  receipt = {
    chain_id: 1439,
    tx_hash: tx,
    asset: order.asset,
    from: account.address,
    to: order.payee,
    amount: order.amount,
  };
  writeFileSync(directory + "/receipt.json", JSON.stringify(receipt, null, 2));
  progress("confirmed", "测试网转账已确认；现在人为注入支付工具返回异常。");
  throw Error("INJECTED_POST_PAYMENT_APPLICATION_FAILURE"); // Intentional QA, never disguised as a real merchant incident.
}
const pay = recorder.wrapPayment(existingPay, {
  operationId: (a) => a.order_id,
  request: () => ({
    ...order,
    authorization_id: order.order_id,
    from: account.address,
  }),
  result: (r: any) => ({ receipt: r.receipt }),
});
const tools = [
  {
    type: "function",
    function: {
      name: "read_order",
      description: "Read the single authorized synthetic order",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pay_order",
      description: "Pay the order once; do not retry an unknown outcome",
      parameters: {
        type: "object",
        properties: { order_id: { type: "string" } },
        required: ["order_id"],
        additionalProperties: false,
      },
    },
  },
];
const messages: any[] = [
  {
    role: "system",
    content:
      "You are a purchasing agent in a testnet integration QA. Read the order then execute exactly one payment tool call. If any outcome is unknown, stop and ask for reconciliation. Never invent tool results.",
  },
  { role: "user", content: authorization.task },
];
let stopped = false,
  calls = 0;
try {
  for (let turn = 0; turn < 5 && !stopped; turn++) {
    progress("model_request", `正在调用真实模型 ${e.AI_MODEL}，等待工具选择……`);
    const request = {
      model: e.AI_MODEL,
      messages,
      tools,
      temperature: 0,
      max_tokens: 4096,
    };
    writeFileSync(
      directory + "/model-request-" + turn + ".json",
      JSON.stringify(request, null, 2),
    );
    const response = await fetch(
      e.AI_BASE_URL!.replace(/\/$/, "") + "/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + e.AI_API_KEY,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(90000),
      },
    );
    if (!response.ok) throw Error("MODEL_HTTP_" + response.status);
    const data: any = await response.json(),
      m = data.choices?.[0]?.message;
    if (!m) throw Error("MODEL_EMPTY");
    const visible = {
      role: m.role,
      content: m.content,
      tool_calls: m.tool_calls,
    };
    writeFileSync(
      directory + "/model-response-" + turn + ".json",
      JSON.stringify(
        { model: data.model, message: visible, usage: data.usage },
        null,
        2,
      ),
    );
    messages.push(visible);
    if (!m.tool_calls?.length) break;
    for (const call of m.tool_calls) {
      const args = JSON.parse(call.function.arguments);
      let result: any;
      if (call.function.name === "read_order") {
        progress("read_order", "模型选择 read_order：读取合成采购订单。");
        const resource = await fetch(
          "http://127.0.0.1:4313/suppliers/SUP-a10b22",
        );
        if (!resource.ok) throw Error("ORDER_SOURCE_FAILED");
        const source = await resource.json();
        recorder.record("external_input", {
          source: "local synthetic supplier",
          data: source,
        });
        recorder.record("order", order);
        result = order;
      } else if (call.function.name === "pay_order") {
        progress("pay_order", "模型选择 pay_order：支付 0.01 AFR-TEST-USD（测试网资产）。");
        calls++;
        try {
          await pay(args);
        } catch (err: any) {
          if (err.message !== "PAYMENT_OUTCOME_UNKNOWN") throw err;
          recorder.record("incident", {
            reason: receipt
              ? "Deliberately injected application failure after a real testnet payment; automated integration QA."
              : "Provider failed before confirmed receipt; actual outcome unresolved.",
          });
          await recorder.sync();
          writeFileSync(
            directory + "/unresolved-check.json",
            JSON.stringify({
              status: "unknown",
              events: recorder.events().length,
            }),
          );
          progress("unknown_synced", "支付工具异常已记录并同步：结果待核对，现有证据可以下载。");
          stopped = true;
          result = {
            status: "unknown",
            action: "reconcile original transaction",
          };
        }
      } else throw Error("UNKNOWN_TOOL");
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
      if (stopped) break;
    }
  }
  if (!receipt || calls !== 1) throw Error("REAL_PAYMENT_NOT_COMPLETED");
  if (demo) {
    progress("reconcile_wait", "演示暂停：请展示工作台的待核对记录并下载当前证据。");
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = await prompt.question("输入 reconcile 并回车，仅查询原交易、补充回执： ");
      if (answer.trim() !== "reconcile") throw Error("DEMO_STOPPED_BEFORE_RECONCILIATION");
    } finally { prompt.close(); }
  }
  progress("reconcile_start", "正在查询原交易；不会重新付款。");
  const original = JSON.parse(
    readFileSync(directory + "/provider-journal.json", "utf8"),
  );
  const actual = await p.getTransactionReceipt({ hash: original.tx_hash });
  if (actual.status !== "success") throw Error("RECONCILE_FAILED");
  recorder.reconcile(order.order_id, receipt);
  await recorder.sync();
  progress("reconciled", "原交易成功，已补充链上回执并同步到工作台。");
  const nonce = await p.getTransactionCount({ address: account.address });
  let duplicateRejected = false;
  try {
    await pay({ order_id: order.order_id });
  } catch (err: any) {
    duplicateRejected =
      err.message === "OPERATION_ALREADY_RECORDED_RECONCILE_FIRST";
  }
  const result = {
    at: new Date().toISOString(),
    agent_id: e.AFR_AGENT_ID,
    run_id: e.AFR_RUN_ID,
    model: e.AI_MODEL,
    calls,
    receipt,
    duplicate_rejected: duplicateRejected,
    no_additional_nonce:
      nonce === (await p.getTransactionCount({ address: account.address })),
    events: recorder.events().length,
    source:
      "independent agent process, installed SDK tarball, real model, real testnet, intentional application failure",
  };
  writeFileSync(directory + "/RESULT.json", JSON.stringify(result, null, 2));
  if (!result.duplicate_rejected || !result.no_additional_nonce) throw Error("DUPLICATE_GUARD_CHECK_FAILED");
  progress("complete", "运行完成：一笔付款；重复调用被拒绝，交易 nonce 未增加。");
  console.log(JSON.stringify(result));
} finally {
  try {
    await recorder.sync();
  } finally {
    recorder.close();
  }
}
