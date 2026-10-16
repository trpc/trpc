/**
 * Signs and verifies event-log session authentication payloads.
 *
 * Remote peers use this challenge-response flow to prove that they control a
 * session signing key before sending session traffic. The signed payload
 * includes the remote id, a short-lived challenge, the event-log public key, and
 * the signing public key in a stable byte format.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder("utf-8", { fatal: true })

const constLengthPrefixBytes = 4

/**
 * Defines the domain-separation string embedded in canonical session
 * authentication payloads.
 *
 * **When to use**
 *
 * Use when you need the domain-separation string used to build canonical
 * event-log session authentication payloads.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const AuthPayloadContext = "eventlog-auth-v1"

/**
 * Defines the required byte length for raw Ed25519 public keys used in session
 * authentication.
 *
 * **When to use**
 *
 * Use when implementing session-auth serialization or validation that must
 * reject public keys with a non-canonical raw byte length.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const Ed25519PublicKeyLength = 32

/**
 * Defines the required byte length for Ed25519 signatures used in session authentication.
 *
 * **When to use**
 *
 * Use when implementing session-auth verification that must reject signatures
 * with a non-canonical byte length before cryptographic checking.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const Ed25519SignatureLength = 64

/**
 * Defines the number of random bytes generated for a session authentication
 * challenge.
 *
 * **When to use**
 *
 * Use when you need the challenge size for event-log session authentication.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const SessionAuthChallengeLength = 32

/**
 * Defines the time-to-live, in milliseconds, for a pending session
 * authentication challenge.
 *
 * **When to use**
 *
 * Use when you need the timeout for pending event-log session authentication
 * challenges.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const SessionAuthChallengeTimeToLiveMillis = 30_000

/**
 * Payload fields that are canonicalized and signed during session
 * authentication.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SessionAuthPayload {
  readonly remoteId: string | Uint8Array
  readonly challenge: Uint8Array
  readonly publicKey: string
  readonly signingPublicKey: Uint8Array
}

/**
 * Error raised while encoding, decoding, signing, verifying, or generating
 * session authentication challenges.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class EventLogSessionAuthError extends Data.TaggedError("EventLogSessionAuthError")<{
  readonly reason:
    | "InvalidPayload"
    | "InvalidContext"
    | "InvalidAlgorithm"
    | "InvalidSigningPublicKeyLength"
    | "InvalidSignatureLength"
    | "InvalidSigningPrivateKey"
    | "CryptoUnavailable"
    | "CryptoFailure"
  readonly message: string
  readonly cause?: unknown
}> {}

const toArrayBuffer = (data: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  return copy.buffer
}

const decodeUtf8 = (bytes: Uint8Array) =>
  Effect.try({
    try: () => textDecoder.decode(bytes),
    catch: (cause) =>
      new EventLogSessionAuthError({
        reason: "InvalidPayload",
        message: "Session auth payload contains invalid UTF-8 bytes",
        cause
      })
  })

const assertSigningPublicKeyLength = (signingPublicKey: Uint8Array): Effect.Effect<void, EventLogSessionAuthError> => {
  if (signingPublicKey.byteLength === Ed25519PublicKeyLength) return Effect.void
  return Effect.fail(
    new EventLogSessionAuthError({
      reason: "InvalidSigningPublicKeyLength",
      message:
        `Expected signingPublicKey length to be ${Ed25519PublicKeyLength} bytes, received ${signingPublicKey.byteLength}`
    })
  )
}

const assertSignatureLength = (signature: Uint8Array): Effect.Effect<void, EventLogSessionAuthError> => {
  if (signature.byteLength === Ed25519SignatureLength) return Effect.void
  return Effect.fail(
    new EventLogSessionAuthError({
      reason: "InvalidSignatureLength",
      message: `Expected signature length to be ${Ed25519SignatureLength} bytes, received ${signature.byteLength}`
    })
  )
}

const getSubtle = Effect.suspend(() => {
  const subtle = globalThis.crypto?.subtle
  if (subtle === undefined) {
    return Effect.fail(
      new EventLogSessionAuthError({
        reason: "CryptoUnavailable",
        message: "globalThis.crypto.subtle is not available"
      })
    )
  }
  return Effect.succeed(subtle)
})

const getCrypto = Effect.suspend(() => {
  const crypto = globalThis.crypto
  if (crypto === undefined) {
    return Effect.fail(
      new EventLogSessionAuthError({
        reason: "CryptoUnavailable",
        message: "globalThis.crypto is not available"
      })
    )
  }
  return Effect.succeed(crypto)
})

const writeLength = (
  target: Uint8Array,
  offset: number,
  length: number
): Effect.Effect<number, EventLogSessionAuthError> => {
  if (length < 0 || length > 0xffff_ffff) {
    return Effect.fail(
      new EventLogSessionAuthError({
        reason: "InvalidPayload",
        message: `Invalid canonical field length: ${length}`
      })
    )
  }

  target[offset] = (length >>> 24) & 0xff
  target[offset + 1] = (length >>> 16) & 0xff
  target[offset + 2] = (length >>> 8) & 0xff
  target[offset + 3] = length & 0xff

  return Effect.succeed(offset + constLengthPrefixBytes)
}

const readLength = (source: Uint8Array, offset: number): number =>
  (
    (source[offset]! << 24) |
    (source[offset + 1]! << 16) |
    (source[offset + 2]! << 8) |
    source[offset + 3]!
  ) >>> 0

const readField = (
  payload: Uint8Array,
  state: { offset: number }
): Effect.Effect<Uint8Array, EventLogSessionAuthError> => {
  if (state.offset + constLengthPrefixBytes > payload.byteLength) {
    return Effect.fail(
      new EventLogSessionAuthError({
        reason: "InvalidPayload",
        message: "Session auth payload is truncated before field length"
      })
    )
  }

  const length = readLength(payload, state.offset)
  state.offset += constLengthPrefixBytes

  if (state.offset + length > payload.byteLength) {
    return Effect.fail(
      new EventLogSessionAuthError({
        reason: "InvalidPayload",
        message: "Session auth payload is truncated inside a field"
      })
    )
  }

  const field = payload.slice(state.offset, state.offset + length)
  state.offset += length
  return Effect.succeed(field)
}

const bytesToHex = (bytes: Uint8Array): string => {
  let hex = ""
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0")
  }
  return hex
}

const encodeRemoteIdField = (remoteId: string | Uint8Array): Uint8Array =>
  typeof remoteId === "string"
    ? textEncoder.encode(remoteId)
    : textEncoder.encode(bytesToHex(remoteId))

/**
 * Encodes a session authentication payload into the canonical byte format.
 *
 * **Details**
 *
 * The canonical payload format uses ordered big-endian length-prefixed fields:
 *
 * 1. context (fixed: eventlog-auth-v1)
 * 2. remoteId
 * 3. challenge bytes
 * 4. publicKey
 * 5. signingPublicKey bytes
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const encodeSessionAuthPayload = Effect.fnUntraced(function*(payload: SessionAuthPayload) {
  yield* assertSigningPublicKeyLength(payload.signingPublicKey)

  const fields = [
    textEncoder.encode(AuthPayloadContext),
    encodeRemoteIdField(payload.remoteId),
    payload.challenge,
    textEncoder.encode(payload.publicKey),
    payload.signingPublicKey
  ]

  const totalLength = fields.reduce(
    (total, field) => total + constLengthPrefixBytes + field.byteLength,
    0
  )
  const encoded = new Uint8Array(totalLength)

  let offset = 0
  for (const field of fields) {
    offset = yield* writeLength(encoded, offset, field.byteLength)
    encoded.set(field, offset)
    offset += field.byteLength
  }

  return encoded
})

/**
 * Decodes a canonical session authentication payload.
 *
 * **Details**
 *
 * The decoder validates the context field, UTF-8 fields, signing public key
 * length, and rejects truncated or trailing bytes.
 *
 * @stability unstable
 * @category encoding
 * @since 4.0.0
 */
export const decodeSessionAuthPayload = Effect.fnUntraced(
  function*(payload: Uint8Array): Effect.fn.Return<SessionAuthPayload, EventLogSessionAuthError> {
    const state = { offset: 0 }
    const context = yield* decodeUtf8(yield* readField(payload, state))

    if (context !== AuthPayloadContext) {
      return yield* new EventLogSessionAuthError({
        reason: "InvalidContext",
        message: `Invalid session auth payload context: ${context}`
      })
    }

    const remoteId = yield* decodeUtf8(yield* readField(payload, state))
    const challenge = yield* readField(payload, state)
    const publicKey = yield* decodeUtf8(yield* readField(payload, state))
    const signingPublicKey = yield* readField(payload, state)
    yield* assertSigningPublicKeyLength(signingPublicKey)

    if (state.offset !== payload.byteLength) {
      return yield* new EventLogSessionAuthError({
        reason: "InvalidPayload",
        message: "Session auth payload contains trailing bytes"
      })
    }

    return {
      remoteId,
      challenge,
      publicKey,
      signingPublicKey
    }
  }
)

/**
 * Creates a canonical session authentication signature with an Ed25519 private key.
 *
 * **Details**
 *
 * The private key must be PKCS#8-encoded bytes importable by `SubtleCrypto`.
 *
 * @stability unstable
 * @category signing
 * @since 4.0.0
 */
export const signSessionAuthPayloadBytes = Effect.fnUntraced(function*(options: {
  readonly payload: Uint8Array
  readonly signingPrivateKey: Uint8Array
}): Effect.fn.Return<Uint8Array<ArrayBuffer>, EventLogSessionAuthError> {
  yield* decodeSessionAuthPayload(options.payload)

  const subtle = yield* getSubtle
  let privateKey = yield* Effect.tryPromise({
    try: () =>
      subtle.importKey(
        "pkcs8",
        toArrayBuffer(options.signingPrivateKey),
        "Ed25519",
        false,
        ["sign"]
      ),
    catch: (cause) =>
      new EventLogSessionAuthError({
        reason: "InvalidSigningPrivateKey",
        message: "Failed to import Ed25519 signing private key (expected PKCS#8 bytes)",
        cause
      })
  })

  const signature = yield* Effect.tryPromise({
    try: () => subtle.sign("Ed25519", privateKey, toArrayBuffer(options.payload)),
    catch: (cause) =>
      new EventLogSessionAuthError({
        reason: "CryptoFailure",
        message: "Failed to sign canonical session auth payload",
        cause
      })
  })
  return new Uint8Array(signature)
})

/**
 * Verifies an Ed25519 signature for canonical session authentication payload
 * bytes.
 *
 * **Details**
 *
 * The payload, signing public key, and signature lengths are validated before
 * calling `SubtleCrypto.verify`.
 *
 * @stability unstable
 * @category verification
 * @since 4.0.0
 */
export const verifySessionAuthPayloadBytes = Effect.fnUntraced(function*(options: {
  readonly payload: Uint8Array
  readonly signingPublicKey: Uint8Array
  readonly signature: Uint8Array
}) {
  yield* decodeSessionAuthPayload(options.payload)
  yield* assertSigningPublicKeyLength(options.signingPublicKey)
  yield* assertSignatureLength(options.signature)

  const subtle = yield* getSubtle
  const publicKey = yield* Effect.tryPromise({
    try: () => subtle.importKey("raw", toArrayBuffer(options.signingPublicKey), "Ed25519", false, ["verify"]),
    catch: (cause) =>
      new EventLogSessionAuthError({
        reason: "InvalidSigningPublicKeyLength",
        message: "Failed to import Ed25519 signing public key",
        cause
      })
  })

  return yield* Effect.tryPromise({
    try: () => subtle.verify("Ed25519", publicKey, toArrayBuffer(options.signature), toArrayBuffer(options.payload)),
    catch: (cause) =>
      new EventLogSessionAuthError({
        reason: "CryptoFailure",
        message: "Failed to verify canonical session auth payload signature",
        cause
      })
  })
})

/**
 * Encodes a session authentication payload in canonical form and signs it with an
 * Ed25519 private key.
 *
 * @stability unstable
 * @category signing
 * @since 4.0.0
 */
export const signSessionAuthPayload = (
  options: SessionAuthPayload & {
    readonly signingPrivateKey: Uint8Array
  }
) =>
  encodeSessionAuthPayload(options).pipe(
    Effect.flatMap((payload) =>
      signSessionAuthPayloadBytes({
        payload,
        signingPrivateKey: options.signingPrivateKey
      })
    )
  )

/**
 * Encodes a session authentication payload in canonical form and verifies its
 * Ed25519 signature.
 *
 * @stability unstable
 * @category verification
 * @since 4.0.0
 */
export const verifySessionAuthPayload = (
  options: SessionAuthPayload & {
    readonly signature: Uint8Array
  }
) =>
  encodeSessionAuthPayload(options).pipe(
    Effect.flatMap((payload) =>
      verifySessionAuthPayloadBytes({
        payload,
        signingPublicKey: options.signingPublicKey,
        signature: options.signature
      })
    )
  )

/**
 * Generates a random session authentication challenge using `globalThis.crypto`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeSessionAuthChallenge: Effect.Effect<
  Uint8Array<ArrayBuffer>,
  EventLogSessionAuthError
> = Effect.gen(function*() {
  const crypto = yield* getCrypto
  const challenge = new Uint8Array(SessionAuthChallengeLength)
  crypto.getRandomValues(challenge)
  return challenge
})

/**
 * Verifies an authentication request by requiring the `Ed25519` algorithm and
 * checking the signature over the canonical session authentication payload.
 *
 * @stability unstable
 * @category verification
 * @since 4.0.0
 */
export const verifySessionAuthenticateRequest = Effect.fnUntraced(function*(options: {
  readonly remoteId: string | Uint8Array
  readonly challenge: Uint8Array
  readonly publicKey: string
  readonly signingPublicKey: Uint8Array
  readonly signature: Uint8Array
  readonly algorithm: string
}) {
  if (options.algorithm !== "Ed25519") {
    return yield* new EventLogSessionAuthError({
      reason: "InvalidAlgorithm",
      message: `Unsupported session auth algorithm: ${options.algorithm}`
    })
  }

  return yield* verifySessionAuthPayload({
    remoteId: options.remoteId,
    challenge: options.challenge,
    publicKey: options.publicKey,
    signingPublicKey: options.signingPublicKey,
    signature: options.signature
  })
})
