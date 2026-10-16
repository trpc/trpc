# Effect library documentation

This documentation covers the Effect library and its related packages.

When you need to find information about Effect, use this documentation and the
Effect source code available in your environment. Avoid unrelated copies of
Effect or external documentation, as they may be outdated or incorrect.

**Note**: The examples in this documentation contain comments for illustration
purposes. In practice, you would not include these comments in your code.

## Writing `Effect` code

Prefer `Effect.gen` for inline Effect code. For reusable functions, prefer
`Effect.fn("name")` when tracing is useful and `Effect.fnUntraced` when it is not,
particularly in library implementations and hot paths. Avoid functions that only
wrap and return `Effect.gen`. Attach additional behaviour with combinators; this
style is more readable and easier to maintain than using combinators alone.

### Using Effect.gen

Use `Effect.gen` to write code in an imperative style similar to async await.
You can use `yield*` to access the result of an effect.

```ts
import { Effect, Schema } from "effect"

Effect.gen(function*() {
  yield* Effect.log("Starting the file processing...")
  yield* Effect.log("Reading file...")

  // Always return when raising an error, to ensure typescript understands that
  // the function will not continue executing.
  return yield* new FileProcessingError({ message: "Failed to read the file" })
}).pipe(
  // Add additional functionality with .pipe
  Effect.catch((error) => Effect.logError(`An error occurred: ${error}`)),
  Effect.withSpan("fileProcessing", {
    attributes: {
      method: "Effect.gen"
    }
  })
)

// Use Schema.TaggedError to define a custom error
export class FileProcessingError extends Schema.TaggedError<FileProcessingError>()("FileProcessingError", {
  message: Schema.String
}) {}
```

### Using Effect.fn and Effect.fnUntraced

When writing reusable functions that return an Effect, use `Effect.fn` or
`Effect.fnUntraced` to use the generator syntax.

Use `Effect.fn("name")` when the function should create a tracing span. Prefer
`Effect.fnUntraced` when tracing is not needed, particularly for library
implementations and hot paths.

**Avoid creating functions that only wrap and return an `Effect.gen`**.

```ts
import { Effect, Schema } from "effect"

// Pass a string to Effect.fn, which will improve stack traces and also
// attach a tracing span (using Effect.withSpan behind the scenes).
//
// The name string should match the function name.
//
export const effectFunction = Effect.fn("effectFunction")(
  // You can use `Effect.fn.Return` to specify the return type of the function.
  // It accepts the same type parameters as `Effect.Effect`.
  function*(n: number): Effect.fn.Return<string, SomeError> {
    yield* Effect.logInfo("Received number:", n)

    // Always return when raising an error, to ensure typescript understands that
    // the function will not continue executing.
    return yield* new SomeError({ message: "Failed to read the file" })
  },
  // Add additional functionality by passing in additional arguments.
  // **Do not** use .pipe with Effect.fn
  Effect.catch((error) => Effect.logError(`An error occurred: ${error}`)),
  Effect.annotateLogs({
    method: "effectFunction"
  })
)

// Effect.fnUntraced avoids tracing and stack-frame capture while still reusing
// the generator body. This is preferred for library functions that do not
// represent a useful tracing boundary.
export const validateBatchSize = Effect.fnUntraced(function*(size: number): Effect.fn.Return<number, SomeError> {
  if (!Number.isInteger(size) || size <= 0) {
    return yield* new SomeError({ message: "Batch size must be a positive integer" })
  }
  return size
})

// Use Schema.TaggedError to define a custom error
export class SomeError extends Schema.TaggedError<SomeError>()("SomeError", {
  message: Schema.String
}) {}
```

### More examples

- **[Creating effects from common sources](./ai-docs/src/01_effect/01_basics/10_creating-effects.ts)**:
  Learn how to create effects from various sources, including plain values,
  synchronous code, Promise APIs, optional values, and callback-based APIs.

## Defining schemas and domain models

All validation and domain modeling in Effect is done with `Schema`.

**AVOID using predicates or manual parsing**, instead use `Schema` to parse untrusted data and validate it.

For a comprehensive guide, see [SCHEMA.md](https://github.com/Effect-TS/effect/blob/main/packages/effect/SCHEMA.md). Make sure to read the guide in chunks, as it is a large document.

- **[Schema basics](./ai-docs/src/01_effect/02_schema/10_schema-basics.ts)**:
  Define `Schema.Class`s, decode unknown input into typed values, and
  encode typed values back into their external representation.

## Writing Effect services

Effect services are the most common way to structure Effect code. Prefer using
services to encapsulate behaviour over other approaches, as it ensures that your
code is modular, testable, and maintainable.

### Context.Service

The default way to define a service is to extend `Context.Service`,
passing in the service interface as a type parameter.

```ts
// file: src/db/Database.ts
import { Context, Effect, Layer, Schema } from "effect"

// Pass in the service class name as the first type parameter, and the service
// interface as the second type parameter.
export class Database extends Context.Service<Database, {
  query(sql: string): Effect.Effect<Array<unknown>, DatabaseError>
}>()(
  // The string identifier for the service, which should include the package
  // name and the subdirectory path to the service file.
  "myapp/db/Database"
) {
  // Attach a static layer to the service, which will be used to provide an
  // implementation of the service.
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function*() {
      // Define the service methods using Effect.fn
      const query = Effect.fn("Database.query")(function*(sql: string) {
        yield* Effect.log("Executing SQL query:", sql)
        return [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]
      })

      // Return an instance of the service using Database.of, passing in an
      // object that implements the service interface.
      return Database.of({
        query
      })
    })
  )
}

export class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  cause: Schema.Defect()
}) {}

// If you ever need to access the service type, use `Database["Service"]`
export type DatabaseService = Database["Service"]
```

### More examples

- **[Context.Reference](./ai-docs/src/01_effect/03_services/10_reference.ts)**: For defining configuration values, feature flags, or any other service that has a default value.
- **[Composing services with the Layer module](./ai-docs/src/01_effect/03_services/20_layer-composition.ts)**:
  Build focused service layers, then compose them with `Layer.provide` and
  `Layer.provideMerge` based on what services you want to expose.
- **[Creating Layers from configuration and/or Effects](./ai-docs/src/01_effect/03_services/20_layer-unwrap.ts)**: Build a layer dynamically from an Effect / Config with `Layer.unwrap`.

## Error handling

### Error handling basics

Defining custom errors and handling them with Effect.catch and Effect.catchTag.

```ts
import { Effect, Schema } from "effect"

// Define custom errors using Schema.TaggedError
export class ParseError extends Schema.TaggedError<ParseError>()("ParseError", {
  input: Schema.String,
  message: Schema.String
}) {}

export class ReservedPortError extends Schema.TaggedError<ReservedPortError>()("ReservedPortError", {
  port: Schema.Int
}) {}

declare const loadPort: (input: string) => Effect.Effect<number, ParseError | ReservedPortError>

export const recovered = loadPort("80").pipe(
  // Catch multiple errors with Effect.catchTag, and return a default port number.
  Effect.catchTag(["ParseError", "ReservedPortError"], (_) => Effect.succeed(3000))
)

export const withFinalFallback = loadPort("invalid").pipe(
  // Catch a specific error with Effect.catchTag
  Effect.catchTag("ReservedPortError", (_) => Effect.succeed(3000)),
  // Catch all errors with Effect.catch
  Effect.catch((_) => Effect.succeed(3000))
)
```

### More examples

- **[Catch multiple errors with Effect.catchTags](./ai-docs/src/01_effect/04_errors/10_catch-tags.ts)**: Use `Effect.catchTags` to handle several tagged errors in one place.
- **[Creating and handling errors with reasons](./ai-docs/src/01_effect/04_errors/20_reason-errors.ts)**:
  Define a tagged error with a tagged `reason` field, then recover with
  `Effect.catchReason`, `Effect.catchReasons`, or by unwrapping the reason into
  the error channel with `Effect.unwrapReason`.

## Managing resources and `Scope`s

Learn how to safely manage resources in Effect using `Scope`s and finalizers.

- **[Acquiring resources with Effect.acquireRelease](./ai-docs/src/01_effect/05_resources/10_acquire-release.ts)**:
  Define a service that uses `Effect.acquireRelease` to manage the lifecycle of
  a resource, ensuring that it is properly cleaned up when the service is no
  longer needed.
- **[Creating Layers that run background tasks](./ai-docs/src/01_effect/05_resources/20_layer-side-effects.ts)**: Use Layer.effectDiscard to encapsulate background tasks without a service interface.
- **[Dynamic resources with LayerMap](./ai-docs/src/01_effect/05_resources/30_layer-map.ts)**:
  Use `LayerMap.Service` to dynamically build and manage resources that are
  keyed by some identifier, such as a tenant ID.

## Running Effect programs

- **[Running effects with NodeRuntime and BunRuntime](./ai-docs/src/01_effect/06_running/10_run-main.ts)**: Use `NodeRuntime.runMain` to run an Effect program as your process entrypoint.
- **[Using Layer.launch as the application entry point](./ai-docs/src/01_effect/06_running/20_layer-launch.ts)**: Use `Layer.launch` to run a long-running Effect program as your process entrypoint.

## Broadcasting messages with PubSub

Use `PubSub` when you need one producer to fan out messages to many consumers.

- **[Broadcasting domain events with PubSub](./ai-docs/src/01_effect/07_pubsub/10_pubsub.ts)**: Build an in-process event bus with `PubSub` and expose it as a service.

## Working with Streams

Effect Streams represent effectful, pull-based sequences of values over time.
They let you model finite or infinite data sources.

- **[Creating streams from common data sources](./ai-docs/src/03_stream/10_creating-streams.ts)**:
  Learn how to create streams from various data sources. Includes:
  
  - `Stream.fromIterable` for arrays and other iterables
  - `Stream.fromEffectSchedule` for polling effects
  - `Stream.paginate` for paginated APIs
  - `Stream.fromAsyncIterable` for async iterables
  - `Stream.fromEventListener` for DOM events
  - `Stream.callback` for any callback-based API
  - `NodeStream.fromReadable` for Node.js readable streams
- **[Consuming and transforming streams](./ai-docs/src/03_stream/20_consuming-streams.ts)**: How to transform and consume streams using operators like `map`, `flatMap`, `filter`, `mapEffect`, and various `run*` methods.
- **[Decoding and encoding streams](./ai-docs/src/03_stream/30_encoding.ts)**:
  Use `Stream.pipeThroughChannel` with the `Ndjson` and `SchemaBinary` modules to
  decode and encode streams of structured data.

## Integrating Effect into existing applications

`ManagedRuntime` bridges Effect programs with non-Effect code. Build one runtime
from your application Layer, then use it anywhere you need imperative execution,
like web handlers, framework hooks, worker queues, or legacy callback APIs.

- **[Using ManagedRuntime with Hono](./ai-docs/src/04_integration/10_managed-runtime.ts)**: Use `ManagedRuntime` to run Effect programs from external frameworks while keeping your domain logic in services and Layers.

## Batching external requests

Learn how to batch multiple requests into fewer external calls.

- **[Batching requests with RequestResolver](./ai-docs/src/05_batching/10_request-resolver.ts)**: Define request types with `Request.Class`, resolve them in batches with `RequestResolver`.

## Working with Schedules

Schedules define recurring patterns for retries, repeats and polling.

- **[Working with the Schedule module](./ai-docs/src/06_schedule/10_schedules.ts)**: Build schedules, compose them, and use them with `Effect.retry` and `Effect.repeat`.

## Working with DateTime

When working with dates and time, use the `DateTime` module instead of `Date` and `Date.now`.

Use it when your Effect programs need testable current time, safe parsing, stable ISO formatting, time-zone conversion, or calendar arithmetic.

- **[Creating and formatting DateTime values](./ai-docs/src/07_datetime/10_creating-and-formatting.ts)**:
  Parse incoming date values safely, use Clock-powered current time, and format
  instants for API payloads or user-facing labels.
- **[Working with time zones](./ai-docs/src/07_datetime/20_time-zones.ts)**:
  Attach IANA zones to instants, render zoned ISO strings, and provide a
  CurrentTimeZone service for code that should use the workspace/user zone.

## Observability

Effect has built-in support for structured logging, distributed tracing, and
metrics. For exporting telemetry, use the lightweight Otlp modules from
`effect/observability` in new projects, or use
`@effect/opentelemetry` NodeSdk when integrating with an existing OpenTelemetry
setup.

- **[Customizing logging](./ai-docs/src/08_observability/10_logging.ts)**: Configure loggers & log-level filtering for production applications.
- **[Setting up tracing with Otlp modules](./ai-docs/src/08_observability/20_otlp-tracing.ts)**: Configure Otlp tracing + log export with a reusable observability layer.

## Testing Effect programs

- **[Writing Effect tests with @effect/vitest](./ai-docs/src/09_testing/10_effect-tests.ts)**: Using `it.effect` for Effect-based tests.
- **[Testing services with shared layers](./ai-docs/src/09_testing/20_layer-tests.ts)**: How to test Effect services that depend on other services.

## Runtime type guards

The `Predicate` module contains small, reusable runtime checks.

**NEVER** write your own helper functions like `isRecord` or `isString`, instead
use the helpers from the `Predicate` module.

Predicates can be composed with apis such as `Predicate.and`,
`Predicate.or`, `Predicate.not`, and `Predicate.compose`.

### Using the Predicate module



```ts
import { Predicate } from "effect"

const thing: unknown = {
  a: 1
}

if (Predicate.isObject(thing)) {
  if (Predicate.isNumber(thing.a)) {
    console.log("number", thing.a)
  }
}
```

## Working with SQL databases

Use the `effect/sql` modules together with a driver package such as
`@effect/sql-sqlite-node` to access SQL databases. Define domain models with
`Model.Class` to derive schemas for the database and JSON boundaries, run
migrations, and write type-safe queries.

- **[Getting started with SQL](./ai-docs/src/40_sql/10_basics.ts)**:
  Define a schema-backed domain model, run migrations against a SQLite
  database, and expose a derived repository through a service.

## Effect HttpClient

Build http clients with the `HttpClient` module.

- **[Getting started with HttpClient](./ai-docs/src/50_http-client/10_basics.ts)**: Define a service that uses the HttpClient module to fetch data from an external API

## Building HttpApi servers

`HttpApi` gives you schema-first, type-safe HTTP APIs with runtime validation, typed clients, and OpenAPI docs from one definition.

- **[Getting started with HttpApi](./ai-docs/src/51_http-server/10_basics.ts)**:
  Define a schema-first API, implement handlers, secure endpoints with
  middleware, serve it over HTTP, and call it using a generated typed client.
- **[Testing HttpApi implementations](./ai-docs/src/51_http-server/20_testing.ts)**:
  Test handlers through an in-memory typed client with `HttpApiTest`, without
  starting an HTTP server or touching a real database.

## Working with child processes

Use the `effect/process` modules to define child processes and run them with `ChildProcessSpawner`.

- **[Working with child processes](./ai-docs/src/60_child-process/10_working-with-child-processes.ts)**: This example shows how to collect process output, compose pipelines, and stream long-running command output.

## Building CLI applications

Use the "effect/cli" modules to build CLI applications. These modules
provide utilities for parsing command-line arguments, handling user input, and
managing the flow of a CLI application.

- **[Getting started with Effect CLI modules](./ai-docs/src/70_cli/10_basics.ts)**:
  Build a command-line app with typed arguments and flags, then wire subcommand
  handlers into a single executable command.

## Working with AI modules

Effect's AI modules provide a provider-agnostic interface for language models.
You can generate text, decode structured objects with `Schema` and stream partial
responses.

- **[Using LanguageModel for text, objects, and streams](./ai-docs/src/71_ai/10_language-model.ts)**:
  Configure a provider once, then use `LanguageModel` for plain text
  generation, schema-validated object generation, and streaming responses.
- **[Defining and using AI tools](./ai-docs/src/71_ai/20_tools.ts)**:
  Define tools with schemas, group them into toolkits, implement handlers,
  and pass them to `LanguageModel.generateText`.
- **[Stateful chat sessions](./ai-docs/src/71_ai/30_chat.ts)**:
  The AI `Chat` module maintains conversation history automatically. Build
  AI agents or chat assistants.

## Building distributed applications with cluster

The cluster modules let you model stateful services as entities and distribute
them across multiple machines.

- **[Defining cluster entities](./ai-docs/src/80_cluster/10_entities.ts)**: Define distributed entity RPCs and run them in a cluster.