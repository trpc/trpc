import * as Effect from "../../Effect.ts"
import type { Algorithm } from "../Digest.ts"
import * as internal from "./webCrypto.ts"

/** @internal */
export const webCryptoDigest = (crypto: Crypto, algorithm: Algorithm, data: Uint8Array): Effect.Effect<Uint8Array> => {
  const implementation = algorithm.implementation
  if (implementation !== undefined) {
    return Effect.sync(() => implementation(data))
  }
  return Effect.suspend(() => {
    const subtle = crypto?.subtle
    if (subtle === undefined) return Effect.die(internal.subtleUnavailable())
    return Effect.promise(async () => new Uint8Array(await subtle.digest(algorithm.name, data as BufferSource)))
  })
}
