import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { effectDir, workerPath } from "../utils.mts"

describe("runtimeperf worker", () => {
  it("measures one calibrated batch per minimum iteration and validates the final sink", () => {
    const root = mkdtempSync(join(tmpdir(), "effect-runtimeperf-worker-"))
    try {
      const fixturePath = join(root, "fixture.mjs")
      const validationsPath = join(root, "validations.txt")
      writeFileSync(
        fixturePath,
        `import { appendFileSync } from "node:fs"
let count = 0
export const runtimeCase = () => ({
  run: () => {
    count++
    const end = process.hrtime.bigint() + 2_000_000n
    while (process.hrtime.bigint() < end) {}
    return count
  },
  validate: (value) => appendFileSync(${JSON.stringify(validationsPath)}, \`\${value}\\n\`)
})
`
      )
      const result = spawnSync(process.execPath, [
        workerPath,
        "--mode",
        "measure",
        "--fixture",
        fixturePath,
        "--export",
        "runtimeCase",
        "--batch-size",
        "3",
        "--time-ms",
        "1",
        "--warmup-time-ms",
        "1"
      ], {
        cwd: effectDir,
        encoding: "utf8"
      })
      assert.equal(result.status, 0, result.stderr)
      const output = JSON.parse(result.stdout)
      assert.equal(output.runs, 1)
      assert.equal(output.batchSize, 3)
      assert.deepEqual(
        readFileSync(validationsPath, "utf8").trim().split("\n").map(Number),
        [1, 7]
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
