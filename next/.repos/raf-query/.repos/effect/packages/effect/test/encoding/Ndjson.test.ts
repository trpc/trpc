import { assert, describe, it } from "@effect/vitest"
import { Effect, Stream } from "effect"
import * as Ndjson from "effect/encoding/Ndjson"
import * as Schema from "effect/Schema"

describe("Ndjson", () => {
  it.effect("fails for values without a JSON representation", () =>
    Effect.gen(function*() {
      const inputs = [undefined, () => {}, Symbol("x")]

      for (const input of inputs) {
        const error = yield* Stream.make(input).pipe(
          Stream.pipeThroughChannel(Ndjson.encodeString()),
          Stream.runCollect,
          Effect.flip
        )

        assert.instanceOf(error, Ndjson.NdjsonError)
        assert.strictEqual(error.kind, "Pack")
      }
    }))

  it.effect("decodeSchema decodes records split across Uint8Array chunks", () =>
    Effect.gen(function*() {
      const messages = yield* Stream.make(
        new TextEncoder().encode("{\"foo\":\"bar\"}\n")
      ).pipe(
        Stream.pipeThroughChannel(Ndjson.decodeSchema(Schema.Struct({ foo: Schema.String }))()),
        Stream.runCollect
      )

      assert.deepStrictEqual([...messages], [{ foo: "bar" }])
    }))

  it("identifies Ndjson errors", () => {
    assert.isTrue(Ndjson.isNdjsonError(new Ndjson.NdjsonError({ kind: "Pack", cause: new Error("boom") })))
    assert.isFalse(Ndjson.isNdjsonError({ _tag: "NdjsonError" }))
    assert.isFalse(Ndjson.isNdjsonError(null))
  })
})
