# 00 · 预开发文档包索引与开发准入门

> 日期：2026-09-05 · 对应 PRD v1.3 · 全部能力 NOT STARTED / NOT VERIFIED

## 文档包

| # | 文件 | 内容 | 状态 |
|---|---|---|---|
| 00 | 本文 | 索引、准入门、剩余待决 | – |
| 01 | `01-技术决策记录.md` | 19 条 ADR（栈、哈希、签名、合约键、ZIP、RPC、密钥、测试、不做清单） | ACCEPTED |
| 02 | `02-Spike协议.md` | S1–S4 步骤、通过判据、回退设计、RESULTS 模板 | READY TO RUN |
| 03 | `03-数据模式与合约接口.md` | schemas 导读、派生量、包布局、IEvidenceAnchor / IClaimVault、rule_facts、四态映射 | DRAFT-FROZEN |
| 04 | `04-夹具与评测规范.md` | F01–F06、合成条款、AI 输入包、评测器 S1–S12、扰动集、负例 N01–N11/X01–X05、会话隔离 | SPEC |
| 05 | `05-仓库结构与环境.md` | 目录、工具链版本、.env、脚本、安全基线、本地链 | 骨架已建 |
| 06 | `06-字段映射表.md` | x402 / AP2 / VI → AFR 字段对照（命名参考，非兼容声明） | DRAFT |
| 07 | `07-v1.3复核记录.md` | 独立子代理复核 + 本人交叉核对：40 条全部 COVERED，子代理 4 条误报已说明 | DONE |
| 08 | `08-开发计划.md` | G0 + P1–P8 阶段路线图，每阶段 DoD 与校验方；逐任务实施计划在 Gate 0 后生成 | PLAN |
| – | `../../schemas/*.v1.json` | 9 个 JSON Schema（manifest, anchors, mandate, scenario, analysis, verifier_statement, decision, trusted_signers, ground_truth, verify_result） | DRAFT-FROZEN |
| – | `../../contracts/src/I*.sol`、`script/Deploy.s.sol` | 合约接口 + 主网防线 | 接口 only |
| – | `../../spikes/RESULTS.md` | Spike 结果登记表 | 空表 |

> 2026-09-05 实施授权修订：见 [09](09-实施修订与验收边界.md)。原门清单保留作为验收追踪，不再阻止并行推进实现；未实测项保持未勾选。

## 开发准入门（Gate 0 → 进入 Technical Spec / 实施计划）

全部勾选后才生成 `docs/superpowers/plans/` 实施计划并开始写业务代码：

- [x] **PRD v1.3 独立复核通过**：第二轮评审 40 条发现逐条 COVERED（复核记录 `07-v1.3复核记录.md`）
- [ ] **S2 PASS**（合约部署、eth_call 读回、幂等/冲突、legacy/gas、归档端点 T+72h）
- [ ] **S1 PASS**（EIP-712 签署与恢复、chainId 不匹配拒签、字段可读）
- [ ] **S3 PASS**（JCS 向量、原包四态、N01–N11 + X01–X05 全部命中预期）
- [ ] **S4 PASS**（p50/p95 表、修订 §24、压缩点声明）
- [ ] Spike 触发的回退已同步到 PRD/ADR（ADR-003/006/007/013/016 可能变动）
- [ ] `trusted_signers.json` 占位地址替换为 S2 实际合约地址与三把演示密钥地址
- [ ] `.env` 三把密钥生成并分进程放置；`gitleaks` pre-commit 生效
- [ ] 开源许可证选定（CLI 必须开源）
- [ ] 主办方确认事项已发出：评分权重合计 95% 的核对；预置交易/降级披露规则（PRD §20）

## 人工待决（不阻塞 Spike，阻塞实施计划）

| # | 事项 | 建议 | 责任 |
|---|---|---|---|
| H1 | 开源许可证 | MIT（CLI 与 core）；apps 可同许可 | 二三 |
| H2 | AI 供应商与模型（S4 用两个候选） | 一快一强，OpenAI-compatible 接口 | 二三 |
| H3 | 仓库 URL（trusted_signers.repo.url） | 创建 GitHub 仓库后填 | 二三 |
| H4 | 演示审核员/操作员/评委三个角色由谁扮演 | 现场分工表 | 团队 |
| H5 | 向主办方核对评分权重与降级规则 | 邮件模板可代拟 | 提交负责人 |

## 这套材料不是什么

- 不是代码。`contracts/src/I*.sol` 是接口，`Deploy.s.sol` 只有主网防线，`trusted_signers.json` 全是零地址占位。
- 不是性能承诺。§24 时间表待 S4。
- 不是合规意见。§25 新增的牌照风险需要法律意见，不在本包范围。
