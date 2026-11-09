import { ApiDiffError, isApiDiffError } from "@effect/api-diff/Error"
import { isSnapshotExtractionError, SnapshotExtractionError } from "@effect/api-diff/Snapshot"
import { assert, describe, it } from "@effect/vitest"
import { vi } from "vitest"
import type * as ApiDiffErrorModule from "../src/Error.ts"
import type * as SnapshotModule from "../src/Snapshot.ts"

describe("tagged errors", () => {
  it("recognizes errors from a reloaded module copy", async () => {
    vi.resetModules()
    const ForeignApiDiffError = await vi.importActual<typeof ApiDiffErrorModule>("../src/Error.ts")
    const ForeignSnapshot = await vi.importActual<typeof SnapshotModule>("../src/Snapshot.ts")

    const apiDiffError = new ForeignApiDiffError.ApiDiffError({ message: "boom" })
    assert.isFalse(apiDiffError instanceof ApiDiffError)
    assert.isTrue(isApiDiffError(apiDiffError))

    const snapshotError = new ForeignSnapshot.SnapshotExtractionError({
      message: "boom",
      diagnostics: []
    })
    assert.isFalse(snapshotError instanceof SnapshotExtractionError)
    assert.isTrue(isSnapshotExtractionError(snapshotError))
  })
})
