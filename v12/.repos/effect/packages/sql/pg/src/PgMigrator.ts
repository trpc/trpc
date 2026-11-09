/**
 * Runs database migrations for PostgreSQL projects that use Effect SQL.
 *
 * This module reuses the shared SQL migrator and connects it to PostgreSQL. It
 * exposes the common migration helpers and adds `run` and `layer` functions
 * that apply pending migration files with the current SQL client. When schema
 * dumps are requested, it uses `pg_dump` and the usual process and filesystem
 * services.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Migrator from "effect/sql/Migrator"
import type { SqlClient } from "effect/sql/SqlClient"
import type { SqlError } from "effect/sql/SqlError"
import { Buffer } from "node:buffer"
import * as NodeFs from "node:fs/promises"
import * as Os from "node:os"
import * as NodePath from "node:path"
import * as Tls from "node:tls"
import { resolveConfig, type ResolvedConfig } from "./internal/config.ts"
import * as Password from "./internal/password.ts"
import { PgClient, type PgClientConfig } from "./PgClient.ts"

/**
 * @since 4.0.0
 */
export * from "effect/sql/Migrator"
export {
  /**
   * @stability unstable
   * @category loaders
   * @since 4.0.0
   */
  fromFileSystem
} from "effect/sql/MigratorFileSystem"

/**
 * Runs PostgreSQL SQL migrations using the configured clients. Schema dumps use `pg_dump` and require child process, filesystem, and path services.
 *
 * **Details**
 *
 * `pg_dump` connects with the same resolved settings as `PgClient`: URL and
 * explicit fields, Unix socket path, user, database, `application_name`,
 * `options`, and connect timeout. The password is passed through `PGPASSWORD`
 * and the inherited environment is not used.
 *
 * TLS maps to libpq as follows: no TLS uses `sslmode=disable`,
 * `rejectUnauthorized: false` uses `require`, and verified TLS uses
 * `verify-full` with the client's trusted CAs (`ssl.ca`, or Node's default CAs)
 * written to a temporary `sslrootcert` file. A PEM `ssl.cert` / `ssl.key` pair
 * is passed as `sslcert` / `sslkey`.
 *
 * URL `sslmode=prefer` / `allow` also uses `verify-full`, because the client
 * verifies the certificate whenever the server accepts TLS and libpq cannot
 * verify while keeping a plaintext fallback. Dumps from servers that refuse TLS
 * therefore fail, even though the client falls back to plaintext.
 *
 * Node's default CAs require `tls.getCACertificates` (Node.js 22.15 / 23.10 or
 * later). On older runtimes, verified TLS dumps require an explicit `ssl.ca`.
 *
 * The dump fails, and the migrator logs the error, for custom `stream`
 * connections, TLS over Unix sockets, socket paths not named
 * `.s.PGSQL.<port>`, a `servername` different from the host, and other `ssl`
 * options.
 *
 * @stability unstable
 * @category running
 * @since 4.0.0
 */
export const run: <R2 = never>(
  options: Migrator.MigratorOptions<R2>
) => Effect.Effect<
  ReadonlyArray<readonly [id: number, name: string]>,
  Migrator.MigrationError | SqlError,
  | SqlClient
  | PgClient
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Path.Path
  | R2
> = Migrator.make({
  dumpSchema(path, table) {
    const pgDump = Effect.fnUntraced(function*(connection: DumpConnection, args: Array<string>) {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const dump = yield* ChildProcess.make("pg_dump", [
        ...args,
        "--no-owner",
        "--no-privileges",
        "--no-password",
        `--dbname=${connection.conninfo}`
      ], {
        env: { PATH: process.env.PATH, PGPASSWORD: connection.password },
        extendEnv: false
      }).pipe(spawner.string)

      return dump.replace(/^--.*$/gm, "")
        .replace(/^SET .*$/gm, "")
        .replace(/^SELECT pg_catalog\..*$/gm, "")
        .replace(/\n{2,}/gm, "\n\n")
        .trim()
    })

    const pgDumpAll = Effect.gen(function*() {
      const sql = yield* PgClient
      const connection = yield* dumpConnection(sql.config)
      const [schema, migrations] = yield* Effect.all([
        pgDump(connection, ["--schema-only"]),
        pgDump(connection, ["--column-inserts", "--data-only", `--table=${table}`])
      ], { concurrency: 2 })
      return schema + "\n\n" + migrations
    }).pipe(Effect.scoped)

    const pgDumpFile = Effect.fnUntraced(
      function*(path: string) {
        const fs = yield* FileSystem.FileSystem
        const path_ = yield* Path.Path
        const dump = yield* pgDumpAll
        yield* fs.makeDirectory(path_.dirname(path), { recursive: true })
        yield* fs.writeFileString(path, dump)
      },
      Effect.mapError((error) => new Migrator.MigrationError({ kind: "Failed", message: error.message, cause: error }))
    )

    return pgDumpFile(path)
  }
})

interface DumpConnection {
  readonly conninfo: string
  readonly password: string | undefined
}

const unsupported = (reason: string) =>
  Effect.fail(
    new Migrator.MigrationError({
      kind: "Failed",
      message: `pg_dump cannot connect the same way as PgClient: ${reason}`
    })
  )

// Builds the libpq connection for pg_dump from the client's resolved config.
// The password is passed through PGPASSWORD, never in argv.
const dumpConnection = Effect.fnUntraced(function*(options: PgClientConfig) {
  const config = yield* resolveConfig(options)
  if (config.stream !== undefined) {
    return yield* unsupported("custom `stream` connections have no libpq equivalent")
  }
  let host = config.host
  let port = config.port
  if (config.path !== undefined) {
    // libpq takes the socket directory and derives the file name from the port
    const socket = /^(.*)\/\.s\.PGSQL\.(\d+)$/.exec(config.path)
    if (socket === null) {
      return yield* unsupported(`the socket path "${config.path}" is not named .s.PGSQL.<port>`)
    }
    host = socket[1] || "/"
    port = Number(socket[2])
  }
  const startup = config.startupParameters
  const connectTimeout = Duration.isFinite(config.connectTimeout)
    ? String(Math.max(1, Math.ceil(Duration.toSeconds(config.connectTimeout))))
    : undefined
  return {
    conninfo: conninfo({
      host,
      port: String(port),
      user: config.username,
      dbname: startup.database,
      application_name: startup.application_name,
      options: startup.options,
      connect_timeout: connectTimeout,
      ...yield* tlsParameters(config)
    }),
    password: yield* Password.resolve(config.password)
  } satisfies DumpConnection
})

const conninfo = (parameters: Record<string, string | undefined>): string =>
  Object.entries(parameters)
    .flatMap(([key, value]) => value === undefined ? [] : [`${key}='${value.replace(/[\\']/g, "\\$&")}'`])
    .join(" ")

const supportedTlsOptions = new Set(["ca", "cert", "key", "rejectUnauthorized", "servername"])

// Maps the client's TLS behaviour to libpq. Certificates are written to a
// scoped temporary directory because libpq only reads them from files. Unused
// file parameters point at missing files inside that directory so libpq does
// not fall back to ~/.postgresql.
const tlsParameters = Effect.fnUntraced(function*(config: ResolvedConfig) {
  if (config.ssl === false) return { sslmode: "disable" }
  if (config.path !== undefined) {
    // The server refuses TLS on Unix sockets, so optional TLS is plaintext
    if (config.sslOptional) return { sslmode: "disable" }
    return yield* unsupported("libpq does not use TLS over Unix sockets")
  }
  const ssl: Tls.ConnectionOptions = typeof config.ssl === "object" ? config.ssl : {}
  const options = Object.keys(ssl).filter((key) =>
    (ssl as Record<string, unknown>)[key] !== undefined && !supportedTlsOptions.has(key)
  )
  if (options.length > 0) {
    return yield* unsupported(`the ssl options ${options.join(", ")} have no libpq equivalent`)
  }
  if (ssl.servername !== undefined && ssl.servername !== config.host) {
    return yield* unsupported("libpq verifies the host, not a separate ssl servername")
  }
  if ((ssl.cert === undefined) !== (ssl.key === undefined)) {
    return yield* unsupported("ssl cert and key must be set together")
  }
  if (ssl.key !== undefined && typeof ssl.key !== "string" && !(ssl.key instanceof Uint8Array)) {
    return yield* unsupported("ssl key must be a single PEM string or Buffer")
  }
  // Optional TLS still verifies, and libpq cannot verify with a plaintext fallback
  const verify = ssl.rejectUnauthorized !== false
  if (verify && ssl.ca === undefined && typeof Tls.getCACertificates !== "function") {
    return yield* unsupported(
      "this Node.js version cannot report its default CAs (tls.getCACertificates needs Node.js 22.15 / 23.10), set ssl.ca"
    )
  }
  const directory = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => NodeFs.mkdtemp(NodePath.join(Os.tmpdir(), "effect-sql-pg-dump-")),
      catch: (cause) =>
        new Migrator.MigrationError({ kind: "Failed", message: "Could not create pg_dump TLS directory", cause })
    }),
    (directory) => Effect.promise(() => NodeFs.rm(directory, { recursive: true, force: true }))
  )
  // Without a PEM the parameter points at a missing file, so libpq does not
  // fall back to ~/.postgresql
  const file = (name: string, pem: Pem | undefined) => {
    const path = NodePath.join(directory, pem === undefined ? "none" : name)
    if (pem === undefined) return Effect.succeed(path)
    return Effect.tryPromise({
      try: () => NodeFs.writeFile(path, toPem(pem), { mode: 0o600 }),
      catch: (cause) => new Migrator.MigrationError({ kind: "Failed", message: `Could not write ${name}`, cause })
    }).pipe(Effect.as(path))
  }
  return {
    sslmode: verify ? "verify-full" : "require",
    // Node replaces its default trust store when `ca` is set. The default
    // store includes NODE_EXTRA_CA_CERTS and --use-system-ca.
    sslrootcert: yield* file("root.crt", verify ? ssl.ca ?? Tls.getCACertificates("default") : undefined),
    sslcert: yield* file("client.crt", ssl.cert),
    sslkey: yield* file("client.key", ssl.key)
  }
})

type Pem = string | Uint8Array | ReadonlyArray<string | Uint8Array>

const toPem = (value: Pem): string =>
  (Array.isArray(value) ? value : [value]).map((pem) => Buffer.from(pem).toString().trim()).join("\n") + "\n"

/**
 * Creates a layer that runs PostgreSQL migrations during layer construction, including `pg_dump`-based schema dump support when requested.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = <R>(
  options: Migrator.MigratorOptions<R>
): Layer.Layer<
  never,
  Migrator.MigrationError | SqlError,
  | SqlClient
  | PgClient
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | Path.Path
  | R
> => Layer.effectDiscard(run(options))
