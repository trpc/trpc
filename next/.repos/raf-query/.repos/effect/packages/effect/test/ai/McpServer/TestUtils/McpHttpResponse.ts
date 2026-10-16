import { assert } from "@effect/vitest"
import * as Effect from "effect/Effect"
import type { JsonRpcMessage } from "./McpStdioHarness.ts"

export const readMcpHttpResponse = (response: Response): Effect.Effect<unknown> =>
  Effect.promise(async () => {
    if (!response.headers.get("content-type")?.includes("text/event-stream")) {
      return response.json()
    }
    const messages = (await response.text())
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)))
    return messages.at(-1)
  })

export const makeMcpSseReader = (response: Response) => {
  assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream(?:;|$)/)
  const body = response.body
  assert.isNotNull(body)
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let pending = ""
  const takeOrEnd = Effect.fnUntraced(function*() {
    while (true) {
      const boundary = pending.indexOf("\n\n")
      if (boundary !== -1) {
        const event = pending.slice(0, boundary)
        pending = pending.slice(boundary + 2)
        const data = event.split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n")
        if (data.length > 0) {
          return JSON.parse(data) as JsonRpcMessage
        }
        continue
      }
      const chunk = yield* Effect.promise(() => reader.read())
      if (chunk.done) {
        return undefined
      }
      pending += decoder.decode(chunk.value, { stream: true }).replaceAll("\r\n", "\n")
    }
  })
  const take = Effect.fnUntraced(function*() {
    const message = yield* takeOrEnd()
    assert.isDefined(message)
    return message
  })
  return {
    take,
    drain: Effect.fnUntraced(function*() {
      const messages: Array<JsonRpcMessage> = []
      while (true) {
        const message = yield* takeOrEnd()
        if (message === undefined) {
          return messages
        }
        messages.push(message)
      }
    }),
    cancel: Effect.promise(() => reader.cancel())
  }
}
