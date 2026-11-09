import { assert, describe, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { Prompt, ResponseIdTracker } from "effect/ai"

const systemMessage = (text: string) => Prompt.systemMessage({ content: text })

const userMessage = (text: string) => Prompt.userMessage({ content: [Prompt.textPart({ text })] })

const assistantMessage = (text: string) => Prompt.assistantMessage({ content: [Prompt.textPart({ text })] })

const assistantToolCallMessage = (id: string) =>
  Prompt.assistantMessage({
    content: [
      Prompt.makePart("tool-call", {
        id,
        name: "test_tool",
        params: { query: "query" },
        providerExecuted: false
      })
    ]
  })

const toolResultMessage = (id: string) =>
  Prompt.toolMessage({
    content: [
      Prompt.toolResultPart({
        id,
        name: "test_tool",
        result: { ok: true },
        isFailure: false,
        providerExecuted: false
      })
    ]
  })

const assertPreparedSome = (
  prepared: Option.Option<ResponseIdTracker.PrepareResult>,
  previousResponseId: string,
  prompt: Prompt.Prompt
) => {
  assert.isTrue(Option.isSome(prepared))
  if (Option.isSome(prepared)) {
    assert.strictEqual(prepared.value.previousResponseId, previousResponseId)
    assert.deepStrictEqual(prepared.value.prompt, prompt)
  }
}

describe("ResponseIdTracker", () => {
  it.effect("returns None for a fresh tracker", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const msg1 = userMessage("msg1")

      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([msg1]))

      assert.isTrue(Option.isNone(prepared))
    }))

  it.effect("prepares only the new user message after a tracked first turn", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const msg1 = userMessage("msg1")
      const asst = assistantMessage("done")
      const msg2 = userMessage("msg2")

      tracker.markParts([msg1], "resp_123")
      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([msg1, asst, msg2]))

      assertPreparedSome(prepared, "resp_123", Prompt.fromMessages([msg2]))
    }))

  it.effect("shares tracker state through its Context service layer", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const msg1 = userMessage("msg1")
      const msg1New = userMessage("msg1-new")
      const asst = assistantMessage("done")
      const msg2 = userMessage("msg2")

      tracker.markParts([msg1], "resp_123")
      tracker.clearUnsafe()
      tracker.markParts([msg1New], "resp_456")
      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([msg1New, asst, msg2]))

      assertPreparedSome(prepared, "resp_456", Prompt.fromMessages([msg2]))
    }))

  it.effect("keeps latest response id when markParts is called twice", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const msg1 = userMessage("msg1")
      const asst = assistantMessage("done")
      const msg2 = userMessage("msg2")

      tracker.markParts([msg1], "resp_1")
      tracker.markParts([msg1], "resp_2")
      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([msg1, asst, msg2]))

      assertPreparedSome(prepared, "resp_2", Prompt.fromMessages([msg2]))
    }))

  it.effect("returns None after clear", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const msg1 = userMessage("msg1")
      const asst = assistantMessage("done")
      const msg2 = userMessage("msg2")

      tracker.markParts([msg1], "resp_123")
      tracker.clearUnsafe()
      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([msg1, asst, msg2]))

      assert.isTrue(Option.isNone(prepared))
    }))

  it.effect("recovers after clear with new marks", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const msg1 = userMessage("msg1")
      const msg1New = userMessage("msg1-new")
      const asst = assistantMessage("done")
      const msg2 = userMessage("msg2")

      tracker.markParts([msg1], "resp_123")
      tracker.clearUnsafe()
      tracker.markParts([msg1New], "resp_456")
      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([msg1New, asst, msg2]))

      assertPreparedSome(prepared, "resp_456", Prompt.fromMessages([msg2]))
    }))

  it.effect("remains usable after concurrent markParts and clear", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const raceMessage = userMessage("race")

      const markPartsRace = Effect.gen(function*() {
        for (let i = 0; i < 200; i++) {
          tracker.markParts([raceMessage], "resp_race")
          yield* Effect.yieldNow
        }
      })

      const clearRace = Effect.gen(function*() {
        for (let i = 0; i < 200; i++) {
          tracker.clearUnsafe()
          yield* Effect.yieldNow
        }
      })

      yield* Effect.all([
        markPartsRace,
        clearRace
      ], {
        concurrency: "unbounded",
        discard: true
      })

      const msg1 = userMessage("msg1")
      const asst = assistantMessage("done")
      const msg2 = userMessage("msg2")
      tracker.markParts([msg1], "resp_final")
      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([msg1, asst, msg2]))

      assertPreparedSome(prepared, "resp_final", Prompt.fromMessages([msg2]))
    }))

  it.effect("returns None for first turn with system and user messages", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const sys = systemMessage("sys")
      const user1 = userMessage("user1")

      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([sys, user1]))

      assert.isTrue(Option.isNone(prepared))
    }))

  it.effect("returns None when tracked prompt has no assistant message", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const sys = systemMessage("sys")
      const user1 = userMessage("user1")

      tracker.markParts([sys, user1], "resp_1")
      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([sys, user1]))

      assert.isTrue(Option.isNone(prepared))
    }))

  it.effect("returns incremental user follow-up after assistant", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const sys = systemMessage("sys")
      const user1 = userMessage("user1")
      const asst1 = assistantMessage("assistant1")
      const user2 = userMessage("user2")

      tracker.markParts([sys, user1], "resp_1")
      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([sys, user1, asst1, user2]))

      assertPreparedSome(prepared, "resp_1", Prompt.fromMessages([user2]))
    }))

  it.effect("returns incremental tool results after assistant tool call", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const sys = systemMessage("sys")
      const user1 = userMessage("user1")
      const asst1 = assistantToolCallMessage("call_1")
      const tool1 = toolResultMessage("call_1")

      tracker.markParts([sys, user1], "resp_1")
      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([sys, user1, asst1, tool1]))

      assertPreparedSome(prepared, "resp_1", Prompt.fromMessages([tool1]))
    }))

  it.effect("returns incremental tool results plus user message in multi-step flow", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const sys = systemMessage("sys")
      const user1 = userMessage("user1")
      const asst1 = assistantToolCallMessage("call_1")
      const tool1 = toolResultMessage("call_1")
      const user2 = userMessage("user2")

      tracker.markParts([sys, user1], "resp_1")
      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([sys, user1, asst1, tool1, user2]))

      assertPreparedSome(prepared, "resp_1", Prompt.fromMessages([tool1, user2]))
    }))

  it.effect("returns None when no new messages follow assistant", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const sys = systemMessage("sys")
      const user1 = userMessage("user1")
      const asst1 = assistantMessage("assistant1")

      tracker.markParts([sys, user1], "resp_1")
      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([sys, user1, asst1]))

      assert.isTrue(Option.isNone(prepared))
    }))

  it.effect("returns None in multi-turn prompt with no messages after last assistant", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const sys = systemMessage("sys")
      const user1 = userMessage("user1")
      const asst1 = assistantMessage("assistant1")
      const user2 = userMessage("user2")
      const asst2 = assistantMessage("assistant2")

      tracker.markParts([sys, user1, asst1, user2], "resp_2")
      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([sys, user1, asst1, user2, asst2]))

      assert.isTrue(Option.isNone(prepared))
    }))

  it.effect("returns None for empty prompt", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make

      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([]))

      assert.isTrue(Option.isNone(prepared))
    }))

  it.effect("returns None when system prompt object changes", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const sys = systemMessage("sys")
      const sysNew = systemMessage("sys-new")
      const user1 = userMessage("user1")
      const asst1 = assistantMessage("assistant1")
      const user2 = userMessage("user2")

      tracker.markParts([sys, user1], "resp_1")
      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([sysNew, user1, asst1, user2]))

      assert.isTrue(Option.isNone(prepared))
    }))

  it.effect("returns None when user message object changes", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const sys = systemMessage("sys")
      const user1 = userMessage("user1")
      const user1Edited = userMessage("user1-edited")
      const asst1 = assistantMessage("assistant1")
      const user2 = userMessage("user2")

      tracker.markParts([sys, user1], "resp_1")
      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([sys, user1Edited, asst1, user2]))

      assert.isTrue(Option.isNone(prepared))
    }))

  it.effect("returns None when multiple prefix messages diverge", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const sys = systemMessage("sys")
      const user1 = userMessage("user1")
      const sysNew = systemMessage("sys-new")
      const user1Edited = userMessage("user1-edited")
      const asst1 = assistantMessage("assistant1")
      const user2 = userMessage("user2")

      tracker.markParts([sys, user1], "resp_1")
      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([sysNew, user1Edited, asst1, user2]))

      assert.isTrue(Option.isNone(prepared))
    }))

  it.effect("clears stale state after divergence and recovers when the new prefix is re-marked", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const sys = systemMessage("sys")
      const user1 = userMessage("user1")
      const sysNew = systemMessage("sys-new")
      const asst1 = assistantMessage("assistant1")
      const user2 = userMessage("user2")

      tracker.markParts([sys, user1], "resp_1")
      const diverged = tracker.prepareUnsafe(Prompt.fromMessages([sysNew, user1, asst1, user2]))
      assert.isTrue(Option.isNone(diverged))

      tracker.markParts([sysNew, user1], "resp_2")
      const recovered = tracker.prepareUnsafe(Prompt.fromMessages([sysNew, user1, asst1, user2]))

      assertPreparedSome(recovered, "resp_2", Prompt.fromMessages([user2]))
    }))

  it.effect("supports full lifecycle across two turns", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const sys = systemMessage("sys")
      const user1 = userMessage("user1")
      const asst1 = assistantMessage("assistant1")
      const user2 = userMessage("user2")
      const asst2 = assistantMessage("assistant2")
      const user3 = userMessage("user3")

      tracker.markParts([sys, user1], "resp_1")
      const firstPrepared = tracker.prepareUnsafe(Prompt.fromMessages([sys, user1, asst1, user2]))
      assertPreparedSome(firstPrepared, "resp_1", Prompt.fromMessages([user2]))

      tracker.markParts([sys, user1, asst1, user2], "resp_2")
      const secondPrepared = tracker.prepareUnsafe(Prompt.fromMessages([sys, user1, asst1, user2, asst2, user3]))
      assertPreparedSome(secondPrepared, "resp_2", Prompt.fromMessages([user3]))
    }))

  it.effect("returns None for structurally-equal but identity-different prefix message", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const msg1 = userMessage("msg1")
      const msg1Copy = userMessage("msg1")
      const asst1 = assistantMessage("assistant1")
      const msg2 = userMessage("msg2")

      tracker.markParts([msg1], "resp_1")
      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([msg1Copy, asst1, msg2]))

      assert.isTrue(Option.isNone(prepared))
    }))

  it.effect("returns None after explicit clear", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const sys = systemMessage("sys")
      const user1 = userMessage("user1")
      const asst1 = assistantMessage("assistant1")
      const user2 = userMessage("user2")

      tracker.markParts([sys, user1], "resp_1")
      tracker.clearUnsafe()
      const prepared = tracker.prepareUnsafe(Prompt.fromMessages([sys, user1, asst1, user2]))

      assert.isTrue(Option.isNone(prepared))
    }))

  it.effect("isolates two conversations on the same tracker", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const sysA = systemMessage("sysA")
      const userA1 = userMessage("userA1")
      const asstA1 = assistantMessage("asstA1")
      const userA2 = userMessage("userA2")
      const sysB = systemMessage("sysB")
      const userB1 = userMessage("userB1")
      const asstB1 = assistantMessage("asstB1")
      const userB2 = userMessage("userB2")

      tracker.markParts([sysA, userA1], "resp_A1")
      tracker.markParts([sysB, userB1], "resp_B1")

      const preparedA = tracker.prepareUnsafe(Prompt.fromMessages([sysA, userA1, asstA1, userA2]))
      assertPreparedSome(preparedA, "resp_A1", Prompt.fromMessages([userA2]))

      const preparedB = tracker.prepareUnsafe(Prompt.fromMessages([sysB, userB1, asstB1, userB2]))
      assertPreparedSome(preparedB, "resp_B1", Prompt.fromMessages([userB2]))
    }))

  it.effect("does not leak tracked state across conversations without assistant turns", () =>
    Effect.gen(function*() {
      const tracker = yield* ResponseIdTracker.make
      const sysA = systemMessage("sysA")
      const userA1 = userMessage("userA1")
      const asstA1 = assistantMessage("asstA1")
      const userA2 = userMessage("userA2")
      const sysB = systemMessage("sysB")
      const userB1 = userMessage("userB1")

      tracker.markParts([sysA, userA1], "resp_A1")
      tracker.markParts([sysB, userB1], "resp_B1")

      const preparedA = tracker.prepareUnsafe(Prompt.fromMessages([sysA, userA1, asstA1, userA2]))
      assertPreparedSome(preparedA, "resp_A1", Prompt.fromMessages([userA2]))

      const preparedB = tracker.prepareUnsafe(Prompt.fromMessages([sysB, userB1]))
      assert.isTrue(Option.isNone(preparedB))
    }))
})
