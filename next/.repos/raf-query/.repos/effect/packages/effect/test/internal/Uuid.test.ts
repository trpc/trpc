import { assert, describe, it } from "@effect/vitest"
import * as Uuid from "effect/internal/uuid"

const bytes = () => Uint8Array.from({ length: 16 }, (_, i) => i)

describe("Uuid", () => {
  it("stringifies UUID bytes", () => {
    assert.strictEqual(Uuid.stringify(bytes()), "00010203-0405-0607-0809-0a0b0c0d0e0f")
  })

  it("generates UUID v4 bytes and strings", () => {
    assert.deepStrictEqual(
      Uuid.v4Bytes(bytes()),
      Uint8Array.of(0, 1, 2, 3, 4, 5, 0x46, 7, 0x88, 9, 10, 11, 12, 13, 14, 15)
    )
    assert.strictEqual(Uuid.v4String(bytes()), "00010203-0405-4607-8809-0a0b0c0d0e0f")
  })

  it("generates UUID v7 bytes and strings", () => {
    assert.deepStrictEqual(
      Uuid.v7Bytes(0x0123456789ab, bytes()),
      Uint8Array.of(1, 0x23, 0x45, 0x67, 0x89, 0xab, 0x76, 7, 0x88, 9, 10, 11, 12, 13, 14, 15)
    )
    assert.strictEqual(Uuid.v7String(0x0123456789ab, bytes()), "01234567-89ab-7607-8809-0a0b0c0d0e0f")
  })
})
