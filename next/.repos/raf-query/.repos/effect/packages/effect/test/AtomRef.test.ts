import { assert, describe, it } from "@effect/vitest"
import { AtomRef } from "effect/reactivity"

describe("AtomRef", () => {
  it("notifies each subscribed listener once when a listener resubscribes itself", () => {
    const ref = AtomRef.make(0)
    const calls = { A: 0, B: 0, C: 0 }

    let unsubscribeA = () => {}
    function A() {
      calls.A++
      unsubscribeA()
      unsubscribeA = ref.subscribe(A)
    }
    unsubscribeA = ref.subscribe(A)
    ref.subscribe(() => {
      calls.B++
    })
    ref.subscribe(() => {
      calls.C++
    })

    ref.set(1)

    assert.deepStrictEqual(calls, { A: 1, B: 1, C: 1 })
  })
})
