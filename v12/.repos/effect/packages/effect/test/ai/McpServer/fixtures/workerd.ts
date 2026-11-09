import * as McpProtocol from "effect/ai/McpProtocol"
import * as McpSchema from "effect/ai/McpSchema"
import * as McpServer from "effect/ai/McpServer"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as HttpRouter from "effect/http/HttpRouter"
import * as Layer from "effect/Layer"

const ReportProgress = Layer.effectDiscard(Effect.gen(function*() {
  const server = yield* McpServer.McpServer
  yield* server.addTool({
    tool: new McpSchema.Tool({ name: "ReportProgress", inputSchema: { type: "object" } }),
    annotations: Context.empty(),
    handle: () =>
      server.notifications["notifications/progress"]({ progressToken: "progress-1", progress: 1 }).pipe(
        Effect.as(new McpSchema.CallToolResult({ content: [{ type: "text", text: "done" }] }))
      )
  })
}))

const app = ReportProgress.pipe(Layer.provideMerge(McpServer.layerHttpRequestScoped({
  name: "Workerd",
  version: "1.0.0",
  path: "/mcp",
  protocols: [McpProtocol.v2026_07_28]
})))

let handler: ((request: Request) => Promise<Response>) | undefined

export default {
  fetch(request: Request): Promise<Response> {
    // Build the app while serving the isolate's first request, as Workers apps commonly do.
    handler ??= HttpRouter.toWebHandler(app, { disableLogger: true }).handler
    return handler(request)
  }
}
