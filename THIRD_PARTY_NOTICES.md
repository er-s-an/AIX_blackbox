# Third-party dependencies and notices

本项目原创代码采用 [MIT](LICENSE)。第三方代码、字体、数据和工具保留各自许可，不能统一再许可为 MIT。

## 源码直接声明的 npm 依赖

以下版本来自当前锁文件安装结果；同一名称的额外版本可能由间接依赖引入。用途与所在包见清单的 declarations 字段。

| 依赖 / 来源 | 已安装版本 | 包声明许可 |
| --- | --- | --- |
| [@fastify/cookie](https://github.com/fastify/fastify-cookie#readme) | 11.1.2 | MIT |
| [@fastify/cors](https://github.com/fastify/fastify-cors#readme) | 11.3.0 | MIT |
| [@fastify/helmet](https://github.com/fastify/fastify-helmet#readme) | 13.1.1 | MIT |
| [@fastify/rate-limit](https://github.com/fastify/fastify-rate-limit#readme) | 10.3.0 | MIT |
| [@openzeppelin/contracts](https://openzeppelin.com/contracts/) | 5.4.0 | MIT |
| [@playwright/test](https://playwright.dev) | 1.63.0 | Apache-2.0 |
| [@radix-ui/react-icons](https://www.npmjs.com/package/@radix-ui/react-icons) | 1.3.2 | MIT |
| [@tailwindcss/postcss](https://tailwindcss.com) | 4.1.18 | MIT |
| [@types/better-sqlite3](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/better-sqlite3) | 7.6.13 | MIT |
| [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node) | 22.20.1 | MIT |
| [@types/react](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react) | 19.2.18 | MIT |
| [@types/react-dom](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react-dom) | 19.2.7 | MIT |
| [@vitest/coverage-v8](https://github.com/vitest-dev/vitest/tree/main/packages/coverage-v8#readme) | 3.2.6 | MIT |
| [ajv](https://ajv.js.org) | 8.20.0 | MIT |
| [ajv-formats](https://github.com/ajv-validator/ajv-formats#readme) | 3.0.1 | MIT |
| [better-sqlite3](http://github.com/WiseLibs/better-sqlite3) | 12.11.1 | MIT |
| [canonicalize](https://github.com/erdtman/canonicalize#readme) | 2.1.0 | Apache-2.0 |
| [dotenv](https://github.com/motdotla/dotenv#readme) | 16.6.1 | BSD-2-Clause |
| [esbuild](https://github.com/evanw/esbuild#readme) | 0.25.12, 0.28.2 | MIT |
| [fastify](https://fastify.dev/) | 5.12.3 | MIT |
| [fflate](https://101arrowz.github.io/fflate) | 0.8.3 | MIT |
| [geist](https://vercel.com/font) | 1.4.2 | SIL OPEN FONT LICENSE |
| [jsonc-parser](https://github.com/microsoft/node-jsonc-parser#readme) | 3.3.1 | MIT |
| [next](https://nextjs.org) | 15.5.25 | MIT |
| [node](https://github.com/aredridel/node-bin-gen#readme) | 22.23.2 | MIT |
| [react](https://react.dev/) | 19.2.8 | MIT |
| [react-dom](https://react.dev/) | 19.2.8 | MIT |
| [tailwindcss](https://tailwindcss.com) | 4.1.18 | MIT |
| [tsx](https://tsx.hirok.io) | 4.23.13 | MIT |
| [typescript](https://www.typescriptlang.org/) | 5.9.3 | Apache-2.0 |
| [viem](https://viem.sh) | 2.56.3 | MIT |
| [vitest](https://github.com/vitest-dev/vitest#readme) | 3.2.6 | MIT |

## 需要单独说明的间接依赖

| 依赖 / 来源 | 已安装版本 | 包声明许可 |
| --- | --- | --- |
| [@img/sharp-libvips-darwin-arm64](https://sharp.pixelplumbing.com) | 1.3.3 | LGPL-3.0-or-later |
| [caniuse-lite](https://github.com/browserslist/caniuse-lite#readme) | 1.0.30001810 | CC-BY-4.0 |
| [expand-template](https://github.com/ralphtheninja/expand-template) | 2.0.3 | (MIT OR WTFPL) |
| [jackspeak](https://github.com/isaacs/jackspeak#readme) | 3.4.3 | BlueOak-1.0.0 |
| [lightningcss](https://github.com/parcel-bundler/lightningcss#readme) | 1.30.2 | MPL-2.0 |
| [lightningcss-darwin-arm64](https://github.com/parcel-bundler/lightningcss#readme) | 1.30.2 | MPL-2.0 |
| [minimatch](https://github.com/isaacs/minimatch#readme) | 10.2.6 | BlueOak-1.0.0 |
| [minipass](https://github.com/isaacs/minipass#readme) | 7.1.3 | BlueOak-1.0.0 |
| [package-json-from-dist](https://github.com/isaacs/package-json-from-dist#readme) | 1.0.1 | BlueOak-1.0.0 |
| [path-scurry](https://github.com/isaacs/path-scurry#readme) | 1.11.1 | BlueOak-1.0.0 |
| [rc](https://github.com/dominictarr/rc#readme) | 1.2.8 | (BSD-2-Clause OR MIT OR Apache-2.0) |

Geist 的随包字体许可为 SIL Open Font License 1.1。caniuse-lite 是浏览器兼容性数据，不是本项目的业务评测数据。libvips 是当前 macOS ARM 安装所解析的图像处理间接依赖，本仓库未提交该二进制；其他平台可能解析不同平台包。上述声明不覆盖所有原生二进制内部组件，分发这些组件时仍应保留其原始许可和 notices。

## 合约与外部工具

- forge-std 1.9.7：commit 77041d2ce690e692d6e03cc812b57d1ddaa4d505；Apache-2.0 OR MIT，见 [上游](https://github.com/foundry-rs/forge-std/tree/77041d2ce690e692d6e03cc812b57d1ddaa4d505)。本仓库保留安装指令，不提交其 checkout。
- Solidity、Foundry、浏览器和 Node.js 的运行时分发还包含各自组件与 notices；npm 包字段不能代替运行时的完整许可文件。
- 模型、合成数据与展示素材的来源见 [披露说明](DISCLOSURES.md)。

## 清单与复现

[机器可读清单](docs/disclosures/npm-licenses.json) 包含 254 个包名、265 个包版本、声明许可、来源和可取得的顶层许可文件摘要。不含本机绝对路径、密钥或 node_modules 文件。

安装锁定依赖后执行：

```sh
pnpm exec node scripts/license-inventory.mjs
```

这是已安装依赖的来源披露，不是所有平台、所有嵌套或原生组件的完整法律审计。原始许可文本以对应版本分发包和上游源码为准。
