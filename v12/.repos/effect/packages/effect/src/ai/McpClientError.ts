/**
 * Errors produced by `McpClient` operations and transports.
 *
 * Every failure is an `McpClientError` whose `reason` is one of the reason
 * classes in this module: transport, protocol, HTTP, unsupported feature,
 * closed connection, timeout, limit, configuration, validation or
 * tool-reported errors.
 *
 * @stability experimental
 * @since 4.0.6
 */
import * as Predicate from "../Predicate.ts"
import * as Schema from "../Schema.ts"
import * as McpSchema from "./McpSchema.ts"

const TypeId = "~effect/ai/McpClientError" as const
const ReasonTypeId = "~effect/ai/McpClientError/Reason" as const

/**
 * The connection to the server failed: a process or HTTP request could not be
 * started, written or read, or ended before the response.
 *
 * @stability experimental
 * @category reasons
 * @since 4.0.6
 */
export class TransportError extends Schema.Error<TransportError>("effect/ai/McpClientError/TransportError")({
  _tag: Schema.tag("TransportError"),
  description: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Defect())
}) {
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return this.description ?? "MCP transport failed"
  }
}

/**
 * The server returned a JSON-RPC error, or sent a message that is not valid
 * JSON-RPC for the selected protocol.
 *
 * @stability experimental
 * @category reasons
 * @since 4.0.6
 */
export class ProtocolError extends Schema.Error<ProtocolError>("effect/ai/McpClientError/ProtocolError")({
  _tag: Schema.tag("ProtocolError"),
  code: Schema.optional(Schema.Int),
  data: Schema.optional(Schema.Unknown),
  description: Schema.optional(Schema.String),
  cause: Schema.optional(Schema.Defect())
}) {
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    const message = this.description ?? "MCP protocol error"
    return this.code === undefined ? message : `${message} (code ${this.code})`
  }
}

/**
 * The server answered an HTTP request with a non-success status. A JSON-RPC
 * error in the response body supplies `code`, `data` and `description`.
 *
 * @stability experimental
 * @category reasons
 * @since 4.0.6
 */
export class HttpError extends Schema.Error<HttpError>("effect/ai/McpClientError/HttpError")({
  _tag: Schema.tag("HttpError"),
  status: Schema.Int,
  code: Schema.optional(Schema.Int),
  data: Schema.optional(Schema.Unknown),
  description: Schema.optional(Schema.String),
  wwwAuthenticate: Schema.optional(Schema.String),
  retryAfter: Schema.optional(Schema.String)
}) {
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    const message = `MCP HTTP status ${this.status}`
    return this.description === undefined ? message : `${message}: ${this.description}`
  }
}

/**
 * The server or the selected protocol does not support the requested
 * operation, or a tool result cannot be converted for a language model.
 *
 * @stability experimental
 * @category reasons
 * @since 4.0.6
 */
export class UnsupportedError extends Schema.Error<UnsupportedError>("effect/ai/McpClientError/UnsupportedError")({
  _tag: Schema.tag("UnsupportedError"),
  description: Schema.String,
  result: Schema.optional(McpSchema.CallToolResult)
}) {
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return this.description
  }
}

/**
 * The client, its transport or its legacy HTTP session is closed.
 *
 * @stability experimental
 * @category reasons
 * @since 4.0.6
 */
export class ClosedError extends Schema.Error<ClosedError>("effect/ai/McpClientError/ClosedError")({
  _tag: Schema.tag("ClosedError"),
  sessionExpired: Schema.optional(Schema.Boolean),
  description: Schema.optional(Schema.String)
}) {
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return this.sessionExpired === true ? "MCP session expired" : this.description ?? "MCP connection closed"
  }
}

/**
 * An operation did not complete within its deadline.
 *
 * @stability experimental
 * @category reasons
 * @since 4.0.6
 */
export class TimeoutError extends Schema.Error<TimeoutError>("effect/ai/McpClientError/TimeoutError")({
  _tag: Schema.tag("TimeoutError"),
  operation: Schema.String
}) {
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return `MCP ${this.operation} deadline exceeded`
  }
}

/**
 * A message or a discovery scan exceeded a client limit.
 *
 * @stability experimental
 * @category reasons
 * @since 4.0.6
 */
export class LimitError extends Schema.Error<LimitError>("effect/ai/McpClientError/LimitError")({
  _tag: Schema.tag("LimitError"),
  description: Schema.String
}) {
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return this.description
  }
}

/**
 * Client or toolkit options are invalid.
 *
 * @stability experimental
 * @category reasons
 * @since 4.0.6
 */
export class ConfigurationError
  extends Schema.Error<ConfigurationError>("effect/ai/McpClientError/ConfigurationError")({
    _tag: Schema.tag("ConfigurationError"),
    description: Schema.String,
    cause: Schema.optional(Schema.Defect())
  })
{
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return this.description
  }
}

/**
 * A request payload, tool argument or result failed schema validation.
 *
 * @stability experimental
 * @category reasons
 * @since 4.0.6
 */
export class ValidationError extends Schema.Error<ValidationError>("effect/ai/McpClientError/ValidationError")({
  _tag: Schema.tag("ValidationError"),
  description: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    return this.description
  }
}

/**
 * A tool reported an execution error with `isError`. The complete result is
 * retained.
 *
 * @stability experimental
 * @category reasons
 * @since 4.0.6
 */
export class ToolError extends Schema.Error<ToolError>("effect/ai/McpClientError/ToolError")({
  _tag: Schema.tag("ToolError"),
  result: McpSchema.CallToolResult
}) {
  readonly [ReasonTypeId] = ReasonTypeId

  override get message(): string {
    const text = this.result.content.find((block) => block.type === "text")
    return text === undefined ? "MCP tool reported an error" : `MCP tool reported an error: ${text.text}`
  }
}

/**
 * Union of MCP client and transport failure reasons.
 *
 * @stability experimental
 * @category models
 * @since 4.0.6
 */
export type McpClientErrorReason =
  | TransportError
  | ProtocolError
  | HttpError
  | UnsupportedError
  | ClosedError
  | TimeoutError
  | LimitError
  | ConfigurationError
  | ValidationError
  | ToolError

/**
 * Schema for the reasons carried by an `McpClientError`.
 *
 * @stability experimental
 * @category schemas
 * @since 4.0.6
 */
export const McpClientErrorReason: Schema.Union<[
  typeof TransportError,
  typeof ProtocolError,
  typeof HttpError,
  typeof UnsupportedError,
  typeof ClosedError,
  typeof TimeoutError,
  typeof LimitError,
  typeof ConfigurationError,
  typeof ValidationError,
  typeof ToolError
]> = Schema.Union([
  TransportError,
  ProtocolError,
  HttpError,
  UnsupportedError,
  ClosedError,
  TimeoutError,
  LimitError,
  ConfigurationError,
  ValidationError,
  ToolError
])

/**
 * Error wrapping an MCP client or transport failure reason.
 *
 * **Details**
 *
 * Use `Effect.catchReason` or `Effect.catchReasons` to recover from selected
 * reasons. The error's `message` and `cause` come from its reason.
 *
 * **Example** (Recovering from a deadline failure)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { McpClientError } from "effect/ai"
 *
 * const operation = Effect.fail(new McpClientError.McpClientError({
 *   reason: new McpClientError.TimeoutError({ operation: "tools/call" })
 * }))
 * const recovered = operation.pipe(
 *   Effect.catchReason("McpClientError", "TimeoutError", () => Effect.succeed("deferred"))
 * )
 *
 * await Effect.runPromise(recovered) // => "deferred"
 * ```
 *
 * @stability experimental
 * @category errors
 * @since 4.0.6
 */
export class McpClientError extends Schema.Error<McpClientError>("effect/ai/McpClientError/McpClientError")({
  _tag: Schema.tag("McpClientError"),
  reason: McpClientErrorReason
}) {
  readonly [TypeId] = TypeId

  override readonly cause = this.reason

  override get message(): string {
    return this.reason.message
  }
}

/**
 * Returns whether a value is an `McpClientError`.
 *
 * @stability experimental
 * @category guards
 * @since 4.0.6
 */
export const isMcpClientError = (u: unknown): u is McpClientError => Predicate.hasProperty(u, TypeId)

/**
 * Returns whether a value is one of the `McpClientError` reasons.
 *
 * @stability experimental
 * @category guards
 * @since 4.0.6
 */
export const isMcpClientErrorReason = (u: unknown): u is McpClientErrorReason => Predicate.hasProperty(u, ReasonTypeId)
