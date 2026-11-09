# Configuration in Effect

This guide shows you how to load and validate configuration in an Effect application. Two modules work together:

- **`ConfigProvider`** — reads raw data from a source (environment variables, JSON objects, `.env` files, directory trees).
- **`Config`** — describes what shape and types you expect, then decodes the raw data into typed values.

You describe _what_ you need with `Config`, and the library figures out _how_ to read and validate it using a `ConfigProvider`.

## Getting Started

### Reading a Single Value

The simplest case: read one value from an environment variable.

```ts
import { Config, Effect } from "effect"

const program = Effect.gen(function*() {
  const host = yield* Config.String("HOST")
  console.log(host)
})

Effect.runSync(program)
// reads HOST from process.env
```

When you yield a `Config` inside `Effect.gen`, it automatically uses the default `ConfigProvider` (which reads from `process.env`).

### Reading Multiple Values

Use `Config.all` to group related keys:

```ts
import { Config, ConfigProvider, Effect } from "effect"

const dbConfig = Config.all({
  host: Config.String("host"),
  port: Config.Int("port")
})

const provider = ConfigProvider.fromUnknown({
  host: "localhost",
  port: 5432
})

const result = Effect.runSync(dbConfig.parse(provider))
// { host: "localhost", port: 5432 }
```

### Reading Structured Config with a Schema

For larger configs, use `Config.schema` with a `Schema.Struct`:

```ts
import { Config, ConfigProvider, Effect, Schema } from "effect"

const AppConfig = Config.schema(
  Schema.Struct({
    host: Schema.String,
    port: Schema.Int,
    debug: Schema.Boolean
  })
)

const provider = ConfigProvider.fromUnknown({
  host: "localhost",
  port: 8080,
  debug: true
})

const result = Effect.runSync(AppConfig.parse(provider))
// { host: "localhost", port: 8080, debug: true }
```

The schema automatically decodes raw string values into their target types. For example, when reading from environment variables, `"8080"` becomes the number `8080` and `"true"` becomes the boolean `true`.

## Config Constructors

Each constructor reads and decodes a configuration value into the appropriate type.

| Constructor                      | Decoded type       | Notes                                                                    |
| -------------------------------- | ------------------ | ------------------------------------------------------------------------ |
| `Config.String(name?)`           | `string`           | Any string                                                               |
| `Config.NonEmptyString(name?)`   | `string`           | Rejects `""`                                                             |
| `Config.Number(name?)`           | `number`           | Includes `NaN`, `Infinity`                                               |
| `Config.Finite(name?)`           | `number`           | Rejects `NaN` and `Infinity`                                             |
| `Config.Int(name?)`              | `number`           | Integers only                                                            |
| `Config.Boolean(name?)`          | `boolean`          | Accepts `true/false`, `yes/no`, `on/off`, `1/0`, `y/n`                   |
| `Config.Port(name?)`             | `number`           | Integer in 1–65535                                                       |
| `Config.URL(name?)`              | `URL`              | Parsed via the `URL` constructor                                         |
| `Config.Date(name?)`             | `Date`             | Rejects invalid dates                                                    |
| `Config.Duration(name?)`         | `Duration`         | Parses `"10 seconds"`, `"500 millis"`, `"Infinity"`, `"-Infinity"`, etc. |
| `Config.LogLevel(name?)`         | `string`           | One of `All`, `Fatal`, `Error`, `Warn`, `Info`, `Debug`, `Trace`, `None` |
| `Config.Redacted(name?)`         | `Redacted<string>` | Hidden from logs and `toString`                                          |
| `Config.Literal(value, name?)`   | literal type       | Accepts only the given literal                                           |
| `Config.Literals(values, name?)` | literal union      | Accepts one of the given literals                                        |
| `Config.Array(value, ...)`       | `ReadonlyArray<V>` | Accepts structural arrays and flat separated strings                     |
| `Config.Record(key, value, ...)` | `Record<K, V>`     | Accepts structural records and flat separated key-value strings          |

The optional `name` parameter sets the local path segment for lookup. If the config is wrapped with `Config.nested`, the nested prefix is prepended to this local path. Omit `name` when the config should decode the provider root. `Config.Array` and `Config.Record` additionally accept an options object directly when no path is needed, or a path followed by the options object.

### Parsing and Path Ownership

A `Config` exposes `parse(provider)`; lookup prefixes are not part of this public method. Build paths declaratively with the constructor's `name` / `path` argument and `Config.nested`.

This keeps the two path responsibilities separate:

- `Config.schema(..., path)` and `Config.nested(name)` describe the logical path of a setting.
- `ConfigProvider.mapInput`, `ConfigProvider.nested`, and case-conversion combinators map logical paths to a source.

The same rule applies when a `Config` is yielded as an `Effect`: the config uses the current `ConfigProvider`, while its internally composed logical path stays an implementation detail.

## Config Combinators

### `Config.withDefault` — Fallback for Absent Input

Triggers when the config is absent. For `Config.all`, any absent child makes the group absent unless another child fails. A group default replaces the entire group; apply defaults to individual children to keep other supplied values. Validation and source errors still propagate.

```ts
import { Config, ConfigProvider, Effect } from "effect"

const port = Config.Int("port").pipe(Config.withDefault(3000))

const provider = ConfigProvider.fromUnknown({})
Effect.runSync(port.parse(provider)) // 3000
```

### `Config.option` — Optional Values

Returns `Option.some(value)` on success and `Option.none()` when the config is absent. A successful `undefined` value is still a success, so a schema that accepts missing input produces `Option.some(undefined)`, not `Option.none()`.

```ts
import { Config, ConfigProvider, Effect } from "effect"

const maybePort = Config.option(Config.Int("port"))

const provider = ConfigProvider.fromUnknown({})
Effect.runSync(maybePort.parse(provider)) // { _tag: "None" }
```

### `Config.map` — Transform a Value

```ts
import { Config } from "effect"

const upperHost = Config.String("HOST").pipe(
  Config.map((s) => s.toUpperCase())
)
```

### `Config.orElse` — Fallback on Any Error

Unlike `withDefault`, this handles absence and **all** `ConfigError`s. The fallback's result replaces the original failure. If the fallback is absent, a later `withDefault` or `option` can recover it. If the fallback fails, only its error propagates:

```ts
import { Config } from "effect"

const host = Config.String("HOST").pipe(
  Config.orElse(() => Config.succeed("localhost"))
)
```

### `Config.nested` — Scope a Config Under a Prefix

Prepends a logical path segment to every key the inner config reads. The prefix is used for both provider lookups and schema error paths:

```ts
import { Config, ConfigProvider, Effect } from "effect"

const dbConfig = Config.all({
  host: Config.String("host"),
  port: Config.Int("port")
}).pipe(Config.nested("database"))

const provider = ConfigProvider.fromUnknown({
  database: { host: "localhost", port: 5432 }
})

Effect.runSync(dbConfig.parse(provider))
// { host: "localhost", port: 5432 }
```

With environment variables, nesting uses `_` as separator:

```ts
import { Config, ConfigProvider, Effect } from "effect"

const host = Config.String("host").pipe(Config.nested("database"))

const provider = ConfigProvider.fromEnv({
  env: { database_host: "localhost" }
})

Effect.runSync(host.parse(provider)) // "localhost"
```

Multiple `Config.nested` calls compose with the outermost prefix first:

```ts
import { Config, ConfigProvider, Effect } from "effect"

const config = Config.String("host").pipe(
  Config.nested("database"),
  Config.nested("production")
)

const provider = ConfigProvider.fromUnknown({
  production: {
    database: {
      host: "localhost"
    }
  }
})

Effect.runSync(config.parse(provider)) // "localhost"
```

### `Config.all` — Combine Multiple Configs

Accepts a record, a tuple, or an iterable. A group is absent when any child is absent and no child fails. `Config.withDefault` replaces the entire absent group, and `Config.option` returns `None`. Validation and source errors propagate even when another child is absent.

```ts
import { Config } from "effect"

// As a record
const appConfig = Config.all({
  host: Config.String("host"),
  port: Config.Int("port"),
  debug: Config.Boolean("debug")
})

// As a tuple
const pair = Config.all([Config.String("a"), Config.Int("b")])
```

For example, providing only `host` selects the default for the entire group here:

```ts
import { Config } from "effect"

const database = Config.all({
  host: Config.String("host"),
  port: Config.Int("port")
}).pipe(
  Config.withDefault({ host: "localhost", port: 5432 })
)
```

If the provider contains `{ host: "db.internal" }`, the result is `{ host: "localhost", port: 5432 }`. To keep the supplied host and default only the port, put `Config.withDefault(5432)` on the `port` child instead.

Child defaults resolve missing children before the group decides whether it is absent:

```ts
const listener = Config.all({
  host: Config.String("host"),
  port: Config.Int("port").pipe(Config.withDefault(8080))
}).pipe(Config.option)
```

`listener` is `None` when `host` is absent, including when a valid `port` is present. It is `Some` when `host` is present and `port` resolves to either a supplied value or its default. An invalid `port` fails even if `host` is absent.

### How Absence Is Decided

Configuration evaluation distinguishes three situations before producing the public `Effect`:

1. **Resolved** — decoding succeeded. The value may legitimately be `undefined`, `{}`, or `[]`.
2. **Absent** — a schema could not resolve because its relevant provider representation was unavailable, or a combined config has an absent child and no failed children.
3. **Failed** — the provider failed, input was invalid, or an effectful transformation failed.

`Config.withDefault` and `Config.option` handle only the second case. `Config.orElse` handles both absence and failures and adopts the fallback's result. Once a failure is recovered, it does not influence enclosing groups or later defaults.

At the lookup path of a `Config.schema`, an unavailable representation is passed to the schema decoder as `undefined`. This includes a missing node and a present node whose shape cannot represent the schema: for example, an array node cannot represent a struct. Missing properties inside an object remain omitted so the schema's property semantics still apply. The decoder runs before absence is decided. Consequently:

- `Config.schema(Schema.UndefinedOr(Schema.String), "key")` succeeds with `undefined` when `key` is absent.
- An explicitly present empty object can decode to `{}` when the schema permits it.
- Wrapping either successful result in `Config.option` produces `Some`, because decoding succeeded.
- If the schema rejects `undefined` and no relevant representation was found, `Config.withDefault` uses its fallback and `Config.option` returns `None`.
- Present invalid data is a failure. A `Config.all` group with missing children is absent unless another child fails.
- `SourceError` is always a failure and is never replaced by `withDefault` or `option`.

`Config.schema(Schema.Struct(...))` and `Config.all(...)` describe different lookup models. A struct schema validates one structured input. An existing object, including an empty object, fails validation if required fields are missing. `Config.all` evaluates independent child configs and can recover a partially supplied group through `Config.withDefault` or `Config.option`. Field optionality in `Config.all` is expressed on each child with `Config.option` or `Config.withDefault`.

### How Schema Input Is Loaded

`Config.schema` converts its codec to the canonical `Schema.StringTree` codec and uses the encoded AST to decide which provider representation to load:

- A scalar schema reads the node's scalar value. A record or array node may have a co-located scalar value in addition to its children.
- A struct loads its declared properties and omits children that the provider does not contain. A record schema also loads advertised keys that match its index signature.
- An array or tuple loads its indexed children. Missing positions are represented as `undefined` so the element schema decides whether they are valid.
- A union whose members require different shapes materializes each member independently. Schema then applies the union's declared order or `oneOf` rule and any checks attached to the original union.

This keeps the provider responsible only for reporting what exists. Schema remains responsible for deciding whether the loaded representation is valid.

Plain `Schema.Array` and `Schema.Record` accept structural provider input only. Use `Config.Array(Schema.String, "items")` for separated scalar input such as `"a,b,c"`, and `Config.Record(Schema.String, Schema.String, "items")` for input such as `"a=1,b=2"`. Both constructors also accept structural input.

The canonical `StringTree` encoding must expose a concrete scalar, object, array, or union shape. `Config.schema` rejects opaque encodings such as `Schema.Any`, `Schema.Unknown`, `Schema.ObjectKeyword`, `Schema.Json`, and `Schema.MutableJson` synchronously when the config is constructed, including when they are nested in another schema. Suspended recursive schemas and declarations such as `Schema.URL` remain supported when their eventual canonical encoding has a concrete shape. To read arbitrary JSON from one scalar provider value, use `Schema.fromJsonString(Schema.Json)`.

### Custom Config Logic

There is no public low-level `Config.make` constructor. For custom validation or transformation, start from one of the public constructors or `Config.schema`, then use `Config.map`, `Config.mapEffect`, `Config.all`, `Config.orElse`, or `Config.withDefault`.

If you need custom lookup behavior for a new backing source, implement a `ConfigProvider` with `ConfigProvider.make` instead.

## Array and Record Constructors

`Config.Array` accepts `{ separator? }`, while `Config.Record` accepts `{ separator?, keyValueSeparator? }`. Pass the options object directly to read the provider root, or place a string or `ConfigProvider.Path` before it to select a path:

```ts
import { Config, Schema } from "effect"

const rootValues = Config.Array(Schema.String, { separator: ";" })
const namedValues = Config.Array(Schema.String, "VALUES", { separator: ";" })

const rootHeaders = Config.Record(Schema.String, Schema.String, { keyValueSeparator: ":" })
const namedHeaders = Config.Record(Schema.String, Schema.String, "HEADERS", { keyValueSeparator: ":" })
```

## ConfigProvider Sources

The concrete built-in source providers `fromEnv`, `fromDotEnvContents`, `fromDotEnv`, `fromUnknown`, and `fromDir` treat literal empty strings as missing values by default when they are loaded as values. Container discovery still reflects the source structure, so a key or file can appear in a `Record` or `Array` node and then load as missing. Pass `{ preserveEmptyStrings: true }` to preserve empty strings as explicit values.

At the raw provider interface, `load(path)` succeeds with `Node | undefined`: a
`Node` means the path exists, while `undefined` means it does not. A
`SourceError` represents a failure to read the source and remains in the Effect
error channel.

Lookup-level `undefined` is distinct from the `value` field of a found `Record`
or `Array` node. Such a container can exist while
`node.value === undefined`, which means that it has children but no co-located
scalar value.

### `ConfigProvider.fromEnv` — Environment Variables (Default)

This is the default provider. Path segments are joined with `_` for lookup.

```ts
import { Config, ConfigProvider, Effect } from "effect"

const provider = ConfigProvider.fromEnv({
  env: {
    DATABASE_HOST: "localhost",
    DATABASE_PORT: "5432"
  }
})

const host = Config.String("HOST").parse(
  provider.pipe(ConfigProvider.nested("DATABASE"))
)

Effect.runSync(host) // "localhost"
```

**How `_` splitting works**: env var names are split on `_` to build a tree. This means `DATABASE_HOST=localhost` is accessible at both `["DATABASE_HOST"]` (flat) and `["DATABASE", "HOST"]` (nested). Querying `["DATABASE"]` returns a Record node with child key `"HOST"`.

Pass `{ env: { ... } }` for testing. Omit to use `process.env` (merged with `import.meta.env` when available).

### `ConfigProvider.fromUnknown` — Plain JS Objects

Ideal for testing or embedding config in code:

```ts
import { Config, ConfigProvider, Effect } from "effect"

const provider = ConfigProvider.fromUnknown({
  database: {
    host: "localhost",
    port: 5432,
    credentials: {
      username: "admin",
      password: "secret"
    }
  },
  servers: ["server1", "server2", "server3"]
})
```

Path traversal follows standard JS rules: string segments index into object keys, numeric segments index into arrays. Primitive values are automatically stringified.

### `ConfigProvider.fromDotEnvContents` — Parse `.env` Strings

When you already have the `.env` content as a string:

```ts
import { ConfigProvider } from "effect"

const contents = `
# Database settings
HOST=localhost
PORT=3000
SECRET="my-secret-value"
`

const provider = ConfigProvider.fromDotEnvContents(contents)
```

Supports `export` prefixes, single/double/backtick quoting, inline comments, and escaped newlines. Enable variable expansion with `{ expandVariables: true }`:

```ts
import { ConfigProvider } from "effect"

const contents = `
PASSWORD=secret
DB_PASS=$PASSWORD
`

const provider = ConfigProvider.fromDotEnvContents(contents, {
  expandVariables: true
})
```

### `ConfigProvider.fromDotEnv` — Load `.env` Files

Reads a `.env` file from disk. Returns an `Effect` (requires `FileSystem` in context):

```ts
import { ConfigProvider, Effect } from "effect"

const program = Effect.gen(function*() {
  const provider = yield* ConfigProvider.fromDotEnv()
  // or: yield* ConfigProvider.fromDotEnv({ path: "/custom/.env" })
  return provider
})
```

### `ConfigProvider.fromDir` — Directory Trees

Reads config from a file-system tree where each file is a leaf and each directory is a container. Useful for Kubernetes ConfigMap/Secret volume mounts.

```
/etc/myapp/
  database/
    host       # contains "localhost"
    port       # contains "5432"
  api_key      # contains "sk-abc123"
```

```ts
import { ConfigProvider, Effect } from "effect"

const program = Effect.gen(function*() {
  const provider = yield* ConfigProvider.fromDir({
    rootPath: "/etc/myapp"
  })
  return provider
})
```

Requires `Path` and `FileSystem` in the Effect context.

Missing files and directories return `undefined`, so fallback providers can handle the path. Empty files also return `undefined` by default after trimming their contents, while directory listings still report the file names present on disk; pass `{ preserveEmptyStrings: true }` to preserve them as `Value("")`. Other file-system failures are reported as `SourceError`.

### `ConfigProvider.make` — Custom Sources

Build a provider from any backing store:

```ts
import { ConfigProvider, Effect } from "effect"

const data: Record<string, string> = {
  host: "localhost",
  port: "5432"
}

const provider = ConfigProvider.make((path) => {
  const key = path.join(".")
  const value = data[key]
  return Effect.succeed(
    value !== undefined ? ConfigProvider.makeValue(value) : undefined
  )
})
```

Return `undefined` for "not found" and a `Node` for a path that exists. Only
fail with `SourceError` when the source itself cannot be read. Providers created
with `make` automatically support the path-transformation behavior used by
`mapInput`, `constantCase`, and `nested`.

## ConfigProvider Combinators

### `ConfigProvider.orElse` — Fallback Sources

Falls back to a second provider when the first returns `undefined` (path not found). Does **not** catch `SourceError`.

```ts
import { ConfigProvider } from "effect"

const envProvider = ConfigProvider.fromEnv({
  env: { HOST: "prod.example.com" }
})
const defaults = ConfigProvider.fromUnknown({
  HOST: "localhost",
  PORT: "3000"
})

const combined = ConfigProvider.orElse(envProvider, defaults)
```

Each side keeps its own path transformations. If you combine providers that were already scoped or mapped, those transformations remain local to that side:

```ts
import { ConfigProvider } from "effect"

const envProvider = ConfigProvider.fromEnv({
  env: { DATABASE_HOST: "localhost" }
}).pipe(ConfigProvider.constantCase)

const defaults = ConfigProvider.fromEnv({
  env: { APP_PORT: "3000" }
}).pipe(ConfigProvider.nested("APP"))

const combined = envProvider.pipe(ConfigProvider.orElse(defaults))
```

### `ConfigProvider.nested` — Prefix All Lookups

Prepends path segments so that all lookups are scoped:

```ts
import { ConfigProvider } from "effect"

const provider = ConfigProvider.fromEnv({
  env: { APP_HOST: "localhost", APP_PORT: "3000" }
})

// Lookups for ["HOST"] now resolve to ["APP", "HOST"]
const scoped = ConfigProvider.nested(provider, "APP")
```

Accepts a single string or a full `Path` array.

Provider transformations compose in application order. A later `nested` becomes the outer prefix:

```ts
import { ConfigProvider } from "effect"

const provider = ConfigProvider.fromEnv({
  env: { B_A_KEY: "value" }
}).pipe(
  ConfigProvider.nested("A"),
  ConfigProvider.nested("B")
)

// path ["KEY"] resolves to ["B", "A", "KEY"]
```

When `nested` is applied to a provider built with `ConfigProvider.orElse`, the prefix is applied to both operands.

### `ConfigProvider.constantCase` — CamelCase to SCREAMING_SNAKE_CASE

Bridges camelCase schema keys to environment variable naming:

```ts
import { ConfigProvider } from "effect"

const provider = ConfigProvider.fromEnv({
  env: { DATABASE_HOST: "localhost" }
}).pipe(ConfigProvider.constantCase)

// path ["databaseHost"] now resolves to ["DATABASE_HOST"]
```

Ordering matters with `nested`. `constantCase` is a path transform, so it only converts the path it receives at that point in the pipeline:

```ts
import { ConfigProvider } from "effect"

const convertedPrefix = ConfigProvider.fromEnv({
  env: { APP_HOST: "localhost" }
}).pipe(
  ConfigProvider.nested("app"),
  ConfigProvider.constantCase
)

// path ["host"] resolves to ["APP", "HOST"]

const literalPrefix = ConfigProvider.fromEnv({
  env: { app_HOST: "localhost" }
}).pipe(
  ConfigProvider.constantCase,
  ConfigProvider.nested("app")
)

// path ["host"] resolves to ["app", "HOST"]
```

Put `constantCase` after `nested` when the prefix should be converted too.

### `ConfigProvider.mapInput` — Arbitrary Path Transforms

Transform the whole path before lookup:

```ts
import { ConfigProvider } from "effect"

const provider = ConfigProvider.fromEnv({
  env: { APP_HOST: "localhost" }
})

const upper = ConfigProvider.mapInput(
  provider,
  (path) => path.map((seg) => typeof seg === "string" ? seg.toUpperCase() : seg)
)
```

Path transformation is a capability of the `ConfigProvider` interface. The
exported `ConfigProvider.mapInput` combinator delegates to that capability,
rather than passing an extra transformation argument to `load`. This keeps
ordinary lookup fixed as `load(path)` and allows composite providers to
preserve their own behavior without exposing representation state. Custom
source providers should normally be constructed with `ConfigProvider.make`,
which implements this capability automatically.

`mapInput` runs after earlier provider transformations, so it sees the full path produced so far:

```ts
import { ConfigProvider } from "effect"

const appendLeaf = ConfigProvider.mapInput((path) => [...path, "leaf"])

const provider = ConfigProvider.fromEnv({
  env: { APP_KEY_leaf: "value" }
}).pipe(
  ConfigProvider.nested("APP"),
  appendLeaf
)

// path ["KEY"] resolves to ["APP", "KEY", "leaf"]
```

When `mapInput` is applied to a provider built with `ConfigProvider.orElse`, the mapping is applied to both operands.

## Installing a Provider

### Using `ConfigProvider.layer`

Replaces the active provider for all downstream effects:

```ts
import { Config, ConfigProvider, Effect } from "effect"

const TestLayer = ConfigProvider.layer(
  ConfigProvider.fromUnknown({ port: 8080 })
)

const program = Effect.gen(function*() {
  const port = yield* Config.Int("port")
  return port
})

Effect.runSync(Effect.provide(program, TestLayer)) // 8080
```

### Using `ConfigProvider.layerAdd`

Adds a provider without replacing the existing one. By default, the new provider is a **fallback**:

```ts
import { ConfigProvider } from "effect"

const defaults = ConfigProvider.fromUnknown({
  HOST: "localhost",
  PORT: "3000"
})

// process.env is tried first; `defaults` is the fallback
const DefaultsLayer = ConfigProvider.layerAdd(defaults)
```

Set `{ asPrimary: true }` to make the new provider the primary source instead.

### Using `Effect.provideService`

For one-off overrides without layers:

```ts
import { Config, ConfigProvider, Effect } from "effect"

const provider = ConfigProvider.fromUnknown({ HOST: "localhost" })

const program = Effect.gen(function*() {
  const host = yield* Config.String("HOST")
  return host
}).pipe(
  Effect.provideService(ConfigProvider.ConfigProvider, provider)
)
```

## Two Ways to Run a Config

1. **Yield in `Effect.gen`** — automatically uses the current `ConfigProvider` from the service map:

   ```ts
   const program = Effect.gen(function*() {
     const host = yield* Config.String("HOST")
   })
   ```

2. **Call `.parse(provider)` directly** — useful for testing or when you have a specific provider:

   ```ts
   const host = Config.String("HOST")
   const result = Effect.runSync(host.parse(provider))
   ```

   The method accepts only the provider. Use `Config.nested` or the path argument of `Config.schema` to scope lookups.

## Error Handling

Config operations fail with `ConfigError`, which wraps either:

- **`SourceError`** — the provider could not read data (I/O failure, permission error). Has `message` and optional `cause` properties.
- **`SchemaError`** — data was found but didn't match the schema (wrong type, out of range, missing key).

Check `error.cause._tag` to distinguish:

```ts
import { Config, ConfigProvider, Effect } from "effect"

const program = Config.Int("PORT").parse(
  ConfigProvider.fromUnknown({ PORT: "not-a-number" })
).pipe(
  Effect.tapError((error) =>
    Effect.sync(() => {
      if (error.cause._tag === "SchemaError") {
        console.log("Validation failed:", error.message)
      } else {
        console.log("Source error:", error.message)
      }
    })
  )
)
```

**Important**: `Config.withDefault` and `Config.option` recover only from semantic absence. They do not classify `SchemaIssue` values as “missing.” Validation and source errors still propagate unless explicitly recovered with `Config.orElse`.

## Practical Example: Web Server Config

```ts
import { Config, ConfigProvider, Effect, Schema } from "effect"

// Define your config shape
const ServerConfig = Config.schema(
  Schema.Struct({
    host: Schema.String,
    port: Schema.Int,
    logLevel: Schema.Literals(["debug", "info", "warn", "error"])
  }),
  "server"
)

const DbConfig = Config.schema(
  Schema.Struct({
    url: Schema.String,
    poolSize: Schema.Int
  }),
  "db"
)

const AppConfig = Config.all({
  server: ServerConfig,
  db: DbConfig,
  debug: Config.Boolean("debug").pipe(Config.withDefault(false))
})

// In production, just yield it — reads from process.env
const program = Effect.gen(function*() {
  const config = yield* AppConfig
  console.log(config)
})

// For testing, provide a specific provider
const testProvider = ConfigProvider.fromUnknown({
  server: { host: "localhost", port: 3000, logLevel: "debug" },
  db: { url: "postgres://localhost/testdb", poolSize: 5 },
  debug: true
})

Effect.runSync(
  program.pipe(Effect.provide(ConfigProvider.layer(testProvider)))
)
```

With environment variables, the same config reads:

```
server_host=localhost
server_port=3000
server_logLevel=debug
db_url=postgres://localhost/mydb
db_poolSize=10
debug=true
```
