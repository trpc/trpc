import { assert, describe, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import * as SchemaBinary from "effect/encoding/SchemaBinary"
import { Entry, RemoteEntry } from "effect/eventlog/EventJournal"
import { ChangesRpc, ChunkedMessage, StoreId, WriteEntriesUnencrypted } from "effect/eventlog/EventLogMessage"

const fromHex = (hex: string) => new Uint8Array(Buffer.from(hex, "hex"))
const toHex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex")

const entries = [
  new Entry({
    id: fromHex("018f4a1e7b0070008000000000000001") as Entry["id"],
    event: "Put",
    primaryKey: "a",
    payload: new Uint8Array([1, 2, 3])
  }),
  new Entry({
    id: fromHex("018f4a1e7b0170008000000000000002") as Entry["id"],
    event: "Delete",
    primaryKey: "b",
    payload: new Uint8Array()
  })
]

// Bytes produced by the 4.0 wire format. Peers and stored ciphertexts written
// with them must keep decoding to the same entries.
const wire = {
  entries: [
    "3020a8faeec3190301020380ae8dce1b10018f4a1e7b007000800000000000000180a1c68f630161f8899a8c7f03507574",
    "3020a8faeec3190080ae8dce1b10018f4a1e7b017000800000000000000280a1c68f630162f8899a8c7f0644656c657465"
  ],
  changes: "7420023d0093af8fd60c5ea8faeec3190301020380ae8dce1b10018f4a1e7b007000800000000000000180a1c68f630161" +
    "f8899a8c7f03507574a2f284a20d020e33015ea8faeec3190080ae8dce1b10018f4a1e7b017000800000000000000280a1c6" +
    "8f630162f8899a8c7f0644656c6574650210",
  write: "69209885f1a8260573746f726598af90d6374f023000a5efbd980306010203e0d5e1b90320018f4a1e7b0070008000000000" +
    "00000190e4f8b10c02619fa1c3f10f065075741c010020018f4a1e7b017000800000000000000202620c44656c657465f8ef" +
    "c0827a02706b"
}

describe("EventLogMessage", () => {
  it("splits empty data into one chunk", () => {
    assert.deepStrictEqual(
      ChunkedMessage.split(1, new Uint8Array()),
      [new ChunkedMessage({ id: 1, part: [0, 1], data: new Uint8Array() })]
    )
  })

  it("ignores duplicate chunks when joining", () => {
    const state = ChunkedMessage.initialJoinState()
    const chunk = new ChunkedMessage({
      id: 1,
      part: [0, 2],
      data: new Uint8Array([1])
    })

    assert.isUndefined(ChunkedMessage.join(state, chunk))
    assert.isUndefined(ChunkedMessage.join(state, chunk))
    assert.deepStrictEqual(
      ChunkedMessage.join(
        state,
        new ChunkedMessage({
          id: 1,
          part: [1, 2],
          data: new Uint8Array([2])
        })
      ),
      new Uint8Array([1, 2])
    )
  })

  describe("wire format", () => {
    it.effect("entry frames", () =>
      Effect.gen(function*() {
        const decoded = yield* Entry.decodeArray(wire.entries.map(fromHex))
        assert.deepStrictEqual(decoded, entries)
        assert.instanceOf(decoded[0], Entry)
        assert.deepStrictEqual((yield* Entry.encodeArray(entries)).map(toHex), wire.entries)
      }))

    it.effect("unencrypted changes frame", () =>
      Effect.gen(function*() {
        const remoteEntries = [
          new RemoteEntry({ remoteSequence: 7, entry: entries[0] }),
          new RemoteEntry({ remoteSequence: 8, entry: entries[1] })
        ] as const
        const decoded = yield* ChangesRpc.decodeUnencrypted(fromHex(wire.changes))
        assert.deepStrictEqual(decoded, remoteEntries)
        assert.instanceOf(decoded[0], RemoteEntry)
        assert.instanceOf(decoded[0].entry, Entry)
        assert.strictEqual(toHex(yield* ChangesRpc.encodeUnencrypted(remoteEntries)), wire.changes)
      }))

    it.effect("unencrypted write frame", () =>
      Effect.gen(function*() {
        const request = new WriteEntriesUnencrypted({ publicKey: "pk", storeId: StoreId.make("store"), entries })
        const decoded = yield* WriteEntriesUnencrypted.decode(fromHex(wire.write))
        assert.deepStrictEqual(decoded, request)
        assert.instanceOf(decoded.entries[0], Entry)
        assert.strictEqual(toHex(yield* request.encoded), wire.write)
      }))

    it.effect("decoders forward parse options", () =>
      Effect.gen(function*() {
        const missingKeys = (error: Schema.SchemaError) =>
          [...error.message.matchAll(/Missing key\n\s+at (.+)/g)].map((match) => match[1]).sort()
        const emptyStruct = Schema.encodeSync(SchemaBinary.toCodec(Schema.Struct({})))({})
        const emptyRemoteEntries = Schema.encodeSync(SchemaBinary.toCodec(Schema.Array(Schema.Struct({}))))([{}])

        const write = yield* Effect.flip(WriteEntriesUnencrypted.decode(emptyStruct, { errors: "all" }))
        assert.deepStrictEqual(missingKeys(write), [`["entries"]`, `["publicKey"]`, `["storeId"]`])
        const changes = yield* Effect.flip(ChangesRpc.decodeUnencrypted(emptyRemoteEntries, { errors: "all" }))
        assert.deepStrictEqual(missingKeys(changes), [`[0]["entry"]`, `[0]["remoteSequence"]`])
      }))
  })
})
