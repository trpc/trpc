import { assert, describe, it } from "@effect/vitest"
import { ChunkedMessage } from "effect/eventlog/EventLogMessage"

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
})
