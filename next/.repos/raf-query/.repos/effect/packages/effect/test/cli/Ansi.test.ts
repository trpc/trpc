import { assert, it } from "@effect/vitest"
import * as Ansi from "effect/cli/internal/ansi"

it("emits a standard CSI horizontal absolute sequence", () => {
  assert.strictEqual(Ansi.cursorTo(0), "\x1b[1G")
})

it("emits a standard CSI cursor-position sequence", () => {
  assert.strictEqual(Ansi.cursorTo(2, 3), "\x1b[4;3H")
})
