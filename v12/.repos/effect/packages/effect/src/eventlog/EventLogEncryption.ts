/**
 * Cryptographic service for encrypted event-log replication.
 *
 * `EventLogEncryption` turns local journal entries into encrypted remote
 * payloads and decrypts encrypted changes received from a server. It also
 * hashes byte data and creates event-log identities, so remote replication can
 * use storage or transport that should not see plaintext event data.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { NonEmptyArray } from "../Array.ts"
import * as Context from "../Context.ts"
import * as Aead from "../crypto/Aead.ts"
import * as Digest from "../crypto/Digest.ts"
import * as SecureRandom from "../crypto/SecureRandom.ts"
import * as WebCrypto from "../crypto/WebCrypto.ts"
import * as Effect from "../Effect.ts"
import * as SchemaBinary from "../encoding/SchemaBinary.ts"
import * as Layer from "../Layer.ts"
import * as Redacted from "../Redacted.ts"
import * as Schema from "../Schema.ts"
import * as Transferable from "../workers/Transferable.ts"
import { type Entry, EntryFields, entryFromFields, EntryId, RemoteEntry } from "./EventJournal.ts"
import type { Identity } from "./EventLog.ts"
import { toBatches } from "./internal/batches.ts"
import { cachedByIdentity, deriveEncryptionKey } from "./internal/identityRootSecretDerivation.ts"

/**
 * Schema for a batch of journal entries encrypted as one AES-GCM message.
 *
 * **Details**
 *
 * `entryIds` lists the ids of the encrypted entries in order. It is sent in
 * plaintext so the server can deduplicate batches, and it is authenticated
 * together with the store id, so a server cannot alter it or move the batch to
 * another store.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export const EncryptedBatch = Schema.Struct({
  entryIds: Schema.NonEmptyArray(EntryId),
  iv: Transferable.Uint8Array,
  encryptedBatch: Transferable.Uint8Array
})

/**
 * Type of an encrypted batch.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface EncryptedBatch extends Schema.Schema.Type<typeof EncryptedBatch> {}

/**
 * Type of an encrypted batch stored by a remote server, including the remote
 * sequence of its first entry.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface EncryptedRemoteBatch extends Schema.Schema.Type<typeof EncryptedRemoteBatch> {}

/**
 * Schema for encrypted batches exchanged with a remote event-log server.
 *
 * **Details**
 *
 * The entries of a batch have consecutive remote sequences starting at
 * `sequence`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export const EncryptedRemoteBatch = Schema.Struct({
  sequence: Schema.Natural,
  ...EncryptedBatch.fields
})

const textEncoder = new TextEncoder()

// The store id is length-prefixed, followed by the 16-byte entry ids.
const additionalData = (storeId: string, entryIds: ReadonlyArray<EntryId>): Uint8Array => {
  const store = textEncoder.encode(storeId)
  const data = new Uint8Array(4 + store.byteLength + entryIds.length * 16)
  new DataView(data.buffer).setUint32(0, store.byteLength)
  data.set(store, 4)
  let offset = 4 + store.byteLength
  for (const id of entryIds) {
    data.set(id, offset)
    offset += 16
  }
  return data
}

const equalBytes = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

const BatchFromSchemaBinary = SchemaBinary.toCodec(Schema.NonEmptyArray(EntryFields))
const encodeBatch = Schema.encodeEffect(BatchFromSchemaBinary)
const decodeBatch = Schema.decodeEffect(BatchFromSchemaBinary)

/**
 * Service that provides identity generation, entry
 * encryption and decryption, and SHA-256 hashing for event-log replication.
 *
 * **When to use**
 *
 * Use to provide cryptographic operations required by encrypted event-log
 * replication.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class EventLogEncryption extends Context.Service<EventLogEncryption, {
  readonly encrypt: (
    identity: Identity["Service"],
    storeId: string,
    entries: ReadonlyArray<Entry>
  ) => Effect.Effect<Array<EncryptedBatch>>
  readonly decrypt: (
    identity: Identity["Service"],
    storeId: string,
    batches: ReadonlyArray<EncryptedRemoteBatch>
  ) => Effect.Effect<Array<RemoteEntry>>
  readonly sha256: (data: Uint8Array) => Effect.Effect<Uint8Array>
  readonly generateIdentity: Effect.Effect<Identity["Service"]>
}>()("effect/eventlog/EventLogEncryption") {}

/**
 * Creates an `EventLogEncryption` service from the `effect/crypto` services.
 *
 * **Details**
 *
 * Each identity's AES-256-GCM key is derived from its root secret with
 * `Digest` and cached per identity. Batches are encrypted with `Aead` under a
 * random 12-byte nonce from `SecureRandom`, which also generates identities.
 * A batch that fails authentication, or whose entries do not match its entry
 * ids, is a defect.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make: Effect.Effect<
  EventLogEncryption["Service"],
  never,
  Aead.Aead | Digest.Digest | SecureRandom.SecureRandom
> = Effect.gen(function*() {
  const aead = yield* Aead.Aead
  const digest = yield* Digest.Digest
  const random = yield* SecureRandom.SecureRandom
  const getEncryptionKey = cachedByIdentity((rootSecret) =>
    deriveEncryptionKey(rootSecret).pipe(
      Effect.map(({ encryptionKey }) => encryptionKey),
      Effect.provideService(Digest.Digest, digest)
    )
  )

  return EventLogEncryption.of({
    encrypt: Effect.fnUntraced(function*(identity, storeId, entries) {
      const key = yield* getEncryptionKey(identity)
      const batches = toBatches(entries)
      const data = yield* Effect.orDie(Effect.forEach(batches, (batch) => encodeBatch(batch)))
      return yield* Effect.forEach(batches, (batch, i) => {
        const entryIds = batch.map((entry) => entry.id) as NonEmptyArray<EntryId>
        return Effect.flatMap(random.randomBytes(12), (iv) =>
          Effect.map(
            aead.encrypt(key, data[i], { nonce: iv, aad: additionalData(storeId, entryIds) }),
            (encryptedBatch) => ({
              entryIds,
              iv: iv as Uint8Array<ArrayBuffer>,
              encryptedBatch: encryptedBatch as Uint8Array<ArrayBuffer>
            })
          ))
      }, { concurrency: "unbounded" }).pipe(Effect.orDie)
    }),
    decrypt: Effect.fnUntraced(function*(identity, storeId, batches) {
      const key = yield* getEncryptionKey(identity)
      const decrypted = yield* Effect.forEach(
        batches,
        (batch) =>
          aead.decrypt(key, batch.encryptedBatch, { nonce: batch.iv, aad: additionalData(storeId, batch.entryIds) }),
        { concurrency: "unbounded" }
      ).pipe(Effect.orDie)
      const result: Array<RemoteEntry> = []
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]
        const fields = yield* Effect.orDie(decodeBatch(decrypted[i] as Uint8Array<ArrayBuffer>))
        const entries = fields.map(entryFromFields)
        if (
          entries.length !== batch.entryIds.length ||
          entries.some((entry, j) => !equalBytes(entry.id, batch.entryIds[j]))
        ) {
          return yield* Effect.die(new Error("Encrypted batch entries do not match its entry ids"))
        }
        for (let j = 0; j < entries.length; j++) {
          result.push(new RemoteEntry({ remoteSequence: batch.sequence + j, entry: entries[j] }))
        }
      }
      return result
    }),
    sha256: (data) => digest.digest(Digest.sha256, data),
    generateIdentity: Effect.zipWith(
      random.uuidV4(),
      random.randomBytes(32),
      (publicKey, privateKey) => ({ publicKey, privateKey: Redacted.make(privateKey as Uint8Array<ArrayBuffer>) })
    )
  })
})

/**
 * Provides `EventLogEncryption` from the `Aead`, `Digest` and `SecureRandom`
 * services.
 *
 * **When to use**
 *
 * Use to choose the crypto layers yourself, such as the `NodeCrypto` layers.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<EventLogEncryption, never, Aead.Aead | Digest.Digest | SecureRandom.SecureRandom> =
  Layer.effect(EventLogEncryption, make)

const layerWebCrypto = Layer.mergeAll(Aead.layerWebCrypto, Digest.layerWebCrypto).pipe(
  Layer.provideMerge(SecureRandom.layerWebCrypto)
)

/**
 * Creates an `EventLogEncryption` service on the Web Crypto layers of
 * `Aead`, `Digest` and `SecureRandom`, using the supplied `Crypto` object.
 *
 * @stability unstable
 * @category encryption
 * @since 4.0.0
 */
export const makeEncryptionSubtle = (crypto: Crypto): Effect.Effect<EventLogEncryption["Service"]> =>
  // `local` keeps enclosing Web Crypto layers, built on another `Crypto`, from
  // being reused.
  Effect.provide(make, Layer.provide(layerWebCrypto, WebCrypto.layer(crypto)), { local: true })

/**
 * Provides `EventLogEncryption` on the Web Crypto layers of `Aead`, `Digest`
 * and `SecureRandom`.
 *
 * **Details**
 *
 * The layers use the `Crypto` object of the `WebCrypto` reference, which
 * defaults to `globalThis.crypto`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerSubtle: Layer.Layer<EventLogEncryption> = Layer.provide(layer, layerWebCrypto)
