import * as McpProtocol from "effect/ai/McpProtocol"
import * as McpServer from "effect/ai/McpServer"
import { constVoid } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Logger from "effect/Logger"
import * as References from "effect/References"
import type * as Schema from "effect/Schema"

const noopLogger = Logger.make(constVoid)
type Protocols = readonly [McpProtocol.ProtocolAdapter, ...Array<McpProtocol.ProtocolAdapter>]
type StatelessAdapter = McpProtocol.ProtocolAdapter<McpProtocol.ProtocolVersion, McpProtocol.StatelessRuntimeDescriptor>
type StatelessProtocols = readonly [StatelessAdapter, ...Array<StatelessAdapter>]
interface Options<P extends Protocols> {
  readonly name: string
  readonly version?: string | undefined
  readonly instructions?: string | undefined
  readonly protocols?: P | undefined
  readonly extensions?: Readonly<Record<`${string}/${string}`, Schema.Json>> | undefined
  readonly cacheHints?: McpServer.CacheHints | undefined
  readonly allowedOrigins?: ReadonlyArray<string> | undefined
  readonly allowSessionTermination?: boolean | undefined
  readonly loggers?: ReadonlyArray<Logger.Logger<unknown, any>> | undefined
}

// Keep each transport's provided request services visible to callers.
export function makeServerLayer<const P extends Protocols = readonly [typeof McpProtocol.v2025_06_18]>(
  options: Options<P> & { readonly mode?: "server" | undefined }
): ReturnType<typeof McpServer.layerHttp<P>>
export function makeServerLayer<const P extends StatelessProtocols>(
  options: Options<P> & { readonly protocols: P; readonly mode: "request" }
): ReturnType<typeof McpServer.layerHttpRequestScoped<P>>
export function makeServerLayer(
  options: Options<Protocols> & { readonly mode?: "server" | "request" | undefined }
):
  | ReturnType<typeof McpServer.layerHttp<Protocols>>
  | ReturnType<typeof McpServer.layerHttpRequestScoped<StatelessProtocols>>
export function makeServerLayer(options: Options<Protocols> & { readonly mode?: "server" | "request" | undefined }) {
  const common = {
    name: options.name,
    version: options.version ?? "1.0.0",
    instructions: options.instructions,
    path: "/mcp" as const,
    protocols: options.protocols ?? [McpProtocol.v2025_06_18],
    allowedOrigins: ["https://allowed.example"],
    extensions: options.extensions,
    cacheHints: options.cacheHints
  }
  const loggers = Layer.succeed(References.CurrentLoggers, new Set(options.loggers ?? [noopLogger]))
  if (options.mode === "request") {
    const protocols = common.protocols.filter((protocol): protocol is StatelessAdapter =>
      protocol.runtime._tag === "Stateless"
    )
    const first = protocols[0]
    if (first === undefined || protocols.length !== common.protocols.length) {
      throw new Error("Request-mode test servers require only stateless protocols")
    }
    return McpServer.layerHttpRequestScoped({ ...common, protocols: [first, ...protocols.slice(1)] }).pipe(
      Layer.provideMerge(loggers)
    )
  }
  return McpServer.layerHttp({ ...common, allowSessionTermination: options.allowSessionTermination }).pipe(
    Layer.provideMerge(loggers)
  )
}
