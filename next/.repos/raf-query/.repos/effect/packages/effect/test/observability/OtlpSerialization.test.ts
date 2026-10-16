import { assert, describe, it } from "@effect/vitest"
import { encodeAnyValue } from "effect/observability/internal/otlpProtobuf"

describe("OtlpSerialization", () => {
  it("encodes a negative protobuf int64 as a ten-byte varint", () => {
    const encoded = encodeAnyValue({ intValue: -1 })
    assert.strictEqual(encoded.length, 11)
    assert.deepStrictEqual(Array.from(encoded), [0x18, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01])
  })
})
