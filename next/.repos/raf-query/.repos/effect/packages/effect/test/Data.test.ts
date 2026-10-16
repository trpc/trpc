import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import assert from "node:assert/strict"
import { describe, it } from "vitest"

describe("Data", () => {
  describe("Class", () => {
    class Person extends Data.Class<{ readonly name: string; readonly age: number }> {}

    it("assigns fields from constructor args", () => {
      const p = new Person({ name: "Alice", age: 30 })
      assert.strictEqual(p.name, "Alice")
      assert.strictEqual(p.age, 30)
    })

    it("structural equality via Equal.equals", () => {
      const a = new Person({ name: "Bob", age: 25 })
      const b = new Person({ name: "Bob", age: 25 })
      assert.strictEqual(Equal.equals(a, b), true)
    })

    it("not equal when fields differ", () => {
      const a = new Person({ name: "Bob", age: 25 })
      const b = new Person({ name: "Bob", age: 26 })
      assert.strictEqual(Equal.equals(a, b), false)
    })

    it("supports .pipe()", () => {
      const p = new Person({ name: "C", age: 1 })
      const result = p.pipe((x) => x.name)
      assert.strictEqual(result, "C")
    })

    it("allows classes without fields to be constructed without args", () => {
      class Empty extends Data.Class {}
      const e = new Empty()
      assert.ok(e instanceof Empty)
    })

    it("fields are enumerable", () => {
      const p = new Person({ name: "D", age: 2 })
      assert.deepStrictEqual(Object.keys(p).sort(), ["age", "name"])
    })
  })

  describe("TaggedClass", () => {
    class Foo extends Data.TaggedClass("Foo")<{ readonly value: number }> {}

    it("sets _tag to the provided tag", () => {
      const f = new Foo({ value: 1 })
      assert.strictEqual(f._tag, "Foo")
    })

    it("assigns fields", () => {
      const f = new Foo({ value: 42 })
      assert.strictEqual(f.value, 42)
    })

    it("structural equality includes _tag", () => {
      const a = new Foo({ value: 1 })
      const b = new Foo({ value: 1 })
      assert.strictEqual(Equal.equals(a, b), true)
    })

    it("different tags are not equal", () => {
      class Bar extends Data.TaggedClass("Bar")<{ readonly value: number }> {}
      const a = new Foo({ value: 1 })
      const b = new Bar({ value: 1 })
      assert.strictEqual(Equal.equals(a, b), false)
    })

    it("allows tagged classes without fields to be constructed without args", () => {
      class Empty extends Data.TaggedClass("Empty") {}
      const e = new Empty()
      assert.strictEqual(e._tag, "Empty")
    })

    it("supports .pipe()", () => {
      const f = new Foo({ value: 10 })
      const result = f.pipe((x) => x._tag)
      assert.strictEqual(result, "Foo")
    })
  })

  describe("taggedEnum", () => {
    type Shape = Data.TaggedEnum<{
      Circle: { readonly radius: number }
      Rect: { readonly width: number; readonly height: number }
    }>
    const Shape = Data.taggedEnum<Shape>()

    describe("constructors", () => {
      it("creates a variant with _tag", () => {
        const c = Shape.Circle({ radius: 5 })
        assert.strictEqual(c._tag, "Circle")
        assert.strictEqual(c.radius, 5)
      })

      it("creates different variants", () => {
        const r = Shape.Rect({ width: 3, height: 4 })
        assert.strictEqual(r._tag, "Rect")
        assert.strictEqual(r.width, 3)
        assert.strictEqual(r.height, 4)
      })
    })

    describe("$is", () => {
      it("returns true for matching variant", () => {
        const c = Shape.Circle({ radius: 1 })
        assert.strictEqual(Shape.$is("Circle")(c), true)
      })

      it("returns false for non-matching variant", () => {
        const r = Shape.Rect({ width: 1, height: 1 })
        assert.strictEqual(Shape.$is("Circle")(r), false)
      })

      it("returns false for non-tagged values", () => {
        assert.strictEqual(Shape.$is("Circle")(null), false)
        assert.strictEqual(Shape.$is("Circle")(undefined), false)
        assert.strictEqual(Shape.$is("Circle")("string"), false)
        assert.strictEqual(Shape.$is("Circle")({}), false)
      })
    })

    describe("$match", () => {
      const area = Shape.$match({
        Circle: ({ radius }) => Math.PI * radius ** 2,
        Rect: ({ width, height }) => width * height
      })

      it("data-last: matches Circle", () => {
        const c = Shape.Circle({ radius: 5 })
        assert.strictEqual(area(c), Math.PI * 25)
      })

      it("data-last: matches Rect", () => {
        const r = Shape.Rect({ width: 3, height: 4 })
        assert.strictEqual(area(r), 12)
      })

      it("data-first: matches directly", () => {
        const c = Shape.Circle({ radius: 1 })
        const result = Shape.$match(c, {
          Circle: ({ radius }) => radius * 2,
          Rect: () => 0
        })
        assert.strictEqual(result, 2)
      })
    })

    describe("no-field variant", () => {
      type Option = Data.TaggedEnum<{
        None: {}
        Some: { readonly value: number }
      }>
      const Option = Data.taggedEnum<Option>()

      it("accepts void for empty variants", () => {
        const n = Option.None()
        assert.strictEqual(n._tag, "None")
      })

      it("works with $match for empty variants", () => {
        const show = Option.$match({
          None: () => "none",
          Some: ({ value }) => `some(${value})`
        })
        assert.strictEqual(show(Option.None()), "none")
        assert.strictEqual(show(Option.Some({ value: 42 })), "some(42)")
      })
    })
  })

  describe("Error", () => {
    class MyError extends Data.Error<{ readonly code: number; readonly message: string }> {}

    it("is an instance of globalThis.Error", () => {
      const e = new MyError({ code: 500, message: "fail" })
      assert.ok(e instanceof globalThis.Error)
    })

    it("assigns fields", () => {
      const e = new MyError({ code: 404, message: "not found" })
      assert.strictEqual(e.code, 404)
      assert.strictEqual(e.message, "not found")
    })

    it("has a stack trace", () => {
      const e = new MyError({ code: 1, message: "x" })
      assert.ok(typeof e.stack === "string")
      assert.ok(e.stack!.length > 0)
    })

    it("allows errors without fields to be constructed without args", () => {
      class Empty extends Data.Error {}
      const e = new Empty()
      assert.ok(e instanceof globalThis.Error)
    })

    it("can be yielded in Effect.gen to fail", () =>
      Effect.gen(function*() {
        const exit = yield* Effect.exit(
          Effect.gen(function*() {
            return yield* new MyError({ code: 1, message: "boom" })
          })
        )
        assert.ok(exit._tag === "Failure")
      }).pipe(Effect.runPromise))

    it("toJSON includes fields", () => {
      const e = new MyError({ code: 1, message: "test" })
      const json = (e as any).toJSON()
      assert.strictEqual(json.code, 1)
      assert.strictEqual(json.message, "test")
    })
  })

  describe("TaggedError", () => {
    class NotFound extends Data.TaggedError("NotFound")<{
      readonly resource: string
    }> {}

    it("sets _tag", () => {
      const e = new NotFound({ resource: "/x" })
      assert.strictEqual(e._tag, "NotFound")
    })

    it("assigns fields", () => {
      const e = new NotFound({ resource: "/users" })
      assert.strictEqual(e.resource, "/users")
    })

    it("is an instance of globalThis.Error", () => {
      const e = new NotFound({ resource: "r" })
      assert.ok(e instanceof globalThis.Error)
    })

    it("can be caught with Effect.catchTag", () =>
      Effect.gen(function*() {
        const result = yield* Effect.gen(function*() {
          return yield* new NotFound({ resource: "/test" })
        }).pipe(
          Effect.catchTag("NotFound", (e) => Effect.succeed(`caught: ${e.resource}`))
        )
        assert.strictEqual(result, "caught: /test")
      }).pipe(Effect.runPromise))

    it("allows tagged errors without fields to be constructed without args", () => {
      class Boom extends Data.TaggedError("Boom") {}
      const e = new Boom()
      assert.strictEqual(e._tag, "Boom")
      assert.ok(e instanceof globalThis.Error)
    })

    it("sets .name to the tag", () => {
      const e = new NotFound({ resource: "x" })
      assert.strictEqual(e.name, "NotFound")
    })

    it("different tags produce non-equal errors", () => {
      class Forbidden extends Data.TaggedError("Forbidden")<{ readonly resource: string }> {}
      const a = new NotFound({ resource: "x" })
      const b = new Forbidden({ resource: "x" })
      assert.strictEqual(Equal.equals(a, b), false)
    })
  })
})
