import assert from "node:assert/strict"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { materializeFixture } from "../materialize.mts"

describe("runtimeperf fixture materialization", () => {
  it("preserves relative fixture dependencies", () => {
    const root = mkdtempSync(join(tmpdir(), "effect-runtimeperf-materialize-"))
    try {
      const fixturePath = join(root, "fixtures", "fixture.mts")
      mkdirSync(dirname(fixturePath), { recursive: true })
      writeFileSync(join(dirname(fixturePath), "data.mts"), "export const value = 1\n")
      writeFileSync(fixturePath, 'import { value } from "./data.mts"\nexport { value }\n')

      const materialized = materializeFixture(join(root, "target"), { fixturePath })

      assert.equal(existsSync(join(dirname(materialized), "data.mts")), true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
