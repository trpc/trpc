import { assert, describe, it } from "@effect/vitest"
import * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as McpServer from "effect/ai/McpServer"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as HttpRouter from "effect/http/HttpRouter"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as BaseProtocolTest from "./McpConformance/BaseProtocolTest.ts"
import * as CompletionTest from "./McpConformance/CompletionTest.ts"
import { layer as makeMcpConformanceLayer } from "./McpConformance/McpConformance.ts"
import * as MultiRoundTripTest from "./McpConformance/MultiRoundTripTest.ts"
import * as PromptsTest from "./McpConformance/PromptsTest.ts"
import * as ResourcesTest from "./McpConformance/ResourcesTest.ts"
import * as ToolsTest from "./McpConformance/ToolsTest.ts"
import { makeHttpHarness, MCP_ENDPOINT } from "./TestUtils/McpHttpHarness.ts"
import { makeMcpSseReader, readMcpHttpResponse } from "./TestUtils/McpHttpResponse.ts"
import { makeServerLayer } from "./TestUtils/McpServerLayer.ts"
import { makeWorkerdHarness } from "./TestUtils/McpWorkerdHarness.ts"

const protocol = McpProtocol.v2026_07_28
const conformance = makeMcpConformanceLayer(protocol, { mode: "request" })

describe("McpServer.layerHttpRequestScoped conformance", () => {
  BaseProtocolTest.statelessModernSuite(protocol, conformance)
  ToolsTest.suite(protocol, conformance)
  ToolsTest.statelessModernSuite(protocol, conformance)
  ResourcesTest.suite(protocol, conformance)
  PromptsTest.suite(protocol, conformance, { additionalPromptNames: ["MrtrPrompt"] })
  CompletionTest.suite(protocol, conformance)
  MultiRoundTripTest.suite(protocol, conformance)
})

const progressToken = "progress-1"

const callTool = (
  name: string,
  id: number,
  args: Record<string, unknown> = {},
  metadata: Record<string, unknown> = {}
) => ({
  body: {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: {
      name,
      arguments: args,
      _meta: {
        progressToken,
        ...metadata,
        "io.modelcontextprotocol/protocolVersion": protocol.protocolVersion,
        "io.modelcontextprotocol/clientCapabilities": {},
        "io.modelcontextprotocol/clientInfo": { name: "test", version: "1.0.0" }
      }
    }
  },
  headers: {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "MCP-Protocol-Version": protocol.protocolVersion,
    "Mcp-Method": "tools/call",
    "Mcp-Name": name
  }
})

const sseMessages = (body: string): Array<Record<string, any>> =>
  body.split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)))

const toolRegistration = (
  name: string,
  handle: (server: McpServer.McpServer["Service"], args: any) => Effect.Effect<McpSchema.CallToolResult>
) =>
  Layer.effectDiscard(Effect.gen(function*() {
    const server = yield* McpServer.McpServer
    yield* server.addTool({
      tool: new McpSchema.Tool({ name, inputSchema: { type: "object" } }),
      annotations: Context.empty(),
      handle: (args) => handle(server, args)
    })
  }))

const toolLayer = (
  name: string,
  handle: (server: McpServer.McpServer["Service"], args: any) => Effect.Effect<McpSchema.CallToolResult>
) =>
  toolRegistration(name, handle).pipe(
    Layer.provideMerge(makeServerLayer({ name: "RequestMode", protocols: [protocol], mode: "request" }))
  )

const reportProgress = (server: McpServer.McpServer["Service"]) =>
  server.notifications["notifications/progress"]({ progressToken, progress: 1 }).pipe(
    Effect.as(new McpSchema.CallToolResult({ content: [{ type: "text", text: "done" }] }))
  )

describe("McpServer.layerHttpRequestScoped", () => {
  it.live("should expose tools registered after the first POST in later lists and discovery", () =>
    Effect.gen(function*() {
      const serverReady = yield* Deferred.make<McpServer.McpServer["Service"]>()
      const harness = yield* makeHttpHarness(
        Layer.effectDiscard(Effect.gen(function*() {
          yield* Deferred.succeed(serverReady, yield* McpServer.McpServer)
        })).pipe(
          Layer.provideMerge(makeServerLayer({ name: "LateRegistration", protocols: [protocol], mode: "request" }))
        )
      )
      let id = 0
      const post = Effect.fnUntraced(function*(method: "tools/list" | "server/discover") {
        const response = yield* harness.post({
          jsonrpc: "2.0",
          id: ++id,
          method,
          params: {
            _meta: {
              "io.modelcontextprotocol/protocolVersion": protocol.protocolVersion,
              "io.modelcontextprotocol/clientCapabilities": {},
              "io.modelcontextprotocol/clientInfo": { name: "test", version: "1.0.0" }
            }
          }
        }, {
          "MCP-Protocol-Version": protocol.protocolVersion,
          "Mcp-Method": method
        })
        assert.strictEqual(response.status, 200)
        const message = Schema.decodeUnknownSync(Schema.Struct({ result: Schema.JsonObject }))(
          yield* readMcpHttpResponse(response)
        )
        return message.result
      })

      assert.deepStrictEqual((yield* post("tools/list")).tools, [])
      const before = yield* post("server/discover")
      assert(Predicate.isObject(before.capabilities))
      assert.notProperty(before.capabilities, "tools")

      const server = yield* Deferred.await(serverReady)
      yield* server.addTool({
        tool: new McpSchema.Tool({ name: "LateTool", inputSchema: { type: "object" } }),
        annotations: Context.empty(),
        handle: () => Effect.succeed(new McpSchema.CallToolResult({ content: [] }))
      })

      assert.deepStrictEqual((yield* post("tools/list")).tools, [
        { name: "LateTool", inputSchema: { type: "object" } }
      ])
      const after = yield* post("server/discover")
      assert(Predicate.isObject(after.capabilities))
      assert.deepStrictEqual(after.capabilities.tools, { listChanged: false })
    }).pipe(Effect.timeout("2 seconds")))

  // https://github.com/Effect-TS/effect/issues/9026
  it.live("should let each request's services override the layer services seen by tools", () =>
    Effect.gen(function*() {
      const Label = Context.Reference<string>("test/RequestScoped/Label", { defaultValue: () => "default" })
      const { dispose, handler } = HttpRouter.toWebHandler(
        toolLayer("Label", () =>
          Effect.gen(function*() {
            return new McpSchema.CallToolResult({ content: [{ type: "text", text: yield* Label }] })
          })).pipe(Layer.provide(Layer.succeed(Label)("layer"))),
        { disableLogger: true }
      )
      yield* Effect.addFinalizer(() => Effect.promise(dispose))
      const call = (override?: string) => {
        const { body, headers } = callTool("Label", 1)
        return Effect.promise(() =>
          handler(
            new Request(MCP_ENDPOINT, { method: "POST", headers, body: JSON.stringify(body) }),
            override === undefined ? undefined : Label.context(override)
          )
        ).pipe(Effect.flatMap(readMcpHttpResponse))
      }

      for (const override of [undefined, "first", "second"]) {
        assert.nestedPropertyVal(yield* call(override), "result.content[0].text", override ?? "layer")
      }
    }))

  it.live("should serve each POST when timers from completed requests never fire", () =>
    Effect.gen(function*() {
      const worker = yield* makeWorkerdHarness(toolLayer("ReportProgress", reportProgress))
      // The first request builds the server and completes without serving MCP.
      const first = yield* worker.request(new Request(MCP_ENDPOINT, { method: "GET" }))
      assert.strictEqual(first.status, 405)

      for (const id of [1, 2]) {
        const { body, headers } = callTool("ReportProgress", id)
        const response = yield* worker.request(
          new Request(MCP_ENDPOINT, { method: "POST", headers, body: JSON.stringify(body) })
        ).pipe(Effect.timeoutOrElse({
          duration: "1 second",
          orElse: () => Effect.die(`POST ${id} stalled`)
        }))
        assert.deepStrictEqual(sseMessages(response.body).map((message) => message.method ?? message.id), [
          "notifications/progress",
          id
        ])
      }
    }))

  it.live("should interrupt the handler when the client aborts its POST", () =>
    Effect.gen(function*() {
      const entered = yield* Deferred.make<void>()
      const interrupted = yield* Deferred.make<void>()
      const { dispose, handler } = HttpRouter.toWebHandler(
        toolLayer("Block", () =>
          Deferred.succeed(entered, undefined).pipe(
            Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined))
          )),
        { disableLogger: true }
      )
      yield* Effect.addFinalizer(() => Effect.promise(dispose))
      const abort = new AbortController()
      const { body, headers } = callTool("Block", 1)
      const response = handler(
        new Request(MCP_ENDPOINT, { method: "POST", headers, body: JSON.stringify(body), signal: abort.signal })
      )
      response.catch(() => undefined)

      yield* Deferred.await(entered)
      abort.abort()
      yield* Deferred.await(interrupted).pipe(Effect.timeout("1 second"))
    }))

  for (const cancel of ["abort", "body"] as const) {
    it.live(`should interrupt a streaming handler when the client cancels by ${cancel} after headers`, () =>
      Effect.gen(function*() {
        const interrupted = yield* Deferred.make<void>()
        const { dispose, handler } = HttpRouter.toWebHandler(
          toolLayer("ProgressThenBlock", (server) =>
            reportProgress(server).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined))
            )),
          { disableLogger: true }
        )
        yield* Effect.addFinalizer(() => Effect.promise(dispose))
        const abort = new AbortController()
        const { body, headers } = callTool("ProgressThenBlock", 1)
        const response = yield* Effect.promise(() =>
          handler(
            new Request(MCP_ENDPOINT, { method: "POST", headers, body: JSON.stringify(body), signal: abort.signal })
          )
        )
        const reader = makeMcpSseReader(response)
        yield* Effect.addFinalizer(() => reader.cancel)
        assert.strictEqual((yield* reader.take()).method, "notifications/progress")

        if (cancel === "abort") abort.abort()
        else yield* reader.cancel
        yield* Deferred.await(interrupted).pipe(Effect.timeout("1 second"))
      }))
  }

  it.live("should interrupt a streaming handler when the client aborts while its unread body is full", () =>
    Effect.gen(function*() {
      const headersSent = yield* Deferred.make<void>()
      const backpressured = yield* Deferred.make<void>()
      const interrupted = yield* Deferred.make<void>()
      const { dispose, handler } = HttpRouter.toWebHandler(
        toolLayer("ProgressUnread", (server) =>
          Effect.gen(function*() {
            yield* reportProgress(server)
            yield* Deferred.await(headersSent)
            // Later chunks arrive while the client reads nothing, so the body stops pulling.
            yield* reportProgress(server)
            yield* reportProgress(server)
            yield* Deferred.succeed(backpressured, undefined)
            return yield* Effect.never
          }).pipe(Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined)))),
        { disableLogger: true }
      )
      yield* Effect.addFinalizer(() => Effect.promise(dispose))
      const abort = new AbortController()
      const { body, headers } = callTool("ProgressUnread", 1)
      const response = yield* Effect.promise(() =>
        handler(
          new Request(MCP_ENDPOINT, { method: "POST", headers, body: JSON.stringify(body), signal: abort.signal })
        )
      )
      yield* Effect.addFinalizer(() => Effect.promise(() => response.body!.cancel()))
      yield* Deferred.succeed(headersSent, undefined)
      yield* Deferred.await(backpressured)
      // Let the body stream take the next chunk and wait for a pull that never comes.
      yield* Effect.sleep("50 millis")

      abort.abort()
      yield* Deferred.await(interrupted).pipe(Effect.timeout("1 second"))
    }))

  it.live("should deliver overlapping requests only their own notifications", () =>
    Effect.gen(function*() {
      const arrived = { a: yield* Deferred.make<void>(), b: yield* Deferred.make<void>() }
      const harness = yield* makeHttpHarness(toolLayer("Overlap", (server, { marker }: { marker: "a" | "b" }) =>
        Effect.gen(function*() {
          // Both requests are in flight before either emits a notification.
          yield* Deferred.succeed(arrived[marker], undefined)
          yield* Deferred.await(arrived[marker === "a" ? "b" : "a"])
          yield* server.notifications["notifications/progress"]({ progressToken, progress: 1, message: marker })
          yield* server.notifications["notifications/message"]({ level: "info", data: marker })
          if (marker === "a") {
            yield* server.notifications["notifications/tools/list_changed"]({})
          }
          return new McpSchema.CallToolResult({ content: [{ type: "text", text: marker }] })
        })))

      const responses = yield* Effect.forEach(["a", "b"] as const, (marker) => {
        // Both requests reuse the same JSON-RPC id and progress token.
        const { body, headers } = callTool("Overlap", 1, { marker }, {
          "io.modelcontextprotocol/logLevel": "debug"
        })
        return harness.post(body, headers).pipe(
          Effect.flatMap((response) =>
            Effect.promise(() => response.text())
          ),
          Effect.map((body) => [marker, sseMessages(body)] as const)
        )
      }, { concurrency: "unbounded" }).pipe(Effect.timeout("2 seconds"))

      for (const [marker, messages] of responses) {
        assert.deepStrictEqual(
          messages.map((message) => [message.method ?? message.id, message.params ?? message.result.content]),
          [
            ["notifications/progress", { progressToken, progress: 1, message: marker }],
            ["notifications/message", { level: "info", data: marker }],
            [1, [{ type: "text", text: marker }]]
          ]
        )
      }
    }))

  it.live("should keep layerHttp notifications when a request-scoped endpoint shares the server", () =>
    Effect.gen(function*() {
      const harness = yield* makeHttpHarness(
        toolRegistration("ReportProgress", reportProgress).pipe(
          Layer.provideMerge(Layer.merge(
            makeServerLayer({ name: "DefaultMode", protocols: [protocol] }),
            McpServer.layerHttpRequestScoped({
              name: "RequestMode",
              version: "1.0.0",
              path: "/request",
              protocols: [protocol]
            })
          ))
        )
      )
      for (const path of ["/mcp", "/request"]) {
        const { body, headers } = callTool("ReportProgress", 1)
        const response = yield* Effect.promise(() =>
          harness.handler(
            new Request(new URL(path, MCP_ENDPOINT), { method: "POST", headers, body: JSON.stringify(body) })
          )
        )
        const messages = sseMessages(yield* Effect.promise(() => response.text()))
        assert.deepStrictEqual(messages.map((message) => message.method ?? message.id), [
          "notifications/progress",
          1
        ], path)
      }
    }).pipe(Effect.timeout("2 seconds")))
})
