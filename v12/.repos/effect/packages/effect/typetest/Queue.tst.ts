import { type Effect, Queue } from "effect"
import { describe, expect, it } from "tstyche"

interface TestError {
  readonly _tag: "TestError"
}

declare const dequeue: Queue.Dequeue<number, TestError>

describe("Queue", () => {
  it("preserves the error type when taking data-last", () => {
    expect(Queue.takeN(2)(dequeue)).type.toBe<Effect.Effect<Array<number>, TestError>>()
  })
})
