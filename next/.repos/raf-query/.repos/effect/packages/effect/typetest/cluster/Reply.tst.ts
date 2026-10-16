import { Context, Effect, Schema, SchemaGetter } from "effect"
import { Reply } from "effect/cluster"
import { Rpc, RpcSerialization } from "effect/rpc"
import { describe, expect, it } from "tstyche"

class Decoder extends Context.Service<Decoder, number>()("ReplyTest/Decoder") {}

const success = Schema.Number.pipe(Schema.decodeTo(Schema.Number, {
  decode: SchemaGetter.transformEffect((value) => Effect.map(Decoder, (scale) => value * scale)),
  encode: SchemaGetter.passthrough()
}))
const rpc = Rpc.make("Decode", { payload: {}, success })

describe("Reply", () => {
  it("preserves reply decoding services in the transport codec", () => {
    const codec = Reply.Reply(rpc, RpcSerialization.json.codecFor)

    expect<typeof codec.DecodingServices>().type.toBe<Decoder>()
    expect<typeof codec.EncodingServices>().type.toBe<never>()
  })
})
