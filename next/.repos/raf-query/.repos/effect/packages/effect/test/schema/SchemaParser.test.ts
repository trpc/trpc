import { describe, it } from "@effect/vitest"
import {
  Cause,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Option,
  Ref,
  Result,
  Schema,
  type SchemaAST,
  SchemaGetter,
  SchemaIssue,
  SchemaParser,
  SchemaTransformation
} from "effect"
import {
  assertFalse,
  assertSchemaIssueError,
  assertTrue,
  deepStrictEqual,
  strictEqual,
  throws
} from "../utils/assert.ts"

describe("SchemaParser", () => {
  describe("sequential parsing", () => {
    const cases = [
      {
        name: "Struct",
        make: (item: Schema.Codec<string>) => Schema.Struct({ a: item, b: item }),
        input: { a: "a", b: "b" }
      },
      { name: "Tuple", make: (item: Schema.Codec<string>) => Schema.Tuple([item, item]), input: ["a", "b"] },
      { name: "Array", make: (item: Schema.Codec<string>) => Schema.Array(item), input: ["a", "b"] },
      {
        name: "Record",
        make: (item: Schema.Codec<string>) => Schema.Record(Schema.String, item),
        input: { a: "a", b: "b" }
      }
    ]
    for (const { input, make, name } of cases) {
      for (const errors of ["first", "all"] as const) {
        it.effect(`${name} decodes and encodes asynchronous children sequentially (${errors})`, () =>
          Effect.gen(function*() {
            const calls: Array<string> = []
            const getter = SchemaGetter.transformEffect<string, string>((value) => {
              calls.push(`start ${value}`)
              return Effect.gen(function*() {
                yield* Effect.yieldNow
                calls.push(`end ${value}`)
                return value
              })
            })
            const schema = make(Schema.String.pipe(Schema.decode({ decode: getter, encode: getter })))
            deepStrictEqual(yield* SchemaParser.decodeUnknownEffect(schema)(input, { errors }), input)
            deepStrictEqual(calls, ["start a", "end a", "start b", "end b"])
            calls.length = 0
            deepStrictEqual(yield* SchemaParser.encodeUnknownEffect(schema)(input, { errors }), input)
            deepStrictEqual(calls, ["start a", "end a", "start b", "end b"])
          }))
      }
    }
  })

  describe("product concurrency", () => {
    const cases = [
      {
        name: "Struct",
        make: (item: Schema.Codec<string>) => Schema.Struct({ a: item, b: item, c: item }),
        input: { a: "a", b: "b", c: "c" }
      },
      { name: "Tuple", make: (item: Schema.Codec<string>) => Schema.Tuple([item, item, item]), input: ["a", "b", "c"] },
      { name: "Array", make: (item: Schema.Codec<string>) => Schema.Array(item), input: ["a", "b", "c"] },
      {
        name: "Record",
        make: (item: Schema.Codec<string>) => Schema.Record(Schema.String, item),
        input: { a: "a", b: "b", c: "c" }
      }
    ]

    for (const { input, make, name } of cases) {
      it.effect(`${name} uses Effect.forEach bounded concurrency when decoding and encoding`, () =>
        Effect.gen(function*() {
          for (const operation of ["decode", "encode"] as const) {
            const started = yield* Effect.forEach([0, 1, 2], () => Deferred.make<void>())
            const releases = yield* Effect.forEach([0, 1, 2], () => Deferred.make<void>())
            const getter = SchemaGetter.transformEffect<string, string>((value) => {
              const index = value.charCodeAt(0) - 97
              return Deferred.succeed(started[index], undefined).pipe(
                Effect.andThen(Deferred.await(releases[index])),
                Effect.as(value)
              )
            })
            const schema = make(Schema.String.pipe(Schema.decode({ decode: getter, encode: getter })))
            const parse = operation === "decode"
              ? SchemaParser.decodeUnknownEffect(schema)
              : SchemaParser.encodeUnknownEffect(schema)
            const fiber = yield* parse(input, { concurrency: 2 }).pipe(Effect.forkChild)

            yield* Deferred.await(started[0])
            yield* Deferred.await(started[1])
            assertFalse(yield* Deferred.isDone(started[2]))

            yield* Deferred.succeed(releases[0], undefined)
            yield* Deferred.await(started[2])
            yield* Deferred.succeed(releases[1], undefined)
            yield* Deferred.succeed(releases[2], undefined)

            deepStrictEqual(yield* Fiber.join(fiber), input)
          }
        }))
    }

    it.effect(`supports concurrency: "unbounded"`, () =>
      Effect.gen(function*() {
        const started = yield* Effect.forEach([0, 1, 2], () => Deferred.make<void>())
        const release = yield* Deferred.make<void>()
        const getter = SchemaGetter.transformEffect<string, string>((value) => {
          const index = value.charCodeAt(0) - 97
          return Deferred.succeed(started[index], undefined).pipe(
            Effect.andThen(Deferred.await(release)),
            Effect.as(value)
          )
        })
        const schema = Schema.Array(Schema.String.pipe(Schema.decode({ decode: getter, encode: getter })))
        const fiber = yield* SchemaParser.decodeUnknownEffect(schema)(["a", "b", "c"], {
          concurrency: "unbounded"
        }).pipe(Effect.forkChild)

        yield* Effect.forEach(started, Deferred.await, { discard: true })
        yield* Deferred.succeed(release, undefined)
        deepStrictEqual(yield* Fiber.join(fiber), ["a", "b", "c"])
      }))

    it.effect("uses the first concurrent failure to complete and interrupts pending children", () =>
      Effect.gen(function*() {
        const firstStarted = yield* Deferred.make<void>()
        const firstInterrupted = yield* Deferred.make<void>()
        const first = Schema.String.pipe(Schema.decode({
          decode: SchemaGetter.transformEffect(() =>
            Deferred.succeed(firstStarted, undefined).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => Deferred.succeed(firstInterrupted, undefined).pipe(Effect.asVoid))
            )
          ),
          encode: SchemaGetter.passthrough()
        }))
        const second = Schema.String.pipe(Schema.decode({
          decode: SchemaGetter.transformEffect(() =>
            Deferred.await(firstStarted).pipe(
              Effect.andThen(Effect.fail(new SchemaIssue.InvalidValue({ message: "second failed" })))
            )
          ),
          encode: SchemaGetter.passthrough()
        }))

        const exit = yield* SchemaParser.decodeUnknownEffect(Schema.Tuple([first, second]))(["a", "b"], {
          concurrency: 2
        }).pipe(Effect.exit)

        assertTrue(Exit.isFailure(exit))
        assertTrue(yield* Deferred.isDone(firstInterrupted))
        if (Exit.isFailure(exit)) {
          const error = Cause.findError(exit.cause)
          assertTrue(Result.isSuccess(error))
          if (Result.isSuccess(error)) {
            strictEqual(error.success._tag, "Composite")
            if (error.success._tag === "Composite") {
              strictEqual(error.success.issues[0]._tag, "Pointer")
              if (error.success.issues[0]._tag === "Pointer") {
                deepStrictEqual(error.success.issues[0].path, [1])
              }
            }
          }
        }
      }))

    it.effect(`accumulates concurrent errors in completion order with errors: "all"`, () =>
      Effect.gen(function*() {
        const releaseFirst = yield* Deferred.make<void>()
        const secondCompleted = yield* Deferred.make<void>()
        const failing = (effect: Effect.Effect<void>) =>
          Schema.String.pipe(Schema.decode({
            decode: SchemaGetter.transformEffect(() =>
              effect.pipe(Effect.andThen(Effect.fail(new SchemaIssue.InvalidValue())))
            ),
            encode: SchemaGetter.passthrough()
          }))
        const schema = Schema.Tuple([
          failing(Deferred.await(releaseFirst)),
          failing(Deferred.succeed(secondCompleted, undefined).pipe(Effect.asVoid))
        ])
        const fiber = yield* SchemaParser.decodeUnknownEffect(schema)(["a", "b"], {
          concurrency: 2,
          errors: "all"
        }).pipe(Effect.exit, Effect.forkChild)

        yield* Deferred.await(secondCompleted)
        yield* Effect.yieldNow
        yield* Deferred.succeed(releaseFirst, undefined)
        const exit = yield* Fiber.join(fiber)

        assertTrue(Exit.isFailure(exit))
        if (Exit.isFailure(exit)) {
          const error = Cause.findError(exit.cause)
          assertTrue(Result.isSuccess(error))
          if (Result.isSuccess(error)) {
            strictEqual(error.success._tag, "Composite")
            if (error.success._tag === "Composite") {
              deepStrictEqual(
                error.success.issues.map((issue) => issue._tag === "Pointer" ? issue.path : []),
                [[1], [0]]
              )
            }
          }
        }
      }))

    it.effect("uses completion order for colliding transformed Record keys", () =>
      Effect.gen(function*() {
        const releaseFirst = yield* Deferred.make<void>()
        const secondCompleted = yield* Deferred.make<void>()
        const value = Schema.String.pipe(Schema.decode({
          decode: SchemaGetter.transformEffect((value) =>
            value === "first"
              ? Deferred.await(releaseFirst).pipe(Effect.as(value))
              : Deferred.succeed(secondCompleted, undefined).pipe(Effect.as(value))
          ),
          encode: SchemaGetter.passthrough()
        }))
        const schema = Schema.Record(
          Schema.String.pipe(Schema.decode(SchemaTransformation.snakeToCamel())),
          value
        )
        const fiber = yield* SchemaParser.decodeUnknownEffect(schema)({ a_b: "first", aB: "second" }, {
          concurrency: 2
        }).pipe(Effect.forkChild)

        yield* Deferred.await(secondCompleted)
        yield* Effect.yieldNow
        yield* Deferred.succeed(releaseFirst, undefined)
        deepStrictEqual(yield* Fiber.join(fiber), { aB: "first" })
      }))

    it.effect("applies the concurrency limit independently to nested products", () =>
      Effect.gen(function*() {
        const started = yield* Ref.make(0)
        const allStarted = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const item = Schema.String.pipe(Schema.decode({
          decode: SchemaGetter.transformEffect((value) =>
            Ref.updateAndGet(started, (n) => n + 1).pipe(
              Effect.tap((n) => n === 4 ? Deferred.succeed(allStarted, undefined) : Effect.void),
              Effect.andThen(Deferred.await(release)),
              Effect.as(value)
            )
          ),
          encode: SchemaGetter.passthrough()
        }))
        const schema = Schema.Array(Schema.Array(item))
        const input = [["a", "b"], ["c", "d"]]
        const fiber = yield* SchemaParser.decodeUnknownEffect(schema)(input, { concurrency: 2 }).pipe(Effect.forkChild)

        yield* Deferred.await(allStarted)
        strictEqual(yield* Ref.get(started), 4)
        yield* Deferred.succeed(release, undefined)
        deepStrictEqual(yield* Fiber.join(fiber), input)
      }))

    it.effect("keeps Union member evaluation sequential", () =>
      Effect.gen(function*() {
        const firstStarted = yield* Deferred.make<void>()
        const releaseFirst = yield* Deferred.make<void>()
        const secondStarted = yield* Deferred.make<void>()
        const first = Schema.String.pipe(Schema.decode({
          decode: SchemaGetter.transformEffect(() =>
            Deferred.succeed(firstStarted, undefined).pipe(
              Effect.andThen(Deferred.await(releaseFirst)),
              Effect.as("first")
            )
          ),
          encode: SchemaGetter.passthrough()
        }))
        const second = Schema.String.pipe(Schema.decode({
          decode: SchemaGetter.transformEffect(() =>
            Deferred.succeed(secondStarted, undefined).pipe(Effect.as("second"))
          ),
          encode: SchemaGetter.passthrough()
        }))
        const fiber = yield* SchemaParser.decodeUnknownEffect(Schema.Union([first, second]))("value", {
          concurrency: "unbounded"
        }).pipe(Effect.forkChild)

        yield* Deferred.await(firstStarted)
        yield* Effect.yieldNow
        assertFalse(yield* Deferred.isDone(secondStarted))
        yield* Deferred.succeed(releaseFirst, undefined)
        strictEqual(yield* Fiber.join(fiber), "first")
        assertFalse(yield* Deferred.isDone(secondStarted))
      }))

    it("keeps synchronous product parsers eager", () => {
      const result = SchemaParser.decodeUnknownEffect(Schema.Array(Schema.String))(["a", "b"], {
        concurrency: "unbounded"
      })
      assertTrue(Exit.isExit(result))
      if (Exit.isSuccess(result)) {
        deepStrictEqual(result.value, ["a", "b"])
      }
    })

    it.effect("applies concurrency to constructor defaults", () =>
      Effect.gen(function*() {
        const firstStarted = yield* Deferred.make<void>()
        const secondStarted = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const field = (value: string, started: Deferred.Deferred<void>) =>
          Schema.String.pipe(Schema.withConstructorDefault(
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.as(value)
            )
          ))
        const schema = Schema.Struct({
          a: field("a", firstStarted),
          b: field("b", secondStarted)
        })
        const fiber = yield* SchemaParser.makeEffect(schema)({}, {
          parseOptions: { concurrency: 2 }
        }).pipe(Effect.forkChild)

        yield* Deferred.await(firstStarted)
        yield* Deferred.await(secondStarted)
        yield* Deferred.succeed(release, undefined)
        deepStrictEqual(yield* Fiber.join(fiber), { a: "a", b: "b" })
      }))
  })

  describe("makeEffect", () => {
    it.effect("defers deriving the type AST until the maker is called and derives it once", () =>
      Effect.gen(function*() {
        let encodingReads = 0
        const ast = new Proxy(Schema.String.ast, {
          get(target, property, receiver) {
            if (property === "encoding") {
              encodingReads++
            }
            return Reflect.get(target, property, receiver)
          }
        })
        const schema: { ast: SchemaAST.AST } = { ast }
        const make = SchemaParser.makeEffect(schema as Schema.Codec<string>)
        schema.ast = Schema.Number.ast

        strictEqual(encodingReads, 0)
        const effect = make("a")
        assertTrue(encodingReads > 0)
        strictEqual(yield* effect, "a")
        const reads = encodingReads
        strictEqual(yield* make("b"), "b")
        strictEqual(encodingReads, reads)
      }))
  })

  const makeMixedCause = () =>
    Cause.combine(
      Cause.fail(new SchemaIssue.InvalidValue({ message: "schema issue" })),
      Cause.die(new Error("defect"))
    )
  describe("make", () => {
    it("should throw an error when the input is invalid", () => {
      const schema = Schema.String
      throws(() => SchemaParser.make(schema)(null as any), (e) => {
        assertSchemaIssueError(e, "Expected string")
      })
    })

    it("should throw an error when the cause contains both an Issue and a defect", () => {
      const schema = Schema.Struct({
        a: Schema.String.pipe(Schema.withConstructorDefault(Effect.failCause(makeMixedCause())))
      })

      throws(() => SchemaParser.make(schema)({}), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Constructor adapter can only throw schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })
  })

  describe("makeOption", () => {
    it("should throw an error when the cause is not an Issue", () => {
      const schema = Schema.Struct({
        a: Schema.String.pipe(Schema.withConstructorDefault(Effect.die(new Error("make defect"))))
      })

      throws(() => SchemaParser.makeOption(schema)({}), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Option adapter can only return none for schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })

    it("should throw an error when the cause contains both an Issue and a defect", () => {
      const schema = Schema.Struct({
        a: Schema.String.pipe(Schema.withConstructorDefault(Effect.failCause(makeMixedCause())))
      })

      throws(() => SchemaParser.makeOption(schema)({}), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Option adapter can only return none for schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })
  })

  describe("decodeUnknownSync / encodeUnknownSync", () => {
    it("decodes inherited struct properties", () => {
      const schema = Schema.Struct({
        required: Schema.String,
        optional: Schema.optionalKey(Schema.String),
        defaulted: Schema.String.pipe(Schema.withDecodingDefaultKey(Effect.succeed("default"))),
        own: Schema.String
      })
      const input = Object.assign(
        Object.create({
          required: "required",
          optional: "optional",
          defaulted: "inherited"
        }),
        { own: "own" }
      )

      const output = SchemaParser.decodeUnknownSync(schema)(input)

      deepStrictEqual(output, {
        required: "required",
        optional: "optional",
        defaulted: "inherited",
        own: "own"
      })
      for (const key of ["required", "optional", "defaulted", "own"]) {
        assertTrue(Object.hasOwn(output, key))
      }

      const encoded = SchemaParser.encodeUnknownSync(Schema.Struct({ required: Schema.String }))(
        Object.create({ required: "required" })
      )
      deepStrictEqual(encoded, { required: "required" })
      assertTrue(Object.hasOwn(encoded, "required"))

      deepStrictEqual(SchemaParser.decodeUnknownSync(schema)({ required: "required", own: "own" }), {
        required: "required",
        defaulted: "default",
        own: "own"
      })
    })

    it("decodes inherited string, number, and symbol fields", () => {
      const symbol = Symbol("field")
      const schema = Schema.Struct({
        text: Schema.String,
        1: Schema.Number,
        [symbol]: Schema.Boolean
      })
      const output = SchemaParser.decodeUnknownSync(schema)(Object.create({ text: "a", 1: 1, [symbol]: true }))

      deepStrictEqual(output, { text: "a", 1: 1, [symbol]: true })
      for (const key of ["text", "1", symbol]) assertTrue(Object.hasOwn(output, key))
    })

    it("distinguishes an inherited undefined property from a missing property", () => {
      const schema = Schema.Struct({
        value: Schema.String.pipe(Schema.withDecodingDefaultKey(Effect.succeed("default")))
      })
      const decode = SchemaParser.decodeUnknownSync(schema)

      deepStrictEqual(decode({}), { value: "default" })
      throws(() => decode(Object.create({ value: undefined })), (error) => {
        assertSchemaIssueError(error, `Expected string\n  at ["value"]`)
      })
    })

    it("selects union members using inherited discriminants", () => {
      const schema = Schema.Union([
        Schema.Struct({ _tag: Schema.Literal("A"), value: Schema.String }),
        Schema.Struct({ _tag: Schema.Literal("B"), value: Schema.Number })
      ])
      const input = Object.assign(Object.create({ _tag: "A" }), { value: "value" })
      const output = SchemaParser.decodeUnknownSync(schema)(input)

      deepStrictEqual(output, { _tag: "A", value: "value" })
      assertTrue(Object.hasOwn(output, "_tag"))
    })

    it("decodes inherited Object.prototype properties", () => {
      const output = SchemaParser.decodeUnknownSync(Schema.Struct({ toString: Schema.Unknown }))({})

      strictEqual(output.toString, Object.prototype.toString)
      assertTrue(Object.hasOwn(output, "toString"))
    })

    it("requires __proto__ to be an own property", () => {
      const schema = Schema.Struct({ ["__proto__"]: Schema.String })
      throws(() => SchemaParser.decodeUnknownSync(schema)(Object.create({ __proto__: "value" })))
      deepStrictEqual(SchemaParser.decodeUnknownSync(schema)({ ["__proto__"]: "value" }), {
        ["__proto__"]: "value"
      })
    })

    it("keeps dynamic record properties own-only while finite record keys are declared", () => {
      const input = Object.assign(Object.create({ inherited: 1 }), { own: 2 })
      deepStrictEqual(SchemaParser.decodeUnknownSync(Schema.Record(Schema.String, Schema.Number))(input), { own: 2 })

      const finite = Schema.Record(Schema.Literal("inherited"), Schema.Number)
      deepStrictEqual(SchemaParser.decodeUnknownSync(finite)(input), { inherited: 1 })
    })

    it("should throw an error when the input is invalid", () => {
      const schema = Schema.String
      throws(() => SchemaParser.decodeUnknownSync(schema)(null), (e) => {
        assertSchemaIssueError(e, "Expected string")
      })
      throws(() => SchemaParser.encodeUnknownSync(schema)(null), (e) => {
        assertSchemaIssueError(e, "Expected string")
      })
    })

    it("should throw an error when the cause contains both an Issue and a defect", () => {
      const decodeSchema = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(makeMixedCause())),
        encode: SchemaGetter.passthrough()
      }))
      const encodeSchema = Schema.String.pipe(Schema.encode({
        decode: SchemaGetter.passthrough(),
        encode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(makeMixedCause()))
      }))

      throws(() => SchemaParser.decodeUnknownSync(decodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Sync adapter can only throw schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
      throws(() => SchemaParser.encodeUnknownSync(encodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Sync adapter can only throw schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })
  })

  describe("decodeUnknownPromise / encodeUnknownPromise", () => {
    it("should reject with an error when the input is invalid", async () => {
      const schema = Schema.String
      const r1 = await SchemaParser.decodeUnknownPromise(schema)(null).then(Result.succeed, Result.fail)
      assertTrue(Result.isFailure(r1))
      assertSchemaIssueError(r1.failure, "Expected string")
      const r2 = await SchemaParser.encodeUnknownPromise(schema)(null).then(Result.succeed, Result.fail)
      assertTrue(Result.isFailure(r2))
      assertSchemaIssueError(r2.failure, "Expected string")
    })

    it("should reject with an error when the cause contains both an Issue and a defect", async () => {
      const decodeSchema = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(makeMixedCause())),
        encode: SchemaGetter.passthrough()
      }))
      const encodeSchema = Schema.String.pipe(Schema.encode({
        decode: SchemaGetter.passthrough(),
        encode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(makeMixedCause()))
      }))

      const r1 = await SchemaParser.decodeUnknownPromise(decodeSchema)("a").then(Result.succeed, Result.fail)
      assertTrue(Result.isFailure(r1))
      assertTrue(r1.failure instanceof Error)
      strictEqual(r1.failure.message, "Promise adapter can only reject schema issues")
      assertTrue(Cause.hasDies(r1.failure.cause as Cause.Cause<never>))

      const r2 = await SchemaParser.encodeUnknownPromise(encodeSchema)("a").then(Result.succeed, Result.fail)
      assertTrue(Result.isFailure(r2))
      assertTrue(r2.failure instanceof Error)
      strictEqual(r2.failure.message, "Promise adapter can only reject schema issues")
      assertTrue(Cause.hasDies(r2.failure.cause as Cause.Cause<never>))
    })
  })

  describe("decodeUnknownOption / encodeUnknownOption", () => {
    it("should return none when the input is invalid", () => {
      const schema = Schema.String
      assertTrue(Option.isSome(SchemaParser.decodeUnknownOption(schema)("a")))
      assertTrue(Option.isNone(SchemaParser.decodeUnknownOption(schema)(null)))
      assertTrue(Option.isSome(SchemaParser.encodeUnknownOption(schema)("a")))
      assertTrue(Option.isNone(SchemaParser.encodeUnknownOption(schema)(null)))
    })

    it("should throw an error when the cause is not an Issue", () => {
      const decodeSchema = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformOptionalEffect(() => Effect.die(new Error("decode defect"))),
        encode: SchemaGetter.passthrough()
      }))
      const encodeSchema = Schema.String.pipe(Schema.encode({
        decode: SchemaGetter.passthrough(),
        encode: SchemaGetter.transformOptionalEffect(() => Effect.die(new Error("encode defect")))
      }))

      throws(() => SchemaParser.decodeUnknownOption(decodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Option adapter can only return none for schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
      throws(() => SchemaParser.encodeUnknownOption(encodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Option adapter can only return none for schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })

    it("should throw an error when the cause contains both an Issue and a defect", () => {
      const decodeSchema = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(makeMixedCause())),
        encode: SchemaGetter.passthrough()
      }))
      const encodeSchema = Schema.String.pipe(Schema.encode({
        decode: SchemaGetter.passthrough(),
        encode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(makeMixedCause()))
      }))

      throws(() => SchemaParser.decodeUnknownOption(decodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Option adapter can only return none for schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
      throws(() => SchemaParser.encodeUnknownOption(encodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Option adapter can only return none for schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })
  })

  describe("is", () => {
    it("should return false when the input is invalid", () => {
      const is = SchemaParser.is(Schema.String)
      strictEqual(is("a"), true)
      strictEqual(is(null), false)
    })

    it("should throw an error when the cause is not an Issue", () => {
      const schema = Schema.declareConstructor<string>()(
        [],
        () => () => Effect.die(new Error("is defect"))
      )

      throws(() => SchemaParser.is(schema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Type guard adapter can only return false for schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })

    it("should throw an error when the cause contains both an Issue and a defect", () => {
      const schema = Schema.declareConstructor<string>()(
        [],
        () => () => Effect.failCause(makeMixedCause())
      )

      throws(() => SchemaParser.is(schema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Type guard adapter can only return false for schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })
  })

  describe("asserts", () => {
    it("should use the default parse options", () => {
      const schema = Schema.Struct({ a: Schema.String, b: Schema.String })

      // `errors: "all"` would report both keys
      throws(() => SchemaParser.asserts(schema, { a: 1, b: 2 }), (e) => {
        assertSchemaIssueError(e, `Expected string\n  at ["a"]`)
      })

      // `onExcessProperty: "error"` would reject the excess key
      SchemaParser.asserts(schema, { a: "a", b: "b", c: 1 })
    })

    it("should assert the type side of the schema", () => {
      const schema = Schema.Struct({ a: Schema.FiniteFromString })

      SchemaParser.asserts(schema, { a: 1 })

      throws(() => SchemaParser.asserts(schema, { a: "1" }), (e) => {
        assertSchemaIssueError(e, `Expected number\n  at ["a"]`)
      })
    })

    it("should throw an error when the cause is not an Issue", () => {
      const schema = Schema.declareConstructor<string>()(
        [],
        () => () => Effect.die(new Error("assert defect"))
      )

      throws(() => SchemaParser.asserts(schema, "a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Assertion adapter can only throw schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })

    it("should throw an error when the cause contains both an Issue and a defect", () => {
      const schema = Schema.declareConstructor<string>()(
        [],
        () => () => Effect.failCause(makeMixedCause())
      )

      throws(() => SchemaParser.asserts(schema, "a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Assertion adapter can only throw schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })
  })

  describe("decodeUnknownResult / encodeUnknownResult", () => {
    it("should throw an error when the cause is not an Issue", () => {
      const decodeSchema = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformOptionalEffect(() => Effect.die(new Error("decode defect"))),
        encode: SchemaGetter.passthrough()
      }))
      const encodeSchema = Schema.String.pipe(Schema.encode({
        decode: SchemaGetter.passthrough(),
        encode: SchemaGetter.transformOptionalEffect(() => Effect.die(new Error("encode defect")))
      }))

      throws(() => SchemaParser.decodeUnknownResult(decodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Result adapter can only return schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
      throws(() => SchemaParser.encodeUnknownResult(encodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Result adapter can only return schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })

    it("should throw an error when the cause contains both an Issue and a defect", () => {
      const decodeSchema = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(makeMixedCause())),
        encode: SchemaGetter.passthrough()
      }))
      const encodeSchema = Schema.String.pipe(Schema.encode({
        decode: SchemaGetter.passthrough(),
        encode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(makeMixedCause()))
      }))

      throws(() => SchemaParser.decodeUnknownResult(decodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Result adapter can only return schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
      throws(() => SchemaParser.encodeUnknownResult(encodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Result adapter can only return schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })
  })

  describe("decodeUnknownExit", () => {
    it("preserves values that use Effect data protocols", () => {
      let executions = 0
      const suspended = Effect.sync(() => {
        executions++
        return "a"
      })
      const decode = SchemaParser.decodeUnknownExit(Schema.Unknown)
      const values = [Option.none(), Option.some("a"), Exit.succeed("a"), Exit.fail("a"), suspended]

      for (const value of values) {
        const result = decode(value)
        assertTrue(Exit.isSuccess(result))
        strictEqual(result.value, value)
      }
      strictEqual(executions, 0)

      const failure = Exit.fail("a")
      const unionResult = SchemaParser.decodeUnknownExit(Schema.Union([Schema.Unknown]))(failure)
      assertTrue(Exit.isSuccess(unionResult))
      strictEqual(unionResult.value, failure)
    })

    it("distinguishes missing tuple elements from undefined", () => {
      const decode = SchemaParser.decodeUnknownExit(
        Schema.Tuple([Schema.optionalKey(Schema.Undefined)])
      )

      const empty = decode([])
      assertTrue(Exit.isSuccess(empty))
      strictEqual(empty.value.length, 0)

      const present = decode([undefined])
      assertTrue(Exit.isSuccess(present))
      strictEqual(present.value.length, 1)
      assertTrue(Object.hasOwn(present.value, 0))

      const sparse = decode(new Array(1))
      assertTrue(Exit.isSuccess(sparse))
      strictEqual(sparse.value.length, 1)
      assertTrue(Object.hasOwn(sparse.value, 0))
    })

    it("preserves missing optional template literals", () => {
      const template = Schema.optionalKey(Schema.TemplateLiteral(["a", Schema.String]))
      const decodeTuple = SchemaParser.decodeUnknownExit(Schema.Tuple([template]))
      const decodeStruct = SchemaParser.decodeUnknownExit(Schema.Struct({ value: template }))

      const tuple = decodeTuple([])
      assertTrue(Exit.isSuccess(tuple))
      strictEqual(tuple.value.length, 0)

      const struct = decodeStruct({})
      assertTrue(Exit.isSuccess(struct))
      assertTrue(!Object.hasOwn(struct.value, "value"))
    })

    it("reads property and index values once", () => {
      let propertyReads = 0
      let indexReads = 0
      const propertyInput = {
        get value(): unknown {
          propertyReads++
          return propertyReads === 1 ? "a" : 1
        }
      }
      const indexInput = {
        get value(): unknown {
          indexReads++
          return indexReads === 1 ? "a" : 1
        }
      }

      const property = SchemaParser.decodeUnknownExit(Schema.Struct({ value: Schema.String }))(propertyInput)
      assertTrue(Exit.isSuccess(property))
      strictEqual(property.value.value, "a")
      strictEqual(propertyReads, 1)

      const index = SchemaParser.decodeUnknownExit(Schema.Record(Schema.String, Schema.String))(indexInput)
      assertTrue(Exit.isSuccess(index))
      strictEqual(index.value.value, "a")
      strictEqual(indexReads, 1)

      let rejectedReads = 0
      const rejectedKey = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformOptionalEffect(() => Effect.fail(new SchemaIssue.InvalidValue())),
        encode: SchemaGetter.passthrough()
      }))
      const rejectedInput = {
        get value(): unknown {
          rejectedReads++
          return "a"
        }
      }
      const rejected = SchemaParser.decodeUnknownExit(Schema.Record(rejectedKey, Schema.String))(rejectedInput)
      assertTrue(Exit.isFailure(rejected))
      strictEqual(rejectedReads, 0)
    })

    it("keeps synchronous transformations eager", () => {
      const effect = SchemaParser.decodeUnknownEffect(Schema.NumberFromString)("1")
      assertTrue(Exit.isExit(effect))
      assertTrue(Exit.isSuccess(effect))
      strictEqual(effect.value, 1)
    })

    it("rejects a missing root output", () => {
      const schema = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformOptionalEffect(() => Effect.succeedNone),
        encode: SchemaGetter.passthrough()
      }))
      const result = SchemaParser.decodeUnknownExit(schema)("value")

      assertTrue(Exit.isFailure(result))
    })

    it("rejects a missing root output after parsing structural schemas", () => {
      const missing = SchemaGetter.transformOptionalEffect<never, unknown>(() => Effect.succeedNone)
      const array = Schema.Array(Schema.String).pipe(Schema.decode({
        decode: missing,
        encode: missing
      }))
      const struct = Schema.Struct({ value: Schema.String }).pipe(Schema.decode({
        decode: missing,
        encode: missing
      }))

      assertTrue(Exit.isFailure(SchemaParser.decodeUnknownExit(array)(["value"])))
      assertTrue(Exit.isFailure(SchemaParser.encodeUnknownExit(array)(["value"])))
      assertTrue(Exit.isFailure(SchemaParser.decodeUnknownExit(struct)({ value: "value" })))
      assertTrue(Exit.isFailure(SchemaParser.encodeUnknownExit(struct)({ value: "value" })))
    })

    it("rejects an invalid root without compiling deeply nested structural parsers", () => {
      let array: Schema.Codec<unknown> = Schema.String
      let struct: Schema.Codec<unknown> = Schema.String
      for (let i = 0; i < 5_000; i++) {
        array = Schema.Array(array)
        struct = Schema.Struct({ value: struct })
      }

      assertTrue(Exit.isFailure(SchemaParser.decodeUnknownExit(array)(null)))
      assertTrue(Exit.isFailure(SchemaParser.decodeUnknownExit(struct)(null)))
    })

    it("stops outer checks after an aborting check in a FilterGroup", () => {
      let innerRuns = 0
      let outerRuns = 0
      const group = Schema.makeFilter(() => false).abort().and(
        Schema.makeFilter(() => {
          innerRuns++
          return false
        })
      )
      const schema = Schema.String.check(
        group,
        Schema.makeFilter(() => {
          outerRuns++
          return false
        })
      )

      const result = SchemaParser.decodeUnknownExit(schema, { errors: "all" })("value")

      assertTrue(Exit.isFailure(result))
      strictEqual(innerRuns, 0)
      strictEqual(outerRuns, 0)
    })

    it.effect("preserves unchanged values through asynchronous middleware", () =>
      Effect.gen(function*() {
        const schema = Schema.String.pipe(
          Schema.middlewareDecoding((effect) => Effect.yieldNow.pipe(Effect.andThen(effect)))
        )

        strictEqual(yield* SchemaParser.decodeUnknownEffect(schema)("value"), "value")
      }))

    it.effect("wraps an asynchronous failure from a uniquely selected union member", () =>
      Effect.gen(function*() {
        const failing = Schema.String.pipe(Schema.decode({
          decode: SchemaGetter.transformOptionalEffect(() =>
            Effect.yieldNow.pipe(
              Effect.andThen(Effect.fail(new SchemaIssue.InvalidValue()))
            )
          ),
          encode: SchemaGetter.passthrough()
        }))
        const schema = Schema.Union([
          Schema.Struct({ kind: Schema.Literal("a"), value: Schema.String }),
          Schema.Struct({ kind: Schema.Literal("b"), value: failing })
        ])

        const exit = yield* Effect.exit(
          SchemaParser.decodeUnknownEffect(schema)({ kind: "b", value: "value" })
        )
        assertTrue(Exit.isFailure(exit))
        const error = Cause.findError(exit.cause)
        assertTrue(Result.isSuccess(error))
        strictEqual(error.success._tag, "AnyOf")
      }))

    it.effect("resolves an unchanged union candidate after an asynchronous failure", () =>
      Effect.gen(function*() {
        const delayedFailure = Schema.String.pipe(Schema.decode({
          decode: SchemaGetter.transformOptionalEffect(() =>
            Effect.yieldNow.pipe(
              Effect.andThen(Effect.fail(new SchemaIssue.InvalidValue()))
            )
          ),
          encode: SchemaGetter.passthrough()
        }))
        const schema = Schema.Union([delayedFailure, Schema.String])

        strictEqual(
          yield* SchemaParser.decodeUnknownEffect(schema)("value"),
          "value"
        )
      }))

    it("does not replay eager fields after encountering a suspended transformation", () => {
      const calls: Array<string> = []
      const field = (name: string, suspended = false) =>
        Schema.String.pipe(Schema.decode({
          decode: SchemaGetter.transformOptionalEffect((input) => {
            calls.push(name)
            return suspended ? Effect.suspend(() => Effect.succeed(input)) : Effect.succeed(input)
          }),
          encode: SchemaGetter.passthrough()
        }))
      const schema = Schema.Struct({
        a: field("a"),
        b: field("b", true),
        c: field("c")
      })

      const exit = SchemaParser.decodeUnknownExit(schema)({ a: "a", b: "b", c: "c" })

      assertTrue(Exit.isSuccess(exit))
      strictEqual(calls.join(","), "a,b,c")
    })

    it("converts synchronous property parser throws into defects", () => {
      const field = Schema.declareConstructor<string>()([], () => () => {
        throw new Error("property defect")
      })
      const schema = Schema.Struct({ field })

      const exit = SchemaParser.decodeUnknownExit(schema)({ field: "value" })

      assertTrue(Exit.isFailure(exit))
      assertTrue(Cause.hasDies(exit.cause))
    })

    it("keeps encoding-link parser compilation lazy for Suspend", () => {
      let evaluations = 0
      const schema = Schema.suspend(() => {
        evaluations++
        return Schema.String
      }).pipe(Schema.decode({
        decode: SchemaGetter.passthrough(),
        encode: SchemaGetter.passthrough()
      }))

      const decode = SchemaParser.decodeUnknownExit(schema)
      strictEqual(evaluations, 0)
      strictEqual(decode("a")._tag, "Success")
      strictEqual(evaluations, 1)
      strictEqual(decode("b")._tag, "Success")
      strictEqual(evaluations, 1)
    })

    it("keeps direct Suspend parser compilation lazy", () => {
      let evaluations = 0
      const schema = Schema.suspend(() => {
        evaluations++
        return Schema.String
      })

      const decode = SchemaParser.decodeUnknownExit(schema)
      strictEqual(evaluations, 0)
      strictEqual(decode("a")._tag, "Success")
      strictEqual(evaluations, 1)
      strictEqual(decode("b")._tag, "Success")
      strictEqual(evaluations, 1)
    })

    it("supports mutually recursive Suspend parsers", () => {
      interface A {
        readonly _tag: "A"
        readonly next: string | B
      }
      interface B {
        readonly _tag: "B"
        readonly next: string | A
      }
      const A = Schema.Struct({
        _tag: Schema.Literal("A"),
        next: Schema.Union([Schema.String, Schema.suspend((): Schema.Codec<B> => B)])
      })
      const B = Schema.Struct({
        _tag: Schema.Literal("B"),
        next: Schema.Union([Schema.String, Schema.suspend((): Schema.Codec<A> => A)])
      })
      const decode = SchemaParser.decodeUnknownExit(A)

      strictEqual(decode({ _tag: "A", next: { _tag: "B", next: { _tag: "A", next: "end" } } })._tag, "Success")
    })

    it("keeps Declaration parser compilation lazy and shared by AST identity", () => {
      let evaluations = 0
      const schema = Schema.declareConstructor<unknown>()([], () => {
        evaluations++
        return (input) => Effect.succeed(input)
      })

      const decode = SchemaParser.decodeUnknownExit(schema)
      const decodeAgain = SchemaParser.decodeUnknownExit(schema)
      strictEqual(evaluations, 0)
      strictEqual(decode("a")._tag, "Success")
      strictEqual(evaluations, 1)
      strictEqual(decodeAgain("b")._tag, "Success")
      strictEqual(evaluations, 1)
    })

    it("keeps untried Declaration union members lazy", () => {
      let evaluations = 0
      const declaration = Schema.declareConstructor<unknown>()([], () => {
        evaluations++
        return (input) => Effect.succeed(input)
      })
      const decode = SchemaParser.decodeUnknownExit(Schema.Union([Schema.Literal("a"), declaration]))

      strictEqual(decode("a")._tag, "Success")
      strictEqual(evaluations, 0)
      strictEqual(decode("b")._tag, "Success")
      strictEqual(evaluations, 1)
    })

    it("keeps encode-side Declaration and Suspend parser compilation lazy", () => {
      let declarationEvaluations = 0
      let suspendEvaluations = 0
      const declaration = Schema.declareConstructor<unknown>()([], () => {
        declarationEvaluations++
        return (input) => Effect.succeed(input)
      })
      const suspend = Schema.suspend(() => {
        suspendEvaluations++
        return Schema.String
      })

      const encodeDeclaration = SchemaParser.encodeUnknownExit(declaration)
      const encodeSuspend = SchemaParser.encodeUnknownExit(suspend)
      strictEqual(declarationEvaluations, 0)
      strictEqual(suspendEvaluations, 0)
      strictEqual(encodeDeclaration("a")._tag, "Success")
      strictEqual(encodeSuspend("a")._tag, "Success")
      strictEqual(declarationEvaluations, 1)
      strictEqual(suspendEvaluations, 1)
      strictEqual(encodeDeclaration("b")._tag, "Success")
      strictEqual(encodeSuspend("b")._tag, "Success")
      strictEqual(declarationEvaluations, 1)
      strictEqual(suspendEvaluations, 1)
    })

    it("retries lazy parser compilation after a synchronous factory failure", () => {
      let evaluations = 0
      const schema = Schema.declareConstructor<unknown>()([], () => {
        if (++evaluations === 1) {
          throw new Error("factory failure")
        }
        return (input) => Effect.succeed(input)
      })
      const decode = SchemaParser.decodeUnknownExit(schema)

      throws(() => decode("a"), (error) => {
        assertTrue(error instanceof Error)
        strictEqual(error.message, "factory failure")
      })
      strictEqual(decode("b")._tag, "Success")
      strictEqual(decode("c")._tag, "Success")
      strictEqual(evaluations, 2)
    })

    it("retries lazy Suspend parser compilation after a synchronous thunk failure", () => {
      let evaluations = 0
      const schema = Schema.suspend(() => {
        if (++evaluations === 1) {
          throw new Error("thunk failure")
        }
        return Schema.String
      })
      const decode = SchemaParser.decodeUnknownExit(schema)

      throws(() => decode("a"), (error) => {
        assertTrue(error instanceof Error)
        strictEqual(error.message, "thunk failure")
      })
      strictEqual(decode("b")._tag, "Success")
      strictEqual(decode("c")._tag, "Success")
      strictEqual(evaluations, 2)
    })

    it("should preserve mixed causes in union candidates instead of trying later candidates", () => {
      const failure = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(makeMixedCause())),
        encode: SchemaGetter.passthrough()
      }))
      const schema = Schema.Union([
        failure,
        Schema.Literal("a")
      ])
      const taggedSchema = Schema.Union([
        Schema.Struct({ kind: Schema.Literal("a"), value: failure }),
        Schema.Struct({ kind: Schema.Literal("b"), value: Schema.String })
      ])

      for (
        const exit of [
          SchemaParser.decodeUnknownExit(schema)("a"),
          SchemaParser.decodeUnknownExit(taggedSchema)({ kind: "a", value: "a" })
        ] as ReadonlyArray<Exit.Exit<unknown, SchemaIssue.Issue>>
      ) {
        assertTrue(Exit.isFailure(exit))
        assertTrue(Exit.hasDies(exit))
        const error = Cause.findError(exit.cause)
        assertTrue(Result.isSuccess(error))
        assertTrue(SchemaIssue.isIssue(error.success))
      }
    })
  })
})
