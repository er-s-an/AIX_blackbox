# 将已有支付工具接入 AFR

Node 22+。安装发行包内的 afr-recorder-0.2.0-beta.1.tgz，不需要编译合约或钱包即可使用记录器。当前工作台为本机单租户测试版，记录不代表承保。

```sh
npm install /absolute/path/afr-recorder-0.2.0-beta.1.tgz
```

在工作台“接入 Agent”创建独立凭证，把凭证设置为 AFR_TOKEN。agentId 使用页面返回值。代码中包装现有支付函数；Agent 框架的工具注册使用包装函数。SDK 不修改模型策略，不保存私钥，不自动重付。

```ts
import {createRecorder} from '@afr/recorder';
const recorder = createRecorder({
  directory: './.afr', agentId: 'agent_FROM_CONSOLE', runId: 'order-001',
  endpoint: 'http://localhost:4311', token: process.env.AFR_TOKEN,
});
recorder.record('authorization', {authorization_id: 'approved-task-1', task: '购买指定报告'});
recorder.record('order', {order_id: 'order-001', resource: 'report-1'});
const pay = recorder.wrapPayment(existingPaymentFunction, {
  operationId: args => args.orderId,
  request: args => ({order_id: args.orderId, amount: args.amount}),
  result: result => ({receipt: result.receipt}),
});
try { await yourAgent.run({pay}); }
finally { try { await recorder.sync(); } finally { recorder.close(); } }
```

`yourAgent.run`、`existingPaymentFunction` 是你已有代码的示意名称，按自己的框架注册。完整独立模型/viem 实例见 examples/external-agent.ts。

支持独立链上核验的 receipt 字段：chain_id=1439、tx_hash、asset、from、to、amount（18 位十进制测试资产字符串）。只核验本实例登记的 AFR-TEST-USD；其他支付渠道显示未核验，不盲信成功字符串。真实支付函数自己负责钱包、发送与确认。

SDK 先 fsync 付款意图再调用工具。同一 operationId 永不自动再次执行；调用报错可能发生在付款成功之后。请查询原支付工具的交易状态，再用 recorder.reconcile(operationId, receipt) 补充实际回执。即使第一次结果成功，再次相同 id 也会拒绝，而非静默调用。不能用新 id 绕过去重来重付。

一份 spool 仅允许一个进程打开；重启后校验所有序号/摘要，未完成操作保持未知。网络不可用不丢本地事件；恢复后用原 agentId/runId 和目录重新打开并 sync，相同批次服务端去重。close 应放 finally。记录文件保存在 .afr/，请加入 .gitignore、保护和备份；文件访问权限 0600，但 SDK spool 并非应用层加密。服务端 SQLite 为加密存储。

每个运行最多 2,000 条事件、8 MiB；单条事件含元数据与换行最多 128,000 字节，服务端也检查此限制。SDK 在付款前预留结果与一次对账的空间，容量不足会抛出 `RUN_RECORD_LIMIT`，原付款函数不会执行。付款执行期间，同一记录器的其他付款、`record` 和 `reconcile` 调用会报 `RECORDER_BUSY`，请等待当前付款结束后继续记录。结果内容超限或交易状态未知时，应先查询原交易再对账，不能改 operationId 重新付款。

只映射必要字段。常见命名的密钥字段自动替换为 [REDACTED]，任意文本中的秘密不能保证自动清除。禁止写入支付密钥、令牌或个人金融数据。本版用于合成数据/测试网试用。撤销凭证会停止后续上传，已收集记录仍保留。

事故发生后打开运行记录，下载当前快照；它不等 AI 或审核，也不要求上链确认。快照整体为 incomplete，文件签名和支持的交易回执可分别通过；最终理赔包是另一个格式。SDK 记录来自客户环境，不具备 TEE 可信执行证明。
