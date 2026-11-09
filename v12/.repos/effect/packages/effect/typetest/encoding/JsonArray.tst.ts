import { Context, Effect, Schema, SchemaGetter, Stream } from "effect"
import * as JsonArray from "effect/encoding/JsonArray"
import { describe, expect, it } from "tstyche"

class Decoding extends Context.Service<Decoding, string>()("Decoding") {}
class Encoding extends Context.Service<Encoding, string>()("Encoding") {}

const Item = Schema.Struct({
  id: Schema.NumberFromString.pipe(Schema.decode({
    decode: SchemaGetter.checkEffect(() => Effect.as(Decoding, true)),
    encode: SchemaGetter.checkEffect(() => Effect.as(Encoding, true))
  }))
})

describe("JsonArray", () => {
  it("decodeSchema keeps upstream errors and decoding services", () => {
    const stream = Stream.fail("FooBar") as Stream.Stream<Uint8Array, string>

    const decoded = stream.pipe(Stream.pipeThroughChannel(JsonArray.decodeSchema(Item)({ pointer: "/items" })))

    expect(decoded).type.toBe<
      Stream.Stream<{ readonly id: number }, string | Schema.SchemaError | JsonArray.JsonArrayError, Decoding>
    >()
  })

  it("encodeSchemaString requires encoding services", () => {
    const encoded = Stream.make({ id: 1 }).pipe(Stream.pipeThroughChannel(JsonArray.encodeSchemaString(Item)()))

    expect(encoded).type.toBe<Stream.Stream<string, Schema.SchemaError | JsonArray.JsonArrayError, Encoding>>()
  })
})
