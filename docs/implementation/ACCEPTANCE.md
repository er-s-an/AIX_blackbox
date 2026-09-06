# 实施与真实验收记录

> 此文件保留首次原型基线。后续 72/72 评测、ego 验证和 Git 版本见 [当前状态](HACKATHON-STATUS.md)。

记录时间：2026-09-05T11:38:44.427Z。结论：测试网核心闭环已实现并实测；PRD 全部验收门未通过，不标记开发全部完成或生产就绪。

## 已完成

- 三个真实合约部署；用户 EIP-712 实签、AUTH 上链、真实 Agent 工具循环、实际 ERC-20 付款、真实 GLM 分析、operator 签名决定与 Vault 赔付、最终 PACKET 承诺、独立 CLI。
- 5 个付款闭环：3 个 Paid、2 个 Denied；另有未付款 Not Eligible 结案。
- 公开脱敏包单独上链，缺失原文项标 Not Present / incomplete；不伪装 full。
- Core 7 测试、Foundry 10 测试（含 512 次 fuzz）、17 个原包/负例检查、7 个真实 HTTP 权限检查、TS 和 Next 生产构建通过。
- Playwright 对真实后端登录、案件切换、ZIP 下载通过，页面错误 0，390px 无横向溢出。
- 独立 bundle 在 /tmp 工作目录执行通过，不调用 Gateway/AI。离线链上项 Unknown；public 退出 3 是预期。

## 链上证据

| Session | 状态 | 付款 | 赔付 | 最终 PACKET | 本地证据 |
|---|---|---|---|---|---|
| 0x724b1645118856ad6153d5d5cccf02ed | Paid | [0x2a2d2f2b29…](https://testnet.blockscout.injective.network/tx/0x2a2d2f2b296d7ffe87b04184abecf663202f2a6cf1151e7b6d73b321f64bd950) | [0x5894955768…](https://testnet.blockscout.injective.network/tx/0x58949557682bc56c4425953b5c5b2f568bdd954cace53e2a6afc4ee5e11a8aab) | [0x35f0d323db…](https://testnet.blockscout.injective.network/tx/0x35f0d323db93c2bee61759c39cc3385996eb0ffef7699aee6dfdab84252fddd1) | [ZIP](../../runs/0x724b1645118856ad6153d5d5cccf02ed/packet-v1.zip) |
| 0x26d6d2e3002b38722d135cdca3504da4 | Denied | [0xce759716a3…](https://testnet.blockscout.injective.network/tx/0xce759716a3836d20ba17c953d858727adf97e4762a196faaab7769789510d1aa) | — | [0x2d449bcdef…](https://testnet.blockscout.injective.network/tx/0x2d449bcdef0252e5735a2b3d5d2af3a168622e93ad6943948535844e0587d889) | [ZIP](../../runs/0x26d6d2e3002b38722d135cdca3504da4/packet-v1.zip) |
| 0xb16ec952a824715d8ec1bde602a0ddc4 | Not Eligible | — | — | [0x83267a1d08…](https://testnet.blockscout.injective.network/tx/0x83267a1d081a23a0c891fc2574e33abf6dfb84a86229d95b26d9155516d3ec80) | [ZIP](../../runs/0xb16ec952a824715d8ec1bde602a0ddc4/packet-v1.zip) |
| 0xb3be383e7d1635d35395fe7a58f93a6d | Paid | [0x272ee03a96…](https://testnet.blockscout.injective.network/tx/0x272ee03a96041608209d1360a9ef5e631c4850a705bdfebc253c796a936be09c) | [0xe7d35db2bf…](https://testnet.blockscout.injective.network/tx/0xe7d35db2bf62cbe3ad08e4e30465cff8cc01a5847f5d7d074584983ec9d1d6a4) | [0xdcaf70d195…](https://testnet.blockscout.injective.network/tx/0xdcaf70d195611938ed00feca340ec7eae2f4b97b6895eb03245aa1c00af722df) | [ZIP](../../runs/0xb3be383e7d1635d35395fe7a58f93a6d/packet-v1.zip) |
| 0x06f91c2a95e0cd8bb3203f5f7d8b3a55 | Paid | [0x61d05d697c…](https://testnet.blockscout.injective.network/tx/0x61d05d697c20be0e2d2a3e543a8c7b81511bda18619a991dd54c3e9e217c98fa) | [0x648bd9e685…](https://testnet.blockscout.injective.network/tx/0x648bd9e6857703cd6b85fcce8b4e2ba4f989e2d38faca731ad06a5a93355101c) | [0x4d2bf5b3d5…](https://testnet.blockscout.injective.network/tx/0x4d2bf5b3d53b939932efa66d81ec1c9a7e38110c85b7fc2314afea13b8dc801a) | [ZIP](../../runs/0x06f91c2a95e0cd8bb3203f5f7d8b3a55/packet-v2.zip) |
| 0x11624f7699b9dca9b8cf02b3484a7be6 | Denied | [0x4be26f328e…](https://testnet.blockscout.injective.network/tx/0x4be26f328e40708b6001e321035084bbb8aa4c09898f9400ca1eb75e29d10a5e) | — | [0xbd92b95a8c…](https://testnet.blockscout.injective.network/tx/0xbd92b95a8cdbd5f8ab913c4f6d9fc306609bdb71561282e8c933e2d6b3972a8d) | [ZIP](../../runs/0x11624f7699b9dca9b8cf02b3484a7be6/packet-v1.zip) |

完整记录：deployments/injective-testnet.json、各 runs/<session>/LIVE-RESULT.json、verify-v*.json。原包负例在 runs/0x06f91c2a95e0cd8bb3203f5f7d8b3a55/negatives/results.json。公开包与原包的 namespace 不同。

## 未通过或尚待实测

1. **AI 全量能力：62/72，NOT PASSED**。模型 glm-5.2；见 [完整报告](../../runs/evaluation-2026-09-05T11-21-14-201Z/REPORT.json) 与逐次原始请求/响应。六类合成评测输入不是真实链上收据；72 次模型调用是真实的。既有结果不删除、不挑选。运行中断后按名称继续，已评分的结果未重复替换；并发度最多 3。最后加入的 schema/ref/quote 校验与一次真实重试已用于补完两次失败会话，但尚未重跑其新的全量 72 次能力认证；不沿用旧结果宣称新版本通过。
2. **S1 MetaMask UI：NOT_RUN**。软件真实签名 3/3、篡改/错误链域反例通过；无扩展实操证据，未注入 mock provider。
3. **S2 T+72h：PENDING**。自 2026-09-05T10:44:44.879Z 起算，至少到 2026-09-08T10:44:44.879Z 才能执行要求的 72h 留存验证。当前两个真实 RPC 均返回该交易成功。
4. **S4：PARTIAL**。真实时间线已统计，包含分析失败与重试间的等待；不冒充五轮连续受控 p95，也不含人工钱包操作计时。
5. 新广播到 tx hash 本地落盘之间的崩溃窗口、自动数据保留/删除、完整密钥运维、远端 TLS/多租户认证仍非生产实现。
6. GitHub URL/公开信任配置发布、现场真人角色操作和主办方确认仍待外部决定；没有 commit/push、npm 发布或发送邮件。

## 实验边界

- 本次攻击配置是刻意信任供应商路由的 legacy-vendor-trust/1。默认 GLM 拒绝攻击的失败案例也保留；不声称攻破默认防护。
- live.ts 的审批明确是用户授权的自动化集成测试，不是真人 UI 审批记录。真实界面允许审核员自行写理由、批准/拒绝。
- 上链的是带盐 manifest 承诺和完整签名授权承诺。Restricted 原文、AI 输入与报告留在链下；不是将原始证据公示上链。
- verifier statement 是软件密钥签名，不是 TEE 证明；完整性与交易记录不证明模型结论或赔付决定正确。

## 下一步准入

先完成 MetaMask UI 验证、修复并重跑 AI 全量评测、到时执行 pnpm history，再按 Spike 协议补受控计时。全部证据到位后才能把 Gate 0 标全 PASS；现阶段只能称“真实闭环可运行的测试网原型”。
