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
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Layer from "../Layer.ts"
import * as Redacted from "../Redacted.ts"
import * as Schema from "../Schema.ts"
import * as Transferable from "../workers/Transferable.ts"
import { Entry, EntryId, RemoteEntry } from "./EventJournal.ts"
import type { Identity } from "./EventLog.ts"
import { makeGetIdentityRootSecretMaterial } from "./internal/identityRootSecretDerivation.ts"

/**
 * Schema for an encrypted journal entry paired with its initialization vector
 * and the id of the original entry.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export const EncryptedEntry = Schema.Struct({
  entryId: EntryId,
  iv: Transferable.Uint8Array,
  encryptedEntry: Transferable.Uint8Array
})

/**
 * Type of an encrypted remote entry, including its remote sequence number,
 * initialization vector, entry id, and encrypted entry bytes.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface EncryptedRemoteEntry extends Schema.Schema.Type<typeof EncryptedRemoteEntry> {}

/**
 * Schema for encrypted entries exchanged with a remote event-log server.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export const EncryptedRemoteEntry = Schema.Struct({
  sequence: Schema.Natural,
  iv: Transferable.Uint8Array,
  entryId: EntryId,
  encryptedEntry: Transferable.Uint8Array
})

const toArrayBuffer = (data: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  return buffer
}

const toBufferSource = (data: Uint8Array): ArrayBufferView<ArrayBuffer> => new Uint8Array(toArrayBuffer(data))

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
    entries: ReadonlyArray<Entry>
  ) => Effect.Effect<
    ReadonlyArray<{
      readonly iv: Uint8Array<ArrayBuffer>
      readonly encryptedEntry: Uint8Array<ArrayBuffer>
    }>
  >
  readonly decrypt: (
    identity: Identity["Service"],
    entries: ReadonlyArray<EncryptedRemoteEntry>
  ) => Effect.Effect<Array<RemoteEntry>>
  readonly sha256String: (data: Uint8Array) => Effect.Effect<string>
  readonly sha256: (data: Uint8Array) => Effect.Effect<Uint8Array>
  readonly generateIdentity: Effect.Effect<Identity["Service"]>
}>()("effect/eventlog/EventLogEncryption") {}

/**
 * Creates an `EventLogEncryption` service backed by the Web Crypto `SubtleCrypto`
 * APIs from the supplied `Crypto` implementation.
 *
 * @stability unstable
 * @category encryption
 * @since 4.0.0
 */
export const makeEncryptionSubtle = (crypto: Crypto): Effect.Effect<EventLogEncryption["Service"]> =>
  Effect.sync(() => {
    const getIdentityRootSecretMaterial = makeGetIdentityRootSecretMaterial(crypto)

    return EventLogEncryption.of({
      encrypt: Effect.fnUntraced(function*(identity, entries) {
        const data = yield* Effect.orDie(Entry.encodeArray(entries))
        const key = (yield* getIdentityRootSecretMaterial(identity)).encryptionKey
        return yield* Effect.promise(() =>
          Promise.all(
            data.map((entry) => {
              const iv = crypto.getRandomValues(new Uint8Array(12))
              return crypto.subtle.encrypt(
                { name: "AES-GCM", iv: toBufferSource(iv), tagLength: 128 },
                key,
                toBufferSource(entry)
              ).then((encryptedEntry) => ({ iv, encryptedEntry: new Uint8Array(encryptedEntry) }))
            })
          )
        )
      }),
      decrypt: Effect.fnUntraced(function*(identity, entries) {
        const key = (yield* getIdentityRootSecretMaterial(identity)).encryptionKey
        const decryptedData = (yield* Effect.promise(() =>
          Promise.all(entries.map((data) =>
            crypto.subtle.decrypt(
              { name: "AES-GCM", iv: toBufferSource(data.iv), tagLength: 128 },
              key,
              toBufferSource(data.encryptedEntry)
            )
          ))
        )).map((buffer) => new Uint8Array(buffer))
        const decoded = yield* Effect.orDie(Entry.decodeArray(decryptedData))
        return decoded.map((entry, index) => new RemoteEntry({ remoteSequence: entries[index].sequence, entry }))
      }),
      sha256: (data) =>
        Effect.promise(() => crypto.subtle.digest("SHA-256", toArrayBuffer(data))).pipe(
          Effect.map((hash) => new Uint8Array(hash))
        ),
      sha256String: (data) =>
        Effect.map(
          Effect.promise(() => crypto.subtle.digest("SHA-256", toArrayBuffer(data))),
          (hash) => {
            const hashArray = Array.from(new Uint8Array(hash))
            const hashHex = hashArray
              .map((bytes) => bytes.toString(16).padStart(2, "0"))
              .join("")
            return hashHex
          }
        ),
      generateIdentity: Effect.sync(() => ({
        publicKey: crypto.randomUUID(),
        privateKey: Redacted.make(crypto.getRandomValues(new Uint8Array(32)))
      }))
    })
  })

/**
 * Provides `EventLogEncryption` using `globalThis.crypto`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerSubtle: Layer.Layer<EventLogEncryption> = Layer.effect(
  EventLogEncryption,
  makeEncryptionSubtle(globalThis.crypto)
)
