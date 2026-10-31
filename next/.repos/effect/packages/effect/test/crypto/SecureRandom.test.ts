import { assert, describe, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as SecureRandom from "effect/crypto/SecureRandom"
import * as WebCrypto from "effect/crypto/WebCrypto"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as TestClock from "effect/testing/TestClock"

const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const uuidV7Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/

// Returns 0, 1, 2, ... for every request.
const counting = SecureRandom.make((size) => Uint8Array.from({ length: size }, (_, i) => i & 0xff))

const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
const uuidString = (bytes: Uint8Array) => hex(bytes).replace(/^(.{8})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4-")
const isStrictlyIncreasing = (ids: ReadonlyArray<string>) => ids.every((id, i) => i === 0 || ids[i - 1] < id)

const assertDies = <A>(exit: Exit.Exit<A>) => assert.isTrue(Exit.isFailure(exit) && Cause.hasDies(exit.cause))

describe("SecureRandom", () => {
  it.effect("builds the identifiers from randomBytes and the Clock", () =>
    Effect.gen(function*() {
      yield* TestClock.setTime(0x0123456789ab)
      const random = yield* SecureRandom.SecureRandom
      assert.deepStrictEqual(yield* random.randomBytes(4), Uint8Array.of(0, 1, 2, 3))
      assert.strictEqual(yield* random.uuidV4(), "00010203-0405-4607-8809-0a0b0c0d0e0f")
      assert.deepStrictEqual(
        yield* random.uuidV4({ format: "bytes" }),
        Uint8Array.of(0, 1, 2, 3, 4, 5, 0x46, 7, 0x88, 9, 10, 11, 12, 13, 14, 15)
      )
      const uuidV7 = yield* random.uuidV7()
      assert.match(uuidV7, uuidV7Regex)
      assert.isTrue(uuidV7.startsWith("01234567-89ab-7"))
      assert.strictEqual((yield* random.uuidV7({ format: "bytes" })).length, 16)
      const ulid = yield* random.ulid
      assert.match(ulid, ulidRegex)
      assert.isTrue(ulid.startsWith("014D2PF2DB"))
    }).pipe(Effect.provideService(SecureRandom.SecureRandom, counting)))

  it.effect("uuidV7 and ulid increase strictly per instance, even when the Clock moves back", () =>
    Effect.gen(function*() {
      // Puts wall-clock time into the state shared by the *Unsafe functions.
      SecureRandom.uuidV7Unsafe()
      SecureRandom.ulidUnsafe()
      const make = () => SecureRandom.make((size) => Uint8Array.from({ length: size }, (_, i) => i & 0xff))
      const random = make()
      yield* TestClock.setTime(1000)
      const uuids: Array<string> = []
      const ulids: Array<string> = []
      for (let i = 0; i < 2000; i++) {
        if (i === 1000) yield* TestClock.setTime(500)
        uuids.push(yield* random.uuidV7(), uuidString(yield* random.uuidV7({ format: "bytes" })))
        ulids.push(yield* random.ulid)
      }
      assert.isTrue(isStrictlyIncreasing(uuids))
      assert.isTrue(isStrictlyIncreasing(ulids))
      assert.isTrue(uuids.every((uuid) => uuidV7Regex.test(uuid) && uuid.startsWith("00000000-03e8-7")))
      assert.isTrue(ulids.every((ulid) => ulid.startsWith("00000000Z8")))

      yield* TestClock.setTime(1000)
      const other = make()
      assert.strictEqual(yield* other.uuidV7(), uuids[0])
      assert.strictEqual(yield* other.ulid, ulids[0])
    }))

  it.effect("uuidV7 seeds its counter with headroom, and ulid overflow advances the timestamp", () => {
    const random = SecureRandom.make((size) => new Uint8Array(size).fill(0xff))
    return Effect.gen(function*() {
      yield* TestClock.setTime(1000)
      assert.deepStrictEqual([yield* random.uuidV7(), yield* random.uuidV7()], [
        "00000000-03e8-77ff-bfff-ffffffffffff",
        "00000000-03e8-7800-8000-0000ffffffff"
      ])
      assert.deepStrictEqual([yield* random.ulid, yield* random.ulid], [
        "00000000Z8ZZZZZZZZZZZZZZZZ",
        "00000000Z9ZZZZZZZZZZZZZZZZ"
      ])
    })
  })

  it.effect("intBetween rejects draws that would bias the result", () => {
    // The first request is all 0xff, the top of any draw. Every range that does
    // not divide the draw space evenly has to reject it, or results skew. The
    // next draw is all zero, so an unbiased intBetween returns min.
    let calls = 0
    const random = SecureRandom.make((size) => new Uint8Array(size).fill(calls++ === 0 ? 0xff : 0))
    return Effect.gen(function*() {
      assert.strictEqual(yield* random.intBetween(1, 6), 1)
    })
  })

  it.effect("intBetween and shuffle cover their range", () =>
    Effect.gen(function*() {
      const random = yield* SecureRandom.SecureRandom
      const rolls = new Set<number>()
      const halfOpen = new Set<number>()
      for (let i = 0; i < 500; i++) {
        rolls.add(yield* random.intBetween(1, 6))
        halfOpen.add(yield* random.intBetween(0, 2, { halfOpen: true }))
      }
      assert.deepStrictEqual([...rolls].sort(), [1, 2, 3, 4, 5, 6])
      assert.deepStrictEqual([...halfOpen].sort(), [0, 1])
      assert.strictEqual(yield* random.intBetween(5, 5), 5)
      const input = [1, 2, 3, 4, 5, 6, 7, 8]
      const shuffled = yield* random.shuffle(input)
      assert.deepStrictEqual([...shuffled].sort(), input)
      assert.deepStrictEqual(input, [1, 2, 3, 4, 5, 6, 7, 8])
    }).pipe(Effect.provide(SecureRandom.layerWebCrypto)))

  it.effect("dies on bad sizes and empty or non-finite ranges", () =>
    Effect.gen(function*() {
      const random = yield* SecureRandom.SecureRandom
      for (const size of [-1, 1.5, Number.NaN]) {
        assertDies(yield* Effect.exit(random.randomBytes(size)))
      }
      assertDies(yield* Effect.exit(random.intBetween(3, 1)))
      assertDies(yield* Effect.exit(random.intBetween(2, 2, { halfOpen: true })))
      assertDies(yield* Effect.exit(random.intBetween(0, Infinity)))
    }).pipe(Effect.provideService(SecureRandom.SecureRandom, counting)))

  it.effect("layerWebCrypto fills large requests in 64 KiB chunks from the WebCrypto reference", () => {
    const chunks: Array<number> = []
    // Behaves like getRandomValues, and has no subtle, as in an insecure context.
    const crypto = {
      getRandomValues<T extends ArrayBufferView | null>(array: T): T {
        if (array === null) return array
        if (array.byteLength > 65_536) throw new Error("QuotaExceededError from fixture")
        chunks.push(array.byteLength)
        return array
      }
    } as unknown as Crypto
    return Effect.gen(function*() {
      const random = yield* SecureRandom.SecureRandom
      assert.strictEqual((yield* random.randomBytes(200_000)).length, 200_000)
      assert.strictEqual(chunks.reduce((total, chunk) => total + chunk, 0), 200_000)
    }).pipe(Effect.provide(SecureRandom.layerWebCrypto), Effect.provide(WebCrypto.layer(crypto)))
  })

  it("provides synchronous functions over globalThis.crypto", () => {
    assert.strictEqual(SecureRandom.randomBytesUnsafe(200_000).length, 200_000)
    assert.match(SecureRandom.uuidV4Unsafe(), uuidV4Regex)
    assert.match(SecureRandom.uuidV7Unsafe(), uuidV7Regex)
    assert.match(SecureRandom.ulidUnsafe(), ulidRegex)
    assert.isTrue(isStrictlyIncreasing(Array.from({ length: 2000 }, () => SecureRandom.uuidV7Unsafe())))
    assert.isTrue(isStrictlyIncreasing(Array.from({ length: 2000 }, () => SecureRandom.ulidUnsafe())))
  })
})
