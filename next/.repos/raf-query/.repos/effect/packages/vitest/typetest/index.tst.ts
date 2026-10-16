import { it, layer, makeMethods, type TestContext } from "@effect/vitest"
import { Context, Effect, Layer, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { describe, expect, test } from "tstyche"

class Foo extends Context.Service<Foo, "foo">()("Foo") {}
class Bar extends Context.Service<Bar, "bar">()("Bar") {}

describe("layer", () => {
  test("top-level export accepts full options", () => {
    expect(layer).type.toBeCallableWith(Layer.succeed(Foo, "foo"), {
      concurrent: false,
      timeout: "5 seconds",
      excludeTestServices: true,
      memoMap: undefined as any
    })
  })

  test("top-level export accepts no options", () => {
    expect(layer).type.toBeCallableWith(Layer.succeed(Foo, "foo"))
  })

  test("it.layer accepts full options", () => {
    expect(it.layer).type.toBeCallableWith(Layer.succeed(Foo, "foo"), {
      concurrent: false,
      timeout: "5 seconds",
      excludeTestServices: true,
      memoMap: undefined as any
    })
  })

  test("it.layer accepts no options", () => {
    expect(it.layer).type.toBeCallableWith(Layer.succeed(Foo, "foo"))
  })

  test("nested it.layer accepts concurrency and timeout", () => {
    layer(Layer.succeed(Foo, "foo"))((it) => {
      expect(it.layer).type.toBeCallableWith(Layer.succeed(Bar, "bar"), {
        concurrent: true,
        timeout: "3 seconds"
      })
    })
  })

  test("concurrency does not require other options", () => {
    expect(layer).type.toBeCallableWith(Layer.succeed(Foo, "foo"), { concurrent: true })
    expect(it.layer).type.toBeCallableWith(Layer.succeed(Foo, "foo"), { concurrent: true })
    layer(Layer.succeed(Foo, "foo"))((it) => {
      expect(it.layer).type.toBeCallableWith(Layer.succeed(Bar, "bar"), { concurrent: false })
    })
  })

  test("concurrency must be boolean", () => {
    expect(layer).type.not.toBeCallableWith(Layer.succeed(Foo, "foo"), { concurrent: "false" })
    expect(it.layer).type.not.toBeCallableWith(Layer.succeed(Foo, "foo"), { concurrent: "false" })
    layer(Layer.succeed(Foo, "foo"))((it) => {
      expect(it.layer).type.not.toBeCallableWith(Layer.succeed(Bar, "bar"), { concurrent: "false" })
    })
  })

  test("nested it.layer rejects excludeTestServices", () => {
    layer(Layer.succeed(Foo, "foo"))((it) => {
      expect(it.layer).type.not.toBeCallableWith(Layer.succeed(Bar, "bar"), {
        excludeTestServices: true
      })
    })
  })

  test("nested it.layer rejects memoMap", () => {
    layer(Layer.succeed(Foo, "foo"))((it) => {
      expect(it.layer).type.not.toBeCallableWith(Layer.succeed(Bar, "bar"), {
        memoMap: undefined as any
      })
    })
  })
})

describe("property testing", () => {
  test("infers Schema tuple values and accepts Arbitrary options", () => {
    it.effect.prop(
      "schema tuple",
      [Schema.String, Schema.Int],
      ([text, count]) => {
        expect(text).type.toBe<string>()
        expect(count).type.toBe<number>()
        return Effect.void
      },
      { arbitrary: { runs: 10, seed: "arbitrary" } }
    )
  })

  test("infers Schema record values for the pure property helper", () => {
    it.prop(
      "schema record",
      { text: Schema.String, count: Schema.Int },
      ({ text, count }) => {
        expect(text).type.toBe<string>()
        expect(count).type.toBe<number>()
      },
      { arbitrary: { runs: 10 } }
    )
  })

  test("infers mixed Schema and Arbitrary values", () => {
    const text = Arbitrary.schema(Schema.Literals(["a", "b"]))

    it.effect.prop(
      "mixed tuple",
      [Schema.Int, text],
      ([count, value]) => {
        expect(count).type.toBe<number>()
        expect(value).type.toBe<"a" | "b">()
        return Effect.void
      }
    )

    it.prop(
      "mixed record",
      { count: Schema.Int, text },
      ({ count, text }) => {
        expect(count).type.toBe<number>()
        expect(text).type.toBe<"a" | "b">()
      }
    )
  })
})

describe("fixtures", () => {
  const withValue = makeMethods(it.extend("value", () => 1))

  test("passes the extended context to Effect tests", () => {
    withValue.effect("effect", ({ value }) => {
      expect(value).type.toBe<number>()
      return Effect.void
    })
    withValue.live.skip("live", ({ value }) => {
      expect(value).type.toBe<number>()
      return Effect.void
    })
  })

  test("passes the extended context to each after the case", () => {
    withValue.effect.each(["a"])("each", (text, { value }) => {
      expect(text).type.toBe<string>()
      expect(value).type.toBe<number>()
      return Effect.void
    })
  })

  test("rejects fixtures that were not defined", () => {
    expect(withValue.effect).type.not.toBeCallableWith("effect", (_: { readonly missing: string }) => Effect.void)
  })

  test("keeps the extended context inside layers", () => {
    withValue.layer(Layer.succeed(Foo, "foo"))((it) => {
      it.effect("layer", ({ value }) =>
        Effect.gen(function*() {
          expect(yield* Foo).type.toBe<"foo">()
          expect(value).type.toBe<number>()
        }))
    })
  })

  test("keeps the base context for property tests", () => {
    withValue.effect.prop("prop", [Schema.Int], (_, ctx) => {
      expect(ctx).type.toBe<TestContext>()
      return Effect.void
    })
  })

  test("leaves the default context unchanged", () => {
    it.effect("effect", (ctx) => {
      expect(ctx).type.toBe<TestContext>()
      return Effect.void
    })
  })
})
