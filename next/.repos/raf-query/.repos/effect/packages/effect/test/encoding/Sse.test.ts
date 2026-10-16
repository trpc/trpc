import { assert, describe, it } from "@effect/vitest"
import { Effect, Stream } from "effect"
import * as Sse from "effect/encoding/Sse"
import * as Schema from "effect/Schema"

describe("Sse", () => {
  it("parses mixed CRLF and LF line endings", () => {
    const events: Array<Sse.AnyEvent> = []
    const parser = Sse.makeParser((event) => events.push(event))

    parser.feed("data: first\r\ndata: second\n\n")

    assert.deepStrictEqual(events, [{
      _tag: "Event",
      event: "message",
      id: undefined,
      data: "first\nsecond"
    }])
  })

  it("treats CRLF split across chunks as one line ending", () => {
    const events: Array<Sse.AnyEvent> = []
    const parser = Sse.makeParser((event) => events.push(event))

    parser.feed("data: first\r")
    parser.feed("\ndata: second\n\n")

    assert.deepStrictEqual(events, [{
      _tag: "Event",
      event: "message",
      id: undefined,
      data: "first\nsecond"
    }])
  })

  it("retains the last event ID for later events", () => {
    const events: Array<Sse.AnyEvent> = []
    const parser = Sse.makeParser((event) => events.push(event))

    parser.feed("id: 1\ndata: first\n\ndata: second\n\n")

    assert.deepStrictEqual(events, [
      {
        _tag: "Event",
        id: "1",
        event: "message",
        data: "first"
      },
      {
        _tag: "Event",
        id: "1",
        event: "message",
        data: "second"
      }
    ])
  })

  it("roundtrips an SSE event with empty data", () => {
    const input: Sse.Event = { _tag: "Event", event: "message", id: undefined, data: "" }
    const events: Array<Sse.AnyEvent> = []
    const parser = Sse.makeParser((event) => events.push(event))

    parser.feed(Sse.encoder.write(input))

    assert.deepStrictEqual(events, [input])
  })

  it("strips a UTF-8 BOM from the start of an SSE stream", () => {
    const events: Array<Sse.AnyEvent> = []
    const parser = Sse.makeParser((event) => events.push(event))

    parser.feed("\uFEFFdata: ok\n\n")

    assert.deepStrictEqual(events, [{
      _tag: "Event",
      event: "message",
      id: undefined,
      data: "ok"
    }])
  })

  it("uses message for an empty SSE event type", () => {
    const events: Array<Sse.AnyEvent> = []
    const parser = Sse.makeParser((event) => events.push(event))

    parser.feed("event:\ndata: ok\n\n")

    assert.strictEqual(events.length, 1)
    assert.strictEqual((events[0] as Sse.Event).event, "message")
  })

  it("ignores retry values that are not ASCII digits", () => {
    const events: Array<Sse.AnyEvent> = []
    for (const value of ["123x", "+123", "-123", "1.5"]) {
      Sse.makeParser((event) => events.push(event)).feed(`retry: ${value}\n`)
    }

    assert.deepStrictEqual(events, [])
  })

  it("Event preserves string payloads", () => {
    const decode = Schema.decodeUnknownSync(Sse.Event)
    const encode = Schema.encodeSync(Sse.Event)

    const event = decode({
      _tag: "Event",
      event: "message",
      id: undefined,
      data: "{\"type\":\"ok\"}"
    })

    assert.strictEqual(event.data, "{\"type\":\"ok\"}")
    assert.deepStrictEqual(encode(event), {
      _tag: "Event",
      event: "message",
      id: undefined,
      data: "{\"type\":\"ok\"}"
    })
  })

  it("EventEncoded consumers can explicitly decode json payloads", () => {
    const EventWithJsonPayload = Schema.Struct({
      ...Sse.EventEncoded.fields,
      data: Schema.fromJsonString(Schema.Struct({
        type: Schema.String
      }))
    })
    const decode = Schema.decodeUnknownSync(EventWithJsonPayload)

    const event = decode({
      event: "message",
      id: undefined,
      data: "{\"type\":\"ok\"}"
    })

    assert.deepStrictEqual(event.data, { type: "ok" })
  })

  it.effect("decodeDataSchema decodes json payload from SSE stream", () =>
    Effect.gen(function*() {
      const events = yield* Stream.make(
        "event: message\ndata: {\"type\":\"ok\"}\n\n"
      ).pipe(
        Stream.pipeThroughChannel(Sse.decodeDataSchema(Schema.Struct({ type: Schema.String }))),
        Stream.runCollect
      )

      assert.deepStrictEqual([...events], [{
        event: "message",
        id: undefined,
        data: {
          type: "ok"
        }
      }])
    }))

  it.effect("fails when an unterminated line exceeds maxEventSize", () =>
    Effect.gen(function*() {
      const error = yield* Stream.make("12345").pipe(
        Stream.pipeThroughChannel(Sse.decode({ maxEventSize: 4 })),
        Stream.runCollect,
        Effect.flip
      )

      assert.instanceOf(error, Sse.SseError)
      assert.instanceOf(error.reason, Sse.EventTooLarge)
      assert.strictEqual(error.reason.maxEventSize, 4)
    }))

  it.effect("fails when pending data exceeds maxEventSize", () =>
    Effect.gen(function*() {
      const error = yield* Stream.make("data: a\n", "data: b\n").pipe(
        Stream.pipeThroughChannel(Sse.decode({ maxEventSize: 3 })),
        Stream.runCollect,
        Effect.flip
      )

      assert.instanceOf(error, Sse.SseError)
      assert.instanceOf(error.reason, Sse.EventTooLarge)
      assert.strictEqual(error.reason.maxEventSize, 3)
    }))

  it.effect("parses pending state just under maxEventSize", () =>
    Effect.gen(function*() {
      const events = yield* Stream.make("data: a\ndata: b", "\n\n").pipe(
        Stream.pipeThroughChannel(Sse.decode({ maxEventSize: 10 })),
        Stream.runCollect
      )

      assert.deepStrictEqual([...events], [{
        _tag: "Event",
        event: "message",
        id: undefined,
        data: "a\nb"
      }])
    }))

  it.effect("parses well-formed events split across chunks", () =>
    Effect.gen(function*() {
      const events = yield* Stream.make(
        "id: 1\nevent: up",
        "date\ndata: hel",
        "lo\n",
        "\n"
      ).pipe(
        Stream.pipeThroughChannel(Sse.decode()),
        Stream.runCollect
      )

      assert.deepStrictEqual([...events], [{
        _tag: "Event",
        event: "update",
        id: "1",
        data: "hello"
      }])
    }))
})
