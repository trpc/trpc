import * as Permissions from "@effect/platform-browser/Permissions"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"

describe("Permissions", () => {
  it.effect("should be able to query permissions", () =>
    Effect.gen(function*() {
      const service = yield* Permissions.Permissions
      const permissions = yield* service.query("geolocation")
      assert.strictEqual(permissions.state, "granted")
    }).pipe(Effect.provide(Permissions.layer)))
})
