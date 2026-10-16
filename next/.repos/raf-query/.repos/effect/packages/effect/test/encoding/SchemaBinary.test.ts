/** @effect-diagnostics schemaStructWithTag:off */
/** @effect-diagnostics schemaNumber:off */
/** @effect-diagnostics preferTypedSchemaDecoder:off */
import { assert, describe, it } from "@effect/vitest"
import {
  Array as Arr,
  BigDecimal,
  Cause,
  Channel,
  Chunk,
  DateTime,
  Duration,
  Effect,
  Exit,
  HashMap,
  HashSet,
  Option,
  Redacted,
  Result,
  Schema,
  SchemaIssue,
  SchemaParser,
  SchemaTransformation,
  Stream
} from "effect"
import * as SchemaBinary from "effect/encoding/SchemaBinary"

const encode = <A, I>(schema: Schema.Codec<A, I>, value: A): Uint8Array<ArrayBuffer> =>
  Schema.encodeUnknownSync(SchemaBinary.toCodec(schema))(value)

const roundtrip = <A, I>(schema: Schema.Codec<A, I>, value: A): A => {
  const codec = SchemaBinary.toCodec(schema)
  return Schema.decodeUnknownSync(codec)(Schema.encodeUnknownSync(codec)(value))
}

const concat = (...chunks: ReadonlyArray<Uint8Array>): Uint8Array => {
  const out = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

const uvarint = (value: number): Array<number> => {
  const out: Array<number> = []
  while (value > 0x7F) {
    out.push((value & 0x7F) | 0x80)
    value = Math.floor(value / 128)
  }
  out.push(value)
  return out
}

const nestedArrayFrame = (depth: number): Uint8Array<ArrayBuffer> => {
  const lengths = [1]
  for (let i = 0; i < depth; i++) {
    const childLength = lengths[i]
    lengths.push(1 + uvarint(childLength).length + childLength)
  }
  const bodyLength = lengths[depth]
  const header = uvarint(bodyLength + 1)
  const out = new Uint8Array(header.length + 1 + bodyLength)
  out.set(header)
  let offset = header.length
  out[offset++] = 0x20
  for (let i = depth; i > 0; i--) {
    out[offset++] = 1
    const childHeader = uvarint(lengths[i - 1])
    out.set(childHeader, offset)
    offset += childHeader.length
  }
  out[offset] = 0
  return out
}

const int64Frame = (value: bigint): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(10)
  out[0] = 9
  out[1] = 0x20
  new DataView(out.buffer).setBigInt64(2, value, true)
  return out
}

const sameNumber = (actual: unknown, expected: number) => {
  assert.isTrue(
    Object.is(actual, expected),
    `expected ${globalThis.String(actual)} to be exactly ${globalThis.String(expected)}`
  )
}

const encodeFingerprint = <A, I>(schema: Schema.Codec<A, I>, value: A): Uint8Array<ArrayBuffer> =>
  Schema.encodeUnknownSync(SchemaBinary.toCodec(schema, { fingerprint: true }))(value)

const roundtripFingerprint = <A, I>(schema: Schema.Codec<A, I>, value: A): A => {
  const codec = SchemaBinary.toCodec(schema, { fingerprint: true })
  return Schema.decodeUnknownSync(codec)(Schema.encodeUnknownSync(codec)(value))
}

// Splits a fingerprint frame into its layout hash and the payload after it,
// both as comparable strings.
const fingerprintFrame = <A, I>(
  schema: Schema.Codec<A, I>,
  value: A
): { readonly fingerprint: string; readonly payload: string } => {
  const bytes = encodeFingerprint(schema, value)
  let offset = 0
  while ((bytes[offset] & 0x80) !== 0) offset++
  offset++
  assert.strictEqual(bytes[offset], 0x21)
  return {
    fingerprint: Array.from(bytes.subarray(offset + 1, offset + 9)).join(","),
    payload: Array.from(bytes.subarray(offset + 9)).join(",")
  }
}

const fingerprintOf = <A, I>(schema: Schema.Codec<A, I>, value: A): string =>
  fingerprintFrame(schema, value).fingerprint

const schemaError = (f: () => unknown): Schema.SchemaError => {
  try {
    f()
  } catch (error) {
    if (Schema.isSchemaError(error)) return error
    throw error
  }
  throw new Error("expected SchemaError")
}

describe("SchemaBinary", () => {
  // Rows whose present optional fields differ, shared by the row-run shape
  // tests in both wire modes.
  const Varying = Schema.Struct({
    id: Schema.String,
    a: Schema.optionalKey(Schema.String),
    b: Schema.optionalKey(Schema.Number)
  })
  const varying = [
    { id: "0", a: "x" },
    { id: "1" },
    { id: "2", a: "x", b: 1 },
    { id: "3", a: "x" },
    { id: "4", b: 2 }
  ]

  describe("wire layout", () => {
    it("packs fixed-size array elements", () => {
      const numbers = [1.5, Number.NaN, -0, Number.POSITIVE_INFINITY]
      const numberBytes = encode(Schema.Array(Schema.Number), numbers)
      const decoded = roundtrip(Schema.Array(Schema.Number), numbers)
      // length, envelope, count, mode byte, four f64 elements
      assert.strictEqual(numberBytes.length, 36)
      assert.strictEqual(decoded[0], 1.5)
      assert.isTrue(Number.isNaN(decoded[1]))
      assert.isTrue(Object.is(decoded[2], -0))
      assert.strictEqual(decoded[3], Number.POSITIVE_INFINITY)

      const boolBytes = encode(Schema.Array(Schema.Boolean), [true, false, true])
      assert.strictEqual(boolBytes.length, 6)
      assert.deepStrictEqual(roundtrip(Schema.Array(Schema.Boolean), [true, false, true]), [true, false, true])
    })

    it("length-prefixes variable-size array elements and nested arrays", () => {
      assert.deepStrictEqual(
        roundtrip(Schema.Array(Schema.String), ["ab", "", "cdé"]),
        ["ab", "", "cdé"]
      )
      assert.deepStrictEqual(
        roundtrip(Schema.Array(Schema.Array(Schema.Number)), [[1, 2], [], [3]]),
        [[1, 2], [], [3]]
      )
    })

    it("round-trips zero-width array elements", () => {
      assert.deepStrictEqual(roundtrip(Schema.Array(Schema.Null), [null, null, null]), [null, null, null])
      assert.deepStrictEqual(
        roundtrip(Schema.Array(Schema.Undefined), [undefined, undefined]),
        [undefined, undefined]
      )
    })

    it("distinguishes absent optionals from present zero-width values", () => {
      const schema = Schema.Struct({ value: Schema.optionalKey(Schema.Undefined) })
      const absent = roundtrip(schema, {})
      const present = roundtrip(schema, { value: undefined })

      assert.isFalse(Object.hasOwn(absent, "value"))
      assert.isTrue(Object.hasOwn(present, "value"))
      assert.strictEqual(present.value, undefined)
      assert.strictEqual(roundtrip(Schema.Null, null), null)
      assert.strictEqual(roundtrip(Schema.Void, undefined), undefined)
    })

    it("includes non-enumerable fields in row presence masks", () => {
      const Row = Schema.Struct({ id: Schema.String, value: Schema.optionalKey(Schema.Undefined) })
      const row = Object.defineProperty({ id: "1" }, "value", { value: undefined })
      for (const decoded of [roundtrip(Schema.Array(Row), [row]), roundtripFingerprint(Schema.Array(Row), [row])]) {
        assert.isTrue(Object.hasOwn(decoded[0], "value"))
      }
    })

    it("round-trips every literal leaf kind and registered symbols", () => {
      const literals = Schema.Union([
        Schema.Literal("text"),
        Schema.Literal(1),
        Schema.Literal(true),
        Schema.Literal(2n)
      ])
      for (const value of ["text", 1, true, 2n] as const) {
        assert.strictEqual(roundtrip(literals, value), value)
      }

      const registered = Symbol.for("SchemaBinary/registered")
      assert.strictEqual(roundtrip(Schema.Symbol, registered), registered)
      assert.strictEqual(roundtrip(Schema.UniqueSymbol(registered), registered), registered)
    })

    it("omits the count for fixed tuples and includes it for optional tuples", () => {
      const pair = Schema.Tuple([Schema.String, Schema.Number])
      // length, envelope, then a length-prefixed slot each: "key" and varint 42
      assert.strictEqual(encode(pair, ["key", 42]).length, 8)
      assert.deepStrictEqual(roundtrip(pair, ["key", 42]), ["key", 42])

      const optional = Schema.Tuple([Schema.Number, Schema.optionalKey(Schema.Number)])
      assert.deepStrictEqual(roundtrip(optional, [1]), [1])
      assert.deepStrictEqual(roundtrip(optional, [1, 2]), [1, 2])
    })

    it("supports tuple rest and trailing slots", () => {
      const schema = Schema.TupleWithRest(Schema.Tuple([Schema.String]), [Schema.Number, Schema.Boolean])
      assert.deepStrictEqual(
        roundtrip(schema, ["head", 1.5, 2.5, 3.5, true]),
        ["head", 1.5, 2.5, 3.5, true]
      )
      assert.deepStrictEqual(roundtrip(schema, ["head", false]), ["head", false])
    })

    it("writes a length-first frame and rejects envelope or leftovers", () => {
      const codec = SchemaBinary.toCodec(Schema.Number)
      const bytes = Schema.encodeUnknownSync(codec)(1)
      assert.deepStrictEqual(Array.from(bytes), [2, 0x20, 0x02])

      const flags = bytes.slice()
      flags[1] = 0x21
      assert.match(schemaError(() => Schema.decodeUnknownSync(codec)(flags)).message, /version 2 envelope, flags 0/)

      const version = bytes.slice()
      version[1] = 0x30
      assert.match(schemaError(() => Schema.decodeUnknownSync(codec)(version)).message, /version 2 envelope, flags 0/)
      assert.match(
        schemaError(() => Schema.decodeUnknownSync(codec)(concat(bytes, bytes))).message,
        /no leftover bytes/
      )
    })
  })

  describe("string content", () => {
    it("preserves a leading U+FEFF in strings", () => {
      assert.strictEqual(roundtrip(Schema.String, "\uFEFFreport"), "\uFEFFreport")
    })
  })

  describe("output arena", () => {
    it("keeps an earlier result stable through later encodes and arena rollover", () => {
      const codec = SchemaBinary.toCodec(Schema.String)
      const encode = Schema.encodeUnknownSync(codec)
      const first = encode("first")
      const expected = first.slice()
      let rolledOver = false

      for (let i = 0; i < 500; i++) {
        const later = encode(`later-${i}-${"x".repeat(512)}`)
        if (later.buffer !== first.buffer) rolledOver = true
        assert.deepStrictEqual(first, expected)
      }

      assert.isTrue(rolledOver)
      assert.strictEqual(Schema.decodeUnknownSync(codec)(first), "first")
    })

    it("keeps different results independent inside a shared arena", () => {
      const codec = SchemaBinary.toCodec(Schema.String)
      const encode = Schema.encodeUnknownSync(codec)
      const decode = Schema.decodeUnknownSync(codec)
      const results = [encode("alpha"), encode("bravo"), encode("charlie")]

      assert.deepStrictEqual(results.map((bytes) => decode(bytes)), ["alpha", "bravo", "charlie"])
      const shared = results.flatMap((left, index) => results.slice(index + 1).map((right) => [left, right] as const))
        .find(([left, right]) => left.buffer === right.buffer)
      assert.isDefined(shared)
      assert.notStrictEqual(shared![0].byteOffset, shared![1].byteOffset)
    })

    it("preserves nested two-phase codec composition", () => {
      const Inner = Schema.Struct({ id: Schema.Number, label: Schema.String })
      const Outer = Schema.Struct({ id: Schema.String, inner: SchemaBinary.toCodec(Inner) })
      const codec = SchemaBinary.toCodec(Outer)
      const value = { id: "outer", inner: { id: 1, label: "inner" } }

      assert.deepStrictEqual(Schema.decodeUnknownSync(codec)(Schema.encodeUnknownSync(codec)(value)), value)
    })

    it.effect("keeps concurrent fiber results readable after their producing turn", () => {
      const Value = Schema.Struct({ id: Schema.Number, value: Schema.String })
      const codec = SchemaBinary.toCodec(Value)
      const encode = Schema.encodeUnknownEffect(codec)
      const decode = Schema.decodeUnknownSync(codec)
      const values = Array.from({ length: 100 }, (_, id) => ({ id, value: `value-${id}` }))

      return Effect.gen(function*() {
        const encoded = yield* Effect.forEach(
          values,
          (value) => encode(value).pipe(Effect.flatMap((bytes) => Effect.yieldNow.pipe(Effect.as(bytes)))),
          { concurrency: "unbounded" }
        )
        yield* Effect.yieldNow
        assert.deepStrictEqual(encoded.map((bytes) => decode(bytes)), values)
      })
    })
  })

  describe("numbers", () => {
    it("encodes integral values as sign-magnitude varints", () => {
      assert.deepStrictEqual(Array.from(encode(Schema.Number, 0)), [2, 0x20, 0])
      assert.deepStrictEqual(Array.from(encode(Schema.Number, -0)), [2, 0x20, 1])
      assert.deepStrictEqual(Array.from(encode(Schema.Number, 1)), [2, 0x20, 2])
      assert.deepStrictEqual(Array.from(encode(Schema.Number, -1)), [2, 0x20, 3])
      for (const value of [0, -0, 1, -1, 42, -42, 127, -128]) {
        sameNumber(roundtrip(Schema.Number, value), value)
      }
    })

    it("covers every varint width up to the seven byte cap, both signs", () => {
      for (let width = 1; width <= 7; width++) {
        // the widest magnitude this many varint bytes can hold, and the first
        // magnitude that needs one more
        const last = 2 ** (7 * width - 1) - 1
        const next = 2 ** (7 * width - 1)
        for (const sign of [1, -1]) {
          const inside = sign * last
          const outside = sign * next
          assert.strictEqual(encode(Schema.Number, inside).length, 2 + width, `${inside}`)
          sameNumber(roundtrip(Schema.Number, inside), inside)
          // past the cap the value takes the f64 form instead of an eighth byte
          assert.strictEqual(encode(Schema.Number, outside).length, width === 7 ? 10 : 3 + width, `${outside}`)
          sameNumber(roundtrip(Schema.Number, outside), outside)
        }
      }
    })

    it("encodes short decimals as a mantissa varint plus one scale byte", () => {
      assert.deepStrictEqual(Array.from(encode(Schema.Number, 1.5)), [3, 0x20, 30, 1])
      assert.deepStrictEqual(Array.from(encode(Schema.Number, -0.5)), [3, 0x20, 11, 1])
      assert.deepStrictEqual(Array.from(encode(Schema.Number, 0.001)), [3, 0x20, 2, 3])
      assert.deepStrictEqual(Array.from(encode(Schema.Number, 12.5)), [4, 0x20, 0xFA, 0x01, 1])
      for (const value of [0.1, 1.3, 4.7, 98.5, -123.456, 12345678.5, 0.00000001]) {
        sameNumber(roundtrip(Schema.Number, value), value)
      }
      // the widest mantissa a decimal may carry, and the first one past it
      const inside = 219902325555.1 // (2 ** 41 - 1) / 10
      assert.strictEqual(encode(Schema.Number, inside).length, 9)
      sameNumber(roundtrip(Schema.Number, inside), inside)
      const outside = 219902325555.3
      assert.strictEqual(encode(Schema.Number, outside).length, 10)
      sameNumber(roundtrip(Schema.Number, outside), outside)
    })

    it("keeps f64 for values neither a capped varint nor a decimal can hold", () => {
      const values = [
        Number.EPSILON,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.MAX_SAFE_INTEGER,
        Number.MIN_SAFE_INTEGER,
        Number.MAX_VALUE,
        Math.PI,
        1e-9,
        2 ** 48,
        -(2 ** 48)
      ]
      for (const value of values) {
        assert.strictEqual(encode(Schema.Number, value).length, 10, `${value}`)
        sameNumber(roundtrip(Schema.Number, value), value)
      }
    })

    it("discriminates struct number forms with the field wire kind", () => {
      const schema = Schema.Struct({ n: Schema.Number })
      // length, envelope, five-byte field tag, payload
      assert.strictEqual(encode(schema, { n: 7 }).length, 8)
      assert.strictEqual(encode(schema, { n: 7.5 }).length, 10)
      assert.strictEqual(encode(schema, { n: Math.PI }).length, 15)
      assert.deepStrictEqual(roundtrip(schema, { n: 7 }), { n: 7 })
      assert.deepStrictEqual(roundtrip(schema, { n: 7.5 }), { n: 7.5 })
      assert.deepStrictEqual(roundtrip(schema, { n: Math.PI }), { n: Math.PI })
      sameNumber(roundtrip(schema, { n: -0 }).n, -0)
    })

    it("uses the decimal wire kind in struct fields and record pairs", () => {
      const Field = Schema.Struct({ n: Schema.Number.pipe(SchemaBinary.fieldId(1)) })
      assert.deepStrictEqual([...encode(Field, { n: 7.5 })], [5, 0x20, 13, 0x96, 1, 1])

      const Record = Schema.Record(Schema.String, Schema.Number)
      assert.deepStrictEqual([...encode(Record, { x: 7.5 })], [8, 0x20, 0, 5, 13, 120, 0x96, 1, 1])
      assert.deepStrictEqual(roundtrip(Record, { x: 7.5 }), { x: 7.5 })
    })

    it("packs a uniform number array behind one mode byte", () => {
      const integers = [0, -0, 1, -1, 1000, -1000]
      // length, envelope, count, mode, four one-byte and two two-byte varints
      assert.strictEqual(encode(Schema.Array(Schema.Number), integers).length, 12)
      const decoded = roundtrip(Schema.Array(Schema.Number), integers)
      integers.forEach((value, index) => sameNumber(decoded[index], value))

      // one short decimal moves the run to the packed decimal mode
      const mixed = [1, 2.5]
      // length, envelope, count, mode, a one-byte and a two-byte code
      assert.strictEqual(encode(Schema.Array(Schema.Number), mixed).length, 7)
      assert.deepStrictEqual(roundtrip(Schema.Array(Schema.Number), mixed), mixed)
      const decimals = [-0, 0.25, 1e6, -12.75]
      const decoded2 = roundtrip(Schema.Array(Schema.Number), decimals)
      decimals.forEach((value, index) => sameNumber(decoded2[index], value))

      // one value outside both varint and decimal moves the whole run to f64
      const wide = [1, Math.PI]
      assert.strictEqual(encode(Schema.Array(Schema.Number), wide).length, 20)
      assert.deepStrictEqual(roundtrip(Schema.Array(Schema.Number), wide), wide)
      assert.deepStrictEqual(roundtrip(Schema.Array(Schema.Number), []), [])
      assert.deepStrictEqual(
        roundtrip(Schema.Array(Schema.Array(Schema.Number)), [[1, 2], [], [3.5]]),
        [[1, 2], [], [3.5]]
      )
    })

    it("rejects non-number elements in uniform number arrays", () => {
      const codec = SchemaBinary.toCodec(Schema.Array(Schema.Number))
      for (const value of ["x", undefined, null, 1n]) {
        const error = schemaError(() => Schema.encodeUnknownSync(codec)([1, value, 3] as any))
        assert.include(error.message, "Expected a number")
        assert.include(error.message, "at [1]")
      }
    })

    it("length-prefixes each number slot of a tuple", () => {
      const pair = Schema.Tuple([Schema.Number, Schema.Number])
      assert.strictEqual(encode(pair, [1, 2]).length, 6)
      assert.strictEqual(encode(pair, [1, 2.5]).length, 7)
      assert.strictEqual(encode(pair, [1, Math.PI]).length, 13)
      assert.deepStrictEqual(roundtrip(pair, [1, 2.5]), [1, 2.5])
      assert.deepStrictEqual(roundtrip(pair, [1, Math.PI]), [1, Math.PI])
      const rest = Schema.TupleWithRest(Schema.Tuple([Schema.String]), [Schema.Number])
      assert.deepStrictEqual(roundtrip(rest, ["head", 1, 2.5, 3]), ["head", 1, 2.5, 3])
    })

    it("carries every form behind the union kind byte", () => {
      const schema = Schema.Union([Schema.Number, Schema.String])
      assert.strictEqual(encode(schema, 5).length, 4)
      assert.strictEqual(encode(schema, 5.5).length, 5)
      assert.strictEqual(encode(schema, Math.PI).length, 11)
      assert.strictEqual(roundtrip(schema, 5), 5)
      assert.strictEqual(roundtrip(schema, 5.5), 5.5)
      assert.strictEqual(roundtrip(schema, Math.PI), Math.PI)
      assert.strictEqual(roundtrip(schema, "x"), "x")
      sameNumber(roundtrip(schema, -0), -0)

      const tagged = Schema.Union([
        Schema.Struct({ _tag: Schema.Literal("A"), n: Schema.Number }),
        Schema.Struct({ _tag: Schema.Literal("B"), n: Schema.Int })
      ])
      assert.deepStrictEqual(roundtrip(tagged, { _tag: "A", n: 1.5 }), { _tag: "A", n: 1.5 })
      assert.deepStrictEqual(roundtrip(tagged, { _tag: "B", n: -7 }), { _tag: "B", n: -7 })
    })

    it("parses a stream whose numbers change width", () => {
      const values = [0, -0, 1, -1, 63, 64, 1_000_000, -1_000_000, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER]
      const bytes = concat(...values.map((value) => encode(Schema.Number, value)))
      const parser = SchemaBinary.parser(Schema.Number)
      const out: Array<number> = []
      for (const byte of bytes) out.push(...parser.feedSync(Uint8Array.of(byte)))
      parser.endSync()
      assert.strictEqual(out.length, values.length)
      values.forEach((value, index) => sameNumber(out[index], value))
    })

    it("emits a bare varint when the schema proves the value is an integer", () => {
      assert.deepStrictEqual(Array.from(encode(Schema.Int, 1)), [2, 0x20, 2])
      assert.deepStrictEqual(Array.from(encode(Schema.Natural, 1)), [2, 0x20, 2])
      assert.deepStrictEqual(Array.from(encode(Schema.Number.check(Schema.isInt32()), 1)), [2, 0x20, 2])

      // no mode byte for an array, no length prefix for a tuple slot
      assert.strictEqual(encode(Schema.Array(Schema.Int), [1, 2, 3]).length, 6)
      assert.strictEqual(encode(Schema.Array(Schema.Number), [1, 2, 3]).length, 7)
      assert.strictEqual(encode(Schema.Tuple([Schema.Int, Schema.Int]), [1, 2]).length, 4)
      assert.strictEqual(encode(Schema.Tuple([Schema.Number, Schema.Number]), [1, 2]).length, 6)

      for (const value of [0, -0, 1, -1, 2 ** 48, -(2 ** 48), Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]) {
        sameNumber(roundtrip(Schema.Int, value), value)
        sameNumber(roundtrip(Schema.Array(Schema.Int), [value])[0], value)
        sameNumber(roundtrip(Schema.Struct({ n: Schema.Int }), { n: value }).n, value)
      }
      assert.deepStrictEqual(
        roundtrip(Schema.Array(Schema.Int), [1, -2, 3]),
        [1, -2, 3]
      )
    })

    it("rejects a non-integer that reaches the integer layout", () => {
      const codec = SchemaBinary.toCodec(Schema.Int)
      assert.match(
        schemaError(() => Schema.encodeUnknownSync(codec, { disableChecks: true })(1.5)).message,
        /an integer/
      )
    })

    it("rejects integer varints outside the safe-number range", () => {
      const codec = SchemaBinary.toCodec(Schema.Int)
      // Sign-magnitude encoding of Number.MAX_SAFE_INTEGER + 2. Converting it
      // to number would silently round it down to MAX_SAFE_INTEGER + 1.
      const unsafe = Uint8Array.of(9, 0x20, 0x82, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x20)

      assert.match(schemaError(() => Schema.decodeUnknownSync(codec)(unsafe)).message, /integer/)
    })

    it("rejects malformed number payloads", () => {
      const codec = SchemaBinary.toCodec(Schema.Number)
      // nine payload bytes are neither the varint nor the f64 form
      const wide = new Uint8Array([10, 0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0])
      assert.match(schemaError(() => Schema.decodeUnknownSync(codec)(wide)).message, /Expected f64/)
      // a varint that never terminates inside its extent
      const truncated = new Uint8Array([3, 0x20, 0x80, 0x80])
      assert.match(schemaError(() => Schema.decodeUnknownSync(codec)(truncated)).message, /complete value/)
      // a decimal tail whose scale byte is zero or out of range
      const zeroScale = new Uint8Array([3, 0x20, 30, 0])
      assert.match(schemaError(() => Schema.decodeUnknownSync(codec)(zeroScale)).message, /Expected decimal/)
      const wideScale = new Uint8Array([3, 0x20, 30, 9])
      assert.match(schemaError(() => Schema.decodeUnknownSync(codec)(wideScale)).message, /Expected decimal/)
      const longTail = new Uint8Array([4, 0x20, 30, 1, 1])
      assert.match(schemaError(() => Schema.decodeUnknownSync(codec)(longTail)).message, /Expected decimal/)

      const arrayCodec = SchemaBinary.toCodec(Schema.Array(Schema.Number))
      const run = Schema.encodeUnknownSync(arrayCodec)([1, 2, 3])
      const unknownMode = run.slice()
      unknownMode[3] = 3
      assert.match(schemaError(() => Schema.decodeUnknownSync(arrayCodec)(unknownMode)).message, /Expected f64/)
      const shortRun = run.slice(0, run.length - 1)
      shortRun[0] -= 1
      assert.match(schemaError(() => Schema.decodeUnknownSync(arrayCodec)(shortRun)).message, /complete value/)
    })
  })

  describe("schema evolution", () => {
    it("skips unknown fields, accepts field reorder, and leaves missing optionals absent", () => {
      const Writer = Schema.Struct({ a: Schema.Number, extra: Schema.String, b: Schema.String })
      const Reader = Schema.Struct({ b: Schema.String, a: Schema.Number, optional: Schema.optionalKey(Schema.Boolean) })
      const bytes = encode(Writer, { a: 1, extra: "drop", b: "keep" })
      assert.deepStrictEqual(Schema.decodeUnknownSync(SchemaBinary.toCodec(Reader))(bytes), { a: 1, b: "keep" })

      const OrderedA = Schema.Struct({ a: Schema.Number, b: Schema.String })
      const OrderedB = Schema.Struct({ b: Schema.String, a: Schema.Number })
      assert.deepStrictEqual([...encode(OrderedA, { a: 1, b: "x" })], [...encode(OrderedB, { a: 1, b: "x" })])
    })

    it("orders extra keys by raw UTF-8 whatever the insertion order", () => {
      const record = Schema.Record(Schema.String, Schema.Number)
      // Code unit order puts the surrogate pair first, raw UTF-8 does not.
      const wide = "\u{10000}"
      const replacement = "\uFFFD"
      assert.deepStrictEqual(
        [...encode(record, { [wide]: 1, [replacement]: 2 })],
        [...encode(record, { [replacement]: 2, [wide]: 1 })]
      )
      assert.deepStrictEqual(roundtrip(record, { [wide]: 1, [replacement]: 2 }), { [wide]: 1, [replacement]: 2 })
      assert.deepStrictEqual(
        [...encode(record, { b: 1, a: 2 })],
        [...encode(record, { a: 2, b: 1 })]
      )
    })

    it("keeps canonical key order when record shapes change within a frame", () => {
      const rows = Schema.Array(Schema.Record(Schema.String, Schema.Number))
      const mixed = [{ b: 2, a: 1 }, { a: 1, b: 2 }, { a: 1 }, { c: 3, a: 1 }, { a: 1, b: 2 }]
      assert.deepStrictEqual(roundtrip(rows, mixed), mixed)
      assert.deepStrictEqual(
        [...encode(rows, mixed)],
        [...encode(rows, [{ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 1 }, { a: 1, c: 3 }, { b: 2, a: 1 }])]
      )
    })

    it("uses fieldId as the encoded-side field identity", () => {
      const Before = Schema.Struct({ oldName: Schema.String.pipe(SchemaBinary.fieldId(1)) })
      const After = Schema.Struct({ newName: Schema.String.pipe(SchemaBinary.fieldId(1)) })
      const bytes = encode(Before, { oldName: "value" })
      assert.deepStrictEqual(Schema.decodeUnknownSync(SchemaBinary.toCodec(After))(bytes), { newName: "value" })
      assert.throws(() => SchemaBinary.fieldId(0))
      assert.throws(() => SchemaBinary.fieldId(1.5))
    })

    it("packs explicit field ids with scalar wire kinds", () => {
      const schema = Schema.Struct({
        n: Schema.Number.pipe(SchemaBinary.fieldId(1)),
        flag: Schema.Boolean.pipe(SchemaBinary.fieldId(2)),
        text: Schema.String.pipe(SchemaBinary.fieldId(3))
      })
      const value = { n: 7, flag: true, text: "x" }

      assert.deepStrictEqual([...encode(schema, value)], [7, 0x20, 9, 14, 20, 24, 1, 120])
      assert.deepStrictEqual(roundtrip(schema, value), value)
    })

    it("validates the full fieldId range and ignores tuple annotations", () => {
      for (const id of [-1, Number.NaN, Number.POSITIVE_INFINITY, 0x1_0000_0000]) {
        assert.throws(() => SchemaBinary.fieldId(id), /integer in \[1, 4294967295\]/)
      }
      assert.doesNotThrow(() => SchemaBinary.fieldId(0xFFFFFFFF))

      const Max = Schema.Struct({ flag: Schema.Boolean.pipe(SchemaBinary.fieldId(0xFFFFFFFF)) })
      const maxBytes = encode(Max, { flag: true })
      assert.strictEqual(maxBytes.length, 7)
      assert.deepStrictEqual([...maxBytes.subarray(2)], [0xFC, 0xFF, 0xFF, 0xFF, 0x7F])
      assert.deepStrictEqual(roundtrip(Max, { flag: true }), { flag: true })

      const plain = Schema.Tuple([Schema.String])
      const annotated = Schema.Tuple([Schema.String.pipe(SchemaBinary.fieldId(123))])
      assert.deepStrictEqual([...encode(annotated, ["value"])], [...encode(plain, ["value"])])
    })

    it("keeps canonically distinct Unicode field names distinct", () => {
      const composed = "\u00E9"
      const decomposed = "e\u0301"
      const schema = Schema.Struct({ [composed]: Schema.String, [decomposed]: Schema.String })
      const value = { [composed]: "composed", [decomposed]: "decomposed" }

      assert.deepStrictEqual(roundtrip(schema, value), value)
    })

    it("skips unknown fields as opaque bytes and still rejects repeated unknown ids", () => {
      const Writer = Schema.Struct({ future: Schema.Uint8Array.pipe(SchemaBinary.fieldId(7)) })
      const Reader = Schema.Struct({})
      const bytes = encode(Writer, { future: Uint8Array.of(0x80, 0xFF, 0x10) })
      assert.deepStrictEqual(Schema.decodeUnknownSync(SchemaBinary.toCodec(Reader))(bytes), {})

      const field = bytes.slice(2)
      const duplicate = concat(Uint8Array.of(1 + field.length * 2, 0x20), field, field)
      assert.match(
        schemaError(() => Schema.decodeUnknownSync(SchemaBinary.toCodec(Reader))(duplicate)).message,
        /unique field ids/
      )
    })

    it("skips every scalar wire shape for unknown fields", () => {
      const Reader = Schema.Struct({})
      const bytes = Uint8Array.of(
        10,
        0x20,
        7 * 8 + 5,
        0,
        0,
        8 * 8 + 6,
        0,
        0,
        0,
        0,
        9 * 8 + 7
      )

      assert.deepStrictEqual(Schema.decodeUnknownSync(SchemaBinary.toCodec(Reader))(bytes), {})
    })

    it("skips an unknown union member on an optional struct field", () => {
      const A = Schema.Struct({ _tag: Schema.Literal("A"), n: Schema.Number })
      const B = Schema.Struct({ _tag: Schema.Literal("B"), text: Schema.String })
      const Writer = Schema.Struct({ event: Schema.optionalKey(Schema.Union([A, B])) })
      const Reader = Schema.Struct({ event: Schema.optionalKey(Schema.Union([A])) })
      assert.deepStrictEqual(
        Schema.decodeUnknownSync(SchemaBinary.toCodec(Reader))(encode(Writer, { event: { _tag: "B", text: "new" } })),
        {}
      )
      assert.deepStrictEqual(
        Schema.decodeUnknownSync(SchemaBinary.toCodec(Reader))(encode(Writer, { event: { _tag: "A", n: 1 } })),
        { event: { _tag: "A", n: 1 } }
      )
    })

    it("keeps tuple sentinels in variant payloads", () => {
      const A = Schema.Tuple([Schema.Literal("A"), Schema.Number])
      const B = Schema.Tuple([Schema.Literal("B"), Schema.String])
      const schema = Schema.Union([A, B])
      assert.deepStrictEqual(roundtrip(schema, ["A", 1]), ["A", 1])
      assert.deepStrictEqual(roundtrip(schema, ["B", "value"]), ["B", "value"])
    })

    it("rejects unknown union members in positional slots", () => {
      const A = Schema.Struct({ _tag: Schema.Literal("A") })
      const B = Schema.Struct({ _tag: Schema.Literal("B") })
      const WriterArray = Schema.Array(Schema.Union([A, B]))
      const ReaderArray = Schema.Array(Schema.Union([A]))
      assert.match(
        schemaError(() =>
          Schema.decodeUnknownSync(SchemaBinary.toCodec(ReaderArray))(encode(WriterArray, [{ _tag: "B" }]))
        ).message,
        /Missing key/
      )

      const WriterTuple = Schema.Tuple([Schema.optionalKey(Schema.Union([A, B]))])
      const ReaderTuple = Schema.Tuple([Schema.optionalKey(Schema.Union([A]))])
      assert.match(
        schemaError(() =>
          Schema.decodeUnknownSync(SchemaBinary.toCodec(ReaderTuple))(encode(WriterTuple, [{ _tag: "B" }]))
        ).message,
        /known union member/
      )
    })

    it("reports the array or tuple index for an unknown positional union member", () => {
      const A = Schema.Struct({ _tag: Schema.Literal("A") })
      const B = Schema.Struct({ _tag: Schema.Literal("B") })
      const WriterArray = Schema.Struct({ xs: Schema.Array(Schema.Union([A, B])) })
      const ReaderArray = Schema.Struct({ xs: Schema.Array(Schema.Union([A])) })
      assert.match(
        schemaError(() =>
          Schema.decodeUnknownSync(SchemaBinary.toCodec(ReaderArray))(
            encode(WriterArray, { xs: [{ _tag: "B" }] })
          )
        ).message,
        /Missing key\n  at \["xs"\]\[0\]/
      )

      const WriterTuple = Schema.Struct({ xs: Schema.Tuple([Schema.String, Schema.Union([A, B])]) })
      const ReaderTuple = Schema.Struct({ xs: Schema.Tuple([Schema.String, Schema.Union([A])]) })
      assert.match(
        schemaError(() =>
          Schema.decodeUnknownSync(SchemaBinary.toCodec(ReaderTuple))(
            encode(WriterTuple, { xs: ["head", { _tag: "B" }] })
          )
        ).message,
        /Missing key\n  at \["xs"\]\[1\]/
      )
    })

    it("uses kind tags for mixed enums", () => {
      const Mixed = { Text: "text", Code: 1 } as const
      const schema = Schema.Enum(Mixed)
      assert.strictEqual(roundtrip(schema, Mixed.Text), "text")
      assert.strictEqual(roundtrip(schema, Mixed.Code), 1)
    })

    it("encodes record entries in the reserved field zero map", () => {
      const schema = Schema.Record(Schema.String, Schema.Number)
      const value = { z: 1, a: 2 }
      assert.deepStrictEqual(roundtrip(schema, value), value)
      assert.deepStrictEqual([...encode(schema, value)], [...encode(schema, { a: 2, z: 1 })])
    })

    it("round-trips __proto__ named fields without changing the prototype", () => {
      const schema = Schema.Struct({ ["__proto__"]: Schema.String, ok: Schema.String })
      const value = { ["__proto__"]: "named", ok: "yes" }

      for (const result of [roundtrip(schema, value), roundtripFingerprint(schema, value)]) {
        assert.strictEqual(Object.getPrototypeOf(result), Object.prototype)
        assert.isTrue(Object.prototype.propertyIsEnumerable.call(result, "__proto__"))
        assert.strictEqual(result.__proto__, "named")
        assert.strictEqual(({} as Record<string, unknown>).polluted, undefined)
      }
    })

    it("round-trips __proto__ record entries with object values without changing the prototype", () => {
      const schema = Schema.Record(Schema.String, Schema.Struct({ polluted: Schema.Boolean }))
      const value = { ["__proto__"]: { polluted: true } }

      for (const result of [roundtrip(schema, value), roundtripFingerprint(schema, value)]) {
        assert.strictEqual(Object.getPrototypeOf(result), Object.prototype)
        assert.isTrue(Object.prototype.propertyIsEnumerable.call(result, "__proto__"))
        assert.deepStrictEqual(result.__proto__, { polluted: true })
        assert.strictEqual(({} as Record<string, unknown>).polluted, undefined)
      }
    })

    it("round-trips __proto__ tagged-union sentinels without changing the prototype", () => {
      const A = Schema.Struct({ ["__proto__"]: Schema.Literal("A"), value: Schema.String })
      const B = Schema.Struct({ ["__proto__"]: Schema.Literal("B"), value: Schema.String })
      const schema = Schema.Union([A, B])
      const value = { ["__proto__"]: "A" as const, value: "a" }

      for (const result of [roundtrip(schema, value), roundtripFingerprint(schema, value)]) {
        assert.strictEqual(Object.getPrototypeOf(result), Object.prototype)
        assert.isTrue(Object.prototype.propertyIsEnumerable.call(result, "__proto__"))
        assert.strictEqual(result.__proto__, "A")
        assert.strictEqual(({} as Record<string, unknown>).polluted, undefined)
      }
    })
  })

  describe("struct row runs", () => {
    const Row = Schema.Struct({
      id: Schema.String,
      label: Schema.String,
      tags: Schema.Array(Schema.String),
      attributes: Schema.Record(Schema.String, Schema.String)
    })
    const rows = Array.from({ length: 6 }, (_, index) => ({
      id: `row-${index}`,
      label: index % 2 === 0 ? "even" : "odd",
      tags: index % 3 === 0 ? ["red", "blue"] : ["blue"],
      attributes: { region: "eu", worker: `w${index}` }
    }))
    const nonEmptyRows = rows as [typeof rows[number], ...Array<typeof rows[number]>]

    it("shares field ids and repeated strings across rows", () => {
      assert.deepStrictEqual(roundtrip(Schema.Array(Row), rows), rows)
      assert.deepStrictEqual(roundtrip(Schema.NonEmptyArray(Row), nonEmptyRows), nonEmptyRows)
      const one = encode(Schema.Array(Row), rows.slice(0, 1)).length
      const six = encode(Schema.Array(Row), rows).length
      assert.isBelow(six, one * 6)
    })

    it("keeps evolution rules inside a run", () => {
      const Reader = Schema.Struct({
        tags: Schema.Array(Schema.String),
        id: Schema.String,
        later: Schema.optionalKey(Schema.Boolean)
      })
      assert.deepStrictEqual(
        Schema.decodeUnknownSync(SchemaBinary.toCodec(Schema.Array(Reader)))(encode(Schema.Array(Row), rows)),
        rows.map(({ id, tags }) => ({ id, tags }))
      )
    })

    it("declares a new shape whenever the present fields change", () => {
      assert.deepStrictEqual(roundtrip(Schema.Array(Varying), varying), varying)
    })

    it("interns index signature keys on the row struct itself", () => {
      const WithRest = Schema.StructWithRest(Schema.Struct({ id: Schema.String }), [
        Schema.Record(Schema.String, Schema.String)
      ])
      const values = [{ id: "a", note: "1" }, { id: "b", note: "2" }, { id: "c" }]
      assert.deepStrictEqual(roundtrip(Schema.Array(WithRest), values), values)
    })

    it("runs nested inside a run", () => {
      const Inner = Schema.Struct({ k: Schema.String, v: Schema.String })
      const Outer = Schema.Struct({ name: Schema.String, items: Schema.Array(Inner) })
      const outers = Array.from({ length: 4 }, (_, index) => ({
        name: `n${index}`,
        items: [{ k: "a", v: "1" }, { k: "b", v: "1" }]
      }))
      assert.deepStrictEqual(roundtrip(Schema.Array(Outer), outers), outers)
    })

    it("keeps rows independent past the 30 field shape limit", () => {
      const fields: Record<string, Schema.String> = {}
      const value: Record<string, string> = {}
      for (let i = 0; i < 35; i++) {
        fields[`f${i}`] = Schema.String
        value[`f${i}`] = `v${i}`
      }
      const Wide = Schema.Struct(fields)
      assert.deepStrictEqual(roundtrip(Schema.Array(Wide), [value, value, value]), [value, value, value])
    })

    it("rejects an unknown row shape and an out of range back-reference", () => {
      const Simple = Schema.Array(Schema.Struct({ a: Schema.String }))
      const codec = SchemaBinary.toCodec(Simple)
      // The second row reuses shape 0 and back-references the first `a`, so its
      // last two bytes are the shape code and the region code.
      const bytes = encode(Simple, [{ a: "x" }, { a: "x" }])
      assert.deepStrictEqual([...bytes.subarray(bytes.length - 2)], [1, 1])

      const unknownShape = bytes.slice()
      unknownShape[unknownShape.length - 2] = 9
      assert.match(schemaError(() => Schema.decodeUnknownSync(codec)(unknownShape)).message, /row shape/)

      const unknownRef = bytes.slice()
      unknownRef[unknownRef.length - 1] = 5
      assert.match(schemaError(() => Schema.decodeUnknownSync(codec)(unknownRef)).message, /back-reference/)
    })

    it("keeps a skipped field's own run out of the reader's tables", () => {
      const Writer = Schema.Struct({
        keep: Schema.String,
        gone: Schema.Array(Schema.Struct({ p: Schema.String, q: Schema.String }))
      })
      const Reader = Schema.Struct({ keep: Schema.String })
      const values = Array.from({ length: 4 }, (_, index) => ({
        keep: `k${index}`,
        gone: [{ p: "z", q: "z" }, { p: "z", q: "z" }]
      }))
      assert.deepStrictEqual(
        Schema.decodeUnknownSync(SchemaBinary.toCodec(Schema.Array(Reader)))(encode(Schema.Array(Writer), values)),
        values.map(({ keep }) => ({ keep }))
      )
    })

    it("interns every index signature key, including ones it has no signature for", () => {
      const Writer = Schema.Struct({ attrs: Schema.Record(Schema.String, Schema.String) })
      const Reader = Schema.Struct({
        attrs: Schema.Record(
          Schema.String.check(Schema.makeFilter((key: string) => key.startsWith("keep"))),
          Schema.String
        )
      })
      // The reader drops `drop` but must still number it, or row 2's reference
      // to `keep1` resolves to `keep2`.
      const values = [
        { attrs: { drop: "d", keep1: "a" } },
        { attrs: { keep2: "b" } },
        { attrs: { keep1: "c" } }
      ]
      assert.deepStrictEqual(
        Schema.decodeUnknownSync(SchemaBinary.toCodec(Schema.Array(Reader)))(encode(Schema.Array(Writer), values)),
        [{ attrs: { keep1: "a" } }, { attrs: { keep2: "b" } }, { attrs: { keep1: "c" } }]
      )
    })

    it("keeps two fields sharing one layout on separate tables", () => {
      const Writer = Schema.Struct({ keep: Schema.String, gone: Schema.String })
      const Reader = Schema.Struct({ keep: Schema.String })
      const values = [
        { keep: "first", gone: "other" },
        { keep: "other", gone: "first" },
        { keep: "first", gone: "first" }
      ]
      assert.deepStrictEqual(
        Schema.decodeUnknownSync(SchemaBinary.toCodec(Schema.Array(Reader)))(encode(Schema.Array(Writer), values)),
        values.map(({ keep }) => ({ keep }))
      )
    })

    it("holds references past the point a slot switches to a map", () => {
      const Many = Schema.Struct({ v: Schema.String })
      const many = Array.from({ length: 60 }, (_, index) => ({ v: `v${index % 21}` }))
      assert.deepStrictEqual(roundtrip(Schema.Array(Many), many), many)
    })

    it("round-trips a slot that stops interning values that never repeat", () => {
      const Many = Schema.Struct({ v: Schema.String })
      // All-distinct values disable the writer's table at the decide point;
      // repeats past it are written literally and must still round-trip.
      const many = Array.from({ length: 160 }, (_, index) => ({ v: `value-${index % 80}` }))
      assert.deepStrictEqual(roundtrip(Schema.Array(Many), many), many)
      const keyed = Schema.Struct({ attributes: Schema.Record(Schema.String, Schema.String) })
      const rows = Array.from({ length: 160 }, (_, index) => ({
        attributes: { [`key-${index % 80}`]: `w${index}` }
      }))
      assert.deepStrictEqual(roundtrip(Schema.Array(keyed), rows), rows)
    })

    it("gives each recursive occurrence its own run", () => {
      interface Node {
        readonly name: string
        readonly children: ReadonlyArray<Node>
      }
      const Node = Schema.Struct({
        name: Schema.String,
        children: Schema.Array(Schema.suspend((): Schema.Codec<Node> => Node))
      })
      const tree = [
        { name: "a", children: [{ name: "x", children: [] }, { name: "x", children: [] }] },
        { name: "a", children: [{ name: "y", children: [{ name: "x", children: [] }] }] }
      ]
      assert.deepStrictEqual(roundtrip(Schema.Array(Node), tree), tree)
    })

    it("reports the row index and field name for a missing key", () => {
      const Required = Schema.Struct({ a: Schema.String, b: Schema.String })
      assert.match(
        schemaError(() =>
          Schema.encodeUnknownSync(SchemaBinary.toCodec(Schema.Array(Required)))(
            [{ a: "1", b: "2" }, { a: "1" } as never]
          )
        ).message,
        /Missing key\n  at \[1\]\["b"\]/
      )
    })

    it("runs rows in fingerprint mode with mask-declared shapes", () => {
      assert.deepStrictEqual(roundtripFingerprint(Schema.Array(Row), rows), rows)
      // repeated strings are interned across rows
      const one = encodeFingerprint(Schema.Array(Row), rows.slice(0, 1)).length
      const six = encodeFingerprint(Schema.Array(Row), rows).length
      assert.isBelow(six, one * 6)
      // the mask shape has no id list, so fingerprint rows undercut default rows
      assert.isBelow(six, encode(Schema.Array(Row), rows).length)
    })

    it("declares fingerprint shapes whenever the present fields change", () => {
      assert.deepStrictEqual(roundtripFingerprint(Schema.Array(Varying), varying), varying)
    })

    it("rejects a fingerprint shape mask with unknown bits", () => {
      const codec = SchemaBinary.toCodec(Schema.Array(Row), { fingerprint: true })
      const bytes = Schema.encodeUnknownSync(codec)(rows.slice(0, 1)).slice()
      // length | envelope | 8-byte fingerprint | count | row length | code 0 | mask
      assert.strictEqual(bytes[12], 0)
      bytes[13] = 0x7F
      assert.match(
        schemaError(() => Schema.decodeUnknownSync(codec)(bytes)).message,
        /known row shape/
      )
    })
  })

  describe("parser", () => {
    it("accepts empty input and spends the parser after a successful end", () => {
      const parser = SchemaBinary.parser(Schema.String)
      assert.deepStrictEqual(parser.feedSync(new Uint8Array()), [])
      parser.endSync()
      assert.match(schemaError(() => parser.endSync()).message, /parser is spent/)
    })

    it("parses concatenated frames split across chunks", () => {
      const schema = Schema.Struct({ a: Schema.Number })
      const first = encode(schema, { a: 1 })
      const second = encode(schema, { a: 2 })
      const bytes = concat(first, second)
      const parser = SchemaBinary.parser(schema)
      assert.deepStrictEqual(parser.feedSync(bytes.slice(0, first.length + 3)), [{ a: 1 }])
      assert.deepStrictEqual(parser.feedSync(bytes.slice(first.length + 3)), [{ a: 2 }])
      parser.endSync()
      assert.match(schemaError(() => parser.feedSync(new Uint8Array())).message, /parser is spent/)
    })

    it("parses exact nested structs, arrays, and string records", () => {
      const schema = Schema.Struct({
        id: Schema.Number,
        active: Schema.Boolean,
        tags: Schema.Array(Schema.String),
        metrics: Schema.Record(Schema.String, Schema.Number)
      })
      const value = { id: 1, active: true, tags: ["a", "b"], metrics: { x: 1, y: 2 } }
      const parser = SchemaBinary.parser(schema)

      assert.deepStrictEqual(parser.feedSync(encode(schema, value)), [value])
      parser.endSync()
    })

    it("fails deeply nested recursive frames with SchemaError", () => {
      type Nested = ReadonlyArray<Nested>
      let Nested: Schema.Codec<Nested>
      Nested = Schema.Array(Schema.suspend(() => Nested))
      const parser = SchemaBinary.parser(Nested)

      assert.match(schemaError(() => parser.feedSync(nestedArrayFrame(10_000))).message, /nesting depth at most/)
      assert.match(schemaError(() => parser.feedSync(new Uint8Array())).message, /parser is spent/)
    })

    it("keeps __proto__ safe on the exact parser path", () => {
      const schema = Schema.Struct({ ["__proto__"]: Schema.String, value: Schema.Number })
      const value = { ["__proto__"]: "own", value: 1 }
      const parser = SchemaBinary.parser(schema)
      const [result] = parser.feedSync(encode(schema, value))

      assert.strictEqual(Object.getPrototypeOf(result), Object.prototype)
      assert.isTrue(Object.prototype.propertyIsEnumerable.call(result, "__proto__"))
      assert.strictEqual(result.__proto__, "own")
      assert.strictEqual(({} as Record<string, unknown>).polluted, undefined)
      parser.endSync()
    })

    it("retains Schema predicates erased by the binary layout", () => {
      const rejects = (
        reader: Schema.Constraint,
        writer: Schema.Codec<unknown, unknown>,
        value: unknown
      ) => {
        const parser = SchemaBinary.parser(reader)
        assert.isTrue(Schema.isSchemaError(schemaError(() => parser.feedSync(encode(writer, value)))))
      }

      rejects(Schema.TemplateLiteral(["a"]), Schema.String, "zzz")
      rejects(Schema.Literal("a"), Schema.String, "zzz")
      rejects(Schema.Enum({ A: "a", B: "b" }), Schema.String, "zzz")
      rejects(Schema.UniqueSymbol(Symbol.for("expected")), Schema.Symbol, Symbol.for("other"))
      rejects(Schema.ObjectKeyword, Schema.Unknown, 1)
    })

    it("retains Schema parsing for numeric record keys", () => {
      const Writer = Schema.Record(Schema.String, Schema.Number)
      const Reader = Schema.Record(Schema.Number, Schema.Number)
      const parser = SchemaBinary.parser(Reader)

      assert.deepStrictEqual(parser.feedSync(encode(Writer, { "01": 1, "1e2": 2, "-0": 3 })), [{
        "0": 3,
        "1": 1,
        "100": 2
      }])
      parser.endSync()
    })

    it("retains transformations, checks, unions, declarations, and recursive validation", () => {
      const transformed = SchemaBinary.parser(Schema.NumberFromString)
      assert.deepStrictEqual(transformed.feedSync(encode(Schema.NumberFromString, 123)), [123])
      transformed.endSync()

      const NonNegative = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))
      assert.match(
        schemaError(() => SchemaBinary.parser(NonNegative).feedSync(encode(Schema.Number, -1))).message,
        /greater than or equal to 0/
      )

      const CheckedUnion = Schema.Union([NonNegative, Schema.String])
      const BroadUnion = Schema.Union([Schema.Number, Schema.String])
      assert.match(
        schemaError(() => SchemaBinary.parser(CheckedUnion).feedSync(encode(BroadUnion, -1))).message,
        /greater than or equal to 0/
      )

      const CheckedOption = Schema.Option(NonNegative)
      const BroadOption = Schema.Option(Schema.Number)
      assert.match(
        schemaError(() => SchemaBinary.parser(CheckedOption).feedSync(encode(BroadOption, Option.some(-1)))).message,
        /greater than or equal to 0/
      )

      interface Node {
        readonly value: number
        readonly children: ReadonlyArray<Node>
      }
      let Writer: Schema.Codec<Node>
      Writer = Schema.Struct({
        value: Schema.Number,
        children: Schema.Array(Schema.suspend(() => Writer))
      })
      let Reader: Schema.Codec<Node>
      Reader = Schema.Struct({
        value: NonNegative,
        children: Schema.Array(Schema.suspend(() => Reader))
      })
      const invalid = { value: 1, children: [{ value: -1, children: [] }] }
      assert.match(
        schemaError(() => SchemaBinary.parser(Reader).feedSync(encode(Writer, invalid))).message,
        /greater than or equal to 0/
      )
    })

    it("retains partial frames across one-byte feeds", () => {
      const bytes = concat(...Array.from({ length: 100 }, (_, i) => encode(Schema.Number, i)))
      const parser = SchemaBinary.parser(Schema.Number)
      const values: Array<number> = []
      for (const byte of bytes) values.push(...parser.feedSync(Uint8Array.of(byte)))
      parser.endSync()
      assert.deepStrictEqual(values, Array.from({ length: 100 }, (_, i) => i))
    })

    it("waits for a fragmented multi-byte frame header", () => {
      const value = "x".repeat(300)
      const bytes = encode(Schema.String, value)
      const parser = SchemaBinary.parser(Schema.String)

      assert.deepStrictEqual(parser.feedSync(bytes.slice(0, 1)), [])
      assert.deepStrictEqual(parser.feedSync(bytes.slice(1)), [value])
      parser.endSync()
    })

    it("uses the bigint header path for longer safe lengths", () => {
      // Canonical uvarint(Number.MAX_SAFE_INTEGER): seven continuation groups
      // followed by the final four bits. maxFrameSize rejects it before the
      // parser waits for an impractically large body.
      const bytes = Uint8Array.of(0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x0F)
      const parser = SchemaBinary.parser(Schema.String, { maxFrameSize: 1 })

      assert.deepStrictEqual(parser.feedSync(bytes.slice(0, 7)), [])
      assert.match(schemaError(() => parser.feedSync(bytes.slice(7))).message, /frame within maxFrameSize/)
    })

    it("keeps parser index-signature caching bounded with FIFO eviction", () => {
      let checks = 0
      const Key = Schema.String.check(Schema.makeFilter((_: string) => {
        checks++
        return true
      }))
      const Writer = Schema.Record(Schema.String, Schema.Number)
      const parser = SchemaBinary.parser(Schema.Record(Key, Schema.Number))
      const feed = (key: string) => {
        const value = { [key]: 1 }
        assert.deepStrictEqual(parser.feedSync(encode(Writer, value)), [value])
      }

      // The parser cache holds 256 attacker-controlled (layout, key) pairs.
      // The 257th evicts key-0, while key-1 remains cached.
      for (let i = 0; i < 257; i++) feed(`key-${i}`)
      const beforeHit = checks
      feed("key-1")
      const hitChecks = checks - beforeHit
      const beforeMiss = checks
      feed("key-0")
      const missChecks = checks - beforeMiss

      assert.strictEqual(missChecks, hitChecks + 1)
      parser.endSync()
    })

    it("does not thrash the index-signature cache above its bound", () => {
      let checks = 0
      const Key = Schema.String.check(Schema.makeFilter((_: string) => {
        checks++
        return true
      }))
      const Writer = Schema.Record(Schema.String, Schema.Number)
      const Reader = Schema.Record(Key, Schema.Number)
      const allHitParser = SchemaBinary.parser(Reader)
      const allHitValue = Object.fromEntries(Array.from({ length: 256 }, (_, index) => [`hit-${index}`, index]))
      const allHitBytes = encode(Writer, allHitValue)

      assert.deepStrictEqual(allHitParser.feedSync(allHitBytes), [allHitValue])
      const beforeAllHit = checks
      assert.deepStrictEqual(allHitParser.feedSync(allHitBytes), [allHitValue])
      const allHitChecksPerKey = (checks - beforeAllHit) / 256
      allHitParser.endSync()

      const parser = SchemaBinary.parser(Reader)
      const value = Object.fromEntries(Array.from({ length: 300 }, (_, index) => [`key-${index}`, index]))
      const bytes = encode(Writer, value)

      assert.deepStrictEqual(parser.feedSync(bytes), [value])
      const firstChecks = checks
      assert.deepStrictEqual(parser.feedSync(bytes), [value])
      const secondChecks = checks - firstChecks
      const misses = secondChecks - allHitChecksPerKey * 300

      // Derive the decoder's per-key work from a fully warm parser. Each cache
      // miss adds one classification check beyond that all-hit baseline.
      assert.strictEqual(misses, 45)
      parser.endSync()
    })

    it("isolates index-signature caches by parser options", () => {
      const Key = Schema.String.check(Schema.makeFilter((key: string) => key.startsWith("allowed-")))
      const Writer = Schema.Record(Schema.String, Schema.Number)
      const Reader = Schema.Record(Key, Schema.Number)
      const bytes = encode(Writer, { denied: 1 })
      const strict = SchemaBinary.parser(Reader)
      const unchecked = SchemaBinary.parser(Reader, { disableChecks: true })

      assert.deepStrictEqual(strict.feedSync(bytes), [{}])
      assert.deepStrictEqual(unchecked.feedSync(bytes), [{ denied: 1 }])
      strict.endSync()
      unchecked.endSync()
    })

    it("keeps nested SchemaBinary decodes independent from the outer reader", () => {
      const Inner = Schema.Struct({ id: Schema.Number, label: Schema.String })
      const Outer = Schema.Struct({ id: Schema.String, inner: SchemaBinary.toCodec(Inner) })
      const first = { id: "first", inner: { id: 1, label: "one" } }
      const second = { id: "second", inner: { id: 2, label: "two" } }
      const parser = SchemaBinary.parser(Outer)

      assert.deepStrictEqual(parser.feedSync(concat(encode(Outer, first), encode(Outer, second))), [first, second])
      parser.endSync()
    })

    it("returns a checked-out one-shot reader after an exceptional decode", () => {
      const codec = SchemaBinary.toCodec(Schema.String)
      const decode = Schema.decodeUnknownSync(codec)

      assert.match(schemaError(() => decode(Uint8Array.of(2, 0x20, 0xFF))).message, /utf-8/)
      assert.strictEqual(decode(encode(Schema.String, "after failure")), "after failure")
    })

    it("delivers completed values before reporting a later failure", () => {
      const good = encode(Schema.Number, 1)
      const bad = encode(Schema.Number, 2).slice(0, 2)
      const parser = SchemaBinary.parser(Schema.Number)
      assert.deepStrictEqual(parser.feedSync(concat(good, bad)), [1])
      assert.match(schemaError(() => parser.endSync()).message, /complete value/)
      assert.match(schemaError(() => parser.feedSync(new Uint8Array())).message, /parser is spent/)
    })

    it("stashes a malformed complete frame after returning earlier values", () => {
      const good = encode(Schema.Number, 1)
      const bad = encode(Schema.Number, 2).slice()
      bad[1] = 0x10
      const parser = SchemaBinary.parser(Schema.Number)

      assert.deepStrictEqual(parser.feedSync(concat(good, bad)), [1])
      assert.match(schemaError(() => parser.feedSync(new Uint8Array())).message, /version 2 envelope, flags 0/)
      assert.match(schemaError(() => parser.endSync()).message, /parser is spent/)
    })

    it("enforces maxFrameSize", () => {
      const bytes = encode(Schema.String, "too large")
      const parser = SchemaBinary.parser(Schema.String, { maxFrameSize: 2 })
      assert.match(schemaError(() => parser.feedSync(bytes)).message, /frame within maxFrameSize/)

      const exact = SchemaBinary.parser(Schema.String, { maxFrameSize: bytes[0] })
      assert.deepStrictEqual(exact.feedSync(bytes), ["too large"])
      exact.endSync()
    })

    it("fails a ten-byte unterminated length immediately", () => {
      const bytes = new Uint8Array(10).fill(0x80)
      const parser = SchemaBinary.parser(Schema.String, { reportInput: true })
      const error = schemaError(() => parser.feedSync(bytes))
      assert.match(error.message, /uvarint/)
      assert.isTrue(SchemaIssue.hasInput(error.issue))
    })

    it("rejects a terminated header above the safe-integer bound", () => {
      const bytes = Uint8Array.of(0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x10)
      const parser = SchemaBinary.parser(Schema.String)

      assert.match(schemaError(() => parser.feedSync(bytes)).message, /safe integer length/)
      assert.match(schemaError(() => parser.feedSync(new Uint8Array())).message, /parser is spent/)
    })

    it.effect("wraps feed and end in SchemaError effects", () =>
      Effect.gen(function*() {
        const parser = SchemaBinary.parser(Schema.Number)
        const values = yield* parser.feed(encode(Schema.Number, 1))
        assert.deepStrictEqual(values, [1])
        yield* parser.end
      }))

    it.effect("fails malformed feed and truncated end through the Effect surface", () =>
      Effect.gen(function*() {
        const malformed = SchemaBinary.parser(Schema.Boolean)
        const feedError = yield* malformed.feed(Uint8Array.of(2, 0x20, 2)).pipe(Effect.flip)
        assert.isTrue(Schema.isSchemaError(feedError))

        const truncated = SchemaBinary.parser(Schema.String)
        yield* truncated.feed(Uint8Array.of(2, 0x20))
        const endError = yield* truncated.end.pipe(Effect.flip)
        assert.isTrue(Schema.isSchemaError(endError))
      }))
  })

  describe("native declarations", () => {
    it("round-trips bigint, Date, bytes, Option, and Result", () => {
      assert.strictEqual(roundtrip(Schema.BigInt, -12345678901234567890n), -12345678901234567890n)
      assert.strictEqual(roundtrip(Schema.Date, new Date(-123456789)).getTime(), -123456789)
      assert.deepStrictEqual([...roundtrip(Schema.Uint8Array, Uint8Array.of(0, 1, 255))], [0, 1, 255])

      const option = roundtrip(Schema.Option(Schema.String), Option.some("value"))
      assert.isTrue(Option.isSome(option))
      if (Option.isSome(option)) assert.strictEqual(option.value, "value")

      const result = roundtrip(Schema.Result(Schema.Number, Schema.String), Result.fail("error"))
      assert.isTrue(Result.isFailure(result))
      if (Result.isFailure(result)) assert.strictEqual(result.failure, "error")
    })

    it("round-trips Duration and normalized BigDecimal", () => {
      const duration = roundtrip(Schema.Duration, Duration.millis(1.5))
      assert.strictEqual(Duration.toNanosUnsafe(duration), 1_500_000n)
      assert.strictEqual(roundtrip(Schema.Duration, Duration.infinity), Duration.infinity)
      assert.strictEqual(roundtrip(Schema.Duration, Duration.negativeInfinity), Duration.negativeInfinity)
      assert.strictEqual(Duration.toNanosUnsafe(roundtrip(Schema.Duration, Duration.nanos(-7n))), -7n)

      const decimal = roundtrip(Schema.BigDecimal, BigDecimal.make(100n, 2))
      assert.strictEqual(decimal.value, 1n)
      assert.strictEqual(decimal.scale, 0)
      assert.deepStrictEqual(roundtrip(Schema.BigDecimal, BigDecimal.make(-123n, -4)), BigDecimal.make(-123n, -4))
    })

    it("round-trips the empty and success branches of native sums", () => {
      assert.isTrue(Option.isNone(roundtrip(Schema.Option(Schema.String), Option.none())))

      const result = roundtrip(Schema.Result(Schema.Number, Schema.String), Result.succeed(42))
      assert.isTrue(Result.isSuccess(result))
      if (Result.isSuccess(result)) assert.strictEqual(result.success, 42)

      const exit = roundtrip(Schema.Exit(Schema.Number, Schema.String, Schema.Unknown), Exit.succeed(42))
      assert.isTrue(Exit.isSuccess(exit))
      if (Exit.isSuccess(exit)) assert.strictEqual(exit.value, 42)
    })

    it("skips future CauseReason tags inside Cause", () => {
      const schema = Schema.Cause(Schema.String, Schema.Unknown)
      const bytes = Uint8Array.of(7, 0x20, 2, 1, 99, 2, 0, 0x78)
      const decoded = Schema.decodeUnknownSync(SchemaBinary.toCodec(schema))(bytes)

      assert.strictEqual(decoded.reasons.length, 1)
      assert.strictEqual(decoded.reasons[0]._tag, "Fail")
      assert.strictEqual((decoded.reasons[0] as Cause.Fail<string>).error, "x")
      assert.match(
        schemaError(() =>
          Schema.decodeUnknownSync(SchemaBinary.toCodec(Schema.CauseReason(Schema.String, Schema.Unknown)))(
            Uint8Array.of(2, 0x20, 99)
          )
        ).message,
        /Missing key/
      )
    })

    it("round-trips UTC and zoned DateTime values", () => {
      const utc = DateTime.makeUnsafe(-123456789)
      assert.strictEqual(DateTime.toEpochMillis(roundtrip(Schema.DateTimeUtc, utc)), -123456789)

      for (
        const zoned of [
          DateTime.makeZonedUnsafe(123456789, { timeZone: 3_600_000 }),
          DateTime.makeZonedUnsafe(123456789, { timeZone: "Europe/London" })
        ]
      ) {
        const decoded = roundtrip(Schema.DateTimeZoned, zoned)
        assert.strictEqual(DateTime.toEpochMillis(decoded), DateTime.toEpochMillis(zoned))
        assert.strictEqual(DateTime.zoneToString(decoded.zone), DateTime.zoneToString(zoned.zone))
      }
    })

    it("validates DateTimeUtc epoch millisecond boundaries", () => {
      const codec = SchemaBinary.toCodec(Schema.DateTimeUtc)
      for (const millis of [-8_640_000_000_000_000n, 8_640_000_000_000_000n]) {
        const decoded = Schema.decodeUnknownSync(codec)(int64Frame(millis))
        assert.strictEqual(DateTime.toEpochMillis(decoded), Number(millis))
      }
      for (const millis of [-8_640_000_000_000_001n, 8_640_000_000_000_001n]) {
        assert.match(
          schemaError(() => Schema.decodeUnknownSync(codec)(int64Frame(millis))).message,
          /valid DateTime/
        )
      }
    })

    it("round-trips Exit, Cause, and CauseReason", () => {
      const causeSchema = Schema.Cause(Schema.String, Schema.Unknown)
      const cause = Cause.fromReasons([
        Cause.makeFailReason("boom"),
        Cause.makeDieReason({ defect: true }),
        Cause.makeInterruptReason(0),
        Cause.makeInterruptReason()
      ])
      const decoded = roundtrip(causeSchema, cause)
      assert.deepStrictEqual(decoded.reasons.map((reason) => reason._tag), ["Fail", "Die", "Interrupt", "Interrupt"])
      assert.strictEqual((decoded.reasons[2] as Cause.Interrupt).fiberId, 0)
      assert.strictEqual((decoded.reasons[3] as Cause.Interrupt).fiberId, undefined)

      const reason = roundtrip(
        Schema.CauseReason(Schema.String, Schema.Unknown),
        Cause.makeFailReason("failure")
      )
      assert.strictEqual(reason._tag, "Fail")

      const exit = roundtrip(Schema.Exit(Schema.Number, Schema.String, Schema.Unknown), Exit.failCause(cause))
      assert.isTrue(Exit.isFailure(exit))
    })

    // An `Exit` layout carries the `Cause` node its failure branch writes,
    // rather than rebuilding one per value. Both branches must still round-trip
    // in fingerprint mode, where the failure branch has no length prefix to
    // resynchronise on, and the shared node must not make the two schemas hash
    // alike.
    it("round-trips both Exit branches in fingerprint mode", () => {
      const ExitSchema = Schema.Exit(Schema.Number, Schema.String, Schema.Unknown)
      const cause = Cause.fromReasons([Cause.makeFailReason("boom"), Cause.makeDieReason({ defect: true })])

      assert.isTrue(Exit.isSuccess(roundtripFingerprint(ExitSchema, Exit.succeed(7))))

      const failure = roundtripFingerprint(ExitSchema, Exit.failCause(cause))
      assert.deepStrictEqual(
        Exit.isFailure(failure) ? failure.cause.reasons.map((reason) => reason._tag) : [],
        ["Fail", "Die"]
      )

      assert.notStrictEqual(
        fingerprintFrame(ExitSchema, Exit.failCause(cause)).fingerprint,
        fingerprintFrame(Schema.Cause(Schema.String, Schema.Unknown), cause).fingerprint
      )
    })
  })

  describe("generic declarations and recursion", () => {
    it("uses declaration codec links for collections, Redacted, Class, and TaggedClass", () => {
      const chunk = roundtrip(Schema.Chunk(Schema.Number), Chunk.make(1, 2, 3))
      assert.deepStrictEqual(Chunk.toReadonlyArray(chunk), [1, 2, 3])

      const map = roundtrip(Schema.HashMap(Schema.String, Schema.Number), HashMap.make(["a", 1], ["b", 2]))
      assert.strictEqual(HashMap.get(map, "a").pipe(Option.getOrUndefined), 1)
      assert.strictEqual(HashMap.get(map, "b").pipe(Option.getOrUndefined), 2)

      const set = roundtrip(Schema.HashSet(Schema.String), HashSet.make("a", "b"))
      assert.isTrue(HashSet.has(set, "a"))
      assert.isTrue(HashSet.has(set, "b"))

      const redacted = roundtrip(Schema.Redacted(Schema.String), Redacted.make("secret"))
      assert.strictEqual(Redacted.value(redacted), "secret")

      class Person extends Schema.Class<Person>("Person")({ name: Schema.String }) {}
      const person = roundtrip(Person, new Person({ name: "Ada" }))
      assert.instanceOf(person, Person)
      assert.strictEqual(person.name, "Ada")

      class Event extends Schema.TaggedClass<Event>()("Event", { value: Schema.Number }) {}
      const event = roundtrip(Event, new Event({ value: 1 }))
      assert.instanceOf(event, Event)
      assert.strictEqual(event._tag, "Event")
      assert.strictEqual(event.value, 1)
    })

    it("compiles and round-trips recursive suspended schemas", () => {
      interface Node {
        readonly value: number
        readonly children: ReadonlyArray<Node>
      }
      let Node: Schema.Codec<Node>
      Node = Schema.Struct({
        value: Schema.Number,
        children: Schema.Array(Schema.suspend(() => Node))
      })
      const value: Node = { value: 1, children: [{ value: 2, children: [] }] }
      assert.deepStrictEqual(roundtrip(Node, value), value)
    })

    it("fails cyclic JSON values with the acyclic value issue", () => {
      const value: Record<string, unknown> = {}
      value.self = value
      assert.match(schemaError(() => encode(Schema.Unknown, value)).message, /acyclic value/)
    })

    it("fails cyclic recursive struct values with the acyclic value issue", () => {
      interface Node {
        readonly value: number
        readonly next?: Node
      }
      let Node: Schema.Codec<Node>
      Node = Schema.Struct({
        value: Schema.Number,
        next: Schema.optionalKey(Schema.suspend(() => Node))
      })
      const value: { value: number; next?: Node } = { value: 1 }
      value.next = value
      assert.match(schemaError(() => encode(Node, value)).message, /acyclic value/)
    })

    it("fails array-mediated cycles with the acyclic value issue", () => {
      interface Node {
        readonly name: string
        readonly children: ReadonlyArray<Node>
      }
      let Node: Schema.Codec<Node>
      Node = Schema.Struct({
        name: Schema.String,
        children: Schema.Array(Schema.suspend(() => Node))
      })
      const node: { name: string; children: Array<Node> } = { name: "root", children: [] }
      node.children.push(node)
      assert.match(schemaError(() => encode(Node, node)).message, /acyclic value/)

      const unknown: Array<unknown> = []
      unknown.push(unknown)
      assert.match(schemaError(() => encode(Schema.Unknown, unknown)).message, /acyclic value/)
    })

    it("accepts shared recursive values that are DAGs rather than cycles", () => {
      interface Node {
        readonly value: number
        readonly children: ReadonlyArray<Node>
      }
      let Node: Schema.Codec<Node>
      Node = Schema.Struct({
        value: Schema.Number,
        children: Schema.Array(Schema.suspend(() => Node))
      })
      const leaf: Node = { value: 2, children: [] }
      const value: Node = { value: 1, children: [leaf, leaf] }

      assert.deepStrictEqual(roundtrip(Node, value), {
        value: 1,
        children: [{ value: 2, children: [] }, { value: 2, children: [] }]
      })
    })

    it("rejects non-serializable JSON values without calling them cycles", () => {
      for (const value of [undefined, 1n, Symbol.for("json"), () => 1]) {
        const error = schemaError(() => encode(Schema.Unknown, value))
        assert.match(error.message, /JSON-serializable value/)
        assert.isFalse(error.message.includes("acyclic value"))
      }
    })

    it("runs user encoding links before the binary layer", () => {
      const bytes = encode(Schema.NumberFromString, 123)
      assert.strictEqual(bytes.length, 5)
      assert.strictEqual(roundtrip(Schema.NumberFromString, 123), 123)

      const Before = Schema.Struct({ value: Schema.NumberFromString.pipe(SchemaBinary.fieldId(7)) })
      const After = Schema.Struct({ renamed: Schema.NumberFromString.pipe(SchemaBinary.fieldId(7)) })
      assert.deepStrictEqual(
        Schema.decodeUnknownSync(SchemaBinary.toCodec(After))(encode(Before, { value: 123 })),
        { renamed: 123 }
      )
    })

    it.effect("round-trips a yielding transformEffect through SchemaParser Effect APIs", () =>
      Effect.gen(function*() {
        const schema = Schema.String.pipe(
          Schema.decodeTo(
            Schema.Number,
            SchemaTransformation.transformEffect({
              decode: (s) => Effect.yieldNow.pipe(Effect.as(Number(s))),
              encode: (n) => Effect.yieldNow.pipe(Effect.as(String(n)))
            })
          )
        )
        const codec = SchemaBinary.toCodec(schema)
        const bytes = yield* SchemaParser.encodeUnknownEffect(codec)(123)
        assert.strictEqual(yield* SchemaParser.decodeUnknownEffect(codec)(bytes), 123)
      }))

    it("keeps a sound runtime type guard on the derived codec", () => {
      const codec = SchemaBinary.toCodec(Schema.Struct({ name: Schema.String, age: Schema.Number }))
      assert.isTrue(Schema.is(codec)({ name: "Ada", age: 42 }))
      assert.isFalse(Schema.is(codec)({ nope: 1 }))
    })

    it("keeps a sound runtime type guard on recursive derived codecs", () => {
      interface Node {
        readonly value: number
        readonly children: ReadonlyArray<Node>
      }
      let Node: Schema.Codec<Node>
      Node = Schema.Struct({
        value: Schema.Number,
        children: Schema.Array(Schema.suspend(() => Node))
      })
      const codec = SchemaBinary.toCodec(Node)

      assert.isTrue(Schema.is(codec)({ value: 1, children: [] }))
      assert.isFalse(Schema.is(codec)({ nope: 1 }))
      assert.isFalse(Schema.is(Schema.Struct({ inner: codec }))({ inner: { nope: 1 } }))
    })
  })

  describe("parse options", () => {
    it("honors checks and disableChecks", () => {
      const NonNegative = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))
      const bytes = encode(Schema.Number, -1.5)
      assert.match(
        schemaError(() => Schema.decodeUnknownSync(SchemaBinary.toCodec(NonNegative))(bytes)).message,
        /greater than or equal to 0/
      )

      const parser = SchemaBinary.parser(NonNegative, { disableChecks: true })
      assert.deepStrictEqual(parser.feedSync(bytes), [-1.5])
      parser.endSync()
    })

    it("honors disableChecks for recursive schemas", () => {
      interface Node {
        readonly value: number
        readonly children: ReadonlyArray<Node>
      }
      let Writer: Schema.Codec<Node>
      Writer = Schema.Struct({
        value: Schema.Number,
        children: Schema.Array(Schema.suspend(() => Writer))
      })
      let Reader: Schema.Codec<Node>
      Reader = Schema.Struct({
        value: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)),
        children: Schema.Array(Schema.suspend(() => Reader))
      })
      const value: Node = { value: -1.5, children: [] }
      const parser = SchemaBinary.parser(Reader, { disableChecks: true })

      assert.deepStrictEqual(parser.feedSync(encode(Writer, value)), [value])
      parser.endSync()
      assert.deepStrictEqual(
        Schema.decodeUnknownSync(SchemaBinary.toCodec(Reader), { disableChecks: true })(encode(Writer, value)),
        value
      )
    })

    it("keeps one-shot index-signature caching within each options call", () => {
      const Key = Schema.String.check(Schema.makeFilter((key: string) => key.startsWith("allowed-")))
      const Writer = Schema.Record(Schema.String, Schema.Number)
      const codec = SchemaBinary.toCodec(Schema.Record(Key, Schema.Number))
      const bytes = encode(Writer, { denied: 1 })

      assert.deepStrictEqual(Schema.decodeUnknownSync(codec)(bytes), {})
      assert.deepStrictEqual(Schema.decodeUnknownSync(codec, { disableChecks: true })(bytes), { denied: 1 })
    })

    it("honors errors all for missing fields", () => {
      const bytes = encode(Schema.Struct({}), {})
      const Reader = Schema.Struct({ a: Schema.String, b: Schema.Number })
      const error = schemaError(() => Schema.decodeUnknownSync(SchemaBinary.toCodec(Reader), { errors: "all" })(bytes))
      assert.strictEqual(error.message.match(/Missing key/g)?.length, 2)
    })

    it("ignores excess-property options at the binary boundary", () => {
      const Writer = Schema.Struct({ extra: Schema.String, known: Schema.Number })
      const Reader = Schema.Struct({ known: Schema.Number })
      const bytes = encode(Writer, { extra: "drop", known: 1 })

      assert.deepStrictEqual(
        Schema.decodeUnknownSync(SchemaBinary.toCodec(Reader), { onExcessProperty: "error" })(bytes),
        { known: 1 }
      )
      assert.deepStrictEqual(
        SchemaBinary.parser(Reader, { onExcessProperty: "error" }).feedSync(bytes),
        [{ known: 1 }]
      )
    })
  })

  describe("layout and data errors", () => {
    it("throws Error while compiling invalid layouts", () => {
      const declaration = Schema.declare((_): _ is { readonly value: string } => true)
      assert.throws(
        () => SchemaBinary.toCodec(declaration),
        /Binary layout: declaration <anonymous> has no toCodecJson or toCodec/
      )
      assert.throws(
        () =>
          SchemaBinary.toCodec(Schema.Union([
            Schema.Struct({ a: Schema.String }),
            Schema.Struct({ b: Schema.Number })
          ])),
        /union members are not uniquely identifiable/
      )
      assert.throws(
        () =>
          SchemaBinary.toCodec(Schema.Struct({
            a: Schema.String.pipe(SchemaBinary.fieldId(1)),
            b: Schema.String.pipe(SchemaBinary.fieldId(1))
          })),
        /Binary layout field id collision: 1/
      )
      assert.throws(
        () =>
          SchemaBinary.toCodec(Schema.Struct({
            hashed: Schema.String,
            explicit: Schema.String.pipe(SchemaBinary.fieldId(1836165160))
          })),
        /Binary layout field id collision: 1836165160 \(hashed, explicit\)/
      )
      assert.throws(
        () =>
          SchemaBinary.toCodec(Schema.Union([
            Schema.Literal("a"),
            Schema.UniqueSymbol(Symbol.for("SchemaBinary/symbol"))
          ])),
        /union members are not uniquely identifiable/
      )
      assert.throws(
        () => SchemaBinary.toCodec(Schema.Struct({ [Symbol.for("SchemaBinary/key")]: Schema.String })),
        /symbol property names are illegal/
      )
      assert.throws(
        () =>
          SchemaBinary.toCodec(Schema.Union([
            Schema.Struct({ _tag: Schema.Literal("1a0a49t3mq") }),
            Schema.Struct({ _tag: Schema.Literal("m7r4q02dm7") })
          ])),
        /Binary layout sentinel collision: 3370793117/
      )
      assert.throws(
        () =>
          SchemaBinary.toCodec(Schema.Union([
            Schema.Struct({ _tag: Schema.UniqueSymbol(Symbol("local")) })
          ])),
        /unregistered unique symbol/
      )
      assert.throws(
        () => SchemaBinary.toCodec(Schema.Union([Schema.Date, Schema.DateTimeUtc])),
        /union members are not uniquely identifiable/
      )
    })

    it("uses SchemaIssue for binary failures", () => {
      const codec = SchemaBinary.toCodec(Schema.Boolean)
      const error = schemaError(() => Schema.decodeUnknownSync(codec)(Uint8Array.of(2, 0x20, 2)))
      assert.isTrue(SchemaIssue.isIssue(error.issue))
      assert.match(error.message, /bool/)
    })

    it.effect("preserves the SchemaParser Issue and Schema SchemaError surfaces", () =>
      Effect.gen(function*() {
        const codec = SchemaBinary.toCodec(Schema.Boolean)
        const bytes = Uint8Array.of(2, 0x20, 2)
        const issue = yield* SchemaParser.decodeUnknownEffect(codec)(bytes).pipe(Effect.flip)
        assert.isTrue(SchemaIssue.isIssue(issue))
        const error = yield* Schema.decodeUnknownEffect(codec)(bytes).pipe(Effect.flip)
        assert.isTrue(Schema.isSchemaError(error))
      }))

    it("reports a missing fixed tuple slot as MissingKey", () => {
      const emptyTuple = encode(Schema.Tuple([]), [])
      const error = schemaError(() =>
        Schema.decodeUnknownSync(SchemaBinary.toCodec(Schema.Tuple([Schema.String])))(emptyTuple)
      )
      assert.match(error.message, /Missing key/)
    })

    it("rejects malformed lengths and text", () => {
      const string = SchemaBinary.toCodec(Schema.String)
      assert.match(
        schemaError(() => Schema.decodeUnknownSync(string)(Uint8Array.of(0))).message,
        /nonzero frame length/
      )
      assert.match(
        schemaError(() =>
          Schema.decodeUnknownSync(string)(Uint8Array.of(0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x10))
        ).message,
        /safe integer length/
      )
      assert.match(
        schemaError(() => Schema.decodeUnknownSync(string)(Uint8Array.of(2, 0x20, 0xFF))).message,
        /utf-8/
      )
      assert.match(
        schemaError(() =>
          Schema.decodeUnknownSync(SchemaBinary.toCodec(Schema.Date))(Uint8Array.of(8, 0x20, 0, 0, 0, 0, 0, 0, 0))
        ).message,
        /int64/
      )
      assert.match(
        schemaError(() => Schema.decodeUnknownSync(SchemaBinary.toCodec(Schema.Null))(Uint8Array.of(2, 0x20, 0)))
          .message,
        /empty/
      )
      assert.match(
        schemaError(() => Schema.decodeUnknownSync(SchemaBinary.toCodec(Schema.Unknown))(Uint8Array.of(2, 0x20, 0x7B)))
          .message,
        /json/
      )
    })

    it("rejects invalid native tags and payload shapes", () => {
      const rejects = <A, I>(schema: Schema.Codec<A, I>, bytes: Uint8Array, expected: RegExp) => {
        assert.match(schemaError(() => Schema.decodeUnknownSync(SchemaBinary.toCodec(schema))(bytes)).message, expected)
      }
      rejects(Schema.Duration, Uint8Array.of(2, 0x20, 3), /duration/)
      rejects(Schema.Option(Schema.String), Uint8Array.of(2, 0x20, 2), /bool/)
      rejects(Schema.Option(Schema.String), Uint8Array.of(3, 0x20, 0, 0), /empty/)
      rejects(Schema.Result(Schema.String, Schema.String), Uint8Array.of(2, 0x20, 2), /bool/)
      rejects(Schema.Exit(Schema.String, Schema.String, Schema.Unknown), Uint8Array.of(2, 0x20, 2), /bool/)
      rejects(Schema.DateTimeZoned, Uint8Array.of(10, 0x20, 0, 0, 0, 0, 0, 0, 0, 0, 2), /time zone/)
      rejects(Schema.DateTimeZoned, Uint8Array.of(10, 0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0), /time zone/)
    })

    it("rejects attacker-sized zero-width array counts", () => {
      const codec = SchemaBinary.toCodec(Schema.Array(Schema.Null))
      const bytes = Uint8Array.of(6, 0x20, 0x80, 0x80, 0x80, 0x80, 0x10)
      assert.match(
        schemaError(() => Schema.decodeUnknownSync(codec)(bytes)).message,
        /array count within allocation limit/
      )
    })

    it("round-trips zero-width arrays across the allocation slack boundary", () => {
      const verify = <A, I>(schema: Schema.Codec<A, I>, value: A) => {
        const codec = SchemaBinary.toCodec(Schema.Array(schema))
        for (const count of [1_048_576, 1_048_577]) {
          const bytes = Schema.encodeUnknownSync(codec)(new Array<A>(count).fill(value))
          assert.strictEqual(bytes.length, 5)
          const decoded = Schema.decodeUnknownSync(codec)(bytes)
          assert.strictEqual(decoded.length, count)
          assert.strictEqual(decoded[0], value)
          assert.strictEqual(decoded[count - 1], value)
        }
      }

      verify(Schema.Null, null)
      verify(Schema.Undefined, undefined)
    })

    it("rejects duplicate struct field ids and extra keys", () => {
      const struct = Schema.Struct({ value: Schema.String })
      const encodedStruct = encode(struct, { value: "x" })
      const field = encodedStruct.slice(2)
      const duplicateField = concat(Uint8Array.of(1 + field.length * 2, 0x20), field, field)
      assert.match(
        schemaError(() => Schema.decodeUnknownSync(SchemaBinary.toCodec(struct))(duplicateField)).message,
        /unique field ids/
      )

      const record = Schema.Record(Schema.String, Schema.Number)
      const encodedRecord = encode(record, { a: 1 })
      const pair = encodedRecord.slice(4)
      const duplicateKey = concat(Uint8Array.of(3 + pair.length * 2, 0x20, 0, pair.length * 2), pair, pair)
      assert.match(
        schemaError(() => Schema.decodeUnknownSync(SchemaBinary.toCodec(record))(duplicateKey)).message,
        /unique extra keys/
      )
    })

    it("rejects declared field names in the extra-key map", () => {
      const Declared = Schema.Struct({
        id: Schema.String,
        note: Schema.optionalKey(Schema.String)
      })
      const Reader = Schema.StructWithRest(
        Declared,
        [Schema.Record(Schema.String, Schema.Number)]
      )
      const extras = Schema.Record(Schema.String, Schema.Number)
      const body = (frame: Uint8Array): Uint8Array => {
        let offset = 0
        while ((frame[offset] & 0x80) !== 0) offset++
        assert.strictEqual(frame[++offset], 0x20)
        return frame.subarray(offset + 1)
      }
      const collide = (key: "id" | "note") => {
        const bytes = concat(body(encode(Declared, { id: "ok" })), body(encode(extras, { [key]: 7 })))
        return concat(Uint8Array.from([...uvarint(bytes.length + 1), 0x20]), bytes)
      }

      for (const key of ["id", "note"] as const) {
        assert.match(
          schemaError(() => Schema.decodeUnknownSync(SchemaBinary.toCodec(Reader))(collide(key))).message,
          /declared field/
        )
      }
    })

    it("rejects a duplicate field id after an unknown union decodes as absent", () => {
      const A = Schema.Struct({ _tag: Schema.Literal("A") })
      const B = Schema.Struct({ _tag: Schema.Literal("B"), value: Schema.String })
      const Writer = Schema.Struct({ event: Schema.optionalKey(Schema.Union([A, B])) })
      const Reader = Schema.Struct({ event: Schema.optionalKey(Schema.Union([A])) })
      const encoded = encode(Writer, { event: { _tag: "B", value: "new" } })
      const field = encoded.slice(2)
      const duplicateField = concat(Uint8Array.of(1 + field.length * 2, 0x20), field, field)

      assert.match(
        schemaError(() => Schema.decodeUnknownSync(SchemaBinary.toCodec(Reader))(duplicateField)).message,
        /unique field ids/
      )
    })

    it("does not satisfy wide-field presence from the extra-key map", () => {
      const fields: Record<string, typeof Schema.String> = {}
      const extras: Record<string, string> = {}
      for (let i = 0; i < 34; i++) {
        fields[`field${i}`] = Schema.String
        extras[`extra${i}`] = `value${i}`
      }
      const record = Schema.Record(Schema.String, Schema.String)
      const struct = Schema.StructWithRest(Schema.Struct(fields), [record])
      const error = schemaError(() =>
        Schema.decodeUnknownSync(SchemaBinary.toCodec(struct), { errors: "all" })(encode(record, extras))
      )

      assert.strictEqual(error.message.match(/Missing key/g)?.length, 34)
    })

    it("validates literals instead of leaning on the schema pass", () => {
      const Tagged = Schema.Struct({ kind: Schema.Literal("ok") })
      const Loose = Schema.Struct({ kind: Schema.String })
      assert.match(
        schemaError(() => Schema.decodeUnknownSync(SchemaBinary.toCodec(Tagged))(encode(Loose, { kind: "nope" })))
          .message,
        /"ok"/
      )
      assert.match(schemaError(() => encode(Tagged, { kind: "nope" } as never)).message, /"ok"/)

      const Level = Schema.Struct({ kind: Schema.Literals(["info", "warning"]) })
      assert.deepStrictEqual(
        Schema.decodeUnknownSync(SchemaBinary.toCodec(Level))(encode(Loose, { kind: "warning" })),
        { kind: "warning" }
      )
      assert.match(
        schemaError(() => Schema.decodeUnknownSync(SchemaBinary.toCodec(Level))(encode(Loose, { kind: "debug" })))
          .message,
        /"info" \| "warning"/
      )
    })

    it("rejects a Date outside the representable range", () => {
      const codec = SchemaBinary.toCodec(Schema.Date)
      const bytes = Schema.encodeUnknownSync(codec)(new Date(0))
      bytes.set(Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0x7F), bytes.length - 8)
      assert.match(schemaError(() => Schema.decodeUnknownSync(codec)(bytes)).message, /a valid Date/)
    })

    it("fails Never values and unregistered symbols through SchemaError", () => {
      assert.isTrue(Schema.isSchemaError(schemaError(() => encode(Schema.Never, undefined))))
      assert.isTrue(
        Schema.isSchemaError(
          schemaError(() => Schema.decodeUnknownSync(SchemaBinary.toCodec(Schema.Never))(Uint8Array.of(1, 0x20)))
        )
      )
      assert.match(schemaError(() => encode(Schema.Symbol, Symbol("local"))).message, /registered symbol/)
    })
  })

  describe("fingerprint mode", () => {
    const Person = Schema.Struct({
      name: Schema.String,
      age: Schema.Number.check(Schema.isInt()),
      active: Schema.Boolean,
      nickname: Schema.optional(Schema.String)
    })
    const person = { name: "Ada", age: 36, active: true }

    it("writes a fingerprint envelope, a presence bitmap, and no field ids", () => {
      // length | envelope 0x21 | fingerprint | bitmap | age varint | name | active
      assert.deepStrictEqual([...encodeFingerprint(Person, person)], [
        16,
        0x21,
        184,
        213,
        85,
        38,
        67,
        231,
        116,
        53,
        0,
        72,
        3,
        65,
        100,
        97,
        1
      ])
      // the same frame with the optional field present: its bit is set and it
      // moves ahead of `age`, which is where its wire id sorts it
      assert.deepStrictEqual([...encodeFingerprint(Person, { ...person, nickname: "A" })], [
        19,
        0x21,
        184,
        213,
        85,
        38,
        67,
        231,
        116,
        53,
        1,
        2,
        1,
        65,
        72,
        3,
        65,
        100,
        97,
        1
      ])
    })

    it("leaves the default mode untouched", () => {
      const expected = [...encode(Person, person)]
      assert.deepStrictEqual(expected[1], 0x20)
      assert.deepStrictEqual([...Schema.encodeUnknownSync(SchemaBinary.toCodec(Person, {}))(person)], expected)
      assert.deepStrictEqual(
        [...Schema.encodeUnknownSync(SchemaBinary.toCodec(Person, { fingerprint: false }))(person)],
        expected
      )
    })

    it("addresses union members by canonical position", () => {
      const Click = Schema.Struct({ _tag: Schema.Literal("click"), x: Schema.Number.check(Schema.isInt()) })
      const Key = Schema.Struct({ _tag: Schema.Literal("key"), code: Schema.String })
      const Event = Schema.Union([Click, Key])
      assert.deepStrictEqual([...encodeFingerprint(Event, { _tag: "click", x: 3 })], [
        11,
        0x21,
        237,
        163,
        78,
        151,
        96,
        43,
        76,
        0,
        0,
        6
      ])
      const key = { _tag: "key", code: "Esc" } as const
      const keyFrame = [...encodeFingerprint(Event, key)]
      assert.deepStrictEqual(keyFrame, [14, 0x21, 237, 163, 78, 151, 96, 43, 76, 0, 1, 3, 69, 115, 99])
      // declaration order never reaches the wire
      assert.deepStrictEqual([...encodeFingerprint(Schema.Union([Key, Click]), key)], keyFrame)
      assert.deepStrictEqual(roundtripFingerprint(Event, key), key)
    })

    it("counts the extra-key map instead of reserving field zero", () => {
      const schema = Schema.Record(Schema.String, Schema.Number)
      assert.deepStrictEqual([...encodeFingerprint(schema, { b: 2, a: 1 })], [
        16,
        0x21,
        189,
        249,
        115,
        23,
        65,
        225,
        229,
        6,
        2,
        9,
        97,
        2,
        9,
        98,
        4
      ])
      assert.deepStrictEqual(roundtripFingerprint(schema, { z: 1, a: 2 }), { z: 1, a: 2 })
      assert.deepStrictEqual(roundtripFingerprint(schema, {}), {})
    })

    it("keeps the default tuple and array layout", () => {
      assert.deepStrictEqual([...encodeFingerprint(Schema.Tuple([Schema.Boolean, Schema.String]), [true, "x"])], [
        12,
        0x21,
        3,
        44,
        71,
        25,
        31,
        66,
        141,
        82,
        1,
        1,
        120
      ])
      assert.deepStrictEqual([...encodeFingerprint(Schema.Array(Schema.Number.check(Schema.isInt())), [1, -2, 3])], [
        13,
        0x21,
        206,
        94,
        13,
        113,
        158,
        175,
        76,
        32,
        3,
        2,
        5,
        6
      ])
    })

    it("inlines fixed-size and zero-width leaves", () => {
      const schema = Schema.Struct({
        nothing: Schema.Null,
        flag: Schema.Boolean,
        missing: Schema.Undefined,
        when: Schema.Date,
        count: Schema.Number.check(Schema.isInt()),
        label: Schema.String
      })
      const value = { nothing: null, flag: true, missing: undefined, when: new Date(1000), count: -7, label: "hi" }
      // 1 envelope + 8 fingerprint + 1 varint + 8 int64 + 3 string + 1 bool
      assert.strictEqual(encodeFingerprint(schema, value).length, 23)
      assert.deepStrictEqual(roundtripFingerprint(schema, value), value)
    })

    it("spans a presence bitmap across several bytes", () => {
      const schema = Schema.Struct({
        a: Schema.optional(Schema.Number),
        b: Schema.optional(Schema.Number),
        c: Schema.optional(Schema.Number),
        d: Schema.optional(Schema.Number),
        e: Schema.optional(Schema.Number),
        f: Schema.optional(Schema.Number),
        g: Schema.optional(Schema.Number),
        h: Schema.optional(Schema.Number),
        i: Schema.optional(Schema.Number),
        j: Schema.optional(Schema.Number)
      })
      assert.deepStrictEqual(roundtripFingerprint(schema, {}), {})
      assert.deepStrictEqual(roundtripFingerprint(schema, { a: 1, j: 2 }), { a: 1, j: 2 })
      const full = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10 }
      assert.deepStrictEqual(roundtripFingerprint(schema, full), full)
    })

    it("round-trips native declarations, recursion, and mixed unions", () => {
      const natives = Schema.Struct({
        option: Schema.Option(Schema.String),
        result: Schema.Result(Schema.Number, Schema.String),
        big: Schema.BigInt,
        bytes: Schema.Uint8Array,
        duration: Schema.Duration,
        decimal: Schema.BigDecimal
      })
      const nativeValue = {
        option: Option.some("x"),
        result: Result.fail("boom"),
        big: 2n ** 70n,
        bytes: new Uint8Array([1, 2, 3]),
        duration: Duration.nanos(1_500_000_000n),
        decimal: BigDecimal.make(123n, 2)
      }
      const natived = roundtripFingerprint(natives, nativeValue)
      assert.deepStrictEqual(natived.option, nativeValue.option)
      assert.deepStrictEqual(natived.result, nativeValue.result)
      assert.strictEqual(natived.big, nativeValue.big)
      assert.deepStrictEqual([...natived.bytes], [1, 2, 3])
      assert.strictEqual(Duration.toNanosUnsafe(natived.duration), 1_500_000_000n)
      assert.strictEqual(natived.decimal.value, 123n)
      assert.strictEqual(natived.decimal.scale, 2)

      interface Tree {
        readonly value: number
        readonly children: ReadonlyArray<Tree>
      }
      const Tree: Schema.Codec<Tree> = Schema.Struct({
        value: Schema.Number,
        children: Schema.Array(Schema.suspend((): Schema.Codec<Tree> => Tree))
      })
      const tree = { value: 1, children: [{ value: 2, children: [] }, { value: 3, children: [] }] }
      assert.deepStrictEqual(roundtripFingerprint(Tree, tree), tree)

      const mixed = Schema.Union([Schema.String, Schema.Number, Schema.Struct({ n: Schema.Boolean })])
      assert.deepStrictEqual(roundtripFingerprint(mixed, "x"), "x")
      assert.deepStrictEqual(roundtripFingerprint(mixed, 1.5), 1.5)
      assert.deepStrictEqual(roundtripFingerprint(mixed, { n: true }), { n: true })
    })
  })

  describe("layout fingerprint", () => {
    interface Tree {
      readonly value: number
      readonly children: ReadonlyArray<Tree>
    }
    const makeTree = (): Schema.Codec<Tree> => {
      const self: Schema.Codec<Tree> = Schema.Struct({
        value: Schema.Number,
        children: Schema.Array(Schema.suspend((): Schema.Codec<Tree> => self))
      })
      return self
    }

    const base = Schema.Struct({ name: Schema.String, age: Schema.Number })
    const value = { name: "a", age: 1 }
    const baseline = fingerprintOf(base, value)

    it("ignores schema changes that do not reach the wire", () => {
      assert.strictEqual(
        fingerprintOf(
          Schema.Struct({
            name: Schema.String.check(Schema.isMinLength(1)).annotate({ description: "the name" }),
            age: Schema.Number
          }),
          value
        ),
        baseline
      )
      // property declaration order: encode sorts by wire id
      assert.strictEqual(fingerprintOf(Schema.Struct({ age: Schema.Number, name: Schema.String }), value), baseline)
      // a decoded-side transformation leaves the encoded layout alone
      assert.strictEqual(
        fingerprintOf(
          Schema.Struct({ name: Schema.String, age: Schema.Number.pipe(Schema.decodeTo(Schema.Number)) }),
          value
        ),
        baseline
      )
    })

    it("does not depend on the order a literal union declares its members", () => {
      assert.strictEqual(
        fingerprintOf(Schema.Literals(["a", "b", "c"]), "a"),
        fingerprintOf(Schema.Literals(["c", "a", "b"]), "a")
      )
      assert.notStrictEqual(
        fingerprintOf(Schema.Literals(["a", "b"]), "a"),
        fingerprintOf(Schema.Literals(["a", "c"]), "a")
      )
      assert.notStrictEqual(fingerprintOf(Schema.Literal("a"), "a"), fingerprintOf(Schema.String, "a"))
    })

    it("does not depend on whether an acyclic sub-schema is shared or repeated", () => {
      const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number })
      const pair = { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } }
      const shared = fingerprintOf(Schema.Struct({ a: Point, b: Point }), pair)
      const repeated = fingerprintOf(
        Schema.Struct({
          a: Schema.Struct({ x: Schema.Number, y: Schema.Number }),
          b: Schema.Struct({ x: Schema.Number, y: Schema.Number })
        }),
        pair
      )
      assert.strictEqual(shared, repeated)

      const leaf = { value: 1, children: [] }
      assert.strictEqual(fingerprintOf(makeTree(), leaf), fingerprintOf(makeTree(), leaf))
      // one recursive node reached from two fields, versus two of them. Both
      // sides have the same cycle structure, which is the only recursive case
      // the hash canonicalises; see the factoring test below for the limit.
      const both = { left: leaf, right: leaf }
      const one = makeTree()
      assert.strictEqual(
        fingerprintOf(Schema.Struct({ left: one, right: one }), both),
        fingerprintOf(Schema.Struct({ left: makeTree(), right: makeTree() }), both)
      )
    })

    it("hashes the layout graph, so re-factoring a recursive schema moves it", () => {
      // Three finite graphs denoting the same infinite wire shape: the cycle
      // itself, the cycle behind one non-recursive alias, and a two-node
      // mutual recursion of the same shape.
      const direct = makeTree()
      const aliased = Schema.Struct({
        value: Schema.Number,
        children: Schema.Array(makeTree())
      }) as unknown as Schema.Codec<Tree>
      const mutualA: Schema.Codec<Tree> = Schema.Struct({
        value: Schema.Number,
        children: Schema.Array(Schema.suspend((): Schema.Codec<Tree> => mutualB))
      })
      const mutualB: Schema.Codec<Tree> = Schema.Struct({
        value: Schema.Number,
        children: Schema.Array(Schema.suspend((): Schema.Codec<Tree> => mutualA))
      })

      const tree = { value: 1, children: [{ value: 2, children: [] }] }
      const frames = [direct, aliased, mutualA].map((schema) => fingerprintFrame(schema, tree))

      // identical bytes on the wire
      assert.strictEqual(new Set(frames.map((frame) => frame.payload)).size, 1)
      // and identical in the tolerant default mode, in both directions
      const directDefault = SchemaBinary.toCodec(direct)
      const aliasedDefault = SchemaBinary.toCodec(aliased)
      assert.deepStrictEqual(
        Schema.decodeUnknownSync(aliasedDefault)(Schema.encodeUnknownSync(directDefault)(tree)),
        tree
      )
      assert.deepStrictEqual(
        Schema.decodeUnknownSync(directDefault)(Schema.encodeUnknownSync(aliasedDefault)(tree)),
        tree
      )

      // but each factoring hashes differently, and they reject each other
      assert.strictEqual(new Set(frames.map((frame) => frame.fingerprint)).size, 3)
      assert.include(
        schemaError(() =>
          Schema.decodeUnknownSync(SchemaBinary.toCodec(aliased, { fingerprint: true }))(
            encodeFingerprint(direct, tree)
          )
        ).message,
        "Expected matching layout fingerprint"
      )
    })

    it("changes whenever the wire layout changes", () => {
      const changed = [
        fingerprintOf(Schema.Struct({ label: Schema.String, age: Schema.Number }), { label: "a", age: 1 }),
        fingerprintOf(
          Schema.Struct({ name: Schema.String, age: Schema.Number, extra: Schema.Boolean }),
          { name: "a", age: 1, extra: true }
        ),
        fingerprintOf(Schema.Struct({ name: Schema.String, age: Schema.optional(Schema.Number) }), value),
        fingerprintOf(Schema.Struct({ name: Schema.String, age: Schema.Number.check(Schema.isInt()) }), value),
        fingerprintOf(
          Schema.Struct({ name: Schema.String.pipe(SchemaBinary.fieldId(1)), age: Schema.Number }),
          value
        ),
        fingerprintOf(Schema.Struct({ name: Schema.String, age: Schema.String }), { name: "a", age: "1" })
      ]
      assert.strictEqual(new Set([baseline, ...changed]).size, changed.length + 1)

      assert.notStrictEqual(
        fingerprintOf(Schema.Tuple([Schema.Number, Schema.Number]), [1, 2]),
        fingerprintOf(Schema.Tuple([Schema.Number, Schema.Number, Schema.Number]), [1, 2, 3])
      )
      assert.notStrictEqual(
        fingerprintOf(Schema.Array(Schema.Number), [1]),
        fingerprintOf(Schema.Tuple([Schema.Number]), [1])
      )
      assert.notStrictEqual(
        fingerprintOf(Schema.Date, new Date(0)),
        fingerprintOf(Schema.DateTimeUtc, DateTime.makeUnsafe(0))
      )

      const A = Schema.Struct({ _tag: Schema.Literal("a"), n: Schema.Number })
      const B = Schema.Struct({ _tag: Schema.Literal("b"), s: Schema.String })
      const C = Schema.Struct({ _tag: Schema.Literal("c"), s: Schema.String })
      const a = { _tag: "a", n: 1 } as const
      assert.strictEqual(fingerprintOf(Schema.Union([A, B]), a), fingerprintOf(Schema.Union([B, A]), a))
      assert.notStrictEqual(fingerprintOf(Schema.Union([A, B]), a), fingerprintOf(Schema.Union([A, B, C]), a))
    })
  })

  describe("fingerprint mode failures", () => {
    const Person = Schema.Struct({ name: Schema.String, age: Schema.Number })
    const person = { name: "Ada", age: 36 }

    it("fails closed when the layout fingerprint differs", () => {
      const frame = encodeFingerprint(Person, person)
      const other = SchemaBinary.toCodec(Schema.Struct({ label: Schema.String, age: Schema.Number }), {
        fingerprint: true
      })
      assert.include(
        schemaError(() => Schema.decodeUnknownSync(other)(frame)).message,
        "Expected matching layout fingerprint"
      )
    })

    it("rejects the other mode's frames in both directions", () => {
      const fingerprintFrame = encodeFingerprint(Person, person)
      const defaultFrame = encode(Person, person)
      assert.include(
        schemaError(() => Schema.decodeUnknownSync(SchemaBinary.toCodec(Person))(fingerprintFrame)).message,
        "Expected version 2 envelope, flags 0"
      )
      assert.include(
        schemaError(() => Schema.decodeUnknownSync(SchemaBinary.toCodec(Person, { fingerprint: true }))(defaultFrame))
          .message,
        "Expected version 2 envelope, flags 1"
      )
    })

    it("rejects truncated and oversized frames", () => {
      const codec = SchemaBinary.toCodec(Person, { fingerprint: true })
      const frame = encodeFingerprint(Person, person)
      // the fingerprint itself does not fit
      const shortFrame = concat(new Uint8Array([5, 0x21]), frame.subarray(2, 6))
      assert.include(
        schemaError(() => Schema.decodeUnknownSync(codec)(shortFrame)).message,
        "Expected complete value"
      )
      assert.include(
        schemaError(() => Schema.decodeUnknownSync(codec)(frame.subarray(0, frame.length - 1))).message,
        "Expected complete value"
      )
      assert.include(
        schemaError(() => Schema.decodeUnknownSync(codec)(concat(frame, new Uint8Array([0])))).message,
        "Expected no leftover bytes"
      )
      const withLeftover = new Uint8Array(frame)
      withLeftover[0] = frame[0] + 1
      assert.include(
        schemaError(() => Schema.decodeUnknownSync(codec)(concat(withLeftover, new Uint8Array([0])))).message,
        "Expected no leftover bytes"
      )
    })

    it("rejects a union position outside the member table", () => {
      const Event = Schema.Union([
        Schema.Struct({ _tag: Schema.Literal("a"), n: Schema.Number }),
        Schema.Struct({ _tag: Schema.Literal("b"), s: Schema.String })
      ])
      const codec = SchemaBinary.toCodec(Event, { fingerprint: true })
      const frame = new Uint8Array(encodeFingerprint(Event, { _tag: "b", s: "x" }))
      // the byte after the envelope and fingerprint is the member position
      frame[10] = 7
      assert.include(
        schemaError(() => Schema.decodeUnknownSync(codec)(frame)).message,
        "Expected known union member"
      )
    })

    it("reports a required field a newer writer left unreadable as missing", () => {
      const schema = Schema.Struct({ reason: Schema.CauseReason(Schema.String, Schema.String) })
      const frame = new Uint8Array(encodeFingerprint(schema, { reason: Cause.makeFailReason("boom") }))
      // the reason payload is length-prefixed; its first byte is the tag
      frame[11] = 9
      const error = schemaError(() =>
        Schema.decodeUnknownSync(SchemaBinary.toCodec(schema, { fingerprint: true }))(frame)
      )
      assert.include(error.message, "reason")
      assert.include(error.message, "Missing key")
    })

    it("rejects duplicate extra keys", () => {
      const schema = Schema.Record(Schema.String, Schema.Number)
      const frame = encodeFingerprint(schema, { a: 1, b: 2 })
      const duplicated = new Uint8Array(frame)
      // rewrite the second key so both pairs claim "a"
      duplicated[duplicated.length - 2] = 97
      assert.include(
        schemaError(() => Schema.decodeUnknownSync(SchemaBinary.toCodec(schema, { fingerprint: true }))(duplicated))
          .message,
        "Expected unique extra keys"
      )
    })
  })

  describe("codec memoization", () => {
    it("memoizes by schema and wire mode", () => {
      const schema = Schema.Struct({ id: Schema.Number, label: Schema.String })

      const codec = SchemaBinary.toCodec(schema)
      assert.strictEqual(SchemaBinary.toCodec(schema), codec)
      assert.strictEqual(SchemaBinary.toCodec(schema, {}), codec)
      assert.strictEqual(SchemaBinary.toCodec(schema, { fingerprint: false }), codec)

      const fingerprintCodec = SchemaBinary.toCodec(schema, { fingerprint: true })
      assert.strictEqual(SchemaBinary.toCodec(schema, { fingerprint: true }), fingerprintCodec)
      assert.notStrictEqual(fingerprintCodec, codec)

      const directCodec = SchemaBinary.toCodecDirect(schema)
      assert.strictEqual(SchemaBinary.toCodecDirect(schema), directCodec)
      assert.strictEqual(SchemaBinary.toCodecDirect(schema, { fingerprint: false }), directCodec)

      const directFingerprintCodec = SchemaBinary.toCodecDirect(schema, { fingerprint: true })
      assert.strictEqual(
        SchemaBinary.toCodecDirect(schema, { fingerprint: true }),
        directFingerprintCodec
      )
      assert.notStrictEqual(directFingerprintCodec, directCodec)
    })
  })

  describe("generated regressions", () => {
    const isWellFormedString = (value: string): boolean => {
      for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index)
        if (code >= 0xD800 && code <= 0xDBFF) {
          if (index + 1 >= value.length) return false
          const trailing = value.charCodeAt(++index)
          if (trailing < 0xDC00 || trailing > 0xDFFF) return false
        } else if (code >= 0xDC00 && code <= 0xDFFF) {
          return false
        }
      }
      return true
    }
    const WellFormedString = Schema.String.check(
      Schema.makeFilter(isWellFormedString, { expected: "a well-formed Unicode string" })
    )
    const Event = Schema.Union([
      Schema.Struct({ _tag: Schema.tag("Text"), value: WellFormedString }),
      Schema.Struct({ _tag: Schema.tag("Count"), value: Schema.Number })
    ])
    const Generated = Schema.Struct({
      flag: Schema.Boolean,
      count: Schema.Int,
      ratio: Schema.Number,
      label: WellFormedString,
      bytes: Schema.Uint8Array,
      big: Schema.BigInt,
      optional: Schema.optionalKey(WellFormedString),
      tuple: Schema.Tuple([WellFormedString, Schema.Number, Schema.Boolean]),
      items: Schema.Array(Schema.Struct({ id: Schema.Int, name: WellFormedString })),
      attributes: Schema.Record(
        WellFormedString,
        Schema.Union([WellFormedString, Schema.Number, Schema.Boolean, Schema.Null])
      ),
      event: Event
    })
    it.live.prop(
      "keeps every encoding entry point equivalent for generated nested values",
      { value: Generated },
      ({ value }) =>
        Effect.sync(() => {
          for (const fingerprint of [false, true]) {
            const options = { fingerprint } as const
            const codec = SchemaBinary.toCodec(Generated, options)
            const direct = SchemaBinary.toCodecDirect(Generated, options)
            const frame = Schema.encodeUnknownSync(codec)(value)
            const optimizedFrame = SchemaBinary.encodeUnknownSync(Generated, options)(value)
            const statefulFrame = SchemaBinary.encoder(Generated, options).encode(value)

            assert.deepStrictEqual(optimizedFrame, frame)
            assert.deepStrictEqual(statefulFrame, frame)
            assert.deepStrictEqual(Schema.decodeUnknownSync(codec)(frame), value)
            assert.deepStrictEqual(Schema.decodeUnknownSync(direct)(frame), value)
            assert.deepStrictEqual(SchemaBinary.parser(Generated, options).feedSync(frame), [value])
          }
        }),
      { arbitrary: { runs: 200 } }
    )

    it.live.prop(
      "parses generated batches across arbitrary chunk boundaries",
      {
        values: Schema.Array(Generated).check(Schema.isMaxLength(20)),
        chunkSizes: Schema.Array(
          Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 64 }))
        ).check(Schema.isMinLength(1), Schema.isMaxLength(30)),
        fingerprint: Schema.Boolean
      },
      ({ chunkSizes, fingerprint, values }) =>
        Effect.sync(() => {
          const options = fingerprint ? { fingerprint: true } as const : undefined
          const bytes = SchemaBinary.encodeManyUnknownSync(Generated, options)(values)
          const parser = SchemaBinary.parser(Generated, options)
          const decoded: Array<typeof Generated.Type> = []
          let offset = 0
          for (const size of chunkSizes) {
            if (offset >= bytes.length) break
            const end = Math.min(offset + size, bytes.length)
            decoded.push(...parser.feedSync(bytes.subarray(offset, end)))
            offset = end
          }
          if (offset < bytes.length) decoded.push(...parser.feedSync(bytes.subarray(offset)))
          parser.endSync()
          assert.deepStrictEqual(decoded, values)
        }),
      { arbitrary: { runs: 100 } }
    )

    it.live.prop(
      "rejects every generated truncated frame",
      {
        value: Generated,
        offset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
        fingerprint: Schema.Boolean
      },
      ({ fingerprint, offset, value }) =>
        Effect.sync(() => {
          const options = fingerprint ? { fingerprint: true } as const : undefined
          const bytes = SchemaBinary.encodeUnknownSync(Generated, options)(value)
          const cut = 1 + offset % (bytes.length - 1)
          const parser = SchemaBinary.parser(Generated, options)

          assert.deepStrictEqual(parser.feedSync(bytes.subarray(0, cut)), [])
          assert.match(schemaError(() => parser.endSync()).message, /complete value/)
        }),
      { arbitrary: { runs: 100 } }
    )

    it("owns buffered and decoded bytes independently of caller buffers", () => {
      const schema = Schema.Struct({ label: Schema.String, bytes: Schema.Uint8Array })
      const value = { label: "fragmented", bytes: Uint8Array.of(1, 2, 3, 4) }
      const frame = encode(schema, value)
      const split = Math.floor(frame.length / 2)
      const prefix = frame.slice(0, split)
      const parser = SchemaBinary.parser(schema)

      assert.deepStrictEqual(parser.feedSync(prefix), [])
      prefix.fill(0)
      const [decoded] = parser.feedSync(frame.subarray(split))
      frame.fill(0)

      assert.deepStrictEqual(decoded, value)
      assert.notStrictEqual(decoded.bytes.buffer, frame.buffer)
      parser.endSync()
    })
  })

  describe("direct codec", () => {
    const Person = Schema.Struct({ name: Schema.String, age: Schema.Number })

    it("matches toCodec on the wire and round-trips", () => {
      const direct = SchemaBinary.toCodecDirect(Person)
      const value = { name: "Ada", age: 36 }
      const bytes = Schema.encodeUnknownSync(direct)(value)
      assert.deepStrictEqual(Array.from(bytes), Array.from(encode(Person, value)))
      assert.deepStrictEqual(Schema.decodeUnknownSync(direct)(bytes), value)
    })

    it("still rejects invalid input, through the binary layer", () => {
      const direct = SchemaBinary.toCodecDirect(Person)
      assert.include(schemaError(() => Schema.encodeUnknownSync(direct)({ name: "Ada", age: "old" })).message, "age")
      assert.include(schemaError(() => Schema.encodeUnknownSync(direct)({ name: "Ada" })).message, "age")
      assert.include(schemaError(() => Schema.encodeUnknownSync(direct)("Ada")).message, "Expected an object")
    })

    it("rejects a wrong runtime type for every leaf an exact schema can reach", () => {
      const cases: ReadonlyArray<readonly [Schema.Top, unknown, string]> = [
        [Schema.String, 1, "a string"],
        [Schema.Number, "1", "a number"],
        [Schema.Boolean, 1, "a boolean"],
        [Schema.BigInt, 1, "a bigint"],
        [Schema.Symbol, "s", "a symbol"],
        [Schema.Null, 1, "null"],
        [Schema.Undefined, 1, "undefined"],
        [Schema.Uint8Array, [1, 2], "a Uint8Array"],
        [Schema.Date, 0, "a Date"],
        [Schema.Array(Schema.String), "ab", "an array"],
        [Schema.Struct({ a: Schema.String }), "a", "an object"]
      ]
      for (const [schema, value, expected] of cases) {
        const direct = SchemaBinary.toCodecDirect(schema as Schema.Codec<unknown>)
        assert.include(
          schemaError(() => Schema.encodeUnknownSync(direct)(value)).message,
          `Expected ${expected}`,
          `${expected} for ${globalThis.String(value)}`
        )
      }
    })

    it("keeps failure exits on the schema pass when only the success side is exact", () => {
      const ExitSchema = Schema.Exit(
        Schema.Struct({ id: Schema.String }),
        Schema.String,
        Schema.Defect()
      )
      const direct = SchemaBinary.toCodecDirect(ExitSchema as Schema.Codec<unknown, unknown>)
      const sound = SchemaBinary.toCodec(ExitSchema as Schema.Codec<unknown, unknown>)
      const exits = [
        Exit.succeed({ id: "user-1" }),
        Exit.fail("nope"),
        Exit.die(new Error("boom")),
        Exit.failCause(Cause.interrupt(7))
      ]
      for (const exit of exits) {
        const bytes = Schema.encodeUnknownSync(direct)(exit)
        assert.deepStrictEqual(Array.from(bytes), Array.from(Schema.encodeUnknownSync(sound)(exit)))
        assert.deepStrictEqual(
          Schema.decodeUnknownSync(direct)(bytes.slice()),
          Schema.decodeUnknownSync(sound)(bytes.slice())
        )
      }
      const decodedDie = Schema.decodeUnknownSync(direct)(
        Schema.encodeUnknownSync(direct)(Exit.die(new Error("boom"))).slice()
      ) as Exit.Exit<unknown, unknown>
      assert.isTrue(Exit.isFailure(decodedDie))
      const reason = (decodedDie as Exit.Failure<unknown, unknown>).cause.reasons[0] as Cause.Die
      assert.instanceOf(reason.defect, Error)
      assert.strictEqual((reason.defect as Error).message, "boom")

      assert.isDefined(schemaError(() => Schema.encodeUnknownSync(direct)(Exit.succeed({ id: 42 }))))
      assert.isDefined(schemaError(() => Schema.encodeUnknownSync(direct)("not an exit")))

      const excess = Exit.succeed({ id: "ok", extra: true })
      assert.deepStrictEqual(
        Array.from(Schema.encodeUnknownSync(direct)(excess)),
        Array.from(Schema.encodeUnknownSync(sound)(excess))
      )
      assert.include(
        schemaError(() => Schema.encodeUnknownSync(direct, { onExcessProperty: "error" })(excess)).message,
        "extra"
      )
      assert.include(
        schemaError(() =>
          SchemaBinary.encodeUnknownSync(
            ExitSchema as Schema.Codec<unknown, unknown>,
            { onExcessProperty: "error" }
          )(excess)
        ).message,
        "extra"
      )
    })

    it("rejects an inherited discriminator, like the schema pass", () => {
      const schema = Schema.Union([
        Schema.Struct({ _tag: Schema.Literal("A"), value: Schema.Number }),
        Schema.Struct({ _tag: Schema.Literal("B"), value: Schema.String })
      ])
      const inherited = Object.assign(Object.create({ _tag: "A" }), { value: 1 })
      for (const options of [undefined, { fingerprint: true }]) {
        const encodeDirect = Schema.encodeUnknownSync(SchemaBinary.toCodecDirect(schema, options))
        assert.isDefined(schemaError(() => encodeDirect(inherited)))
      }
    })

    it("reports excess properties when the call site asks for it", () => {
      const direct = SchemaBinary.toCodecDirect(Person)
      const excess = { name: "Ada", age: 36, extra: true }
      assert.deepStrictEqual(
        Array.from(Schema.encodeUnknownSync(direct)(excess)),
        Array.from(encode(Person, { name: "Ada", age: 36 }))
      )
      assert.include(
        schemaError(() => Schema.encodeUnknownSync(direct, { onExcessProperty: "error" })(excess)).message,
        "extra"
      )
    })

    it("reports excess properties through encodeUnknownSync", () => {
      const excess = { name: "Ada", age: 36, extra: true }
      assert.include(
        schemaError(() => SchemaBinary.encodeUnknownSync(Person, { onExcessProperty: "error" })(excess)).message,
        "extra"
      )
    })

    it("falls back to toCodec when the binary layer cannot prove the schema", () => {
      const NonNegative = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))
      const direct = SchemaBinary.toCodecDirect(NonNegative)
      assert.isTrue(Schema.is(direct)(1))
      assert.isFalse(Schema.is(direct)(-1))
      assert.include(schemaError(() => Schema.encodeUnknownSync(direct)(-1)).message, "greater than or equal to 0")
    })
  })

  describe("encodeManyUnknownSync", () => {
    const Person = Schema.Struct({ name: Schema.String, age: Schema.Number })
    const people = [{ name: "Ada", age: 36 }, { name: "Grace", age: 45 }]

    it("writes the same bytes as concatenated single frames", () => {
      const many = SchemaBinary.encodeManyUnknownSync(Person, { fingerprint: true })
      assert.deepStrictEqual(
        Array.from(many(people)),
        Array.from(concat(...people.map((person) => encodeFingerprint(Person, person))))
      )
      assert.deepStrictEqual(SchemaBinary.parser(Person, { fingerprint: true }).feedSync(many(people)), people)
      assert.deepStrictEqual(Array.from(many([])), [])
    })

    it("reports the failing frame and takes the fallback path for checked schemas", () => {
      const many = SchemaBinary.encodeManyUnknownSync(Person)
      assert.include(schemaError(() => many([people[0], { name: "Grace" }])).message, "age")

      const Checked = Schema.Struct({ age: Schema.Number.check(Schema.isGreaterThanOrEqualTo(0)) })
      const checked = SchemaBinary.encodeManyUnknownSync(Checked)
      assert.deepStrictEqual(
        Array.from(checked([{ age: 1 }, { age: 2 }])),
        Array.from(concat(encode(Checked, { age: 1 }), encode(Checked, { age: 2 })))
      )
      assert.include(schemaError(() => checked([{ age: -1 }])).message, "greater than or equal to 0")
    })

    it("reports excess properties", () => {
      const excess = { name: "Ada", age: 36, extra: true }
      assert.include(
        schemaError(() =>
          SchemaBinary.encodeManyUnknownSync(Person, { onExcessProperty: "error" })([people[0], excess])
        ).message,
        "extra"
      )
    })
  })

  describe("schemas the binary layer validates on its own", () => {
    // `dictionary: true` is refused for anything the binary layer does not
    // fully validate, so it doubles as an assertion that the schema pass
    // around the codec is redundant and gets skipped.
    const validatesItself = (schema: Schema.Codec<any, any>): boolean => {
      try {
        SchemaBinary.encoder(schema, { dictionary: true })
        return true
      } catch (error) {
        if (error instanceof Error && error.message.includes("dictionary")) return false
        throw error
      }
    }

    it("covers never, which an inferred schema reaches through an empty array", () => {
      assert.isTrue(validatesItself(Schema.Never))
      const Row = Schema.Struct({ id: Schema.String, tags: Schema.Array(Schema.Never) })
      assert.isTrue(validatesItself(Row))
      const value = { id: "a", tags: [] as ReadonlyArray<never> }
      assert.deepStrictEqual(roundtrip(Row, value), value)
      assert.include(schemaError(() => encode(Row, { id: "a", tags: ["x"] } as any)).message, "never")
      assert.isFalse(Schema.is(SchemaBinary.toCodec(Row))({ id: 1, tags: [] } as any))
    })

    it("covers unknown and any, which the JSON layer already rejects or accepts", () => {
      assert.isTrue(validatesItself(Schema.Unknown))
      assert.isTrue(validatesItself(Schema.Any))
      // A JSON payload can be a string, so an object keyword still needs the pass.
      assert.isFalse(validatesItself(Schema.ObjectKeyword))
      const Row = Schema.Struct({ id: Schema.String, payload: Schema.Unknown })
      assert.isTrue(validatesItself(Row))
      const value = { id: "a", payload: { nested: [1, "two", true, null] } }
      assert.deepStrictEqual(roundtrip(Row, value), value)
      assert.isFalse(Schema.is(SchemaBinary.toCodec(Row))({ id: 1, payload: 1 } as any))
      const cyclic: any = { id: "a", payload: {} }
      cyclic.payload.self = cyclic.payload
      assert.include(schemaError(() => encode(Row, cyclic)).message, "acyclic value")
    })

    it("covers recursion on decode while encode keeps the cycle walk", () => {
      interface TreeType {
        readonly value: string
        readonly children: ReadonlyArray<TreeType>
      }
      const Tree = Schema.Struct({
        value: Schema.String,
        children: Schema.Array(Schema.suspend((): Schema.Codec<TreeType> => Tree as any))
      })
      assert.isTrue(validatesItself(Tree))
      const tree = { value: "root", children: [{ value: "leaf", children: [] }] }
      assert.deepStrictEqual(roundtrip(Tree, tree), tree)
      assert.isFalse(Schema.is(SchemaBinary.toCodec(Tree))({ value: 1, children: [] } as any))
      assert.include(schemaError(() => encode(Tree, { value: "root", children: [1] } as any)).message, "object")
      const cyclic: any = { value: "root", children: [] }
      cyclic.children.push(cyclic)
      assert.include(schemaError(() => encode(Tree, cyclic)).message, "acyclic value")
    })
  })

  describe("connection dictionary", () => {
    const Message = Schema.Struct({
      tag: Schema.String,
      traceId: Schema.String,
      body: Schema.String,
      n: Schema.Number
    })
    const message = (index: number) => ({
      tag: ["Search", "Get", "Delete"][index % 3],
      traceId: "0123456789abcdef0123456789abcdef",
      body: `body ${index}`,
      n: index
    })

    it("round-trips a stream and shrinks repeated strings", () => {
      for (const fingerprint of [false, true]) {
        const options = { dictionary: true, fingerprint } as const
        const encoder = SchemaBinary.encoder(Message, options)
        const parser = SchemaBinary.parser(Message, options)
        const plain = SchemaBinary.encoder(Message, { fingerprint })
        const values = Array.from({ length: 30 }, (_, index) => message(index))
        const decoded: Array<unknown> = []
        const sizes: Array<number> = []
        for (const value of values) {
          const frame = encoder.encode(value)
          sizes.push(frame.length)
          decoded.push(...parser.feedSync(frame))
        }
        assert.deepStrictEqual(decoded, values)
        // The first frame carries every string, so it costs what no dictionary
        // would; later frames reference the ones that came back.
        assert.strictEqual(sizes[0], plain.encode(values[0]).length)
        assert.isBelow(sizes[sizes.length - 1], plain.encode(values[values.length - 1]).length * 0.6)
      }
    })

    it("round-trips arrays of strings across frames", () => {
      const values = [["a", "b"], ["a", "c"], ["a", "a"]]
      const encoder = SchemaBinary.encoder(Schema.Array(Schema.String), { dictionary: true })
      const parser = SchemaBinary.parser(Schema.Array(Schema.String), { dictionary: true })
      const decoded = values.flatMap((value) => parser.feedSync(encoder.encode(value)))
      assert.deepStrictEqual(decoded, values)

      const Message = Schema.Struct({ name: Schema.String, tags: Schema.Array(Schema.String) })
      const messages = [
        { name: "shared", tags: ["a", "b"] },
        { name: "other", tags: ["shared", "c"] },
        { name: "shared", tags: ["a", "a"] }
      ]
      const messageEncoder = SchemaBinary.encoder(Message, { dictionary: true })
      const messageParser = SchemaBinary.parser(Message, { dictionary: true })
      const decodedMessages = messages.flatMap((value) => messageParser.feedSync(messageEncoder.encode(value)))
      assert.deepStrictEqual(decodedMessages, messages)
    })

    it("round-trips arrays of strings inside row runs across frames", () => {
      const Row = Schema.Struct({ id: Schema.Number, tags: Schema.Array(Schema.String) })
      const Rows = Schema.Array(Row)
      const values = [
        [{ id: 1, tags: ["x"] }],
        [{ id: 2, tags: ["x"] }],
        [{ id: 3, tags: ["x"] }]
      ]
      const encoder = SchemaBinary.encoder(Rows, { dictionary: true })
      const parser = SchemaBinary.parser(Rows, { dictionary: true })
      const decoded = values.flatMap((value) => parser.feedSync(encoder.encode(value)))
      assert.deepStrictEqual(decoded, values)
    })

    it("round-trips batched frames and fragmented feeds", () => {
      const encoder = SchemaBinary.encoder(Message, { dictionary: true })
      const parser = SchemaBinary.parser(Message, { dictionary: true })
      const values = Array.from({ length: 12 }, (_, index) => message(index))
      assert.deepStrictEqual(parser.feedSync(encoder.encodeMany(values)), values)

      const fragmented = SchemaBinary.encoder(Message, { dictionary: true })
      const fragmentedParser = SchemaBinary.parser(Message, { dictionary: true })
      const decoded: Array<unknown> = []
      for (const value of values) {
        const frame = fragmented.encode(value).slice()
        decoded.push(...fragmentedParser.feedSync(frame.subarray(0, 1)))
        decoded.push(...fragmentedParser.feedSync(frame.subarray(1)))
      }
      assert.deepStrictEqual(decoded, values)
    })

    it("keeps the reader in step when a frame fails to encode", () => {
      const encoder = SchemaBinary.encoder(Message, { dictionary: true })
      const parser = SchemaBinary.parser(Message, { dictionary: true })
      const first = message(0)
      const decoded: Array<unknown> = [...parser.feedSync(encoder.encode(first))]
      // Never reaches the reader, so its strings must not reach the writer's
      // tables either.
      assert.include(
        schemaError(() => encoder.encode({ ...message(1), tag: "NeverSent", n: "not a number" })).message,
        "number"
      )
      assert.include(
        schemaError(() => encoder.encodeMany([message(2), { ...message(3), n: "not a number" }])).message,
        "number"
      )
      const next = message(4)
      decoded.push(...parser.feedSync(encoder.encode(next)))
      assert.deepStrictEqual(decoded, [first, next])
    })

    it("reports excess properties before advancing the dictionary", () => {
      const encoder = SchemaBinary.encoder(Message, {
        dictionary: true,
        onExcessProperty: "error"
      })
      const parser = SchemaBinary.parser(Message, { dictionary: true })
      assert.include(
        schemaError(() => encoder.encode({ ...message(0), extra: "NeverSent" })).message,
        "extra"
      )
      assert.include(
        schemaError(() => encoder.encodeMany([message(1), { ...message(2), extra: "NeverSent" }])).message,
        "extra"
      )
      const next = message(3)
      assert.deepStrictEqual(parser.feedSync(encoder.encode(next)), [next])
    })

    it("costs nothing on a field whose strings never repeat", () => {
      const Unique = Schema.Struct({ s: Schema.String })
      const encoder = SchemaBinary.encoder(Unique, { dictionary: true })
      const parser = SchemaBinary.parser(Unique, { dictionary: true })
      const plain = SchemaBinary.encoder(Unique, {})
      const values = Array.from({ length: 200 }, (_, index) => ({ s: `value-${index}` }))
      const decoded: Array<unknown> = []
      let dictionaryBytes = 0
      let plainBytes = 0
      for (const value of values) {
        const frame = encoder.encode(value)
        dictionaryBytes += frame.length
        plainBytes += plain.encode(value).length
        decoded.push(...parser.feedSync(frame))
      }
      assert.deepStrictEqual(decoded, values)
      assert.strictEqual(dictionaryBytes, plainBytes)
    })

    it("rejects a schema the binary layer does not validate on its own", () => {
      const Checked = Schema.Struct({ s: Schema.String.check(Schema.isMinLength(2)) })
      assert.throws(() => SchemaBinary.encoder(Checked, { dictionary: true }), /dictionary/)
      assert.throws(() => SchemaBinary.parser(Checked, { dictionary: true }), /dictionary/)
    })

    it("rejects a reference the stream never sent", () => {
      const encoder = SchemaBinary.encoder(Message, { dictionary: true })
      const parser = SchemaBinary.parser(Message, { dictionary: true })
      for (let index = 0; index < 4; index++) parser.feedSync(encoder.encode(message(index)))
      const frame = encoder.encode(message(4)).slice()
      // Point the tag at a table entry past the end of what was sent.
      const tagged = frame.map((byte) => byte === 1 ? 0xFF : byte)
      assert.throws(() => parser.feedSync(tagged))
    })

    it("stays off by default", () => {
      const encoder = SchemaBinary.encoder(Message, {})
      assert.deepStrictEqual(Array.from(encoder.encode(message(0))), Array.from(encode(Message, message(0))))
    })
  })

  describe("fingerprint mode parser", () => {
    const Person = Schema.Struct({ name: Schema.String, age: Schema.Number })
    const first = { name: "Ada", age: 36 }
    const second = { name: "Grace", age: 45 }

    it("parses concatenated frames, one byte at a time, and mid-frame splits", () => {
      const frames = concat(encodeFingerprint(Person, first), encodeFingerprint(Person, second))
      assert.deepStrictEqual(
        SchemaBinary.parser(Person, { fingerprint: true }).feedSync(frames),
        [first, second]
      )

      const byteParser = SchemaBinary.parser(Person, { fingerprint: true })
      const out: Array<unknown> = []
      for (const byte of frames) out.push(...byteParser.feedSync(new Uint8Array([byte])))
      byteParser.endSync()
      assert.deepStrictEqual(out, [first, second])

      // a split inside the fingerprint must wait rather than fail
      const split = SchemaBinary.parser(Person, { fingerprint: true })
      assert.deepStrictEqual(split.feedSync(frames.subarray(0, 6)), [])
      assert.deepStrictEqual(split.feedSync(frames.subarray(6)), [first, second])
    })

    it("fails closed on a default-mode frame in a fingerprint stream", () => {
      const parser = SchemaBinary.parser(Person, { fingerprint: true })
      const mixed = concat(encodeFingerprint(Person, first), encode(Person, second))
      assert.deepStrictEqual(parser.feedSync(mixed), [first])
      assert.include(
        schemaError(() => parser.feedSync(new Uint8Array(0))).message,
        "Expected version 2 envelope, flags 1"
      )
      assert.include(schemaError(() => parser.endSync()).message, "Expected parser is spent")
    })

    it("honours maxFrameSize and reports truncation at end", () => {
      const bounded = SchemaBinary.parser(Person, { fingerprint: true, maxFrameSize: 4 })
      assert.include(
        schemaError(() => bounded.feedSync(encodeFingerprint(Person, first))).message,
        "Expected frame within maxFrameSize"
      )
      const truncated = SchemaBinary.parser(Person, { fingerprint: true })
      const frame = encodeFingerprint(Person, first)
      assert.deepStrictEqual(truncated.feedSync(frame.subarray(0, frame.length - 2)), [])
      assert.include(schemaError(() => truncated.endSync()).message, "Expected complete value")
    })
  })

  describe("channels", () => {
    const Person = Schema.Struct({ name: Schema.String, age: Schema.Number })
    const ada = { name: "Ada", age: 36 }
    const grace = { name: "Grace", age: 45 }

    it.effect("encode then decode round-trips a stream", () =>
      Effect.gen(function*() {
        const values = yield* Stream.make(ada, grace).pipe(
          Stream.pipeThroughChannel(SchemaBinary.encode(Person)()),
          Stream.pipeThroughChannel(SchemaBinary.decode(Person)()),
          Stream.runCollect
        )

        assert.deepStrictEqual([...values], [ada, grace])
      }))

    it.effect("encode batches a chunk into one concatenated byte element", () =>
      Effect.gen(function*() {
        const frames = yield* Stream.make(ada, grace).pipe(
          Stream.pipeThroughChannel(SchemaBinary.encode(Person)()),
          Stream.runCollect
        )

        assert.deepStrictEqual([...frames], [concat(encode(Person, ada), encode(Person, grace))])
      }))

    it.effect("encode rejects non-number elements in uniform number arrays", () =>
      Effect.gen(function*() {
        for (const value of ["x", undefined, null]) {
          const error = yield* Stream.make([1, value, 3] as any).pipe(
            Stream.pipeThroughChannel(SchemaBinary.encode(Schema.Array(Schema.Number))()),
            Stream.runCollect,
            Effect.flip
          )
          assert.instanceOf(error, Schema.SchemaError)
          assert.include(error.message, "Expected a number")
          assert.include(error.message, "at [1]")
        }
      }))

    it.effect("encode reports excess properties", () =>
      Effect.gen(function*() {
        const error = yield* Stream.make({ ...ada, extra: true }).pipe(
          Stream.pipeThroughChannel(SchemaBinary.encode(Person, { onExcessProperty: "error" })()),
          Stream.runCollect,
          Effect.flip
        )
        assert.instanceOf(error, Schema.SchemaError)
        assert.include(error.message, "extra")
      }))

    it.effect("decodes a value split across byte chunks", () =>
      Effect.gen(function*() {
        const frame = encode(Person, ada)
        const values = yield* Stream.make(frame.subarray(0, 3), frame.subarray(3)).pipe(
          Stream.pipeThroughChannel(SchemaBinary.decode(Person)()),
          Stream.runCollect
        )

        assert.deepStrictEqual([...values], [ada])
      }))

    it.effect("decodes concatenated frames in one chunk", () =>
      Effect.gen(function*() {
        const bytes = concat(encode(Person, ada), encode(Person, grace)) as Uint8Array<ArrayBuffer>
        const values = yield* Stream.make(bytes).pipe(
          Stream.pipeThroughChannel(SchemaBinary.decode(Person)()),
          Stream.runCollect
        )

        assert.deepStrictEqual([...values], [ada, grace])
      }))

    it.effect("fails deeply nested recursive frames in the error channel", () =>
      Effect.gen(function*() {
        type Nested = ReadonlyArray<Nested>
        let Nested: Schema.Codec<Nested>
        Nested = Schema.Array(Schema.suspend(() => Nested))
        const error = yield* Stream.make(nestedArrayFrame(10_000)).pipe(
          Stream.pipeThroughChannel(SchemaBinary.decode(Nested)()),
          Stream.runCollect,
          Effect.flip
        )

        assert.instanceOf(error, Schema.SchemaError)
        assert.include(error.message, "nesting depth at most")
      }))

    it.effect("fails when the stream ends with an incomplete frame", () =>
      Effect.gen(function*() {
        const frame = encode(Person, ada)
        const error = yield* Stream.make(frame.subarray(0, frame.length - 1)).pipe(
          Stream.pipeThroughChannel(SchemaBinary.decode(Person)()),
          Stream.runCollect,
          Effect.flip
        )

        assert.instanceOf(error, Schema.SchemaError)
        assert.include(error.message, "Expected complete value")
      }))

    it.effect("emits completed values before reporting a later failure", () =>
      Effect.gen(function*() {
        const bad = encode(Person, grace).slice()
        bad[1] = 0x10
        const seen: Array<typeof ada> = []
        const error = yield* Stream.make(
          concat(encode(Person, ada), bad) as Uint8Array<ArrayBuffer>,
          encode(Person, grace)
        ).pipe(
          Stream.pipeThroughChannel(SchemaBinary.decode(Person)()),
          Stream.tap((value) =>
            Effect.sync(() => {
              seen.push(value)
            })
          ),
          Stream.runDrain,
          Effect.flip
        )

        assert.deepStrictEqual(seen, [ada])
        assert.include(error.message, "version 2 envelope, flags 0")
      }))

    it.effect("enforces maxFrameSize on decode and ignores it on encode", () =>
      Effect.gen(function*() {
        const values = yield* Stream.make(ada).pipe(
          Stream.pipeThroughChannel(SchemaBinary.encode(Person, { maxFrameSize: 1 })()),
          Stream.pipeThroughChannel(SchemaBinary.decode(Person)()),
          Stream.runCollect
        )
        assert.deepStrictEqual([...values], [ada])

        const error = yield* Stream.make(encode(Person, ada)).pipe(
          Stream.pipeThroughChannel(SchemaBinary.decode(Person, { maxFrameSize: 2 })()),
          Stream.runCollect,
          Effect.flip
        )
        assert.include(error.message, "Expected frame within maxFrameSize")
      }))

    it.effect("duplex encodes requests and decodes responses with different schemas", () =>
      Effect.gen(function*() {
        const Request = Schema.Struct({ id: Schema.Number })
        const Response = Schema.Struct({ id: Schema.Number, name: Schema.String })
        const socket = SchemaBinary.decode(Request)<Schema.SchemaError>().pipe(
          Channel.map((chunk) => Arr.map(chunk, (request) => ({ id: request.id, name: `user-${request.id}` }))),
          Channel.pipeTo(SchemaBinary.encode(Response)<Schema.SchemaError>())
        )

        const values = yield* Stream.make({ id: 1 }, { id: 2 }).pipe(
          Stream.pipeThroughChannel(
            SchemaBinary.duplex(socket, { inputSchema: Request, outputSchema: Response })
          ),
          Stream.runCollect
        )

        assert.deepStrictEqual([...values], [{ id: 1, name: "user-1" }, { id: 2, name: "user-2" }])
      }))

    it.effect("duplex supports the data-last call shape", () =>
      Effect.gen(function*() {
        const Request = Schema.Struct({ id: Schema.Number })
        const Response = Schema.Struct({ ok: Schema.Boolean })
        const socket = SchemaBinary.decode(Request)<Schema.SchemaError>().pipe(
          Channel.map((chunk) => Arr.map(chunk, () => ({ ok: true }))),
          Channel.pipeTo(SchemaBinary.encode(Response)<Schema.SchemaError>())
        )

        const values = yield* Stream.make({ id: 1 }).pipe(
          Stream.pipeThroughChannel(
            socket.pipe(SchemaBinary.duplex({ inputSchema: Request, outputSchema: Response }))
          ),
          Stream.runCollect
        )

        assert.deepStrictEqual([...values], [{ ok: true }])
      }))

    it.effect("round-trips fingerprint mode through the channel path", () =>
      Effect.gen(function*() {
        const frames = yield* Stream.make(ada, grace).pipe(
          Stream.pipeThroughChannel(SchemaBinary.encode(Person, { fingerprint: true })()),
          Stream.runCollect
        )
        assert.deepStrictEqual(
          [...frames],
          [concat(encodeFingerprint(Person, ada), encodeFingerprint(Person, grace))]
        )

        const values = yield* Stream.fromArray([...frames]).pipe(
          Stream.pipeThroughChannel(SchemaBinary.decode(Person, { fingerprint: true })()),
          Stream.runCollect
        )
        assert.deepStrictEqual([...values], [ada, grace])
      }))

    const AsyncName = Schema.String.pipe(
      Schema.decodeTo(
        Schema.String,
        SchemaTransformation.transformEffect({
          decode: (value) => Effect.promise(() => Promise.resolve(value.toUpperCase())),
          encode: (value) => Effect.promise(() => Promise.resolve(value.toLowerCase()))
        })
      )
    )
    const AsyncPerson = Schema.Struct({ name: AsyncName, age: Schema.Number })

    it.effect("supports async transformations on encode and decode", () =>
      Effect.gen(function*() {
        const frames = yield* Stream.make(ada, grace).pipe(
          Stream.pipeThroughChannel(SchemaBinary.encode(AsyncPerson)()),
          Stream.runCollect
        )
        // the async encode transformation ran before the bytes hit the wire
        assert.deepStrictEqual(
          [...frames],
          [concat(encode(Person, { name: "ada", age: 36 }), encode(Person, { name: "grace", age: 45 }))]
        )

        const values = yield* Stream.fromArray([...frames]).pipe(
          Stream.pipeThroughChannel(SchemaBinary.decode(AsyncPerson)()),
          Stream.runCollect
        )
        assert.deepStrictEqual([...values], [{ name: "ADA", age: 36 }, { name: "GRACE", age: 45 }])
      }))

    it.effect("supports async transformations across a duplex channel", () =>
      Effect.gen(function*() {
        const echo = Channel.identity<
          Arr.NonEmptyReadonlyArray<Uint8Array<ArrayBuffer>>,
          Schema.SchemaError,
          unknown
        >()

        const values = yield* Stream.make(ada).pipe(
          Stream.pipeThroughChannel(
            SchemaBinary.duplex(echo, { inputSchema: AsyncPerson, outputSchema: AsyncPerson })
          ),
          Stream.runCollect
        )

        assert.deepStrictEqual([...values], [{ name: "ADA", age: 36 }])
      }))

    it.effect("emits values decoded before an async transformation failure", () =>
      Effect.gen(function*() {
        const Wire = Schema.Struct({ name: Schema.String })
        const Reader = Schema.Struct({
          name: Schema.String.pipe(
            Schema.decodeTo(
              Schema.String,
              SchemaTransformation.transformEffect({
                decode: (value, options) =>
                  value === "bob"
                    ? Effect.fail(new SchemaIssue.InvalidValue({ expected: "not bob" }, value, options))
                    : Effect.promise(() => Promise.resolve(value)),
                encode: (value) => Effect.succeed(value)
              })
            )
          )
        })
        const bytes = concat(encode(Wire, { name: "ada" }), encode(Wire, { name: "bob" })) as Uint8Array<ArrayBuffer>
        const seen: Array<{ name: string }> = []
        const error = yield* Stream.make(bytes).pipe(
          Stream.pipeThroughChannel(SchemaBinary.decode(Reader)()),
          Stream.tap((value) =>
            Effect.sync(() => {
              seen.push(value)
            })
          ),
          Stream.runDrain,
          Effect.flip
        )

        assert.deepStrictEqual(seen, [{ name: "ada" }])
        assert.include(error.message, "not bob")
      }))
  })
})
