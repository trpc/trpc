import * as DenoDatagramSocket from "@effect/platform-deno/DenoDatagramSocket"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"

// Deno tests in a file run concurrently; keep this global mutation isolated.
describe("DenoDatagramSocket without unstable-net", () => {
  it.effect("fails reader acquisition when listenDatagram is missing", () =>
    Effect.gen(function*() {
      const descriptor = Object.getOwnPropertyDescriptor(Deno, "listenDatagram")!
      Object.defineProperty(Deno, "listenDatagram", { ...descriptor, value: undefined })
      try {
        const socket = yield* DenoDatagramSocket.make()
        const error = yield* socket.reader.pipe(Effect.scoped, Effect.flip)
        assert.strictEqual(error.reason._tag, "DatagramSocketUnsupportedError")
        assert.match(error.message, /--unstable-net|unstable/)
      } finally {
        Object.defineProperty(Deno, "listenDatagram", descriptor)
      }
    }).pipe(Effect.timeout("5 seconds")))
})
