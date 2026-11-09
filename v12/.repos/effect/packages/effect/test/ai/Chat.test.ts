import { assert, describe, it } from "@effect/vitest"
import { Effect, Layer, Predicate, Ref, Schema, Stream } from "effect"
import { Chat, IdGenerator, Prompt, Tool, Toolkit } from "effect/ai"
import { KeyValueStore, Persistence } from "effect/persistence"
import { TestClock } from "effect/testing"
import * as TestUtils from "./utils.ts"

const withConstantIdGenerator = (id: string) =>
  Effect.provideService(IdGenerator.IdGenerator, {
    generateId: () => Effect.succeed(id)
  })

const PersistenceLayer = Layer.provideMerge(
  Chat.layerPersisted({ storeId: "chat" }),
  Persistence.layerBackingMemory
)

describe("Chat", () => {
  for (
    const [name, data] of [
      ["bytes", new Uint8Array([0, 137, 255, 65])],
      ["string", "dGVzdA=="],
      ["URL", new URL("https://example.com/file.txt")]
    ] as const
  ) {
    const makePrompt = () =>
      Prompt.make([{
        role: "user",
        content: [{ type: "file", mediaType: "text/plain", data }]
      }])

    it.effect(`round-trips file ${name} through exportJson/fromJson`, () =>
      Effect.gen(function*() {
        const prompt = makePrompt()
        const chat = yield* Chat.fromPrompt(prompt)
        const restored = yield* Chat.fromJson(yield* chat.exportJson)

        assert.deepStrictEqual(yield* Ref.get(restored.history), prompt)
      }))

    it.effect(`round-trips file ${name} through JSON-serialized export/fromExport`, () =>
      Effect.gen(function*() {
        const prompt = makePrompt()
        const chat = yield* Chat.fromPrompt(prompt)
        const restored = yield* Chat.fromExport(JSON.parse(JSON.stringify(yield* chat.export)))

        assert.deepStrictEqual(yield* Ref.get(restored.history), prompt)
      }))

    it.effect(`round-trips file ${name} through JSON-backed persistence`, () =>
      Effect.gen(function*() {
        const persistence = yield* Chat.Persistence
        const chat = yield* persistence.getOrCreate("1")

        yield* chat.generateText({ prompt: makePrompt() }).pipe(
          TestUtils.withLanguageModel({ generateText: [{ type: "text", text: "Received" }] })
        )

        const expected = yield* Ref.get(chat.history)
        const restored = yield* persistence.get("1")
        const reopened = yield* persistence.getOrCreate("1")

        assert.deepStrictEqual(yield* Ref.get(restored.history), expected)
        assert.deepStrictEqual(yield* Ref.get(reopened.history), expected)
      }).pipe(
        Effect.provide(
          Chat.layerPersisted({ storeId: "chat" }).pipe(
            Layer.provide(Persistence.layerBackingKvs),
            Layer.provide(KeyValueStore.layerMemory)
          )
        )
      ))
  }

  it.effect("keeps partial assistant text when streamText is interrupted", () =>
    Effect.gen(function*() {
      const chat = yield* Chat.empty

      yield* chat.streamText({ prompt: "hi" }).pipe(
        Stream.take(2),
        Stream.runDrain,
        TestUtils.withLanguageModel({
          streamText: () =>
            Stream.fromIterable(
              [
                { type: "text-start", id: "t1" },
                { type: "text-delta", id: "t1", delta: "Hello" },
                { type: "text-end", id: "t1" }
              ] as const
            ).pipe(Stream.rechunk(1))
        })
      )

      assert.deepStrictEqual(
        yield* Ref.get(chat.history),
        Prompt.make([
          { role: "user", content: "hi" },
          { role: "assistant", content: [{ type: "text", text: "Hello" }] }
        ])
      )
    }))

  it.effect("does not replay a completed approved tool", () => {
    let executions = 0
    const toolkit = Toolkit.make(Tool.make("Counter", {
      parameters: Schema.Struct({}),
      success: Schema.Number,
      needsApproval: true
    }))

    return Effect.gen(function*() {
      const chat = yield* Chat.empty
      const initial = yield* chat.generateText({ prompt: "Run the counter", toolkit }).pipe(
        TestUtils.withLanguageModel({
          generateText: [{ type: "tool-call", id: "counter-call", name: "Counter", params: {} }]
        })
      )
      const approval = initial.content.find((part) => part.type === "tool-approval-request")
      assert.isDefined(approval)

      yield* chat.generateText({
        toolkit,
        prompt: [Prompt.toolMessage({
          content: [Prompt.toolApprovalResponsePart({ approvalId: approval.approvalId, approved: true })]
        })]
      }).pipe(
        TestUtils.withLanguageModel({ generateText: [{ type: "text", text: "Complete" }] })
      )

      yield* chat.generateText({ prompt: "Continue", toolkit }).pipe(
        TestUtils.withLanguageModel({ generateText: [{ type: "text", text: "Continued" }] })
      )

      assert.strictEqual(executions, 1)
    }).pipe(
      Effect.provide(toolkit.toLayer({ Counter: () => Effect.sync(() => ++executions) }))
    )
  })

  it.effect("should persist chat history to the backing persistence store", () =>
    Effect.gen(function*() {
      const storeId = "chat"
      const chatId = "1"

      const backing = yield* Persistence.BackingPersistence
      const persistence = yield* Chat.Persistence

      const store = yield* backing.make(storeId)
      const chat = yield* persistence.getOrCreate(chatId)

      yield* chat.generateText({ prompt: "test user message" }).pipe(
        TestUtils.withLanguageModel({
          generateText: [{
            type: "text",
            text: "test assistant message"
          }]
        })
      )

      const chatHistory = yield* Ref.get(chat.history)
      const encodedHistory = yield* store.get(chatId)
      const storedHistory = Predicate.isNotUndefined(encodedHistory)
        ? yield* Schema.decodeUnknownEffect(Prompt.Prompt)(encodedHistory)
        : undefined

      const options = { [Chat.Persistence.key]: { messageId: "msg_abc123" } }
      const expectedHistory = Prompt.make([
        { role: "user", content: [{ type: "text", text: "test user message" }], options },
        { role: "assistant", content: [{ type: "text", text: "test assistant message" }], options }
      ])

      assert.deepStrictEqual(chatHistory, expectedHistory)
      assert.deepStrictEqual(chatHistory, storedHistory)
    }).pipe(withConstantIdGenerator("msg_abc123"), Effect.provide(PersistenceLayer)))

  it.effect("should respect the specified time to live", () =>
    Effect.gen(function*() {
      const storeId = "chat"
      const chatId = "1"

      const backing = yield* Persistence.BackingPersistence
      const persistence = yield* Chat.Persistence

      const store = yield* backing.make(storeId)
      const chat = yield* persistence.getOrCreate(chatId, {
        timeToLive: "30 days"
      })

      yield* chat.generateText({ prompt: "test user message" }).pipe(
        TestUtils.withLanguageModel({
          generateText: [{
            type: "text",
            text: "test assistant message"
          }]
        })
      )

      const encodedHistory = yield* store.get(chatId)
      const storedHistory = Predicate.isNotUndefined(encodedHistory)
        ? yield* Schema.decodeUnknownEffect(Prompt.Prompt)(encodedHistory)
        : undefined

      const options = { [Chat.Persistence.key]: { messageId: "msg_abc123" } }
      const expectedHistory = Prompt.make([
        { role: "user", content: [{ type: "text", text: "test user message" }], options },
        { role: "assistant", content: [{ type: "text", text: "test assistant message" }], options }
      ])

      assert.deepStrictEqual(storedHistory, expectedHistory)

      // Simulate chat expiration
      yield* TestClock.adjust("30 days")

      const afterExpiration = yield* store.get(chatId)

      assert.isUndefined(afterExpiration)
    }).pipe(withConstantIdGenerator("msg_abc123"), Effect.provide(PersistenceLayer)))

  it.effect("should prefer the message identifier of the most recent assistant message", () =>
    Effect.gen(function*() {
      const storeId = "chat"
      const chatId = "2"

      const backing = yield* Persistence.BackingPersistence
      const persistence = yield* Chat.Persistence

      const store = yield* backing.make(storeId)
      const chat = yield* persistence.getOrCreate(chatId)

      const options = { [Chat.Persistence.key]: { messageId: "msg_123abc" } }
      const history = Prompt.make([
        { role: "user", content: "first user message", options },
        { role: "assistant", content: "first assistant message", options }
      ])
      yield* Ref.set(chat.history, history)
      yield* chat.save

      yield* chat.generateText({ prompt: "second user message" }).pipe(
        TestUtils.withLanguageModel({
          generateText: [{
            type: "text",
            text: "second assistant message"
          }]
        })
      )

      const encodedHistory = yield* store.get(chatId)
      const storedHistory = Predicate.isNotUndefined(encodedHistory)
        ? yield* Schema.decodeUnknownEffect(Prompt.Prompt)(encodedHistory)
        : undefined
      const expectedHistory = Prompt.concat(history, [
        { role: "user", content: "second user message", options },
        { role: "assistant", content: "second assistant message", options }
      ])

      assert.deepStrictEqual(storedHistory, expectedHistory)
    }).pipe(withConstantIdGenerator("msg_abc123"), Effect.provide(PersistenceLayer)))

  it.effect("should raise an error when retrieving a chat that does not exist", () =>
    Effect.gen(function*() {
      const persistence = yield* Chat.Persistence

      const result = yield* Effect.flip(persistence.get("chat-321"))

      assert.instanceOf(result, Chat.ChatNotFoundError)
      assert.strictEqual(result.chatId, "chat-321")
    }).pipe(Effect.provide(PersistenceLayer)))

  it.effect("should raise an error when retrieving a chat with invalid history", () =>
    Effect.gen(function*() {
      const backing = yield* Persistence.BackingPersistence
      const persistence = yield* Chat.Persistence

      const store = yield* backing.make("chat")
      yield* store.set("1", { content: [{ role: "unknown" }] }, undefined)

      const result = yield* Effect.flip(persistence.get("1"))

      assert.instanceOf(result, Persistence.PersistenceError)
    }).pipe(Effect.provide(PersistenceLayer)))
})
