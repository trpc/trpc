import { spawnSync } from "node:child_process"

// Returns stdout untouched: a patch ends in newlines and can end in a context
// line that is a single space, so trimming it corrupts the patch.
const gitRaw = (cwd, args, input) => {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    input
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${result.stdout}${result.stderr}`.trim())
  }
  return result.stdout
}

/** The uncommitted changes to tracked files of `root`, as a binary patch. */
export const readWorktreeDiff = (root) => gitRaw(root, ["diff", "--binary", "HEAD", "--"])

/** Applies a patch read by `readWorktreeDiff` to the worktree at `root`. */
export const applyWorktreeDiff = (root, diff) => {
  if (diff !== "") gitRaw(root, ["apply", "--binary", "-"], diff)
}
