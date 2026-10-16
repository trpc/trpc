import { assert, describe, makeMethods, test } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"

describe("makeMethods fixtures", () => {
  const it = makeMethods(test.extend("value", () => 1))

  it.effect("it.effect", ({ value }) => Effect.sync(() => assert.strictEqual(value, 1)))

  it.effect.each(["a"])("it.effect.each", (text, { value }) =>
    Effect.sync(() => {
      assert.strictEqual(text, "a")
      assert.strictEqual(value, 1)
    }))

  it.layer(Layer.empty)((it) => {
    it.effect("anonymous layer it.effect", ({ value }) => Effect.sync(() => assert.strictEqual(value, 1)))
  })

  it.layer(Layer.empty)("outer layer", (it) => {
    it.layer(Layer.empty)("nested layer", (it) => {
      it.effect("nested it.effect", ({ value }) => Effect.sync(() => assert.strictEqual(value, 1)))
    })
  })
})

describe("makeMethods registers through the given test API", { concurrent: false }, () => {
  const setups: Array<string> = []
  const it = makeMethods(test.extend("setup", { auto: true }, ({ task }) => {
    setups.push(task.name)
  }))

  it.effect.fails("fails", () => Effect.fail("expected"))

  it.prop("prop", [Schema.Boolean], () => true)

  it.effect.prop("effect.prop", [Schema.Boolean], () => Effect.succeed(true))
  it.live.prop("live.prop", [Schema.Boolean], () => Effect.succeed(true))
  it.effect.skipIf(false)("skipIf", () => Effect.void)
  it.effect.runIf(true)("runIf", () => Effect.void)

  it.layer(Layer.empty)("outer", (it) => {
    it.layer(Layer.empty)("inner", (it) => {
      it.prop("nested prop", [Schema.Boolean], () => true)
    })
  })

  test("runs auto fixtures", () => {
    assert.deepStrictEqual(setups, ["fails", "prop", "effect.prop", "live.prop", "skipIf", "runIf", "nested prop"])
  })
})

describe("makeMethods fixture lifecycle", { concurrent: false }, () => {
  const events: Array<string> = []
  const it = makeMethods(test.extend("resource", ({ task: _ }, { onCleanup }) => {
    events.push("setup")
    onCleanup(() => {
      events.push("teardown")
    })
  }))

  it.effect("uses the fixture", ({ resource: _ }) =>
    Effect.acquireRelease(
      Effect.sync(() => events.push("acquire")),
      () => Effect.sync(() => events.push("release"))
    ))

  test("wraps the test's scope", () => {
    assert.deepStrictEqual(events, ["setup", "acquire", "release", "teardown"])
  })
})
