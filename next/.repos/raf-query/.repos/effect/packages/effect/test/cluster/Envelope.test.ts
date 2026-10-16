import { assert, describe, it } from "@effect/vitest"
import { Schema } from "effect"
import { EntityAddress, EntityId, EntityType, Envelope, Reply, ShardId, Snowflake } from "effect/cluster"
import { SchemaBinary } from "effect/encoding"
import { Headers } from "effect/http"

const request = {
  _tag: "Request",
  requestId: Snowflake.Snowflake(BigInt(1)),
  address: EntityAddress.make({
    shardId: ShardId.make("default", 1),
    entityType: EntityType.make("TestEntity"),
    entityId: EntityId.make("1")
  }),
  tag: "Test",
  payload: { id: 1 },
  headers: Headers.empty
} as Envelope.PartialRequest

describe("Envelope.OpaqueHole", () => {
  it("leaves the already-encoded payload untouched under the JSON codec", () => {
    const encoded = Schema.encodeSync(Envelope.PartialJson)(request) as Envelope.PartialRequestEncoded
    assert.deepStrictEqual(encoded.payload, { id: 1 })

    const decoded = Schema.decodeSync(Envelope.PartialJson)(encoded)
    assert.strictEqual(decoded._tag, "Request")
    assert.deepStrictEqual((decoded as Envelope.PartialRequest).payload, { id: 1 })
  })

  it("carries a non-JSON payload through the hole", () => {
    const bytes = Uint8Array.of(1, 2, 3)
    const encoded = Schema.encodeSync(Envelope.PartialJson)(
      { ...request, payload: bytes } as Envelope.PartialRequest
    ) as Envelope.PartialRequestEncoded
    assert.strictEqual(encoded.payload, bytes)
  })

  it("compiles the hole and Reply.Encoded as a bytes leaf under SchemaBinary", () => {
    const bytes = Uint8Array.of(1, 2, 3)
    const encodedBytes = Schema.encodeSync(SchemaBinary.toCodec(Schema.Uint8Array))(bytes)
    const encodedHole = Schema.encodeSync(SchemaBinary.toCodec(Envelope.OpaqueHole))(bytes)
    const encodedReply = Schema.encodeSync(SchemaBinary.toCodec(Reply.Encoded))(bytes as unknown as Reply.Encoded)

    assert.deepStrictEqual(encodedHole, encodedBytes)
    assert.deepStrictEqual(encodedReply, encodedBytes)
    assert.deepStrictEqual(Schema.decodeSync(SchemaBinary.toCodec(Envelope.OpaqueHole))(encodedHole), bytes)
    assert.deepStrictEqual(
      Schema.decodeSync(SchemaBinary.toCodec(Reply.Encoded))(encodedReply) as unknown,
      bytes
    )
  })

  it("reports non-byte OpaqueHole inputs as schema failures", () => {
    const encode = Schema.encodeUnknownSync(SchemaBinary.toCodec(Envelope.OpaqueHole))

    assert.throws(() => encode({ id: 1 }), /Uint8Array/)
  })
})
