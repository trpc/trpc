import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, ErrorReporter, Exit, Schema } from "effect"
import { HttpApiError } from "effect/http-api"

describe("HttpApiError", () => {
  it.effect("does not report payload schema-validation failures", () =>
    Effect.gen(function*() {
      const schemaError = yield* HttpApiError.HttpApiSchemaError.wrap(
        "Payload",
        Schema.decodeUnknownEffect(Schema.Struct({ name: Schema.String }))({ name: 123 })
      ).pipe(Effect.flip)
      const reports: Array<Cause.Cause<unknown>> = []
      const reporter = ErrorReporter.make(({ cause }) => reports.push(cause))

      const exit = yield* Effect.fail(schemaError).pipe(
        Effect.withErrorReporting,
        Effect.provide(ErrorReporter.layer([reporter])),
        Effect.exit
      )

      assert.instanceOf(schemaError, HttpApiError.HttpApiSchemaError)
      assert.strictEqual(schemaError.kind, "Payload")
      assert.isTrue(Exit.isFailure(exit))
      if (Exit.isFailure(exit)) {
        assert.strictEqual(Cause.squash(exit.cause), schemaError)
      }
      assert.deepStrictEqual(reports, [])
    }))
})
