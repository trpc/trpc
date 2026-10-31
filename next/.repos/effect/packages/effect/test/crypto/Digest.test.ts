import { assert, describe, it } from "@effect/vitest"
import * as Digest from "effect/crypto/Digest"
import * as Effect from "effect/Effect"
import * as Hex from "effect/encoding/Hex"
import * as NodeCrypto from "node:crypto"
import { encode } from "../utils/crypto.ts"

const vectors: ReadonlyArray<readonly [Digest.Algorithm, string, string]> = [
  // RFC 1321, appendix A.5
  [Digest.md5, "", "d41d8cd98f00b204e9800998ecf8427e"],
  [Digest.md5, "a", "0cc175b9c0f1b6a831c399e269772661"],
  [Digest.md5, "abc", "900150983cd24fb0d6963f7d28e17f72"],
  [Digest.md5, "message digest", "f96b697d7cb7938d525a2f31aaf161d0"],
  [Digest.md5, "abcdefghijklmnopqrstuvwxyz", "c3fcd3d76192e4007dfb496cca67e13b"],
  [
    Digest.md5,
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
    "d174ab98d277d9f5a5611c2c9f419d9f"
  ],
  [
    Digest.md5,
    "12345678901234567890123456789012345678901234567890123456789012345678901234567890",
    "57edf4a22be3c955ac49da2e2107b67a"
  ],
  // FIPS 180-2, appendix examples
  [Digest.sha1, "abc", "a9993e364706816aba3e25717850c26c9cd0d89d"],
  [Digest.sha256, "abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  [
    Digest.sha384,
    "abc",
    "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7"
  ],
  [
    Digest.sha512,
    "abc",
    "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f"
  ]
]

describe("Digest", () => {
  it.effect("matches the published vectors through the service", () =>
    Effect.gen(function*() {
      const service = yield* Digest.Digest
      for (const [algorithm, input, hex] of vectors) {
        const data = encode(input)
        assert.strictEqual(yield* service.digestHex(algorithm, data), hex)
        assert.strictEqual(Hex.encode(yield* service.digest(algorithm, data)), hex)
      }
    }).pipe(Effect.provide(Digest.layerWebCrypto)))

  it.effect("computes MD5 like node:crypto on random inputs", () =>
    Effect.gen(function*() {
      const digest = yield* Digest.Digest
      // Covers every padding case around the 64-byte block boundary.
      for (let length = 0; length <= 200; length++) {
        const data = new Uint8Array(NodeCrypto.randomBytes(length))
        const expected = NodeCrypto.createHash("md5").update(data).digest("hex")
        assert.strictEqual(yield* digest.digestHex(Digest.md5, data), expected, `length ${length}`)
      }
    }).pipe(Effect.provide(Digest.layerWebCrypto)))
})
