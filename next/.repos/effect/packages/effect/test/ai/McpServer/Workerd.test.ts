import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as esbuild from "esbuild"
import { Miniflare } from "miniflare"
import { fileURLToPath } from "node:url"

const workerPath = fileURLToPath(new URL("./fixtures/workerd.ts", import.meta.url))

const bundle = Effect.promise(() =>
  esbuild.build({
    entryPoints: [workerPath],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    conditions: ["workerd", "worker", "browser"],
    write: false
  })
).pipe(Effect.map((result) => result.outputFiles[0].text), Effect.cached, Effect.runSync)

const makeWorker = Effect.gen(function*() {
  const contents = yield* bundle
  return yield* Effect.acquireRelease(
    Effect.sync(() =>
      new Miniflare({
        workers: [{
          config: {
            name: "mcp",
            compatibilityDate: "2026-09-11",
            compatibilityFlags: ["nodejs_compat"],
            manifest: { mainModule: "index.mjs", modules: { "index.mjs": { type: "esm", contents } } }
          }
        }]
      })
    ),
    (miniflare) => Effect.promise(() => miniflare.dispose())
  )
})

const progressCall = (id: number): RequestInit => ({
  method: "POST",
  headers: {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "MCP-Protocol-Version": "2026-07-28",
    "Mcp-Method": "tools/call",
    "Mcp-Name": "ReportProgress"
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: {
      name: "ReportProgress",
      arguments: {},
      _meta: {
        progressToken: "progress-1",
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientCapabilities": {},
        "io.modelcontextprotocol/clientInfo": { name: "test", version: "1.0.0" }
      }
    }
  })
})

// https://github.com/Effect-TS/effect/issues/9026
describe("McpServer.layerHttpRequestScoped on workerd", () => {
  for (const first of ["GET", "warm-up POST"] as const) {
    it.live(`should serve repeated progress calls after a ${first} builds the app`, () =>
      Effect.gen(function*() {
        const worker = yield* makeWorker
        const fetch = (init: RequestInit) =>
          Effect.promise(async () => {
            const response = await worker.dispatchFetch("http://localhost/mcp", init as any)
            return { status: response.status, body: await response.text() }
          }).pipe(Effect.timeoutOrElse({ duration: "5 seconds", orElse: () => Effect.die("request stalled") }))

        const built = yield* fetch(first === "GET" ? { method: "GET" } : progressCall(0))
        assert.strictEqual(built.status, first === "GET" ? 405 : 200, built.body)

        for (const id of [1, 2]) {
          const response = yield* fetch(progressCall(id))
          // workerd answers 500 when it detects that a request can never complete.
          assert.strictEqual(response.status, 200, response.body)
          const messages = response.body.split("\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => JSON.parse(line.slice(6)))
          assert.deepStrictEqual(messages.map((message) => message.method ?? message.id), [
            "notifications/progress",
            id
          ])
        }
      }), { timeout: 60_000 })
  }
})
