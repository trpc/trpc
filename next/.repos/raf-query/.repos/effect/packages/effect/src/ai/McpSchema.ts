/**
 * Defines schemas for Model Context Protocol messages.
 *
 * MCP clients and servers use these schemas to describe the JSON-RPC requests,
 * notifications, results, and errors that can cross the protocol boundary.
 * This is the stable public compatibility and authoring surface. It is not an
 * exact dated wire contract: MCP protocol adapters use frozen schemas under
 * `internal/mcpSchema` for decoding and encoding. This module groups the
 * current public message model for application authors and provides helpers
 * for optional fields and parameter metadata. Transport and server behavior
 * live in other modules.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import { constFalse, constTrue } from "../Function.ts"
import * as Option from "../Option.ts"
import * as Predicate from "../Predicate.ts"
import * as Rpc from "../rpc/Rpc.ts"
import * as RpcGroup from "../rpc/RpcGroup.ts"
import * as RpcMiddleware from "../rpc/RpcMiddleware.ts"
import * as Schema from "../Schema.ts"
import * as SchemaGetter from "../SchemaGetter.ts"
import type * as Scope from "../Scope.ts"
import type { ProtocolVersion, StatefulProtocolVersion } from "./McpProtocol.ts"

/**
 * Schema type returned by `optionalWithDefault`.
 *
 * **Details**
 *
 * It represents an optional struct field that supplies a default value when the
 * field is absent during decoding or construction.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface optionalWithDefault<S extends Schema.Constraint & Schema.WithoutConstructorDefault>
  extends Schema.withConstructorDefault<Schema.decodeTo<Schema.toType<Schema.optionalKey<S>>, Schema.optionalKey<S>>>
{}

/**
 * Marks a struct field as optional and supplies `defaultValue` when the field
 * is absent.
 *
 * **Details**
 *
 * The default is used during decoding and as the constructor default for the
 * schema field.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const optionalWithDefault = <S extends Schema.Constraint & Schema.WithoutConstructorDefault>(
  schema: S,
  defaultValue: () => Schema.optionalKey<S>["Type"]
): optionalWithDefault<S> => {
  const effect = Effect.sync(defaultValue)
  return Schema.optionalKey(schema).pipe(
    Schema.decode<Schema.optionalKey<S>>({
      decode: SchemaGetter.withDefault(effect),
      encode: SchemaGetter.passthrough()
    }),
    Schema.withConstructorDefault<
      Schema.decodeTo<Schema.toType<Schema.optionalKey<S>>, Schema.optionalKey<S>>
    >(effect)
  )
}

/**
 * Creates an optional MCP struct-field schema from a required schema.
 *
 * **Details**
 *
 * The field may be absent, and explicit `undefined` values are omitted when
 * encoding.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const optional = <S extends Schema.Constraint>(
  schema: S
): Schema.decodeTo<Schema.toType<Schema.optional<S>>, Schema.optionalKey<S>> =>
  Schema.optionalKey(schema).pipe(
    Schema.decodeTo(Schema.toType(Schema.optional(schema)), {
      decode: SchemaGetter.passthrough(),
      encode: SchemaGetter.transformOptional(Option.flatMap(Option.fromUndefinedOr))
    })
  )

// =============================================================================
// Common
// =============================================================================

/**
 * Schema for JSON-RPC request identifiers, allowing string or number ids.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const RequestId: Schema.Union<[
  typeof Schema.String,
  typeof Schema.Finite
]> = Schema.Union([Schema.String, Schema.Finite])

/**
 * Type represented by the JSON-RPC request identifier schema.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type RequestId = typeof RequestId.Type

/**
 * Schema for MCP progress tokens that associate progress notifications with the
 * original request.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ProgressToken: Schema.Union<[
  typeof Schema.String,
  typeof Schema.Finite
]> = Schema.Union([Schema.String, Schema.Finite])

/**
 * Type represented by the MCP progress token schema.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ProgressToken = typeof ProgressToken.Type

/**
 * Schema for optional MCP request metadata.
 *
 * **Details**
 *
 * Request metadata may include a progress token that asks the receiver to send
 * out-of-band progress notifications for the request.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class RequestMeta extends Schema.Opaque<RequestMeta>()(Schema.Struct({
  _meta: optional(Schema.StructWithRest(
    Schema.Struct({
      /**
       * If specified, the caller is requesting out-of-band progress notifications
       * for this request (as represented by notifications/progress). The value of
       * this parameter is an opaque token that will be attached to any subsequent
       * notifications. The receiver is not obligated to provide these
       * notifications.
       */
      progressToken: optional(ProgressToken)
    }),
    [Schema.JsonObject]
  ))
})) {}

/**
 * Schema for optional MCP result metadata.
 *
 * **Details**
 *
 * The `_meta` field is reserved for protocol, extension, or implementation
 * metadata attached to a result.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ResultMeta extends Schema.Opaque<ResultMeta>()(Schema.Struct({
  /**
   * This result property is reserved by the protocol to allow clients and
   * servers to attach additional metadata to their responses.
   */
  _meta: optional(Schema.JsonObject)
})) {}

/**
 * Schema for optional MCP notification metadata.
 *
 * **Details**
 *
 * The `_meta` field is reserved for protocol, extension, or implementation
 * metadata attached to a notification.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class NotificationMeta extends Schema.Opaque<NotificationMeta>()(Schema.Struct({
  /**
   * This parameter name is reserved by MCP to allow clients and servers to
   * attach additional metadata to their notifications.
   */
  _meta: optional(Schema.JsonObject)
})) {}

/**
 * Schema for opaque cursor tokens used in pagination.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Cursor: typeof Schema.String = Schema.String

/**
 * Type represented by the MCP cursor schema.
 *
 * **Details**
 *
 * A cursor is an opaque string token used to continue paginated requests.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Cursor = typeof Cursor.Type

/**
 * Schema for MCP request metadata used by paginated requests.
 *
 * **Details**
 *
 * It includes the base request metadata fields plus an optional cursor
 * indicating where the server should continue listing results.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class PaginatedRequestMeta extends Schema.Opaque<PaginatedRequestMeta>()(Schema.Struct({
  ...RequestMeta.fields,
  /**
   * An opaque token representing the current pagination position.
   * If provided, the server should return results starting after this cursor.
   */
  cursor: optional(Cursor)
})) {}

/**
 * Schema for MCP result metadata returned by paginated operations.
 *
 * **Details**
 *
 * It includes the base result metadata fields plus an optional `nextCursor`,
 * which indicates that more results may be available.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class PaginatedResultMeta extends Schema.Opaque<PaginatedResultMeta>()(Schema.Struct({
  ...ResultMeta.fields,
  /**
   * An opaque token representing the pagination position after the last returned result.
   * If present, there may be more results available.
   */
  nextCursor: optional(Cursor)
})) {}

/**
 * Schema for MCP conversation roles, allowing user and assistant.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const Role: Schema.Literals<["user", "assistant"]> = Schema.Literals(["user", "assistant"])

/**
 * Type represented by the MCP role schema.
 *
 * **Details**
 *
 * Valid roles are `"user"` and `"assistant"`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Role = typeof Role.Type

/**
 * Schema for optional client-facing annotations on MCP objects.
 *
 * **When to use**
 *
 * Use to describe intended audience and priority metadata for objects shown or
 * processed by a client.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class Annotations extends Schema.Opaque<Annotations>()(Schema.Struct({
  /**
   * Describes who the intended customer of this object or data is.
   *
   * It can include multiple entries to indicate content useful for multiple
   * audiences (e.g., `["user", "assistant"]`).
   */
  audience: optional(Schema.Array(Role)),
  /**
   * Describes how important this data is for operating the server.
   *
   * A value of 1 means "most important," and indicates that the data is
   * effectively required, while 0 means "least important," and indicates that
   * the data is entirely optional.
   */
  priority: optional(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  /**
   * The last time the annotated object was modified, formatted as an ISO 8601
   * timestamp.
   */
  lastModified: optional(Schema.String)
})) {}

/**
 * Schema for an icon that an MCP client can display.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class Icon extends Schema.Class<Icon>("@effect/ai/McpSchema/Icon")({
  /**
   * URI containing the icon image.
   */
  src: Schema.String,
  /**
   * MIME type of the icon, when known.
   */
  mimeType: optional(Schema.String),
  /**
   * Sizes supported by the icon, such as `"48x48"` or `"any"`.
   */
  sizes: optional(Schema.Array(Schema.String)),
  /**
   * Color theme for which the icon was designed.
   */
  theme: optional(Schema.Literals(["light", "dark"]))
}) {}

/**
 * Describes the name and version of an MCP implementation.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class Implementation extends Schema.Opaque<Implementation>()(Schema.Struct({
  name: Schema.String,
  title: optional(Schema.String),
  version: Schema.String,
  icons: optional(Schema.Array(Icon)),
  description: optional(Schema.String),
  websiteUrl: optional(Schema.String)
})) {}

/**
 * Describes capabilities advertised by an MCP client.
 *
 * **When to use**
 *
 * Use to describe which optional MCP features a client supports during
 * initialization.
 *
 * **Details**
 *
 * Known capabilities are represented by this schema, but the capability set is
 * open and clients may define additional capabilities.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ClientCapabilities extends Schema.Class<ClientCapabilities>(
  "@effect/ai/McpSchema/ClientCapabilities"
)({
  /**
   * Experimental, non-standard capabilities that the client supports.
   */
  experimental: optional(Schema.Record(Schema.String, Schema.Struct({}))),
  /**
   * Optional extensions capabilities advertised by the client.
   * Keys are extension identifiers following <vendor-prefix>/<extension-name> (e.g. "io.modelcontextprotocol/ui").
   */
  extensions: optional(Schema.Record(Schema.TemplateLiteral([Schema.String, "/", Schema.String]), Schema.Json)),
  /**
   * Present if the client supports listing roots.
   */
  roots: optional(Schema.Struct({
    /**
     * Whether the client supports notifications for changes to the roots list.
     */
    listChanged: optional(Schema.Boolean)
  })),
  /**
   * Present if the client supports sampling from an LLM.
   */
  sampling: optional(Schema.Struct({
    /**
     * Present if the client supports context inclusion during sampling.
     */
    context: optional(Schema.Struct({})),
    /**
     * Present if the client supports tool use during sampling.
     */
    tools: optional(Schema.Struct({}))
  })),
  /**
   * Present if the client supports elicitation from the server.
   */
  elicitation: optional(Schema.Struct({
    /**
     * Present if the client supports form-mode elicitation.
     */
    form: optional(Schema.Struct({})),
    /**
     * Present if the client supports URL-mode elicitation.
     */
    url: optional(Schema.Struct({}))
  }))
}) {}

/**
 * Describes capabilities advertised by an MCP server.
 *
 * **When to use**
 *
 * Use to describe which optional MCP features a server supports during
 * initialization.
 *
 * **Details**
 *
 * Known capabilities are represented by this schema, but the capability set is
 * open and servers may define additional capabilities.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ServerCapabilities extends Schema.Opaque<ServerCapabilities>()(Schema.Struct({
  /**
   * Experimental, non-standard capabilities that the server supports.
   */
  experimental: optional(Schema.Record(Schema.String, Schema.Struct({}))),
  /**
   * Optional extensions capabilities advertised by the server.
   * Keys are extension identifiers following <vendor-prefix>/<extension-name> (e.g. "io.modelcontextprotocol/ui").
   */
  extensions: optional(Schema.Record(Schema.TemplateLiteral([Schema.String, "/", Schema.String]), Schema.Json)),
  /**
   * Present if the server supports sending log messages to the client.
   */
  logging: optional(Schema.Struct({})),
  /**
   * Present if the server supports argument autocompletion suggestions.
   */
  completions: optional(Schema.Struct({})),
  /**
   * Present if the server offers any prompt templates.
   */
  prompts: optional(Schema.Struct({
    /**
     * Whether this server supports notifications for changes to the prompt list.
     */
    listChanged: optional(Schema.Boolean)
  })),
  /**
   * Present if the server offers any resources to read.
   */
  resources: optional(Schema.Struct({
    /**
     * Whether this server supports subscribing to resource updates.
     */
    subscribe: optional(Schema.Boolean),
    /**
     * Whether this server supports notifications for changes to the resource list.
     */
    listChanged: optional(Schema.Boolean)
  })),
  /**
   * Present if the server offers any tools to call.
   */
  tools: optional(Schema.Struct({
    /**
     * Whether this server supports notifications for changes to the tool list.
     */
    listChanged: optional(Schema.Boolean)
  }))
})) {}

// =============================================================================
// Errors
// =============================================================================

/**
 * Schema for MCP and JSON-RPC error objects.
 *
 * **Details**
 *
 * It contains the numeric error `code`, a concise `message`, and optional
 * sender-defined `data`.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class McpErrorBase extends Schema.Class<McpErrorBase>(
  "@effect/ai/McpSchema/McpErrorBase"
)({
  /**
   * The error type that occurred.
   */
  code: Schema.Int,
  /**
   * A short description of the error. The message SHOULD be limited to a
   * concise single sentence.
   */
  message: Schema.String,
  /**
   * Additional information about the error. The value of this member is
   * defined by the sender (e.g. detailed error information, nested errors etc.).
   */
  data: optional(Schema.Any)
}) {}

/**
 * Represents the JSON-RPC error code for requests that are not valid request objects.
 *
 * **When to use**
 *
 * Use when building an MCP/JSON-RPC error response for a syntactically parsed
 * request object that fails request-shape validation.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const INVALID_REQUEST_ERROR_CODE = -32600 as const
/**
 * Represents the JSON-RPC error code for requests whose method does not exist or is not
 * available.
 *
 * **When to use**
 *
 * Use when building an MCP/JSON-RPC error response for a request whose
 * `method` is unknown or unavailable.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const METHOD_NOT_FOUND_ERROR_CODE = -32601 as const
/**
 * Represents the JSON-RPC error code for invalid method parameters.
 *
 * **When to use**
 *
 * Use when building an MCP/JSON-RPC error response for decoded request
 * parameters that fail method-specific validation.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const INVALID_PARAMS_ERROR_CODE = -32602 as const
/**
 * Represents the JSON-RPC error code for internal server errors.
 *
 * **When to use**
 *
 * Use when building an MCP/JSON-RPC error response for an unexpected
 * server-side failure.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const INTERNAL_ERROR_CODE = -32603 as const
/**
 * Represents the JSON-RPC error code for invalid JSON that could not be parsed.
 *
 * **When to use**
 *
 * Use when building an MCP/JSON-RPC error response before a request object is
 * available because the JSON payload could not be parsed.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const PARSE_ERROR_CODE = -32700 as const

/**
 * Represents the MCP error code for HTTP headers that do not match the
 * corresponding request values.
 *
 * **When to use**
 *
 * Use when building an MCP error response for missing, malformed, or
 * mismatched request-routing headers.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const HEADER_MISMATCH_ERROR_CODE = -32020 as const

/**
 * Represents an MCP/JSON-RPC error for invalid JSON that could not be parsed.
 *
 * **When to use**
 *
 * Use to report a JSON parse failure before a valid JSON-RPC request object is
 * available.
 *
 * **Details**
 *
 * Uses the standard JSON-RPC parse error code `-32700`.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class ParseError extends Schema.Error<ParseError>("effect/ai/McpSchema/ParseError")({
  ...McpErrorBase.fields,
  _tag: Schema.tag("ParseError"),
  code: Schema.tag(PARSE_ERROR_CODE)
}) {}

/**
 * Represents an MCP/JSON-RPC error for a request object that is not valid.
 *
 * **When to use**
 *
 * Use to report a syntactically parsed JSON-RPC request that is not a valid
 * request object.
 *
 * **Details**
 *
 * Uses the standard JSON-RPC invalid request code `-32600`.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class InvalidRequest extends Schema.Error<InvalidRequest>("effect/ai/McpSchema/InvalidRequest")({
  ...McpErrorBase.fields,
  _tag: Schema.tag("InvalidRequest"),
  code: Schema.tag(INVALID_REQUEST_ERROR_CODE)
}) {}

/**
 * Represents an MCP/JSON-RPC error for an unavailable method.
 *
 * **When to use**
 *
 * Use to report a JSON-RPC method that does not exist or is not available.
 *
 * **Details**
 *
 * Uses the standard JSON-RPC method-not-found code `-32601`.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class MethodNotFound extends Schema.Error<MethodNotFound>("effect/ai/McpSchema/MethodNotFound")({
  ...McpErrorBase.fields,
  _tag: Schema.tag("MethodNotFound"),
  code: Schema.tag(METHOD_NOT_FOUND_ERROR_CODE)
}) {}

/**
 * Represents an MCP/JSON-RPC error for invalid method parameters.
 *
 * **When to use**
 *
 * Use to report a request whose method parameters do not match the method
 * schema.
 *
 * **Details**
 *
 * Uses the standard JSON-RPC invalid params code `-32602`.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class InvalidParams extends Schema.Error<InvalidParams>("effect/ai/McpSchema/InvalidParams")({
  ...McpErrorBase.fields,
  _tag: Schema.tag("InvalidParams"),
  code: Schema.tag(INVALID_PARAMS_ERROR_CODE)
}) {}

/**
 * Represents an MCP/JSON-RPC error for unexpected internal server failures.
 *
 * **When to use**
 *
 * Use to report an unexpected server-side failure while handling a valid
 * request.
 *
 * **Details**
 *
 * Uses the standard JSON-RPC internal error code `-32603` and includes
 * `InternalError.notImplemented` for unimplemented handlers.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class InternalError extends Schema.Error<InternalError>("effect/ai/McpSchema/InternalError")({
  ...McpErrorBase.fields,
  _tag: Schema.tag("InternalError"),
  code: Schema.tag(INTERNAL_ERROR_CODE)
}) {
  static readonly notImplemented = new InternalError({ message: "Not implemented" })
}

/**
 * Schema for MCP protocol errors returned in JSON-RPC failure responses,
 * including standard protocol errors and custom `McpErrorBase` values.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export const McpError = Schema.Union([
  ParseError,
  InvalidRequest,
  MethodNotFound,
  InvalidParams,
  InternalError,
  McpErrorBase
])

/**
 * Type represented by the MCP protocol error schema.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type McpError = typeof McpError.Type

// =============================================================================
// Ping
// =============================================================================

/**
 * Represents an MCP ping request used to check whether the peer is still alive.
 *
 * **When to use**
 *
 * Use to implement client or server liveness checks.
 *
 * **Details**
 *
 * The receiver should respond promptly; otherwise the sender may disconnect.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class Ping extends Rpc.make("ping", {
  success: Schema.Struct({}),
  error: McpError,
  payload: Schema.UndefinedOr(RequestMeta)
}) {}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Schema for the server's response to an initialize request from the client.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class InitializeResult extends Schema.Opaque<InitializeResult>()(Schema.Struct({
  ...ResultMeta.fields,
  /**
   * The version of the Model Context Protocol that the server wants to use.
   * This may not match the version that the client requested. If the client
   * cannot support this version, it MUST disconnect.
   */
  protocolVersion: Schema.String,
  capabilities: ServerCapabilities,
  serverInfo: Implementation,
  /**
   * Instructions describing how to use the server and its features.
   *
   * This can be used by clients to improve the LLM's understanding of available
   * tools, resources, etc. It can be thought of like a "hint" to the model.
   * For example, this information MAY be added to the system prompt.
   */
  instructions: optional(Schema.String)
})) {}

/**
 * Sent from the client to the server when it first connects, asking it to begin
 * initialization.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class Initialize extends Rpc.make("initialize", {
  success: InitializeResult,
  error: McpError,
  payload: {
    ...RequestMeta.fields,
    /**
     * The latest version of the Model Context Protocol that the client
     * supports. The client MAY decide to support older versions as well.
     */
    protocolVersion: Schema.String,
    /**
     * Capabilities a client may support. Known capabilities are defined here,
     * in this schema, but this is not a closed set: any client can define its
     * own, additional capabilities.
     */
    capabilities: ClientCapabilities,
    /**
     * Describes the name and version of an MCP implementation.
     */
    clientInfo: Implementation
  }
}) {}

/**
 * Sent from the client to the server after initialization has finished.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class InitializedNotification extends Rpc.make("notifications/initialized", {
  payload: Schema.UndefinedOr(NotificationMeta)
}) {}

// =============================================================================
// Cancellation
// =============================================================================

/**
 * Sent from either peer to cancel a previously issued request in the same
 * direction.
 *
 * **Details**
 *
 * The payload identifies the request to cancel and may include a
 * human-readable reason.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class CancelledNotification extends Rpc.make("notifications/cancelled", {
  payload: {
    ...NotificationMeta.fields,
    /**
     * The ID of the request to cancel.
     *
     * This MUST correspond to the ID of a request previously issued in the
     * same direction.
     */
    requestId: RequestId,
    /**
     * An optional string describing the reason for the cancellation. This MAY
     * be logged or presented to the user.
     */
    reason: optional(Schema.String)
  }
}) {}

// =============================================================================
// Progress
// =============================================================================

/**
 * Sent from either peer to report progress for a long-running request.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class ProgressNotification extends Rpc.make("notifications/progress", {
  payload: {
    ...NotificationMeta.fields,
    /**
     * The progress token which was given in the initial request, used to
     * associate this notification with the request that is proceeding.
     */
    progressToken: ProgressToken,
    /**
     * The progress thus far. This should increase every time progress is made,
     * even if the total is unknown.
     */
    progress: Schema.Finite,
    /**
     * Total number of items to process (or total progress required), if known.
     */
    total: optional(Schema.Finite),
    /**
     * An optional message describing the current progress.
     */
    message: optional(Schema.String)
  }
}) {}

// =============================================================================
// Resources
// =============================================================================

/**
 * Schema for a known resource that the server is capable of reading.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class Resource extends Schema.Class<Resource>(
  "@effect/ai/McpSchema/Resource"
)({
  /**
   * The URI of this resource.
   */
  uri: Schema.String,
  /**
   * A human-readable name for this resource.
   *
   * This can be used by clients to populate UI elements.
   */
  name: Schema.String,
  title: optional(Schema.String),
  /**
   * A description of what this resource represents.
   *
   * This can be used by clients to improve the LLM's understanding of available
   * resources. It can be thought of like a "hint" to the model.
   */
  description: optional(Schema.String),
  /**
   * The MIME type of this resource, if known.
   */
  mimeType: optional(Schema.String),
  /**
   * Optional annotations for the client.
   */
  annotations: optional(Annotations),
  /**
   * Icons that clients can display for this resource.
   */
  icons: optional(Schema.Array(Icon)),
  /**
   * The size of the raw resource content, in bytes (i.e., before base64
   * encoding or any tokenization), if known.
   *
   * This can be used by Hosts to display file sizes and estimate context
   * window usage.
   */
  size: optional(Schema.Int),
  /**
   * Optional additional metadata for the client.
   *
   * This parameter name is reserved by MCP to allow clients and servers to
   * attach additional metadata to resources.
   */
  _meta: optional(Schema.JsonObject)
}) {}

/**
 * Schema for a template description of resources available on the server.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ResourceTemplate extends Schema.Class<ResourceTemplate>(
  "@effect/ai/McpSchema/ResourceTemplate"
)({
  /**
   * A URI template (according to RFC 6570) that can be used to construct
   * resource URIs.
   */
  uriTemplate: Schema.String,
  /**
   * A human-readable name for the type of resource this template refers to.
   *
   * This can be used by clients to populate UI elements.
   */
  name: Schema.String,
  title: optional(Schema.String),
  /**
   * A description of what this template is for.
   *
   * This can be used by clients to improve the LLM's understanding of available
   * resources. It can be thought of like a "hint" to the model.
   */
  description: optional(Schema.String),

  /**
   * The MIME type for all resources that match this template. This should only
   * be included if all resources matching this template have the same type.
   */
  mimeType: optional(Schema.String),

  /**
   * Optional annotations for the client.
   */
  annotations: optional(Annotations),
  /**
   * Icons that clients can display for this resource template.
   */
  icons: optional(Schema.Array(Icon)),

  /**
   * Optional additional metadata for the client.
   */
  _meta: optional(Schema.JsonObject)
}) {}

/**
 * Schema for the contents of a specific resource or sub-resource.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ResourceContents extends Schema.Opaque<ResourceContents>()(Schema.Struct({
  /**
   * The URI of this resource.
   */
  uri: Schema.String,
  /**
   * The MIME type of this resource, if known.
   */
  mimeType: optional(Schema.String),
  /**
   * Optional additional metadata for the client.
   */
  _meta: optional(Schema.JsonObject)
})) {}

/**
 * Schema for text resource contents represented as a string.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class TextResourceContents extends Schema.Opaque<TextResourceContents>()(Schema.Struct({
  ...ResourceContents.fields,
  /**
   * The text of the item. This must only be set if the item can actually be
   * represented as text (not binary data).
   */
  text: Schema.String
})) {}

/**
 * Schema for binary resource contents represented as a `Uint8Array`.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class BlobResourceContents extends Schema.Opaque<BlobResourceContents>()(Schema.Struct({
  ...ResourceContents.fields,
  /**
   * The binary data of the item decoded from a base64-encoded string.
   */
  blob: Schema.Uint8ArrayFromBase64
})) {}

/**
 * Schema for the server's response to a resources/list request from the client.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ListResourcesResult extends Schema.Class<ListResourcesResult>(
  "@effect/ai/McpSchema/ListResourcesResult"
)({
  ...PaginatedResultMeta.fields,
  resources: Schema.Array(Resource)
}) {}

/**
 * Sent from the client to request a list of resources the server has.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class ListResources extends Rpc.make("resources/list", {
  success: ListResourcesResult,
  error: McpError,
  payload: Schema.UndefinedOr(PaginatedRequestMeta)
}) {}

/**
 * Schema for the server's response to a resources/templates/list request from
 * the client.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ListResourceTemplatesResult extends Schema.Class<ListResourceTemplatesResult>(
  "@effect/ai/McpSchema/ListResourceTemplatesResult"
)({
  ...PaginatedResultMeta.fields,
  resourceTemplates: Schema.Array(ResourceTemplate)
}) {}

/**
 * Sent from the client to request a list of resource templates the server has.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class ListResourceTemplates extends Rpc.make("resources/templates/list", {
  success: ListResourceTemplatesResult,
  error: McpError,
  payload: Schema.UndefinedOr(PaginatedRequestMeta)
}) {}

/**
 * Schema for the server's response to a resources/read request from the client.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ReadResourceResult extends Schema.Opaque<ReadResourceResult>()(Schema.Struct({
  ...ResultMeta.fields,
  contents: Schema.Array(Schema.Union([TextResourceContents, BlobResourceContents]))
})) {}

/**
 * Sent from the client to the server, to read a specific resource URI.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class ReadResource extends Rpc.make("resources/read", {
  success: ReadResourceResult,
  error: McpError,
  payload: {
    ...RequestMeta.fields,
    /**
     * The URI of the resource to read. The URI can use any protocol; it is up
     * to the server how to interpret it.
     */
    uri: Schema.String
  }
}) {}

/**
 * Represents a notification that the server's resource list changed.
 *
 * **When to use**
 *
 * Use to notify clients that `resources/list` should be requested again.
 *
 * **Details**
 *
 * Servers may send this notification without a previous client subscription.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class ResourceListChangedNotification extends Rpc.make("notifications/resources/list_changed", {
  payload: Schema.UndefinedOr(NotificationMeta)
}) {}

/**
 * Sent from the client to request resources/updated notifications from the
 * server whenever a particular resource changes.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class Subscribe extends Rpc.make("resources/subscribe", {
  success: Schema.Struct({}),
  error: McpError,
  payload: {
    ...RequestMeta.fields,
    /**
     * The URI of the resource to subscribe to. The URI can use any protocol;
     * it is up to the server how to interpret it.
     */
    uri: Schema.String
  }
}) {}

/**
 * Sent from the client to request cancellation of resources/updated
 * notifications from the server. This should follow a previous
 * resources/subscribe request.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class Unsubscribe extends Rpc.make("resources/unsubscribe", {
  success: Schema.Struct({}),
  error: McpError,
  payload: {
    ...RequestMeta.fields,
    /**
     * The URI of the resource to subscribe to. The URI can use any protocol;
     * it is up to the server how to interpret it.
     */
    uri: Schema.String
  }
}) {}

/**
 * Sent from the server when a subscribed resource URI has changed.
 *
 * **Details**
 *
 * The URI may identify a sub-resource of the resource that the client
 * originally subscribed to.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class ResourceUpdatedNotification extends Rpc.make("notifications/resources/updated", {
  payload: {
    ...NotificationMeta.fields,
    /**
     * The URI of the resource that has been updated. This might be a sub-resource of the one that the client actually subscribed to.
     */
    uri: Schema.String
  }
}) {}

// =============================================================================
// Prompts
// =============================================================================

/**
 * Describes an argument that a prompt can accept.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class PromptArgument extends Schema.Opaque<PromptArgument>()(Schema.Struct({
  /**
   * The name of the argument.
   */
  name: Schema.String,
  title: optional(Schema.String),
  /**
   * A human-readable description of the argument.
   */
  description: optional(Schema.String),
  /**
   * Whether this argument must be provided.
   */
  required: optional(Schema.Boolean)
})) {}

/**
 * Represents a prompt or prompt template that the server offers.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class Prompt extends Schema.Class<Prompt>(
  "@effect/ai/McpSchema/Prompt"
)({
  /**
   * The name of the prompt or prompt template.
   */
  name: Schema.String,
  title: optional(Schema.String),
  /**
   * An optional description of what this prompt provides
   */
  description: optional(Schema.String),
  /**
   * A list of arguments to use for templating the prompt.
   */
  arguments: optional(Schema.Array(PromptArgument)),
  /**
   * Icons that clients can display for this prompt.
   */
  icons: optional(Schema.Array(Icon)),
  _meta: optional(Schema.JsonObject)
}) {}

/**
 * Represents text content provided to or from an LLM.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class TextContent extends Schema.Opaque<TextContent>()(Schema.Struct({
  type: Schema.tag("text"),
  /**
   * The text content of the message.
   */
  text: Schema.String,
  /**
   * Optional annotations for the client.
   */
  annotations: optional(Annotations),
  _meta: optional(Schema.JsonObject)
})) {}

/**
 * Represents image content provided to or from an LLM.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ImageContent extends Schema.Opaque<ImageContent>()(Schema.Struct({
  type: Schema.tag("image"),
  /**
   * The image data.
   */
  data: Schema.Uint8ArrayFromBase64,
  /**
   * The MIME type of the image. Different providers may support different
   * image types.
   */
  mimeType: Schema.String,
  /**
   * Optional annotations for the client.
   */
  annotations: optional(Annotations),
  _meta: optional(Schema.JsonObject)
})) {}

/**
 * Represents audio content provided to or from an LLM.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class AudioContent extends Schema.Opaque<AudioContent>()(Schema.Struct({
  type: Schema.tag("audio"),
  /**
   * The audio data.
   */
  data: Schema.Uint8ArrayFromBase64,
  /**
   * The MIME type of the audio. Different providers may support different
   * audio types.
   */
  mimeType: Schema.String,
  /**
   * Optional annotations for the client.
   */
  annotations: optional(Annotations),
  _meta: optional(Schema.JsonObject)
})) {}

/**
 * Represents resource contents embedded into a prompt or tool call result.
 *
 * **Details**
 *
 * It is up to the client how best to render embedded resources for the benefit
 * of the LLM and/or the user.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class EmbeddedResource extends Schema.Opaque<EmbeddedResource>()(Schema.Struct({
  type: Schema.tag("resource"),
  resource: Schema.Union([TextResourceContents, BlobResourceContents]),
  /**
   * Optional annotations for the client.
   */
  annotations: optional(Annotations),
  _meta: optional(Schema.JsonObject)
})) {}

/**
 * Represents a readable resource included in a prompt or tool call result.
 *
 * **Gotchas**
 *
 * Resource links returned by tools are not guaranteed to appear in the results
 * of `resources/list` requests.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ResourceLink extends Schema.Opaque<ResourceLink>()(Schema.Struct({
  ...Resource.fields,
  type: Schema.tag("resource_link")
})) {}

/**
 * Schema for MCP content blocks that can appear in prompt messages or tool
 * results.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ContentBlock = Schema.Union([
  TextContent,
  ImageContent,
  AudioContent,
  EmbeddedResource,
  ResourceLink
])

/**
 * Type represented by the MCP content block schema.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ContentBlock = typeof ContentBlock.Type

/**
 * Describes a message returned as part of a prompt.
 *
 * **Details**
 *
 * This is similar to `SamplingMessage`, but also supports the embedding of
 * resources from the MCP server.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class PromptMessage extends Schema.Opaque<PromptMessage>()(Schema.Struct({
  role: Role,
  content: ContentBlock
})) {}

/**
 * Represents the server response to a prompts/list request from the client.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ListPromptsResult extends Schema.Class<ListPromptsResult>(
  "@effect/ai/McpSchema/ListPromptsResult"
)({
  ...PaginatedResultMeta.fields,
  prompts: Schema.Array(Prompt)
}) {}

/**
 * Sent from the client to request a list of prompts and prompt templates the
 * server has.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class ListPrompts extends Rpc.make("prompts/list", {
  success: ListPromptsResult,
  error: McpError,
  payload: Schema.UndefinedOr(PaginatedRequestMeta)
}) {}

/**
 * Represents the server response to a prompts/get request from the client.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class GetPromptResult extends Schema.Class<GetPromptResult>(
  "@effect/ai/McpSchema/GetPromptResult"
)({
  ...ResultMeta.fields,
  messages: Schema.Array(PromptMessage),
  /**
   * An optional description for the prompt.
   */
  description: optional(Schema.String)
}) {}

/**
 * Sent from the client to get a prompt provided by the server.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class GetPrompt extends Rpc.make("prompts/get", {
  success: GetPromptResult,
  error: McpError,
  payload: {
    ...RequestMeta.fields,
    /**
     * The name of the prompt or prompt template.
     */
    name: Schema.String,
    title: optional(Schema.String),
    /**
     * Arguments to use for templating the prompt.
     */
    arguments: optional(Schema.Record(Schema.String, Schema.String))
  }
}) {}

/**
 * Represents a notification that the server's prompt list changed.
 *
 * **When to use**
 *
 * Use to notify clients that `prompts/list` should be requested again.
 *
 * **Details**
 *
 * Servers may send this notification without a previous client subscription.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class PromptListChangedNotification extends Rpc.make("notifications/prompts/list_changed", {
  payload: Schema.UndefinedOr(NotificationMeta)
}) {}

// =============================================================================
// Tools
// =============================================================================

/**
 * Schema for additional properties describing a tool to clients.
 *
 * **Details**
 *
 * NOTE: all properties in ToolAnnotations are **hints**. They are not
 * guaranteed to provide a faithful description of tool behavior (including
 * descriptive properties like `title`).
 *
 * **Gotchas**
 *
 * Clients should never make tool use decisions based on ToolAnnotations
 * received from untrusted servers.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ToolAnnotations extends Schema.Opaque<ToolAnnotations>()(Schema.Struct({
  /**
   * A human-readable title for the tool.
   */
  title: optional(Schema.String),
  /**
   * If true, the tool does not modify its environment.
   *
   * Default: `false`
   */
  readOnlyHint: optionalWithDefault(Schema.Boolean, constFalse),
  /**
   * If true, the tool may perform destructive updates to its environment.
   * If false, the tool performs only additive updates.
   *
   * (This property is meaningful only when `readOnlyHint == false`)
   *
   * Default: `true`
   */
  destructiveHint: optionalWithDefault(Schema.Boolean, constTrue),
  /**
   * If true, calling the tool repeatedly with the same arguments
   * will have no additional effect on the its environment.
   *
   * (This property is meaningful only when `readOnlyHint == false`)
   *
   * Default: `false`
   */
  idempotentHint: optionalWithDefault(Schema.Boolean, constFalse),
  /**
   * If true, this tool may interact with an "open world" of external
   * entities. If false, the tool's domain of interaction is closed.
   * For example, the world of a web search tool is open, whereas that
   * of a memory tool is not.
   *
   * Default: `true`
   */
  openWorldHint: optionalWithDefault(Schema.Boolean, constTrue)
})) {}

/**
 * Object-root JSON Schema used by MCP tool inputs.
 *
 * **Details**
 *
 * Property definitions and additional root keywords are constrained to JSON
 * values. The open root supports generated keywords such as `$defs`.
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export type ToolJson = Schema.JsonObject & {
  readonly type: "object"
  readonly properties?: Readonly<Record<string, Schema.JsonObject>> | undefined
  readonly required?: ReadonlyArray<string> | undefined
}

/**
 * Schema for {@link ToolJson}.
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const ToolJson: Schema.Codec<ToolJson> = Schema.StructWithRest(
  Schema.Struct({
    type: Schema.Literal("object"),
    properties: optional(Schema.Record(Schema.String, Schema.JsonObject)),
    required: optional(Schema.Array(Schema.String))
  }),
  [Schema.JsonObject]
)

/**
 * JSON Schema used by MCP tool outputs.
 *
 * **Details**
 *
 * Unlike tool inputs, tool outputs may use any JSON Schema root type.
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export type ToolOutputJson = Schema.JsonObject

/**
 * Schema for {@link ToolOutputJson}.
 *
 * @stability unstable
 * @category tools
 * @since 4.0.0
 */
export const ToolOutputJson: Schema.Codec<ToolOutputJson> = Schema.JsonObject

/**
 * Schema for the definition of a tool the client can call.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class Tool extends Schema.Class<Tool>(
  "@effect/ai/McpSchema/Tool"
)({
  /**
   * The name of the tool.
   */
  name: Schema.String,
  title: optional(Schema.String),
  /**
   * A human-readable description of the tool.
   *
   * This can be used by clients to improve the LLM's understanding of available tools. It can be thought of like a "hint" to the model.
   */
  description: optional(Schema.String),
  /**
   * A JSON Schema object defining the expected parameters for the tool.
   */
  inputSchema: ToolJson,
  /**
   * An optional JSON Schema object defining the structure of the tool output.
   */
  outputSchema: optional(ToolOutputJson),
  /**
   * Optional additional tool information.
   */
  annotations: optional(ToolAnnotations),
  /**
   * Icons that clients can display for this tool.
   */
  icons: optional(Schema.Array(Icon)),
  /**
   * Optional additional metadata for the client.
   *
   * This parameter name is reserved by MCP to allow clients and servers to
   * attach additional metadata to resources.
   */
  _meta: optional(Schema.JsonObject)
}) {}

/**
 * Schema for the server's response to a tools/list request from the client.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ListToolsResult extends Schema.Class<ListToolsResult>(
  "@effect/ai/McpSchema/ListToolsResult"
)({
  ...PaginatedResultMeta.fields,
  tools: Schema.Array(Tool)
}) {}

/**
 * Sent from the client to request a list of tools the server has.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class ListTools extends Rpc.make("tools/list", {
  success: ListToolsResult,
  error: McpError,
  payload: Schema.UndefinedOr(PaginatedRequestMeta)
}) {}

/**
 * Schema for the server's response to a tool call.
 *
 * **Details**
 *
 * Any errors that originate from the tool SHOULD be reported inside the result
 * object, with `isError` set to true, _not_ as an MCP protocol-level error
 * response. Otherwise, the LLM would not be able to see that an error occurred
 * and self-correct. However, any errors in _finding_ the tool, an error
 * indicating that the server does not support tool calls, or any other
 * exceptional conditions, should be reported as an MCP error response.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class CallToolResult extends Schema.Class<CallToolResult>("@effect/ai/McpSchema/CallToolResult")({
  ...ResultMeta.fields,
  content: Schema.Array(ContentBlock),
  /**
   * An optional JSON value containing the structured result of the tool call.
   */
  structuredContent: optional(Schema.Json),
  /**
   * Whether the tool call ended in an error.
   *
   * If not set, this is assumed to be false (the call was successful).
   */
  isError: optional(Schema.Boolean)
}) {}

/**
 * Represents a client request to invoke a tool provided by the server.
 *
 * **When to use**
 *
 * Use when you need to represent a client request that already knows the tool
 * name and asks the server to execute it with argument values.
 *
 * @see {@link ListTools} for discovering available tools before calling one
 * @see {@link CallToolResult} for the successful tool-call result shape
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class CallTool extends Rpc.make("tools/call", {
  success: CallToolResult,
  error: McpError,
  payload: {
    ...RequestMeta.fields,
    name: Schema.String,
    arguments: optionalWithDefault(
      Schema.Record(
        Schema.String,
        Schema.Any
      ),
      () => ({})
    )
  }
}) {}

/**
 * Represents a notification that the server's tool list changed.
 *
 * **When to use**
 *
 * Use to notify clients that `tools/list` should be requested again.
 *
 * **Details**
 *
 * Servers may send this notification without a previous client subscription.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class ToolListChangedNotification extends Rpc.make("notifications/tools/list_changed", {
  payload: Schema.UndefinedOr(NotificationMeta)
}) {}

// =============================================================================
// Logging
// =============================================================================

/**
 * Schema for log message severity levels, mapped to syslog message severities
 * as specified in RFC 5424 section 6.2.1:
 * https://datatracker.ietf.org/doc/html/rfc5424#section-6.2.1.
 *
 * @stability unstable
 * @category logging
 * @since 4.0.0
 */
export const LoggingLevel: Schema.Literals<[
  "debug",
  "info",
  "notice",
  "warning",
  "error",
  "critical",
  "alert",
  "emergency"
]> = Schema.Literals([
  "debug",
  "info",
  "notice",
  "warning",
  "error",
  "critical",
  "alert",
  "emergency"
])

/**
 * Type represented by the MCP logging level schema, mapped to syslog message
 * severities as specified in RFC 5424 section 6.2.1:
 * https://datatracker.ietf.org/doc/html/rfc5424#section-6.2.1.
 *
 * @stability unstable
 * @category logging
 * @since 4.0.0
 */
export type LoggingLevel = typeof LoggingLevel.Type

/**
 * Sent from the client to the server to enable or adjust logging.
 *
 * @stability unstable
 * @category logging
 * @since 4.0.0
 */
export class SetLevel extends Rpc.make("logging/setLevel", {
  payload: {
    ...RequestMeta.fields,
    /**
     * The level of logging that the client wants to receive from the server.
     * The server should send all logs at this level and higher (i.e., more
     * severe) to the client as notifications/message.
     */
    level: LoggingLevel
  },
  success: Schema.Struct({}),
  error: McpError
}) {}

/**
 * Sent from the server to the client carrying a log message.
 *
 * **Details**
 *
 * The notification includes the severity level, optional logger name, and
 * JSON-serializable log data.
 *
 * @stability unstable
 * @category logging
 * @since 4.0.0
 */
export class LoggingMessageNotification extends Rpc.make("notifications/message", {
  payload: Schema.Struct({
    ...NotificationMeta.fields,
    /**
     * The severity of this log message.
     */
    level: LoggingLevel,
    /**
     * An optional name of the logger issuing this message.
     */
    logger: optional(Schema.String),
    /**
     * The data to be logged, such as a string message or an object. Any JSON
     * serializable type is allowed here.
     */
    data: Schema.Any
  })
}) {}

// =============================================================================
// Sampling
// =============================================================================

/**
 * Schema for a tool-use request produced during MCP sampling.
 *
 * @stability unstable
 * @category sampling
 * @since 4.0.0
 */
export class ToolUseContent extends Schema.Class<ToolUseContent>("@effect/ai/McpSchema/ToolUseContent")({
  type: Schema.tag("tool_use"),
  /**
   * Identifier used to associate a later tool result with this request.
   */
  id: Schema.String,
  /**
   * Name of the tool to invoke.
   */
  name: Schema.String,
  /**
   * Arguments supplied to the tool.
   */
  input: Schema.Record(Schema.String, Schema.Unknown),
  _meta: optional(Schema.JsonObject)
}) {}

/**
 * Schema for the result of a tool use supplied in a sampling message.
 *
 * @stability unstable
 * @category sampling
 * @since 4.0.0
 */
export class ToolResultContent extends Schema.Class<ToolResultContent>("@effect/ai/McpSchema/ToolResultContent")({
  type: Schema.tag("tool_result"),
  /**
   * Identifier of the tool-use request that produced this result.
   */
  toolUseId: Schema.String,
  /**
   * Content returned by the tool.
   */
  content: Schema.Array(ContentBlock),
  /**
   * Optional structured result returned by the tool.
   */
  structuredContent: optional(Schema.Json),
  /**
   * Whether tool execution ended in an error.
   */
  isError: optional(Schema.Boolean),
  _meta: optional(Schema.JsonObject)
}) {}

/**
 * Schema for content blocks accepted in MCP sampling messages.
 *
 * @stability unstable
 * @category sampling
 * @since 4.0.0
 */
export const SamplingMessageContentBlock = Schema.Union([
  TextContent,
  ImageContent,
  AudioContent,
  ToolUseContent,
  ToolResultContent
])

/**
 * Type represented by the MCP sampling message content block schema.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type SamplingMessageContentBlock = typeof SamplingMessageContentBlock.Type

/**
 * Describes a message issued to or received from an LLM API.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class SamplingMessage extends Schema.Opaque<SamplingMessage>()(Schema.Struct({
  role: Role,
  content: Schema.Union([SamplingMessageContentBlock, Schema.Array(SamplingMessageContentBlock)]),
  _meta: optional(Schema.JsonObject)
})) {}

/**
 * Schema for controlling tool selection during MCP sampling.
 *
 * @stability unstable
 * @category sampling
 * @since 4.0.0
 */
export class ToolChoice extends Schema.Class<ToolChoice>("@effect/ai/McpSchema/ToolChoice")({
  /**
   * Tool-selection mode requested from the client.
   */
  mode: optional(Schema.Literals(["auto", "required", "none"]))
}) {}

/**
 * Schema for model selection hints.
 *
 * **Details**
 *
 * Keys not declared here are currently left unspecified by the spec and are up
 * to the client to interpret.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ModelHint extends Schema.Opaque<ModelHint>()(Schema.Struct({
  /**
   * A hint for a model name.
   *
   * The client SHOULD treat this as a substring of a model name; for example:
   *  - `claude-3-5-sonnet` should match `claude-3-5-sonnet-20241022`
   *  - `sonnet` should match `claude-3-5-sonnet-20241022`, `claude-3-sonnet-20240229`, etc.
   *  - `claude` should match any Claude model
   *
   * The client MAY also map the string to a different provider's model name or
   * a different model family, as long as it fills a similar niche; for example:
   *  - `gemini-1.5-flash` could match `claude-3-haiku-20240307`
   */
  name: optional(Schema.String)
})) {}

/**
 * Schema for the server's model selection preferences requested of the client
 * during sampling.
 *
 * **Details**
 *
 * Because LLMs can vary along multiple dimensions, choosing the "best" model is
 * rarely straightforward. Different models excel in different areas, some are
 * faster but less capable, others are more capable but more expensive, and so
 * on. This interface allows servers to express their priorities across multiple
 * dimensions to help clients make an appropriate selection for their use case.
 *
 * **Gotchas**
 *
 * These preferences are always advisory. The client MAY ignore them. It is also
 * up to the client to decide how to interpret these preferences and how to
 * balance them against other considerations.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ModelPreferences extends Schema.Class<ModelPreferences>(
  "@effect/ai/McpSchema/ModelPreferences"
)({
  /**
   * Optional hints to use for model selection.
   *
   * If multiple hints are specified, the client MUST evaluate them in order
   * (such that the first match is taken).
   *
   * The client SHOULD prioritize these hints over the numeric priorities, but
   * MAY still use the priorities to select from ambiguous matches.
   */
  hints: optional(Schema.Array(ModelHint)),
  /**
   * How much to prioritize cost when selecting a model. A value of 0 means cost
   * is not important, while a value of 1 means cost is the most important
   * factor.
   */
  costPriority: optional(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  /**
   * How much to prioritize sampling speed (latency) when selecting a model. A
   * value of 0 means speed is not important, while a value of 1 means speed is
   * the most important factor.
   */
  speedPriority: optional(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
  /**
   * How much to prioritize intelligence and capabilities when selecting a
   * model. A value of 0 means intelligence is not important, while a value of 1
   * means intelligence is the most important factor.
   */
  intelligencePriority: optional(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 })))
}) {}

/**
 * Represents a client response to an MCP sampling request.
 *
 * **When to use**
 *
 * Use to return the message produced by client-side model sampling.
 *
 * **Details**
 *
 * The client should let the user inspect the sampled message before returning
 * it to the server.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class CreateMessageResult extends Schema.Class<CreateMessageResult>(
  "@effect/ai/McpSchema/CreateMessageResult"
)({
  role: Role,
  content: Schema.Union([SamplingMessageContentBlock, Schema.Array(SamplingMessageContentBlock)]),
  _meta: optional(Schema.JsonObject),
  /**
   * The name of the model that generated the message.
   */
  model: Schema.String,
  /**
   * The reason why sampling stopped, if known.
   */
  stopReason: optional(Schema.String)
}) {}

/**
 * Represents a server request for the client to sample an LLM.
 *
 * **When to use**
 *
 * Use when you need to request model sampling from an MCP client on behalf of a
 * server.
 *
 * **Details**
 *
 * The client chooses the model and should ask the user to approve the sampling
 * request before it begins.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class CreateMessage extends Rpc.make("sampling/createMessage", {
  success: CreateMessageResult,
  error: McpError,
  payload: {
    messages: Schema.Array(SamplingMessage),
    /**
     * The server's preferences for which model to select. The client MAY ignore
     * these preferences.
     */
    modelPreferences: optional(Schema.Struct(ModelPreferences.fields)),
    /**
     * An optional system prompt the server wants to use for sampling. The
     * client MAY modify or omit this prompt.
     */
    systemPrompt: optional(Schema.String),
    /**
     * A request to include context from one or more MCP servers (including the
     * caller), to be attached to the prompt. The client MAY ignore this request.
     */
    includeContext: optional(Schema.Literals(["none", "thisServer", "allServers"])),
    temperature: optional(Schema.Finite),
    /**
     * The maximum number of tokens to sample, as requested by the server. The
     * client MAY choose to sample fewer tokens than requested.
     */
    maxTokens: Schema.Int,
    stopSequences: optional(Schema.Array(Schema.String)),
    /**
     * Optional metadata to pass through to the LLM provider. The format of
     * this metadata is provider-specific.
     */
    metadata: optional(Schema.Record(Schema.String, Schema.Unknown)),
    /**
     * Tools that the model may call while producing the response.
     */
    tools: optional(Schema.Array(Schema.Struct(Tool.fields))),
    /**
     * Controls whether the model may or must call a tool.
     */
    toolChoice: optional(Schema.Struct(ToolChoice.fields))
  }
}) {}

// =============================================================================
// Autocomplete
// =============================================================================

/**
 * Schema for a reference to a resource or resource template definition.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ResourceReference extends Schema.Opaque<ResourceReference>()(Schema.Struct({
  type: Schema.tag("ref/resource"),
  /**
   * The URI or URI template of the resource.
   */
  uri: Schema.String
})) {}

/**
 * Schema for a prompt reference used in autocomplete requests.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class PromptReference extends Schema.Opaque<PromptReference>()(Schema.Struct({
  type: Schema.tag("ref/prompt"),
  /**
   * The name of the prompt or prompt template
   */
  name: Schema.String,
  title: optional(Schema.String)
})) {}

/**
 * Schema for the server's response to a completion/complete request.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class CompleteResult extends Schema.Opaque<CompleteResult>()(Schema.Struct({
  ...ResultMeta.fields,
  completion: Schema.Struct({
    /**
     * An array of completion values. Must not exceed 100 items.
     */
    values: Schema.Array(Schema.String),
    /**
     * The total number of completion options available. This can exceed the
     * number of values actually sent in the response.
     */
    total: optional(Schema.Int),
    /**
     * Indicates whether there are additional completion options beyond those
     * provided in the current response, even if the exact total is unknown.
     */
    hasMore: optional(Schema.Boolean)
  })
})) {
  /**
   * Empty completion result used when a completion request has no values.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static readonly empty = CompleteResult.make({
    completion: {
      values: [],
      total: 0,
      hasMore: false
    }
  })
}

/**
 * Sent from the client to the server to ask for completion options.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class Complete extends Rpc.make("completion/complete", {
  success: CompleteResult,
  error: McpError,
  payload: Schema.Struct({
    ref: Schema.Union([PromptReference, ResourceReference]),
    /**
     * The argument's information
     */
    argument: Schema.Struct({
      /**
       * The name of the argument
       */
      name: Schema.String,
      /**
       * The value of the argument to use for completion matching.
       */
      value: Schema.String
    }),
    /**
     * Additional, optional context for completions
     */
    context: optionalWithDefault(
      Schema.Struct({
        /**
         * Previously-resolved variables in a URI template or prompt.
         */
        arguments: optionalWithDefault(
          Schema.Record(Schema.String, Schema.String),
          () => ({})
        )
      }),
      () => ({ arguments: {} })
    )
  })
}) {}

// =============================================================================
// Roots
// =============================================================================

/**
 * Represents a root directory or file that the server can operate on.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class Root extends Schema.Class<Root>(
  "@effect/ai/McpSchema/Root"
)({
  /**
   * The URI identifying the root. This *must* start with file:// for now.
   * This restriction may be relaxed in future versions of the protocol to allow
   * other URI schemes.
   */
  uri: Schema.String,
  /**
   * An optional name for the root. This can be used to provide a human-readable
   * identifier for the root, which may be useful for display purposes or for
   * referencing the root in other parts of the application.
   */
  name: optional(Schema.String),
  /**
   * Optional additional metadata associated with the root.
   */
  _meta: optional(Schema.JsonObject)
}) {}

/**
 * Represents a client response containing the roots available to the server.
 *
 * **When to use**
 *
 * Use to return the directories or files that an MCP server may operate on.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ListRootsResult extends Schema.Class<ListRootsResult>(
  "@effect/ai/McpSchema/ListRootsResult"
)({
  roots: Schema.Array(Root)
}) {}

/**
 * Sent from the server to request a list of root URIs from the client. Roots
 * allow servers to ask for specific directories or files to operate on. A
 * common example for roots is providing a set of repositories or directories a
 * server should operate on.
 *
 * **Details**
 *
 * This request is typically used when the server needs to understand the file
 * system structure or access specific locations that the client has permission
 * to read from.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class ListRoots extends Rpc.make("roots/list", {
  success: ListRootsResult,
  error: McpError,
  payload: Schema.UndefinedOr(RequestMeta)
}) {}

/**
 * Represents a notification that the client's root list changed.
 *
 * **When to use**
 *
 * Use to tell the server that it should request an updated roots list.
 *
 * **Details**
 *
 * Send this when the client adds, removes, or modifies a root.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class RootsListChangedNotification extends Rpc.make("notifications/roots/list_changed", {
  payload: Schema.UndefinedOr(NotificationMeta)
}) {}

// =============================================================================
// Elicitation
// =============================================================================

/**
 * Schema for a string field in an MCP elicitation form.
 *
 * @stability unstable
 * @category elicitation
 * @since 4.0.0
 */
export class ElicitationString extends Schema.Class<ElicitationString>("@effect/ai/McpSchema/ElicitationString")({
  type: Schema.tag("string"),
  title: optional(Schema.String),
  description: optional(Schema.String),
  minLength: optional(Schema.Int),
  maxLength: optional(Schema.Int),
  format: optional(Schema.Literals(["email", "uri", "date", "date-time"])),
  default: optional(Schema.String)
}) {}

/**
 * Schema for a numeric field in an MCP elicitation form.
 *
 * @stability unstable
 * @category elicitation
 * @since 4.0.0
 */
export class ElicitationNumber extends Schema.Class<ElicitationNumber>("@effect/ai/McpSchema/ElicitationNumber")({
  type: Schema.Literals(["number", "integer"]),
  title: optional(Schema.String),
  description: optional(Schema.String),
  minimum: optional(Schema.Finite),
  maximum: optional(Schema.Finite),
  default: optional(Schema.Finite)
}) {}

/**
 * Schema for a boolean field in an MCP elicitation form.
 *
 * @stability unstable
 * @category elicitation
 * @since 4.0.0
 */
export class ElicitationBoolean extends Schema.Class<ElicitationBoolean>("@effect/ai/McpSchema/ElicitationBoolean")({
  type: Schema.tag("boolean"),
  title: optional(Schema.String),
  description: optional(Schema.String),
  default: optional(Schema.Boolean)
}) {}

/**
 * Schema for an untitled single-select field in an MCP elicitation form.
 *
 * @stability unstable
 * @category elicitation
 * @since 4.0.0
 */
export class UntitledSingleSelectEnum extends Schema.Class<UntitledSingleSelectEnum>(
  "@effect/ai/McpSchema/UntitledSingleSelectEnum"
)({
  type: Schema.tag("string"),
  title: optional(Schema.String),
  description: optional(Schema.String),
  enum: Schema.Array(Schema.String),
  default: optional(Schema.String)
}) {}

/**
 * Schema for a titled single-select field in an MCP elicitation form.
 *
 * @stability unstable
 * @category elicitation
 * @since 4.0.0
 */
export class TitledSingleSelectEnum extends Schema.Class<TitledSingleSelectEnum>(
  "@effect/ai/McpSchema/TitledSingleSelectEnum"
)({
  type: Schema.tag("string"),
  title: optional(Schema.String),
  description: optional(Schema.String),
  oneOf: Schema.Array(Schema.Struct({
    const: Schema.String,
    title: Schema.String
  })),
  default: optional(Schema.String)
}) {}

/**
 * Schema for every single-select field in an MCP elicitation form.
 *
 * @stability unstable
 * @category elicitation
 * @since 4.0.0
 */
export const SingleSelectEnum = Schema.Union([
  UntitledSingleSelectEnum,
  TitledSingleSelectEnum
])

/**
 * Type represented by the single-select elicitation field schema.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type SingleSelectEnum = typeof SingleSelectEnum.Type

/**
 * Schema for an untitled multi-select field in an MCP elicitation form.
 *
 * @stability unstable
 * @category elicitation
 * @since 4.0.0
 */
export class UntitledMultiSelectEnum extends Schema.Class<UntitledMultiSelectEnum>(
  "@effect/ai/McpSchema/UntitledMultiSelectEnum"
)({
  type: Schema.tag("array"),
  title: optional(Schema.String),
  description: optional(Schema.String),
  minItems: optional(Schema.Int),
  maxItems: optional(Schema.Int),
  items: Schema.Struct({
    type: Schema.tag("string"),
    enum: Schema.Array(Schema.String)
  }),
  default: optional(Schema.Array(Schema.String))
}) {}

/**
 * Schema for a titled multi-select field in an MCP elicitation form.
 *
 * @stability unstable
 * @category elicitation
 * @since 4.0.0
 */
export class TitledMultiSelectEnum extends Schema.Class<TitledMultiSelectEnum>(
  "@effect/ai/McpSchema/TitledMultiSelectEnum"
)({
  type: Schema.tag("array"),
  title: optional(Schema.String),
  description: optional(Schema.String),
  minItems: optional(Schema.Int),
  maxItems: optional(Schema.Int),
  items: Schema.Struct({
    anyOf: Schema.Array(Schema.Struct({
      const: Schema.String,
      title: Schema.String
    }))
  }),
  default: optional(Schema.Array(Schema.String))
}) {}

/**
 * Schema for every multi-select field in an MCP elicitation form.
 *
 * @stability unstable
 * @category elicitation
 * @since 4.0.0
 */
export const MultiSelectEnum = Schema.Union([
  UntitledMultiSelectEnum,
  TitledMultiSelectEnum
])

/**
 * Type represented by the multi-select elicitation field schema.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type MultiSelectEnum = typeof MultiSelectEnum.Type

/**
 * Schema for the legacy titled single-select elicitation field.
 *
 * @deprecated Use {@link TitledSingleSelectEnum} instead.
 * @stability unstable
 * @category elicitation
 * @since 4.0.0
 */
export class LegacyTitledEnum extends Schema.Class<LegacyTitledEnum>(
  "@effect/ai/McpSchema/LegacyTitledEnum"
)({
  type: Schema.tag("string"),
  title: optional(Schema.String),
  description: optional(Schema.String),
  enum: Schema.Array(Schema.String),
  enumNames: optional(Schema.Array(Schema.String)),
  default: optional(Schema.String)
}) {}

/**
 * Schema for every enumeration field in an MCP elicitation form.
 *
 * @stability unstable
 * @category elicitation
 * @since 4.0.0
 */
export const ElicitationEnum = Schema.Union([
  LegacyTitledEnum,
  SingleSelectEnum,
  MultiSelectEnum
])

/**
 * Type represented by the elicitation enumeration field schema.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ElicitationEnum = typeof ElicitationEnum.Type

/**
 * Schema for primitive field definitions accepted by MCP elicitation forms.
 *
 * @stability unstable
 * @category elicitation
 * @since 4.0.0
 */
export const PrimitiveSchemaDefinition = Schema.Union([
  ElicitationEnum,
  ElicitationString,
  ElicitationNumber,
  ElicitationBoolean
])

/**
 * Type represented by the primitive elicitation field schema.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PrimitiveSchemaDefinition = typeof PrimitiveSchemaDefinition.Type

const ElicitationForm = Schema.Struct({
  $schema: optional(Schema.String),
  type: Schema.tag("object"),
  properties: Schema.Record(Schema.String, PrimitiveSchemaDefinition),
  required: optional(Schema.Array(Schema.String))
})

/**
 * Schema for form-mode MCP elicitation requests.
 *
 * @stability unstable
 * @category elicitation
 * @since 4.0.0
 */
export class ElicitRequestFormParams extends Schema.Class<ElicitRequestFormParams>(
  "@effect/ai/McpSchema/ElicitRequestFormParams"
)({
  ...RequestMeta.fields,
  mode: optional(Schema.Literal("form")),
  message: Schema.String,
  requestedSchema: ElicitationForm
}) {}

/**
 * Schema for URL-mode MCP elicitation requests.
 *
 * @stability unstable
 * @category elicitation
 * @since 4.0.0
 */
export class ElicitRequestURLParams extends Schema.Class<ElicitRequestURLParams>(
  "@effect/ai/McpSchema/ElicitRequestURLParams"
)({
  ...RequestMeta.fields,
  mode: Schema.Literal("url"),
  message: Schema.String,
  elicitationId: Schema.String,
  url: Schema.String
}) {}

/**
 * Schema for every MCP elicitation request mode.
 *
 * @stability unstable
 * @category elicitation
 * @since 4.0.0
 */
export const ElicitRequestParams = Schema.Union([
  ElicitRequestFormParams,
  ElicitRequestURLParams
])

/**
 * Type represented by the MCP elicitation request parameters schema.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ElicitRequestParams = typeof ElicitRequestParams.Type

/**
 * Schema for an accepted client response to an elicitation request.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ElicitAcceptResult extends Schema.Class<ElicitAcceptResult>(
  "@effect/ai/McpSchema/ElicitAcceptResult"
)({
  ...ResultMeta.fields,
  /**
   * The user action in response to the elicitation.
   * - "accept": User submitted the form/confirmed the action
   * - "decline": User explicitly declined the action
   * - "cancel": User dismissed without making an explicit choice
   */
  action: Schema.Literal("accept"),
  /**
   * The submitted form data, only present when action is "accept".
   * Contains values matching the requested schema.
   */
  content: optional(Schema.Record(
    Schema.String,
    Schema.Union([Schema.String, Schema.Finite, Schema.Boolean, Schema.Array(Schema.String)])
  ))
}) {}

/**
 * Schema for a declined or canceled client response to an elicitation request.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ElicitDeclineResult extends Schema.Class<ElicitDeclineResult>(
  "@effect/ai/McpSchema/ElicitDeclineResult"
)({
  ...ResultMeta.fields,
  /**
   * The user action in response to the elicitation.
   * - "accept": User submitted the form/confirmed the action
   * - "decline": User explicitly declined the action
   * - "cancel": User dismissed without making an explicit choice
   */
  action: Schema.Literals(["cancel", "decline"])
}) {}

/**
 * Schema for every client response to an elicitation request.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const ElicitResult = Schema.Union([
  ElicitAcceptResult,
  ElicitDeclineResult
])

/**
 * Type represented by the MCP elicitation result schema.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ElicitResult = typeof ElicitResult.Type

/**
 * Version-neutral request for additional MCP client input.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type McpInputRequest =
  | { readonly method: "roots/list"; readonly params?: Schema.JsonObject | undefined }
  | { readonly method: "sampling/createMessage"; readonly params: Schema.JsonObject }
  | { readonly method: "elicitation/create"; readonly params: Schema.JsonObject }

/**
 * Version-neutral response supplied by an MCP client for a prior input request.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type McpInputResponse = Schema.JsonObject

/**
 * Indicates that an MCP operation requires additional keyed input from the client.
 *
 * **When to use**
 *
 * Use when a handler cannot complete until the client supplies roots, sampling,
 * or elicitation input in a later request.
 *
 * **Details**
 *
 * `requestState` is opaque to the client and is returned unchanged with the
 * keyed input responses.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class InputRequired extends Data.TaggedClass("InputRequired")<{
  readonly inputRequests?: Readonly<Record<string, McpInputRequest>> | undefined
  readonly requestState?: string | undefined
}> {
  // The overload preserves the requirement that at least one of inputRequests or requestState is present.
  // oxlint-disable-next-line no-useless-constructor
  constructor(
    fields:
      | {
        readonly inputRequests: Readonly<Record<string, McpInputRequest>>
        readonly requestState?: string | undefined
      }
      | {
        readonly inputRequests?: Readonly<Record<string, McpInputRequest>> | undefined
        readonly requestState: string
      }
  ) {
    super(fields)
  }
}

/**
 * Sent from the server asking the client to collect structured input from the
 * user.
 *
 * **Details**
 *
 * The client responds with accepted content, an explicit decline, or a
 * cancellation.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class Elicit extends Rpc.make("elicitation/create", {
  success: ElicitResult,
  error: McpError,
  payload: ElicitRequestParams
}) {}

/**
 * Notifies a client that a URL-mode elicitation completed.
 *
 * @stability unstable
 * @category elicitation
 * @since 4.0.0
 */
export class ElicitationCompleteNotification extends Rpc.make("notifications/elicitation/complete", {
  payload: {
    elicitationId: Schema.String
  }
}) {}

/**
 * Error raised when an MCP elicitation request is declined or fails before
 * accepted content is returned.
 *
 * **Details**
 *
 * The error stores the original elicitation request and, when available, the
 * underlying cause.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export class ElicitationDeclined extends Schema.Error<ElicitationDeclined>("@effect/ai/McpSchema/ElicitationDeclined")({
  _tag: Schema.tag("ElicitationDeclined"),
  request: Elicit.payloadSchema,
  cause: optional(Schema.Defect())
}) {}

// =============================================================================
// McpServerClient
// =============================================================================

/**
 * Raised when the negotiated MCP revision or client capabilities do not
 * support a server-initiated operation.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class McpReverseOperationUnsupported extends Data.TaggedError("McpReverseOperationUnsupported")<{
  readonly operation: "roots/list" | "sampling/createMessage" | "elicitation/create"
  readonly protocolVersion: ProtocolVersion
  readonly reason: string
}> {}

/**
 * A reverse MCP operation failed while being sent or projected through a
 * version adapter.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class McpReverseOperationError extends Data.TaggedError("McpReverseOperationError")<{
  readonly operation: "roots/list" | "sampling/createMessage" | "elicitation/create"
  readonly cause: unknown
}> {}

/**
 * Version-neutral operations that an MCP server may request from its client.
 *
 * @stability unstable
 * @category client
 * @since 4.0.0
 */
export interface McpReverseClient {
  readonly listRoots: (
    request?: typeof ListRoots.payloadSchema.Type
  ) => Effect.Effect<ListRootsResult, McpReverseOperationError | McpReverseOperationUnsupported>
  readonly createMessage: (
    request: typeof CreateMessage.payloadSchema.Type
  ) => Effect.Effect<CreateMessageResult, McpReverseOperationError | McpReverseOperationUnsupported>
  readonly elicit: (
    request: typeof Elicit.payloadSchema.Type
  ) => Effect.Effect<ElicitResult, McpReverseOperationError | McpReverseOperationUnsupported>
}

/**
 * Protocol-neutral context available while handling an MCP request.
 *
 * **Details**
 *
 * Unlike `McpServerClient`, this service does not imply an initialized session
 * or support for server-initiated requests.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class McpRequestContext extends Context.Service<McpRequestContext, {
  readonly clientId: number
  readonly protocolVersion: string
  readonly clientCapabilities: ClientCapabilities
  readonly clientInfo?: Implementation | undefined
  readonly requestMetadata?:
    | NonNullable<typeof Initialize.payloadSchema.Type["_meta"]>
    | Schema.JsonObject
    | undefined
  readonly inputResponses?: Readonly<Record<string, McpInputResponse>> | undefined
  readonly requestState?: string | undefined
}>()("effect/ai/McpSchema/McpRequestContext") {}

/**
 * Service available while handling an MCP client request.
 *
 * **Details**
 *
 * It exposes the current client id, normalized initialization data, and a
 * scoped version-neutral facade for server-initiated requests.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class McpServerClient extends Context.Service<McpServerClient, {
  readonly clientId: number
  readonly protocolVersion: StatefulProtocolVersion
  readonly clientCapabilities: ClientCapabilities
  readonly clientInfo: Implementation
  readonly initializePayload: typeof Initialize.payloadSchema["Type"]
  readonly requestMetadata?: Schema.JsonObject | undefined
  readonly getClient: Effect.Effect<
    McpReverseClient,
    never,
    Scope.Scope
  >
}>()("effect/ai/McpSchema/McpServerClient") {}

/**
 * RPC middleware that provides `McpServerClient` to handlers for initialized
 * MCP clients.
 *
 * @stability unstable
 * @category middleware
 * @since 4.0.0
 */
export class McpServerClientMiddleware extends RpcMiddleware.Service<McpServerClientMiddleware, {
  provides: McpServerClient
}>()("effect/ai/McpSchema/McpServerClientMiddleware") {}

// =============================================================================
// Protocol
// =============================================================================

/**
 * Encoded JSON-RPC request message for an RPC in `Group`, including the request
 * id, method, and encoded payload.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export type RequestEncoded<Group extends RpcGroup.Any> = RpcGroup.Rpcs<
  Group
> extends infer Rpc ? Rpc extends Rpc.Rpc<
    infer _Tag,
    infer _Payload,
    infer _Success,
    infer _Error,
    infer _Middleware
  > ? {
      readonly _tag: "Request"
      readonly id: string | number
      readonly method: _Tag
      readonly payload: _Payload["Encoded"]
    }
  : never
  : never

/**
 * Encoded notification message for an RPC in `Group`, including the method and
 * encoded payload without a request id.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export type NotificationEncoded<Group extends RpcGroup.Any> = RpcGroup.Rpcs<
  Group
> extends infer Rpc ? Rpc extends Rpc.Rpc<
    infer _Tag,
    infer _Payload,
    infer _Success,
    infer _Error,
    infer _Middleware
  > ? {
      readonly _tag: "Notification"
      readonly method: _Tag
      readonly payload: _Payload["Encoded"]
    }
  : never
  : never

/**
 * Encoded success response for an RPC in `Group`, containing the original
 * request id and encoded result.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export type SuccessEncoded<Group extends RpcGroup.Any> = RpcGroup.Rpcs<
  Group
> extends infer Rpc ? Rpc extends Rpc.Rpc<
    infer _Tag,
    infer _Payload,
    infer _Success,
    infer _Error,
    infer _Middleware
  > ? {
      readonly _tag: "Success"
      readonly id: string | number
      readonly result: _Success["Encoded"]
    }
  : never
  : never

/**
 * Encoded failure response for an RPC in `Group`, containing the original
 * request id and encoded error.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export type FailureEncoded<Group extends RpcGroup.Any> = RpcGroup.Rpcs<
  Group
> extends infer Rpc ? Rpc extends Rpc.Rpc<
    infer _Tag,
    infer _Payload,
    infer _Success,
    infer _Error,
    infer _Middleware
  > ? {
      readonly _tag: "Failure"
      readonly id: string | number
      readonly error: _Error["Encoded"]
    }
  : never
  : never

/**
 * RPC group for requests that MCP clients send to the server.
 *
 * **Details**
 *
 * The group includes initialization, resource, prompt, tool, logging,
 * completion, and ping requests, and installs `McpServerClientMiddleware` for
 * handlers.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class ClientRequestRpcs extends RpcGroup.make(
  Ping,
  Initialize,
  Complete,
  SetLevel,
  GetPrompt,
  ListPrompts,
  ListResources,
  ListResourceTemplates,
  ReadResource,
  Subscribe,
  Unsubscribe,
  CallTool,
  ListTools
).middleware(McpServerClientMiddleware) {}

/**
 * Encoded union of all client-to-server MCP request messages.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export type ClientRequestEncoded = RequestEncoded<typeof ClientRequestRpcs>

/**
 * RPC group for notifications that MCP clients send to the server, such as
 * cancellation, progress, initialization completion, and roots list changes.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class ClientNotificationRpcs extends RpcGroup.make(
  CancelledNotification,
  ProgressNotification,
  InitializedNotification,
  RootsListChangedNotification
) {}

/**
 * Encoded union of all client-to-server MCP notification messages.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export type ClientNotificationEncoded = NotificationEncoded<typeof ClientNotificationRpcs>

/**
 * RPC group combining all client-to-server MCP requests and notifications.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class ClientRpcs extends ClientRequestRpcs.merge(ClientNotificationRpcs) {}

/**
 * Encoded success response sent by a client for a server-initiated request.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export type ClientSuccessEncoded = SuccessEncoded<typeof ServerRequestRpcs>

/**
 * Encoded failure response sent by a client for a server-initiated request.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export type ClientFailureEncoded = FailureEncoded<typeof ServerRequestRpcs>

/**
 * RPC group for requests that an MCP server can send to a client, including
 * ping, sampling, roots listing, and elicitation.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class ServerRequestRpcs extends RpcGroup.make(
  Ping,
  CreateMessage,
  ListRoots,
  Elicit
) {}

/**
 * Encoded union of all server-to-client MCP request messages.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export type ServerRequestEncoded = RequestEncoded<typeof ServerRequestRpcs>

/**
 * RPC group for notifications that an MCP server can send to a client,
 * including cancellation, progress, logging, and list or resource update
 * notifications.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export class ServerNotificationRpcs extends RpcGroup.make(
  CancelledNotification,
  ProgressNotification,
  LoggingMessageNotification,
  ResourceUpdatedNotification,
  ResourceListChangedNotification,
  ToolListChangedNotification,
  PromptListChangedNotification,
  ElicitationCompleteNotification
) {}

/**
 * Encoded union of all server-to-client MCP notification messages.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export type ServerNotificationEncoded = NotificationEncoded<typeof ServerNotificationRpcs>

/**
 * Encoded success response sent by the server for a client-initiated request.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export type ServerSuccessEncoded = SuccessEncoded<typeof ClientRequestRpcs>

/**
 * Encoded failure response sent by the server for a client-initiated request.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export type ServerFailureEncoded = FailureEncoded<typeof ClientRequestRpcs>

/**
 * Encoded server response to a client request, either success or failure.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export type ServerResultEncoded = ServerSuccessEncoded | ServerFailureEncoded

/**
 * Encoded MCP messages accepted from a client by the server protocol: client
 * requests and client notifications.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export type FromClientEncoded = ClientRequestEncoded | ClientNotificationEncoded

/**
 * Encoded MCP messages emitted by the server protocol to a client: server
 * responses and server notifications.
 *
 * @stability unstable
 * @category protocols
 * @since 4.0.0
 */
export type FromServerEncoded = ServerResultEncoded | ServerNotificationEncoded

const ParamSchemaTypeId = "~effect/ai/McpSchema/ParamSchema"

/**
 * Returns `true` when a schema was created with `param` and therefore carries
 * a resource URI template parameter name.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export function isParam(schema: Schema.Constraint): schema is Param<string, Schema.Top> {
  return Predicate.hasProperty(schema, ParamSchemaTypeId)
}

/**
 * Schema wrapper used for resource URI template parameters.
 *
 * **Details**
 *
 * A `Param` behaves like the wrapped schema while carrying the parameter name
 * used for template compilation and completion lookup.
 *
 * @stability unstable
 * @category parameters
 * @since 4.0.0
 */
export interface Param<Name extends string, S extends Schema.Constraint> extends
  Schema.BottomLazy<
    S["ast"],
    Param<Name, S>,
    S["~type.parameters"],
    S["~type.mutability"],
    S["~type.optionality"],
    S["~type.constructor.default"],
    S["~encoded.mutability"],
    S["~encoded.optionality"]
  >
{
  readonly "Type": S["Type"]
  readonly "Encoded": S["Encoded"]
  readonly "DecodingServices": S["DecodingServices"]
  readonly "EncodingServices": S["EncodingServices"]
  readonly "Rebuild": Param<Name, S>
  readonly "~type.make.in": S["~type.make.in"]
  readonly "~type.make": S["~type.make"]
  readonly "Iso": S["Iso"]
  readonly [ParamSchemaTypeId]: typeof ParamSchemaTypeId
  readonly name: Name
  readonly schema: S
}

/**
 * Creates a parameter for a resource URI template.
 *
 * @stability unstable
 * @category parameters
 * @since 4.0.0
 */
export function param<const Name extends string, S extends Schema.Constraint>(
  name: Name,
  schema: S
): Param<Name, S> {
  return Schema.make(schema.ast, { [ParamSchemaTypeId]: ParamSchemaTypeId, name, schema })
}

/**
 * Annotation to conditionally enable or disable tools based on client
 * information.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class EnabledWhen extends Context.Service<
  EnabledWhen,
  Predicate.Predicate<{
    readonly protocolVersion: string
    readonly capabilities: ClientCapabilities
    readonly clientInfo?: Implementation | undefined
  }>
>()(
  "effect/ai/McpSchema/EnabledWhen"
) {}
