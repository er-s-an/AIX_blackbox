import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";

/** An unpacked source archive is usable, but is not a clean Git release. */
export function buildSource(release = false, cwd = process.cwd()) {
  let source_commit: string | null = null;
  let source_dirty = true;
  try {
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] })
        .toString().trim();
    // Do not accidentally attribute an extracted archive to its parent repo.
    if (realpathSync(git("rev-parse", "--show-toplevel")) === realpathSync(cwd)) {
      source_commit = git("rev-parse", "HEAD");
      source_dirty = !!git("status", "--porcelain");
    }
  } catch { /* A source archive intentionally has no .git directory. */ }
  if (release && (!source_commit || source_dirty))
    throw Error("RELEASE_REQUIRES_CLEAN_COMMIT");
  return {
    source_commit,
    source_dirty,
    source_kind: source_commit ? "git" : "unversioned-directory",
  };
}
