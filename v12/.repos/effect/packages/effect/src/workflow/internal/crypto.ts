import * as Digest from "../../crypto/Digest.ts"
import { webCryptoDigest } from "../../crypto/internal/digest.ts"
import { WebCrypto } from "../../crypto/WebCrypto.ts"
import * as Effect from "../../Effect.ts"
import * as Hex from "../../encoding/Hex.ts"

const encoder = new TextEncoder()

/**
 * Execution ids and idempotency keys are persisted, so they keep the first 16
 * bytes of the SHA-256 digest as 32 hex characters.
 *
 * @internal
 */
export const makeHashDigest = (original: string): Effect.Effect<string> =>
  WebCrypto.use((crypto) =>
    Effect.map(
      webCryptoDigest(crypto, Digest.sha256, encoder.encode(original)),
      (bytes) => Hex.encode(bytes).slice(0, 32)
    )
  )
