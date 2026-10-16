import { useAtomRef } from "@effect/atom-vue"
import { assert, describe, it } from "@effect/vitest"
import * as AtomRef from "effect/reactivity/AtomRef"
import { effectScope, nextTick, shallowRef } from "vue"

describe("atom-vue", () => {
  describe("useAtomRef", () => {
    it("publishes the current value when the selected ref changes", async () => {
      const first = AtomRef.make(1)
      const second = AtomRef.make(10)
      const selected = shallowRef(first)
      const scope = effectScope()
      try {
        const value = scope.run(() => useAtomRef(() => selected.value))!

        selected.value = second
        await nextTick()
        assert.strictEqual(value.value, 10)
      } finally {
        scope.stop()
      }
    })
  })
})
