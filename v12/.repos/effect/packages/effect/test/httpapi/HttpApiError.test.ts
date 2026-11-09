import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, ErrorReporter, Exit, Schema } from "effect"
import { HttpServerRespondable } from "effect/http"
import { HttpApiError } from "effect/http-api"

describe("HttpApiError", () => {
  for (const kind of ["Params", "Headers", "Query", "Payload"] as const) {
    it.effect(`responds with 400 and does not report ${kind} decoding failures`, () =>
      Effect.gen(function*() {
        const schemaError = yield* HttpApiError.HttpApiSchemaError.wrap(
          kind,
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
        assert.strictEqual(schemaError.kind, kind)
        assert.isTrue(Exit.isFailure(exit))
        if (Exit.isFailure(exit)) {
          assert.strictEqual(Cause.squash(exit.cause), schemaError)
        }
        assert.deepStrictEqual(reports, [])
        const response = yield* HttpServerRespondable.toResponse(schemaError)
        assert.strictEqual(response.status, 400)
      }))
  }

  for (const kind of ["Body", "ResponseHeaders"] as const) {
    const encodingError = HttpApiError.HttpApiSchemaError.wrap(
      kind,
      Schema.encodeEffect(Schema.Int)(1.5)
    ).pipe(Effect.flip)

    it.effect(`responds with 500 for ${kind} encoding failures`, () =>
      Effect.gen(function*() {
        const error = yield* encodingError
        const response = yield* HttpServerRespondable.toResponse(error)
        assert.strictEqual(response.status, 500)
      }))

    it.effect(`reports ${kind} encoding failures`, () =>
      Effect.gen(function*() {
        const error = yield* encodingError
        const reports: Array<Cause.Cause<unknown>> = []
        const reporter = ErrorReporter.make(({ cause }) => reports.push(cause))

        const exit = yield* Effect.fail(error).pipe(
          Effect.withErrorReporting,
          Effect.provide(ErrorReporter.layer([reporter])),
          Effect.exit
        )

        assert.isTrue(Exit.isFailure(exit))
        assert.strictEqual(reports.length, 1)
        assert.strictEqual(Cause.squash(reports[0]), error)
      }))
  }
})
