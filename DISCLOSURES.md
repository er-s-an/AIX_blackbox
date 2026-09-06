# 开源库、模型、数据集、赛前资产与许可披露

项目：**BLACK BOX / Agent Flight Recorder**。整理日期：2026-09-06。源码基线：`43d57a3`，另含本次披露文件和清单生成脚本。

本说明覆盖本仓库实现，并补充列出可能随比赛展示的独立网站和概念影片。展示网站、影片、PPT 的二进制文件与源工程不在本仓库内；概念动画不作为真实功能运行的证明。

## 1. 项目代码与第三方开源库

本项目原创代码按根目录 [MIT License](LICENSE) 发布。复用的第三方代码、字体、数据和工具保留各自许可；本项目的 MIT 声明不改变它们的版权或许可。

| 组成 | 主要来源与使用方式 | 许可摘要 |
| --- | --- | --- |
| 工作台 | React、Next.js、Tailwind CSS、Radix Icons；界面、样式与图标 | MIT |
| Gateway 与存储 | Fastify 及其插件、better-sqlite3；HTTP 服务与本地存储 | MIT；具体原生组件遵循自身 notices |
| 支付与合约 | viem、OpenZeppelin Contracts；测试网客户端及 ERC-20/权限基础组件 | MIT |
| 数据格式与证据包 | ajv、ajv-formats、fflate、jsonc-parser；schema 校验、ZIP 和 JSON 处理 | MIT |
| 规范化 | canonicalize；JSON Canonicalization Scheme | Apache-2.0 |
| 配置与开发 | dotenv；TypeScript、Playwright、Vitest、esbuild、tsx 等 | BSD-2-Clause / Apache-2.0 / MIT，逐项见清单 |
| 字体 | Geist | SIL Open Font License 1.1 |
| 合约测试库 | forge-std 1.9.7，固定 commit `77041d2ce690e692d6e03cc812b57d1ddaa4d505` | Apache-2.0 OR MIT |

精确版本、直接依赖和特别许可的间接依赖见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。[机器可读清单](docs/disclosures/npm-licenses.json) 来自锁文件安装后实际扫描：254 个 npm 包名、265 个包版本，包含开发依赖。它不是所有操作系统、所有嵌套组件或原生二进制的穷尽清单。

特别列明：lightningcss 为 MPL-2.0；当前 macOS ARM 安装解析的 sharp/libvips 平台包声明 LGPL-3.0-or-later；caniuse-lite 的浏览器兼容性数据为 CC-BY-4.0。源码仓库未提交 node_modules、原生二进制或系统工具。分发依赖或其衍生组件时应随附对应版本的原始许可和 notices，不能只附本项目 MIT。

## 2. 模型、外部服务与数据流

### 运行时模型

| 项目 | 当前披露 |
| --- | --- |
| 使用方式 | 通过 OpenAI-compatible HTTP API 调用外部推理服务；没有自行训练、微调或分发模型权重 |
| 实际配置与历史记录中的模型 ID | `glm-5.2`，用于 Agent 工具选择与受控流程的证据分析 |
| 接入服务 | OpenAgents Demo Model Gateway：`https://api-gateway.openagents.org/v1` |
| 可公开核对的来源 | [网关说明](https://api-gateway.openagents.org/)、[API 文档](https://api-gateway.openagents.org/docs)、[模型列表](https://api-gateway.openagents.org/v1/models)；2026-09-06 读取的列表包含 `glm-5.2` |
| 许可边界 | 使用网关服务及其上游模型服务的适用条款；没有将模型权重纳入本项目 MIT，也不把网关模型 ID 当作已验证的官方权重版本 |

通用条款参考：[OpenAgents Terms](https://openagents.org/terms)、[Privacy Policy](https://openagents.org/privacy)。这些页面没有提供可据以确认本次模型请求处理地域、具体上游权重版本和独立网关授权范围的完整信息；这些事项标为**未核实**，不推断为自研模型或获得任意再分发授权。

### 发往云端的数据

- 真实模型请求包含合成任务、供应商内容、工具定义/结果，以及受控分析所需的授权、证据、规则和合成条款；可能包含测试钱包地址、公开签名或测试网交易信息。
- 当前演示与评测不使用真实客户资料或个人金融业务数据，不向模型发送钱包私钥或 API 令牌。鉴权令牌只在调用网关时用于 Authorization header，不写入模型消息。
- **请求离开本机并由外部云服务处理；处理地域未核实，按可能跨境披露。** 不声称“数据不出境”或“全部在本地/TEE 内运行”。
- `recorder-only` 模式不调用模型。SDK 只有显式 `sync()` 才将映射事件发送到所配置的 Gateway，默认是本机地址。
- AI 分析可能包含错误或幻觉；schema、引用与原文检查并不证明结论正确。最终复核由人作出，模型不自动决定真实赔付。

### 开发辅助

项目使用 AI 辅助编码、测试、文档与视觉制作，包含 Codex。开发助手不是运行时模型，也不作为项目自研模型披露。具体助手底层模型若没有可靠版本记录，不补写猜测版本。

## 3. 数据集与输入素材

| 数据 | 来源、用途与许可边界 |
| --- | --- |
| `fixtures/F01`–`F06` | 项目内构建的六类合成证据/标签夹具；用于功能与分析评测，随项目源码 MIT 分发 |
| `fixtures/catalog.ts` | 项目内合成供应商目录、报告、任务偏离文本和测试条款；不是真实商户、保单或购买建议 |
| `ground_truth.json` | 评测标签；不用于训练或微调，模型请求按代码中的显式字段选择构造，标签文件不作为推理输入 |
| 交易与存证数据 | 项目在 Injective EVM 测试网上生成的交易、回执与承诺，使用公开 RPC 核对；属于测试网实验，不代表真实客户资金 |
| JSON/密码学测试向量 | 仓库内构造的功能测试输入；不是外部业务数据集 |
| 浏览器兼容性数据 | 间接构建依赖 caniuse-lite；CC-BY-4.0，已在依赖清单单列，不是业务评测数据 |

本次实现未引入外部业务训练/评测数据集，也未抓取真实客户金融数据。夹具里的 `example.org` 链接是合成内容中的示例地址，不是外部报告来源。评测中的变体与重复运行不能描述成同等数量的独立真实事故样本。

## 4. 赛前资产与原创/复用

**团队声明（2026-09-06 确认）：没有赛前自有资产；代码、网站、PPT 和视频等项目工作均自 2026 年 9 月 5 日开始。**

本地开发历史的最早已记录提交为 2026-09-05 17:27:01（UTC+8）；公开仓库初次上传为 2026-09-06。提交时间只提供已留存的开发时间线，不独立证明首次创作时间，也不替代主办方对赛期的认定。

本项目未把赛前成熟自有项目作为本次原创成果提交。通用开发工具、开源依赖、模型 API、字体、图标和下节所列第三方组件仍属于外部复用，不因“无赛前自有资产”而省略披露。

## 5. 网站、影片与展示素材（独立工程）

以下内容不包含在本仓库源码中；若网站、PPT 或概念影片随比赛展示，应一并使用本节的来源说明。

| 素材 / 工具 | 来源与实际用法 | 许可 / 边界 |
| --- | --- | --- |
| 网站 UI 与三维场景 | React 19.2.8、Three.js 0.185.1、Framer Motion 12.43.0；项目代码构建几何、材质与交互 | MIT；不声称导入的库为自研 |
| 网站图标和字体 | Phosphor Icons 2.1.10；Geist / Geist Mono 的 Fontsource 包 5.3.0 | 图标 MIT；字体 OFL-1.1 |
| 两个切换/背景动效组件 | 从 motion-primitives commit `92586e62a951eb9b6bfd1cc7c8a4e6e2ab6ba17d` 改写 | MIT，来源和原许可见 [展示组件 notices](docs/disclosures/showcase-components-NOTICE.txt) |
| 边框光束组件 | 从 Magic UI commit `1246d6d404c556f03867fc6d447f2867eee8a42b` 改写 | MIT，同上保留原署名 |
| 概念影片渲染 | Remotion 4.0.521、React Three Fiber、Three.js | Remotion 使用自己的 Free/Company License，不能统称为 MIT；见 [随安装版本的许可](docs/disclosures/remotion-4.0.521-LICENSE.md) |
| 概念影片语音 | Microsoft Edge 在线 TTS；当前 Confidence 版本使用 `zh-CN-YunyangNeural`，早期影片还使用过 `zh-CN-YunxiNeural`；由 edge-tts 7.2.8 调用 | 是合成语音、非真人克隆；客户端主要为 LGPLv3，个别文件为 MIT；在线语音服务和生成输出仍适用服务方条款，不因客户端开源而自动获得任意用途授权 |
| 配乐与音效 | 影片工程的 Python/NumPy 脚本合成电子配乐和音效 | 项目生成，未使用第三方商业广告音乐录音 |
| 产品概念图片 | 内置 `image_gen` 生成和编辑的概念视觉；工程保留提示词与源文件记录 | AI 生成视觉，非实物摄影；生成服务的适用条款独立于源码 MIT |
| 品牌标志与部分参考图 | 用户提供轮廓/图片参考，项目内重建 SVG、三维形状和派生图 | 已披露外部输入来源；参考图的独立权属/授权文件未在仓库中验证，不将其冒称为独立原创或第三方 MIT 图库素材 |

### 仍未被本次核验覆盖的事项

1. 模型网关/上游及在线语音服务的具体处理地域和适用于比赛分发的服务授权细节。
2. 用户提供的标志/参考图的独立权属文件，以及最终实际提交的每个 PPT/视频资产版本。

本文件提供来源、使用方式和已知许可披露；上述未核实项保留原状，不将“已列出”表述为“全部授权已经逐项核准”。
