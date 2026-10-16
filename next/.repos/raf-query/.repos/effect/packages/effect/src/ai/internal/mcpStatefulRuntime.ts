/**
 * Stateful lifecycle storage for MCP revisions before v2026-07-28.
 *
 * @internal
 */
import * as Effect from "../../Effect.ts"
import type * as Headers from "../../http/Headers.ts"
import * as LogLevel from "../../LogLevel.ts"
import type * as PublicMcpProtocol from "../McpProtocol.ts"
import * as PublicMcpSchema from "../McpSchema.ts"
import type * as McpCore from "./mcpCore.ts"
import * as McpProtocol from "./mcpProtocol.ts"

const MCP_SESSION_ID_HEADER = "mcp-session-id"

type SessionLogLevel =
  | { readonly _tag: "Effect"; readonly level: LogLevel.LogLevel }
  | { readonly _tag: "Mcp"; readonly level: PublicMcpSchema.LoggingLevel }

/**
 * @internal
 */
export interface Binding {
  readonly initializePayload: typeof PublicMcpSchema.Initialize.payloadSchema.Type
  readonly negotiatedProfile: McpCore.NegotiatedProtocolProfile
  readonly protocol: PublicMcpProtocol.ProtocolAdapter
}

interface Session extends Binding {
  readonly resourceSubscriptions: Set<string> | undefined
  logLevel: SessionLogLevel
}

/**
 * @internal
 */
export interface Registration extends Binding {
  readonly supportsResourceSubscriptions: boolean
  readonly logLevel: LogLevel.LogLevel
}

/**
 * @internal
 */
export interface StatefulRuntime {
  readonly registerHttp: (sessionId: string, registration: Registration) => Binding
  readonly registerConnection: (clientId: number, registration: Registration) => Binding
  readonly resolve: (clientId: number, headers: Headers.Headers) => Binding | undefined
  readonly resolveSessionId: (sessionId: string) => Binding | undefined
  readonly setLogLevel: (
    level: PublicMcpSchema.LoggingLevel,
    clientId: number,
    headers: Headers.Headers
  ) => Effect.Effect<void>
  readonly subscribe: (
    uri: string,
    clientId: number,
    headers: Headers.Headers
  ) => Effect.Effect<void, McpProtocol.ProtocolError>
  readonly unsubscribe: (
    uri: string,
    clientId: number,
    headers: Headers.Headers
  ) => Effect.Effect<void, McpProtocol.ProtocolError>
  readonly canDeliver: (
    clientId: number,
    headers: Headers.Headers,
    notification: McpCore.ServerNotification,
    fallbackLogLevel: LogLevel.LogLevel
  ) => boolean
  readonly effectLogLevel: (
    clientId: number,
    headers: Headers.Headers,
    fallback: LogLevel.LogLevel
  ) => LogLevel.LogLevel
  readonly markInitialized: (clientId: number) => void
  readonly initializedClientIds: () => Iterable<number>
  readonly disconnect: (clientId: number) => void
}

const makeSession = (registration: Registration): Session => ({
  initializePayload: registration.initializePayload,
  negotiatedProfile: registration.negotiatedProfile,
  protocol: registration.protocol,
  resourceSubscriptions: registration.supportsResourceSubscriptions ? new Set() : undefined,
  logLevel: { _tag: "Effect", level: registration.logLevel }
})

/**
 * @internal
 */
export const make = (): StatefulRuntime => {
  const bySessionId = new Map<string, Session>()
  const byClientId = new Map<number, Session>()
  const initializedClientIds = new Set<number>()

  const resolveSession = (clientId: number, headers: Headers.Headers): Session | undefined => {
    const sessionId = headers[MCP_SESSION_ID_HEADER]
    return sessionId === undefined ? byClientId.get(clientId) : bySessionId.get(sessionId)
  }

  const effectLogLevel = (
    clientId: number,
    headers: Headers.Headers,
    fallback: LogLevel.LogLevel
  ): LogLevel.LogLevel => {
    const session = resolveSession(clientId, headers)
    return session?.logLevel._tag === "Mcp"
      ? McpProtocol.mcpLogLevels[session.logLevel.level].effect
      : session?.logLevel.level ?? fallback
  }

  return {
    registerHttp: (sessionId, registration) => {
      const session = makeSession(registration)
      bySessionId.set(sessionId, session)
      return session
    },
    registerConnection: (clientId, registration) => {
      const session = makeSession(registration)
      byClientId.set(clientId, session)
      return session
    },
    resolve: resolveSession,
    resolveSessionId: (sessionId) => bySessionId.get(sessionId),
    setLogLevel: (level, clientId, headers) =>
      Effect.sync(() => {
        const session = resolveSession(clientId, headers)
        if (session !== undefined) {
          session.logLevel = { _tag: "Mcp", level }
        }
      }),
    subscribe: (uri, clientId, headers) => {
      const subscriptions = resolveSession(clientId, headers)?.resourceSubscriptions
      if (subscriptions === undefined) {
        return Effect.fail(
          new McpProtocol.ProtocolError({
            code: PublicMcpSchema.METHOD_NOT_FOUND_ERROR_CODE,
            message: "Resource subscriptions are not supported"
          })
        )
      }
      return Effect.sync(() => subscriptions.add(uri)).pipe(Effect.asVoid)
    },
    unsubscribe: (uri, clientId, headers) => {
      const subscriptions = resolveSession(clientId, headers)?.resourceSubscriptions
      if (subscriptions === undefined) {
        return Effect.fail(
          new McpProtocol.ProtocolError({
            code: PublicMcpSchema.METHOD_NOT_FOUND_ERROR_CODE,
            message: "Resource subscriptions are not supported"
          })
        )
      }
      return Effect.sync(() => subscriptions.delete(uri)).pipe(Effect.asVoid)
    },
    effectLogLevel,
    canDeliver: (clientId, headers, notification, fallbackLogLevel) => {
      const session = resolveSession(clientId, headers)
      if (notification._tag === "LoggingMessage") {
        const minimum = session?.logLevel
        return minimum?._tag === "Mcp"
          ? McpProtocol.mcpLogLevels[notification.level].order >= McpProtocol.mcpLogLevels[minimum.level].order
          : LogLevel.isGreaterThanOrEqualTo(
            McpProtocol.mcpLogLevels[notification.level].effect,
            minimum?.level ?? fallbackLogLevel
          )
      }
      return notification._tag !== "ResourceUpdated" || session?.resourceSubscriptions?.has(notification.uri) === true
    },
    markInitialized: (clientId) => {
      initializedClientIds.add(clientId)
    },
    initializedClientIds: () => initializedClientIds.values(),
    disconnect: (clientId) => {
      byClientId.delete(clientId)
      initializedClientIds.delete(clientId)
    }
  }
}
