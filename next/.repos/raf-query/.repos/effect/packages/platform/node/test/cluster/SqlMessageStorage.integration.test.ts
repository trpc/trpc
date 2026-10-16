import { NodeCrypto, NodeFileSystem } from "@effect/platform-node"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { assert, describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Fiber, FileSystem, Latch, Layer, Option } from "effect"
import {
  Entity,
  EntityAddress,
  EntityId,
  EntityType,
  Envelope,
  Message,
  MessageStorage,
  RunnerHealth,
  Runners,
  RunnerStorage,
  ShardId,
  Sharding,
  ShardingConfig,
  Snowflake,
  SqlMessageStorage
} from "effect/cluster"
import { SqlClient } from "effect/sql"
import { TestClock } from "effect/testing"
import { MysqlContainer } from "../fixtures/mysql2-utils.ts"
import { PgContainer } from "../fixtures/pg-utils.ts"
import {
  GetUserRpc,
  LongKeyRpc,
  makeAckChunk,
  makeChunkReply,
  makeReply,
  makeRequest,
  PrimaryKeyTest,
  StreamRpc
} from "./MessageStorageTest.ts"

const TestEntity = Entity.make("test", [GetUserRpc])
const TestEntityLayer = TestEntity.toLayer({
  GetUser: () => Effect.void
})

const StorageLayer = SqlMessageStorage.layer.pipe(
  Layer.provideMerge(Snowflake.layerGenerator),
  Layer.provide([ShardingConfig.layerDefaults, NodeCrypto.layer])
)

const truncate = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  yield* sql`DELETE FROM cluster_replies`
  yield* sql`DELETE FROM cluster_messages`
})

describe("SqlMessageStorage", () => {
  ;([
    ["pg", Layer.orDie(PgContainer.layerClient)],
    ["mysql", Layer.orDie(MysqlContainer.layerClient)],
    ["sqlite", Layer.orDie(SqliteLayer)]
  ] as const).forEach(([label, layer]) => {
    // Tests truncate this backend's shared tables.
    it.layer(StorageLayer.pipe(Layer.provideMerge(layer)), {
      concurrent: false,
      timeout: 120000
    })(label, (it) => {
      if (label === "pg") {
        for (const reset of ["resetShards", "resetAddresses"] as const) {
          it.effect(`${reset} does not deadlock with a concurrent message claim`, () =>
            Effect.gen(function*() {
              yield* truncate
              const sql = yield* SqlClient.SqlClient
              const storage = yield* SqlMessageStorage.makeEncoded().pipe(Effect.provide(NodeCrypto.layer))
              // Heap order is the reverse of the claim query's rowid order.
              yield* sql`
                INSERT INTO cluster_messages
                  (id, rowid, shard_id, entity_type, entity_id, kind, tag, payload, headers, processed, request_id)
                VALUES
                  (2, 2, 'default:1', 'test', '1', 0, 'GetUser', '{}', '{}', FALSE, 2),
                  (1, 1, 'default:1', 'test', '1', 0, 'GetUser', '{}', '{}', FALSE, 1)
              `
              // Pause after the reset locks row 2, so the claim can lock row 1.
              yield* sql`
                CREATE FUNCTION cluster_test_slow_reset() RETURNS trigger AS $$
                BEGIN
                  IF NEW.last_read IS NULL AND NEW.rowid = 2 THEN
                    PERFORM pg_sleep(2);
                  END IF;
                  RETURN NEW;
                END $$ LANGUAGE plpgsql
              `
              yield* sql`
                CREATE TRIGGER cluster_test_slow_reset BEFORE UPDATE ON cluster_messages
                FOR EACH ROW EXECUTE FUNCTION cluster_test_slow_reset()
              `
              yield* Effect.gen(function*() {
                const resetFiber = yield* Effect.gen(function*() {
                  // Make the unordered UPDATE use heap order regardless of indexes.
                  yield* sql`SET LOCAL enable_indexscan = off`
                  yield* sql`SET LOCAL enable_bitmapscan = off`
                  yield* reset === "resetShards"
                    ? storage.resetShards(["default:1"])
                    : storage.resetAddresses([EntityAddress.make({
                      shardId: ShardId.make("default", 1),
                      entityType: EntityType.make("test"),
                      entityId: EntityId.make("1")
                    })])
                }).pipe(sql.withTransaction, Effect.exit, Effect.forkChild)
                yield* Effect.gen(function*() {
                  while (true) {
                    const waiting = yield* sql`
                      SELECT 1 FROM pg_stat_activity
                      WHERE pid <> pg_backend_pid() AND wait_event = 'PgSleep'
                      AND query LIKE '%cluster_messages%'
                    `
                    if (waiting.length > 0) return
                    yield* Effect.sleep("10 millis")
                  }
                }).pipe(Effect.timeout("5 seconds"))
                const claim = yield* Effect.exit(storage.unprocessedMessages(["default:1"], Date.now()))
                const resetResult = yield* Fiber.join(resetFiber)
                expect(Exit.isSuccess(resetResult)).toBe(true)
                assert(Exit.isSuccess(claim), String(claim))
                expect(claim.value.map((message) => message.envelope.requestId)).toEqual(["1", "2"])
                expect(yield* storage.unprocessedMessages(["default:1"], Date.now())).toHaveLength(0)
              }).pipe(Effect.ensuring(
                Effect.gen(function*() {
                  yield* sql`DROP TRIGGER cluster_test_slow_reset ON cluster_messages`
                  yield* sql`DROP FUNCTION cluster_test_slow_reset()`
                  yield* truncate
                }).pipe(Effect.orDie)
              ))
            }).pipe(TestClock.withLive))
        }

        it.effect("creates an index for insertion-ordered message reads", () =>
          Effect.gen(function*() {
            const sql = yield* SqlClient.SqlClient
            const indexes = yield* sql<{ indexname: string }>`
              SELECT indexname
              FROM pg_indexes
              WHERE tablename = 'cluster_messages'
              AND indexname = 'cluster_messages_rowid_idx'
            `
            expect(indexes).toHaveLength(1)
          }))
      }

      it.effect("resetRequests with no IDs leaves existing claims untouched", () =>
        Effect.gen(function*() {
          yield* truncate
          const storage = yield* MessageStorage.MessageStorage
          const request = yield* makeRequest()
          yield* storage.saveRequest(request)
          expect(yield* storage.unprocessedMessages([request.envelope.address.shardId])).toHaveLength(1)
          yield* storage.resetRequests([])
          expect(yield* storage.unprocessedMessages([request.envelope.address.shardId])).toHaveLength(0)
        }))

      it.effect("resetRequests releases only the selected request at a shared address", () =>
        Effect.gen(function*() {
          yield* truncate
          const storage = yield* MessageStorage.MessageStorage
          const selected = yield* makeRequest()
          const unrelated = yield* makeRequest()
          yield* storage.saveRequest(selected)
          yield* storage.saveRequest(unrelated)
          const shards = [selected.envelope.address.shardId]
          expect(yield* storage.unprocessedMessages(shards)).toHaveLength(2)
          yield* storage.resetRequests([selected.envelope.requestId])
          const messages = yield* storage.unprocessedMessages(shards)
          expect(messages.map((message) => message.envelope.requestId)).toEqual([selected.envelope.requestId])
          expect(yield* storage.unprocessedMessages(shards)).toHaveLength(0)
        }))

      it.effect("resetRequests preserves chunk replies, exit replies, and completed state", () =>
        Effect.gen(function*() {
          yield* truncate
          const storage = yield* MessageStorage.MessageStorage
          const streaming = yield* makeRequest({ rpc: StreamRpc, payload: StreamRpc.payloadSchema.make({ id: 123 }) })
          const completed = yield* makeRequest()
          yield* storage.saveRequest(streaming)
          yield* storage.saveRequest(completed)
          const shards = [streaming.envelope.address.shardId]
          expect(yield* storage.unprocessedMessages(shards)).toHaveLength(2)
          yield* storage.saveReply(yield* makeChunkReply(streaming))
          yield* storage.saveReply(yield* makeReply(completed))
          const replies = yield* storage.repliesFor([streaming, completed])
          expect(replies).toHaveLength(2)
          expect(yield* storage.unprocessedMessages(shards)).toHaveLength(0)
          const sql = yield* SqlClient.SqlClient
          const processed = yield* sql`SELECT processed FROM cluster_messages ORDER BY rowid`
          yield* storage.resetRequests([streaming.envelope.requestId, completed.envelope.requestId])
          const messages = yield* storage.unprocessedMessages(shards)
          // Replies keep both requests out of the SQL read loop.
          expect(messages).toHaveLength(0)
          expect(yield* storage.repliesFor([streaming, completed])).toEqual(replies)
          expect(yield* sql`SELECT processed FROM cluster_messages ORDER BY rowid`).toEqual(processed)
          yield* truncate
        }))

      it.effect("clearReplies requeues when the expected reply is current", () =>
        Effect.gen(function*() {
          yield* truncate
          const storage = yield* MessageStorage.MessageStorage
          const request = yield* makeRequest()
          const reply = yield* makeReply(request)
          yield* storage.saveRequest(request)
          yield* storage.saveReply(reply)
          yield* storage.clearReplies(request.envelope.requestId, { expectedReplyId: reply.reply.id })
          expect(yield* storage.repliesFor([request])).toHaveLength(0)
          expect(yield* storage.unprocessedMessages([request.envelope.address.shardId])).toHaveLength(1)
        }))

      it.effect("clearReplies with a stale expected reply preserves a newer completion and processed state", () =>
        Effect.gen(function*() {
          yield* truncate
          const sql = yield* SqlClient.SqlClient
          const storage = yield* MessageStorage.MessageStorage
          const request = yield* makeRequest({ rpc: StreamRpc, payload: StreamRpc.payloadSchema.make({ id: 123 }) })
          const oldReply = yield* makeChunkReply(request)
          const completed = yield* makeReply(request)
          yield* storage.saveRequest(request)
          yield* storage.saveReply(oldReply)
          yield* storage.saveReply(completed)
          const before = yield* sql`SELECT processed, last_reply_id FROM cluster_messages WHERE id = ${
            String(request.envelope.requestId)
          }`.pipe(Effect.provideService(SqlClient.SafeIntegers, true))
          yield* storage.clearReplies(request.envelope.requestId, { expectedReplyId: oldReply.reply.id })
          expect((yield* storage.repliesFor([request])).map((r) => r.id)).toEqual([
            oldReply.reply.id,
            completed.reply.id
          ])
          expect(
            yield* sql`SELECT processed, last_reply_id FROM cluster_messages WHERE id = ${
              String(request.envelope.requestId)
            }`.pipe(Effect.provideService(SqlClient.SafeIntegers, true))
          ).toEqual(before)
          expect(yield* storage.unprocessedMessages([request.envelope.address.shardId])).toHaveLength(0)
          yield* truncate
        }))

      it.effect("saveRequest", () =>
        Effect.gen(function*() {
          const storage = yield* MessageStorage.MessageStorage
          const request = yield* makeRequest({ payload: { id: 1 } })
          const result = yield* storage.saveRequest(request)
          expect(result._tag).toEqual("Success")

          for (let i = 2; i <= 5; i++) {
            yield* storage.saveRequest(yield* makeRequest({ payload: { id: i } }))
          }

          yield* storage.saveReply(yield* makeReply(request))

          let messages = yield* storage.unprocessedMessages([request.envelope.address.shardId])
          expect(messages).toHaveLength(4)
          expect(messages.map((m: any) => m.envelope.payload.id)).toEqual([2, 3, 4, 5])

          for (let i = 6; i <= 10; i++) {
            yield* storage.saveRequest(yield* makeRequest({ payload: { id: i } }))
          }
          messages = yield* storage.unprocessedMessages([request.envelope.address.shardId])
          expect(messages).toHaveLength(5)
          expect(messages.map((m: any) => m.envelope.payload.id)).toEqual([6, 7, 8, 9, 10])
        }))

      it.effect("saveReply + saveRequest duplicate", () =>
        Effect.gen(function*() {
          const sql = yield* SqlClient.SqlClient
          const storage = yield* MessageStorage.MessageStorage
          const request = yield* makeRequest({
            rpc: StreamRpc,
            payload: StreamRpc.payloadSchema.make({ id: 123 })
          })
          let result = yield* storage.saveRequest(request)
          expect(result._tag).toEqual("Success")

          let chunk = yield* makeChunkReply(request, 0)
          yield* storage.saveReply(chunk)
          const ackChunk = yield* makeAckChunk(request, chunk)
          yield* storage.saveEnvelope(ackChunk)

          chunk = yield* makeChunkReply(request, 1)
          yield* storage.saveReply(chunk)

          result = yield* storage.saveRequest(
            yield* makeRequest({
              rpc: StreamRpc,
              payload: StreamRpc.payloadSchema.make({ id: 123 })
            })
          )
          assert(result._tag === "Duplicate" && Option.isSome(result.lastReceivedReply))
          expect(result.lastReceivedReply.value._tag).toEqual("Chunk")

          // get the un-acked chunk
          const replies = yield* storage.repliesFor([request])
          expect(replies).toHaveLength(1)

          yield* storage.saveReply(yield* makeReply(request))

          result = yield* storage.saveRequest(
            yield* makeRequest({
              rpc: StreamRpc,
              payload: StreamRpc.payloadSchema.make({ id: 123 })
            })
          )
          assert(result._tag === "Duplicate" && Option.isSome(result.lastReceivedReply))
          expect(result.lastReceivedReply.value._tag).toEqual("WithExit")

          // duplicate WithExit
          const fiber = yield* storage.saveReply(yield* makeReply(request)).pipe(Effect.forkChild)
          yield* TestClock.adjust(1)
          while (!fiber.pollUnsafe()) {
            yield* sql`SELECT 1`
            yield* TestClock.adjust(1000)
          }
          const error = yield* Effect.flip(Fiber.join(fiber))
          expect(error._tag).toEqual("PersistenceError")
        }))

      it.effect("detects duplicates", () =>
        Effect.gen(function*() {
          yield* truncate

          const storage = yield* MessageStorage.MessageStorage
          yield* storage.saveRequest(
            yield* makeRequest({
              rpc: PrimaryKeyTest,
              payload: PrimaryKeyTest.payloadSchema.make({ id: 123 })
            })
          )
          const result = yield* storage.saveRequest(
            yield* makeRequest({
              rpc: PrimaryKeyTest,
              payload: PrimaryKeyTest.payloadSchema.make({ id: 123 })
            })
          )
          expect(result._tag).toEqual("Duplicate")
        }))

      it.effect("hashes primary keys longer than the message_id column", () =>
        Effect.gen(function*() {
          yield* truncate

          const storage = yield* MessageStorage.MessageStorage
          const longId = "long-key-".repeat(50)
          const request = yield* makeRequest({
            rpc: LongKeyRpc,
            payload: LongKeyRpc.payloadSchema.make({ id: longId })
          })
          const result = yield* storage.saveRequest(request)
          expect(result._tag).toEqual("Success")

          const duplicate = yield* storage.saveRequest(
            yield* makeRequest({
              rpc: LongKeyRpc,
              payload: LongKeyRpc.payloadSchema.make({ id: longId })
            })
          )
          expect(duplicate._tag).toEqual("Duplicate")

          const requestId = yield* storage.requestIdForPrimaryKey({
            address: request.envelope.address,
            tag: request.envelope.tag,
            id: longId
          })
          expect(requestId).toEqual(Option.some(request.envelope.requestId))

          const sql = yield* SqlClient.SqlClient
          const rows = yield* sql<{ message_id: string }>`SELECT message_id FROM cluster_messages`
          expect(rows).toHaveLength(1)
          expect(rows[0].message_id).toMatch(/^[0-9a-f]{64}$/)
        }))

      it.effect("keeps primary keys within the column width as plaintext", () =>
        Effect.gen(function*() {
          yield* truncate

          const sql = yield* SqlClient.SqlClient
          const storage = yield* MessageStorage.MessageStorage
          const request = yield* makeRequest({
            rpc: PrimaryKeyTest,
            payload: PrimaryKeyTest.payloadSchema.make({ id: 456 })
          })
          yield* storage.saveRequest(request)

          // rows written by previous versions store the plaintext composed
          // key, so short keys must stay byte-identical to keep deduplicating
          const plaintext = Envelope.primaryKey(request.envelope)!
          const rows = yield* sql<{ message_id: string }>`SELECT message_id FROM cluster_messages`
          expect(rows).toHaveLength(1)
          expect(rows[0].message_id).toEqual(plaintext)

          const result = yield* storage.saveRequest(
            yield* makeRequest({
              rpc: PrimaryKeyTest,
              payload: PrimaryKeyTest.payloadSchema.make({ id: 456 })
            })
          )
          assert(result._tag === "Duplicate")
          expect(result.originalId).toEqual(request.envelope.requestId)

          const requestId = yield* storage.requestIdForPrimaryKey({
            address: request.envelope.address,
            tag: request.envelope.tag,
            id: "456"
          })
          expect(requestId).toEqual(Option.some(request.envelope.requestId))
        }))

      if (label === "sqlite") {
        // sqlite's TEXT message_id column stored over-long plaintext keys
        // before hashing, so the legacy fallback must also cover keys longer
        // than the 255-character limit of the width-enforcing dialects
        it.effect("detects duplicates for legacy long-key plaintext rows", () =>
          Effect.gen(function*() {
            yield* truncate

            const sql = yield* SqlClient.SqlClient
            const storage = yield* MessageStorage.MessageStorage
            const longId = "legacy-long-key-".repeat(30)
            const request = yield* makeRequest({
              rpc: LongKeyRpc,
              payload: LongKeyRpc.payloadSchema.make({ id: longId })
            })
            yield* storage.saveRequest(request)

            // simulate a row written before message_id values were hashed
            const plaintext = Envelope.primaryKey(request.envelope)!
            expect(plaintext.length).toBeGreaterThan(255)
            yield* sql`UPDATE cluster_messages SET message_id = ${plaintext} WHERE id = ${
              String(request.envelope.requestId)
            }`

            const result = yield* storage.saveRequest(
              yield* makeRequest({
                rpc: LongKeyRpc,
                payload: LongKeyRpc.payloadSchema.make({ id: longId })
              })
            )
            assert(result._tag === "Duplicate")
            expect(result.originalId).toEqual(request.envelope.requestId)

            const requestId = yield* storage.requestIdForPrimaryKey({
              address: request.envelope.address,
              tag: request.envelope.tag,
              id: longId
            })
            expect(requestId).toEqual(Option.some(request.envelope.requestId))
          }))
      }

      it.effect("unprocessedMessages", () =>
        Effect.gen(function*() {
          yield* truncate

          const storage = yield* MessageStorage.MessageStorage
          const request = yield* makeRequest()
          yield* storage.saveRequest(request)
          let messages = yield* storage.unprocessedMessages([request.envelope.address.shardId])
          expect(messages).toHaveLength(1)
          messages = yield* storage.unprocessedMessages([request.envelope.address.shardId])
          expect(messages).toHaveLength(0)
          yield* storage.saveRequest(yield* makeRequest())
          messages = yield* storage.unprocessedMessages([request.envelope.address.shardId])
          expect(messages).toHaveLength(1)
        }))

      it.effect("unprocessedMessages honors the limit and claims only returned rows", () =>
        Effect.gen(function*() {
          yield* truncate

          const storage = yield* MessageStorage.MessageStorage
          const shardId = ShardId.make("default", 1)
          for (let i = 1; i <= 5; i++) {
            yield* storage.saveRequest(yield* makeRequest({ payload: { id: i }, entityId: String(i) }))
          }
          const limited = yield* storage.unprocessedMessages([shardId], { limit: 3 })
          expect(limited).toHaveLength(3)
          expect(limited.map((m: any) => m.envelope.payload.id)).toEqual([1, 2, 3])

          // rows beyond the limit were not claimed and are returned by the
          // next read
          const rest = yield* storage.unprocessedMessages([shardId])
          expect(rest.map((m: any) => m.envelope.payload.id)).toEqual([4, 5])
        }))

      it.effect("unprocessedMessages filters by address", () =>
        Effect.gen(function*() {
          yield* truncate

          const storage = yield* MessageStorage.MessageStorage
          const shardId = ShardId.make("default", 1)
          const address = (entityId: string) =>
            EntityAddress.make({
              shardId,
              entityType: EntityType.make("test"),
              entityId: EntityId.make(entityId)
            })
          for (let i = 1; i <= 4; i++) {
            yield* storage.saveRequest(yield* makeRequest({ payload: { id: i }, entityId: String(i) }))
          }
          const filtered = yield* storage.unprocessedMessages([shardId], {
            addresses: [address("2"), address("4")]
          })
          expect(filtered.map((m: any) => m.envelope.payload.id)).toEqual([2, 4])

          // the filtered read must not claim the other addresses
          const rest = yield* storage.unprocessedMessages([shardId])
          expect(rest.map((m: any) => m.envelope.payload.id)).toEqual([1, 3])
        }))

      it.effect("unprocessedMessages filters addresses by shard", () =>
        Effect.gen(function*() {
          yield* truncate

          const storage = yield* MessageStorage.MessageStorage
          const shardOne = ShardId.make("default", 1)
          const shardTwo = ShardId.make("default", 2)
          yield* storage.saveRequest(yield* makeRequest({ payload: { id: 1 }, shardId: shardOne }))
          yield* storage.saveRequest(yield* makeRequest({ payload: { id: 2 }, shardId: shardTwo }))

          const messages = yield* storage.unprocessedMessages([shardOne, shardTwo], {
            addresses: [EntityAddress.make({
              shardId: shardOne,
              entityType: EntityType.make("test"),
              entityId: EntityId.make("1")
            })]
          })
          expect(messages.map((message: any) => message.envelope.payload.id)).toEqual([1])

          const rest = yield* storage.unprocessedMessages([shardOne, shardTwo])
          expect(rest.map((message: any) => message.envelope.payload.id)).toEqual([2])
        }))

      it.effect("encoded unprocessedMessages fails closed for empty addresses", () =>
        Effect.gen(function*() {
          yield* truncate

          const storage = yield* MessageStorage.MessageStorage
          const request = yield* makeRequest()
          yield* storage.saveRequest(request)
          const encoded = yield* SqlMessageStorage.makeEncoded().pipe(Effect.provide(NodeCrypto.layer))
          const shardId = request.envelope.address.shardId.toString()
          const messages = yield* encoded.unprocessedMessages([shardId], Date.now(), { addresses: [] })
          expect(messages).toHaveLength(0)

          const unfiltered = yield* encoded.unprocessedMessages([shardId], Date.now())
          expect(unfiltered).toHaveLength(1)
        }))

      it.effect("encoded resetAddresses fails closed for an empty address list", () =>
        Effect.gen(function*() {
          yield* truncate

          const storage = yield* MessageStorage.MessageStorage
          const request = yield* makeRequest()
          yield* storage.saveRequest(request)
          const encoded = yield* SqlMessageStorage.makeEncoded().pipe(Effect.provide(NodeCrypto.layer))
          const shardId = request.envelope.address.shardId.toString()
          const claimed = yield* encoded.unprocessedMessages([shardId], Date.now())
          expect(claimed).toHaveLength(1)

          yield* encoded.resetAddresses([])
          const messages = yield* encoded.unprocessedMessages([shardId], Date.now())
          expect(messages).toHaveLength(0)
        }))

      it.effect("resetAddresses releases claims in one batch", () =>
        Effect.gen(function*() {
          yield* truncate

          const storage = yield* MessageStorage.MessageStorage
          const shardId = ShardId.make("default", 1)
          const address = (entityId: string) =>
            EntityAddress.make({
              shardId,
              entityType: EntityType.make("test"),
              entityId: EntityId.make(entityId)
            })
          for (let i = 1; i <= 4; i++) {
            yield* storage.saveRequest(yield* makeRequest({ payload: { id: i }, entityId: String(i) }))
          }
          yield* storage.unprocessedMessages([shardId], { limit: 3 })
          yield* storage.resetAddresses([address("1"), address("3")])

          const messages = yield* storage.unprocessedMessages([shardId])
          expect(messages.map((m: any) => m.envelope.payload.id)).toEqual([1, 3, 4])
        }))

      it.effect("unprocessedMessages excludes complete requests", () =>
        Effect.gen(function*() {
          yield* truncate

          const storage = yield* MessageStorage.MessageStorage
          const request = yield* makeRequest()
          yield* storage.saveRequest(request)
          yield* storage.saveReply(yield* makeReply(request))
          const messages = yield* storage.unprocessedMessages([request.envelope.address.shardId])
          expect(messages).toHaveLength(0)
        }))

      it.effect("repliesFor", () =>
        Effect.gen(function*() {
          yield* truncate

          const storage = yield* MessageStorage.MessageStorage
          const request = yield* makeRequest()
          yield* storage.saveRequest(request)
          let replies = yield* storage.repliesFor([request])
          expect(replies).toHaveLength(0)
          yield* storage.saveReply(yield* makeReply(request))
          replies = yield* storage.repliesFor([request])
          expect(replies).toHaveLength(1)
          expect(replies[0].requestId).toEqual(request.envelope.requestId)
        }))

      it.effect("registerReplyHandler", () =>
        Effect.gen(function*() {
          const storage = yield* MessageStorage.MessageStorage
          const latch = yield* Latch.make()
          const request = yield* makeRequest()
          yield* storage.saveRequest(request)
          const fiber = yield* storage.registerReplyHandler(
            new Message.OutgoingRequest({
              ...request,
              respond: () => latch.open
            })
          ).pipe(Effect.forkChild)
          yield* TestClock.adjust(1)
          yield* storage.saveReply(yield* makeReply(request))
          yield* latch.await
          yield* Fiber.await(fiber)
        }))

      it.effect("unprocessedMessagesById", () =>
        Effect.gen(function*() {
          yield* truncate

          const storage = yield* MessageStorage.MessageStorage
          const request = yield* makeRequest({
            rpc: StreamRpc,
            payload: StreamRpc.payloadSchema.make({ id: 123 })
          })
          yield* storage.saveRequest(request)
          let messages = yield* storage.unprocessedMessagesById([request.envelope.requestId])
          expect(messages).toHaveLength(1)

          const chunk = yield* makeChunkReply(request)
          yield* storage.saveReply(chunk)
          const ack = yield* makeAckChunk(request, chunk)
          yield* storage.saveEnvelope(ack)

          const encoded = yield* SqlMessageStorage.makeEncoded().pipe(Effect.provide(NodeCrypto.layer))
          const acknowledgements = yield* encoded.unprocessedMessagesById([ack.envelope.id], 0)
          expect(acknowledgements).toHaveLength(1)
          assert(acknowledgements[0].envelope._tag === "AckChunk")
          expect(acknowledgements[0].envelope.replyId).toEqual(String(chunk.reply.id))

          yield* storage.saveReply(yield* makeReply(request))
          messages = yield* storage.unprocessedMessagesById([request.envelope.requestId])
          expect(messages).toHaveLength(0)
        }))
    })
  })

  it.effect("keeps held messages readable while entity layers build", () =>
    Effect.gen(function*() {
      const config = ShardingConfig.layer({
        entityRegistrationTimeout: 6000,
        entityTerminationTimeout: 0,
        entityMessagePollInterval: 100,
        refreshAssignmentsInterval: 0
      })
      const delayedEnv = TestEntityLayer.pipe(
        Layer.provide(Layer.effectDiscard(Effect.sleep(10_000))),
        Layer.provideMerge(Sharding.layer),
        Layer.provide(RunnerStorage.layerMemory),
        Layer.provide(RunnerHealth.layerNoop),
        Layer.provide(Runners.layerNoop),
        Layer.provide(config)
      )
      const storage = yield* MessageStorage.MessageStorage
      const request = yield* makeRequest()
      yield* storage.saveRequest(request)

      const fiber = yield* Effect.never.pipe(
        Effect.provide(delayedEnv),
        Effect.scoped,
        Effect.forkChild({ startImmediately: true })
      )

      yield* TestClock.adjust(7500)
      expect(yield* storage.repliesFor([request])).toHaveLength(0)

      yield* TestClock.adjust(2500)
      yield* TestClock.adjust(100)
      expect(yield* storage.repliesFor([request])).toHaveLength(1)
      yield* Fiber.interrupt(fiber)
    }).pipe(Effect.provide(StorageLayer.pipe(
      Layer.provideMerge(SqliteLayer)
    ))), { timeout: 15_000 })
})

const SqliteLayer = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const dir = yield* fs.makeTempDirectoryScoped()
  return SqliteClient.layer({
    filename: dir + "/test.db"
  })
}).pipe(Layer.unwrap, Layer.provide(NodeFileSystem.layer))
