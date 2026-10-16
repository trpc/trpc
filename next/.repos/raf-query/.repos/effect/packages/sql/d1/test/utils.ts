import type { D1Database } from "@cloudflare/workers-types"
import { D1Client } from "@effect/sql-d1"
import { Context, Data, Effect, Layer } from "effect"
import { Miniflare } from "miniflare"

export class MiniflareError extends Data.TaggedError("MiniflareError")<{
  cause: unknown
}> {}

export class D1Miniflare extends Context.Service<
  D1Miniflare,
  Miniflare
>()("test/D1Miniflare") {
  static readonly layer = Layer.effect(this)(
    Effect.acquireRelease(
      Effect.try({
        try: () =>
          new Miniflare({
            workers: [{
              config: {
                name: "test",
                compatibilityDate: "2026-08-30",
                manifest: {
                  mainModule: "index.mjs",
                  modules: {
                    "index.mjs": {
                      type: "esm",
                      contents: "export default {}"
                    }
                  }
                },
                env: {
                  DB: {
                    type: "d1",
                    id: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  }
                }
              }
            }]
          }),
        catch: (cause) => new MiniflareError({ cause })
      }),
      (miniflare) => Effect.promise(() => miniflare.dispose())
    )
  )

  static layerClient = Layer.unwrap(
    Effect.gen(function*() {
      const miniflare = yield* D1Miniflare
      const db: D1Database = yield* Effect.tryPromise(() => miniflare.getD1Database("DB"))
      return D1Client.layer({ db })
    })
  ).pipe(Layer.provide(this.layer))
}
