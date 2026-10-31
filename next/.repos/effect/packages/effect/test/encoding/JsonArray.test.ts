import { assert, describe, it } from "@effect/vitest"
import { Array as Arr, Channel, Effect, Schema, Stream } from "effect"
import * as JsonArray from "effect/encoding/JsonArray"

const decodeChunks = (chunks: ReadonlyArray<string>, options?: JsonArray.DecodeOptions) =>
  Stream.fromArrays(...chunks.map((chunk) => [chunk])).pipe(
    Stream.pipeThroughChannel(JsonArray.decodeString(options)),
    Stream.runCollect
  )

const decodeError = (chunks: ReadonlyArray<string>, options?: JsonArray.DecodeOptions) =>
  Effect.flip(decodeChunks(chunks, options))

// Every way of splitting `text` into two chunks, plus one-character chunks.
const splits = (text: string): Array<Array<string>> => {
  const out: Array<Array<string>> = [[text], text.split("")]
  for (let i = 1; i < text.length; i++) out.push([text.slice(0, i), text.slice(i)])
  return out
}

const bytes = (text: string) => new TextEncoder().encode(text)

describe("JsonArray", () => {
  it.effect("agrees with JSON.parse across chunk boundaries", () =>
    Effect.gen(function*() {
      const valid = [
        " \t\r\n[] ",
        "[1, -2.5e+3, true, false, null]",
        "[\"[]{},:\\\"\", \"\\\\\", \"\\u00e9\\ud83d\\ude00\"]",
        "[{\"a\": [1, {\"b\": \"]}\"}]}, [[], {}]]",
        "\r\n[1,\r\n2\r]\n"
      ]
      const invalid = ["", "[1,]", "[1 2]", "[1true]", "[1", "[1]]", "[1]x", "[ 1]", "[\f1]"]
      for (const input of valid) {
        for (const chunks of splits(input)) {
          assert.deepStrictEqual(yield* decodeChunks(chunks), JSON.parse(input), JSON.stringify(chunks))
        }
      }
      for (const input of invalid) {
        assert.throws(() => JSON.parse(input))
        for (const chunks of splits(input)) {
          assert.strictEqual((yield* decodeError(chunks)).kind, "Syntax", JSON.stringify(chunks))
        }
      }
    }))

  describe("decodeString", () => {
    it.effect("emits one output chunk per input chunk", () =>
      Effect.gen(function*() {
        const chunks = yield* Stream.make("[1,2,", "3", ",4]").pipe(
          Stream.rechunk(1),
          Stream.pipeThroughChannel(JsonArray.decodeString()),
          Stream.chunks,
          Stream.runCollect
        )
        assert.deepStrictEqual(chunks, [[1, 2], [3, 4]])
      }))

    it.effect("strips a leading BOM", () =>
      Effect.gen(function*() {
        assert.deepStrictEqual(yield* decodeChunks(["\uFEFF", "[1]"]), [1])
        const error = yield* decodeError(["[1,\uFEFF2]"])
        assert.strictEqual(error.kind, "Syntax")
      }))

    it.effect("reports a UTF-16 offset across a chunk boundary", () =>
      Effect.gen(function*() {
        const error = yield* decodeError(["[\"😀\",", " {\"a\": x}]"])
        assert.deepStrictEqual([error.kind, error.offset], ["Syntax", 7])
        assert.instanceOf(error.cause, SyntaxError)
      }))

    it.effect("selects an array through an RFC 6901 pointer", () =>
      Effect.gen(function*() {
        const cases: ReadonlyArray<readonly [string, string, unknown]> = [
          ["{\"before\": 0, \"items\": [1, 2], \"after\": null}", "/items", [1, 2]],
          ["{\"a\": [0, {\"b\": [3]}]}", "/a/1/b", [3]],
          ["{\"a/b\": {\"m~n\": [true]}}", "/a~1b/m~0n", [true]],
          ["{\"\\u0061\": [1]}", "/a", [1]],
          ["{\"x\": 1, \"x\": 2, \"a\": [1]}", "/a", [1]]
        ]
        for (const [text, pointer, expected] of cases) {
          assert.deepStrictEqual(yield* decodeChunks(text.split(""), { pointer }), expected)
        }
      }))

    it.effect("rejects invalid pointers and malformed off-path values", () =>
      Effect.gen(function*() {
        for (
          const [text, pointer, kind] of [
            ["{\"a\": []}", "/b", "Pointer"],
            ["{\"a\": {}}", "/a", "Pointer"],
            ["{\"a\": 1}", "/a/b", "Pointer"],
            ["{\"a\": [], \"\\u0061\": []}", "/a", "Pointer"],
            ["{\"x\": [1,], \"a\": []}", "/a", "Syntax"],
            ["{\"a\": [1], \"x\": tru}", "/a", "Syntax"]
          ]
        ) {
          assert.strictEqual((yield* decodeError(text.split(""), { pointer })).kind, kind)
        }
      }))

    it.effect("bounds elements and off-path values without overflowing the stack", () =>
      Effect.gen(function*() {
        assert.deepStrictEqual(
          yield* decodeChunks(["[[1], \"abc\"]"], {
            maxDepth: 1,
            maxElementSize: 5
          }),
          [[1], "abc"]
        )
        const cases: ReadonlyArray<readonly [string, JsonArray.DecodeOptions]> = [
          ["[[[1]]]", { maxDepth: 1 }],
          ["{\"x\": [[1]], \"a\": []}", { pointer: "/a", maxDepth: 1 }],
          ["[\"abcde\"]", { maxElementSize: 6 }],
          ["{\"x\": \"abcde\", \"a\": []}", { pointer: "/a", maxElementSize: 6 }],
          ["[".repeat(100000), {}]
        ]
        for (const [text, options] of cases) {
          const error = yield* decodeError([text], options)
          assert.strictEqual(error.kind, "Limit")
          if (options.pointer) {
            assert.include(error.message, "Value outside the selected array at \"/x\"")
          }
        }
      }))

    it("rejects invalid options", () => {
      assert.throws(() => JsonArray.decodeString({ pointer: "a" }))
      assert.throws(() => JsonArray.decodeString({ pointer: "/a~2" }))
      assert.throws(() => JsonArray.decodeString({ maxDepth: -1 }))
      assert.throws(() => JsonArray.decodeString({ maxDepth: 1.5 }))
      assert.throws(() => JsonArray.decodeString({ maxElementSize: 0.5 }))
    })

    it.effect("passes through upstream failures and the done value", () =>
      Effect.gen(function*() {
        const error = yield* Stream.make("[1,").pipe(
          Stream.concat(Stream.fail("upstream")),
          Stream.pipeThroughChannel(JsonArray.decodeString()),
          Stream.runCollect,
          Effect.flip
        )
        assert.strictEqual(error, "upstream")
        const upstream = Channel.fromIterable((function*() {
          yield Arr.of("[1]")
          return "done"
        })())
        const done = yield* Channel.runDrain(Channel.pipeTo(upstream, JsonArray.decodeString()))
        assert.strictEqual(done, "done")
      }))
  })

  describe("decode", () => {
    it.effect("rejects truncated UTF-8 after a complete array at EOF", () =>
      Effect.gen(function*() {
        const error = yield* Stream.make(new Uint8Array([0x5b, 0x31, 0x5d, 0xc3])).pipe(
          Stream.pipeThroughChannel(JsonArray.decode()),
          Stream.runCollect,
          Effect.flip
        )
        assert.strictEqual(error.kind, "Syntax")
      }))

    it.effect("decodes UTF-8 split at every byte", () =>
      Effect.gen(function*() {
        const encoded = bytes("\uFEFF[\"é\", \"😀\", {\"ключ\": \"値\"}]")
        for (let i = 0; i <= encoded.length; i++) {
          const values = yield* Stream.make(encoded.slice(0, i), encoded.slice(i)).pipe(
            Stream.pipeThroughChannel(JsonArray.decode()),
            Stream.runCollect
          )
          assert.deepStrictEqual(values, ["é", "😀", { "ключ": "値" }])
        }
      }))
  })

  describe("encodeString", () => {
    it.effect("writes one JSON array", () =>
      Effect.gen(function*() {
        assert.strictEqual(
          yield* Stream.empty.pipe(Stream.pipeThroughChannel(JsonArray.encodeString()), Stream.mkString),
          "[]"
        )
        const chunks = yield* Stream.make(1, 2, 3).pipe(
          Stream.rechunk(2),
          Stream.pipeThroughChannel(JsonArray.encodeString()),
          Stream.runCollect
        )
        assert.deepStrictEqual(JSON.parse(chunks.join("")), [1, 2, 3])
      }))

    it.effect("fails for values without a JSON representation", () =>
      Effect.gen(function*() {
        for (const input of [undefined, () => {}, 1n]) {
          const error = yield* Stream.make(input).pipe(
            Stream.pipeThroughChannel(JsonArray.encodeString()),
            Stream.runCollect,
            Effect.flip
          )
          assert.isTrue(JsonArray.isJsonArrayError(error))
          assert.strictEqual(error.kind, "Encode")
          assert.isUndefined(error.offset)
          if (typeof input === "bigint") {
            assert.instanceOf(error.cause, TypeError)
          } else {
            assert.isUndefined(error.cause)
          }
        }
      }))
  })

  describe("schemas", () => {
    const Item = Schema.Struct({ id: Schema.Number, at: Schema.DateTimeUtcFromString })

    it.effect("decodeSchema decodes elements", () =>
      Effect.gen(function*() {
        const values = yield* Stream.make(bytes("{\"items\": [{\"id\": 1, \"at\": \"2024-01-01T00:00:00Z\"}]}")).pipe(
          Stream.pipeThroughChannel(JsonArray.decodeSchema(Item)({ pointer: "/items" })),
          Stream.runCollect
        )
        assert.strictEqual(values[0].id, 1)
        assert.strictEqual(values[0].at.epochMilliseconds, Date.UTC(2024, 0, 1))
      }))

    it.effect("decodeSchemaString fails with a SchemaError", () =>
      Effect.gen(function*() {
        const error = yield* Stream.make("[{\"id\": \"1\", \"at\": \"2024-01-01T00:00:00Z\"}]").pipe(
          Stream.pipeThroughChannel(JsonArray.decodeSchemaString(Item)()),
          Stream.runCollect,
          Effect.flip
        )
        assert.isTrue(Schema.isSchemaError(error))
      }))

    it.effect("encodeSchema round trips through decodeSchema", () =>
      Effect.gen(function*() {
        const value = { id: 1, at: (yield* Schema.decodeEffect(Item)({ id: 1, at: "2024-01-01T00:00:00Z" })).at }
        const text = yield* Stream.make(value).pipe(
          Stream.pipeThroughChannel(JsonArray.encodeSchemaString(Item)()),
          Stream.mkString
        )
        assert.strictEqual(text, "[{\"id\":1,\"at\":\"2024-01-01T00:00:00.000Z\"}]")
        const values = yield* Stream.make(value).pipe(
          Stream.pipeThroughChannel(JsonArray.encodeSchema(Item)()),
          Stream.pipeThroughChannel(JsonArray.decodeSchema(Item)()),
          Stream.runCollect
        )
        assert.deepStrictEqual(values, [value])
      }))
  })
})
