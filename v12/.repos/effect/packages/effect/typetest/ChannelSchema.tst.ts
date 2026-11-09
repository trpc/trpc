import { type Array, type Channel, ChannelSchema, Schema } from "effect"
import { expect, it } from "tstyche"

it("decodeUnknown accepts unknown input chunks", () => {
  const channel = ChannelSchema.decodeUnknown(Schema.NumberFromString)()

  expect(channel).type.toBe<
    Channel.Channel<
      Array.NonEmptyReadonlyArray<number>,
      Schema.SchemaError,
      unknown,
      Array.NonEmptyReadonlyArray<unknown>,
      never,
      unknown
    >
  >()
})

it("decode preserves the schema encoded input type", () => {
  const channel = ChannelSchema.decode(Schema.NumberFromString)()

  expect(channel).type.toBe<
    Channel.Channel<
      Array.NonEmptyReadonlyArray<number>,
      Schema.SchemaError,
      unknown,
      Array.NonEmptyReadonlyArray<string>,
      never,
      unknown
    >
  >()
})
