/**
 * Builds Model Context Protocol (MCP) servers with Effect.
 *
 * The `McpServer` service stores the tools, resources, resource templates,
 * prompts, completions, and outgoing notifications exposed by a server. This
 * module also includes the server runner, custom protocol,
 * stdio, and HTTP layers, registration helpers, and APIs that let handlers ask
 * the connected client for structured input or read its advertised
 * capabilities.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Digest from "../crypto/Digest.ts"
import * as Data from "../Data.ts"
import * as Deferred from "../Deferred.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as ErrorReporter from "../ErrorReporter.ts"
import * as Exit from "../Exit.ts"
import * as Fiber from "../Fiber.ts"
import * as FindMyWay from "../http/FindMyWay.ts"
import * as Headers from "../http/Headers.ts"
import { appendPreResponseHandlerUnsafe } from "../http/HttpEffect.ts"
import * as HttpRouter from "../http/HttpRouter.ts"
import * as HttpServerRequest from "../http/HttpServerRequest.ts"
import * as HttpServerResponse from "../http/HttpServerResponse.ts"
import type * as JsonSchema from "../JsonSchema.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as Predicate from "../Predicate.ts"
import * as PubSub from "../PubSub.ts"
import * as Queue from "../Queue.ts"
import * as RcMap from "../RcMap.ts"
import { CurrentLogLevel, Scheduler } from "../References.ts"
import * as Result from "../Result.ts"
import * as Rpc from "../rpc/Rpc.ts"
import * as RpcClient from "../rpc/RpcClient.ts"
import type * as RpcGroup from "../rpc/RpcGroup.ts"
import * as RpcMessage from "../rpc/RpcMessage.ts"
import * as RpcSerialization from "../rpc/RpcSerialization.ts"
import * as RpcServer from "../rpc/RpcServer.ts"
import * as Schema from "../Schema.ts"
import * as SchemaAST from "../SchemaAST.ts"
import * as Scope from "../Scope.ts"
import type { Stdio } from "../Stdio.ts"
import * as Stream from "../Stream.ts"
import * as Tracer from "../Tracer.ts"
import type * as Types from "../Types.ts"
import * as AiError from "./AiError.ts"
import * as McpCore from "./internal/mcpCore.ts"
import * as McpProtocolInternal from "./internal/mcpProtocol.ts"
import * as McpRuntime from "./internal/mcpRuntime.ts"
import * as McpSkills from "./internal/mcpSkills.ts"
import * as InternalStructuredOutput from "./internal/structured-output.ts"
import type * as McpProtocol from "./McpProtocol.ts"
import * as McpSchema from "./McpSchema.ts"
import {
  CallToolResult,
  ElicitationDeclined,
  EnabledWhen,
  GetPromptResult,
  InternalError,
  InvalidParams,
  InvalidRequest,
  isParam,
  McpRequestContext,
  McpServerClient,
  McpServerClientMiddleware,
  MethodNotFound,
  Prompt,
  Resource,
  ResourceTemplate,
  ServerNotificationRpcs,
  TextContent,
  Tool as McpTool,
  ToolJson
} from "./McpSchema.ts"
import type {
  CallTool,
  ClientCapabilities,
  Complete,
  CompleteResult,
  GetPrompt,
  McpErrorBase,
  Param,
  PromptArgument,
  PromptMessage,
  ReadResourceResult,
  ServerCapabilities
} from "./McpSchema.ts"
import * as Tool from "./Tool.ts"
import * as Toolkit from "./Toolkit.ts"

type CompletionContext = typeof Complete.payloadSchema.Type["context"]

interface QueuedServerNotification {
  readonly notification: McpCore.ServerNotification
  listChangeRevision?: number | undefined
  readonly targetClientId?: number | undefined
  readonly delivered: Deferred.Deferred<void>
  readonly requestContext?: McpRequestContext["Service"] | undefined
  readonly requestHeaders?: Headers.Headers | undefined
}

const internalState = new WeakMap<object, {
  readonly core: McpCore.McpCore
  // Registers a skill's own file, skipping the check that reserves it for the skill.
  readonly addSkillFile: McpServer["Service"]["addResource"]
  readonly notifications: Queue.Dequeue<QueuedServerNotification>
  readonly notificationDelivery: { consumers: number; listChangeRevision: number; requestEndpoints: number }
  readonly globalMiddleware: Array<middleware.Fn<any, any, any>>
}>()

// Request-scoped HTTP servers deliver a request's own notifications through
// that request's server instead of the shared notification queue.
const RequestNotificationQueue = Context.Reference<Queue.Queue<QueuedServerNotification> | undefined>(
  "effect/ai/McpServer/RequestNotificationQueue",
  { defaultValue: () => undefined }
)
// Progress and logs belong to the request that emitted them.
const isRequestNotification = (notification: McpCore.ServerNotification) =>
  notification._tag === "Progress" || notification._tag === "LoggingMessage"

type ServerExtensions = NonNullable<ServerCapabilities["extensions"]>
type ServerNotificationRequest<
  R extends Rpc.Any = RpcGroup.Rpcs<typeof BroadcastServerNotificationRpcs>
> = R extends Rpc.Any ? RpcMessage.Request<R> : never

const BroadcastServerNotificationRpcs = ServerNotificationRpcs.omit("notifications/elicitation/complete")
const isLoggingLevel = Schema.is(McpSchema.LoggingLevel)

const toInternalServerNotification = (
  message: ServerNotificationRequest
): McpCore.ServerNotification | undefined => {
  switch (message.tag) {
    case "notifications/cancelled":
      return McpCore.ServerNotification.Cancelled({
        requestId: message.payload.requestId,
        reason: message.payload.reason,
        metadata: message.payload._meta
      })
    case "notifications/progress":
      return McpCore.ServerNotification.Progress({
        progressToken: message.payload.progressToken,
        progress: message.payload.progress,
        total: message.payload.total,
        message: message.payload.message,
        metadata: message.payload._meta
      })
    case "notifications/message":
      return McpCore.ServerNotification.LoggingMessage({
        level: message.payload.level,
        logger: message.payload.logger,
        data: message.payload.data,
        metadata: message.payload._meta
      })
    case "notifications/resources/updated":
      return McpCore.ServerNotification.ResourceUpdated({
        uri: message.payload.uri,
        metadata: message.payload._meta
      })
    case "notifications/resources/list_changed":
      return McpCore.ServerNotification.ResourcesChanged({ metadata: message.payload?._meta })
    case "notifications/tools/list_changed":
      return McpCore.ServerNotification.ToolsChanged({ metadata: message.payload?._meta })
    case "notifications/prompts/list_changed":
      return McpCore.ServerNotification.PromptsChanged({ metadata: message.payload?._meta })
    default:
      return undefined
  }
}

const middlewareKeyPrefix = "effect/ai/McpServer/Middleware-"

// Do not capture request services or middleware stacks at registration.
const requestServiceKeys = new Set<string>([
  McpRequestContext.key,
  McpServerClient.key,
  HttpServerRequest.HttpServerRequest.key,
  HttpServerRequest.ParsedSearchParams.key,
  HttpRouter.RouteContext.key,
  CurrentLogLevel.key,
  Scope.Scope.key,
  Tracer.ParentSpan.key
])

const omitRequestServices = <Services>(context: Context.Context<Services>): Context.Context<Services> => {
  const services = new Map<string, any>()
  for (const [key, value] of context.mapUnsafe) {
    if (!requestServiceKeys.has(key) && !key.startsWith(middlewareKeyPrefix)) {
      services.set(key, value)
    }
  }
  return Context.makeUnsafe(services)
}

const provideInvocationContext = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  invocation: McpCore.McpInvocation
): Effect.Effect<A, E, Exclude<R, McpRequestContext>> => {
  let provided = Effect.provideService(effect, McpRequestContext, invocation.requestContext)
  const requestMetadata = invocation.requestContext.requestMetadata
  const logLevel = Predicate.hasProperty(requestMetadata, "io.modelcontextprotocol/logLevel")
    ? requestMetadata["io.modelcontextprotocol/logLevel"]
    : undefined
  if (isLoggingLevel(logLevel)) {
    provided = Effect.provideService(
      provided,
      CurrentLogLevel,
      McpProtocolInternal.mcpLogLevels[logLevel].effect
    )
  }
  return (invocation.serverClient === undefined
    ? provided
    : Effect.provideService(provided, McpServerClient, invocation.serverClient)) as Effect.Effect<
      A,
      E,
      Exclude<R, McpRequestContext>
    >
}

// -----------------------------------------------------------------------------
// Request-level dependencies
// -----------------------------------------------------------------------------

/**
 * Marks a request-level dependency of an MCP registration or middleware.
 *
 * **Details**
 *
 * Registrations carry handler dependencies as `McpRequest<"Requires", S>`.
 * MCP middleware and transports discharge these markers; providing `S` with
 * `Layer.provide` or `Effect.provide` does not.
 *
 * `layerHttp` and `layerHttpRequestScoped` convert the markers they don't
 * discharge into `HttpRouter.Request` markers, so `HttpRouter.middleware` can
 * satisfy them. On stdio and custom transports an undischarged marker is a
 * compile error.
 *
 * @see {@link middleware} for discharging request-level dependencies
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export interface McpRequest<Kind extends string, T> {
  readonly _: unique symbol
  readonly kind: Kind
  readonly type: T
}

/**
 * Helper types for `McpRequest` markers.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export declare namespace McpRequest {
  /**
   * Wraps each member of a union in an `McpRequest` marker of the supplied kind.
   *
   * @stability unstable
   * @category utility types
   * @since 4.0.0
   */
  export type From<Kind extends string, R> = R extends infer T ? McpRequest<Kind, T> : never

  /**
   * Extracts the services from `McpRequest` markers of the supplied kind.
   *
   * @stability unstable
   * @category utility types
   * @since 4.0.0
   */
  export type Only<Kind extends string, A> = A extends McpRequest<Kind, infer T> ? T : never

  /**
   * Removes `McpRequest` markers from a union.
   *
   * @stability unstable
   * @category utility types
   * @since 4.0.0
   */
  export type Without<A> = A extends McpRequest<infer _Kind, infer _> ? never : A
}

/**
 * Opaque handler result. Middleware can wrap execution and provide services,
 * but cannot inspect or replace the result.
 *
 * @stability unstable
 * @category middleware
 * @since 4.0.0
 */
export interface MiddlewareSuccess {
  readonly _: unique symbol
}

/**
 * The request methods that run MCP middleware. More methods may be added, so
 * don't `switch` on it exhaustively without a default case.
 *
 * @stability unstable
 * @category middleware
 * @since 4.0.0
 */
export type MiddlewareMethod =
  | "tools/call"
  | "resources/read"
  | "prompts/get"
  | "completion/complete"
  | "tools/list"
  | "resources/list"
  | "resources/templates/list"
  | "prompts/list"
  | "skills/list"
  | "skills/get"
  | "resources/directory/read"

/**
 * Request metadata passed to MCP middleware.
 *
 * **Details**
 *
 * `target` is the tool name, the requested resource URI, or the prompt name.
 * For `completion/complete` it is the prompt name, or the URI template of the
 * resource template being completed. For `skills/get` it is the URI of the
 * skill's `SKILL.md`. `payload` holds the request parameters.
 *
 * On list requests, middleware runs only when it wraps a {@link visibility},
 * once for each registration it wraps. `target` is then the tool name, the
 * resource URI, the URI template or the prompt name of that registration, and
 * `payload` is `undefined`. `skills/list` and `resources/directory/read` are
 * list requests whose `target` is the `SKILL.md` URI of each skill; a
 * directory read checks only the skills that have the directory. A skill's
 * files are resources, checked as `resources/list` and `resources/read` with
 * their own URIs.
 *
 * `headers` are the HTTP request headers. They are empty on stdio, on custom
 * transports and for in-process calls. `sessionId` is the `Mcp-Session-Id`
 * header, so it is `undefined` outside sessionful HTTP.
 *
 * @stability unstable
 * @category middleware
 * @since 4.0.0
 */
export interface MiddlewareOptions {
  readonly method: MiddlewareMethod
  readonly target: string
  readonly payload: unknown
  readonly requestContext: McpRequestContext["Service"]
  readonly headers: Headers.Headers
  readonly sessionId: string | undefined
}

const MiddlewareTypeId = "~effect/ai/McpServer/Middleware"

type MiddlewareConfig = {
  provides: any
  error: McpErrorBase
  requires: any
  layerError: any
  layerRequires: any
}

type MiddlewareLayer<Config extends MiddlewareConfig, R> = Layer.Layer<
  McpRequest.From<"Requires", Config["provides"]>,
  Config["layerError"],
  R | Config["layerRequires"] | McpRequest.From<"Requires", Config["requires"]>
>

/**
 * Composable MCP middleware.
 *
 * **Details**
 *
 * Provide `layer` to registration layers, or to the Effect form of a
 * registration, to run the middleware for those registrations. Use
 * `layerGlobal` to run it for every request on the server.
 *
 * Services the middleware reads per request are `McpRequest<"Requires", S>`
 * requirements of `layer` and `layerGlobal`, like the request-level
 * dependencies of a registration. A middleware that provides `S` meets them
 * when it runs outside this one: `a.combine(b)` runs `b` outside `a`, and so
 * does providing `b.layer` or `b.layerGlobal` outside `a.layer`, though
 * `layerGlobal` installs `b` for the whole server. The transport discharges
 * the services it supplies, and `layerHttp` turns the rest into
 * `HttpRouter.Request` requirements that an `HttpRouter.middleware` can meet.
 *
 * @see {@link middleware} for creating MCP middleware
 *
 * @stability unstable
 * @category middleware
 * @since 4.0.0
 */
export interface Middleware<Config extends MiddlewareConfig> {
  readonly [MiddlewareTypeId]: Config
  readonly layer: MiddlewareLayer<Config, never>
  readonly layerGlobal: MiddlewareLayer<Config, McpServer>
  readonly combine: <Config2 extends MiddlewareConfig>(other: Middleware<Config2>) => Middleware<{
    provides: Config2["provides"] | Config["provides"]
    error: Config2["error"] | Config["error"]
    requires: Exclude<Config["requires"], Config2["provides"]> | Config2["requires"]
    layerError: Config["layerError"] | Config2["layerError"]
    layerRequires: Config["layerRequires"] | Config2["layerRequires"]
  }>
}

/**
 * Creates MCP middleware that runs around `tools/call`, `resources/read`,
 * `prompts/get` and `completion/complete` requests.
 *
 * **Details**
 *
 * Middleware is how request-level dependencies are satisfied: declare the
 * services it provides with `middleware<{ provides: S }>()` and provide them to
 * the handler effect. It receives the request headers, session id and request
 * context, so it can resolve the current user per request.
 *
 * Pass a function, or an Effect that builds the function. Services the Effect
 * reads are requirements of the middleware layer. Services the function reads
 * per request, other than `McpRequestContext`, are per-request requirements
 * of the result; see {@link Middleware} for how they are met.
 *
 * Failures must be `McpErrorBase` values. A middleware failure is sent as a
 * JSON-RPC error with its `code`, `message` and `data`, never as a tool
 * result. Pick custom codes from the implementation-defined range
 * (-32000 to -32019): any numeric `code` is sent as is. Defects are logged,
 * reported to the `ErrorReporter` and sent as `InternalError("Internal error")`.
 * Interruption propagates.
 *
 * Local middleware runs inside global middleware, and middleware provided both
 * locally and globally runs once. Middleware never runs for `initialize`. It
 * runs for list requests only when it wraps a {@link visibility}, so that the
 * visibility check can read the services it provides.
 *
 * **Example** (Resolving the current user per request)
 *
 * ```ts
 * import { Context, Effect, Layer, Schema } from "effect"
 * import { McpSchema, McpServer, Tool, Toolkit } from "effect/ai"
 *
 * class CurrentUser extends Context.Service<CurrentUser, { readonly id: string }>()("CurrentUser") {}
 *
 * class Unauthorized extends Schema.Error<Unauthorized>("Unauthorized")({
 *   ...McpSchema.McpErrorBase.fields,
 *   _tag: Schema.tag("Unauthorized"),
 *   code: Schema.tag(-32001)
 * }) {}
 *
 * const WhoAmI = Tool.make("WhoAmI", { success: Schema.String, dependencies: [CurrentUser] })
 * const Tools = Toolkit.make(WhoAmI)
 *
 * const Auth = McpServer.middleware<{ provides: CurrentUser }>()((effect, { headers }) => {
 *   const token = headers["authorization"]
 *   return token === undefined
 *     ? Effect.fail(new Unauthorized({ message: "Missing credentials" }))
 *     : Effect.provideService(effect, CurrentUser, { id: token })
 * })
 *
 * const Registrations = McpServer.toolkit(Tools).pipe(
 *   Layer.provide(Auth.layer),
 *   Layer.provide(Tools.toLayer({
 *     WhoAmI: () => Effect.map(CurrentUser, (user) => user.id)
 *   }))
 * )
 * ```
 *
 * @stability unstable
 * @category middleware
 * @since 4.0.0
 */
export const middleware:
  & middleware.Make<never>
  & (<Config extends { provides?: any } = {}>() => middleware.Make<
    Config extends { provides: infer P } ? P : never
  >) = function() {
    if (arguments.length === 0) {
      return makeMiddleware as any
    }
    return makeMiddleware(arguments[0], arguments[1]) as any
  }

/**
 * Types used by `middleware`.
 *
 * @stability unstable
 * @category middleware
 * @since 4.0.0
 */
export declare namespace middleware {
  /**
   * The middleware function.
   *
   * @stability unstable
   * @category middleware
   * @since 4.0.0
   */
  export type Fn<Provides, E, R> = (
    effect: Effect.Effect<MiddlewareSuccess, McpErrorBase, Types.NoInfer<Provides>>,
    options: MiddlewareOptions
  ) => Effect.Effect<MiddlewareSuccess, E, R>

  /**
   * The overloads of a middleware constructor.
   *
   * @stability unstable
   * @category middleware
   * @since 4.0.0
   */
  export type Make<Provides> = {
    <E extends McpErrorBase, R, EX, RX, const Global extends boolean = false>(
      middleware: Effect.Effect<Fn<Provides, E, R>, EX, RX>,
      options?: { readonly global?: Global | undefined }
    ): Made<Global, {
      provides: Provides
      error: E
      requires: Exclude<R, McpRequestContext>
      layerError: EX
      layerRequires: Exclude<RX, Scope.Scope>
    }>
    <E extends McpErrorBase, R, const Global extends boolean = false>(
      middleware: Fn<Provides, E, R>,
      options?: { readonly global?: Global | undefined }
    ): Made<Global, {
      provides: Provides
      error: E
      requires: Exclude<R, McpRequestContext>
      layerError: never
      layerRequires: never
    }>
  }
}

/**
 * Creates middleware that hides registrations per request.
 *
 * **Details**
 *
 * The check runs for every registration the middleware is provided to, on list
 * requests and on calls, reads, gets and completions. When it returns `false`
 * the registration is left out of list results, and requests for it fail as if
 * it was not registered.
 *
 * The result is a `Middleware` and composes like one. The check receives the
 * same {@link MiddlewareOptions} as middleware, and services it reads per
 * request, other than `McpRequestContext`, are met the same way. Scope a
 * visibility to some tools by providing its layer to their toolkit only, or
 * branch on `target`.
 *
 * On a list request, the check and the middleware outside the innermost
 * visibility run once for each registration. Middleware inside it does not
 * run. A failure of that middleware or of a check fails the whole list
 * request. It never hides a registration.
 *
 * Unlike `EnabledWhen`, a visibility runs the middleware around it on list
 * requests, and middleware sees requests for hidden registrations.
 *
 * **Example** (Hiding admin tools from other users)
 *
 * ```ts
 * import { Context, Effect, Layer, Schema } from "effect"
 * import { McpServer, Tool, Toolkit } from "effect/ai"
 *
 * class CurrentUser extends Context.Service<CurrentUser, { readonly isAdmin: boolean }>()("CurrentUser") {}
 *
 * const AdminTools = Toolkit.make(Tool.make("DeleteUser", { success: Schema.String }))
 *
 * const Auth = McpServer.middleware<{ provides: CurrentUser }>()((effect, { headers }) =>
 *   Effect.provideService(effect, CurrentUser, { isAdmin: headers["x-role"] === "admin" })
 * )
 * const AdminOnly = McpServer.visibility(() => Effect.map(CurrentUser, (user) => user.isAdmin))
 *
 * const Registrations = McpServer.toolkit(AdminTools).pipe(
 *   Layer.provide(AdminOnly.combine(Auth).layer),
 *   Layer.provide(AdminTools.toLayer({ DeleteUser: () => Effect.succeed("deleted") }))
 * )
 * ```
 *
 * @see {@link middleware} for providing the services a check reads
 *
 * @stability unstable
 * @category middleware
 * @since 4.0.0
 */
export const visibility: visibility.Make = ((
  check: AnyVisibilityCheck | Effect.Effect<AnyVisibilityCheck, any, any>,
  options?: { readonly global?: boolean | undefined }
) => makeMiddleware(Effect.isEffect(check) ? Effect.map(check, makeGate) : makeGate(check), options)) as any

/**
 * Types used by `visibility`.
 *
 * @stability unstable
 * @category middleware
 * @since 4.0.0
 */
export declare namespace visibility {
  /**
   * The visibility check.
   *
   * @stability unstable
   * @category middleware
   * @since 4.0.0
   */
  export type Check<E, R> = (options: MiddlewareOptions) => Effect.Effect<boolean, E, R>

  /**
   * The overloads of `visibility`.
   *
   * @stability unstable
   * @category middleware
   * @since 4.0.0
   */
  export type Make = {
    <E extends McpErrorBase, R, EX, RX, const Global extends boolean = false>(
      check: Effect.Effect<Check<E, R>, EX, RX>,
      options?: { readonly global?: Global | undefined }
    ): Made<Global, {
      provides: never
      error: E
      requires: Exclude<R, McpRequestContext>
      layerError: EX
      layerRequires: Exclude<RX, Scope.Scope>
    }>
    <E extends McpErrorBase, R, const Global extends boolean = false>(
      check: Check<E, R>,
      options?: { readonly global?: Global | undefined }
    ): Made<Global, {
      provides: never
      error: E
      requires: Exclude<R, McpRequestContext>
      layerError: never
      layerRequires: never
    }>
  }
}

type AnyVisibilityCheck = visibility.Check<any, any>

// Raised by a visibility gate. It is left out of the types because `makeInvoke`
// replaces it with the not-found error of the request. It still has the shape
// of an MCP error, since middleware outside the gate sees it as one.
class Hidden extends Data.TaggedError("effect/ai/McpServer/Hidden")<{
  readonly code: number
  readonly message: string
}> {}

const failHidden = Effect.fail(
  new Hidden({ code: McpSchema.INVALID_PARAMS_ERROR_CODE, message: "Not found" })
) as Effect.Effect<never>

// Marks the middleware functions created by `visibility`.
const gates = new WeakSet<AnyMiddlewareFn>()

const makeGate = (check: AnyVisibilityCheck): AnyMiddlewareFn => {
  const gate: AnyMiddlewareFn = (effect, options) =>
    Effect.flatMap(check(options), (visible) => visible ? effect : failHidden)
  gates.add(gate)
  return gate
}

type Made<Global extends boolean, Config extends MiddlewareConfig> = Global extends true
  ? MiddlewareLayer<Config, McpServer>
  : Middleware<Config>

type AnyMiddlewareFn = middleware.Fn<any, any, any>

class MiddlewareFn extends Context.Service<MiddlewareFn, AnyMiddlewareFn>()("effect/ai/McpServer/MiddlewareFn") {}

const makeMiddleware = (
  fn: AnyMiddlewareFn | Effect.Effect<AnyMiddlewareFn, any, any>,
  options?: { readonly global?: boolean | undefined }
) => {
  const middleware = new MiddlewareImpl(
    Effect.isEffect(fn) ? Layer.effect(MiddlewareFn)(fn) : Layer.succeed(MiddlewareFn, fn)
  )
  return options?.global ? middleware.layerGlobal : middleware
}

let middlewareId = 0

class MiddlewareImpl {
  readonly [MiddlewareTypeId] = {} as any
  readonly layer: Layer.Layer<never, any, any>
  readonly layerGlobal: Layer.Layer<never, any, any>
  readonly layerFn: Layer.Layer<MiddlewareFn, any, any>
  readonly dependencies: Layer.Layer<any, any, any> | undefined

  constructor(
    layerFn: Layer.Layer<MiddlewareFn, any, any>,
    dependencies?: Layer.Layer<any, any, any> | undefined
  ) {
    this.layerFn = layerFn
    this.dependencies = dependencies
    const contextKey = `${middlewareKeyPrefix}${++middlewareId}`
    this.layer = Layer.effectContext(Effect.gen(function*() {
      const stack: Array<AnyMiddlewareFn> = [yield* MiddlewareFn]
      if (dependencies) {
        const memoMap = yield* Layer.CurrentMemoMap
        const scope = yield* Effect.scope
        stack.push(...getMiddleware(yield* Layer.buildWithMemoMap(dependencies, memoMap, scope)))
      }
      return Context.makeUnsafe<never>(new Map([[contextKey, stack]]))
    })).pipe(Layer.provide(layerFn))
    this.layerGlobal = Layer.effectDiscard(Effect.gen(function*() {
      const stack: ReadonlyArray<AnyMiddlewareFn> = Context.getOrUndefinedUnsafe(
        yield* Effect.context<never>(),
        contextKey as any
      )!
      const { globalMiddleware } = internalState.get(yield* McpServer)!
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          globalMiddleware.push(...stack)
        }),
        () =>
          Effect.sync(() => {
            for (const fn of stack) {
              const index = globalMiddleware.indexOf(fn)
              if (index !== -1) globalMiddleware.splice(index, 1)
            }
          })
      )
    })).pipe(Layer.provide(this.layer))
  }

  combine(other: Middleware<any>): Middleware<any> {
    return new MiddlewareImpl(
      this.layerFn,
      this.dependencies ? Layer.provideMerge(this.dependencies, other.layer as any) : other.layer as any
    ) as any
  }
}

// The innermost middleware comes first.
const getMiddleware = (context: Context.Context<never>): ReadonlyArray<AnyMiddlewareFn> => {
  const stacks: Array<ReadonlyArray<AnyMiddlewareFn>> = []
  let maxLength = 0
  for (const [key, value] of context.mapUnsafe) {
    if (key.startsWith(middlewareKeyPrefix)) {
      stacks.push(value)
      maxLength = Math.max(maxLength, value.length)
    }
  }
  const unique = new Set<AnyMiddlewareFn>()
  for (let i = maxLength - 1; i >= 0; i--) {
    for (const stack of stacks) {
      if (i < stack.length) unique.add(stack[i])
    }
  }
  return Arr.fromIterable(unique).reverse()
}

const isMcpError = (error: unknown): error is McpErrorBase =>
  Predicate.hasProperty(error, "code") && typeof error.code === "number" &&
  Predicate.hasProperty(error, "message") && typeof error.message === "string"

// Distinguishes handler failures from failures raised or rewritten by middleware.
const HandlerFailure = Context.Reference<boolean>("effect/ai/McpServer/HandlerFailure", {
  defaultValue: () => false
})
const handlerFailure = Context.make(HandlerFailure, true)

const internalError = new InternalError({ message: "Internal error" })

const rejectWith = (error: McpErrorBase) =>
  Effect.fail(new McpCore.RequestRejected({ code: error.code, message: error.message, data: error.data, error }))

type CallMethod = "tools/call" | "resources/read" | "prompts/get" | "completion/complete" | "skills/get"

type ListMethod = Exclude<MiddlewareMethod, CallMethod>

interface NotFoundErrors {
  readonly "tools/call": McpCore.ToolNotFound
  readonly "resources/read": McpCore.ResourceNotFound
  readonly "prompts/get": McpCore.PromptNotFound
  readonly "completion/complete": InvalidParams
  readonly "skills/get": McpCore.SkillNotFound
}

const notFound = (method: CallMethod, target: string): NotFoundErrors[CallMethod] => {
  switch (method) {
    case "tools/call":
      return new McpCore.ToolNotFound({ name: target })
    case "resources/read":
      return new McpCore.ResourceNotFound({ uri: target })
    case "prompts/get":
      return new McpCore.PromptNotFound({ name: target })
    case "completion/complete":
      return new InvalidParams({ message: "Unknown completion reference or argument" })
    case "skills/get":
      return new McpCore.SkillNotFound({ uri: target })
  }
}

const isHidden = (error: unknown): error is Hidden => error instanceof Hidden

// Recovers a request rejected by a visibility gate. Any other cause, including
// one that also holds an interrupt, is propagated unchanged.
const catchHidden =
  <B, E2>(onHidden: () => Effect.Effect<B, E2>) =>
  <A, E, R>(self: Effect.Effect<A, E, R>): Effect.Effect<A | B, Exclude<E, Hidden> | E2, R> =>
    Effect.catchCause(self, (cause): Effect.Effect<B, Exclude<E, Hidden> | E2> => {
      const failure = Cause.findFail(cause)
      return !Cause.hasInterrupts(cause) && Result.isSuccess(failure) && isHidden(failure.success.error)
        ? onHidden()
        : Effect.failCause(cause as Cause.Cause<Exclude<E, Hidden>>)
    })

// The innermost middleware comes first. Middleware provided both locally and
// globally runs once, at its outermost position.
const middlewareStack = (
  localMiddleware: ReadonlyArray<AnyMiddlewareFn>,
  globalMiddleware: ReadonlyArray<AnyMiddlewareFn>
): ReadonlyArray<AnyMiddlewareFn> => {
  if (globalMiddleware.length === 0) {
    return localMiddleware
  }
  if (localMiddleware.length === 0) {
    return globalMiddleware
  }
  const stack = [...localMiddleware, ...globalMiddleware]
  return stack.filter((fn, index) => stack.lastIndexOf(fn) === index)
}

// Runs a handler inside middleware. The handler's own failures pass through, a
// visibility gate fails with `Hidden`, and other failures become
// `RequestRejected`: middleware failures as JSON-RPC errors, anything else as
// a reported internal error.
const runMiddleware = <A, E>(
  handler: Effect.Effect<A, E, any>,
  middleware: ReadonlyArray<AnyMiddlewareFn>,
  invocation: McpCore.McpInvocation,
  request: Pick<MiddlewareOptions, "method" | "target" | "payload">
): Effect.Effect<A, E | Hidden | McpCore.RequestRejected> => {
  const effect = middleware.length === 0 ? handler : Effect.withFiber((fiber) => {
    const headers = Context.getOrUndefined(fiber.context, HttpServerRequest.HttpServerRequest)?.headers ??
      Headers.empty
    const options: MiddlewareOptions = {
      ...request,
      requestContext: invocation.requestContext,
      headers,
      sessionId: headers[MCP_SESSION_ID_HEADER]
    }
    const handled = Effect.catchCause(handler, (cause) => Effect.failCause(Cause.annotate(cause, handlerFailure)))
    return middleware.reduce((effect: Effect.Effect<any, any, any>, fn) => fn(effect, options), handled)
  })
  return provideInvocationContext(effect, invocation).pipe(
    Effect.catchCause((cause): Effect.Effect<never, E | Hidden | McpCore.RequestRejected> => {
      if (Cause.hasInterrupts(cause)) {
        return Effect.failCause(cause)
      }
      const failure = Cause.findFail(cause)
      if (Result.isSuccess(failure) && !Cause.hasDies(cause)) {
        const error = failure.success.error
        if (isHidden(error)) {
          return Effect.fail(error)
        }
        if (middleware.length === 0 || Context.get(Cause.reasonAnnotations(failure.success), HandlerFailure)) {
          return Effect.failCause(cause)
        }
        if (isMcpError(error)) {
          return rejectWith(error)
        }
      }
      return Effect.logError(cause).pipe(
        Effect.andThen(ErrorReporter.report(cause)),
        Effect.andThen(rejectWith(internalError))
      )
    })
  ) as Effect.Effect<A, E | Hidden | McpCore.RequestRejected>
}

// Request services override captured services; global middleware wraps local middleware.
const makeInvoke = (
  context: Context.Context<never> | undefined,
  globalMiddleware: ReadonlyArray<AnyMiddlewareFn>
) => {
  const services = context === undefined ? Context.empty() : omitRequestServices(context)
  const localMiddleware = context === undefined ? [] : getMiddleware(context)
  const invoke = <A, E, M extends CallMethod>(
    handler: Effect.Effect<A, E, any>,
    invocation: McpCore.McpInvocation,
    request: {
      readonly method: M
      readonly target: string
      readonly payload: unknown
    }
  ): Effect.Effect<A, E | NotFoundErrors[M] | McpCore.RequestRejected> =>
    runMiddleware(
      services.mapUnsafe.size === 0
        ? handler
        : Effect.updateContext(handler, (context: Context.Context<any>) => Context.merge(services, context)),
      middlewareStack(localMiddleware, globalMiddleware),
      invocation,
      request
    ).pipe(
      catchHidden(() => Effect.fail(notFound(request.method, request.target) as NotFoundErrors[M]))
    ) as Effect.Effect<A, E | NotFoundErrors[M] | McpCore.RequestRejected>
  // On list requests only the middleware outside the innermost visibility runs.
  const visible = (method: ListMethod, target: string): McpCore.Visible => (invocation) => {
    const middleware = middlewareStack(localMiddleware, globalMiddleware)
    const innermost = middleware.findIndex((fn) => gates.has(fn))
    if (innermost === -1) {
      return Effect.succeed(true)
    }
    return runMiddleware(Effect.void, middleware.slice(innermost), invocation, { method, target, payload: undefined })
      .pipe(
        Effect.as(true),
        catchHidden(() => Effect.succeed(false))
      )
  }
  return { invoke, visible }
}

// Applies the `EnabledWhen` annotation of a registration.
const isEnabled = (annotations: Context.Context<never>) => {
  const enabledWhen = Context.getOrUndefined(annotations, EnabledWhen)
  return (profile: McpCore.NegotiatedProtocolProfile<string>): boolean =>
    enabledWhen === undefined || enabledWhen({
      protocolVersion: profile.protocolVersion,
      capabilities: profile.clientCapabilities,
      clientInfo: profile.clientInfo
    })
}

const rejectedError = (rejected: McpCore.RequestRejected) => Effect.fail(rejected.error)

/**
 * Service that stores and serves an MCP server's registered tools, resources,
 * prompts, completions, and outgoing notifications.
 *
 * **Details**
 *
 * Handlers use this service to register capabilities and resolve incoming MCP
 * requests.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class McpServer extends Context.Service<McpServer, {
  readonly notifications: RpcClient.RpcClient<RpcGroup.Rpcs<typeof BroadcastServerNotificationRpcs>>
  readonly notifyElicitationComplete: (options: {
    readonly clientId: number
    readonly elicitationId: string
  }) => Effect.Effect<void>
  readonly tools: ReadonlyArray<{
    readonly tool: McpTool
    readonly annotations: Context.Context<never>
  }>
  readonly addTool: (options: {
    readonly tool: McpTool
    readonly annotations: Context.Context<never>
    readonly services?: Context.Context<never> | undefined
    readonly handle: (
      payload: any
    ) => Effect.Effect<
      CallToolResult | McpSchema.InputRequired,
      InternalError | InvalidParams,
      McpRequestContext
    >
  }) => Effect.Effect<void>
  readonly callTool: (
    requests: typeof CallTool.payloadSchema.Type
  ) => Effect.Effect<CallToolResult, McpErrorBase | InternalError | InvalidParams, McpServerClient>

  readonly resources: ReadonlyArray<{
    readonly resource: Resource
    readonly annotations: Context.Context<never>
  }>
  readonly addResource: (options: {
    readonly resource: Resource
    readonly annotations: Context.Context<never>
    readonly services?: Context.Context<never> | undefined
    readonly handle: Effect.Effect<
      ReadResourceResult,
      InternalError,
      McpRequestContext
    >
  }) => Effect.Effect<void>

  readonly resourceTemplates: ReadonlyArray<{
    readonly template: ResourceTemplate
    readonly annotations: Context.Context<never>
  }>
  readonly addResourceTemplate: (
    options: {
      readonly template: ResourceTemplate
      readonly annotations: Context.Context<never>
      readonly services?: Context.Context<never> | undefined
      readonly routerPath: string
      readonly completions: Record<
        string,
        (
          input: string,
          context: CompletionContext
        ) => Effect.Effect<CompleteResult, InternalError>
      >
      readonly handle: (
        uri: string,
        params: Array<string>
      ) => Effect.Effect<
        ReadResourceResult,
        InvalidParams | InternalError,
        McpRequestContext
      >
    }
  ) => Effect.Effect<void>

  readonly findResource: (
    uri: string
  ) => Effect.Effect<ReadResourceResult, McpErrorBase | InvalidParams | InternalError, McpServerClient>

  readonly prompts: ReadonlyArray<{
    readonly prompt: Prompt
    readonly annotations: Context.Context<never>
  }>
  readonly addPrompt: (options: {
    readonly prompt: Prompt
    readonly annotations: Context.Context<never>
    readonly services?: Context.Context<never> | undefined
    readonly completions: Record<
      string,
      (
        input: string,
        context: CompletionContext
      ) => Effect.Effect<CompleteResult, InternalError, McpRequestContext>
    >
    readonly handle: (
      params: Record<string, string>
    ) => Effect.Effect<GetPromptResult | McpSchema.InputRequired, InternalError | InvalidParams, McpRequestContext>
  }) => Effect.Effect<void>
  readonly getPromptResult: (
    request: typeof GetPrompt.payloadSchema.Type
  ) => Effect.Effect<GetPromptResult, McpErrorBase | InternalError | InvalidParams, McpServerClient>

  readonly completion: (
    complete: typeof Complete.payloadSchema.Type
  ) => Effect.Effect<CompleteResult, McpErrorBase | InvalidParams | InternalError, McpServerClient>
}>()("effect/ai/McpServer") {
  /**
   * Builds an MCP server service from registered tools, prompts, resources, and completions.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static readonly make = Effect.gen(function*() {
    const internalCore = yield* McpCore.make
    const tools = Arr.empty<{
      readonly tool: McpTool
      readonly annotations: Context.Context<never>
    }>()
    const resources: Array<{
      readonly resource: Resource
      readonly annotations: Context.Context<never>
    }> = []
    const resourceTemplates: Array<{
      readonly template: ResourceTemplate
      readonly annotations: Context.Context<never>
    }> = []
    const prompts: Array<{
      readonly prompt: Prompt
      readonly annotations: Context.Context<never>
    }> = []
    const notificationsQueue = yield* Queue.make<QueuedServerNotification>()
    const globalMiddleware: Array<AnyMiddlewareFn> = []
    const notificationDelivery = { consumers: 0, listChangeRevision: 0, requestEndpoints: 0 }
    // With only request-scoped endpoints, no long-lived server ever takes from the shared queue.
    const withoutSharedConsumer = () =>
      notificationDelivery.consumers === 0 && notificationDelivery.requestEndpoints > 0
    const pendingListChanges = new Map<string, QueuedServerNotification>()
    const dispatcher = (yield* Scheduler).makeDispatcher()
    const notifications = yield* RpcClient.makeNoSerialization(BroadcastServerNotificationRpcs, {
      spanPrefix: "McpServer/Notifications",
      onFromClient: (options) =>
        Deferred.make<void>().pipe(Effect.flatMap((delivered) =>
          Effect.withFiber((fiber): Effect.Effect<void> => {
            const message = options.message
            if (message._tag !== "Request") {
              return Effect.void
            }
            const notification = toInternalServerNotification(message)
            if (notification === undefined) {
              return Effect.void
            }
            const queued: QueuedServerNotification = {
              notification,
              delivered,
              requestContext: Context.getOrUndefined(fiber.context, McpRequestContext),
              requestHeaders: Context.getOrUndefined(fiber.context, HttpServerRequest.HttpServerRequest)?.headers
            }
            // write resumes the caller synchronously, so defer it until delivery completes.
            const acknowledge = Effect.suspend(() =>
              notifications.write({
                clientId: 0,
                requestId: message.id,
                _tag: "Exit",
                exit: Exit.void
              })
            )
            // A request-scoped endpoint delivers its request's own progress and logs on that request's response.
            const requestQueue = Context.get(fiber.context, RequestNotificationQueue)
            if (
              requestQueue !== undefined && queued.requestContext !== undefined && isRequestNotification(notification)
            ) {
              Queue.offerUnsafe(requestQueue, queued)
              return Effect.andThen(Deferred.await(delivered), acknowledge)
            }
            if (withoutSharedConsumer()) {
              return acknowledge
            }
            let enqueued = false
            if (message.tag.includes("list_changed")) {
              const revision = ++notificationDelivery.listChangeRevision
              const pending = pendingListChanges.get(message.tag)
              if (pending !== undefined) {
                // A coalesced change may be newer than an intervening subscription.
                pending.listChangeRevision = revision
              } else {
                queued.listChangeRevision = revision
                enqueued = true
                pendingListChanges.set(message.tag, queued)
                dispatcher.scheduleTask(() => {
                  pendingListChanges.delete(message.tag)
                  Queue.offerUnsafe(notificationsQueue, queued)
                }, 0)
              }
            } else {
              enqueued = true
              Queue.offerUnsafe(notificationsQueue, queued)
            }
            return enqueued && queued.requestContext !== undefined && notificationDelivery.consumers > 0
              ? Effect.andThen(Deferred.await(delivered), acknowledge)
              : acknowledge
          })
        ))
    })

    // Checking skill ownership and both writes happen in one synchronous step,
    // so a skill cannot claim the URI in between. Skill files skip the check.
    const addResource = (
      options: Parameters<McpServer["Service"]["addResource"]>[0],
      checkOwnership: boolean
    ): Effect.Effect<void> =>
      Effect.suspend(() => {
        if (checkOwnership && internalCore.skills.ownsFile(options.resource.uri)) {
          return Effect.die(
            new Cause.IllegalArgumentError(`Resource ${options.resource.uri} is a file of a registered skill`)
          )
        }
        const existingIndex = resources.findIndex(({ resource }) => resource.uri === options.resource.uri)
        if (existingIndex === -1) {
          resources.push(options)
        } else {
          resources[existingIndex] = options
        }
        const { invoke, visible } = makeInvoke(options.services, globalMiddleware)
        internalCore.resources.register({
          descriptor: options.resource,
          visible: visible("resources/list", options.resource.uri),
          isVisible: isEnabled(options.annotations),
          read: (invocation) =>
            invoke(options.handle, invocation, {
              method: "resources/read",
              target: options.resource.uri,
              payload: { uri: options.resource.uri }
            })
        })
        return notifications.client["notifications/resources/list_changed"]({})
      })
    const service = McpServer.of({
      notifications: notifications.client,
      notifyElicitationComplete: ({ clientId, elicitationId }) =>
        withoutSharedConsumer() ? Effect.void : Deferred.make<void>().pipe(
          Effect.flatMap((delivered) =>
            Queue.offer(notificationsQueue, {
              notification: McpCore.ServerNotification.ElicitationComplete({ elicitationId }),
              targetClientId: clientId,
              delivered
            }).pipe(
              Effect.andThen(
                Effect.suspend(() => notificationDelivery.consumers > 0 ? Deferred.await(delivered) : Effect.void)
              )
            )
          )
        ),
      get tools() {
        return tools
      },
      addTool: Effect.fnUntraced(function*(options) {
        const existingIndex = tools.findIndex(({ tool }) => tool.name === options.tool.name)
        if (existingIndex === -1) {
          tools.push(options)
        } else {
          tools[existingIndex] = options
        }
        const { invoke, visible } = makeInvoke(options.services, globalMiddleware)
        yield* internalCore.tools.register({
          descriptor: new McpTool({
            ...options.tool,
            title: options.tool.title ?? options.tool.annotations?.title
          }),
          visible: visible("tools/list", options.tool.name),
          isVisible: isEnabled(options.annotations),
          handle: (call, invocation) =>
            invoke(options.handle(call.arguments), invocation, {
              method: "tools/call",
              target: call.name,
              payload: call
            }).pipe(
              Effect.catchTags({
                InternalError: (error) =>
                  Effect.fail(
                    new McpCore.ToolExecutionError({
                      name: options.tool.name,
                      message: error.message
                    })
                  ),
                InvalidParams: (error) =>
                  Effect.fail(
                    new (invocation.requestContext.requestState === undefined &&
                        invocation.requestContext.inputResponses === undefined
                      ? McpCore.InvalidToolInput
                      : McpCore.InvalidToolContinuation)({
                      name: options.tool.name,
                      message: error.message
                    })
                  )
              }),
              Effect.map((result) =>
                Predicate.isTagged(result, "InputRequired")
                  ? McpCore.OperationOutcome.InputRequired(result)
                  : McpCore.OperationOutcome.Complete(result)
              )
            )
        })
        yield* notifications.client["notifications/tools/list_changed"]({})
      }),
      callTool: Effect.fnUntraced(function*(request) {
        const client = yield* McpServerClient
        const result = yield* internalCore.tools.call(
          request,
          McpProtocolInternal.invocationFromClient(client)
        ).pipe(
          Effect.catch((error) =>
            error._tag === "RequestRejected" ? rejectedError(error) : Effect.fail(
              new InvalidParams({
                message: error._tag === "ToolNotFound"
                  ? `Tool '${error.name}' not found`
                  : error.message
              })
            )
          )
        )
        if (result._tag === "InputRequired") {
          return yield* new InvalidParams({ message: "Client input is not supported by this MCP protocol" })
        }
        return result.value
      }),
      get resources() {
        return resources
      },
      get resourceTemplates() {
        return resourceTemplates
      },
      addResource: (options) => addResource(options, true),
      addResourceTemplate: Effect.fnUntraced(
        function*({ annotations, completions, handle, routerPath, services, template }) {
          const existingIndex = resourceTemplates.findIndex(({ template: current }) =>
            current.uriTemplate === template.uriTemplate
          )
          if (existingIndex === -1) {
            resourceTemplates.push({ template, annotations })
          } else {
            resourceTemplates[existingIndex] = { template, annotations }
          }
          const { invoke, visible } = makeInvoke(services, globalMiddleware)
          const templateMatcher = makeUriMatcher<true>()
          templateMatcher.add(routerPath, true)
          yield* internalCore.resources.registerTemplate({
            descriptor: template,
            visible: visible("resources/templates/list", template.uriTemplate),
            isVisible: isEnabled(annotations),
            match: (uri) => {
              const match = templateMatcher.find(uri)
              if (match === undefined) {
                return undefined
              }
              const params: Array<string> = []
              for (const key of Object.keys(match.params)) {
                params[Number(key)] = match.params[key]!
              }
              return params
            },
            read: (uri, params, invocation) =>
              invoke(handle(uri, Array.from(params)), invocation, {
                method: "resources/read",
                target: uri,
                payload: { uri }
              })
          })
          for (const [param, handle] of Object.entries(completions)) {
            yield* internalCore.completions.register(
              `resource/${template.uriTemplate}/${param}`,
              (request, invocation) =>
                invoke(handle(request.argument.value, request.context), invocation, {
                  method: "completion/complete",
                  target: template.uriTemplate,
                  payload: request
                }).pipe(
                  Effect.map((result) => ({
                    values: result.completion.values,
                    total: result.completion.total,
                    hasMore: result.completion.hasMore,
                    metadata: result._meta
                  }))
                )
            )
          }
          yield* notifications.client["notifications/resources/list_changed"]({})
        }
      ),
      findResource: Effect.fnUntraced(function*(uri) {
        const client = yield* McpServerClient
        return yield* internalCore.resources.read(
          uri,
          McpProtocolInternal.invocationFromClient(client)
        ).pipe(
          Effect.catchTags({
            ResourceNotFound: (error) =>
              Effect.fail(new InvalidParams({ message: `Resource '${error.uri}' not found` })),
            RequestRejected: rejectedError
          })
        )
      }),
      get prompts() {
        return prompts
      },
      addPrompt: Effect.fnUntraced(function*(options) {
        const existingIndex = prompts.findIndex(({ prompt }) => prompt.name === options.prompt.name)
        if (existingIndex === -1) {
          prompts.push(options)
        } else {
          prompts[existingIndex] = options
        }
        const { invoke, visible } = makeInvoke(options.services, globalMiddleware)
        yield* internalCore.prompts.register({
          descriptor: options.prompt,
          visible: visible("prompts/list", options.prompt.name),
          isVisible: isEnabled(options.annotations),
          get: (params, invocation) =>
            invoke(options.handle(params), invocation, {
              method: "prompts/get",
              target: options.prompt.name,
              payload: { name: options.prompt.name, arguments: params }
            }).pipe(
              Effect.map((result) =>
                Predicate.isTagged(result, "InputRequired")
                  ? McpCore.OperationOutcome.InputRequired(result)
                  : McpCore.OperationOutcome.Complete(result)
              )
            )
        })
        for (const [param, handle] of Object.entries(options.completions)) {
          yield* internalCore.completions.register(
            `prompt/${options.prompt.name}/${param}`,
            (request, invocation) =>
              invoke(handle(request.argument.value, request.context), invocation, {
                method: "completion/complete",
                target: options.prompt.name,
                payload: request
              }).pipe(
                Effect.map((result) => ({
                  values: result.completion.values,
                  total: result.completion.total,
                  hasMore: result.completion.hasMore,
                  metadata: result._meta
                }))
              )
          )
        }
        yield* notifications.client["notifications/prompts/list_changed"]({})
      }),
      getPromptResult: Effect.fnUntraced(function*({ arguments: params, name }) {
        const client = yield* McpServerClient
        const outcome = yield* internalCore.prompts.get(
          name,
          params ?? {},
          McpProtocolInternal.invocationFromClient(client)
        ).pipe(
          Effect.catchTags({
            PromptNotFound: () => new InvalidParams({ message: `Prompt '${name}' not found` }),
            RequestRejected: rejectedError
          })
        )
        return outcome._tag === "Complete"
          ? outcome.value
          : yield* new InvalidParams({ message: "Client input is not supported by this MCP protocol" })
      }),
      completion: Effect.fnUntraced(function*(complete) {
        const client = yield* McpServerClient
        const ref = complete.ref
        const result = yield* internalCore.completions.complete({
          reference: ref.type === "ref/resource"
            ? { type: "resourceTemplate", uriTemplate: ref.uri }
            : { type: "prompt", name: ref.name },
          argument: complete.argument,
          context: complete.context
        }, McpProtocolInternal.invocationFromClient(client)).pipe(
          Effect.catchTag("RequestRejected", rejectedError)
        )
        return {
          _meta: result.metadata,
          completion: {
            values: result.values,
            total: result.total,
            hasMore: result.hasMore
          }
        }
      })
    })
    internalState.set(service, {
      core: internalCore,
      addSkillFile: (options) => addResource(options, false),
      notifications: notificationsQueue,
      notificationDelivery,
      globalMiddleware
    })
    return service
  })

  /**
   * Layer that provides the MCP server service.
   *
   * **Details**
   *
   * It doesn't run a transport or discharge request-level dependencies. Use it
   * to call registrations in process, providing their request-level
   * dependencies with MCP middleware.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static readonly layer: Layer.Layer<McpServer> = Layer.effect(McpServer)(McpServer.make)
}

const MCP_SESSION_ID_HEADER = "mcp-session-id"
const MCP_PROTOCOL_VERSION_HEADER = "mcp-protocol-version"
const MCP_INVALID_BATCH_METHOD = "invalid/json-rpc-batch"
const cancelledResponses = new WeakMap<object, string | number>()
const httpPostResponses = new WeakMap<HttpServerRequest.HttpServerRequest, { expected: number }>()
const requestKey = (requestId: string | number): string => `${typeof requestId}:${requestId}`

interface ActiveRequest {
  readonly requestId: RpcMessage.RequestId
  readonly prepared: McpRuntime.PreparedRequest
  readonly cancelled: boolean
  readonly httpPost: { expected: number } | undefined
}

class McpClientKey extends Data.Class<{
  readonly clientId: number
  readonly profile: McpCore.NegotiatedProtocolProfile<string>
}> {}

/**
 * A client cache hint for one kind of `v2026_07_28` result.
 *
 * **Details**
 *
 * `ttl` is how long a client may treat the result as fresh. It is sent as a
 * whole number of milliseconds, rounded down, so it must be finite,
 * nonnegative and at most `Number.MAX_SAFE_INTEGER` milliseconds. Only
 * `"private"` scope is supported, so shared caches must not store the result.
 *
 * @stability unstable
 * @category models
 * @since 4.1.0
 */
export interface CacheHint {
  readonly ttl: Duration.Input
  readonly cacheScope: "private"
}

/**
 * Client cache hints for `v2026_07_28` discovery and list results.
 *
 * **Details**
 *
 * Each entry sets the freshness and `cacheScope` of one result kind:
 * `server/discover`, `tools/list`, `resources/list`,
 * `resources/templates/list` and `prompts/list`. `skills` covers the Skills
 * extension's `skills/list`, `skills/get` and `resources/directory/read`.
 * Omitted entries, and `resources/read` results, keep
 * `{ ttlMs: 0, cacheScope: "private" }`. Earlier protocol revisions have no
 * cache hints and ignore this option.
 *
 * These are hints for clients. The server does not cache results, and
 * visibility and invocation checks still run on every request.
 *
 * **Gotchas**
 *
 * A positive `ttl` lets a client keep showing a list after registrations or
 * per-request visibility change, until the hint expires. Private scope does
 * not key a client's cache by user, so a client shared between users can
 * reuse one user's list for another.
 *
 * @stability unstable
 * @category models
 * @since 4.1.0
 */
export interface CacheHints {
  readonly discover?: CacheHint | undefined
  readonly tools?: CacheHint | undefined
  readonly resources?: CacheHint | undefined
  readonly resourceTemplates?: CacheHint | undefined
  readonly prompts?: CacheHint | undefined
  readonly skills?: CacheHint | undefined
}

// Converts each hint to the wire's nonnegative integer `ttlMs` once, when the server is built.
const normalizeCacheHints = (
  cacheHints: CacheHints | undefined
): Effect.Effect<McpProtocolInternal.CacheHints | undefined, Cause.IllegalArgumentError> => {
  if (cacheHints === undefined) return Effect.succeed(undefined)
  const normalized: Record<string, { readonly ttlMs: number; readonly cacheScope: "private" }> = {}
  for (const [name, hint] of Object.entries(cacheHints)) {
    if (hint === undefined) continue
    const ttlMs = Option.match(Duration.fromInput(hint.ttl), {
      onNone: () => NaN,
      onSome: (ttl) => Math.floor(Duration.toMillis(ttl))
    })
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 0 || hint.cacheScope !== "private") {
      return Effect.fail(
        new Cause.IllegalArgumentError(
          `McpServer cacheHints.${name} must have a finite, nonnegative ttl and a "private" cacheScope`
        )
      )
    }
    normalized[name] = { ttlMs, cacheScope: "private" }
  }
  return Effect.succeed(normalized)
}

/**
 * Runs an MCP server over the current `RpcServer.Protocol`.
 *
 * **Details**
 *
 * The server serves registered tools, resources, and prompts. The selected MCP
 * runtime handles protocol lifecycle state and determines which clients receive
 * queued server notifications.
 *
 * @stability unstable
 * @category running
 * @since 4.0.0
 */
export const run: (options: {
  readonly name: string
  readonly version: string
  readonly instructions?: string | undefined
  readonly description?: string | undefined
  readonly websiteUrl?: string | undefined
  readonly icons?: ReadonlyArray<McpSchema.Icon> | undefined
  readonly protocols: Arr.NonEmptyReadonlyArray<McpProtocol.ProtocolAdapter>
  readonly extensions?: ServerExtensions | undefined
  readonly cacheHints?: CacheHints | undefined
}) => Effect.Effect<
  never,
  Cause.IllegalArgumentError,
  McpServer | RpcServer.Protocol
> = Effect.fnUntraced(function*(options: {
  readonly name: string
  readonly version: string
  readonly instructions?: string | undefined
  readonly description?: string | undefined
  readonly websiteUrl?: string | undefined
  readonly icons?: ReadonlyArray<McpSchema.Icon> | undefined
  readonly protocols: Arr.NonEmptyReadonlyArray<McpProtocol.ProtocolAdapter>
  readonly extensions?: ServerExtensions | undefined
  readonly cacheHints?: CacheHints | undefined
}) {
  const cacheHints = yield* normalizeCacheHints(options.cacheHints)
  const runtimeOption = yield* Effect.serviceOption(McpRuntime.ServerRuntime)
  const runtime = Option.isSome(runtimeOption)
    ? runtimeOption.value
    : yield* McpRuntime.make(options.protocols)
  return yield* runWithRuntime({ ...options, cacheHints }, runtime, "custom")
})

const runWithRuntime = Effect.fnUntraced(function*(
  options: {
    readonly name: string
    readonly version: string
    readonly instructions?: string | undefined
    readonly description?: string | undefined
    readonly websiteUrl?: string | undefined
    readonly icons?: ReadonlyArray<McpSchema.Icon> | undefined
    readonly extensions?: ServerExtensions | undefined
    readonly cacheHints?: McpProtocolInternal.CacheHints | undefined
    readonly allowSubscriptions?: boolean | undefined
  },
  runtime: McpRuntime.ServerRuntimeShape,
  transport: "custom" | "http" | "stdio",
  requestScoped?: {
    readonly notifications: Queue.Dequeue<QueuedServerNotification>
    readonly handlers: Context.Context<never>
  }
) {
  const protocol = yield* RpcServer.Protocol
  const server = yield* McpServer
  const defaultLogLevel = yield* CurrentLogLevel
  const isHttp = transport === "http"
  const clientStates = new Map<number, {
    protocol: McpProtocol.AnyProtocolAdapter
    profile: McpCore.NegotiatedProtocolProfile<string> | undefined
    sessionHeaders: Headers.Headers | undefined
  }>()
  const activeRequests = new Map<number, Map<string, ActiveRequest>>()
  const reverseRequestClients = new Map<string, Array<McpClientKey>>()
  const disconnectClient = (clientId: number) => {
    activeRequests.delete(clientId)
    clientStates.delete(clientId)
    runtime.disconnect(clientId)
  }
  // The exit is sent already encoded, so it must carry only the JSON-RPC error members.
  const sendRequestError = (
    clientId: number,
    requestId: string | number,
    { code, data, message }: { readonly code: number; readonly message: string; readonly data?: unknown }
  ) =>
    protocol.send(clientId, {
      _tag: "Exit",
      requestId,
      exit: {
        _tag: "Failure",
        cause: [{ _tag: "Fail", error: data === undefined ? { code, message } : { code, message, data } }]
      }
    })
  const removeReverseRequestClient = (requestId: string, key: McpClientKey) => {
    const waiting = reverseRequestClients.get(requestId)
    if (waiting === undefined) return
    const remaining = waiting.filter((entry) => entry !== key)
    if (remaining.length === 0) reverseRequestClients.delete(requestId)
    else reverseRequestClients.set(requestId, remaining)
  }
  // A bounded PubSub would let one slow listener block the shared worker and
  // legacy delivery. Each request scope releases its subscription on exit.
  const serverNotifications = yield* PubSub.unbounded<McpProtocolInternal.CanonicalServerNotification>()
  const sendNotification = (
    protocolVersion: string,
    clientId: number,
    notification: McpProtocol.ProjectedNotification
  ) =>
    Effect.suspend(() => {
      const selectedProtocol = runtime.selectProtocol(protocolVersion)
      const rpc = selectedProtocol.serverNotificationRpcs.requests.get(notification.tag)
      if (rpc === undefined) {
        return Effect.die(
          `MCP protocol ${protocolVersion} does not define server notification ${notification.tag}`
        )
      }
      return selectedProtocol.payloadCodecs(rpc).encode(notification.payload).pipe(
        Effect.orDie,
        Effect.flatMap((payload) =>
          protocol.send(clientId, {
            _tag: "Request",
            id: "",
            tag: notification.tag,
            payload,
            headers: [],
            isNotification: true
          })
        )
      )
    })
  const cancelRequest = (clientId: number, requestId: RpcMessage.RequestId) => {
    const requests = activeRequests.get(clientId)
    const key = requestKey(requestId)
    const request = requests?.get(key)
    if (request === undefined) {
      return false
    }
    requests!.set(key, { ...request, cancelled: true })
    return true
  }
  const terminateSubscription = (
    protocolVersion: string,
    clientId: number,
    requestId: RpcMessage.RequestId,
    reason: string
  ): Effect.Effect<void> =>
    Effect.suspend(() => {
      if (!cancelRequest(clientId, requestId)) {
        return Effect.void
      }
      return isHttp
        ? protocol.end(clientId)
        : sendNotification(protocolVersion, clientId, {
          tag: "notifications/cancelled",
          payload: { requestId, reason }
        })
    })
  let writeFromClient!: (clientId: number, message: RpcMessage.FromClientEncoded) => Effect.Effect<void>
  const { core, notificationDelivery, notifications } = internalState.get(server)!
  const handlers = requestScoped?.handlers ?? (yield* runtime.installHandlers({
    core,
    subscribeServerNotifications: PubSub.subscribe(serverNotifications),
    getListChangeRevision: () => notificationDelivery.listChangeRevision,
    ...(!protocol.supportsNotifications || options.allowSubscriptions === false ? {} : {
      sendNotification,
      markSubscriptionCancelled: (clientId: number, requestId: RpcMessage.RequestId) =>
        Effect.sync(() => {
          cancelRequest(clientId, requestId)
        }),
      terminateSubscription
    }),
    defaultLogLevel,
    serverInfo: options
  }))

  const clients = yield* RcMap.make({
    lookup: Effect.fnUntraced(function*(key: McpClientKey) {
      const selectedProtocol = runtime.selectProtocol(key.profile.protocolVersion)
      let write!: (message: RpcMessage.FromServerEncoded) => Effect.Effect<void>
      const reverseProtocol = yield* RpcClient.Protocol.make(Effect.fnUntraced(function*(writeResponse) {
        let cid = 0
        write = (message) => writeResponse(cid, message)
        return {
          send(id, request, _transferables) {
            cid = id
            if (request._tag === "Request") {
              const requestId = requestKey(request.id)
              const waiting = reverseRequestClients.get(requestId) ?? []
              waiting.push(key)
              reverseRequestClients.set(requestId, waiting)
              return protocol.send(key.clientId, {
                _tag: "Request",
                id: request.id,
                tag: request.tag,
                payload: request.payload,
                headers: []
              }).pipe(Effect.onError(() => Effect.sync(() => removeReverseRequestClient(requestId, key))))
            }
            if (request._tag === "Interrupt") {
              // A cancelled reverse request may never receive a reply.
              removeReverseRequestClient(requestKey(request.requestId), key)
              return sendNotification(key.profile.protocolVersion, key.clientId, {
                tag: "notifications/cancelled",
                payload: { requestId: request.requestId }
              })
            }
            // Effect RPC control messages are not part of the MCP protocol.
            return Effect.void
          },
          supportsAck: true,
          supportsTransferables: false,
          supportsStructuredClone: false,
          codecFor: protocol.codecFor
        }
      }))
      const client = yield* selectedProtocol.makeReverseClient(key.profile).pipe(
        Effect.provideService(RpcClient.Protocol, reverseProtocol)
      )

      return { client, write } as const
    }),
    idleTimeToLive: 10000
  })

  const clientMiddleware = McpServerClientMiddleware.of((effect, { client, headers, payload, rpc }) => {
    const session = runtime.resolveRequest(client.id, headers)
    const isInitialize = rpc._tag.endsWith("/initialize")
    if (!isInitialize && !session) {
      const fiber = Fiber.getCurrent()!
      appendPreResponseHandlerUnsafe(
        fiber.context,
        () =>
          Effect.succeed(
            HttpServerResponse.empty({
              status: headers[MCP_SESSION_ID_HEADER] === undefined ? 400 : 404
            })
          )
      )
      return Effect.die(new Error(`Mcp-Session-Id does not exist`))
    }
    // RPC middleware erases the correlation between the initialize tag
    // and its decoded payload. Restore it once after non-initialize requests
    // without a session have been rejected above.
    const initializePayload = session?.initializePayload ?? payload as typeof McpSchema.Initialize.payloadSchema.Type
    const clientState = clientStates.get(client.id)
    const selectedProtocol = session?.protocol ??
      clientState?.protocol ??
      runtime.protocolForInternalTag(rpc._tag)
    if (!isProtocolVersion(selectedProtocol.protocolVersion) || selectedProtocol.protocolVersion === "2026-07-28") {
      return Effect.die(`Unsupported selected MCP protocol version: ${selectedProtocol.protocolVersion}`)
    }
    const profile: McpCore.NegotiatedProtocolProfile = session?.negotiatedProfile ?? {
      protocolVersion: selectedProtocol.protocolVersion,
      clientCapabilities: initializePayload.capabilities,
      clientInfo: initializePayload.clientInfo
    }
    if (clientState !== undefined) clientState.profile = profile
    const requestContext = McpRequestContext.of({
      clientId: client.id,
      protocolVersion: profile.protocolVersion,
      clientCapabilities: profile.clientCapabilities,
      clientInfo: profile.clientInfo,
      requestMetadata: initializePayload._meta
    })
    return Effect.provideService(
      Effect.provideService(
        Effect.provideService(
          effect,
          McpServerClient,
          McpServerClient.of({
            clientId: client.id,
            protocolVersion: profile.protocolVersion,
            clientCapabilities: profile.clientCapabilities,
            clientInfo: profile.clientInfo,
            initializePayload,
            requestMetadata: Predicate.isReadonlyObject(payload) && Predicate.isReadonlyObject(payload._meta)
              ? payload._meta as Readonly<Record<string, unknown>>
              : undefined,
            getClient: RcMap.get(
              clients,
              new McpClientKey({
                clientId: client.id,
                profile
              })
            ).pipe(
              Effect.map(({ client }) => client)
            )
          })
        ),
        McpRequestContext,
        requestContext
      ),
      CurrentLogLevel,
      runtime.effectLogLevel(client.id, headers, defaultLogLevel)
    )
  })

  const patchedProtocol = RpcServer.Protocol.of({
    ...protocol,
    send: (clientId, response) => {
      if (response._tag === "Exit") {
        const requests = activeRequests.get(clientId)
        const key = requestKey(response.requestId)
        const active = requests?.get(key)
        if (requests !== undefined && requests.delete(key) && requests.size === 0) {
          activeRequests.delete(clientId)
        }
        if (active?.cancelled === true) {
          if (transport === "custom") return Effect.void
          if (active.httpPost !== undefined) active.httpPost.expected--
          cancelledResponses.set(response, response.requestId)
          return protocol.send(clientId, response)
        }
        if (
          response.exit._tag === "Failure" &&
          !response.exit.cause.some((failure) => failure._tag === "Fail")
        ) {
          return sendRequestError(clientId, response.requestId, {
            code: McpSchema.INTERNAL_ERROR_CODE,
            message: "Internal error"
          })
        }
      }
      return protocol.send(clientId, response)
    },
    run: (f) => {
      writeFromClient = f
      return protocol.run((clientId, request_) => {
        const fiber = Fiber.getCurrent()!
        const request = request_ as unknown as
          | RpcMessage.FromServerEncoded
          | RpcMessage.FromClientEncoded
        const httpRequest = isHttp
          ? Context.getOrUndefined(fiber.context, HttpServerRequest.HttpServerRequest)
          : undefined
        if (httpRequest !== undefined && request._tag !== "Eof") {
          appendPreResponseHandlerUnsafe(fiber.context, (_, response) =>
            Effect.succeed(
              response.status === 200 &&
                response.body._tag === "Uint8Array" &&
                response.body.contentLength === 0
                ? HttpServerResponse.empty({
                  headers: Headers.remove(response.headers, "content-type"),
                  status: 202
                })
                : response
            ))
        }
        switch (request._tag) {
          case "Request": {
            if (httpRequest !== undefined && request.isNotification !== true) {
              const httpPost = httpPostResponses.get(httpRequest) ?? { expected: 0 }
              httpPost.expected++
              httpPostResponses.set(httpRequest, httpPost)
            }
            const headers = isHttp
              ? Context.getUnsafe(
                Fiber.getCurrent()!.context,
                HttpServerRequest.HttpServerRequest
              ).headers
              : Headers.fromInput(request.headers)
            const cancellationRequest = request.tag === "notifications/cancelled" &&
                typeof request.payload === "object" && request.payload !== null && "requestId" in request.payload &&
                (typeof request.payload.requestId === "string" || typeof request.payload.requestId === "number")
              ? activeRequests.get(clientId)?.get(requestKey(request.payload.requestId))
              : undefined
            const prepare = cancellationRequest === undefined
              ? runtime.prepareRequest(clientId, headers, request)
              : Effect.succeed(cancellationRequest.prepared)
            return Effect.gen(function*() {
              const prepared = yield* prepare
              const clientState = clientStates.get(clientId)
              if (isHttp && clientState === undefined) {
                // HTTP EOF only ends the request body; handlers and streamed replies may still be running.
                yield* Scope.addFinalizer(
                  Context.getUnsafe(fiber.context, Scope.Scope),
                  Effect.sync(() => disconnectClient(clientId))
                )
              }
              const session = prepared.binding
              const selectedProtocol = prepared.protocol
              // Select before dated payload decoding: legacy requests use
              // their session's adapter; modern requests carry their own version.
              clientStates.set(clientId, {
                protocol: selectedProtocol,
                profile: prepared.profile ?? clientState?.profile,
                sessionHeaders: isHttp && headers[MCP_SESSION_ID_HEADER] !== undefined
                  ? Headers.fromInput({ [MCP_SESSION_ID_HEADER]: headers[MCP_SESSION_ID_HEADER] })
                  : clientState?.sessionHeaders
              })
              if (request.tag === MCP_INVALID_BATCH_METHOD) {
                return yield* sendRequestError(
                  clientId,
                  request.id,
                  new InvalidRequest({ message: "JSON-RPC batches are not supported" })
                )
              }
              if (httpRequest !== undefined && session !== undefined) {
                appendPreResponseHandlerUnsafe(fiber.context, (_, res) =>
                  Effect.succeed(
                    runtime.resolveRequest(clientId, headers) === undefined
                      ? HttpServerResponse.empty({ status: 404 })
                      : HttpServerResponse.setHeader(
                        res,
                        MCP_PROTOCOL_VERSION_HEADER,
                        session.protocol.protocolVersion
                      )
                  ))
              }
              const routedRequest = runtime.routeClientRequest(selectedProtocol, request)
              const rpc = runtime.clientRpcs.requests.get(routedRequest.tag)
              const isClientNotification = selectedProtocol.clientNotificationRpcs.requests.has(request.tag)
              if (rpc && isClientNotification && request.isNotification) {
                if (!session && selectedProtocol.runtime._tag === "Stateful") {
                  appendPreResponseHandlerUnsafe(
                    fiber.context,
                    () =>
                      Effect.succeed(
                        HttpServerResponse.empty({
                          status: headers[MCP_SESSION_ID_HEADER] === undefined ? 400 : 404
                        })
                      )
                  )
                  return
                }
                const decode = selectedProtocol.payloadCodecs(rpc).decode(request.payload)
                return yield* Effect.gen(function*() {
                  const payload = yield* decode
                  if (request.tag === "notifications/cancelled") {
                    const cancellation = yield* selectedProtocol.normalizeCancellation(payload)
                    const key = requestKey(cancellation.requestId)
                    let ownerClientId = clientId
                    if (isHttp) {
                      if (session === undefined) {
                        return
                      }
                      // Each HTTP POST has its own transport ID, but cancellation belongs to the session.
                      const owner = Array.from(activeRequests).find(([, requests]) =>
                        requests.get(key)?.prepared.binding === session
                      )
                      if (owner === undefined) {
                        return
                      }
                      ownerClientId = owner[0]
                    }
                    if (!cancelRequest(ownerClientId, cancellation.requestId)) {
                      return
                    }
                    return yield* f(ownerClientId, {
                      _tag: "Interrupt",
                      requestId: cancellation.requestId
                    })
                  }
                  const handler = handlers.mapUnsafe.get(rpc.key) as Rpc.Handler<string> | undefined
                  const handled = handler
                    ? handler.handler(payload, {
                      rpc,
                      requestId: RpcMessage.RequestId(request.id),
                      client: new Rpc.ServerClient(clientId),
                      headers
                    }) as any as Effect.Effect<void>
                    : Effect.void
                  return yield* prepared.requestContext === undefined
                    ? handled
                    : Effect.provideService(handled, McpRequestContext, prepared.requestContext)
                }).pipe(Effect.ignoreCause)
              }
              if (!rpc || isClientNotification) {
                if (request.isNotification) {
                  return
                }
                return yield* sendRequestError(
                  clientId,
                  request.id,
                  new MethodNotFound({ message: `Method not found: ${request.tag}` })
                )
              }
              const decoded = yield* Effect.result(selectedProtocol.payloadCodecs(rpc).decode(request.payload))
              if (Result.isFailure(decoded)) {
                return yield* request.isNotification
                  ? Effect.void
                  : sendRequestError(clientId, request.id, new InvalidParams({ message: "Invalid method parameters" }))
              }
              if (request.isNotification !== true) {
                const requests = activeRequests.get(clientId) ?? new Map<string, ActiveRequest>()
                requests.set(requestKey(request.id), {
                  requestId: RpcMessage.RequestId(request.id),
                  prepared,
                  cancelled: false,
                  httpPost: httpRequest === undefined ? undefined : httpPostResponses.get(httpRequest)
                })
                activeRequests.set(clientId, requests)
              }
              const handled = f(clientId, routedRequest)
              return yield* prepared.requestContext === undefined
                ? handled
                : Effect.provideService(handled, McpRequestContext, prepared.requestContext)
            }).pipe(
              Effect.catch((error) =>
                request.isNotification
                  ? Effect.void
                  : sendRequestError(
                    clientId,
                    request.id,
                    Predicate.isTagged(error, "ProtocolError")
                      ? McpProtocolInternal.ProtocolError.fromFeature(error)
                      : new InvalidParams({ message: "Invalid request metadata" })
                  )
              )
            )
          }
          case "Ping":
          case "Ack":
          case "Interrupt":
            return f(clientId, request)
          case "Eof":
            if (!isHttp) {
              disconnectClient(clientId)
            }
            return f(clientId, request)
          case "Pong":
          case "Exit":
          case "Chunk":
          case "ClientProtocolError":
          case "Defect": {
            const requestId = request._tag === "Exit"
              ? requestKey(request.requestId)
              : undefined
            const session = isHttp
              ? runtime.resolveRequest(
                clientId,
                Context.getUnsafe(Fiber.getCurrent()!.context, HttpServerRequest.HttpServerRequest).headers
              )
              : undefined
            const waiting = requestId === undefined ? undefined : reverseRequestClients.get(requestId)
            const reverseKey = waiting?.find((key) =>
              isHttp ? key.profile === session?.negotiatedProfile : key.clientId === clientId
            )
            if (request._tag === "Exit" && reverseKey === undefined) {
              return Effect.void
            }
            if (reverseKey !== undefined && requestId !== undefined) {
              removeReverseRequestClient(requestId, reverseKey)
            }
            const targetClientId = reverseKey?.clientId ?? clientId
            const clientState = clientStates.get(targetClientId)
            const selectedProtocol = clientState?.protocol ?? runtime.protocols[0]
            const profile = reverseKey?.profile ?? clientState?.profile ?? {
              protocolVersion: selectedProtocol.protocolVersion,
              clientCapabilities: {},
              clientInfo: { name: "unknown", version: "unknown" }
            }
            return RcMap.get(
              clients,
              new McpClientKey({
                clientId: targetClientId,
                profile
              })
            ).pipe(
              Effect.flatMap(({ write }) => write(request)),
              Effect.scoped
            )
          }
        }
      })
    }
  })
  if (isHttp) {
    // Stop requests that can no longer receive client replies after termination.
    yield* runtime.onSessionTerminated((binding) => {
      const interrupts: Array<Effect.Effect<void>> = []
      for (const [clientId, requests] of activeRequests) {
        for (const { prepared, requestId } of requests.values()) {
          if (prepared.binding === binding && cancelRequest(clientId, requestId)) {
            interrupts.push(writeFromClient(clientId, { _tag: "Interrupt", requestId }))
          }
        }
      }
      return Effect.all(interrupts, { discard: true })
    })
  }

  if (requestScoped === undefined) {
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        notificationDelivery.consumers++
      }),
      () =>
        Effect.sync(() => {
          notificationDelivery.consumers--
        })
    )
  }
  const notificationTails = new Map<number, Deferred.Deferred<void>>()
  yield* Queue.take(requestScoped?.notifications ?? notifications).pipe(
    Effect.flatMap(Effect.fnUntraced(function*(queued) {
      const { delivered, listChangeRevision, notification, targetClientId, requestContext, requestHeaders } = queued
      if (McpProtocolInternal.isSubscriptionServerNotification(notification)) {
        yield* PubSub.publish(serverNotifications, { notification, targetClientId, listChangeRevision })
      }
      const clientIds = yield* patchedProtocol.clientIds
      for (const clientId of clientStates.keys()) {
        if (!clientIds.has(clientId)) {
          clientStates.delete(clientId)
          // HTTP UUID sessions are stored separately and outlive request-scoped client IDs.
          runtime.disconnect(clientId)
        }
      }
      const requestNotification = isRequestNotification(notification)
      const deliveryClientIds = requestNotification && requestContext !== undefined
        ? [requestContext.clientId]
        : targetClientId === undefined
        ? isHttp ? clientStates.keys() : runtime.deliveryClientIds()
        : [targetClientId]
      const deliveries: Array<Effect.Effect<void>> = []
      let hasOriginDelivery = false
      for (const clientId of deliveryClientIds) {
        if (targetClientId !== undefined && clientId !== targetClientId) {
          continue
        }
        if (!clientIds.has(clientId)) {
          runtime.disconnect(clientId)
          continue
        }
        // This must stay below stale-client cleanup so transports without
        // notification support still prune initializedClients.
        if (!patchedProtocol.supportsNotifications) {
          continue
        }
        const selectedProtocol = requestNotification && requestContext !== undefined
          ? runtime.selectProtocol(requestContext.protocolVersion)
          : clientStates.get(clientId)?.protocol
        if (!selectedProtocol) {
          continue
        }
        // Reserve delivery order before forking so one blocked client cannot hold up another.
        const previous = notificationTails.get(clientId)
        const isOrigin = clientId === (targetClientId ?? requestContext?.clientId)
        hasOriginDelivery ||= isOrigin
        // Await delivery to the explicit target or originating request, not unrelated broadcast recipients.
        const completed = isOrigin ? delivered : Deferred.makeUnsafe<void>()
        notificationTails.set(clientId, completed)
        const delivery = Effect.gen(function*() {
          if (previous !== undefined) yield* Deferred.await(previous)
          const projected = yield* selectedProtocol.projectNotification(notification)
          if (projected === undefined) {
            return
          }
          if (
            notification._tag === "Progress" && selectedProtocol.runtime._tag === "Stateless" &&
            requestContext?.requestMetadata?.progressToken !== notification.progressToken
          ) {
            return
          }
          if (notification._tag === "LoggingMessage" && selectedProtocol.runtime._tag === "Stateless") {
            const metadata = requestContext?.requestMetadata
            const level = Predicate.hasProperty(metadata, "io.modelcontextprotocol/logLevel")
              ? metadata["io.modelcontextprotocol/logLevel"]
              : undefined

            if (
              requestContext?.clientId !== clientId ||
              !isLoggingLevel(level) ||
              McpSchema.LoggingLevel.literals.indexOf(notification.level) <
                McpSchema.LoggingLevel.literals.indexOf(level)
            ) {
              return
            }
          } else if (
            !runtime.canDeliver(
              clientId,
              (requestContext?.clientId === clientId ? requestHeaders : undefined) ??
                clientStates.get(clientId)?.sessionHeaders ?? Headers.empty,
              notification,
              defaultLogLevel,
              listChangeRevision
            )
          ) {
            return
          }
          const rpc = selectedProtocol.serverNotificationRpcs.requests.get(projected.tag)
          if (!rpc) {
            return
          }
          const encoded = yield* selectedProtocol.payloadCodecs(rpc).encode(projected.payload)
          yield* patchedProtocol.send(clientId, {
            _tag: "Request",
            id: "",
            tag: projected.tag,
            payload: encoded,
            headers: [],
            isNotification: true
          })
        }).pipe(
          Effect.ignoreCause,
          Effect.ensuring(Effect.sync(() => {
            Deferred.doneUnsafe(completed, Exit.void)
            if (notificationTails.get(clientId) === completed) notificationTails.delete(clientId)
          }))
        )
        deliveries.push(delivery)
      }
      if (!hasOriginDelivery) yield* Deferred.succeed(delivered, undefined)
      yield* Effect.all(deliveries, { concurrency: "unbounded", discard: true }).pipe(
        Effect.forkScoped({ startImmediately: true })
      )
    })),
    Effect.ignoreCause,
    Effect.forever,
    Effect.forkScoped
  )

  return yield* RpcServer.make(runtime.clientRpcs, {
    spanPrefix: "McpServer",
    disableFatalDefects: true
  }).pipe(
    Effect.provideService(RpcServer.Protocol, patchedProtocol),
    Effect.provideService(McpServerClientMiddleware, clientMiddleware),
    Effect.provide(handlers)
  )
}, Effect.scoped)

type StatefulProtocolAdapter = McpProtocol.ProtocolAdapter<
  McpProtocol.ProtocolVersion,
  McpProtocol.StatefulRuntimeDescriptor
>

/**
 * Request-level services supplied by a transport.
 *
 * **Details**
 *
 * Every transport supplies `Scope`. `McpServerClient` is supplied only when
 * every configured protocol is known to be sessionful: a `v2026_07_28` request
 * has no client session, and a protocol array widened to `ProtocolAdapter`
 * might contain one. HTTP transports also supply `HttpServerRequest`.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ProvidedServices<
  Protocols extends ReadonlyArray<McpProtocol.ProtocolAdapter>,
  Http extends boolean = false
> =
  | Scope.Scope
  | (Protocols[number] extends StatefulProtocolAdapter ? McpServerClient : never)
  | (Http extends true ? HttpServerRequest.HttpServerRequest : never)

type RemainingRequestServices<RR, Provided> = Exclude<McpRequest.Only<"Requires", RR>, Provided>

type RegistrationServices<RR> = Exclude<McpRequest.Without<RR>, McpServer>

/**
 * Creates a layer that starts an MCP server over an existing
 * `RpcServer.Protocol` and provides `McpServer`. Request handlers receive
 * `McpRequestContext`; initialized legacy requests additionally receive
 * `McpServerClient`.
 *
 * **When to use**
 *
 * Use when you already have a custom or externally provided
 * `RpcServer.Protocol` and want to start an MCP server as part of a layer
 * graph.
 *
 * **Details**
 *
 * The returned layer forks `run(options)` in the layer scope and merges
 * `McpServer.layer`, so registration layers can use the `McpServer` service
 * while the server is running.
 *
 * Pass registration layers as `registrations` to build them before the server
 * reads its first request. The transport discharges the request-level
 * dependencies it supplies (see `ProvidedServices`); any other `McpRequest`
 * marker stays in the layer's requirements and must be met by MCP middleware.
 *
 * **Gotchas**
 *
 * Unlike `layerStdio` and `layerHttp`, this layer does not install a concrete
 * transport. The surrounding layer graph must provide `RpcServer.Protocol`.
 *
 * @see {@link run} for the effect form used by this layer
 * @see {@link layerStdio} for a stdio-backed layer that installs the MCP protocol and NDJSON-RPC serialization
 * @see {@link layerHttp} for an HTTP-backed layer that registers with `HttpRouter` and installs JSON-RPC serialization
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = <
  const Protocols extends Arr.NonEmptyReadonlyArray<McpProtocol.ProtocolAdapter>,
  RA = never,
  RE = never,
  RR = never
>(options: {
  readonly name: string
  readonly version: string
  readonly instructions?: string | undefined
  readonly description?: string | undefined
  readonly websiteUrl?: string | undefined
  readonly icons?: ReadonlyArray<McpSchema.Icon> | undefined
  readonly protocols: Protocols
  readonly extensions?: ServerExtensions | undefined
  readonly cacheHints?: CacheHints | undefined
  readonly registrations?: Layer.Layer<RA, RE, RR> | undefined
}): Layer.Layer<
  McpServer | McpRequest.From<"Requires", ProvidedServices<Protocols>>,
  Cause.IllegalArgumentError | RE,
  | RpcServer.Protocol
  | RegistrationServices<RR>
  | McpRequest.From<"Requires", RemainingRequestServices<RR, ProvidedServices<Protocols>>>
> =>
  layerWithRuntime(options, "custom").pipe(
    Layer.provide(McpRuntime.layer(options.protocols))
  ) as any

const layerWithRuntime = (options: {
  readonly name: string
  readonly version: string
  readonly instructions?: string | undefined
  readonly description?: string | undefined
  readonly websiteUrl?: string | undefined
  readonly icons?: ReadonlyArray<McpSchema.Icon> | undefined
  readonly extensions?: ServerExtensions | undefined
  readonly cacheHints?: CacheHints | undefined
  readonly allowSubscriptions?: boolean | undefined
  readonly registrations?: Layer.Layer<any, any, any> | undefined
}, transport: "custom" | "http" | "stdio") =>
  Layer.effectDiscard(
    Effect.gen(function*() {
      const cacheHints = yield* normalizeCacheHints(options.cacheHints)
      const runtime = yield* McpRuntime.ServerRuntime
      yield* Effect.forkScoped(runWithRuntime({ ...options, cacheHints }, runtime, transport))
    })
  ).pipe(
    Layer.provide(options.registrations ?? Layer.empty),
    Layer.provideMerge(McpServer.layer)
  )

/**
 * Creates a layer that runs an MCP server over standard input and output.
 *
 * **When to use**
 *
 * Use when an MCP client launches the server as a subprocess and communicates
 * through newline-delimited JSON-RPC messages.
 *
 * **Details**
 *
 * The selected protocol adapter controls the dated RPC schemas and JSON-RPC
 * batch policy. The layer provides `McpServer`, supplies request-scoped
 * `McpRequestContext` and legacy `McpServerClient` services to handlers, and
 * requires `Stdio`.
 *
 * Pass registration layers as `registrations` to build them before the server
 * reads its first request. The transport discharges the request-level
 * dependencies it supplies (see `ProvidedServices`); any other `McpRequest`
 * marker stays in the layer's requirements and must be met by MCP middleware.
 *
 * @see {@link layer} for running over an existing `RpcServer.Protocol`
 * @see {@link layerHttp} for the single-endpoint HTTP transport
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerStdio = <
  const Protocols extends Arr.NonEmptyReadonlyArray<McpProtocol.ProtocolAdapter>,
  RA = never,
  RE = never,
  RR = never
>(options: {
  readonly name: string
  readonly version: string
  readonly instructions?: string | undefined
  readonly description?: string | undefined
  readonly websiteUrl?: string | undefined
  readonly icons?: ReadonlyArray<McpSchema.Icon> | undefined
  readonly protocols: Protocols
  readonly extensions?: ServerExtensions | undefined
  readonly cacheHints?: CacheHints | undefined
  readonly registrations?: Layer.Layer<RA, RE, RR> | undefined
}): Layer.Layer<
  McpServer | McpRequest.From<"Requires", ProvidedServices<Protocols>>,
  Cause.IllegalArgumentError | RE,
  | Stdio
  | RegistrationServices<RR>
  | McpRequest.From<"Requires", RemainingRequestServices<RR, ProvidedServices<Protocols>>>
> =>
  layerWithRuntime(options, "stdio").pipe(
    Layer.provide(McpRuntime.layer(options.protocols)),
    Layer.provide(RpcServer.layerProtocolStdio),
    Layer.provide(Layer.succeed(
      RpcSerialization.RpcSerialization,
      mcpStdioSerialization(options.protocols)
    ))
  ) as any

const mcpStdioSerialization = (
  protocols: Arr.NonEmptyReadonlyArray<McpProtocol.ProtocolAdapter>
): RpcSerialization.RpcSerialization["Service"] => {
  const serialization = mcpJsonRpcSerialization({
    contentType: "application/json-rpc"
  })
  return RpcSerialization.RpcSerialization.of({
    contentType: serialization.contentType,
    includesFraming: true,
    codecFor: serialization.codecFor,
    makeUnsafe: () => {
      const frames = RpcSerialization.ndjson.makeUnsafe()
      const parser = serialization.makeUnsafe()
      let selectedProtocol: McpProtocol.ProtocolAdapter | undefined
      return {
        decode: (data) => {
          const decoded: Array<unknown> = []
          for (const frame of frames.decode(data)) {
            if (Array.isArray(frame)) {
              const acceptsBatch = selectedProtocol?.runtime.transport.jsonRpc.acceptsBatches === true
              if (
                !acceptsBatch ||
                frame.length === 0 ||
                frame.some(McpRuntime.hasRequestProtocolVersion) ||
                frame.some(isInitializeJsonRpcMessage)
              ) {
                decoded.push({
                  _tag: "Request",
                  id: null,
                  tag: MCP_INVALID_BATCH_METHOD,
                  payload: null,
                  headers: []
                })
                continue
              }
            } else if (isInitializeJsonRpcMessage(frame)) {
              const offered = getJsonRpcProtocolVersion(frame)
              selectedProtocol = McpRuntime.selectStatefulProtocol(protocols, offered)
            }
            decoded.push(...parser.decode(JSON.stringify(frame)))
          }
          return decoded
        },
        encode: (response) => {
          const invalidBatchExit = decodeInvalidBatchExit(response)
          if (Result.isSuccess(invalidBatchExit)) {
            return JSON.stringify({
              jsonrpc: "2.0",
              id: null,
              error: {
                code: McpSchema.INVALID_REQUEST_ERROR_CODE,
                message: "JSON-RPC batches are not supported"
              }
            }) + "\n"
          }
          const encoded = parser.encode(response)
          return encoded === undefined ? undefined : `${encoded}\n`
        }
      }
    }
  })
}

/**
 * Registers a Streamable HTTP MCP endpoint at `options.path`.
 *
 * **When to use**
 *
 * Use to expose an MCP server through an existing `HttpRouter`.
 *
 * **Details**
 *
 * POST serves JSON-RPC and accepted notification-only requests return `202`.
 * Header mismatches, unsupported protocol versions, and invalid session-header
 * usage return JSON-RPC errors with status `400`.
 * Unknown modern RPC methods return a JSON-RPC method-not-found error with
 * status `404`. Session requests without `MCP-Protocol-Version` use the version
 * negotiated at initialization. Unsupported HTTP methods return `405`.
 * Requests with an `Origin` header are rejected unless the exact origin
 * appears in `allowedOrigins`; Origin-less non-browser clients
 * remain valid. The surrounding HTTP server remains responsible for binding
 * to an appropriate interface and installing authentication.
 *
 * With `allowSessionTermination`, a DELETE carrying `Mcp-Session-Id` ends that
 * session with `204` and interrupts its in-flight requests; later requests with
 * that id get `404`. DELETE validates the session and `MCP-Protocol-Version`
 * headers like POST. Without the option, or when only sessionless revisions
 * such as `v2026_07_28` are configured, DELETE returns `405`. Any caller
 * holding a session id can end that session, so authenticate requests in the
 * surrounding router.
 *
 * Set `allowSubscriptions: false` to disable `v2026_07_28` subscriptions.
 * Discovery advertises `listChanged: false`, and `subscriptions/listen` returns
 * Method not found. Request-scoped progress and logs, legacy protocols, and
 * default subscription behavior are unchanged.
 *
 * The layer runs one long-lived MCP server that every POST shares. For
 * serverless hosts where execution must belong to each request, use
 * `layerHttpRequestScoped` instead.
 *
 * Pass registration layers as `registrations` to build them before the
 * endpoint serves its first request. The transport discharges the
 * request-level dependencies it supplies (see `ProvidedServices`) and converts
 * the remaining `McpRequest` markers into `HttpRouter.Request` markers, so
 * `HttpRouter.middleware` can provide them, for example to authenticate the
 * request and resolve the current user.
 *
 * `layerHttp` always implements the single-endpoint Streamable HTTP topology.
 * Using `v2024_11_05` here is a custom compatibility transport for that
 * revision's schema. It does not implement the historical two-endpoint
 * HTTP+SSE transport, GET SSE, event resumption, or session expiry.
 *
 * **Gotchas**
 *
 * This layer starts a scoped server fiber. For sharing it across Cloudflare
 * Workers requests, see `HttpRouter.toWebHandler` for setup and limitations.
 *
 * @see {@link layerStdio} for exposing the server over stdio
 * @see {@link layer} for the base MCP server layer without a transport protocol
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerHttp = <
  const Protocols extends Arr.NonEmptyReadonlyArray<McpProtocol.ProtocolAdapter>,
  RA = never,
  RE = never,
  RR = never
>(options: {
  readonly name: string
  readonly version: string
  readonly instructions?: string | undefined
  readonly description?: string | undefined
  readonly websiteUrl?: string | undefined
  readonly icons?: ReadonlyArray<McpSchema.Icon> | undefined
  readonly path: HttpRouter.PathInput
  readonly protocols: Protocols
  readonly extensions?: ServerExtensions | undefined
  readonly cacheHints?: CacheHints | undefined
  readonly allowedOrigins?: ReadonlyArray<string> | undefined
  readonly allowSessionTermination?: boolean | undefined
  readonly allowSubscriptions?: boolean | undefined
  readonly registrations?: Layer.Layer<RA, RE, RR> | undefined
}): Layer.Layer<
  McpServer | McpRequest.From<"Requires", ProvidedServices<Protocols, true>>,
  Cause.IllegalArgumentError | RE,
  | HttpRouter.HttpRouter
  | RegistrationServices<RR>
  | HttpRouter.Request.From<"Requires", RemainingRequestServices<RR, ProvidedServices<Protocols, true>>>
> => {
  const runtime = McpRuntime.layer(options.protocols)
  return layerWithRuntime(options, "http").pipe(
    Layer.provide(layerMcpProtocolHttp(options)),
    Layer.provide(runtime),
    Layer.provide(RpcSerialization.layerJsonRpc())
  ) as any
}

/**
 * Registers a request-scoped Streamable HTTP MCP endpoint at `options.path`.
 *
 * **When to use**
 *
 * Use when serving on serverless hosts such as Cloudflare Workers, where execution must
 * belong to the HTTP request rather than a shared long-lived server.
 *
 * **Details**
 *
 * Each POST runs its own server in the request scope, with no background
 * fiber, timer, or queue consumer left after the response body completes.
 * Only sessionless protocols such as `v2026_07_28` are accepted. Tools,
 * resources, prompts, completions, multi round-trip input requests, and the
 * request's own progress and log notifications are supported. Legacy reverse
 * requests through `McpServer.elicit` are not available.
 *
 * Discovery advertises `listChanged: false`, `subscriptions/listen` returns
 * Method not found, and DELETE returns `405`. Request-scoped clients receive
 * no broadcast notifications such as list changes. Those still reach clients
 * of a `layerHttp` endpoint sharing the same `McpServer`, and are dropped when
 * no such endpoint exists. Use `layerHttp` on a long-lived host for sessions,
 * subscriptions, or legacy reverse requests.
 *
 * HTTP admission, origin checks, and JSON-RPC errors follow `layerHttp`.
 * Configuring a sessionful protocol through an untyped caller fails layer
 * construction with `IllegalArgumentError`.
 *
 * Registrations passed as `registrations` are built once, before the routes
 * are added, and shared by every POST. Remaining `McpRequest` markers become
 * `HttpRouter.Request` markers, as with `layerHttp`.
 *
 * @see {@link layerHttp} for the long-lived HTTP transport and HTTP admission policy
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerHttpRequestScoped = <
  const Protocols extends Arr.NonEmptyReadonlyArray<
    McpProtocol.ProtocolAdapter<McpProtocol.ProtocolVersion, McpProtocol.StatelessRuntimeDescriptor>
  >,
  RA = never,
  RE = never,
  RR = never
>(options: {
  readonly name: string
  readonly version: string
  readonly instructions?: string | undefined
  readonly description?: string | undefined
  readonly websiteUrl?: string | undefined
  readonly icons?: ReadonlyArray<McpSchema.Icon> | undefined
  readonly path: HttpRouter.PathInput
  readonly protocols: Protocols
  readonly extensions?: ServerExtensions | undefined
  readonly cacheHints?: CacheHints | undefined
  readonly allowedOrigins?: ReadonlyArray<string> | undefined
  readonly registrations?: Layer.Layer<RA, RE, RR> | undefined
}): Layer.Layer<
  McpServer | McpRequest.From<"Requires", ProvidedServices<Protocols, true>>,
  Cause.IllegalArgumentError | RE,
  | HttpRouter.HttpRouter
  | RegistrationServices<RR>
  | HttpRouter.Request.From<"Requires", RemainingRequestServices<RR, ProvidedServices<Protocols, true>>>
> =>
  Layer.effectDiscard(Effect.gen(function*() {
    const runtime = yield* McpRuntime.ServerRuntime
    const stateful = runtime.protocols.find((protocol) => protocol.runtime._tag === "Stateful")
    if (stateful !== undefined) {
      return yield* new Cause.IllegalArgumentError(
        `McpServer.layerHttpRequestScoped does not support the sessionful MCP protocol ${stateful.protocolVersion}`
      )
    }
    const serverOptions = { ...options, cacheHints: yield* normalizeCacheHints(options.cacheHints) }
    const server = yield* McpServer
    const { core, notificationDelivery } = internalState.get(server)!
    // Subscriptions are disabled, so handlers hold no per-request state and
    // read registrations from the shared core on every call. Request services
    // still take precedence over the layer context captured here.
    const handlers = yield* (runtime.installHandlers({
      core,
      subscribeServerNotifications: Effect.die("Subscriptions are disabled for request-scoped MCP servers"),
      getListChangeRevision: () => notificationDelivery.listChangeRevision,
      defaultLogLevel: yield* CurrentLogLevel,
      serverInfo: serverOptions
    }) as Effect.Effect<Context.Context<never>>)
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        notificationDelivery.requestEndpoints++
      }),
      () =>
        Effect.sync(() => {
          notificationDelivery.requestEndpoints--
        })
    )
    // Each POST runs its own RPC server in the request scope, so no fiber,
    // timer, or queue consumer outlives the request that created it.
    yield* addMcpHttpRoutes(
      options,
      Effect.gen(function*() {
        const { httpEffect, protocol } = yield* RpcServer.makeProtocolWithHttpEffect().pipe(
          Effect.provideService(RpcSerialization.RpcSerialization, mcpHttpSerialization)
        )
        const notifications = yield* Queue.make<QueuedServerNotification>()
        yield* runWithRuntime(serverOptions, runtime, "http", { notifications, handlers }).pipe(
          Effect.provideService(RpcServer.Protocol, protocol),
          Effect.provideService(McpServer, server),
          Effect.forkScoped({ startImmediately: true })
        )
        return yield* Effect.provideService(httpEffect, RequestNotificationQueue, notifications)
      })
    )
  })).pipe(
    Layer.provide(options.registrations ?? Layer.empty),
    Layer.provideMerge(McpServer.layer),
    Layer.provide(McpRuntime.layer(options.protocols))
  ) as any

const layerMcpProtocolHttp = (options: {
  readonly path: HttpRouter.PathInput
  readonly allowedOrigins?: ReadonlyArray<string> | undefined
  readonly allowSessionTermination?: boolean | undefined
}): Layer.Layer<
  RpcServer.Protocol,
  never,
  McpRuntime.ServerRuntime | HttpRouter.HttpRouter
> =>
  Layer.effect(RpcServer.Protocol)(Effect.gen(function*() {
    const { httpEffect, protocol } = yield* RpcServer.makeProtocolWithHttpEffect().pipe(
      Effect.provideService(RpcSerialization.RpcSerialization, mcpHttpSerialization)
    )
    yield* addMcpHttpRoutes(options, httpEffect)
    return protocol
  }))

const addMcpHttpRoutes = Effect.fnUntraced(function*(
  options: {
    readonly path: HttpRouter.PathInput
    readonly allowedOrigins?: ReadonlyArray<string> | undefined
    readonly allowSessionTermination?: boolean | undefined
  },
  httpEffect: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    never,
    Scope.Scope | HttpServerRequest.HttpServerRequest
  >
) {
  const runtime = yield* McpRuntime.ServerRuntime
  const router = yield* HttpRouter.HttpRouter
  const allowSessionTermination = options.allowSessionTermination === true &&
    runtime.protocols.some((protocol) => protocol.runtime._tag === "Stateful")
  const forbidden = Effect.succeed(HttpServerResponse.empty({ status: 403 }))
  const withAllowedOrigin = (
    handler: (request: HttpServerRequest.HttpServerRequest) => Effect.Effect<HttpServerResponse.HttpServerResponse>
  ) =>
  (request: HttpServerRequest.HttpServerRequest) =>
    isAllowedMcpOrigin(request, options.allowedOrigins) ? handler(request) : forbidden
  const methodNotAllowedResponse = Effect.succeed(HttpServerResponse.empty({
    status: 405,
    headers: { allow: allowSessionTermination ? "POST, DELETE" : "POST" }
  }))
  const methodNotAllowed = withAllowedOrigin(() => methodNotAllowedResponse)
  for (const method of ["GET", "PUT", "PATCH", "OPTIONS"] as const) {
    yield* router.add(method, options.path, methodNotAllowed)
  }
  yield* router.add(
    "DELETE",
    options.path,
    allowSessionTermination
      ? withAllowedOrigin((request) => runtime.terminateHttpSession(request.headers))
      : methodNotAllowed
  )
  yield* router.add("POST", options.path, (request) => {
    if (!isAllowedMcpOrigin(request, options.allowedOrigins)) {
      return Effect.succeed(HttpServerResponse.empty({ status: 403 }))
    }
    if (mcpMediaTypes(request.headers["content-type"])[0] !== "application/json") {
      return Effect.succeed(HttpServerResponse.empty({ status: 415 }))
    }
    const accepted = mcpMediaTypes(request.headers["accept"])
    if (!accepted.includes("application/json") || !accepted.includes("text/event-stream")) {
      return Effect.succeed(HttpServerResponse.empty({ status: 406 }))
    }
    return Effect.gen(function*() {
      const parsed = yield* Effect.result(
        Effect.flatMap(request.text, Schema.decodeEffect(Schema.UnknownFromJsonString))
      )
      const admission = runtime.admitHttp(request.headers, parsed)
      if (admission._tag === "Rejected") {
        return admission.response
      }
      const toResponse = (response: HttpServerResponse.HttpServerResponse) => {
        // Completed responses may already contain notifications followed by the result.
        const hasMultipleMessages = response.body._tag === "Uint8Array" &&
          response.body.body.subarray(0, -1).includes(10)
        return admission.isSubscription || response.body._tag === "Stream" || hasMultipleMessages
          ? toServerSentEvents(response, admission.isSubscription)
          : response
      }
      if (admission.acknowledge) {
        return yield* Effect.catchCause(
          Effect.map(httpEffect, toResponse),
          () => Effect.succeed(HttpServerResponse.empty({ status: 202 }))
        )
      }
      return yield* Effect.flatMap(httpEffect, (response) => {
        if (response.body._tag !== "Uint8Array" || response.body.body.length > 0) {
          return Effect.succeed(toResponse(response))
        }
        // Only fully cancelled request POSTs may return an empty SSE response.
        // https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#sending-messages-to-the-server
        return httpPostResponses.get(request)?.expected === 0
          ? Effect.succeed(HttpServerResponse.stream(Stream.empty, { contentType: "text/event-stream" }))
          : Effect.die(new Error("MCP request ended without writing its response"))
      })
    })
  })
})

const mcpHttpSerialization: RpcSerialization.RpcSerialization["Service"] = (() => {
  const serialization = mcpJsonRpcSerialization()
  return RpcSerialization.RpcSerialization.of({
    contentType: serialization.contentType,
    includesFraming: true,
    codecFor: serialization.codecFor,
    makeUnsafe: () => {
      const parser = serialization.makeUnsafe()
      return {
        decode: parser.decode,
        encode: (response) => {
          const encoded = parser.encode(response)
          // Preserve message boundaries when the HTTP transport joins buffered chunks.
          return typeof encoded === "string" ? `${encoded}\n` : encoded
        }
      }
    }
  })
})()

const isEncodedMcpFailureCause = Schema.is(Schema.TaggedStruct("Cause", {
  data: Schema.Tuple([Schema.TaggedStruct("Fail", {
    error: Schema.toEncoded(McpSchema.McpError)
  })])
}))

const normalizeMcpJsonRpcResponse = (response: unknown): unknown => {
  if (Array.isArray(response)) {
    return response.map(normalizeMcpJsonRpcResponse)
  }
  if (!Predicate.isReadonlyObject(response) || !Predicate.hasProperty(response, "error")) {
    return response
  }
  return isEncodedMcpFailureCause(response.error)
    ? { ...response, error: response.error.data[0].error }
    : response
}

function mcpJsonRpcSerialization(options?: {
  readonly contentType?: string | undefined
}): RpcSerialization.RpcSerialization["Service"] {
  const serialization = RpcSerialization.jsonRpc({ ...options, controlMessages: false })
  return RpcSerialization.RpcSerialization.of({
    ...serialization,
    makeUnsafe: () => {
      const parser = serialization.makeUnsafe()
      const cancelledIds = new Set<string | number>()
      return {
        decode: parser.decode,
        encode: (response) => {
          if (Predicate.isReadonlyObject(response)) {
            const cancelledId = cancelledResponses.get(response)
            if (cancelledId !== undefined) {
              cancelledResponses.delete(response)
              cancelledIds.add(cancelledId)
            }
          }
          const encoded = parser.encode(response)
          if (typeof encoded !== "string") return encoded
          if (cancelledIds.size === 0 && !encoded.includes("\"_tag\":\"Cause\"")) return encoded
          let message: unknown = JSON.parse(encoded)
          if (cancelledIds.size > 0) {
            // Count cancelled completions toward the batch, but never write their responses.
            // https://modelcontextprotocol.io/specification/2025-03-26/basic/utilities/cancellation
            const keep = (message: unknown) =>
              !(Predicate.isReadonlyObject(message) && !Predicate.hasProperty(message, "method") &&
                (typeof message.id === "string" || typeof message.id === "number") && cancelledIds.delete(message.id))
            if (Array.isArray(message)) {
              const remaining = message.filter(keep)
              if (remaining.length === 0) return undefined
              message = remaining
            } else if (!keep(message)) {
              return undefined
            }
          }
          return JSON.stringify(normalizeMcpJsonRpcResponse(message))
        }
      }
    }
  })
}

const toServerSentEvents = (response: HttpServerResponse.HttpServerResponse, keepAlive: boolean) => {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const frame = (data: Uint8Array) =>
    encoder.encode(decoder.decode(data).trimEnd().split("\n").map((message) => `data: ${message}\n\n`).join(""))
  const options = {
    status: response.status,
    statusText: response.statusText,
    headers: Headers.remove(response.headers, "content-type"),
    cookies: response.cookies,
    contentType: "text/event-stream"
  }
  if (response.body._tag === "Stream") {
    const events = response.body.stream.pipe(Stream.map(frame))
    if (!keepAlive) {
      return HttpServerResponse.stream(events, options)
    }
    // Keep a native timer pending so workerd does not treat idle subscriptions as hung requests.
    const keepAliveComments = Stream.tick("15 seconds").pipe(
      Stream.drop(1),
      Stream.map(() => encoder.encode(": keepalive\n\n"))
    )
    return HttpServerResponse.stream(Stream.merge(events, keepAliveComments, { haltStrategy: "left" }), options)
  }
  if (response.body._tag === "Uint8Array") {
    return HttpServerResponse.uint8Array(frame(response.body.body), options)
  }
  return HttpServerResponse.setHeader(response, "content-type", "text/event-stream")
}

const isAllowedMcpOrigin = (
  request: HttpServerRequest.HttpServerRequest,
  allowedOrigins: ReadonlyArray<string> | undefined
): boolean => {
  const origin = request.headers["origin"]
  return origin === undefined || (allowedOrigins ?? []).includes(origin)
}

const mcpMediaTypes = (header: string | undefined): ReadonlyArray<string> =>
  header === undefined
    ? []
    : header.split(",").flatMap((part) => {
      const [mediaType, ...parameters] = part.split(";")
      const quality = parameters
        .map((parameter) => parameter.trim().toLowerCase())
        .find((parameter) => parameter.startsWith("q="))
      if (quality !== undefined) {
        const value = Number(quality.slice(2))
        if (!Number.isFinite(value) || value <= 0 || value > 1) {
          return []
        }
      }
      return [mediaType.trim().toLowerCase()]
    })

const InitializeJsonRpcMessage = Schema.Struct({
  method: Schema.Literal("initialize")
})

const isInitializeJsonRpcMessage = (message: unknown): boolean =>
  Result.isSuccess(Schema.decodeUnknownResult(InitializeJsonRpcMessage)(message))

const JsonRpcProtocolVersion = Schema.Struct({
  params: Schema.Struct({
    protocolVersion: Schema.String
  })
})

const getJsonRpcProtocolVersion = (message: unknown): string | undefined => {
  const decoded = Schema.decodeUnknownResult(JsonRpcProtocolVersion)(message)
  return Result.isSuccess(decoded) ? decoded.success.params.protocolVersion : undefined
}

const INTERNAL_TOOL_ERROR_MESSAGE = "Tool execution failed due to an internal server error."

const toolErrorResult = (message: string): CallToolResult =>
  new CallToolResult({
    isError: true,
    content: [{ type: "text", text: message }]
  })

const toolResultContent = (encoded: unknown): CallToolResult["content"] =>
  encoded === undefined ? [] : [{ type: "text", text: JSON.stringify(encoded) }]

/**
 * The requirements of a toolkit registration.
 *
 * **Details**
 *
 * Services a tool declares with `dependencies` or `Tool.addDependency` are
 * request-level: they are carried as `McpRequest<"Requires", S>` markers and
 * must be provided by MCP middleware or the transport. Parameter decoding and
 * result encoding services are required when the toolkit is registered,
 * unless a tool also declares them.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ToolkitRequirements<Tools extends Record<string, Tool.Any>> = 0 extends
  (1 & Tool.Requirements<Tools[keyof Tools]>) ? any :
  | Tool.HandlersFor<Tools>
  | RegistrationRequirements<Tool.SchemaServices<Tools[keyof Tools]>, Tool.Requirements<Tools[keyof Tools]>>

type RegistrationRequirements<SchemaServices, RequestServices> =
  | McpServer
  | Exclude<SchemaServices, RequestServices | McpRequestContext>
  | McpRequest.From<"Requires", Exclude<RequestServices, McpRequestContext>>

/**
 * Registers a `Toolkit` with the `McpServer`.
 *
 * **Details**
 *
 * The MCP middleware in the current context, provided with
 * `Effect.provide(middleware.layer)`, runs around every call to the toolkit.
 *
 * @see {@link ToolkitRequirements} for which services are request-level
 *
 * @stability unstable
 * @category handlers
 * @since 4.0.0
 */
export const registerToolkit: <Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.Toolkit<Tools>
) => Effect.Effect<void, never, ToolkitRequirements<Tools>> = Effect.fnUntraced(function*<
  Tools extends Record<string, Tool.Any>
>(
  toolkit: Toolkit.Toolkit<Tools>
) {
  const registry = yield* McpServer
  const built = yield* (toolkit as any as Effect.Effect<
    Toolkit.WithHandler<Tools>,
    never,
    Exclude<Tool.HandlersFor<Tools>, McpRequestContext>
  >).pipe(Effect.updateContext((context: Context.Context<Exclude<Tool.HandlersFor<Tools>, McpRequestContext>>) => {
    // Toolkit handlers also retain the context in which their layer was built.
    const services = new Map(context.mapUnsafe)
    for (const tool of Object.values(toolkit.tools)) {
      const handler = services.get(tool.id) as Tool.Handler<string> | undefined
      if (handler !== undefined) {
        services.set(tool.id, { ...handler, context: omitRequestServices(handler.context) })
      }
    }
    return Context.makeUnsafe(services)
  }))
  const services = yield* Effect.context<never>()
  // Interruption propagates; anything else is logged, reported and scrubbed.
  const internalToolError = (cause: Cause.Cause<unknown>) => {
    const failure = Cause.findFail(cause)
    return Result.isFailure(failure) && !Cause.hasDies(cause)
      ? Effect.failCause(failure.failure)
      : Effect.logError(cause).pipe(
        Effect.andThen(ErrorReporter.report(cause)),
        Effect.as(toolErrorResult(INTERNAL_TOOL_ERROR_MESSAGE))
      )
  }
  const registrations: Array<Parameters<typeof registry.addTool>[0]> = []
  for (const tool of Object.values(built.tools)) {
    const strict = Tool.getStrictMode(tool) === true
    const rawJsonSchema = Tool.isDynamic(tool) ? tool.jsonSchema : undefined
    if (strict && rawJsonSchema !== undefined) {
      return yield* Effect.die(
        `McpServer cannot strictly validate the raw JSON Schema for tool '${tool.name}'; use an Effect Schema instead`
      )
    }
    const decodeOptions: SchemaAST.ParseOptions = {
      onExcessProperty: strict ? "error" : "ignore",
      errors: "all"
    }
    const annotations = tool.annotations
    const toolMeta = Context.getOrUndefined(annotations, Tool.Meta)
    const isDeclaredFailure = Schema.is(tool.failureSchema)
    const encodeFailure = Schema.encodeUnknownEffect(tool.failureSchema) as (
      error: unknown
    ) => Effect.Effect<unknown, Schema.SchemaError, Tool.HandlerServices<Tools[keyof Tools]>>
    const declaredFailureResult = (error: unknown) =>
      error instanceof Error && error.message !== ""
        ? Effect.succeed(toolErrorResult(error.message))
        : Effect.map(encodeFailure(error), (encoded) =>
          new CallToolResult({ isError: true, content: toolResultContent(encoded) }))
    // `structuredContent` must be JSON and match the advertised `outputSchema`, which is derived from the JSON codec.
    // The Toolkit has already encoded the result, so only the JSON conversion of its encoded form runs here.
    const encodeStructured = Schema.encodeUnknownEffect(Schema.toCodecJson(Schema.toEncoded(tool.successSchema))) as (
      result: unknown
    ) => Effect.Effect<unknown, Schema.SchemaError, Tool.HandlerServices<Tools[keyof Tools]>>
    const successResult = (result: unknown) =>
      encodeStructured(result).pipe(
        Effect.mapError((cause) =>
          AiError.make({
            module: "McpServer",
            method: "registerToolkit",
            reason: new AiError.ToolResultEncodingError({
              toolName: tool.name,
              toolResult: result,
              description: cause.message
            })
          })
        ),
        Effect.map((structuredContent) =>
          new CallToolResult({
            isError: false,
            structuredContent,
            content: toolResultContent(structuredContent)
          })
        )
      )
    const handleCause = (cause: Cause.Cause<unknown>) => {
      const failure = Cause.findFail(cause)
      if (Result.isSuccess(failure)) {
        const error = failure.success.error
        const origin = Context.get(Cause.reasonAnnotations(failure.success), Toolkit.FailureOrigin)
        if (origin === "parameters" && isParameterValidationError(error)) {
          return Effect.fail(new InvalidParams({ message: error.reason.message }))
        }
        if (origin === "handler" && isDeclaredFailure(error)) {
          return Effect.catchCause(declaredFailureResult(error), internalToolError)
        }
      }
      return internalToolError(cause)
    }
    const outputSchema = yield* Schema.decodeUnknownEffect(McpSchema.ToolOutputJson)(
      toolJsonSchema(tool.successSchema, false)
    ).pipe(Effect.orDie)
    const inputSchema = yield* Schema.decodeUnknownEffect(ToolJson)(
      rawJsonSchema ?? toolJsonSchema(tool.parametersSchema, strict)
    ).pipe(
      Effect.catchTag("SchemaError", (error) =>
        Effect.die(
          rawJsonSchema !== undefined
            ? `McpServer cannot register tool '${tool.name}': its raw JSON Schema must have an object root ` +
              `(type: "object").\n\n${error.message}`
            : `McpServer cannot register tool '${tool.name}': its parameters must encode to a JSON Schema with an ` +
              `object root (type: "object"), such as a Schema.Struct. Use Tool.EmptyParams for a tool without ` +
              `parameters.\n\n${error.message}`
        ))
    )
    const mcpTool = new McpTool({
      name: tool.name,
      description: Tool.getDescription(tool),
      inputSchema,
      outputSchema,
      annotations: {
        ...(Context.getOption(tool.annotations, Tool.Title).pipe(
          Option.map((title) => ({ title })),
          Option.getOrUndefined
        )),
        readOnlyHint: Context.get(tool.annotations, Tool.Readonly),
        destructiveHint: Context.get(tool.annotations, Tool.Destructive),
        idempotentHint: Context.get(tool.annotations, Tool.Idempotent),
        openWorldHint: Context.get(tool.annotations, Tool.OpenWorld)
      },
      _meta: toolMeta
    })
    registrations.push({
      tool: mcpTool,
      annotations,
      handle(payload) {
        return built.handle(tool.name as keyof Tools, payload ?? {}, undefined, decodeOptions).pipe(
          Stream.unwrap,
          Stream.runLast,
          Effect.flatMap(Effect.fromOption),
          Effect.flatMap((result): Effect.Effect<
            CallToolResult,
            unknown,
            Tool.HandlerServices<Tools[keyof Tools]>
          > => {
            if (!result.isFailure) {
              // An absent result, such as `Schema.Void`, has no structured form.
              return result.encodedResult === undefined
                ? Effect.succeed(new CallToolResult({ isError: false, content: [] }))
                : successResult(result.encodedResult)
            }
            // Declared failures return their encoded payload; anything else is classified by origin.
            return result.failureOrigin === "handler"
              ? Effect.succeed(
                new CallToolResult({ isError: true, content: toolResultContent(result.encodedResult) })
              )
              : Effect.failCause(Cause.annotate(
                Cause.fail(result.result),
                Context.make(Toolkit.FailureOrigin, result.failureOrigin ?? "result")
              ))
          }),
          Effect.catchCause(handleCause)
        ) as Effect.Effect<CallToolResult, InvalidParams, never>
      },
      services
    })
  }
  for (const registration of registrations) {
    yield* registry.addTool(registration)
  }
})

const isParameterValidationError = (
  error: unknown
): error is AiError.AiError & { readonly reason: AiError.ToolParameterValidationError } =>
  AiError.isAiError(error) && error.reason._tag === "ToolParameterValidationError"

// MCP requires an object root. A non-recursive root is compiled inline rather
// than as a definition; a recursive root keeps its definition and the top-level
// `$ref` is inlined.
const toolJsonSchema = (schema: Schema.Constraint, strict: boolean): JsonSchema.JsonSchema => {
  const root = SchemaAST.getContextOwner(SchemaAST.getLastEncoding(Schema.toCodecJson(schema).ast))
  const document = InternalStructuredOutput.resolveTopLevelReference(
    Schema.toJsonSchemaDocument(schema, {
      onExcessProperty: strict ? "error" : "ignore",
      referencePolicy: ({ ast, identifier, occurrences }) => ast === root && occurrences === 1 ? undefined : identifier
    })
  )
  return Object.keys(document.definitions).length === 0
    ? document.schema
    : { ...document.schema, $defs: document.definitions }
}

/**
 * Creates a layer that registers a `Toolkit` with the `McpServer`.
 *
 * **Details**
 *
 * The layer requires `McpServer`. Pass it to a transport through the
 * `registrations` option, or provide the transport layer to it.
 *
 * @see {@link ToolkitRequirements} for which services are request-level
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const toolkit = <Tools extends Record<string, Tool.Any>>(
  toolkit: Toolkit.Toolkit<Tools>
): Layer.Layer<never, never, ToolkitRequirements<Tools>> => Layer.effectDiscard(registerToolkit(toolkit))

/**
 * Utility type that validates a completion-handler record against the allowed
 * parameter keys.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ValidateCompletions<Completions, Keys extends string> =
  & Completions
  & {
    readonly [K in keyof Completions]: K extends Keys ? (
        input: string,
        context: CompletionContext
      ) => any
      : never
  }

/**
 * Utility type that collects the services required by the handlers of a
 * completion-handler record, including handlers declared as optional.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type CompletionServices<Completions> = {
  [K in keyof Completions]-?: NonNullable<Completions[K]> extends (...args: any) => infer Ret ? Effect.Services<Ret>
    : never
}[keyof Completions]

/**
 * Completion-handler map for a resource URI template.
 *
 * **Details**
 *
 * Each schema interpolation contributes a parameter key, using an explicit
 * `Param` name when present or `paramN` otherwise, and each handler returns
 * candidate values for that parameter.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ResourceCompletions<Schemas extends ReadonlyArray<Schema.Constraint>> = {
  readonly [
    K in Extract<keyof Schemas, `${number}`> as Schemas[K] extends Param<infer Id, infer _S> ? Id
      : `param${K}`
  ]: (
    input: string,
    context: CompletionContext
  ) => Effect.Effect<Array<Schemas[K]["Type"]>, any, any>
}

// Leave defects and interruption to makeInvoke; convert only expected failures.
const handlerFailureToInternalError = (cause: Cause.Cause<unknown>): Effect.Effect<never, InternalError> =>
  Cause.hasDies(cause) || Cause.hasInterrupts(cause)
    ? Effect.failCause(cause as Cause.Cause<never>)
    : Effect.fail(new InternalError({ message: Cause.prettyErrors(cause)[0].message }))

const completionHandler = (
  handle: (input: string, context: CompletionContext) => Effect.Effect<any, any, any>,
  encodeValues: (values: unknown) => Effect.Effect<ReadonlyArray<unknown>, any, any>
) =>
(input: string, context: CompletionContext): Effect.Effect<CompleteResult, InternalError> =>
  handle(input, context).pipe(
    Effect.flatMap(encodeValues),
    Effect.map((values) => ({
      completion: {
        values: values as Array<string>,
        total: values.length,
        hasMore: false
      }
    })),
    Effect.catchCause(handlerFailureToInternalError)
  ) as any

type TemplateParamKey<Schemas extends ReadonlyArray<Schema.Constraint>, K extends keyof Schemas> = Schemas[K] extends
  Param<infer Id, infer _S> ? Id : `param${K & string}`

type TemplateSchemaServices<Schemas extends ReadonlyArray<Schema.Constraint>, Completions> =
  | Schemas[number]["DecodingServices"]
  | {
    [K in Extract<keyof Schemas, `${number}`>]: TemplateParamKey<Schemas, K> extends keyof Completions
      ? Schemas[K]["EncodingServices"]
      : never
  }[Extract<keyof Schemas, `${number}`>]

type PromptSchemaServices<Params extends Schema.Struct.Fields, Completions> =
  | Schema.Struct.DecodingServices<Params>
  | Params[Extract<keyof Completions, keyof Params>]["EncodingServices"]

/**
 * The requirements of a resource registration: the content handler's services
 * are request-level.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ResourceRequirements<R> = RegistrationRequirements<never, R>

/**
 * The requirements of a resource template registration.
 *
 * **Details**
 *
 * Services read by the content and completion handlers are request-level.
 * Parameter decoding services, and the encoding services of parameters with a
 * completion handler, are required when the template is registered, unless a
 * handler also reads them.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type ResourceTemplateRequirements<Schemas extends ReadonlyArray<Schema.Constraint>, R, Completions> =
  RegistrationRequirements<TemplateSchemaServices<Schemas, Completions>, R | CompletionServices<Completions>>

/**
 * The requirements of a prompt registration.
 *
 * **Details**
 *
 * Services read by the content and completion handlers are request-level.
 * Parameter decoding services, and the encoding services of parameters with a
 * completion handler, are required when the prompt is registered, unless a
 * handler also reads them.
 *
 * @stability unstable
 * @category utility types
 * @since 4.0.0
 */
export type PromptRequirements<Params extends Schema.Struct.Fields, R, Completions> = RegistrationRequirements<
  PromptSchemaServices<Params, Completions>,
  R | CompletionServices<Completions>
>

/**
 * Registers an MCP resource or resource template from an Effect program.
 *
 * @see {@link resource} for the layer-based resource registration wrapper
 *
 * @stability unstable
 * @category handlers
 * @since 4.0.0
 */
export const registerResource: {
  <E, R>(options: {
    readonly uri: string
    readonly name: string
    readonly description?: string | undefined
    readonly mimeType?: string | undefined
    readonly audience?: ReadonlyArray<"user" | "assistant"> | undefined
    readonly priority?: number | undefined
    readonly content: Effect.Effect<
      ReadResourceResult | string | Uint8Array,
      E,
      R
    >
    readonly annotations?: Context.Context<never> | undefined
  }): Effect.Effect<void, never, ResourceRequirements<R>>
  <const Schemas extends ReadonlyArray<Schema.Constraint>>(segments: TemplateStringsArray, ...schemas: Schemas): <
    E,
    R,
    const Completions extends Partial<ResourceCompletions<Schemas>> = {}
  >(options: {
    readonly name: string
    readonly description?: string | undefined
    readonly mimeType?: string | undefined
    readonly audience?: ReadonlyArray<"user" | "assistant"> | undefined
    readonly priority?: number | undefined
    readonly completion?: ValidateCompletions<Completions, keyof ResourceCompletions<Schemas>> | undefined
    readonly content: (uri: string, ...params: { readonly [K in keyof Schemas]: Schemas[K]["Type"] }) => Effect.Effect<
      ReadResourceResult | string | Uint8Array,
      E,
      R
    >
    readonly annotations?: Context.Context<never> | undefined
  }) => Effect.Effect<void, never, ResourceTemplateRequirements<Schemas, R, Completions>>
} = function() {
  if (arguments.length === 1) {
    const options = arguments[0] as {
      readonly uri: string
      readonly name: string
      readonly description?: string | undefined
      readonly mimeType?: string | undefined
      readonly audience?: ReadonlyArray<"user" | "assistant"> | undefined
      readonly priority?: number | undefined
      readonly content: Effect.Effect<ReadResourceResult | string | Uint8Array, any, any>
      readonly annotations?: Context.Context<never> | undefined
    }
    return Effect.gen(function*() {
      const services = yield* Effect.context<never>()
      const registry = yield* McpServer
      yield* registry.addResource({
        resource: new Resource({
          ...options,
          annotations: options
        }),
        services,
        handle: options.content.pipe(
          Effect.map((content) => resolveResourceContent(options.uri, content)),
          Effect.catchCause(handlerFailureToInternalError)
        ),
        annotations: options.annotations ?? Context.empty()
      })
    })
  }
  const {
    params,
    routerPath,
    schema,
    uriPath
  } = compileUriTemplate(...(arguments as any as [any, any]))
  return Effect.fnUntraced(function*<E, R>(options: {
    readonly name: string
    readonly description?: string | undefined
    readonly mimeType?: string | undefined
    readonly audience?: ReadonlyArray<"user" | "assistant"> | undefined
    readonly priority?: number | undefined
    readonly completion?:
      | Record<
        string,
        (
          input: string,
          context: CompletionContext
        ) => Effect.Effect<any>
      >
      | undefined
    readonly content: (uri: string, ...params: Array<any>) => Effect.Effect<
      ReadResourceResult | string | Uint8Array,
      E,
      R
    >
    readonly annotations?: Context.Context<never> | undefined
  }) {
    const services = yield* Effect.context<never>()
    const registry = yield* McpServer
    const decode = Schema.decodeUnknownEffect(schema)
    const template = new ResourceTemplate({
      ...options,
      uriTemplate: uriPath,
      annotations: options!
    })
    const completions: Record<
      string,
      (
        input: string,
        context: CompletionContext
      ) => Effect.Effect<CompleteResult, InternalError>
    > = Object.create(null)
    for (const [param, handle] of Object.entries(options.completion ?? {})) {
      completions[param] = completionHandler(handle, Schema.encodeUnknownEffect(Schema.Array(params[param])))
    }
    yield* registry.addResourceTemplate({
      template,
      routerPath,
      completions,
      services,
      annotations: options.annotations ?? Context.empty(),
      handle: (uri, params) =>
        decode(params).pipe(
          Effect.mapError((error) => new InvalidParams({ message: error.message })),
          Effect.flatMap((params: any) =>
            options.content(uri, ...params).pipe(
              Effect.map((content) => resolveResourceContent(uri, content)),
              Effect.catchCause(handlerFailureToInternalError)
            )
          )
        ) as Effect.Effect<ReadResourceResult, InvalidParams | InternalError>
    })
  })
} as any

/**
 * Creates a layer that registers an MCP resource or resource template.
 *
 * **Details**
 *
 * Services read by the content and completion handlers are request-level, so
 * providing them with `Layer.provide` doesn't satisfy them. Read
 * construction-time services in an enclosing `Layer.unwrap` and close over
 * them, and provide per-request services with MCP middleware.
 *
 * @see {@link registerResource} for the Effect-level resource registration API
 * @see {@link middleware} for providing request-level dependencies
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const resource: {
  <E, R>(options: {
    readonly uri: string
    readonly name: string
    readonly description?: string | undefined
    readonly mimeType?: string | undefined
    readonly audience?: ReadonlyArray<"user" | "assistant"> | undefined
    readonly priority?: number | undefined
    readonly content: Effect.Effect<
      ReadResourceResult | string | Uint8Array,
      E,
      R
    >
  }): Layer.Layer<never, never, ResourceRequirements<R>>
  <const Schemas extends ReadonlyArray<Schema.Constraint>>(segments: TemplateStringsArray, ...schemas: Schemas): <
    E,
    R,
    const Completions extends Partial<ResourceCompletions<Schemas>> = {}
  >(options: {
    readonly name: string
    readonly description?: string | undefined
    readonly mimeType?: string | undefined
    readonly audience?: ReadonlyArray<"user" | "assistant"> | undefined
    readonly priority?: number | undefined
    readonly completion?: ValidateCompletions<Completions, keyof ResourceCompletions<Schemas>> | undefined
    readonly content: (uri: string, ...params: { readonly [K in keyof Schemas]: Schemas[K]["Type"] }) => Effect.Effect<
      ReadResourceResult | string | Uint8Array,
      E,
      R
    >
  }) => Layer.Layer<never, never, ResourceTemplateRequirements<Schemas, R, Completions>>
} = function() {
  if (arguments.length === 1) {
    return Layer.effectDiscard(registerResource(arguments[0]))
  }
  const register = registerResource(...(arguments as any as [any, any]))
  return (options: any) => Layer.effectDiscard(register(options))
} as any

/**
 * A file of a skill: its text, its bytes, or either with an explicit MIME
 * type. Without one, the MIME type is inferred from the file extension.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export type SkillFile = string | Uint8Array | {
  readonly content: string | Uint8Array
  readonly mimeType?: string | undefined
}

/**
 * Options for {@link registerSkill} and {@link skill}.
 *
 * **Details**
 *
 * `uri` addresses the skill's `SKILL.md`, as
 * `skill://<skill-path>/SKILL.md`. Its last path segment is the skill's name,
 * which must equal the frontmatter's `name`. Other schemes work the same way.
 *
 * `files` maps paths relative to the skill root to the skill's files,
 * `SKILL.md` included. Files are served verbatim, and the skill's listed
 * frontmatter is parsed from `SKILL.md`. Quote frontmatter strings that a YAML
 * 1.1 parser reads as another type, such as `yes` or `1.0`.
 *
 * @stability unstable
 * @category models
 * @since 4.1.1
 */
export interface SkillOptions {
  readonly uri: string
  readonly files: { readonly "SKILL.md": SkillFile } & Readonly<Record<string, SkillFile>>
  readonly annotations?: Context.Context<never> | undefined
}

const skillFileEncoder = new TextEncoder()

// Bytes are copied so that later changes by the caller cannot alter what is
// served under the listed digest. `Buffer#slice` shares memory, so copy with
// the `Uint8Array` constructor.
const toSkillSourceFile = (path: string, file: SkillFile): McpSkills.SourceFile => {
  const { content, mimeType } = typeof file === "string" || file instanceof Uint8Array ? { content: file } : file
  return {
    path,
    content: typeof content === "string" ? skillFileEncoder.encode(content) : new Uint8Array(content),
    mimeType
  }
}

/**
 * Registers an Agent Skill under the MCP Skills extension (SEP-2640).
 *
 * **Details**
 *
 * Each file is registered as a resource, and the skill is listed by
 * `skills/list` and `skills/get` with a manifest of every file's SHA-256
 * digest and size, computed from the bytes served. Every directory of the
 * skill namespace is readable with `resources/directory/read`. The server
 * declares the extension once any skill is registered.
 *
 * Fails when the skill breaks the extension's rules: a name that does not
 * match the URI, a `SKILL.md` without YAML frontmatter, frontmatter that is
 * not valid {@link McpSchema.SkillFrontmatter}, a file path that leaves the
 * skill, or more than 512 files or 16 MiB in all. It also fails when the
 * skill's directory contains or lies inside another skill's, or one of its
 * files is already registered as a resource. Registering a resource at the
 * URI of a skill's file afterwards is a defect.
 *
 * SHA-256 runs on `crypto.subtle`.
 *
 * @see {@link skill} for the layer-based skill registration wrapper
 *
 * @stability unstable
 * @category handlers
 * @since 4.1.1
 */
export const registerSkill: (options: SkillOptions) => Effect.Effect<void, Cause.IllegalArgumentError, McpServer> =
  Effect.fnUntraced(function*(options: SkillOptions) {
    const files = Object.entries(options.files).map(([path, file]) => toSkillSourceFile(path, file))
    const skill = yield* McpSkills.makeStaticSkill({ uri: options.uri, files }).pipe(
      Effect.provide(Digest.layerWebCrypto)
    )

    const registry = yield* McpServer
    const { addSkillFile, core, globalMiddleware } = internalState.get(registry)!
    const services = yield* Effect.context<never>()
    const annotations = options.annotations ?? Context.empty()
    const { invoke, visible } = makeInvoke(services, globalMiddleware)
    // Claims the skill's file URIs before they are registered as resources.
    yield* core.skills.register({
      entry: skill.entry,
      isVisible: isEnabled(annotations),
      visible: visible("skills/list", options.uri),
      visibleInDirectories: visible("resources/directory/read", options.uri),
      get: (invocation) =>
        invoke(Effect.succeed(skill.entry), invocation, {
          method: "skills/get",
          target: options.uri,
          payload: { uri: options.uri }
        }),
      directory: (uri) => skill.directories.get(uri)
    })
    for (const { content, resource, text } of skill.files) {
      const { uri, mimeType } = resource
      yield* addSkillFile({
        resource: new Resource(resource),
        annotations,
        services,
        handle: Effect.succeed({
          contents: [text === undefined ? { uri, mimeType, blob: content } : { uri, mimeType, text }]
        })
      })
    }
  })

/**
 * Creates a layer that registers an Agent Skill under the MCP Skills extension
 * (SEP-2640).
 *
 * **Example** (Publishing a skill with a supporting file)
 *
 * ```ts
 * import { Layer } from "effect"
 * import { McpProtocol, McpServer } from "effect/ai"
 *
 * const RefundsSkill = McpServer.skill({
 *   uri: "skill://billing/refunds/SKILL.md",
 *   files: {
 *     "SKILL.md": `---
 * name: refunds
 * description: Process refunds using the billing tools
 * ---
 *
 * Read references/policy.md before issuing a refund.
 * `,
 *     "references/policy.md": "Refunds above CHF 500 require manager approval.\n"
 *   }
 * })
 *
 * const ServerLayer = RefundsSkill.pipe(
 *   Layer.provide(McpServer.layerHttp({
 *     name: "billing",
 *     version: "1.0.0",
 *     path: "/mcp",
 *     protocols: [McpProtocol.v2026_07_28, McpProtocol.v2025_11_25]
 *   }))
 * )
 * ```
 *
 * @see {@link registerSkill} for the Effect-level skill registration API
 *
 * @stability unstable
 * @category layers
 * @since 4.1.1
 */
export const skill = (options: SkillOptions): Layer.Layer<never, Cause.IllegalArgumentError, McpServer> =>
  Layer.effectDiscard(registerSkill(options))

/**
 * Registers an MCP prompt from an Effect program.
 *
 * **Details**
 *
 * Decodes parameters and encodes completion suggestions using their schemas.
 * String content becomes a user text message.
 *
 * @see {@link prompt} for the layer-based prompt registration wrapper
 *
 * @stability unstable
 * @category handlers
 * @since 4.0.0
 */
export const registerPrompt = <
  E,
  R,
  Params extends Schema.Struct.Fields = {},
  const Completions extends {
    readonly [K in keyof Params]?: (
      input: string,
      context: CompletionContext
    ) => Effect.Effect<Array<Params[K]["Type"]>, any, any>
  } = {}
>(
  options: {
    readonly name: string
    readonly title?: string | undefined
    readonly description?: string | undefined
    readonly parameters?: Params | undefined
    readonly completion?: ValidateCompletions<Completions, Extract<keyof Params, string>> | undefined
    readonly content: (
      params: Schema.Struct.Type<Params>
    ) => Effect.Effect<Array<PromptMessage> | string, E, R>
    readonly annotations?: Context.Context<never> | undefined
  }
): Effect.Effect<void, never, PromptRequirements<Params, R, Completions>> => {
  const args = Arr.empty<PromptArgument>()
  const props: Record<string, Schema.Constraint> = options.parameters ?? {}
  for (const [name, prop] of Object.entries(props)) {
    args.push({
      name,
      description: SchemaAST.resolveDescription(prop.ast),
      required: !SchemaAST.isOptional(prop.ast)
    })
  }
  const prompt = new Prompt({
    name: options.name,
    title: options.title,
    description: options.description,
    arguments: args
  })
  const decode = options.parameters
    ? Schema.decodeEffect(Schema.Struct(props))
    : () => Effect.succeed({} as Params)
  const completion: Record<
    string,
    (
      input: string,
      context: CompletionContext
    ) => Effect.Effect<any>
  > = options.completion ?? {}
  return Effect.gen(function*() {
    const registry = yield* McpServer
    const services = yield* Effect.context<never>()
    const completions: Record<
      string,
      (
        input: string,
        context: CompletionContext
      ) => Effect.Effect<CompleteResult, InternalError, McpRequestContext>
    > = Object.create(null)
    for (const [param, handle] of Object.entries(completion)) {
      completions[param] = completionHandler(handle, Schema.encodeUnknownEffect(Schema.Array(props[param])))
    }
    yield* registry.addPrompt({
      prompt,
      completions,
      services,
      annotations: options.annotations ?? Context.empty(),
      handle: (params) =>
        decode(params).pipe(
          Effect.mapError((error) => new InvalidParams({ message: error.message })),
          Effect.flatMap((params) =>
            options.content(params as any).pipe(
              Effect.catchCause(handlerFailureToInternalError)
            )
          ),
          Effect.map((messages) => {
            messages = typeof messages === "string" ?
              [{
                role: "user",
                content: TextContent.make({ text: messages })
              }] :
              messages
            return new GetPromptResult({ messages, description: prompt.description })
          })
        ) as Effect.Effect<GetPromptResult, InvalidParams | InternalError>
    })
  })
}

/**
 * Creates a layer that registers an MCP prompt.
 *
 * **Details**
 *
 * Services read by the content and completion handlers are request-level, so
 * providing them with `Layer.provide` doesn't satisfy them. Read
 * construction-time services in an enclosing `Layer.unwrap` and close over
 * them, and provide per-request services with MCP middleware.
 *
 * @see {@link registerPrompt} for the Effect-level prompt registration API
 * @see {@link middleware} for providing request-level dependencies
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const prompt = <
  E,
  R,
  Params extends Schema.Struct.Fields = {},
  const Completions extends {
    readonly [K in keyof Params]?: (
      input: string,
      context: CompletionContext
    ) => Effect.Effect<Array<Params[K]["Type"]>, any, any>
  } = {}
>(
  options: {
    readonly name: string
    readonly title?: string | undefined
    readonly description?: string | undefined
    readonly parameters?: Params | undefined
    readonly completion?: ValidateCompletions<Completions, Extract<keyof Params, string>> | undefined
    readonly content: (
      params: Schema.Struct.Type<Params>
    ) => Effect.Effect<Array<PromptMessage> | string, E, R>
    readonly annotations?: Context.Context<never> | undefined
  }
): Layer.Layer<never, never, PromptRequirements<Params, R, Completions>> => Layer.effectDiscard(registerPrompt(options))

/**
 * Collects structured input from the current MCP client and decodes the
 * accepted response with `schema`.
 *
 * **Details**
 *
 * Accepted content is decoded with the supplied schema, declined requests fail
 * with `ElicitationDeclined`, and canceled requests interrupt the effect.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const elicit: <S extends Schema.ConstraintEncoder<Record<string, unknown>, unknown>>(options: {
  readonly message: string
  readonly schema: S
}) => Effect.Effect<
  S["Type"],
  ElicitationDeclined,
  McpServerClient | S["DecodingServices"]
> = Effect.fnUntraced(function*<S extends Schema.ConstraintEncoder<Record<string, unknown>, unknown>>(options: {
  readonly message: string
  readonly schema: S
}) {
  const { getClient } = yield* McpServerClient
  const client = yield* getClient
  const schema = options.schema
  const request = yield* Schema.decodeUnknownEffect(McpSchema.ElicitRequestFormParams)({
    mode: "form",
    message: options.message,
    requestedSchema: toolJsonSchema(schema, false)
  }).pipe(Effect.orDie)
  const res = yield* client.elicit(request).pipe(
    Effect.catchCause((cause) => Effect.fail(new ElicitationDeclined({ cause: Cause.squash(cause), request })))
  )
  switch (res.action) {
    case "accept":
      return yield* Effect.orDie(Schema.decodeUnknownEffect(schema)(res.content))
    case "cancel":
      return yield* Effect.interrupt
    case "decline":
      return yield* new ElicitationDeclined({ request })
  }
}, Effect.scoped)

/**
 * Accesses the current client's capabilities.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const clientCapabilities: Effect.Effect<
  ClientCapabilities,
  never,
  McpRequestContext
> = McpRequestContext.useSync((_) => _.clientCapabilities)

/**
 * Decodes an `Mcp-Name` header, including base64-wrapped values.
 * Returns `undefined` for malformed values.
 *
 * **Details**
 *
 * Use in `HttpRouter.middleware` to identify the tool, prompt or resource
 * targeted by a `2026-07-28` request. Earlier protocols carry the name only
 * in the JSON-RPC body.
 *
 * @stability unstable
 * @category decoding
 * @since 4.0.0
 */
export const decodeNameHeader = (value: string): string | undefined => McpProtocolInternal.decodeRoutingHeader(value)

// -----------------------------------------------------------------------------
// Internal
// -----------------------------------------------------------------------------

const makeUriMatcher = <A>() => {
  const router = FindMyWay.make<A>({
    ignoreTrailingSlash: true,
    ignoreDuplicateSlashes: true,
    caseSensitive: true
  })
  const add = (uri: string, value: A) => {
    router.on("GET", `/${uri}`, value)
  }
  const find = (uri: string) => router.find("GET", `/${uri}`)

  return { add, find } as const
}

const compileUriTemplate = (segments: TemplateStringsArray, ...schemas: ReadonlyArray<Schema.Constraint>) => {
  let routerPath = segments[0].replace(":", "::")
  let uriPath = segments[0]
  const params: Record<string, Schema.Top> = Object.create(null)
  let pathSchema = Schema.Tuple([]) as Schema.Top
  if (schemas.length > 0) {
    const arr: Array<Schema.Top> = []
    for (let i = 0; i < schemas.length; i++) {
      const toCodecStringTree = Schema.toCodecStringTree(schemas[i])
      const segment = segments[i + 1]
      const key = String(i)
      arr.push(toCodecStringTree)
      routerPath += `:${key}${segment.replace(":", "::")}`
      const schema = schemas[i]
      const paramName = isParam(schema) ? (schema as Param<string, Schema.Top>).name : `param${key}`
      params[paramName] = toCodecStringTree
      uriPath += `{${paramName}}${segment}`
    }
    pathSchema = Schema.Tuple(arr)
  }
  return {
    routerPath,
    uriPath,
    schema: pathSchema,
    params
  } as const
}

const resolveResourceContent = (
  uri: string,
  content: ReadResourceResult | string | Uint8Array
): ReadResourceResult => {
  if (typeof content === "string") {
    return {
      contents: [{
        uri,
        text: content
      }]
    }
  } else if (content instanceof Uint8Array) {
    return {
      contents: [{
        uri,
        blob: content
      }]
    }
  }
  return content
}

const InvalidBatchExit = Schema.TaggedStruct("Exit", {
  requestId: Schema.Null,
  exit: Schema.TaggedStruct("Failure", {
    cause: Schema.Unknown
  })
})

const decodeInvalidBatchExit = Schema.decodeUnknownResult(InvalidBatchExit)

const isProtocolVersion = (version: string): version is McpProtocol.ProtocolVersion =>
  version === "2024-11-05" ||
  version === "2025-03-26" ||
  version === "2025-06-18" ||
  version === "2025-11-25" ||
  version === "2026-07-28"
