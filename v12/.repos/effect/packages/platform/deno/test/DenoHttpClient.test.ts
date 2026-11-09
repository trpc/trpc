import * as DenoHttpClient from "@effect/platform-deno/DenoHttpClient"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as HttpClient from "effect/http/HttpClient"
import * as Layer from "effect/Layer"
import * as Scope from "effect/Scope"

const unixServer = Effect.acquireRelease(
  Effect.sync(() => {
    const directory = Deno.makeTempDirSync()
    const path = `${directory}/http.sock`
    const server = Deno.serve(
      { path, transport: "unix", onListen: () => {} },
      (request) => new Response(request.headers.get("x-default"))
    )
    return { directory, path, server }
  }),
  ({ directory, server }) =>
    Effect.promise(() => server.shutdown()).pipe(
      Effect.andThen(Effect.sync(() => Deno.removeSync(directory, { recursive: true })))
    )
).pipe(Effect.map(({ path }) => path))

const get = HttpClient.get("http://localhost/").pipe(Effect.flatMap((response) => response.text))

describe("DenoHttpClient", () => {
  it.effect("layerOptions applies the native client over the RequestInit in effect", () =>
    Effect.gen(function*() {
      const path = yield* unixServer
      const responses = yield* Effect.all([
        get,
        get.pipe(Effect.provideService(DenoHttpClient.RequestInit, { headers: { "x-default": "request" } }))
      ]).pipe(
        Effect.provide(
          DenoHttpClient.layerOptions({ proxy: { transport: "unix", path } }).pipe(
            Layer.provide(Layer.succeed(DenoHttpClient.RequestInit, { headers: { "x-default": "layer" } }))
          )
        )
      )
      assert.deepStrictEqual(responses, ["layer", "request"])
    }))

  it.effect("layerOptions closes the native client when the layer scope closes", () =>
    Effect.gen(function*() {
      const path = yield* unixServer
      const scope = yield* Scope.make()
      const context = yield* Layer.buildWithScope(
        DenoHttpClient.layerOptions({ proxy: { transport: "unix", path } }),
        scope
      )
      assert.isTrue(Exit.isSuccess(yield* Effect.exit(Effect.provide(get, context))))
      yield* Scope.close(scope, Exit.void)
      assert.isTrue(Exit.isFailure(yield* Effect.exit(Effect.provide(get, context))))
    }))
})
