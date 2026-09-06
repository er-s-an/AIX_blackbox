"use client";
import { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircledIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  ExclamationTriangleIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GearIcon,
  Link2Icon,
  MagnifyingGlassIcon,
  PlusIcon,
  ReloadIcon,
  ReaderIcon,
  ExitIcon,
  LockClosedIcon,
} from "@radix-ui/react-icons";
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4311";
type Item = any;
type View = "runs" | "connect" | "demo" | "help";
const labels: Record<string, string> = {
  Paid: "已完成赔付",
  Settled: "付款已确认",
  Recorded: "已记录",
  Recording: "记录中",
  "Needs attention": "需要核对",
  Draft: "待授权",
  Authorized: "已授权",
  Submitted: "等待确认",
  Aborted: "执行已停止",
  Failed: "需要核对",
  Approved: "已批准",
  "Partially Approved": "部分批准",
  Denied: "已拒赔",
  "Not Eligible": "无需赔付",
  "Needs Information": "待补充材料",
  "Under Review": "待审核",
  "Payout Failed": "赔付待重试",
  "Payout Pending": "赔付确认中",
  "Evidence Collecting": "待检查",
  "Not Started": "尚未分析",
  Available: "分析已完成",
  "Not Available": "分析暂不可用",
  Running: "分析中",
  Pass: "通过",
  Fail: "未通过",
  Unknown: "暂无法确认",
  "Not Present": "未提供",
};
const eventNames: Record<string, string> = {
  Created: "任务已创建",
  Authorized: "用户已签署授权",
  "Authorization anchoring": "正在存证授权",
  "Authorization confirmed": "授权存证已确认",
  "External input": "已读取商户内容",
  "Payment requested": "已请求付款",
  Settled: "付款已确认",
  "Analysis running": "正在分析证据",
  "Analysis ready": "分析已完成",
  "Analysis unavailable": "分析暂不可用",
  "Decision recorded": "审核决定已保存",
  "Payout pending": "赔付已提交",
  Paid: "测试赔付已确认",
  "Payout failed": "赔付结果待核对",
  "Export ready": "最终证据包已生成",
  "Final packet anchoring": "正在存证最终证据",
  "Execution stopped": "执行已停止",
  "No payment": "未执行付款",
  Reconciled: "原交易已核对",
  "More information requested": "已请求补充材料",
  run_started: "Agent 已开始记录",
  authorization: "已关联授权信息",
  order: "已保存订单",
  external_input: "已保存相关输入",
  delivery: "已保存交付结果",
  incident: "已标记异常",
  payment_requested: "已记录付款请求",
  payment_result: "已收到支付工具结果",
  payment_unknown: "支付工具异常，需核对结果",
  payment_reconciled: "已补充对账回执",
};
const errors: Record<string, string> = {
  Unauthorized: "登录信息不正确，或会话已过期。",
  AI_NOT_CONFIGURED: "尚未配置分析服务。你仍可以下载当前证据。",
  CASE_BUSY: "此记录正在处理，请稍后重试。",
  GATEWAY_BUSY: "另一笔交易正在确认，请稍后重试。",
  CONSTRAINT_VIOLATION: "付款请求超出授权或订单范围，已停止执行。",
  EVIDENCE_NOT_READY_FOR_APPROVAL:
    "证据尚不满足批准条件，请先检查分析或补充材料。",
  INVALID_PAYOUT_AMOUNT: "请填写有效金额，且不得超过可赔付损失。",
};
const short = (s: string) => (s ? `${s.slice(0, 8)}…${s.slice(-4)}` : "—");
const time = (s: string) =>
  new Date(s).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const state = (s: string) => labels[s] || s || "等待记录";
const money = (s: string) =>
  s ? Number(s).toLocaleString("en-US", { maximumFractionDigits: 6 }) : "—";
const title = (c: Item) =>
  c.agent_name ||
  (c.mode === "normal"
    ? "正常购买"
    : c.mode === "subtle"
      ? "隐蔽指令实验"
      : "支付指令实验");
const badge = (s: string) =>
  ["Fail", "Failed", "Payout Failed", "Needs attention"].includes(s)
    ? "danger"
    : ["Pass", "Paid", "Recorded", "Settled"].includes(s)
      ? "success"
      : "pending";
const download = (id: string, set: string, version?: number) =>
  `${API}/cases/${id}/packet?set=${set}${version ? "&version=" + version : ""}`;
export default function Workspace() {
  const [items, setItems] = useState<Item[]>([]),
    [integrations, setIntegrations] = useState<Item[]>([]),
    [view, setView] = useState<View>("runs"),
    [selected, setSelected] = useState(""),
    [role, setRole] = useState("user"),
    [password, setPassword] = useState(""),
    [logged, setLogged] = useState(false),
    [loading, setLoading] = useState(true),
    [connectionLost, setConnectionLost] = useState(false),
    [wallet, setWallet] = useState(""),
    [mode, setMode] = useState("normal"),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [reason, setReason] = useState(""),
    [amount, setAmount] = useState("8"),
    [refund, setRefund] = useState("0"),
    [outcome, setOutcome] = useState("Denied"),
    [agentName, setAgentName] = useState(""),
    [newAgent, setNewAgent] = useState<Item>(null);
  const [exporting, setExporting] = useState(false),
    [recorderOnly, setRecorderOnly] = useState(false);
  const c = items.find((x) => x.id === selected);
  const external = c?.kind === "recording";
  async function api(path: string, body?: any) {
    const r = await fetch(API + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "include",
      ...(body === undefined
        ? {}
        : {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
    });
    const data = await r.json();
    if (!r.ok) {
      if (r.status === 401) setLogged(false);
      throw Error(data.error || "REQUEST_FAILED");
    }
    return data;
  }
  async function refresh() {
    const session = await api("/session");
    setRole(session.role);
    const [list, agents, capabilities] = await Promise.all([
      api("/cases"),
      api("/integrations"),
      api("/capabilities"),
    ]);
    setRecorderOnly(capabilities.recorder_only);
    setItems(list);
    setIntegrations(agents);
    setLogged(true);
  }
  useEffect(() => {
    refresh()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!logged) return;
    const source = new EventSource(API + "/events", { withCredentials: true });
    source.onmessage = (e) => {
      setItems(JSON.parse(e.data));
      setConnectionLost(false);
    };
    source.onerror = () => setConnectionLost(true);
    return () => source.close();
  }, [logged]);
  useEffect(() => {
    setReason("");
    setOutcome("Denied");
    setAmount("8");
    setRefund("0");
  }, [selected]);
  async function run(label: string, fn: () => Promise<any>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await fn();
      if (label !== "退出") await refresh();
    } catch (e: any) {
      setError(
        errors[e.message] ||
          (/[a-z]/.test(e.message)
            ? e.message
            : "操作未完成。已有记录已保留，请重试或下载证据。"),
      );
    } finally {
      setBusy("");
    }
  }
  const go = (next: View) => {
    setView(next);
    setSelected("");
    setError("");
    setNotice("");
  };
  async function connect() {
    const eth = (window as any).ethereum;
    if (!eth)
      throw Error(
        "请在安装了 MetaMask 的浏览器中签署测试授权。查看已有记录和下载证据不需要钱包。",
      );
    const accounts = await eth.request({ method: "eth_requestAccounts" });
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x59f" }],
      });
    } catch (e: any) {
      if (e.code !== 4902) throw e;
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: "0x59f",
            chainName: "Injective EVM Testnet",
            nativeCurrency: { name: "INJ", symbol: "INJ", decimals: 18 },
            rpcUrls: ["https://k8s.testnet.json-rpc.injective.network/"],
            blockExplorerUrls: [
              "https://testnet.blockscout.injective.network/",
            ],
          },
        ],
      });
    }
    setWallet(accounts[0]);
    return accounts[0];
  }
  async function sign() {
    const address = wallet || (await connect());
    if (address.toLowerCase() !== c.signer.toLowerCase())
      throw Error("请连接创建这份授权时使用的账户。");
    const signature = await (window as any).ethereum.request({
      method: "eth_signTypedData_v4",
      params: [address, JSON.stringify(c.typed_data)],
    });
    await api(`/cases/${c.id}/authorize`, { signature, signer: address });
  }
  const action = (name: string, label: string) =>
    run(label, () => api(`/cases/${c.id}/${name}`, {}));
  const exportSnapshot = async () => {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const updated = await api(`/cases/${c.id}/snapshot`, {});
      const a = document.createElement("a");
      a.href = download(c.id, "snapshot", updated.snapshots.at(-1).version);
      a.click();
      setNotice("当前证据已生成。下载包中的缺失项与未确认状态会保留。");
      await refresh();
    } catch {
      setError("证据快照暂未生成，请重试。已有记录仍保留。");
    } finally {
      setExporting(false);
    }
  };
  const copy = (text: string) =>
    run("复制", async () => {
      await navigator.clipboard.writeText(text);
      setNotice("已复制。");
    });
  const requests =
    c?.events?.filter((e: Item) => e.kind === "payment_requested") || [];
  const receipt =
    c?.payment ||
    c?.events?.filter((e: Item) => e.data?.receipt).at(-1)?.data.receipt;
  const checkResult = c?.packet
    ? c?.versions?.at(-1)?.verification
    : c?.snapshot_verification;
  const visible = items.filter(
    (x) =>
      (view !== "demo" || x.kind !== "recording") &&
      (filter === "all" ||
        (filter === "attention" &&
          (x.incident ||
            [
              "Failed",
              "Needs attention",
              "Under Review",
              "Needs Information",
              "Payout Failed",
            ].includes(x.claim_status || x.status))) ||
        (filter === "external" && x.kind === "recording")) &&
      [title(x), x.id, x.agent_run_id].some((v) =>
        String(v).toLowerCase().includes(search.toLowerCase()),
      ),
  );
  const sdkCode = `import { createRecorder } from '@afr/recorder';\n\nconst recorder = createRecorder({\n  directory: './.afr',\n  agentId: '${newAgent?.id || integrations.find((a) => !a.revoked)?.id || "YOUR_AGENT_ID"}',\n  runId: 'order-001',\n  endpoint: '${API}',\n  token: process.env.AFR_TOKEN,\n});\n\n// existingPay 是你已有的支付函数。只映射允许保存的字段。\nconst pay = recorder.wrapPayment(existingPay, {\n  operationId: args => args.orderId,\n  request: args => ({ order_id: args.orderId, amount: args.amount }),\n  result: result => ({ receipt: result.receipt }),\n});\n\n// 用 pay 替换注册给 Agent 的原支付工具。\ntry { await agent.run({ pay }); }\nfinally {\n  try { await recorder.sync(); }\n  finally { recorder.close(); }\n}`;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("runs");
          }}
        >
          <span className="brand-mark">
            <ReaderIcon />
          </span>
          <span>
            Flight Recorder<small>Agent 支付记录</small>
          </span>
        </a>
        <nav aria-label="主导航">
          {(
            [
              ["runs", "运行记录", ReaderIcon],
              ["connect", "接入 Agent", Link2Icon],
              ["demo", "测试工作流", GearIcon],
              ["help", "使用帮助", FileTextIcon],
            ] as const
          )
            .filter(([key]) => !recorderOnly || key !== "demo")
            .map(([key, label, Icon]) => (
              <button
                key={key}
                className={"nav-item " + (view === key ? "active" : "")}
                aria-current={view === key ? "page" : undefined}
                onClick={() => go(key)}
              >
                <Icon />
                {label}
                {key === "runs" && items.length > 0 && (
                  <span className="nav-count">{items.length}</span>
                )}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="environment-dot" /> 自托管测试版
          <small>本机工作区 · 测试网资产</small>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <span className="breadcrumb">
            工作区 <span>/</span>{" "}
            {view === "connect"
              ? "接入 Agent"
              : view === "demo"
                ? "测试工作流"
                : view === "help"
                  ? "使用帮助"
                  : c
                    ? "运行详情"
                    : "运行记录"}
          </span>
          <div className="topbar-actions">
            <span className="environment">测试网</span>
            {logged && (
              <>
                <span className="role-label">
                  {role === "operator" ? "审核员" : "使用者"}
                </span>
                <button
                  className="icon-button"
                  aria-label="退出登录"
                  onClick={() =>
                    run("退出", async () => {
                      await api("/logout", {});
                      setLogged(false);
                      setItems([]);
                      setNewAgent(null);
                    })
                  }
                >
                  <ExitIcon />
                </button>
              </>
            )}
          </div>
        </header>
        <main className="content">
          {loading ? (
            <div className="skeleton" role="status" aria-label="正在加载工作区">
              <div />
              <div />
              <div />
            </div>
          ) : !logged ? (
            <div className="login-layout">
              <div className="login-intro">
                <span className="overline">记录 · 取证 · 核验</span>
                <h1>
                  让每次支付
                  <br />
                  都有迹可循。
                </h1>
                <p>
                  连接你已有的 Agent。保留关键操作，
                  <br />
                  需要时把证据完整带走。
                </p>
                <div className="login-proof">
                  <CheckCircledIcon /> 下载后可脱离平台核验
                </div>
              </div>
              <form
                className="login-panel"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("登录", async () => {
                    await api("/login", { role, password });
                    setPassword("");
                    setLogged(true);
                  });
                }}
              >
                <LockClosedIcon className="login-lock" />
                <h2>打开你的工作区</h2>
                <p>使用本机配置的账户登录。</p>
                <label>
                  身份
                  <select
                    aria-label="身份"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    <option value="user">使用者</option>
                    <option value="operator">审核员</option>
                  </select>
                </label>
                <label>
                  密码
                  <input
                    aria-label="密码"
                    autoComplete="current-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <button className="primary wide" disabled={!!busy}>
                  登录工作区
                  <ArrowRightIcon />
                </button>
                <details>
                  <summary>首次启动如何登录？</summary>
                  <p>
                    运行 pnpm setup:local 后，登录凭证保存在本机
                    .secrets/gateway.env。请保管好该目录。
                  </p>
                </details>
              </form>
            </div>
          ) : (
            <>
              {connectionLost && (
                <div className="inline-alert" role="status">
                  实时连接暂时中断，当前显示最近收到的记录。
                  <button onClick={() => run("刷新", refresh)}>重新连接</button>
                </div>
              )}
              {view === "connect" ? (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="overline">连接已有工具</span>
                      <h1>接入你的 Agent</h1>
                      <p>包装支付函数即可开始记录，无需迁移支付渠道。</p>
                    </div>
                  </div>
                  <div className="onboarding-grid">
                    <section className="panel setup-panel">
                      <div className="step-label">
                        <span>1</span>创建接入凭证
                      </div>
                      <p>每个 Agent 使用独立凭证，仅能上传自己的记录。</p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void run("创建接入", async () => {
                            setNewAgent(
                              await api("/integrations", { name: agentName }),
                            );
                            setAgentName("");
                          });
                        }}
                      >
                        <label>
                          Agent 名称
                          <input
                            aria-label="Agent 名称"
                            required
                            maxLength={80}
                            value={agentName}
                            placeholder="例如：采购助手"
                            onChange={(e) => setAgentName(e.target.value)}
                          />
                        </label>
                        <button disabled={!!busy} className="primary">
                          <PlusIcon />
                          创建接入
                        </button>
                      </form>
                      {newAgent && (
                        <div className="credential">
                          <strong>请保存接入凭证</strong>
                          <p>凭证仅在本次显示，请放入环境变量 AFR_TOKEN。</p>
                          <input
                            aria-label="接入凭证"
                            type="password"
                            readOnly
                            value={newAgent.token}
                          />
                          <div className="button-row">
                            <button
                              className="secondary"
                              onClick={() => copy(newAgent.token)}
                            >
                              <CopyIcon />
                              复制凭证
                            </button>
                            <button
                              className="quiet"
                              onClick={() => setNewAgent(null)}
                            >
                              已保存，关闭
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="step-label second">
                        <span>2</span>安装 SDK，包装支付函数
                      </div>
                      <p>Node.js 22 及以上。先从本地发行包安装 SDK：</p>
                      <code className="install-line">
                        npm install /路径/afr-recorder-0.2.0-beta.1.tgz
                      </code>
                      <div className="code-toolbar">
                        <span>你的 Agent 项目 · TypeScript</span>
                        <button className="quiet" onClick={() => copy(sdkCode)}>
                          <CopyIcon />
                          复制示例
                        </button>
                      </div>
                      <pre className="code-block">{sdkCode}</pre>
                      <p className="fine-print">
                        这是函数接入模板；按实际支付工具映射订单与回执字段。记录只覆盖包装后的调用。记录本身不代表已承保。
                      </p>
                    </section>
                    <section className="setup-side">
                      <div className="panel">
                        <div className="step-label">
                          <span>3</span>确认第一条记录
                        </div>
                        <p>运行一次 Agent 并同步后，连接状态会更新。</p>
                        <button
                          className="secondary"
                          onClick={() => run("刷新连接", refresh)}
                        >
                          <ReloadIcon />
                          检查连接
                        </button>
                        <div className="integration-list">
                          {!integrations.length ? (
                            <div className="empty-small">
                              创建接入后，会在这里显示状态。
                            </div>
                          ) : (
                            integrations.map((a) => (
                              <div className="integration-item" key={a.id}>
                                <strong>{a.name}</strong>
                                <span
                                  className={
                                    "badge " +
                                    (a.revoked
                                      ? "pending"
                                      : a.last_event_at
                                        ? "success"
                                        : "pending")
                                  }
                                >
                                  {a.revoked
                                    ? "已撤销"
                                    : a.last_event_at
                                      ? "已收到记录"
                                      : "等待首条记录"}
                                </span>
                                <small>
                                  {a.last_event_at
                                    ? time(a.last_event_at)
                                    : "尚未同步"}
                                </small>
                                {role === "operator" && !a.revoked && (
                                  <button
                                    className="quiet"
                                    onClick={() =>
                                      run("撤销凭证", () =>
                                        api(
                                          "/integrations/" + a.id + "/revoke",
                                          {},
                                        ),
                                      )
                                    }
                                  >
                                    撤销接入凭证
                                  </button>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div className="help-note">
                        <LockClosedIcon />
                        <h3>只保存你选择的内容</h3>
                        <p>
                          关联授权、订单和相关输入。不要传入密钥、支付凭证或完整隐私对话。已有记录可以在同步失败时保留于本机。
                        </p>
                      </div>
                    </section>
                  </div>
                </>
              ) : view === "help" ? (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="overline">从接入到取证</span>
                      <h1>使用帮助</h1>
                      <p>从你已有的支付工具开始，保留每一次关键操作。</p>
                    </div>
                  </div>
                  <div className="help-grid">
                    {[
                      [
                        "连接与记录",
                        "在“接入 Agent”创建凭证，将 SDK 包装后的函数注册给 Agent。付款意图会先写入本机文件，再执行原支付工具。",
                      ],
                      [
                        "发生异常后",
                        "打开对应运行，点击“下载当前证据”。无需等待 AI 分析或审核；尚未核对的付款会明确标出。",
                      ],
                      [
                        "交给另一位审核员",
                        "快照包含收集到的记录、签名和缺失项。原文可能包含订单信息，请只交给有权接收的人。",
                      ],
                      [
                        "独立核验",
                        "从发行包取出 afr-verify，用 node afr-verify/afr-verify.mjs evidence.zip --json 核验。离线不能确认链上状态。",
                      ],
                    ].map(([h, p], i) => (
                      <section className="panel" key={h}>
                        <span className="step-number">0{i + 1}</span>
                        <h2>{h}</h2>
                        <p>{p}</p>
                      </section>
                    ))}
                  </div>
                  <details className="panel technical">
                    <summary>版本范围与信任说明</summary>
                    <p>
                      这是单机测试版。外部工具记录由 Agent
                      运行环境提供，服务端签名证明收件声明，不能证明客户程序完整执行。当前回执核验支持本实例配置的
                      Injective 测试网资产。硬件 TEE
                      尚未实现。证据完整性不等于责任或保险赔付结论。
                    </p>
                    <p>
                      测试工作流使用合成订单、合成条款、真实模型与测试网交易。购买攻击实验采用刻意易受影响的配置，不能代表任意模型的默认行为。
                    </p>
                  </details>
                </>
              ) : c ? (
                <>
                  <button className="back-link" onClick={() => setSelected("")}>
                    <ArrowLeftIcon />
                    返回运行记录
                  </button>
                  <div className="page-heading detail-heading">
                    <div>
                      <span className="overline">
                        {external ? "已接入 Agent" : "测试工作流"} ·{" "}
                        {short(c.agent_run_id || c.id)}
                      </span>
                      <h1>{title(c)}</h1>
                      <p>{time(c.created_at)} 开始记录</p>
                    </div>
                    <button
                      className="primary"
                      disabled={exporting}
                      onClick={exportSnapshot}
                    >
                      <DownloadIcon />
                      下载当前证据
                    </button>
                  </div>
                  <div className="record-summary">
                    <div>
                      <span>当前状态</span>
                      <strong>
                        <span
                          className={
                            "badge " + badge(c.claim_status || c.status)
                          }
                        >
                          {state(c.claim_status || c.status)}
                        </span>
                      </strong>
                    </div>
                    <div>
                      <span>付款金额</span>
                      <strong>
                        {money(
                          receipt?.amount || requests.at(-1)?.data?.amount,
                        )}{" "}
                        <small>{receipt ? "AFR-TEST-USD" : ""}</small>
                      </strong>
                    </div>
                    <div>
                      <span>记录范围</span>
                      <strong>
                        {external ? "已包装的支付工具" : "授权与测试支付"}
                      </strong>
                    </div>
                    <div>
                      <span>证据快照</span>
                      <strong>
                        {c.snapshots?.length || 0}
                        <small> 个版本</small>
                      </strong>
                    </div>
                  </div>
                  {((external && c.incident) ||
                    ["Failed", "Aborted"].includes(c.status)) && (
                    <div className="attention-note">
                      <ExclamationTriangleIcon />
                      <div>
                        <strong>
                          {c.status === "Needs attention"
                            ? "先核对原支付结果，避免重复付款"
                            : "执行中有异常记录"}
                        </strong>
                        <p>
                          当前证据已保留。下载后可以继续调查；工具报错不一定意味着付款失败。
                        </p>
                      </div>
                    </div>
                  )}
                  <div className="detail-grid">
                    <div>
                      <section className="panel timeline-panel">
                        <div className="panel-heading">
                          <h2>发生了什么</h2>
                          <span className="muted">
                            {c.timeline.length} 条记录
                          </span>
                        </div>
                        <ol className="timeline">
                          {c.timeline.map((t: Item, i: number) => (
                            <li key={i}>
                              <span
                                className={
                                  "timeline-dot " +
                                  (t.event === "payment_unknown"
                                    ? "warning"
                                    : "")
                                }
                              />
                              <div>
                                <strong>
                                  {eventNames[t.event] || t.event}
                                </strong>
                                <time>{time(t.at)}</time>
                                {(t.detail ||
                                  (external && c.events?.[i]?.data)) && (
                                  <details>
                                    <summary>查看记录详情</summary>
                                    {/^0x[0-9a-f]{64}$/i.test(t.detail) ? (
                                      <a
                                        href={
                                          "https://testnet.blockscout.injective.network/tx/" +
                                          t.detail
                                        }
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        查看链上交易
                                        <ExternalLinkIcon />
                                      </a>
                                    ) : (
                                      <p>{t.detail}</p>
                                    )}
                                    {external && c.events?.[i]?.data && (
                                      <pre className="event-data">
                                        {JSON.stringify(
                                          c.events[i].data,
                                          null,
                                          2,
                                        )}
                                      </pre>
                                    )}
                                  </details>
                                )}
                              </div>
                            </li>
                          ))}
                        </ol>
                      </section>
                      {!external && (
                        <section className="panel workflow-panel">
                          <h2>下一步</h2>
                          <div className="button-row">
                            {c.status === "Draft" && (
                              <button
                                disabled={!!busy}
                                className="primary"
                                onClick={() => run("签署授权", sign)}
                              >
                                签署任务授权
                              </button>
                            )}
                            {c.status === "Authorized" && (
                              <button
                                disabled={!!busy}
                                className="primary"
                                onClick={() =>
                                  action("purchase", "执行测试购买")
                                }
                              >
                                执行测试购买
                              </button>
                            )}
                            {["Failed", "Submitted"].includes(c.status) &&
                              c.payment_tx &&
                              role === "operator" && (
                                <button
                                  disabled={!!busy}
                                  className="primary"
                                  onClick={() =>
                                    action("reconcile", "核对原交易")
                                  }
                                >
                                  核对原交易
                                </button>
                              )}
                            {c.status === "Settled" && !c.decision && (
                              <button
                                disabled={!!busy}
                                className="secondary"
                                onClick={() =>
                                  action("analysis", "分析当前证据")
                                }
                              >
                                {c.ai_status === "Not Available"
                                  ? "重试分析"
                                  : "分析当前证据"}
                              </button>
                            )}
                            {role === "operator" &&
                              [
                                "Approved",
                                "Partially Approved",
                                "Payout Failed",
                              ].includes(c.claim_status) && (
                                <button
                                  className="primary"
                                  disabled={!!busy}
                                  onClick={() =>
                                    action("payout", "执行测试赔付")
                                  }
                                >
                                  执行已批准的测试赔付
                                </button>
                              )}
                            {role === "operator" &&
                              [
                                "Paid",
                                "Denied",
                                "Payout Failed",
                                "Not Eligible",
                              ].includes(c.claim_status) && (
                                <button
                                  className="secondary"
                                  disabled={!!busy}
                                  onClick={() =>
                                    action("export", "归档最终证据")
                                  }
                                >
                                  存证并生成最终包
                                </button>
                              )}
                          </div>
                          <details className="authorization-details">
                            <summary>查看授权与实验范围</summary>
                            <p>{c.typed_data?.message.task}</p>
                            <p>
                              预算：{c.typed_data?.message.total_budget}{" "}
                              {c.typed_data?.message.currency}
                            </p>
                            <p>
                              有效期至{" "}
                              {new Date(
                                Number(c.typed_data?.message.valid_until) *
                                  1000,
                              ).toLocaleString()}
                            </p>
                            <p>
                              用户：{c.signer}；供应商：
                              {c.scenario?.supplier_registry?.suppliers
                                ?.map(
                                  (s: Item) => s.supplier_id + " / " + s.payee,
                                )
                                .join("；")}
                            </p>
                            <p>
                              本次使用合成订单和条款。攻击实验刻意信任商户路由指令；模型与测试网交易为真实调用。
                            </p>
                            <pre>
                              {JSON.stringify(c.scenario?.policy, null, 2)}
                            </pre>
                          </details>
                        </section>
                      )}
                      {c.analysis && (
                        <section className="panel analysis-panel">
                          <div className="panel-heading">
                            <h2>分析建议</h2>
                            <span className="badge pending">原因假设</span>
                          </div>
                          <h3>{c.analysis.primary_hypothesis.category}</h3>
                          <p>{c.analysis.primary_hypothesis.statement}</p>
                          <details>
                            <summary>依据、引用与局限</summary>
                            {c.analysis.quotes?.map((q: Item, i: number) => (
                              <blockquote key={i}>
                                {q.exact_substring}
                                <small>
                                  {q.evidence_id} · {q.supports}
                                </small>
                              </blockquote>
                            ))}
                            <p>{c.analysis.limitations?.join(" ")}</p>
                            <p>
                              {c.analysis.policy_refs.join(" · ")} ·{" "}
                              {c.analysis.model_run.model}
                            </p>
                          </details>
                        </section>
                      )}
                      {!external &&
                        role === "operator" &&
                        ["Settled", "Aborted"].includes(c.status) &&
                        !c.decision && (
                          <section className="panel review-panel">
                            <h2>人工审核</h2>
                            <p>
                              决定和理由会保留在证据中。批准后仍需单独执行测试赔付。
                            </p>
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                void run("保存审核决定", () =>
                                  api(`/cases/${c.id}/decision`, {
                                    outcome:
                                      c.status === "Aborted"
                                        ? "Not Eligible"
                                        : outcome,
                                    reason,
                                    amount: decimal(amount),
                                    merchant_refund: decimal(refund),
                                  }),
                                );
                              }}
                            >
                              {c.status !== "Aborted" && (
                                <label>
                                  处理决定
                                  <select
                                    value={outcome}
                                    onChange={(e) => setOutcome(e.target.value)}
                                  >
                                    <option value="Denied">拒赔</option>
                                    <option value="Needs Information">
                                      请求补充材料
                                    </option>
                                    <option value="Approved">
                                      批准测试赔付
                                    </option>
                                    <option value="Partially Approved">
                                      部分批准
                                    </option>
                                    <option value="Not Eligible">
                                      无符合条件的损失
                                    </option>
                                  </select>
                                </label>
                              )}
                              <label>
                                审核理由
                                <textarea
                                  aria-label="审核理由"
                                  required
                                  minLength={20}
                                  value={reason}
                                  onChange={(e) => setReason(e.target.value)}
                                  placeholder="说明你的决定及依据，至少 20 个字符"
                                />
                              </label>
                              {["Approved", "Partially Approved"].includes(
                                outcome,
                              ) && (
                                <div className="form-grid">
                                  <label>
                                    赔付金额
                                    <input
                                      required
                                      inputMode="decimal"
                                      value={amount}
                                      onChange={(e) =>
                                        setAmount(e.target.value)
                                      }
                                    />
                                  </label>
                                  <label>
                                    已退款金额
                                    <input
                                      inputMode="decimal"
                                      value={refund}
                                      onChange={(e) =>
                                        setRefund(e.target.value)
                                      }
                                    />
                                  </label>
                                </div>
                              )}
                              <button
                                className="primary"
                                disabled={!!busy || reason.length < 20}
                              >
                                {c.status === "Aborted"
                                  ? "记录无需赔付的结案理由"
                                  : "保存审核决定"}
                              </button>
                            </form>
                          </section>
                        )}
                      {c.decision && (
                        <section className="panel">
                          <h2>已记录的审核决定</h2>
                          <p>
                            <span className={"badge " + badge(c.claim_status)}>
                              {state(c.claim_status)}
                            </span>
                          </p>
                          <p>{c.decision.reason}</p>
                          <small className="muted">
                            {time(c.decision.decided_at)} ·{" "}
                            {c.decision.decided_by_key_id}
                          </small>
                        </section>
                      )}
                    </div>
                    <div className="detail-side">
                      <section className="panel evidence-panel">
                        <div className="evidence-icon">
                          <FileTextIcon />
                        </div>
                        <h2>证据随时可以带走</h2>
                        <p>
                          快照包含当前已收集的授权、订单、操作和回执。缺少或未确认的材料会明确标出。
                        </p>
                        <button
                          className="primary wide"
                          disabled={exporting}
                          onClick={exportSnapshot}
                        >
                          <DownloadIcon />
                          下载当前证据
                        </button>
                        <p className="fine-print">
                          <LockClosedIcon />
                          包含受限原文，请仅交给有权接收的人。
                        </p>
                        <div className="version-list">
                          {[...(c.snapshots || [])].reverse().map((v: Item) => (
                            <a
                              key={v.version}
                              href={download(c.id, "snapshot", v.version)}
                            >
                              <span>
                                快照 v{v.version}
                                <small>{time(v.created_at)}</small>
                              </span>
                              <DownloadIcon />
                            </a>
                          ))}
                          {c.packet && (
                            <a href={download(c.id, "full")}>
                              <span>
                                最终归档包<small>含对应审核及处理结果</small>
                              </span>
                              <DownloadIcon />
                            </a>
                          )}
                          {c.public_packet && (
                            <a href={download(c.id, "public")}>
                              <span>
                                公开摘要包<small>不含受限原文</small>
                              </span>
                              <DownloadIcon />
                            </a>
                          )}
                        </div>
                        {role === "operator" && c.packet && (
                          <button
                            className="quiet"
                            disabled={!!busy}
                            onClick={() =>
                              action("export-public", "生成公开摘要")
                            }
                          >
                            生成公开摘要包
                          </button>
                        )}
                      </section>
                      <section className="panel verification-panel">
                        <h2>独立核验</h2>
                        <p>
                          核对文件签名和支持的链上回执。快照的缺失项不会显示为通过。
                        </p>
                        <button
                          className="secondary wide"
                          disabled={
                            !!busy || (!c.packet && !c.snapshots?.length)
                          }
                          onClick={() => action("check", "核验当前证据")}
                        >
                          <CheckCircledIcon />
                          {c.packet ? "核验最终包" : "核验最新快照"}
                        </button>
                        {checkResult && (
                          <>
                            <p
                              className={
                                "verification-outcome " +
                                (checkResult.overall === "failed"
                                  ? "danger-text"
                                  : "")
                              }
                            >
                              {checkResult.overall === "all_pass_in_scope"
                                ? "范围内检查已通过"
                                : checkResult.overall === "failed"
                                  ? "存在未通过的检查"
                                  : "部分内容可核验"}
                            </p>
                            <details>
                              <summary>查看每项结果</summary>
                              <small>{time(checkResult.verified_at)}</small>
                              {checkResult.checks.map((x: Item, i: number) => (
                                <div className="check-row" key={i}>
                                  <span>{checkLabel(x.id)}</span>
                                  <span className={"badge " + badge(x.status)}>
                                    {state(x.status)}
                                  </span>
                                </div>
                              ))}
                              <p className="fine-print">
                                完整性通过不代表来源真实、因果成立或应当赔付。当前为软件签署声明，未提供硬件
                                TEE。
                              </p>
                            </details>
                          </>
                        )}
                      </section>
                      {external && (
                        <div className="help-note">
                          <h3>记录覆盖范围</h3>
                          <p>
                            仅覆盖经过 SDK 包装的工具。运行记录由你的 Agent
                            提供，未接入的操作不会被自动发现。
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="page-heading">
                    <div>
                      <span className="overline">
                        {view === "demo"
                          ? "真实测试网闭环"
                          : "你的 Agent 工作区"}
                      </span>
                      <h1>{view === "demo" ? "测试工作流" : "运行记录"}</h1>
                      <p>
                        {view === "demo"
                          ? "体验授权、购买、审核和测试赔付。"
                          : "查看关键支付操作，需要时立即获取证据。"}
                      </p>
                    </div>
                    {view === "runs" && (
                      <button className="primary" onClick={() => go("connect")}>
                        <PlusIcon />
                        接入 Agent
                      </button>
                    )}
                  </div>
                  {view === "demo" && (
                    <section className="panel demo-setup">
                      <div>
                        <h2>开始一次测试购买</h2>
                        <p>
                          合成场景 · 真实模型 · 测试资产。此入口运行内置演示
                          Agent。
                        </p>
                      </div>
                      <label>
                        购买场景
                        <select
                          value={mode}
                          onChange={(e) => setMode(e.target.value)}
                        >
                          <option value="normal">正常购买</option>
                          <option value="attack">指令攻击实验</option>
                          <option value="subtle">隐蔽指令实验</option>
                        </select>
                      </label>
                      <button
                        className="primary"
                        disabled={!!busy}
                        onClick={() =>
                          run("创建测试授权", async () => {
                            const address = wallet || (await connect());
                            const value = await api("/cases", {
                              mode,
                              signer: address,
                            });
                            setSelected(value.id);
                          })
                        }
                      >
                        创建并查看授权
                        <ArrowRightIcon />
                      </button>
                    </section>
                  )}
                  <div className="overview-strip">
                    <div>
                      <strong>
                        {items.filter((x) => x.kind === "recording").length}
                      </strong>
                      <span>外部 Agent 运行</span>
                    </div>
                    <div>
                      <strong>
                        {
                          items.filter(
                            (x) =>
                              x.incident ||
                              [
                                "Failed",
                                "Needs attention",
                                "Needs Information",
                                "Under Review",
                                "Payout Failed",
                              ].includes(x.claim_status || x.status),
                          ).length
                        }
                      </strong>
                      <span>需要关注</span>
                    </div>
                    <div>
                      <strong>
                        {
                          items.filter((x) => x.packet || x.snapshots?.length)
                            .length
                        }
                      </strong>
                      <span>已有证据包</span>
                    </div>
                  </div>
                  <section className="panel records-panel">
                    <div className="list-toolbar">
                      <div className="tabs" aria-label="筛选记录">
                        {[
                          ["all", "全部"],
                          ["attention", "需要关注"],
                          ["external", "外部 Agent"],
                        ].map(([key, label]) => (
                          <button
                            aria-pressed={filter === key}
                            className={filter === key ? "active" : ""}
                            key={key}
                            onClick={() => setFilter(key!)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <label className="search">
                        <MagnifyingGlassIcon />
                        <input
                          aria-label="搜索运行记录"
                          placeholder="搜索 Agent 或运行编号"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </label>
                    </div>
                    {!visible.length ? (
                      <div className="empty-state">
                        <ReaderIcon />
                        <h2>
                          {items.length
                            ? "没有匹配的记录"
                            : "你的第一条记录，从接入开始"}
                        </h2>
                        <p>
                          {items.length
                            ? "尝试其他关键词或切换筛选条件。"
                            : "连接已有的支付工具，执行后即可在这里查看和下载证据。"}
                        </p>
                        {!items.length && (
                          <button
                            className="primary"
                            onClick={() => go("connect")}
                          >
                            接入 Agent
                            <ArrowRightIcon />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Agent / 运行</th>
                              <th>状态</th>
                              <th>记录来源</th>
                              <th>开始时间</th>
                              <th>
                                <span className="sr-only">查看详情</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {visible.map((x) => (
                              <tr key={x.id}>
                                <td>
                                  <button
                                    className="record-link"
                                    onClick={() => setSelected(x.id)}
                                  >
                                    <span className="run-icon">
                                      <ReaderIcon />
                                    </span>
                                    <span>
                                      <strong>{title(x)}</strong>
                                      <small>
                                        {short(x.agent_run_id || x.id)}
                                      </small>
                                    </span>
                                  </button>
                                </td>
                                <td>
                                  <span
                                    className={
                                      "badge " +
                                      badge(x.claim_status || x.status)
                                    }
                                  >
                                    {state(x.claim_status || x.status)}
                                  </span>
                                </td>
                                <td className="source-cell">
                                  {x.kind === "recording"
                                    ? "接入的支付工具"
                                    : "内置测试工作流"}
                                </td>
                                <td className="date-cell">
                                  {time(x.created_at)}
                                </td>
                                <td>
                                  <button
                                    className="icon-button"
                                    aria-label={
                                      "查看 " + title(x) + " " + short(x.id)
                                    }
                                    onClick={() => setSelected(x.id)}
                                  >
                                    <ArrowRightIcon />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                  <p className="list-footnote">
                    选择任一运行查看详情。当前证据可在分析或审核前导出。
                  </p>
                </>
              )}
            </>
          )}
          {busy && (
            <div className="toast busy" role="status">
              <span className="spinner" />
              {busy}中…
            </div>
          )}
          {error && (
            <div className="feedback error" role="alert">
              <ExclamationTriangleIcon />
              {error}
              <button className="quiet" onClick={() => setError("")}>
                关闭
              </button>
            </div>
          )}
          {notice && (
            <div className="feedback notice" role="status">
              <CheckCircledIcon />
              {notice}
              <button className="quiet" onClick={() => setNotice("")}>
                关闭
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
function decimal(value: string) {
  if (!/^\d+(\.\d{1,18})?$/.test(value)) throw Error("INVALID_PAYOUT_AMOUNT");
  const [a, b = ""] = value.split(".");
  return a + "." + b.padEnd(18, "0");
}
function checkLabel(id: string) {
  const map: Record<string, string> = {
    FORMAT: "包格式",
    INTEGRITY: "文件完整性",
    MANIFEST_SIG: "材料签名",
    SIGNER_TRUST: "签名者登记",
    COMPLETENESS: "证据完整程度",
    ANCHOR_PACKET: "证据包存证",
    TEE_ATTESTATION: "硬件执行证明",
    MANDATE_SIG: "用户授权签名",
    LINKAGE: "材料关联",
    EXEC_ENV: "验证者声明",
    DISCLOSURE: "披露范围",
    ANCHOR_AUTH: "授权存证",
    RECEIPT_PAYMENT: "付款回执",
    RECEIPT_PAYOUT: "赔付回执",
    AUTH_ORDER: "授权先于付款",
  };
  return (
    map[id] || (/^RECEIPT_\d+$/.test(id) ? "交易回执 " + id.split("_")[1] : id)
  );
}
