import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { applyWorktreeDiff, readWorktreeDiff } from "../worktree-diff.mts"

const git = (cwd: string, args: Array<string>) => {
  const result = spawnSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], {
    cwd,
    encoding: "utf8"
  })
  assert.equal(result.status, 0, result.stderr)
}

// Commits `before` in a repository, adds a second worktree at that commit,
// writes `after` into the first one and replays its diff onto the second.
const replay = (before: Record<string, string | Uint8Array>, after: Record<string, string | Uint8Array>) => {
  const root = mkdtempSync(join(tmpdir(), "effect-runtimeperf-diff-"))
  try {
    const source = join(root, "source")
    const target = join(root, "target")
    git(root, ["init", "-q", source])
    for (const [file, content] of Object.entries(before)) writeFileSync(join(source, file), content)
    git(source, ["add", "."])
    git(source, ["commit", "-q", "-m", "before"])
    git(source, ["worktree", "add", "-q", "--detach", target, "HEAD"])
    for (const [file, content] of Object.entries(after)) writeFileSync(join(source, file), content)

    applyWorktreeDiff(target, readWorktreeDiff(source))

    for (const file of Object.keys(after)) {
      assert.deepEqual(readFileSync(join(target, file)), readFileSync(join(source, file)), file)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe("runtimeperf worktree diff", () => {
  it("replays a text change", () => {
    replay({ "a.txt": "a\nb\nc\n" }, { "a.txt": "a\nB\nc\n" })
  })

  it("replays a patch whose last context line is blank", () => {
    replay({ "a.txt": "a\nb\n\n" }, { "a.txt": "A\nb\n\n" })
  })

  it("replays an added whitespace-only last line", () => {
    replay({ "a.txt": "a\n" }, { "a.txt": "a\n  \n" })
  })

  it("replays a binary change", () => {
    replay({ "b.bin": new Uint8Array([0, 1, 2, 3]) }, { "b.bin": new Uint8Array([0, 9, 2, 3, 4]) })
  })
})
