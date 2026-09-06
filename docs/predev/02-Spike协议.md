# 02 · Spike 执行协议（S1–S4）

> 目的：PRD v1.3 §20 的四个解封条件。每个 Spike 是**一次性验证实验**，产出证据文件后即归档；Spike 代码可丢弃，不进主干。
> 状态：全部 NOT STARTED。
> 位置：`spikes/s1-eip712/`、`spikes/s2-anchor-rpc/`、`spikes/s3-cli-proto/`、`spikes/s4-timing/`；证据统一写入 `spikes/RESULTS.md` + `spikes/<id>/evidence/`。
> 顺序：S2 → S1 → S3 → S4（S1 需要 S2 部署出的合约地址填 `verifyingContract`；S3 需要 S2 的链上记录；S4 需要 S1–S3 的组件）。

通用规则：
- 每个 Spike 有**唯一的通过判据**，判据只写可机检的内容；"感觉可以"不算通过。
- 证据 = 命令 + 原始输出 + 时间戳 + 环境（Node/Foundry/viem 版本、RPC URL、区块高度）。
- 任一 Spike 失败 → 执行"回退设计"并在 RESULTS.md 记录，PRD 对应条目升为待修订；不允许"先继续开发再说"。

---

## S2 · 合约与 RPC（先做）

**目标：** 证明 Foundry 能把最小 EvidenceAnchor 部署到 1439，viem 能经可配置 RPC 读回承诺/区块号/事件/回执；确认 legacy + 显式 gas 行为；实测公共/归档端点的历史查询深度。

### 步骤

1. 准备
   - `forge --version`、`node -v`、`pnpm -v` 记入证据。
   - 领测试 INJ：https://testnet.faucet.injective.network/ ，地址 = `DEPLOYER_PK` 对应地址。记录余额（`cast balance <addr> --rpc-url $RPC`）。
2. 合约（最小版，按 ADR-007，但可先不做幂等分支）
   ```solidity
   // spikes/s2-anchor-rpc/src/EvidenceAnchorSpike.sol
   pragma solidity 0.8.28;
   contract EvidenceAnchorSpike {
     struct Record { bytes32 commitment; uint64 blockNumber; }
     mapping(bytes32 => Record) public records;
     mapping(bytes32 => uint32) public latestVersion;
     event Anchored(address indexed submitter, uint8 indexed anchorType, bytes32 indexed refId, uint32 version, bytes32 commitment, uint64 blockNumber);
     error Conflict(); error BadVersion();
     function anchor(uint8 t, bytes32 refId, uint32 version, bytes32 c) external {
       bytes32 lk = keccak256(abi.encode(msg.sender, t, refId));
       bytes32 k  = keccak256(abi.encode(msg.sender, t, refId, version));
       uint32 lv = latestVersion[lk];
       if (version <= lv) { if (records[k].commitment == c) return; revert Conflict(); }
       if (version != lv + 1) revert BadVersion();
       records[k] = Record(c, uint64(block.number));
       latestVersion[lk] = version;
       emit Anchored(msg.sender, t, refId, version, c, uint64(block.number));
     }
     function get(address s, uint8 t, bytes32 refId, uint32 v) external view returns (bytes32, uint64) {
       Record memory r = records[keccak256(abi.encode(s, t, refId, v))]; return (r.commitment, r.blockNumber);
     }
     function latest(address s, uint8 t, bytes32 refId) external view returns (uint32) {
       return latestVersion[keccak256(abi.encode(s, t, refId))];
     }
   }
   ```
3. `forge test`：写 4 个测试——首次写入、幂等重写（相同承诺，不 revert、不发事件）、冲突（不同承诺 revert Conflict）、跳版本 revert BadVersion。
4. 部署（legacy + 显式 gas）
   ```bash
   forge create src/EvidenceAnchorSpike.sol:EvidenceAnchorSpike \
     --rpc-url https://k8s.testnet.json-rpc.injective.network/ \
     --private-key $DEPLOYER_PK --legacy --gas-price 160000000 --gas-limit 1500000 --broadcast
   ```
   记录：合约地址、tx hash、区块号、实际 gas used、实际 gasPrice。若 `--legacy` 被拒 → 记录错误原文，改试 type-2，并在 RESULTS 标注"legacy 不可用"。
5. viem 写入 + 读取（`spikes/s2-anchor-rpc/write-read.ts`）
   - `defineChain({ id: 1439, name: 'Injective Testnet', nativeCurrency: {name:'INJ',symbol:'INJ',decimals:18}, rpcUrls: { default: { http: [process.env.RPC!] } } })`
   - `walletClient.writeContract({ ..., type: 'legacy', gasPrice, gas })` 写入 `anchor(0, refId, 1, commitment)`；等待回执。
   - `publicClient.readContract get(...)` → 断言返回的 commitment 与 blockNumber 等于回执中的值。
   - `publicClient.readContract latest(...)` → 1。
   - 再写一次相同承诺 → 断言回执 status success 且 **无** Anchored 日志（幂等 no-op）。
   - 写不同承诺 → 断言 revert 且 viem 错误里能解析出 `Conflict`。
   - `getBlockNumber()` 与 `getBlock({blockTag:'latest'})` 记录；**顺带**试 `getBlock({blockTag:'finalized'})` 与 `'safe'`，只记录响应/错误原文，不作为依赖。
6. 历史深度实测（`depth.ts`）
   - 对部署 tx 与写入 tx，在 T+0、T+1h、T+24h、T+72h（可用 cron/手动）各执行一次：`eth_getTransactionReceipt`、`eth_getLogs({address, fromBlock: txBlock, toBlock: txBlock})`，分别打公共端点与归档端点。
   - 记录成功/失败/截断的原始响应。72h 数据点为**必需**（演示前的预置交易会超过 3 天）。

### 通过判据（全部满足）

- [ ] `forge test` 4/4 通过。
- [ ] 合约在 1439 上部署成功，Blockscout 可见（记录 URL，仅展示）。
- [ ] viem 写入→`get` 读回 commitment 与 blockNumber 一致；`latest`=1。
- [ ] 幂等重写：status success 且无事件；冲突：revert 可解析。
- [ ] 归档端点在 T+72h 对回执查询成功。
- [ ] 记录 legacy 是否可用、实际 gasPrice/gas、公共端点 T+72h 的实际行为。

### 回退设计

- legacy 不可用 → ADR-016 切 type-2，PRD §20 "P0 默认 legacy" 改为 "type-2"。
- 归档端点 T+72h 也失败 → CLI 默认改为 QuickNode/Thirdweb 免费层 URL 占位 + README 要求评委自行配置；PRD D2 条目改写；同时 CLI 对回执项输出 Unknown 但承诺项仍 Pass（承诺不依赖回执）。
- eth_call 读 struct 异常 → 拆为两个 getter。

---

## S1 · 钱包签名与链下恢复

**目标：** MetaMask 在自定义网络 1439 下完成 `eth_signTypedData_v4` 签署 AFR Mandate；viem `recoverTypedDataAddress` 恢复出同一地址；同时验证 chainId 不匹配时钱包拒签。

### 步骤

1. MetaMask 添加网络：名称 Injective Testnet、RPC 公共端点、Chain ID 1439、符号 INJ、浏览器 Blockscout。截图存证据。
2. `spikes/s1-eip712/index.html` + `sign.ts`（vite 单页）：
   - `domain = { name:'AgentFlightRecorder', version:'1', chainId:1439, verifyingContract:<S2 合约地址> }`
   - types/message 按 ADR-006（`uint64` 用 `BigInt`，`bytes32` 用 `0x` 十六进制字符串，金额用字符串）。
   - `walletClient.signTypedData({ account, domain, types, primaryType:'AFRMandate', message })`。
   - 页面展示签名、`recoverTypedDataAddress` 结果、与 `account` 比对结果。
3. 负例：把 `domain.chainId` 改为 `1776` 再签 → 记录 MetaMask 行为（预期：拒绝或警告）。把 `chainId` 传字符串 `"injective-888"` → 记录报错原文（这是 PRD 明令禁止的写法，证据用于 README 警示）。
4. 可用性记录：MetaMask 签名弹窗对每个字段的显示截图（判断 ADR-006 是否需要改 `uint64/bytes32` 为 `string`）。
5. （可选）Ledger 若有：确认 typed data 不支持，记录原文。

### 通过判据

- [ ] 恢复地址 == 签名账户地址（3 次不同 message 均成立）。
- [ ] chainId=1776 时钱包拒签或明确警告（记录）。
- [ ] 弹窗显示可读（金额、任务、有效期人眼可辨）。

### 回退设计

- MetaMask 对 `uint64` 显示为难读的大数 → ADR-006 改为 ISO-8601 `string`。
- 恢复失败 → 检查 types 顺序/名称与 message 一致；仍失败则用 `hashTypedData` 分步对比 domainSeparator。此 Spike 不存在"链不支持"的失败模式。

---

## S3 · CLI 原型（离线 + 在线 + 负例 N01–N11）

**目标：** 对一个手工构造的包跑通四态输出；负例集全部得到 PRD §4.3 规定结果。

### 步骤

1. `packages/core` 最小实现：`canonicalJson`、`sha256Hex`、`packetCommitment(domain,salt,manifestBytes)`、`refId(lineage,set)`、`signDigest`/`recoverSigner`。
2. 跑 RFC 8785 附录测试向量 + 自建 5 条向量（含 Unicode、嵌套、空对象、大整数字符串、转义）。
3. 手工构造包 `spikes/s3-cli-proto/fixture/pkg-v1/`：
   - `mandate.json`（S1 产出的签名）、`evidence/e1.json`、`analysis.json`（占位但 schema 合法）、`decision.json`、`scenario.json`、`proofs/salt`、`proofs/verifier_statement.json`（验证者密钥签的声明）、`README.md`。
   - 生成 `manifest.json`（含 `anchors_expected` 两条：AUTH 用 S2 已写入的记录；PACKET 键在此时确定但尚未上链）。
   - 计算包承诺 → 用 S2 合约 `anchor(1, refId_full, 1, commitment)` 上链。
   - 写 `anchors.json`（PACKET tx hash + block）。
   - `proofs/manifest.sig.json`（Gateway 密钥签 Manifest 摘要）。
   - 按 ADR-010 打 ZIP。
4. `verifier-cli` 原型：`verify <zip> [--offline] [--rpc URL] [--trust PATH] [--json]`。
   - 检查项 ID（冻结）：`INTEGRITY`, `MANIFEST_SIG`, `SIGNER_TRUST`, `LINKAGE`, `MANDATE_SIG`, `AUTH_ORDER`, `ANCHOR_AUTH`, `ANCHOR_PACKET`, `RECEIPT_PAYMENT`, `RECEIPT_PAYOUT`, `EXEC_ENV`, `TEE_ATTESTATION`, `DISCLOSURE`；包级标记：`SUPERSEDED`, `WARNINGS[]`。
   - 每项输出 `Pass | Fail | Unknown | Not Present` + 一行原因。
   - 离线模式：所有链上项 Unknown 并列出。
5. 负例生成脚本 `negatives/generate.ts`：从原包生成 N01–N11 各一个 ZIP；`negatives/expected.json` 写预期结果。
6. 断言表（Vitest）：对原包与 N01–N11 逐项比对 `expected.json`。

### 负例预期（复制自 PRD §4.3，作为测试真值）

| ID | 操作 | 预期 |
|---|---|---|
| N01 | 修改 `evidence/e1.json` 一个字节 | INTEGRITY Fail |
| N02 | 删除 `mandate.json` | INTEGRITY Fail |
| N03 | 用未登记密钥重签 manifest | MANIFEST_SIG Pass（数学）, SIGNER_TRUST Unknown |
| N04 | `anchors_expected[*].chain_id` → 1776 且同步重签 | ANCHOR_* Fail（链 ID 不匹配信任配置） |
| N05 | 提供 v1 包，链上已有 v2 | 逐项同原包；SUPERSEDED=true |
| N06 | 删除 `anchors.json` | ANCHOR_* 按键 eth_call 照常（Pass）；RECEIPT_* Unknown；WARNINGS 含 "anchors hint missing" |
| N07 | 把 `anchors.json` 加入文件清单并重签 | INTEGRITY/FORMAT Fail |
| N08 | 改 `anchors_expected[PACKET].ref_id` 不重签 | MANIFEST_SIG Fail |
| N09 | 改 `analysis.json` 的 `quotes` | INTEGRITY Fail |
| N10 | 全部重算摘要 + 自有密钥重签 + 新盐 | INTEGRITY Pass, SIGNER_TRUST Unknown, ANCHOR_PACKET Fail |
| N11 | `decision.json` 版本改 2 并重签 manifest（原密钥不可得→自有密钥） | MANIFEST_SIG Pass, SIGNER_TRUST Unknown, ANCHOR_PACKET Fail |

（N04 需要在线；N05 需要先用 S2 合约写入 v2；其余离线即可判定大部分项。）

### 通过判据

- [ ] 原包在线：除 `TEE_ATTESTATION`=Not Present、`RECEIPT_PAYMENT/PAYOUT` 视夹具而定外，其余 Pass；总体不显示"全部通过"（因 TEE 为 Not Present，摘要措辞为"P0 范围内检查通过，TEE 不适用"）。
- [ ] 原包离线：链上项全部 Unknown 且被列出。
- [ ] N01–N11 与 `expected.json` 100% 一致。
- [ ] 路径穿越 ZIP、重复条目 ZIP、重复 JSON 键文件 → 拒绝处理（3 个额外安全负例）。
- [ ] 人可读输出含固定标签：`Execution environment: verifier-signed statement (software; not hardware-attested)` 与 `Signer: <role>/<key_id> (per trusted_signers.json @ <commit>)`。

### 回退设计

- JCS 库跨环境不一致 → 自实现（ADR-003）。
- 某负例无法稳定得到预期 → 修改 PRD §4.3 该负例的预期措辞（而不是删负例），并记录原因。

---

## S4 · 端到端计时

**目标：** 为 §24 每个时段取得 p50/p95，决定预算表与可见时间压缩策略。

### 步骤

1. 组件就位：S1 签名页、S2 合约、S3 CLI、最小 Agent 循环（ADR-013，3 工具）、最小分析调用（structured output）、验证者签名服务（单文件）。
2. 计时脚本 `spikes/s4-timing/run.ts`，每段独立计时，共跑 **5 轮**：
   - T1 签名+授权存证（人手点 MetaMask 的时间单独记）
   - T2 Agent 购买（模型调用次数、每次延迟、总时长）
   - T3 支付广播→回执
   - T4 验证者签名 + AI 分析（输出 token 数、延迟）
   - T5 赔付广播→回执
   - T6 包构造 + 存证 + ZIP
   - T7 CLI 在线核验（RPC 调用次数、总时长；分别对公共/归档端点）
3. 候选模型至少 2 个（一个快、一个强），T2/T4 各跑。
4. 产出 `spikes/s4-timing/RESULTS.md`：表格（段 × 模型 × p50/p95），以及"建议预算表 + 是否需要可见压缩"。

### 通过判据

- [ ] 5 轮完整数据，无缺段。
- [ ] 给出修订后的 §24 时间表（含每段 p95）与压缩点声明。
- [ ] T7 在归档端点 p95 ≤ 30s；否则记录并把 CLI 改为并发 RPC。

### 回退设计

- T2 p95 > 60s → 演示默认改为"预置攻击交易 + 现场实跑 T4"，PRD §20 步骤 2 的降级转为默认并标注。
- T4 p95 > 40s → 换快模型或缩短分析输出 schema（保留 quotes/refs/hypothesis，精简 candidate_causes）。

---

## RESULTS.md 模板

```
# Spike Results

| Spike | 状态 | 日期 | 执行者 | 证据目录 |
|---|---|---|---|---|
| S2 | PASS/FAIL | | | spikes/s2-anchor-rpc/evidence/ |
| S1 | | | | |
| S3 | | | | |
| S4 | | | | |

## S2
- 环境：forge x.y.z / node 22.x / viem x.y
- 合约地址：0x… （tx 0x…，block N）
- legacy：可用 / 不可用（原文：…）
- gasPrice/gas 实际：…
- 归档端点 T+72h 回执：成功 / 失败（原文）
- 公共端点 T+72h 回执：…
- finalized/safe tag 响应：…
- 判据逐项：[x] / [ ] …
- 触发回退：无 / ADR-016 → type-2

## S1 … ## S3 … ## S4 …
```

全部四行为 PASS 且回退项已同步到 PRD/ADR 后，PRD 状态方可从 UPDATED DRAFT 改为 TECH-VERIFIED DRAFT，进入 Technical Spec。
