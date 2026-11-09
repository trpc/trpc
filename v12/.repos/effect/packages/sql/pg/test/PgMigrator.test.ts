import { PgClient, PgMigrator } from "@effect/sql-pg"
import { assert, describe, it } from "@effect/vitest"
import { Effect, FileSystem, Path, Redacted, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import { Reactivity } from "effect/reactivity"
import * as SqlClient from "effect/sql/SqlClient"
import * as Fs from "node:fs"
import * as NodePath from "node:path"
import { PassThrough } from "node:stream"

const makeMigrator = Effect.fnUntraced(function*(
  config: PgClient.PgClientConfig,
  onSpawn?: (command: ChildProcess.StandardCommand) => void
) {
  const commands: Array<ChildProcess.StandardCommand> = []
  const files: Array<string> = []
  const pg = yield* PgClient.make(config)
  const sql = yield* SqlClient.make({
    driver: "test",
    acquirer: Effect.succeed({
      execute: () => Effect.succeed([]),
      executeRaw: () => Effect.succeed([]),
      executeValues: () => Effect.succeed([]),
      executeUnprepared: () => Effect.succeed([]),
      executeValuesUnprepared: () => Effect.succeed([]),
      executeStream: () => Stream.empty
    }),
    compiler: PgClient.makeCompiler(),
    spanAttributes: []
  })
  const run = PgMigrator.run({
    loader: PgMigrator.fromRecord({ "1_init": Effect.void }),
    schemaDirectory: "migrations"
  }).pipe(
    Effect.provideService(PgClient.PgClient, pg),
    Effect.provideService(SqlClient.SqlClient, sql),
    Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, {
      ...ChildProcessSpawner.make(() => Effect.die("unexpected spawn")),
      string: (command) =>
        Effect.sync(() => {
          assert(ChildProcess.isStandardCommand(command))
          commands.push(command)
          onSpawn?.(command)
          return "SELECT 1;"
        })
    }),
    Effect.provide(FileSystem.layerNoop({
      makeDirectory: () => Effect.void,
      writeFileString: (path) =>
        Effect.sync(() => {
          files.push(path)
        })
    })),
    Effect.provide(Path.layer)
  )
  return { commands, files, run }
}, Effect.provide(Reactivity.layer))

// Parses the libpq conninfo passed as `pg_dump --dbname=<conninfo>`.
const dumpConnection = (command: ChildProcess.StandardCommand) => {
  const dbname = command.args.find((arg): arg is string => typeof arg === "string" && arg.startsWith("--dbname="))
  assert(dbname !== undefined, "pg_dump was not given --dbname")
  const conninfo: Record<string, string> = {}
  for (const [, key, quoted, plain] of dbname.slice(9).matchAll(/(\w+)\s*=\s*(?:'((?:[^'\\]|\\.)*)'|(\S*))/g)) {
    conninfo[key] = quoted !== undefined ? quoted.replace(/\\(.)/g, "$1") : plain
  }
  return conninfo
}

describe("PgMigrator", () => {
  it.effect("shares one password per schema dump and refreshes it for the next dump", () =>
    Effect.gen(function*() {
      let calls = 0
      const { commands, files, run } = yield* makeMigrator({
        password: Effect.map(Effect.yieldNow, () => Redacted.make(`secret-${++calls}`))
      })

      yield* run

      assert.strictEqual(calls, 1)
      assert.deepStrictEqual(commands.map((command) => command.command), ["pg_dump", "pg_dump"])
      assert.deepStrictEqual(commands.map((command) => command.options.env?.PGPASSWORD), ["secret-1", "secret-1"])

      yield* run

      assert.strictEqual(calls, 2)
      assert.deepStrictEqual(commands.map((command) => command.options.env?.PGPASSWORD), [
        "secret-1",
        "secret-1",
        "secret-2",
        "secret-2"
      ])
      assert.deepStrictEqual(files, ["migrations/_schema.sql", "migrations/_schema.sql"])
    }))

  it.effect("passes a static password to both dump processes", () =>
    Effect.gen(function*() {
      const { commands, files, run } = yield* makeMigrator({ password: Redacted.make("static") })
      yield* run

      assert.deepStrictEqual(commands.map((command) => command.options.env?.PGPASSWORD), ["static", "static"])
      assert.deepStrictEqual(files, ["migrations/_schema.sql"])
    }))

  it.effect("dumps through the connection resolved from the url and explicit fields", () =>
    Effect.gen(function*() {
      const { commands, run } = yield* makeMigrator({
        url: Redacted.make("postgres://alice:s3cret@db.example.com:6543/app?sslmode=prefer"),
        database: "reports"
      })
      yield* run

      assert.strictEqual(commands.length, 2)
      for (const command of commands) {
        assert.containsSubset(dumpConnection(command), {
          host: "db.example.com",
          port: "6543",
          user: "alice",
          dbname: "reports",
          // The client verifies the certificate whenever the server accepts TLS
          sslmode: "verify-full"
        })
        assert.isFalse(
          command.args.some((arg) => (Redacted.isRedacted(arg) ? Redacted.value(arg) : arg).includes("s3cret"))
        )
        assert.strictEqual(command.options.extendEnv, false)
        assert.deepStrictEqual(command.options.env, { PATH: process.env.PATH, PGPASSWORD: "s3cret" })
      }
    }))

  it.effect("matches the client's socket and unverified TLS settings", () =>
    Effect.gen(function*() {
      const cases: ReadonlyArray<readonly [PgClient.PgClientConfig, Record<string, string>]> = [
        [{ path: "/var/run/postgresql/.s.PGSQL.5433" }, {
          host: "/var/run/postgresql",
          port: "5433",
          sslmode: "disable"
        }],
        [{ host: "db.example.com", ssl: { rejectUnauthorized: false } }, { sslmode: "require" }]
      ]
      for (const [config, expected] of cases) {
        const { commands, run } = yield* makeMigrator({ ...config, username: "alice" })
        yield* run
        assert.strictEqual(commands.length, 2)
        for (const command of commands) {
          assert.containsSubset(dumpConnection(command), expected)
        }
      }
    }))

  it.effect("gives pg_dump the client's CA only while the dump runs", () =>
    Effect.gen(function*() {
      const ca = "-----BEGIN CERTIFICATE-----\nY2E=\n-----END CERTIFICATE-----"
      const dumps: Array<{ sslmode: string; rootcert: string; directory: string }> = []
      const { run } = yield* makeMigrator({ host: "db.example.com", username: "alice", ssl: { ca } }, (command) => {
        const { sslmode, sslrootcert } = dumpConnection(command)
        dumps.push({
          sslmode,
          rootcert: Fs.readFileSync(sslrootcert, "utf8"),
          directory: NodePath.dirname(sslrootcert)
        })
      })
      yield* run

      assert.strictEqual(dumps.length, 2)
      for (const dump of dumps) {
        assert.strictEqual(dump.sslmode, "verify-full")
        assert.include(dump.rootcert, ca)
        assert.isFalse(Fs.existsSync(dump.directory))
      }
    }))

  it.effect("does not dump connections that libpq cannot reproduce", () =>
    Effect.gen(function*() {
      const cases: ReadonlyArray<PgClient.PgClientConfig> = [
        { stream: () => new PassThrough() },
        { path: "/var/run/postgresql/.s.PGSQL.5432", ssl: true }
      ]
      for (const config of cases) {
        const { commands, files, run } = yield* makeMigrator({ ...config, username: "alice" })
        yield* run

        assert.deepStrictEqual(commands, [])
        assert.deepStrictEqual(files, [])
      }
    }))
})
