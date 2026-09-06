# Spike Results — 2026-09-05

以实际证据为准，不能把实现存在写成全部 PASS。当前 Gate 0 未全过；用户已授权交错实施与实测，见 docs/predev/09。

| Spike | 状态 | 证据 |
|---|---|---|
| S2 合约与 RPC | PARTIAL / T+72h PENDING | deployments/injective-testnet.json；spikes/s2-anchor-rpc/evidence/；真实部署、存证、幂等与冲突回滚已经验证，72h 尚未到期 |
| S1 钱包签名与恢复 | PARTIAL / MetaMask UI NOT_RUN | spikes/s1-eip712/evidence/signatures.json；3/3 实际软件签名及篡改/链域拒绝通过，无扩展操作截图 |
| S3 CLI + 负例 | 核心检查 PASS；正式发布未完成 | runs/0x06f91c2a95e0cd8bb3203f5f7d8b3a55/negatives/results.json：17/17；dist/afr-verify 独立 Node bundle 在 /tmp 执行在线通过 |
| S4 端到端计时 | PARTIAL | spikes/s4-timing/evidence/timing.json；5 个真实付款闭环，含失败重试与等待，不是 5 轮连续受控基准 |

S2：legacy 交易实际可用，gasPrice=160000000；部署、付款、赔付与承诺各自真实 tx 见部署文件和 runs。公共和归档端点当前均能读取 S2 回执与日志；T+72h 必须到时执行 pnpm history，禁止提前填写 PASS。

S3 修订：N02 缺少 mandate 直接 FORMAT 拒绝；N07 排除文件被纳入 inventory 的失败可体现为 FORMAT/INTEGRITY Fail。N06 删 anchors.json 后，已签名 payment/payout 内的 tx locator 仍足以查询实际收据，因此保持 Pass 并发 warning，见 docs/predev/09，不能人为改 Unknown。

独立信任配置仍是本地工作树版本；CLI 不连接 Gateway，不使用包内信任配置。public 源证据被 withheld，必须标 incomplete；full 的所有关键项可通过。

AI 基线 72 次真实调用为 62/72，NOT PASSED。生产路径增加一次格式/引用校验重试，仍不等于新版本 72 次通过。详见 docs/implementation/ACCEPTANCE.md。
