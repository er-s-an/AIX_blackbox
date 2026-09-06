import { build } from "esbuild";
import { mkdirSync, writeFileSync, cpSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { buildSource } from "./build-source.ts";
const release = process.argv.includes("--release");
const source = buildSource(release);
const out = "dist/afr-recorder";
mkdirSync(out, { recursive: true });
await build({
  entryPoints: ["packages/recorder/src/index.ts"],
  outfile: out + "/index.mjs",
  bundle: true,
  alias: { "jsonc-parser": "jsonc-parser/lib/esm/main.js" },
  platform: "node",
  target: "node22",
  format: "esm",
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
writeFileSync(
  out + "/package.json",
  JSON.stringify(
    {
      name: "@afr/recorder",
      version: "0.2.0-beta.1",
      type: "module",
      exports: { ".": { types: "./index.d.ts", import: "./index.mjs" } },
      engines: { node: ">=22" },
      license: "MIT",
      files: ["index.mjs", "index.d.ts", "README.md", "LICENSE", "BUILD.json"],
    },
    null,
    2,
  ),
);
execFileSync("pnpm", [
  "exec",
  "tsc",
  "packages/recorder/src/index.ts",
  "--declaration",
  "--emitDeclarationOnly",
  "--outDir",
  out + "/types",
  "--module",
  "nodenext",
  "--moduleResolution",
  "nodenext",
  "--target",
  "es2022",
  "--skipLibCheck",
  "--esModuleInterop",
  "--allowImportingTsExtensions",
]);
cpSync(out + "/types/recorder/src/index.d.ts", out + "/index.d.ts");
cpSync("LICENSE", out + "/LICENSE");
cpSync("docs/product/SDK-GUIDE.md", out + "/README.md");
writeFileSync(
  out + "/BUILD.json",
  JSON.stringify(
    { ...source, release_candidate: release, published: false, version: "0.2.0-beta.1" },
    null,
    2,
  ),
);
execFileSync("npm", ["pack", "--pack-destination", ".."], {
  cwd: out,
  stdio: "inherit",
});
