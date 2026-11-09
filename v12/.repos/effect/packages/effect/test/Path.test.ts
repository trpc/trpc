import { describe, it } from "@effect/vitest"
import { assertNone, assertSome, assertTrue, strictEqual } from "@effect/vitest/utils"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"

describe("Path", () => {
  it.effect("format adds a missing dot to extensions", () =>
    Effect.gen(function*() {
      const path = yield* Path.Path

      strictEqual(path.format({ name: "report", ext: "csv" }), "report.csv")
      strictEqual(path.format({ name: "report", ext: ".csv" }), "report.csv")
      strictEqual(path.format({ name: "report", ext: "" }), "report")
    }).pipe(Effect.provide(Path.layer)))

  it.effect("resolveWithin keeps POSIX paths lexically inside the root", () =>
    Effect.gen(function*() {
      const path = yield* Path.Path

      assertSome(path.resolveWithin("/srv/app", "src/index.ts"), "/srv/app/src/index.ts")
      assertSome(path.resolveWithin("/srv/app/", "src/index.ts"), "/srv/app/src/index.ts")
      assertSome(path.resolveWithin("/srv/app", "."), "/srv/app")
      assertSome(path.resolveWithin("/srv/app", ""), "/srv/app")
      assertSome(path.resolveWithin("/srv/app", "..foo"), "/srv/app/..foo")
      assertSome(path.resolveWithin("/", "etc/passwd"), "/etc/passwd")

      assertNone(path.resolveWithin("/srv/app", "../app-other/x.ts"))
      assertNone(path.resolveWithin("/srv/app", "a/../../b"))
      assertNone(path.resolveWithin("/srv/app", "/etc/passwd"))
    }).pipe(Effect.provide(Path.layer)))

  it.effect("fromFileUrl fails with BadArgument for malformed percent-encodings", () =>
    Effect.gen(function*() {
      const path = yield* Path.Path

      strictEqual(yield* path.fromFileUrl(new URL("file:///tmp/a%20b")), "/tmp/a b")

      const error = yield* Effect.flip(path.fromFileUrl(new URL("file:///tmp/%")))
      strictEqual(error._tag, "BadArgument")
      strictEqual(error.module, "Path")
      strictEqual(error.method, "fromFileUrl")
      assertTrue(error.cause instanceof URIError)
    }).pipe(Effect.provide(Path.layer)))
})
