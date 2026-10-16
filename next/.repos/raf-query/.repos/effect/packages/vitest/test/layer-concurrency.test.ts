import { assert, describe, it, layer, type Vitest } from "@effect/vitest"
import { Effect, Layer } from "effect"

const checkConcurrency = (
  it: Vitest.MethodsNonLive,
  concurrent: boolean,
  options?: { readonly concurrent: boolean }
) => {
  let running = 0
  let release!: () => void
  const bothStarted = new Promise<void>((resolve) => {
    release = resolve
  })

  for (const name of ["first", "second"]) {
    it.effect(name, (ctx) =>
      Effect.gen(function*() {
        assert.strictEqual(ctx.task.concurrent ?? false, concurrent)
        running++
        if (running === 2) release()
        try {
          if (concurrent) {
            yield* Effect.promise(() => bothStarted)
          } else {
            // Let another test start if the suite was accidentally made concurrent.
            yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
            assert.strictEqual(running, 1)
          }
        } finally {
          running--
        }
      }), options)
  }
}

for (const [name, makeLayer] of [["layer", layer], ["it.layer", it.layer]] as const) {
  describe(name, () => {
    for (const concurrent of [false, true]) {
      describe(`enclosing suite concurrent=${concurrent}`, { concurrent }, () => {
        makeLayer(Layer.empty)("named layer inherits by default", (it) => {
          checkConcurrency(it, concurrent)
        })

        makeLayer(Layer.empty, { concurrent: !concurrent })("named layer overrides enclosing suite", (it) => {
          checkConcurrency(it, !concurrent)

          it.layer(Layer.empty)("nested layer inherits", (it) => {
            checkConcurrency(it, !concurrent)
          })

          it.layer(Layer.empty, { concurrent })("nested layer overrides parent", (it) => {
            checkConcurrency(it, concurrent)
          })

          describe("test options override layer", () => {
            checkConcurrency(it, concurrent, { concurrent })
          })
        })

        describe("anonymous layer preserves enclosing suite", () => {
          makeLayer(Layer.empty, { concurrent: !concurrent })((it) => {
            checkConcurrency(it, concurrent)

            it.layer(Layer.empty)("nested layer inherits enclosing suite", (it) => {
              checkConcurrency(it, concurrent)
            })
          })
        })
      })
    }
  })
}
