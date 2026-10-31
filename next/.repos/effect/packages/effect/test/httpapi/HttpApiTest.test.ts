import { assert, it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, FileSystem, Layer, Path, Schema, Stream } from "effect"
import { Etag, HttpPlatform, HttpServerError } from "effect/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup, HttpApiSchema, HttpApiTest } from "effect/http-api"

const TestServices = Layer.mergeAll(Path.layer, Etag.layerWeak, HttpPlatform.layer).pipe(
  Layer.provideMerge(FileSystem.layerNoop({}))
)

it.layer(TestServices)("HttpApiTest streaming", (it) => {
  it.effect("passes each payload element through before the source produces the next", () =>
    Effect.gen(function*() {
      const first = yield* Deferred.make<void>()
      const second = yield* Deferred.make<void>()
      const api = HttpApi.make("Api").add(
        HttpApiGroup.make("test").add(
          HttpApiEndpoint.post("upload", "/upload", {
            payload: HttpApiSchema.StreamNdjson({ schema: Schema.Number }),
            success: Schema.Array(Schema.Number)
          })
        )
      )
      const seen: Array<number> = []
      const groups = HttpApiBuilder.group(api, "test", (handlers) =>
        handlers.handle("upload", ({ payload }) =>
          payload.pipe(
            Stream.tap((n) =>
              Effect.gen(function*() {
                seen.push(n)
                yield* Deferred.succeed(n === 1 ? first : second, undefined)
              })
            ),
            Stream.runCollect
          )))
      const client = yield* HttpApiTest.groups(api, ["test"]).pipe(Effect.provide(groups))
      const source = Stream.make(1).pipe(
        Stream.concat(Stream.fromEffect(Deferred.await(first).pipe(Effect.as(2)))),
        Stream.concat(Stream.fromEffect(Deferred.await(second).pipe(Effect.as(3))))
      )
      const response = yield* client.test.upload({ payload: source })
      assert.deepStrictEqual(seen, [1, 2, 3])
      assert.deepStrictEqual(response, [1, 2, 3])
    }))

  it.effect("dies with the body read failure when the payload source fails", () =>
    Effect.gen(function*() {
      const api = HttpApi.make("Api").add(
        HttpApiGroup.make("test").add(
          HttpApiEndpoint.post("upload", "/upload", { payload: HttpApiSchema.StreamUint8Array() })
        )
      )
      const groups = HttpApiBuilder.group(
        api,
        "test",
        (handlers) => handlers.handle("upload", ({ payload }) => Stream.runDrain(payload))
      )
      const client = yield* HttpApiTest.groups(api, ["test"]).pipe(Effect.provide(groups))
      const exit = yield* client.test.upload({
        payload: Stream.make(new Uint8Array([1])).pipe(Stream.concat(Stream.fail("SourceError")))
      }).pipe(Effect.exit)
      assert(Exit.isFailure(exit))
      const error = Cause.squash(exit.cause)
      assert(HttpServerError.isHttpServerError(error), `Expected HttpServerError, got ${String(error)}`)
      assert.strictEqual(error.reason._tag, "RequestParseError")
    }))

  it.effect("keeps handler resources alive after the call until the response stream finishes", () =>
    Effect.gen(function*() {
      let closed = false
      const api = HttpApi.make("Api").add(
        HttpApiGroup.make("test").add(
          HttpApiEndpoint.get("download", "/download", { success: HttpApiSchema.StreamUint8Array() })
        )
      )
      const groups = HttpApiBuilder.group(
        api,
        "test",
        (handlers) =>
          handlers.handle("download", () =>
            Effect.gen(function*() {
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => {
                  closed = true
                })
              )
              return Stream.fromEffect(Effect.sync(() => {
                assert.isFalse(closed)
                return new Uint8Array([1, 2, 3])
              }))
            }))
      )
      const client = yield* HttpApiTest.groups(api, ["test"]).pipe(Effect.provide(groups))
      const response = yield* client.test.download()
      assert.isFalse(closed)
      const chunks = yield* Stream.runCollect(response)
      assert.deepStrictEqual(chunks, [new Uint8Array([1, 2, 3])])
      assert.isTrue(closed)
    }))
})
