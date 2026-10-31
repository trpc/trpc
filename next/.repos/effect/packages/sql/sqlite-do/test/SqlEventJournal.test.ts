import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import * as esbuild from "esbuild"
import { Miniflare } from "miniflare"
import { fileURLToPath } from "node:url"

const workerPath = fileURLToPath(new URL("./fixtures/eventJournal.ts", import.meta.url))

describe("SqlEventJournal on Durable Object storage", () => {
  it.live(
    "keeps local writes working after an enclosing transaction rolls back an import at the maximum timestamp",
    () =>
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
                    JournalObject: { type: "durable-object", storage: "sqlite" }
                  },
                  env: {
                    JOURNAL: { type: "durable-object", worker: "test", exportName: "JournalObject" }
                  }
                }
              }]
            })
          ),
          (miniflare) => Effect.promise(() => miniflare.dispose())
        )
        const response = yield* Effect.promise(() => miniflare.dispatchFetch("http://localhost/"))
        assert.strictEqual(response.status, 200, yield* Effect.promise(() => response.clone().text()))
        const { entries, rolledBack, written } = yield* Effect.promise(() =>
          response.json() as Promise<{
            readonly rolledBack: string
            readonly written: ReadonlyArray<string> | string
            readonly entries: ReadonlyArray<string>
          }>
        )
        assert.strictEqual(rolledBack, "Failure")
        if (typeof written === "string") return assert.fail("the local write failed after the import was rolled back")
        assert.deepStrictEqual(entries, written)
      }),
    { timeout: 40_000 }
  )
})
