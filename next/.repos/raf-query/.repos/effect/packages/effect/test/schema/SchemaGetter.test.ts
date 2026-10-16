import { assert, describe, it } from "@effect/vitest"
import { DateTime, Effect, Option, Result, SchemaGetter, SchemaIssue } from "effect"
import { assertSome, deepStrictEqual } from "../utils/assert.ts"

const formatIssue = SchemaIssue.makeFormatterDefault()

function makeAsserts<T, E>(getter: SchemaGetter.Getter<T, E>) {
  return async (input: E, expected: T) => {
    const r = await Effect.runPromise(
      SchemaGetter.run(getter, Option.some(input), {}).pipe(
        Effect.mapError(formatIssue),
        Effect.result
      )
    )
    deepStrictEqual(r, Result.succeed(Option.some(expected)))
  }
}

describe("SchemaGetter", () => {
  it.effect("forbiddenEncoding", () =>
    Effect.gen(function*() {
      const getter: SchemaGetter.Getter<string, number> = SchemaGetter.forbiddenEncoding
      const issue = yield* SchemaGetter.run(getter, Option.some(1), {}).pipe(Effect.flip)

      assert.strictEqual(issue._tag, "Forbidden")
      assert.strictEqual(formatIssue(issue), "Encoding is not supported")
    }))

  it.effect("stringifyJson fails when JSON.stringify returns undefined", () =>
    SchemaGetter.run(SchemaGetter.stringifyJson(), Option.some(undefined), {}).pipe(
      Effect.flip,
      Effect.map((issue) => assert.strictEqual(issue._tag, "InvalidValue"))
    ))

  it.effect("map", () =>
    Effect.gen(function*() {
      const getter = SchemaGetter.map(SchemaGetter.succeed(1), (t) => t + 1)
      const result = yield* SchemaGetter.run(Option.some(1), {})(getter)
      assertSome(result, 2)
    }))

  it("map preserves the specialized execution mode", () => {
    assert.strictEqual(SchemaGetter.map(SchemaGetter.passthrough<number>(), String)._tag, "Transform")
    assert.strictEqual(SchemaGetter.map(SchemaGetter.transform(Number), String)._tag, "Transform")
    assert.strictEqual(
      SchemaGetter.map(
        SchemaGetter.transformOptional((input: Option.Option<string>) => Option.map(input, Number)),
        String
      )._tag,
      "TransformOptional"
    )
    assert.strictEqual(
      SchemaGetter.map(SchemaGetter.transformEffect((input: string) => Effect.succeed(Number(input))), String)._tag,
      "TransformEffect"
    )
    assert.strictEqual(
      SchemaGetter.map(
        SchemaGetter.transformOptionalEffect((input: Option.Option<string>) =>
          Effect.succeed(Option.map(input, Number))
        ),
        String
      )._tag,
      "TransformOptionalEffect"
    )
  })

  it.effect("compose", () =>
    Effect.gen(function*() {
      const first = SchemaGetter.transform<number, string>(Number)
      const second = SchemaGetter.transform((value: number) => value * 2)
      const composed = SchemaGetter.compose(first, second)

      assert.strictEqual(composed._tag, "Transform")
      assertSome(yield* SchemaGetter.run(composed, Option.some("2"), {}), 4)
      assert.strictEqual(SchemaGetter.compose(SchemaGetter.passthrough<string>(), first), first)
      assert.strictEqual(SchemaGetter.compose(first, SchemaGetter.passthrough<number>()), first)
    }))

  it("compose preserves the specialized execution mode", () => {
    const transform = SchemaGetter.transform<number, string>(Number)
    const transformNumber = SchemaGetter.transform((value: number) => value + 1)
    const transformOptional = SchemaGetter.transformOptional<number, number>(Option.map((value) => value + 1))
    const transformEffect = SchemaGetter.transformEffect((value: number) => Effect.succeed(value + 1))
    const transformOptionalEffect = SchemaGetter.transformOptionalEffect((input: Option.Option<number>) =>
      Effect.succeed(Option.map(input, (value) => value + 1))
    )

    assert.strictEqual(SchemaGetter.compose(transform, transformOptional)._tag, "TransformOptional")
    assert.strictEqual(SchemaGetter.compose(transform, transformEffect)._tag, "TransformEffect")
    assert.strictEqual(SchemaGetter.compose(transformOptional, transformNumber)._tag, "TransformOptional")
    assert.strictEqual(SchemaGetter.compose(transformEffect, transformNumber)._tag, "TransformEffect")
    assert.strictEqual(SchemaGetter.compose(transformEffect, transformEffect)._tag, "TransformEffect")
    assert.strictEqual(SchemaGetter.compose(transformOptional, transformEffect)._tag, "TransformOptionalEffect")
    assert.strictEqual(SchemaGetter.compose(transformEffect, transformOptional)._tag, "TransformOptionalEffect")
    assert.strictEqual(SchemaGetter.compose(transformOptionalEffect, transformNumber)._tag, "TransformOptionalEffect")
  })

  it("dateTimeUtcFromInput", async () => {
    const decoding = makeAsserts(SchemaGetter.dateTimeUtcFromInput<string>())
    await decoding("2024-01-01 01:00:00", DateTime.makeUnsafe("2024-01-01T01:00:00.000Z"))
    await decoding("2020-02-01T11:17:00+1100", DateTime.makeUnsafe("2020-02-01T00:17:00.000Z"))
    // should support strings with explicit GMT zone
    await decoding("Tue, 27 Jan 2026 17:14:06 GMT", DateTime.makeUnsafe("2026-01-27T17:14:06.000Z"))
  })

  describe("makeTreeRecord", () => {
    it("preserves array-valued leaves at duplicate paths", () => {
      deepStrictEqual(
        SchemaGetter.makeTreeRecord([
          ["permissions", ["read"]],
          ["permissions", ["write"]],
          ["permissions", ["share"]]
        ]),
        { permissions: [["read"], ["write"], ["share"]] }
      )
    })

    it("replaces conflicting leaf values with containers", () => {
      deepStrictEqual(
        SchemaGetter.makeTreeRecord([
          ["a", "x"],
          ["a[b]", "y"]
        ]),
        { a: { b: "y" } }
      )
      deepStrictEqual(
        SchemaGetter.makeTreeRecord([
          ["a", "x"],
          ["a[0]", "y"]
        ]),
        { a: ["y"] }
      )
      deepStrictEqual(
        SchemaGetter.makeTreeRecord([
          ["a", Object.freeze({ value: "x" })],
          ["a[b]", { value: "y" }]
        ]),
        { a: { b: { value: "y" } } }
      )
    })

    it("replaces conflicting object and array containers", () => {
      deepStrictEqual(
        SchemaGetter.makeTreeRecord([
          ["a[b]", "x"],
          ["a[0]", "y"]
        ]),
        { a: ["y"] }
      )
      deepStrictEqual(
        SchemaGetter.makeTreeRecord([
          ["a[0]", "x"],
          ["a[b]", "y"]
        ]),
        { a: { b: "y" } }
      )
    })

    it("reinitializes own undefined values before descending", () => {
      deepStrictEqual(
        SchemaGetter.makeTreeRecord([
          ["a", undefined],
          ["a[b]", 1]
        ]),
        { a: { b: 1 } }
      )
    })

    it("reinitializes own undefined values at numeric indexes", () => {
      deepStrictEqual(
        SchemaGetter.makeTreeRecord([
          ["a[0]", undefined],
          ["a[0][b]", 1]
        ]),
        { a: [{ b: 1 }] }
      )
    })

    it("preserves invalid array index segments as object keys", () => {
      assert.deepStrictEqual(
        SchemaGetter.makeTreeRecord([
          ["leading[01]", "a"],
          ["overflow[4294967295]", "b"]
        ]),
        {
          leading: { "01": "a" },
          overflow: { "4294967295": "b" }
        }
      )
    })
  })

  describe("decodeFormData / encodeFormData", () => {
    const decoding = makeAsserts(SchemaGetter.decodeFormData())
    const encoding = makeAsserts(SchemaGetter.encodeFormData())

    it("should support multiple values for the same key", async () => {
      const formData = new FormData()
      formData.append("a", "1")
      formData.append("a", "2")
      const object = {
        a: ["1", "2"]
      }
      await decoding(formData, object)
      await encoding(object, formData)
    })

    it("should handle top level empty keys", async () => {
      const formData = new FormData()
      formData.append("", "value")
      const object = { "": "value" }
      await decoding(formData, object)
      await encoding(object, formData)
    })

    it("decodes simple top-level keys", async () => {
      const formData = new FormData()
      formData.append("a", "1")
      formData.append("b", "two")
      const object = {
        a: "1",
        b: "two"
      }
      await decoding(formData, object)
      await encoding(object, formData)
    })

    it("decodes nested objects via bracket notation", async () => {
      const formData = new FormData()
      formData.append("user[name]", "John")
      formData.append("user[email]", "john@example.com")
      const object = {
        user: {
          name: "John",
          email: "john@example.com"
        }
      }
      await decoding(formData, object)
      await encoding(object, formData)
    })

    it("decodes nested objects via dot notation", async () => {
      const formData = new FormData()
      formData.append("user.name", "John")
      formData.append("user.email", "john@example.com")
      const object = {
        user: {
          name: "John",
          email: "john@example.com"
        }
      }
      await decoding(formData, object)
    })

    it("decodes mixed dot + bracket notation", async () => {
      const formData = new FormData()
      formData.append("user.address[city]", "Milan")
      formData.append("user.address[zip]", "20100")
      const object = {
        user: {
          address: {
            city: "Milan",
            zip: "20100"
          }
        }
      }
      await decoding(formData, object)
    })

    it("decodes arrays with numeric indices", async () => {
      const formData = new FormData()
      formData.append("items[0]", "item1")
      formData.append("items[1]", "item2")
      const object = {
        items: ["item1", "item2"]
      }
      await decoding(formData, object)

      {
        const formData = new FormData()
        formData.append("items", "item1")
        formData.append("items", "item2")
        await encoding(object, formData)
      }
    })

    it("decodes arrays with numeric indices and nested objects", async () => {
      const formData = new FormData()
      formData.append("items[0][id]", "a")
      formData.append("items[0][name]", "Item A")
      formData.append("items[1][id]", "b")
      formData.append("items[1][name]", "Item B")
      const object = {
        items: [
          { id: "a", name: "Item A" },
          { id: "b", name: "Item B" }
        ]
      }
      await decoding(formData, object)
      await encoding(object, formData)
    })

    it("decodes arrays with [] (append)", async () => {
      const formData = new FormData()
      formData.append("tags[]", "a")
      formData.append("tags[]", "b")
      formData.append("tags[]", "c")
      const object = {
        tags: ["a", "b", "c"]
      }
      await decoding(formData, object)

      {
        const formData = new FormData()
        formData.append("tags", "a")
        formData.append("tags", "b")
        formData.append("tags", "c")
        await encoding(object, formData)
      }
    })

    it("decodes arrays with [] and nested objects", async () => {
      const formData = new FormData()
      formData.append("items[][id]", "x")
      formData.append("items[][id]", "y")
      const object = {
        items: [
          { id: "x" },
          { id: "y" }
        ]
      }
      await decoding(formData, object)
    })

    it("decodes mixed indexed and append arrays under the same key", async () => {
      const formData = new FormData()
      formData.append("items[0]", "a")
      formData.append("items[]", "b")
      formData.append("items[]", "c")
      const object = {
        items: ["a", "b", "c"]
      }
      // Implementation detail: first write at index 0, then pushes at 1 and 2
      await decoding(formData, object)
    })

    it("decodes nested objects inside appended array elements", async () => {
      const formData = new FormData()
      formData.append("users[][name]", "John")
      formData.append("users[][name]", "Alice")
      const object = {
        users: [
          { name: "John" },
          { name: "Alice" }
        ]
      }
      await decoding(formData, object)
    })

    it("decodes complex mixed structure", async () => {
      const formData = new FormData()
      formData.append("user[name]", "John")
      formData.append("user[address][city]", "Milan")
      formData.append("user[address][zip]", "20100")
      formData.append("orders[0][id]", "o1")
      formData.append("orders[0][total]", "10")
      formData.append("orders[1][id]", "o2")
      formData.append("orders[1][total]", "20")
      formData.append("tags[0]", "a")
      formData.append("tags[1]", "b")
      const object = {
        user: {
          name: "John",
          address: {
            city: "Milan",
            zip: "20100"
          }
        },
        orders: [
          { id: "o1", total: "10" },
          { id: "o2", total: "20" }
        ],
        tags: ["a", "b"]
      }
      await decoding(formData, object)
    })

    it("stores __proto__ paths as own properties", async () => {
      const pollutedKey = "__effectSchemaPolluted"
      Reflect.deleteProperty(Object.prototype, pollutedKey)
      try {
        const formData = new FormData()
        formData.append(`__proto__[${pollutedKey}]`, "yes")
        await decoding(formData, {
          ["__proto__"]: {
            [pollutedKey]: "yes"
          }
        })
        assert.isFalse(Object.hasOwn(Object.prototype, pollutedKey))
      } finally {
        Reflect.deleteProperty(Object.prototype, pollutedKey)
      }
    })
  })

  describe("decodeURLSearchParams / encodeURLSearchParams", () => {
    const decoding = makeAsserts(SchemaGetter.decodeURLSearchParams())
    const encoding = makeAsserts(SchemaGetter.encodeURLSearchParams())

    it("should support multiple values for the same key", async () => {
      const urlSearchParams = new URLSearchParams("a=1&a=2")
      const object = {
        a: ["1", "2"]
      }
      await decoding(urlSearchParams, object)
      await encoding(object, urlSearchParams)
    })

    it("should handle top level empty keys", async () => {
      const urlSearchParams = new URLSearchParams("=value")
      const object = { "": "value" }
      await decoding(urlSearchParams, object)
      await encoding(object, urlSearchParams)
    })

    it("decodes simple top-level keys", async () => {
      const urlSearchParams = new URLSearchParams("a=1&b=two")
      const object = {
        a: "1",
        b: "two"
      }
      await decoding(urlSearchParams, object)
      await encoding(object, urlSearchParams)
    })

    it("decodes nested objects via bracket notation", async () => {
      const urlSearchParams = new URLSearchParams("user[name]=John&user[email]=john@example.com")
      const object = {
        user: {
          name: "John",
          email: "john@example.com"
        }
      }
      await decoding(urlSearchParams, object)
      await encoding(object, urlSearchParams)
    })

    it("decodes nested objects via dot notation", async () => {
      const urlSearchParams = new URLSearchParams("user.name=John&user.email=john@example.com")
      const object = {
        user: {
          name: "John",
          email: "john@example.com"
        }
      }
      await decoding(urlSearchParams, object)
    })

    it("decodes mixed dot + bracket notation", async () => {
      const urlSearchParams = new URLSearchParams("user.address[city]=Milan&user.address[zip]=20100")
      const object = {
        user: {
          address: {
            city: "Milan",
            zip: "20100"
          }
        }
      }
      await decoding(urlSearchParams, object)
    })

    it("decodes arrays with numeric indices", async () => {
      const urlSearchParams = new URLSearchParams("items[0]=item1&items[1]=item2")
      const object = {
        items: ["item1", "item2"]
      }
      await decoding(urlSearchParams, object)

      {
        const urlSearchParams = new URLSearchParams("items=item1&items=item2")
        await encoding(object, urlSearchParams)
      }
    })

    it("decodes arrays with numeric indices and nested objects", async () => {
      const urlSearchParams = new URLSearchParams(
        "items[0][id]=a&items[0][name]=Item A&items[1][id]=b&items[1][name]=Item B"
      )
      const object = {
        items: [
          { id: "a", name: "Item A" },
          { id: "b", name: "Item B" }
        ]
      }
      await decoding(urlSearchParams, object)
      await encoding(object, urlSearchParams)
    })

    it("decodes arrays with [] (append)", async () => {
      const urlSearchParams = new URLSearchParams("tags[]=a&tags[]=b&tags[]=c")
      const object = {
        tags: ["a", "b", "c"]
      }
      await decoding(urlSearchParams, object)

      {
        const urlSearchParams = new URLSearchParams("tags=a&tags=b&tags=c")
        await encoding(object, urlSearchParams)
      }
    })

    it("decodes arrays with [] and nested objects", async () => {
      const urlSearchParams = new URLSearchParams("items[][id]=x&items[][id]=y")
      const object = {
        items: [{ id: "x" }, { id: "y" }]
      }
      await decoding(urlSearchParams, object)
    })

    it("decodes mixed indexed and append arrays under the same key", async () => {
      const urlSearchParams = new URLSearchParams("items[0]=a&items[]=b&items[]=c")
      const object = {
        items: ["a", "b", "c"]
      }
      // Implementation detail: first write at index 0, then pushes at 1 and 2
      await decoding(urlSearchParams, object)
    })

    it("decodes nested objects inside appended array elements", async () => {
      const urlSearchParams = new URLSearchParams("users[][name]=John&users[][name]=Alice")
      const object = {
        users: [
          { name: "John" },
          { name: "Alice" }
        ]
      }
      await decoding(urlSearchParams, object)
    })

    it("decodes complex mixed structure", async () => {
      const urlSearchParams = new URLSearchParams(
        "user[name]=John&user.address[city]=Milan&user.address[zip]=20100&orders[0][id]=o1&orders[0][total]=10&orders[1][id]=o2&orders[1][total]=20&tags[0]=a&tags[1]=b"
      )
      const object = {
        user: {
          name: "John",
          address: {
            city: "Milan",
            zip: "20100"
          }
        },
        orders: [
          { id: "o1", total: "10" },
          { id: "o2", total: "20" }
        ],
        tags: ["a", "b"]
      }
      await decoding(urlSearchParams, object)
    })

    it("does not traverse inherited constructor paths", async () => {
      const pollutedKey = "__effectSchemaPolluted"
      Reflect.deleteProperty(Object.prototype, pollutedKey)
      try {
        const urlSearchParams = new URLSearchParams(`constructor[prototype][${pollutedKey}]=yes`)
        await decoding(urlSearchParams, {
          constructor: {
            prototype: {
              [pollutedKey]: "yes"
            }
          }
        })
        assert.isFalse(Object.hasOwn(Object.prototype, pollutedKey))
      } finally {
        Reflect.deleteProperty(Object.prototype, pollutedKey)
      }
    })
  })
})
