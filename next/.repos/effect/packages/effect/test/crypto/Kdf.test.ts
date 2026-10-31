import { assert, describe, it } from "@effect/vitest"
import * as Digest from "effect/crypto/Digest"
import * as Kdf from "effect/crypto/Kdf"
import * as Effect from "effect/Effect"
import * as Hex from "effect/encoding/Hex"
import * as Layer from "effect/Layer"
import { assertReason, bytes, encode, unreachable } from "../utils/crypto.ts"

describe("Kdf", () => {
  it.effect("derives the published HKDF and PBKDF2 vectors", () =>
    Effect.gen(function*() {
      const kdf = yield* Kdf.Kdf
      // RFC 5869, test case 1.
      const okm = yield* kdf.derive(Kdf.hkdfSha256, new Uint8Array(22).fill(0x0b), {
        salt: bytes("000102030405060708090a0b0c"),
        info: bytes("f0f1f2f3f4f5f6f7f8f9"),
        length: 42
      })
      assert.strictEqual(
        Hex.encode(okm),
        "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865"
      )
      // PBKDF2-HMAC-SHA256, "password" / "salt" at 2 iterations.
      const derived = yield* kdf.derive(Kdf.pbkdf2({ hash: Digest.sha256, iterations: 2 }), encode("password"), {
        salt: encode("salt"),
        length: 32
      })
      assert.strictEqual(Hex.encode(derived), "ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43")
    }).pipe(Effect.provide(Kdf.layerWebCrypto)))

  // Some backends wrap lengths of 2^32 bits or more, and Node.js aborts the
  // process on PBKDF2 iteration counts of 2^31 or more.
  it.effect("checks arguments before calling Web Crypto", () =>
    Effect.gen(function*() {
      const kdf = yield* Kdf.Kdf
      const data = new Uint8Array(16)
      const cases: ReadonlyArray<readonly [Kdf.Algorithm, number, Uint8Array | undefined]> = [
        [Kdf.hkdfSha256, 0, undefined],
        [Kdf.hkdfSha256, 255 * 32 + 1, undefined],
        [Kdf.pbkdf2({ hash: Digest.sha256, iterations: 0 }), 32, undefined],
        [Kdf.pbkdf2({ hash: Digest.sha256, iterations: 2 ** 31 }), 32, undefined],
        [Kdf.pbkdf2({ hash: Digest.sha256, iterations: 1 }), 2 ** 29, undefined],
        // `info` only applies to HKDF.
        [Kdf.pbkdf2Sha256, 32, data]
      ]
      for (const [algorithm, length, info] of cases) {
        assertReason(
          yield* Effect.flip(kdf.derive(algorithm, data, { salt: data, length, info })),
          "InvalidArgument",
          "derive"
        )
      }
    }).pipe(Effect.provide(Kdf.layerWebCrypto.pipe(Layer.provide(unreachable)))))

  it.effect("does not provide Argon2id in the Web Crypto layer", () =>
    Effect.gen(function*() {
      // Omitted costs default to RFC 9106's second recommended setting: 64 MiB,
      // 3 passes, 4 lanes.
      assert.deepStrictEqual(
        Kdf.argon2id(),
        { _tag: "Argon2id", name: "argon2id", memory: 65_536, passes: 3, parallelism: 4 }
      )
      assert.deepStrictEqual(
        Kdf.argon2id({ memory: 19_456 }),
        { _tag: "Argon2id", name: "argon2id", memory: 19_456, passes: 3, parallelism: 4 }
      )
      const kdf = yield* Kdf.Kdf
      const error = yield* Effect.flip(
        kdf.derive(Kdf.argon2id(), encode("password"), { salt: encode("somesalt"), length: 32 })
      )
      assert.strictEqual(error.module, "Kdf")
      assertReason(error, "Unsupported", "derive")
    }).pipe(Effect.provide(Kdf.layerWebCrypto)))
})
