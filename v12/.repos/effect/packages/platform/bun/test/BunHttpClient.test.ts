import * as BunHttpClient from "@effect/platform-bun/BunHttpClient"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as HttpClient from "effect/http/HttpClient"
import * as Layer from "effect/Layer"
import * as Fs from "node:fs"
import * as Os from "node:os"
import * as Path from "node:path"

describe("BunHttpClient", () => {
  it.effect("layerOptions applies native options over the RequestInit in effect", () =>
    Effect.gen(function*() {
      const unix = yield* Effect.acquireRelease(
        Effect.sync(() => {
          const directory = Fs.mkdtempSync(Path.join(Os.tmpdir(), "bun-http-client-"))
          const unix = Path.join(directory, "server.sock")
          const server = Bun.serve({ unix, fetch: (request) => new Response(request.headers.get("x-default")) })
          return { directory, server, unix }
        }),
        ({ directory, server }) =>
          Effect.promise(() => server.stop(true)).pipe(
            Effect.andThen(Effect.sync(() => Fs.rmSync(directory, { recursive: true, force: true })))
          )
      ).pipe(Effect.map(({ unix }) => unix))
      const get = HttpClient.get("http://localhost/").pipe(Effect.flatMap((response) => response.text))
      const responses = yield* Effect.all([
        get,
        get.pipe(Effect.provideService(BunHttpClient.RequestInit, { headers: { "x-default": "request" } }))
      ]).pipe(
        Effect.provide(
          BunHttpClient.layerOptions({ unix }).pipe(
            Layer.provide(Layer.succeed(BunHttpClient.RequestInit, { headers: { "x-default": "layer" } }))
          )
        )
      )
      assert.deepStrictEqual(responses, ["layer", "request"])
    }))
})
