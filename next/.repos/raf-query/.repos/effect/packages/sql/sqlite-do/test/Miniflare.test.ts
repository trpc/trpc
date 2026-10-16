import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import * as esbuild from "esbuild"
import { Miniflare } from "miniflare"
import { fileURLToPath } from "node:url"

const workerPath = fileURLToPath(new URL("./fixtures/transaction.ts", import.meta.url))

describe("storage transaction scheduling", () => {
  it.live.each([
    { mode: "commit", success: true, count: 64 },
    { mode: "nested", success: true, count: 64 },
    { mode: "rollback", success: false, count: 0 }
  ])(
    "$mode completes after automatic yields with an outside fiber queued",
    ({ count, mode, success }) =>
      Effect.gen(function*() {
        const bundle = yield* Effect.promise(() =>
          esbuild.build({
            entryPoints: [workerPath],
            bundle: true,
            format: "esm",
            platform: "browser",
            target: "es2022",
            conditions: ["workerd", "worker", "browser"],
            write: false
          })
        )
        const miniflare = yield* Effect.acquireRelease(
          Effect.sync(() =>
            new Miniflare({
              workers: [{
                config: {
                  name: "test",
                  compatibilityDate: "2026-09-11",
                  compatibilityFlags: ["nodejs_compat"],
                  manifest: {
                    mainModule: "index.mjs",
                    modules: {
                      "index.mjs": { type: "esm", contents: bundle.outputFiles[0].text }
                    }
                  },
                  exports: {
                    TransactionObject: { type: "durable-object", storage: "sqlite" }
                  },
                  env: {
                    TEST: { type: "durable-object", worker: "test", exportName: "TransactionObject" }
                  }
                }
              }]
            })
          ),
          (miniflare) => Effect.promise(() => miniflare.dispose())
        )
        const response = yield* Effect.promise(() => miniflare.dispatchFetch(`http://localhost/${mode}`))
        assert.strictEqual(response.status, 200, yield* Effect.promise(() => response.clone().text()))
        assert.deepStrictEqual(yield* Effect.promise(() => response.json()), {
          success,
          outsideRows: [{ n: count }],
          rows: [{ n: count }]
        })
      }),
    { timeout: 40_000 }
  )
})
