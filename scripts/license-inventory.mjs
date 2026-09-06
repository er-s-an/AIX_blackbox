/** Generate a path-free disclosure of dependencies installed from pnpm-lock.yaml. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const hash = data => createHash('sha256').update(data).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const manifests = ['package.json', ...['apps', 'packages'].flatMap(root =>
  readdirSync(root).map(name => `${root}/${name}/package.json`).filter(existsSync))];
const declarations = new Map();
for (const path of manifests) {
  const manifest = read(path);
  for (const kind of ['dependencies', 'devDependencies']) {
    for (const [name, range] of Object.entries(manifest[kind] || {})) {
      if (range.startsWith('workspace:')) continue;
      declarations.set(name, [...(declarations.get(name) || []), { manifest: path, kind, range }]);
    }
  }
}
const grouped = JSON.parse(execFileSync('pnpm', ['licenses', 'list', '--json'], { encoding: 'utf8' }));
const rows = Object.values(grouped).flat().map(row => ({
  name: row.name,
  versions: row.versions,
  license: row.license,
  source: row.homepage || `https://www.npmjs.com/package/${row.name}`,
  declarations: declarations.get(row.name) || [],
  distributions: row.paths.map(path => {
    const p = read(`${path}/package.json`);
    const licenseFiles = readdirSync(path).filter(name => /^(licen[cs]e|copying|notice|copyright)(\.|$|-)/i.test(name));
    return { version: p.version, repository: p.repository || null,
      package_json_sha256: hash(readFileSync(`${path}/package.json`)),
      license_files: licenseFiles.map(name => ({ name, sha256: hash(readFileSync(`${path}/${name}`)) })) };
  }),
})).sort((a, b) => a.name.localeCompare(b.name, 'en'));
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const report = {
  generated_at: new Date().toISOString(), source_commit: sourceCommit,
  lockfile_sha256: hash(readFileSync('pnpm-lock.yaml')),
  environment: { platform: process.platform, arch: process.arch, node: process.version },
  command: 'pnpm licenses list --json',
  scope: 'Installed workspace npm dependencies, including development dependencies. Other-platform optional packages, system tools and licenses embedded inside native binaries or bundled distributions are not exhaustively enumerated.',
  package_names: rows.length, package_versions: rows.reduce((n, r) => n + r.versions.length, 0),
  packages: rows,
};
mkdirSync('docs/disclosures', { recursive: true });
writeFileSync('docs/disclosures/npm-licenses.json', JSON.stringify(report, null, 2) + '\n');
const table = list => list.map(r => `| [${r.name}](${r.source}) | ${r.versions.join(', ')} | ${r.license} |`).join('\n');
writeFileSync('THIRD_PARTY_NOTICES.md', `# Third-party dependencies and notices

本项目原创代码采用 [MIT](LICENSE)。第三方代码、字体、数据和工具保留各自许可，不能统一再许可为 MIT。

## 源码直接声明的 npm 依赖

以下版本来自当前锁文件安装结果；同一名称的额外版本可能由间接依赖引入。用途与所在包见清单的 declarations 字段。

| 依赖 / 来源 | 已安装版本 | 包声明许可 |
| --- | --- | --- |
${table(rows.filter(r => r.declarations.length))}

## 需要单独说明的间接依赖

| 依赖 / 来源 | 已安装版本 | 包声明许可 |
| --- | --- | --- |
${table(rows.filter(r => !r.declarations.length && !['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD'].includes(r.license)))}

Geist 的随包字体许可为 SIL Open Font License 1.1。caniuse-lite 是浏览器兼容性数据，不是本项目的业务评测数据。libvips 是当前 macOS ARM 安装所解析的图像处理间接依赖，本仓库未提交该二进制；其他平台可能解析不同平台包。上述声明不覆盖所有原生二进制内部组件，分发这些组件时仍应保留其原始许可和 notices。

## 合约与外部工具

- forge-std 1.9.7：commit 77041d2ce690e692d6e03cc812b57d1ddaa4d505；Apache-2.0 OR MIT，见 [上游](https://github.com/foundry-rs/forge-std/tree/77041d2ce690e692d6e03cc812b57d1ddaa4d505)。本仓库保留安装指令，不提交其 checkout。
- Solidity、Foundry、浏览器和 Node.js 的运行时分发还包含各自组件与 notices；npm 包字段不能代替运行时的完整许可文件。
- 模型、合成数据与展示素材的来源见 [披露说明](DISCLOSURES.md)。

## 清单与复现

[机器可读清单](docs/disclosures/npm-licenses.json) 包含 ${rows.length} 个包名、${report.package_versions} 个包版本、声明许可、来源和可取得的顶层许可文件摘要。不含本机绝对路径、密钥或 node_modules 文件。

安装锁定依赖后执行：

\`\`\`sh
pnpm exec node scripts/license-inventory.mjs
\`\`\`

这是已安装依赖的来源披露，不是所有平台、所有嵌套或原生组件的完整法律审计。原始许可文本以对应版本分发包和上游源码为准。
`);
console.log(JSON.stringify({ inventory: resolve('docs/disclosures/npm-licenses.json'), package_names: rows.length, package_versions: report.package_versions }));
