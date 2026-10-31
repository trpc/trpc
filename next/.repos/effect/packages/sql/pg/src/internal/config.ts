import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as EffectResult from "effect/Result"
import { ConnectionError, SqlError } from "effect/sql/SqlError"
import type { Duplex } from "node:stream"
import type { ConnectionOptions } from "node:tls"
import type { Config } from "../PgConnection.ts"
import type * as PgProtocol from "../PgProtocol.ts"

export interface ResolvedConfig {
  readonly host: string
  readonly port: number
  readonly path: string | undefined
  readonly ssl: boolean | ConnectionOptions
  readonly sslOptional: boolean
  readonly username: string
  readonly password: Redacted.Redacted | Effect.Effect<Redacted.Redacted> | undefined
  readonly connectTimeout: Duration.Duration
  readonly keepAlive: number | undefined
  readonly startupParameters: PgProtocol.StartupParameters
  readonly stream: (() => Duplex) | undefined
  readonly maxMessageSize: number | undefined
}

const configError = (message: string, cause?: unknown): SqlError =>
  new SqlError({
    reason: new ConnectionError({
      cause: cause ?? new Error(message),
      message: `PgConnection: ${message}`,
      operation: "connect"
    })
  })

// Node truncates to whole seconds and libuv silently ignores zero, which would
// leave the OS defaults in place.
const keepAliveMillis = (input: Duration.Input): number | undefined => {
  const duration = Duration.fromInput(input)
  if (Option.isNone(duration)) return undefined
  const seconds = Math.floor(Duration.toSeconds(duration.value))
  return seconds >= 1 && seconds <= 0x7fffffff ? seconds * 1000 : undefined
}

export const resolveConfig = (options: Config): Effect.Effect<ResolvedConfig, SqlError> =>
  Effect.suspend(() => {
    const parsed: EffectResult.Result<UrlConfig, SqlError> = options.url !== undefined
      ? parseUrl(Redacted.value(options.url))
      : EffectResult.succeed({})
    if (EffectResult.isFailure(parsed)) return Effect.fail(parsed.failure)
    const url = parsed.success
    const host = options.host ?? url.host ?? "localhost"
    const port = options.port ?? url.port ?? 5432
    const username = options.username ?? url.username ?? process.env.USER ?? process.env.USERNAME
    if (username === undefined) {
      return Effect.fail(configError("No username configured"))
    }
    const keepAlive = options.keepAlive === undefined ? undefined : keepAliveMillis(options.keepAlive)
    if (options.keepAlive !== undefined && keepAlive === undefined) {
      return Effect.fail(configError("keepAlive must be between 1 and 2147483647 seconds"))
    }
    const named: Record<string, string> = Object.create(null)
    for (const [name, value] of Object.entries(options.startupParameters ?? {})) {
      const key = name.toLowerCase()
      if (key === "user" || key === "database" || key === "replication" || key === "options") {
        return Effect.fail(configError(`Reserved startup parameter: "${name}"`))
      }
      if (key === "client_encoding") {
        const encoding = value.toUpperCase()
        if (encoding !== "UTF8" && encoding !== "UTF-8") {
          return Effect.fail(configError("Startup parameter client_encoding must be UTF8 or UTF-8"))
        }
        named[key] = "UTF8"
      } else {
        named[key] = value
      }
      if (name === "" || name.includes("\0") || value.includes("\0")) {
        return Effect.fail(
          configError("Startup parameter names must be nonempty and names/values must not contain NUL")
        )
      }
    }
    const startupParameters: PgProtocol.StartupParameters = {
      ...named,
      user: username,
      database: options.database ?? url.database,
      application_name: options.applicationName ?? named.application_name ?? url.applicationName ?? "@effect/sql-pg",
      options: options.startupOptions ?? url.options
    }
    for (const [name, value] of Object.entries(startupParameters)) {
      if (value?.includes("\0")) {
        return Effect.fail(configError(`Startup parameter "${name}" must not contain NUL`))
      }
    }
    return Effect.succeed<ResolvedConfig>({
      host,
      port,
      path: options.path ?? (host.startsWith("/") ? `${host}/.s.PGSQL.${port}` : undefined),
      ssl: options.ssl ?? (url.ssl === "prefer" ? true : url.ssl ?? false),
      sslOptional: options.ssl === undefined && url.ssl === "prefer",
      username,
      password: options.password ?? (url.password !== undefined ? Redacted.make(url.password) : undefined),
      connectTimeout: Duration.fromInputUnsafe(options.connectTimeout ?? url.connectTimeout ?? Duration.seconds(5)),
      keepAlive,
      startupParameters,
      stream: options.stream,
      maxMessageSize: options.maxMessageSize
    })
  })

interface UrlConfig {
  host?: string | undefined
  port?: number | undefined
  database?: string | undefined
  username?: string | undefined
  password?: string | undefined
  applicationName?: string | undefined
  options?: string | undefined
  connectTimeout?: Duration.Duration | undefined
  ssl?: boolean | "prefer" | undefined
}

const decodeComponent = (value: string, what: string): EffectResult.Result<string, SqlError> => {
  try {
    return EffectResult.succeed(decodeURIComponent(value))
  } catch {
    return EffectResult.fail(configError(`Invalid percent-encoding in URL ${what}`))
  }
}

const parsePort = (value: string, what: string): EffectResult.Result<number, SqlError> => {
  const port = Number(value)
  return !Number.isInteger(port) || port < 1 || port > 65535
    ? EffectResult.fail(configError(`Invalid port in URL ${what}: "${value}"`))
    : EffectResult.succeed(port)
}

const parseUrl = (raw: string): EffectResult.Result<UrlConfig, SqlError> => {
  let url: URL
  try {
    url = new URL(raw)
  } catch (cause) {
    return EffectResult.fail(configError("Invalid connection URL", cause))
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return EffectResult.fail(configError(`Unsupported connection URL protocol: "${url.protocol}"`))
  }

  const config: UrlConfig = {}
  if (url.hostname !== "") {
    if (url.hostname.startsWith("[") && url.hostname.endsWith("]")) {
      config.host = url.hostname.slice(1, -1)
    } else {
      const host = decodeComponent(url.hostname, "host")
      if (EffectResult.isFailure(host)) return EffectResult.fail(host.failure)
      config.host = host.success
    }
  }
  if (url.port !== "") {
    const port = parsePort(url.port, "authority")
    if (EffectResult.isFailure(port)) return EffectResult.fail(port.failure)
    config.port = port.success
  }
  if (url.username !== "") {
    const username = decodeComponent(url.username, "username")
    if (EffectResult.isFailure(username)) return EffectResult.fail(username.failure)
    config.username = username.success
  }
  if (url.password !== "") {
    const password = decodeComponent(url.password, "password")
    if (EffectResult.isFailure(password)) return EffectResult.fail(password.failure)
    config.password = password.success
  }
  const database = decodeComponent(url.pathname.replace(/^\//, ""), "database")
  if (EffectResult.isFailure(database)) return EffectResult.fail(database.failure)
  if (database.success !== "") config.database = database.success

  for (const [key, value] of url.searchParams) {
    switch (key) {
      case "host":
        config.host = value
        break
      case "port": {
        const port = parsePort(value, "port parameter")
        if (EffectResult.isFailure(port)) return EffectResult.fail(port.failure)
        config.port = port.success
        break
      }
      case "user":
        config.username = value
        break
      case "password":
        config.password = value
        break
      case "dbname":
        config.database = value
        break
      case "application_name":
        config.applicationName = value
        break
      case "options":
        config.options = value
        break
      case "connect_timeout": {
        const seconds = Number(value)
        if (!Number.isInteger(seconds) || seconds < 0) {
          return EffectResult.fail(configError(`Invalid connect_timeout in URL: "${value}"`))
        }
        config.connectTimeout = seconds === 0 ? Duration.infinity : Duration.seconds(seconds)
        break
      }
      case "sslmode":
        switch (value) {
          case "disable":
            config.ssl = false
            break
          case "require":
          case "verify-ca":
          case "verify-full":
            config.ssl = true
            break
          case "prefer":
          case "allow":
            config.ssl = "prefer"
            break
          default:
            return EffectResult.fail(configError(`Unrecognized sslmode in URL: "${value}"`))
        }
        break
        // Unknown query parameters are ignored, matching libpq.
    }
  }
  return EffectResult.succeed(config)
}
