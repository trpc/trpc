import { assert, describe, it } from "@effect/vitest"
import * as Version from "effect/Version"

describe("Version", () => {
  it("exposes a real version and supports isolated version overrides", () => {
    const original = Version.getCurrentVersion()
    assert.match(original, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/)
    assert.notStrictEqual(original, "0.0.0")
    try {
      Version.setCurrentVersion("test-version")
      assert.strictEqual(Version.getCurrentVersion(), "test-version")
    } finally {
      Version.setCurrentVersion(original)
    }
    assert.strictEqual(Version.getCurrentVersion(), original)
  })
})
