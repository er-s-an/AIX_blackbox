import { it, expect } from "vitest";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { buildSource } from "./build-source.ts";

it("allows source archives without fabricating a release commit", () => {
  const dir = mkdtempSync(tmpdir() + "/afr-source-test-");
  try {
    expect(buildSource(false, dir)).toEqual({
      source_commit: null, source_dirty: true, source_kind: "unversioned-directory",
    });
    expect(() => buildSource(true, dir)).toThrow("RELEASE_REQUIRES_CLEAN_COMMIT");
    execFileSync("git", ["init", "-q"], { cwd: dir });
    mkdirSync(dir + "/archive");
    expect(buildSource(false, dir + "/archive").source_commit).toBeNull();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
