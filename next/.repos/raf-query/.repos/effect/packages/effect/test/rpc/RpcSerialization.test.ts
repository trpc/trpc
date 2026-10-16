import { afterEach, assert, describe, it } from "@effect/vitest"
import { Effect, Exit, Layer, Schema, Stream } from "effect"
import { SchemaBinary } from "effect/encoding"
import { HttpRouter } from "effect/http"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { Rpc, RpcClient, RpcGroup, type RpcMessage, RpcSchema, RpcSerialization, RpcServer } from "effect/rpc"

const responseExitSuccess = (requestId: string | number, value: unknown) => ({
  _tag: "Exit",
  requestId,
  exit: {
    _tag: "Success",
    value
  }
})

const objectPrototype = Object.prototype as Record<string, unknown>

const polluteObjectPrototype = (key: string, value: unknown) => {
  Object.defineProperty(objectPrototype, key, {
    configurable: true,
    value
  })
}

const decodeJsonRpcSuccess = () =>
  RpcSerialization.jsonRpc().makeUnsafe().decode("{\"jsonrpc\":\"2.0\",\"id\":1,\"result\":\"ok\"}")

const expectedJsonRpcSuccess = [{
  _tag: "Exit",
  requestId: 1,
  exit: {
    _tag: "Success",
    value: "ok"
  }
}]

const assertMaxBufferSizeExceeded = (f: () => unknown, maxBufferSize: number) => {
  try {
    f()
    assert.fail("Expected MaxBufferSizeExceeded")
  } catch (error) {
    assert.instanceOf(error, RpcSerialization.MaxBufferSizeExceeded)
    assert.strictEqual(error.maxBufferSize, maxBufferSize)
  }
}

// A hole codec that is observably different from `Schema.toCodecJson`: every
// hole is JSON-lowered and then written as a JSON string. Anything that still
// hardcodes `Schema.toCodecJson` fails to round-trip against it.
const codecForJsonString =
  (<S extends Schema.Top>(schema: S) =>
    Schema.fromJsonString(Schema.toCodecJson(schema as any))) as RpcSerialization.CodecFor

const serialization: RpcSerialization.RpcSerialization["Service"] = RpcSerialization.RpcSerialization.of({
  ...RpcSerialization.ndjson,
  codecFor: codecForJsonString
})

const layerSerialization = Layer.succeed(RpcSerialization.RpcSerialization)(serialization)

class EchoError extends Schema.Error<EchoError>("EchoError")({
  at: Schema.Date
}) {}

const Rpcs = RpcGroup.make(
  Rpc.make("Echo", { payload: { value: Schema.String }, success: Schema.String }),
  Rpc.make("Counts", { payload: { to: Schema.Number }, success: RpcSchema.Stream(Schema.Number, Schema.Never) }),
  Rpc.make("Fail", { payload: {}, success: Schema.Void, error: EchoError }),
  Rpc.make("Boom", { payload: {}, success: Schema.Void })
)

const failedAt = new Date(0)

const Handlers = Rpcs.toLayer({
  Echo: ({ value }) => Effect.succeed(`${value}!`),
  Counts: ({ to }) => Stream.range(1, to),
  Fail: () => Effect.fail(new EchoError({ at: failedAt })),
  Boom: () => Effect.die("boom")
})

const Server = RpcServer.layerHttp({
  group: Rpcs,
  path: "/rpc",
  protocol: "http"
}).pipe(
  Layer.provide(Handlers),
  Layer.provide(layerSerialization)
)

const makeClient = Effect.fnUntraced(function*() {
  const requests: Array<string> = []
  const { dispose, handler } = HttpRouter.toWebHandler(Server)
  yield* Effect.addFinalizer(() => Effect.promise(dispose))

  const httpClient = HttpClient.make((request) => {
    const raw = (request.body as any).body as Uint8Array | string
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw)
    requests.push(text)
    return Effect.map(
      Effect.promise(() => handler(new Request("http://test/rpc", { method: "POST", body: text }))),
      (response) => HttpClientResponse.fromWeb(request, response)
    )
  })

  const client = yield* RpcClient.make(Rpcs).pipe(
    Effect.provide(
      RpcClient.layerProtocolHttp({ url: "http://test/rpc" }).pipe(
        Layer.provide(layerSerialization),
        Layer.provide(Layer.succeed(HttpClient.HttpClient)(httpClient))
      )
    )
  )

  return { client, requests } as const
})

const BinaryServer = RpcServer.layerHttp({
  group: Rpcs,
  path: "/rpc",
  protocol: "http"
}).pipe(
  Layer.provide(Handlers),
  Layer.provide(RpcSerialization.layerSchemaBinary())
)

const makeBinaryClient = Effect.fnUntraced(function*() {
  const { dispose, handler } = HttpRouter.toWebHandler(BinaryServer)
  yield* Effect.addFinalizer(() => Effect.promise(dispose))

  const httpClient = HttpClient.make((request) => {
    const body = (request.body as any).body as Uint8Array
    return Effect.map(
      Effect.promise(() =>
        handler(new Request("http://test/rpc", { method: "POST", body: new Uint8Array(body).buffer }))
      ),
      (response) => HttpClientResponse.fromWeb(request, response)
    )
  })

  return yield* RpcClient.make(Rpcs).pipe(
    Effect.provide(
      RpcClient.layerProtocolHttp({ url: "http://test/rpc" }).pipe(
        Layer.provide(RpcSerialization.layerSchemaBinary()),
        Layer.provide(Layer.succeed(HttpClient.HttpClient)(httpClient))
      )
    )
  )
})

const uvarint = (value: number): Uint8Array => {
  const bytes: Array<number> = []
  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80)
    value = Math.floor(value / 0x80)
  }
  bytes.push(value)
  return Uint8Array.from(bytes)
}

describe("RpcSerialization", () => {
  for (
    const [name, serialization] of [
      ["jsonRpc", RpcSerialization.jsonRpc()],
      ["ndJsonRpc", RpcSerialization.ndJsonRpc()]
    ] as const
  ) {
    describe(`${name} cause roundtrips`, () => {
      const failure = { _tag: "Fail", error: { code: -32021, message: "Missing capability" } } as const
      const defect = { _tag: "Die", defect: { message: "boom" } } as const
      const interrupt = { _tag: "Interrupt", fiberId: 42 } as const

      it.each(
        [
          ["typed failure", [failure]],
          ["defect", [defect]],
          ["interruption", [interrupt]],
          ["mixed causes", [failure, defect, interrupt]],
          ["empty cause", []]
        ] as const
      )("preserves %s", (_name, cause) => {
        const response: RpcMessage.ResponseExitEncoded = {
          _tag: "Exit",
          requestId: 1,
          exit: { _tag: "Failure", cause }
        }
        const encoded = serialization.makeUnsafe().encode(response)
        assert.isDefined(encoded)
        assert.deepStrictEqual(serialization.makeUnsafe().decode(encoded!), [response])
      })

      it("preserves a protocol defect", () => {
        const response: RpcMessage.ResponseDefectEncoded = {
          _tag: "Defect",
          defect: { message: "protocol failed" }
        }
        const encoded = serialization.makeUnsafe().encode(response)
        assert.isDefined(encoded)
        assert.deepStrictEqual(serialization.makeUnsafe().decode(encoded!), [response])
      })
    })
  }

  it.each(
    [
      ["Ack", 0],
      ["Ack", ""],
      ["Interrupt", 0],
      ["Interrupt", ""]
    ] as const
  )("jsonRpc preserves %s requestId %j", (_tag, requestId) => {
    const parser = RpcSerialization.jsonRpc().makeUnsafe()
    const encoded = JSON.stringify({
      jsonrpc: "2.0",
      method: `@effect/rpc/${_tag}`,
      params: { requestId }
    })

    assert.deepStrictEqual(parser.decode(encoded), [{ _tag, requestId }])
  })

  describe("jsonRpc inherited properties", { concurrent: false }, () => {
    afterEach(() => {
      delete objectPrototype["method"]
      delete objectPrototype["error"]
      delete objectPrototype["chunk"]
    })

    it("decodes a success response with a clean prototype", () => {
      assert.deepStrictEqual(decodeJsonRpcSuccess(), expectedJsonRpcSuccess)
    })

    it("ignores an inherited method", () => {
      polluteObjectPrototype("method", "attacker.evil")
      assert.deepStrictEqual(decodeJsonRpcSuccess(), expectedJsonRpcSuccess)
    })

    it("ignores an inherited defect error", () => {
      polluteObjectPrototype("error", { _tag: "Defect", data: "pwn" })
      assert.deepStrictEqual(decodeJsonRpcSuccess(), expectedJsonRpcSuccess)
    })

    it("ignores an inherited chunk marker", () => {
      polluteObjectPrototype("chunk", true)
      assert.deepStrictEqual(decodeJsonRpcSuccess(), expectedJsonRpcSuccess)
    })

    it("ignores an inherited exit error", () => {
      polluteObjectPrototype("error", { _tag: "Cause", data: [] })
      assert.deepStrictEqual(decodeJsonRpcSuccess(), expectedJsonRpcSuccess)
    })
  })

  it("json decode keeps array payloads flat", () => {
    const parser = RpcSerialization.json.makeUnsafe()
    const decoded = parser.decode("[1,2,3]")
    assert.strictEqual(decoded.length, 3)
    assert.deepStrictEqual(decoded, [1, 2, 3])
  })

  it("json decode wraps non-array payloads", () => {
    const parser = RpcSerialization.json.makeUnsafe()
    const decoded = parser.decode("{\"a\":1}")
    assert.strictEqual(decoded.length, 1)
    assert.deepStrictEqual(decoded, [{ a: 1 }])
  })

  it("ndjson fails when an unterminated frame exceeds maxBufferSize", () => {
    const parser = RpcSerialization.makeNdjson({ maxBufferSize: 4 }).makeUnsafe()

    assert.deepStrictEqual(parser.decode("12"), [])
    assert.deepStrictEqual(parser.decode("34"), [])
    assertMaxBufferSizeExceeded(() => parser.decode("5"), 4)
  })

  it("ndjson allows an unbounded incomplete frame", () => {
    const parser = RpcSerialization.makeNdjson({ maxBufferSize: "unbounded" }).makeUnsafe()

    assert.deepStrictEqual(parser.decode("x".repeat(1024)), [])
  })

  it("ndjson decodes a multibyte character split across byte chunks", () => {
    const parser = RpcSerialization.ndjson.makeUnsafe()
    const message = { value: "\u20ac" }
    const encoded = parser.encode(message)
    assert(typeof encoded === "string")
    const bytes = new TextEncoder().encode(encoded)
    const split = bytes.indexOf(0xe2) + 1

    assert.deepStrictEqual(parser.decode(bytes.slice(0, split)), [])
    assert.deepStrictEqual(parser.decode(bytes.slice(split)), [message])
  })

  it("ndjson skips lines that are not JSON and keeps decoding", () => {
    const parser = RpcSerialization.ndjson.makeUnsafe()

    assert.deepStrictEqual(parser.decode("{\"id\":1}\nnot json\n{\"id\":2}\n"), [{ id: 1 }, { id: 2 }])
    assert.deepStrictEqual(parser.decode("{\"id\":4}\n"), [{ id: 4 }])
  })

  it.effect("layerNdjsonWith forwards maxBufferSize to its decoder", () =>
    Effect.gen(function*() {
      const serialization = yield* RpcSerialization.RpcSerialization
      const parser = serialization.makeUnsafe()

      assert.deepStrictEqual(parser.decode("12"), [])
      assert.deepStrictEqual(parser.decode("34"), [])
      assertMaxBufferSizeExceeded(() => parser.decode("5"), 4)
    }).pipe(
      Effect.provide(RpcSerialization.layerNdjsonWith({ maxBufferSize: 4 }))
    ))

  it("ndJsonRpc forwards maxBufferSize to its ndjson framing parser", () => {
    const parser = RpcSerialization.ndJsonRpc({ maxBufferSize: 4 }).makeUnsafe()

    assert.deepStrictEqual(parser.decode("12"), [])
    assert.deepStrictEqual(parser.decode("34"), [])
    assert.throws(() => parser.decode("5"), RpcSerialization.MaxBufferSizeExceeded)
  })

  it("jsonRpc encodes a non-batched single response array as an object", () => {
    const parser = RpcSerialization.jsonRpc().makeUnsafe()
    const decoded = parser.decode("{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"users.get\"}")
    assert.strictEqual(decoded.length, 1)

    const encoded = parser.encode([responseExitSuccess("1", { id: 1 })])
    assert(encoded !== undefined)

    const message = JSON.parse(encoded as string)
    assert.strictEqual(Array.isArray(message), false)
    assert.deepStrictEqual(message, {
      jsonrpc: "2.0",
      id: "1",
      result: {
        id: 1
      }
    })
  })

  it("jsonRpc encodes batched responses as an array", () => {
    const parser = RpcSerialization.jsonRpc().makeUnsafe()
    const decoded = parser.decode(
      "[{\"jsonrpc\":\"2.0\",\"id\":\"1\",\"method\":\"users.get\"},{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"users.list\"}]"
    )
    assert.strictEqual(decoded.length, 2)

    const encoded = parser.encode([
      responseExitSuccess("1", "one"),
      responseExitSuccess(2, "two")
    ])
    console.log(encoded)
    assert(encoded !== undefined)

    const message = JSON.parse(encoded as string)
    assert.strictEqual(Array.isArray(message), true)
    assert.deepStrictEqual(message, [
      {
        jsonrpc: "2.0",
        id: "1",
        result: "one"
      },
      {
        jsonrpc: "2.0",
        id: 2,
        result: "two"
      }
    ])
  })

  it("jsonRpc preserves id 0 across decode and encode", () => {
    const parser = RpcSerialization.jsonRpc().makeUnsafe()
    const decoded = parser.decode("{\"jsonrpc\":\"2.0\",\"id\":0,\"method\":\"users.get\"}")
    assert.deepStrictEqual(decoded, [{
      _tag: "Request",
      id: 0,
      tag: "users.get",
      payload: null,
      headers: []
    }])

    const encoded = parser.encode({
      _tag: "Request",
      id: 0,
      tag: "users.get",
      payload: null,
      headers: []
    })
    assert.strictEqual(
      encoded,
      "{\"jsonrpc\":\"2.0\",\"method\":\"users.get\",\"params\":null,\"id\":0}"
    )
  })

  it("jsonRpc maps null id to internal notification sentinel", () => {
    const parser = RpcSerialization.jsonRpc().makeUnsafe()
    const decoded = parser.decode("{\"jsonrpc\":\"2.0\",\"id\":null,\"method\":\"users.get\"}")
    assert.deepStrictEqual(decoded, [{
      _tag: "Request",
      id: "",
      tag: "users.get",
      payload: null,
      headers: []
    }])
  })

  it("jsonRpc skips non-objects in a batch without losing requests", () => {
    const parser = RpcSerialization.jsonRpc().makeUnsafe()

    assert.deepStrictEqual(parser.decode("null"), [])
    assert.deepStrictEqual(parser.decode("7"), [])
    assert.deepStrictEqual(
      parser.decode(
        "[null,{\"jsonrpc\":\"2.0\",\"method\":1},{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"users.get\"}]"
      ),
      [{
        _tag: "Request",
        id: "",
        tag: 1,
        isNotification: true,
        payload: null,
        headers: []
      }, {
        _tag: "Request",
        id: 2,
        tag: "users.get",
        payload: null,
        headers: []
      }]
    )
  })

  it("ndJsonRpc keeps requests that share a chunk with a value that is not a message", () => {
    const parser = RpcSerialization.ndJsonRpc().makeUnsafe()

    assert.deepStrictEqual(parser.decode("null\n{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"users.get\"}\n"), [{
      _tag: "Request",
      id: 2,
      tag: "users.get",
      payload: null,
      headers: []
    }])
  })

  it("jsonRpc preserves empty string id across decode and encode", () => {
    const parser = RpcSerialization.jsonRpc().makeUnsafe()
    const decoded = parser.decode("{\"jsonrpc\":\"2.0\",\"id\":\"\",\"method\":\"users.get\"}")
    assert.deepStrictEqual(decoded, [{
      _tag: "Request",
      id: "",
      tag: "users.get",
      payload: null,
      headers: []
    }])

    const encoded = parser.encode({
      _tag: "Request",
      id: "",
      tag: "users.get",
      payload: null,
      headers: []
    })
    assert.strictEqual(
      encoded,
      "{\"jsonrpc\":\"2.0\",\"method\":\"users.get\",\"params\":null,\"id\":\"\"}"
    )
  })

  it("jsonRpc decodes standard error objects as typed failures", () => {
    const parser = RpcSerialization.jsonRpc().makeUnsafe()
    const error = { code: -32021, message: "Missing capability", data: { requiredCapabilities: {} } }

    assert.deepStrictEqual(
      parser.decode(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        error
      })),
      [{
        _tag: "Exit",
        requestId: 1,
        exit: {
          _tag: "Failure",
          cause: [{ _tag: "Fail", error }]
        }
      }]
    )
  })

  it("jsonRpc encodes a notification without an id", () => {
    const parser = RpcSerialization.jsonRpc().makeUnsafe()
    const decoded = parser.decode("{\"jsonrpc\":\"2.0\",\"method\":\"notifications/message\"}")
    assert.deepStrictEqual(decoded, [{
      _tag: "Request",
      id: "",
      tag: "notifications/message",
      payload: null,
      headers: [],
      isNotification: true
    }])

    const encoded = parser.encode({
      _tag: "Request",
      id: "",
      tag: "notifications/message",
      payload: { level: "info" },
      headers: [["x-test", "value"]],
      traceId: "trace",
      spanId: "span",
      sampled: true,
      isNotification: true
    })
    assert.strictEqual(
      encoded,
      "{\"jsonrpc\":\"2.0\",\"method\":\"notifications/message\",\"params\":{\"level\":\"info\"},\"headers\":[[\"x-test\",\"value\"]],\"traceId\":\"trace\",\"spanId\":\"span\",\"sampled\":true}"
    )
  })

  describe("SchemaBinary", () => {
    it.effect("roundtrips requests and streamed responses over HTTP", () =>
      Effect.gen(function*() {
        const client = yield* makeBinaryClient()

        assert.strictEqual(yield* client.Echo({ value: "hi" }), "hi!")
        assert.deepStrictEqual(yield* Stream.runCollect(client.Counts({ to: 3 })), [1, 2, 3])

        const error = yield* Effect.flip(client.Fail({}))
        assert.instanceOf(error, EchoError)
        assert.strictEqual(error.at.getTime(), failedAt.getTime())

        const exit = yield* Effect.exit(client.Boom({}))
        assert(Exit.isFailure(exit))
        assert.include(String(exit.cause), "boom")
      }))

    it.effect("fingerprints envelopes", () =>
      Effect.gen(function*() {
        const serialization = yield* RpcSerialization.RpcSerialization
        const parser = serialization.makeUnsafe()
        const incompatibleEnvelope = Schema.Struct({
          _tag: Schema.tag("Request"),
          id: Schema.Union([Schema.String, Schema.Number]),
          tag: Schema.String,
          payload: Schema.Uint8Array,
          headers: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
          added: Schema.optional(Schema.String)
        })
        const frame = Schema.encodeSync(SchemaBinary.toCodec(incompatibleEnvelope, { fingerprint: true }))({
          _tag: "Request",
          id: 1,
          tag: "Echo",
          payload: Uint8Array.of(1),
          headers: []
        })

        assert.throws(() => parser.decode(frame), /matching layout fingerprint/)
      }).pipe(Effect.provide(RpcSerialization.layerSchemaBinary())))

    it.effect("does not fingerprint payloads by default", () =>
      Effect.gen(function*() {
        const serialization = yield* RpcSerialization.RpcSerialization
        const Writer = Schema.Struct({
          value: Schema.String,
          added: Schema.optional(Schema.String)
        })
        const Reader = Schema.Struct({ value: Schema.String })
        const encoded = Schema.encodeSync(serialization.codecFor(Writer))({ value: "ok", added: "new" })

        assert.instanceOf(encoded, Uint8Array)
        assert.deepStrictEqual(Schema.decodeSync(serialization.codecFor(Reader))(encoded), { value: "ok" })
      }).pipe(Effect.provide(RpcSerialization.layerSchemaBinary())))

    it.effect("layerSchemaBinary fingerprints payloads when enabled", () =>
      Effect.gen(function*() {
        const serialization = yield* RpcSerialization.RpcSerialization
        const Writer = Schema.Struct({ value: Schema.String })
        const Reader = Schema.Struct({ value: Schema.Number })
        const encoded = Schema.encodeSync(serialization.codecFor(Writer))({ value: "ok" })

        assert.deepStrictEqual(Schema.decodeSync(serialization.codecFor(Writer))(encoded), { value: "ok" })
        assert.throws(
          () => Schema.decodeSync(serialization.codecFor(Reader))(encoded),
          /matching layout fingerprint/
        )
      }).pipe(Effect.provide(RpcSerialization.layerSchemaBinary({ fingerprintPayloads: true }))))

    it.effect("uses fingerprinted envelope framing and the binary content type", () =>
      Effect.gen(function*() {
        const serialization = yield* RpcSerialization.RpcSerialization
        const parser = serialization.makeUnsafe()
        const request: RpcMessage.RequestEncoded = {
          _tag: "Request",
          id: 1,
          tag: "Echo",
          payload: Uint8Array.of(1, 2, 3),
          headers: []
        }
        const frame = parser.encode(request)

        assert.strictEqual(serialization.contentType, "application/vnd.effect.rpc+schema-binary")
        assert.strictEqual(serialization.includesFraming, true)
        assert.instanceOf(frame, Uint8Array)
        assert.deepStrictEqual(parser.decode(frame), [request])
      }).pipe(Effect.provide(RpcSerialization.layerSchemaBinary())))

    it.effect("keeps varied frames decodable across parser replacement", () =>
      Effect.gen(function*() {
        const serialization = yield* RpcSerialization.RpcSerialization
        const encoder = serialization.makeUnsafe()
        const requests: Array<RpcMessage.RequestEncoded> = Array.from({ length: 200 }, (_, index) => ({
          _tag: "Request",
          id: index % 2 === 0 ? index : `request-${index}`,
          tag: `Echo${index % 7}`,
          payload: Uint8Array.from({ length: index % 17 }, (_, offset) => (index + offset) & 0xFF),
          headers: Array.from({ length: index % 4 }, (_, offset) => [`x-${offset}`, `${index}`]),
          ...(index % 3 === 0
            ? { traceId: `trace-${index}`, spanId: `span-${index}`, sampled: index % 2 === 0 }
            : undefined)
        }))

        for (const request of requests) {
          const frame = encoder.encode(request)
          assert.instanceOf(frame, Uint8Array)
          const split = 1 + request.tag.length % (frame.length - 1)
          const parser = serialization.makeUnsafe()
          assert.deepStrictEqual(parser.decode(frame.subarray(0, split)), [])
          assert.deepStrictEqual(parser.decode(frame.subarray(split)), [request])
        }
      }).pipe(Effect.provide(RpcSerialization.layerSchemaBinary())))

    it.effect("owns encoded frames without copying envelope holes", () =>
      Effect.gen(function*() {
        const serialization = yield* RpcSerialization.RpcSerialization
        const encoder = serialization.makeUnsafe()
        const payload = Uint8Array.of(1, 2, 3)
        const request: RpcMessage.RequestEncoded = {
          _tag: "Request",
          id: 1,
          tag: "Echo",
          payload,
          headers: []
        }
        const frame = encoder.encode(request)
        assert(frame instanceof Uint8Array)
        const expected = frame.slice()

        payload.fill(9)
        for (let i = 0; i < 1_000; i++) encoder.encode({ ...request, id: i })

        assert.deepStrictEqual(frame, expected)
        assert.deepStrictEqual(serialization.makeUnsafe().decode(frame), [{
          ...request,
          payload: Uint8Array.of(1, 2, 3)
        }])
      }).pipe(Effect.provide(RpcSerialization.layerSchemaBinary())))

    it.effect("defaults maxFrameSize to 16 MiB", () =>
      Effect.gen(function*() {
        const serialization = yield* RpcSerialization.RpcSerialization
        assert.deepStrictEqual(serialization.makeUnsafe().decode(uvarint(16 * 1024 * 1024)), [])
        assert.throws(
          () => serialization.makeUnsafe().decode(uvarint(16 * 1024 * 1024 + 1)),
          /frame within maxFrameSize/
        )
      }).pipe(Effect.provide(RpcSerialization.layerSchemaBinary())))

    it.effect("layerSchemaBinary overrides maxFrameSize", () =>
      Effect.gen(function*() {
        const serialization = yield* RpcSerialization.RpcSerialization
        assert.deepStrictEqual(serialization.makeUnsafe().decode(uvarint(4)), [])
        assert.throws(() => serialization.makeUnsafe().decode(uvarint(5)), /frame within maxFrameSize/)
      }).pipe(Effect.provide(RpcSerialization.layerSchemaBinary({ maxFrameSize: 4 }))))

    it.effect("layerSchemaBinary allows an unbounded maxFrameSize", () =>
      Effect.gen(function*() {
        const serialization = yield* RpcSerialization.RpcSerialization
        assert.deepStrictEqual(serialization.makeUnsafe().decode(uvarint(16 * 1024 * 1024 + 1)), [])
      }).pipe(Effect.provide(RpcSerialization.layerSchemaBinary({ maxFrameSize: "unbounded" }))))
  })

  describe("codecFor", () => {
    it("text serializations JSON-lower the hole", () => {
      const encode = Schema.encodeSync(RpcSerialization.json.codecFor(Schema.Date))
      assert.strictEqual(encode(new Date(0)), "1970-01-01T00:00:00.000Z")
      assert.strictEqual(RpcSerialization.ndjson.codecFor, RpcSerialization.json.codecFor)
      assert.strictEqual(RpcSerialization.jsonRpc().codecFor, RpcSerialization.json.codecFor)
    })

    it.effect("fills the request payload hole with the serialization's codec", () =>
      Effect.gen(function*() {
        const { client, requests } = yield* makeClient()

        assert.strictEqual(yield* client.Echo({ value: "hi" }), "hi!")

        assert.strictEqual(requests.length, 1)
        const frame = JSON.parse(requests[0])
        assert.strictEqual(typeof frame.payload, "string", "the payload hole must carry the codec's output")
        assert.deepStrictEqual(JSON.parse(frame.payload), { value: "hi" })
      }))

    it.effect("fills the stream chunk holes with the serialization's codec", () =>
      Effect.gen(function*() {
        const { client } = yield* makeClient()

        assert.deepStrictEqual(yield* Stream.runCollect(client.Counts({ to: 3 })), [1, 2, 3])
      }))

    it.effect("fills the exit hole with the serialization's codec", () =>
      Effect.gen(function*() {
        const { client } = yield* makeClient()

        const error = yield* Effect.flip(client.Fail({}))
        assert.instanceOf(error, EchoError)
        assert.strictEqual(error.at.getTime(), failedAt.getTime())
      }))

    it.effect("fills the defect hole with the serialization's codec", () =>
      Effect.gen(function*() {
        const { client } = yield* makeClient()

        const exit = yield* Effect.exit(client.Boom({}))
        if (Exit.isSuccess(exit)) {
          return assert.fail("expected the handler defect to reach the client")
        }
        assert.include(String(exit.cause), "boom")
      }))
  })
})
