import { assert, describe, it } from "@effect/vitest"
import { Cause, Effect, Exit, Layer } from "effect"
import * as Aead from "effect/crypto/Aead"
import * as Digest from "effect/crypto/Digest"
import * as SecureRandom from "effect/crypto/SecureRandom"
import * as EventJournal from "effect/eventlog/EventJournal"
import * as EventLog from "effect/eventlog/EventLog"
import * as EventLogEncryption from "effect/eventlog/EventLogEncryption"

const fromHex = (hex: string) => Uint8Array.from(hex.match(/../g)!, (byte) => parseInt(byte, 16))

const entryId = (first: number) => Uint8Array.from({ length: 16 }, (_, i) => first + i) as EventJournal.EntryId

// Written by the Web Crypto implementation before the crypto module migration:
// root secret bytes 0..31, store "default", AES-GCM with a v1-derived key.
const identity = EventLog.decodeIdentityString(
  "eyJwdWJsaWNLZXkiOiJldmVudGxvZy1jb21wYXQiLCJwcml2YXRlS2V5IjoiQUFFQ0F3UUZCZ2NJQ1FvTERBME9EeEFSRWhNVUZSWVhHQmthR3h3ZEhoOD0ifQ"
)

const recordedBatch: EventLogEncryption.EncryptedRemoteBatch = {
  sequence: 7,
  entryIds: [entryId(0x10), entryId(0x20)],
  iv: fromHex("1b42ae41a7edba8ede50c991"),
  encryptedBatch: fromHex(
    "3fb6370cc472fb5b873f6eed54976f2ae7168808f387f5e948038943e9e01b9385f76daa821792ec93f9d7587f5b1d6d" +
      "dbe84add43003856a9e6dec99f59955fef8f40f5e6dfafc7bfac6f71a6795b06229b9568fa321e65d9cbcd2617c796ba" +
      "e79c347bbf8ce3552e4eabaed6491f123cd69b4e"
  )
}

describe("EventLogEncryption", () => {
  it.effect("decrypts batches written before the crypto module migration", () =>
    Effect.gen(function*() {
      const encryption = yield* EventLogEncryption.EventLogEncryption
      const entries = yield* encryption.decrypt(identity, "default", [recordedBatch])

      assert.deepStrictEqual(
        entries.map(({ entry, remoteSequence }) => ({
          remoteSequence,
          id: entry.id,
          event: entry.event,
          primaryKey: entry.primaryKey,
          payload: entry.payload
        })),
        [
          {
            remoteSequence: 7,
            id: entryId(0x10),
            event: "UserCreated",
            primaryKey: "user-1",
            payload: Uint8Array.of(1, 2, 3)
          },
          {
            remoteSequence: 8,
            id: entryId(0x20),
            event: "UserRenamed",
            primaryKey: "user-1",
            payload: Uint8Array.of(4, 5)
          }
        ]
      )
    }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))

  it.effect("dies when a recorded batch is replayed for another store", () =>
    Effect.gen(function*() {
      const encryption = yield* EventLogEncryption.EventLogEncryption
      const exit = yield* encryption.decrypt(identity, "other", [recordedBatch]).pipe(Effect.exit)

      assert.isTrue(Exit.isFailure(exit) && Cause.hasDies(exit.cause))
    }).pipe(Effect.provide(EventLogEncryption.layerSubtle)))

  it.effect("encrypts in the recorded format on the crypto services in context", () =>
    Effect.gen(function*() {
      const encryption = yield* EventLogEncryption.EventLogEncryption
      const batches = yield* encryption.encrypt(identity, "default", [
        new EventJournal.Entry({
          id: entryId(0x10),
          event: "UserCreated",
          primaryKey: "user-1",
          payload: Uint8Array.of(1, 2, 3)
        }),
        new EventJournal.Entry({
          id: entryId(0x20),
          event: "UserRenamed",
          primaryKey: "user-1",
          payload: Uint8Array.of(4, 5)
        })
      ])

      assert.deepStrictEqual(batches, [{
        entryIds: recordedBatch.entryIds,
        iv: recordedBatch.iv,
        encryptedBatch: recordedBatch.encryptedBatch
      }])
    }).pipe(
      Effect.provide(EventLogEncryption.layer.pipe(
        Layer.provide([Aead.layerWebCrypto, Digest.layerWebCrypto]),
        // Supplies the recorded nonce, so the output is deterministic.
        Layer.provideMerge(
          Layer.mock(SecureRandom.SecureRandom)({
            randomBytes: () => Effect.succeed(recordedBatch.iv)
          })
        )
      ))
    ))
})
