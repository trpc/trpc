# effect

## 4.0.1

### Patch Changes

- [#8603](https://github.com/Effect-TS/effect/pull/8603) [`ed2cc2f`](https://github.com/Effect-TS/effect/commit/ed2cc2f322dfd24da550c8d0ac811c3130b79d74) Thanks @danieljvdm! - Preserve all Anthropic system instructions and support configurable mid-conversation system messages. Add optional `LanguageModel.supportsSystemMessagesInHistory` to query support with scoped overrides.

- [#8680](https://github.com/Effect-TS/effect/pull/8680) [`58a2ee8`](https://github.com/Effect-TS/effect/commit/58a2ee8e0db8e0a90bae83c6cceeff6916772fee) Thanks @danieljvdm! - Cache per-tool response schemas and parameter-mode copies to reduce schema construction in `LanguageModel.generateText` and `LanguageModel.streamText`. The schema cache also applies to direct calls to `Response.Part`, `Response.StreamPart` and `Response.AllParts`.

- [#8719](https://github.com/Effect-TS/effect/pull/8719) [`bc44526`](https://github.com/Effect-TS/effect/commit/bc445262eeaaba6f7f28a154023a590e193e547d) Thanks @tim-smart! - Treat interruption as abandonment in `Effect.cached`, `Effect.cachedWithTTL`, `Effect.cachedInvalidateWithTTL`, `Cache`, `ScopedCache`, `RcRef`, `RcMap` and the cluster `ResourceMap`. Concurrent callers share one computation that is interrupted only after every caller has been interrupted, interrupted results are never cached, and a call made while an abandoned computation is still finalizing starts a fresh one.

- [#8734](https://github.com/Effect-TS/effect/pull/8734) [`073bb47`](https://github.com/Effect-TS/effect/commit/073bb475d1e84e09cdcd8303a4a558f2a73d8396) Thanks @pawelblaszczyk5! - Adjust `Effect.cachedInvalidateWithTTL` types to accept callbacks that select a TTL from the computation's `Exit`, including piped calls.

- [#8659](https://github.com/Effect-TS/effect/pull/8659) [`2ec021e`](https://github.com/Effect-TS/effect/commit/2ec021eff7fbd2206adc3e8bf4e803ed4bf07d6a) Thanks @samueleguino97! - Prevent entity registration when shard ownership is lost during construction. Pending requests retry on the new owner.

- [#8662](https://github.com/Effect-TS/effect/pull/8662) [`cad1118`](https://github.com/Effect-TS/effect/commit/cad111867a666cebe8ff9bf2237a997fa6e4cb14) Thanks @tim-smart! - Avoid replaying suspended cluster workflows for unawaited deferred checkpoints while preserving interrupt wakes.

- [#8637](https://github.com/Effect-TS/effect/pull/8637) [`1672d9c`](https://github.com/Effect-TS/effect/commit/1672d9ca8da3e5b536bf7afb73365cccc6c01f53) Thanks @tim-smart! - Fix cluster defect recovery to replay unfinished requests without duplicating requests awaiting their first dispatch. Stop replay and interrupt waiting requests on shutdown, and prevent superseded rebuilds from publishing stale handlers or SQL lock connections.

- [#8741](https://github.com/Effect-TS/effect/pull/8741) [`a81e4e6`](https://github.com/Effect-TS/effect/commit/a81e4e6cb3dfbf01b1c53c1c877fddeaced8a278) Thanks @tim-smart! - Prevent PostgreSQL deadlocks between cluster message claims and shard or address resets by locking reset rows in message order.

- [#8707](https://github.com/Effect-TS/effect/pull/8707) [`f5c2a91`](https://github.com/Effect-TS/effect/commit/f5c2a91621401a018b770446d35ef99806c5561f) Thanks @tim-smart! - Fix zoned DateTime conversion on runtimes that omit Intl fractional seconds, preserving milliseconds for pre-epoch timestamps.

- [#8629](https://github.com/Effect-TS/effect/pull/8629) [`498e72b`](https://github.com/Effect-TS/effect/commit/498e72ba14d0191d6bf66cc0e931c229a1ff442f) Thanks @tim-smart! - Preserve a fiber's `AsyncLocalStorage` context when another fiber wakes or interrupts it. Run `Effect.tryPromise` error handlers in the resumed fiber's context.

- [#8675](https://github.com/Effect-TS/effect/pull/8675) [`cabf123`](https://github.com/Effect-TS/effect/commit/cabf1230723e92684a4b0b836ccfde25c657f9f1) Thanks @IMax153! - Fix `HashRing.getShards` returning different shard assignments for the same nodes and weights after different add/remove histories. Sum weights in node-key order and break hash ties by node key. Assignments may change for fractional weights or hash ties.

- [#8706](https://github.com/Effect-TS/effect/pull/8706) [`a5b1d4e`](https://github.com/Effect-TS/effect/commit/a5b1d4e4cae01dbe30890d3796f846bda00ad2ae) Thanks @tim-smart! - Prevent HttpApiSchemaError from being reported as a server failure for invalid requests.

- [#8737](https://github.com/Effect-TS/effect/pull/8737) [`878cb33`](https://github.com/Effect-TS/effect/commit/878cb33f4f5f5a31d2c80a9ddb7d62a611230e1c) Thanks @tim-smart! - Log client-abort-only HTTP request causes as "Sent HTTP response" rather than an interrupt error, while preserving response status annotations and logging other causes.

- [#8685](https://github.com/Effect-TS/effect/pull/8685) [`5e6f756`](https://github.com/Effect-TS/effect/commit/5e6f7568a4c895eab3087249b191c5dcba5e73ef) Thanks @tim-smart! - Fix HttpTraceContext decoding of B3 debug and legacy sampling values, and reject all-zero W3C trace and parent IDs.

- [#8652](https://github.com/Effect-TS/effect/pull/8652) [`18dfb98`](https://github.com/Effect-TS/effect/commit/18dfb98cf6d2aeedbab8ef5734f9bc273a82d56e) Thanks @mikearnaldi! - Preserve pending interruptions when an uninterruptible effect fails. Drop typed failures when interruption skips recovery handlers, but keep defects.

- [#8657](https://github.com/Effect-TS/effect/pull/8657) [`04706ef`](https://github.com/Effect-TS/effect/commit/04706eff5da94b4d475b99eab8b0256bed97b080) Thanks @schickling-assistant! - Fix JSON Schema pattern importing for valid expressions whose RegExp source is canonicalized, including slashes, empty patterns, and literal line terminators.

- [#8723](https://github.com/Effect-TS/effect/pull/8723) [`f157482`](https://github.com/Effect-TS/effect/commit/f15748273a89afff4b05d5e6bec22c567c2a3cda) Thanks @serhii-indyrct! - Fix encoding optional MCP fields whose schemas decode to classes, such as `Implementation.icons`.

- [#8644](https://github.com/Effect-TS/effect/pull/8644) [`b5a2d4c`](https://github.com/Effect-TS/effect/commit/b5a2d4c1d62c9620a68d72b7f20248c69ef7663b) Thanks @sbking! - Prevent shard lock refreshes from releasing shards acquired while the refresh is in flight.

- [#8660](https://github.com/Effect-TS/effect/pull/8660) [`1c18c68`](https://github.com/Effect-TS/effect/commit/1c18c688df10b697c10283160dba143e049f3d50) Thanks @tim-smart! - Prevent singleton shard reassignment from durably cancelling outstanding RPC requests.

- [#8705](https://github.com/Effect-TS/effect/pull/8705) [`43416c4`](https://github.com/Effect-TS/effect/commit/43416c4142f973f4988440716eb54a498659cd3a) Thanks @tim-smart! - Honor If-Range in HttpStaticServer, returning the full file when the entity-tag is stale or weak instead of serving a partial response. Reject date validators because filesystem metadata cannot establish their strength.

- [#8704](https://github.com/Effect-TS/effect/pull/8704) [`d6ac8f9`](https://github.com/Effect-TS/effect/commit/d6ac8f923a33ff298a87f31230735e71d2d082e9) Thanks @tim-smart! - Fix `Stream.scan` to emit its initial state for empty streams.

- [#8698](https://github.com/Effect-TS/effect/pull/8698) [`1d9fb8c`](https://github.com/Effect-TS/effect/commit/1d9fb8c540a11326650baa0866a17951665189e7) Thanks @bishil06! - Fix accumulated rate drift in `Stream.throttle` with the `"shape"` strategy by retaining token debt after early wake-ups. Use monotonic time so wall clock changes do not affect throttling.

- [#8664](https://github.com/Effect-TS/effect/pull/8664) [`20dcd50`](https://github.com/Effect-TS/effect/commit/20dcd5060581077b46325a433f787ba10a56963d) Thanks @lloydrichards! - Preserve server and client extension capabilities in stateful MCP protocols.

- [#8653](https://github.com/Effect-TS/effect/pull/8653) [`42e5750`](https://github.com/Effect-TS/effect/commit/42e5750f7e2fbf349cfe45452d7cc9dce98d6fe9) Thanks @lloydrichards! - Keep idle MCP HTTP subscriptions open on Cloudflare Workers with SSE keepalives.

- [#8679](https://github.com/Effect-TS/effect/pull/8679) [`888e326`](https://github.com/Effect-TS/effect/commit/888e326a3180aea9b117fe7c97aace5dd527596e) Thanks @tim-smart! - Fix `Pool` usage TTL to expire only idle, unreserved excess items, oldest idle first. Measure idle time from the last release to avoid retiring recently used items.

- [#8648](https://github.com/Effect-TS/effect/pull/8648) [`0b52bb4`](https://github.com/Effect-TS/effect/commit/0b52bb42fac5aecb8bcb8d899293c641b62c3f66) Thanks @dv-waynehaffenden! - Fix `RpcClient` stream interruption leaving chunk delivery blocked on a full buffer and stalling the shared protocol receive loop.

- [#8627](https://github.com/Effect-TS/effect/pull/8627) [`e823e69`](https://github.com/Effect-TS/effect/commit/e823e693773aa163c0081af00a5236118446c6ae) Thanks @tim-smart! - Keep streaming RPC chunk decode failures local to the affected request and interrupt it on the server, without disconnecting unrelated requests.

- [#8658](https://github.com/Effect-TS/effect/pull/8658) [`962647b`](https://github.com/Effect-TS/effect/commit/962647b6a16000f882e6999f001c513a8cccc711) Thanks @tim-smart! - Fix `RpcClient` protocol errors incorrectly failing requests started synchronously by error handlers. Only requests pending when the error broadcast begins now receive that error; new requests remain pending for their own responses.

- [#8714](https://github.com/Effect-TS/effect/pull/8714) [`43fdcdc`](https://github.com/Effect-TS/effect/commit/43fdcdc6c81b6ad22d54061d6c6c45d9243d7c33) Thanks @jaideeppyne! - Fix RPC stdio shutdown to drain responses after stdin EOF.

- [#8618](https://github.com/Effect-TS/effect/pull/8618) [`1f89b8e`](https://github.com/Effect-TS/effect/commit/1f89b8ec64e6362da3eaaff8cbb235df88d3441c) Thanks @serhii-indyrct! - Set `ScopedCache` entry expiry before waking lookup waiters, so a zero-TTL result cannot be reused.

- [#8718](https://github.com/Effect-TS/effect/pull/8718) [`e1a521a`](https://github.com/Effect-TS/effect/commit/e1a521a6886a281abee016ff9aa57c3b172057c8) Thanks @juliusmarminge! - Pause schedules while `Stream.aggregateWithin`, `Stream.groupedWithin` and `Stream.aggregate` are idle. When a schedule ends, emit the current aggregation and drain sink leftovers without further upstream pulls.

## 4.0.0

### Patch Changes

- [#8580](https://github.com/Effect-TS/effect/pull/8580) [`cbfc7b4`](https://github.com/Effect-TS/effect/commit/cbfc7b422046111c439a69ecbce7fc4f4899789d) Thanks @gcanti! - Restrict `Schema.brand` to a single concrete identifier and require `Schema.fromBrand` to use the constructor's sole brand key. Apply `brand` or `fromBrand` repeatedly when composing distinct brands. For enum brand keys, pass the enum member instead of its string value.

- [#8601](https://github.com/Effect-TS/effect/pull/8601) [`5a81a6f`](https://github.com/Effect-TS/effect/commit/5a81a6f47521123a4075c6c221fb888d109778af) Thanks @RizgarOzan! - Prevent a stale `Atom.family` finalizer from evicting a newer cached atom.

- [#8576](https://github.com/Effect-TS/effect/pull/8576) [`68b6394`](https://github.com/Effect-TS/effect/commit/68b639473ff211b654b49b7b82183cafd225f4a3) Thanks @tim-smart! - Prevent stale concurrent workflow resumes from clearing a newer completed reply. Custom message storage implementations must honor the optional expected reply ID on `clearReplies` to provide this safety guarantee.

- [#8589](https://github.com/Effect-TS/effect/pull/8589) [`5250ca6`](https://github.com/Effect-TS/effect/commit/5250ca63c6f15152b4cdd36ef78b32ab06a0075e) Thanks @marek-hanzal! - Fix lost synchronous successes and failures in concurrent `Atom.fn` calls.

- [#8625](https://github.com/Effect-TS/effect/pull/8625) [`5f9c9d1`](https://github.com/Effect-TS/effect/commit/5f9c9d17c1a2d18e3217b251d28de0015bba02fd) Thanks @tim-smart! - Fix `MutableHashMap` retaining previously used equal object keys after they are replaced or removed, including when `Cache` and `ScopedCache` refresh entries on hits.

- [#8619](https://github.com/Effect-TS/effect/pull/8619) [`3278821`](https://github.com/Effect-TS/effect/commit/3278821a6490f7f76b30217115e921e1d3dc7f34) Thanks @tim-smart! - Keep `Queue.takeN` suspended when only part of its requested batch is available. Previously a single offer woke the batch taker in a synchronous retry loop that starved the host. `Queue.State.takers` now holds `Queue.Taker` entries: call `entry.resume(...)` instead of calling the entry as a function.

- [#8607](https://github.com/Effect-TS/effect/pull/8607) [`83429b4`](https://github.com/Effect-TS/effect/commit/83429b42023e79c29137381dc210a57bc0137ade) Thanks @mannyc2! - Interrupt losers in `Effect.race`, `Effect.raceFirst`, `Effect.raceAll` and `Effect.raceAllFirst` when the race settles or is interrupted while other effects are still starting.

- [#8626](https://github.com/Effect-TS/effect/pull/8626) [`0af6d0c`](https://github.com/Effect-TS/effect/commit/0af6d0c8ceaf08656f76bba41e5965bbf9a76bac) Thanks @tim-smart! - The `RpcMessage.ExitEncoded` interrupt `fiberId` type now admits the `null` emitted by JSON encoding. Consumers reading encoded interrupts should handle `null` alongside `undefined`.

- [#8614](https://github.com/Effect-TS/effect/pull/8614) [`927e01e`](https://github.com/Effect-TS/effect/commit/927e01e00579c14d446e15e077775e973d75f9a1) Thanks @gcanti! - Fix `SchemaRepresentation.toCodeDocument` to preserve the grouping of branded union types in generated TypeScript code.

- [#8617](https://github.com/Effect-TS/effect/pull/8617) [`10d8524`](https://github.com/Effect-TS/effect/commit/10d8524dc40fd06075f6a70f88d3a0cbd3477178) Thanks @gcanti! - Fix `Schema.toType` and `Schema.toEncoded` losing parent checks when projecting checked children without transformations. Suspended children remain opaque, and structural checks continue to be preserved.

- [#8583](https://github.com/Effect-TS/effect/pull/8583) [`35ac25a`](https://github.com/Effect-TS/effect/commit/35ac25a80bec4977a082af57a618d6a02bb41e25) Thanks @KhraksMamtsov! - `Array`, `Chunk`, `Effect`, and `Record` `partition`, their `separate` helpers, and `Option.partitionMap` now return successes before failures, matching `Stream.partition`. Swap the tuple when moving from the previous `[failures, successes]` order.

- [#8585](https://github.com/Effect-TS/effect/pull/8585) [`29e0aa7`](https://github.com/Effect-TS/effect/commit/29e0aa7dcc7735e207a687ba0f6a7ddebfe0996e) Thanks @roninjin10! - Preserve sibling and callback cleanup failures alongside interruption in concurrent `Effect.forEach` / `Effect.all`, including shared `Layer.build`.

- [#8593](https://github.com/Effect-TS/effect/pull/8593) [`8783536`](https://github.com/Effect-TS/effect/commit/878353689f69b555ad64f9dc14d4c66fd547360d) Thanks @tim-smart! - Fail in-flight RPC calls when a socket misses a pong, even with transient connection retries enabled. Missed pongs no longer invoke `onTransientError`; connection-open failures still do.

- [#8579](https://github.com/Effect-TS/effect/pull/8579) [`df77fff`](https://github.com/Effect-TS/effect/commit/df77fff9396fe31de72d1947ecb5b74f8cee89e1) Thanks @jasonkuhrt! - Fix union-of-tag inference for flat RPC clients and `AtomRpc.query` and `AtomRpc.mutation`. Payloads and results now reflect the selected RPCs instead of resolving to `never`.

- [#8628](https://github.com/Effect-TS/effect/pull/8628) [`ef7d77f`](https://github.com/Effect-TS/effect/commit/ef7d77f382dcb2a4f7648211ed6d674984a47c36) Thanks @gcanti! - Make `Schema.brand` type-only: brand identifiers are no longer stored in AST annotations or preserved by `SchemaRepresentation`. Reapply `Schema.brand` after rebuilding a representation when a branded TypeScript type is required; checks added by `Schema.fromBrand` remain preserved. Preserve the order of equal-priority union members that share an AST when deriving JSON and string-tree codecs.

- [#8597](https://github.com/Effect-TS/effect/pull/8597) [`035e369`](https://github.com/Effect-TS/effect/commit/035e369b3a30bcd840a7a78ccfb94d251bf931b7) Thanks @Ceereals! - Speed up JIT and AOT Schema decoding of transformations whose source has checks, such as a pattern-checked string decoded to a number. Fix compiled TemplateLiteral validation to enforce oneOf parts and preserve interpreter diagnostics when templates appear in transformation chains.

- [#8630](https://github.com/Effect-TS/effect/pull/8630) [`f72790c`](https://github.com/Effect-TS/effect/commit/f72790c618260bdfbf7a4e14d10abc2341d21e56) Thanks @gcanti! - Fix duplicate references in decoded and encoded schema representations when reusing schemas through optional or mutable keys.

- [#8555](https://github.com/Effect-TS/effect/pull/8555) [`aa19472`](https://github.com/Effect-TS/effect/commit/aa1947284cee5cec68d08df9c5b41fae8fe1aa8c) Thanks @front-depiction! - Resolve a Schema union's candidate parsers once per union instead of on every decode, so union decoding and encoding allocate less and run faster.

- [#8598](https://github.com/Effect-TS/effect/pull/8598) [`988c467`](https://github.com/Effect-TS/effect/commit/988c467afa90449b1d441c2db645eaec236763ac) Thanks @tim-smart! - Close server WebSockets with 1000 on success, 1001 on interruption, or 1011 on failure, while preserving explicit close codes. HTTP request scopes retain the handler's failure exit through response handling and middleware.

- [#8632](https://github.com/Effect-TS/effect/pull/8632) [`735b77b`](https://github.com/Effect-TS/effect/commit/735b77b65ca909ca6e41915f0d1366531c32142a) Thanks @gcanti! - Add `succeedEffect`, `failEffect`, and `verifyRoundTripEffect` to `TestSchema` so assertions can use the calling Effect's services, test clock, and interruption, and mark the module and its public APIs as unstable. Preserve defects and interruption when they occur alongside schema validation failures. Rename `verifyLosslessTransformation` to `verifyRoundTrip`; existing callers must update to the new name.

- [#8575](https://github.com/Effect-TS/effect/pull/8575) [`e5f7d12`](https://github.com/Effect-TS/effect/commit/e5f7d12af9abef188f7dc39b0207af1801b03ffd) Thanks @tim-smart! - Retry failed workflow run resets instead of acknowledging deferred completion before the run resumes.

- [#8633](https://github.com/Effect-TS/effect/pull/8633) [`2c552f2`](https://github.com/Effect-TS/effect/commit/2c552f220e09dd63d4a777db6cd20b9a13e732f4) Thanks @IMax153! - Effect 4.0 is the first stable release of Effect v4. It replaces the 4.0.0 beta and release-candidate series, whose per-release notes remain below under the `4.0.0-beta.*` and `4.0.0-rc.*` headings. To upgrade from Effect 3, follow the [migration guide](https://github.com/Effect-TS/effect/blob/main/MIGRATION.md).
  
  **Packaging and versioning**
  
  - All Effect packages share one version number and are released together. Use the same version of `effect` and every `@effect/*` package.
  - `@effect/platform`, `@effect/rpc`, `@effect/cluster`, `@effect/cli`, `@effect/ai`, `@effect/sql`, `@effect/workflow`, `@effect/experimental` and similar packages are merged into `effect`. Separate packages remain only for platforms (`@effect/platform-*`), SQL drivers (`@effect/sql-*`), AI providers (`@effect/ai-*`), framework bindings (`@effect/atom-*`), OpenTelemetry, Vitest and tooling.
  - Modules such as `effect/http`, `effect/http-api`, `effect/rpc`, `effect/cluster`, `effect/workflow`, `effect/ai`, `effect/cli`, `effect/sql` and `effect/schema` import from `effect/<area>`. APIs tagged `@stability unstable` may have breaking changes in minor releases. APIs without a stability tag follow semver.
  - APIs that expose a third-party dependency are tagged `@stability unstable`, because that dependency's releases can change them. This covers `NodeRedis`, `DenoRedis`, `BunRedis`, `@effect/platform-node/Undici` and the undici dispatcher APIs, the `ws` options and re-exports in the platform packages, driver-specific options and clients in `@effect/sql-clickhouse`, `@effect/sql-d1`, `@effect/sql-libsql`, `@effect/sql-mssql`, `@effect/sql-mysql2`, `@effect/sql-pglite` and `@effect/sql-sqlite-do`, the provider clients, models and generated schemas in the `@effect/ai-*` packages, `@effect/opentelemetry`, and the `vitest` re-export in `@effect/vitest`.
  - `effect` has no runtime dependencies.
  - New packages in v4: `@effect/platform-deno`, `@effect/sql-pglite`, `@effect/ai-openai-compat`, `@effect/ai-typesafe`, `@effect/atom-react`, `@effect/atom-solid`, `@effect/atom-vue`, `@effect/openapi-generator` and `@effect/doctest`. `@effect/docgen` now lives in this repository.
  
  **Core**
  
  - The fiber runtime was rewritten for lower memory use and faster execution, with smaller bundles and better tree-shaking.
  - Services are defined with `Context.Service`, `FiberRef` is replaced by `Context.Reference`, `Cause` has a flat structure, and many combinators were renamed. See the migration guide for the full list.
  - Software transactional memory is built into `Effect.tx`, with `TxRef`, `TxQueue`, `TxHashMap`, `TxPubSub`, `TxSemaphore` and related `Tx*` data types.
  - `Clock` separates wall-clock time from monotonic time.
  - New modules include `Semaphore`, `Latch`, `LayerRef`, `ErrorReporter`, `ByteSize`, `Newtype` and `Crypto`. `Arbitrary` is now a native property-based testing module and no longer depends on fast-check.
  
  **Schema**
  
  - Schema v4 is a new implementation with faster parsing, class-based schemas, `make` constructors on every schema, and effectful decoding with services.
  - `SchemaRepresentation` powers JSON Schema (Draft-04, Draft-07, 2020-12 and OpenAPI 3.0/3.1) import and export, TypeScript code generation, and AI structured output.
  - `SchemaBinary` provides a compact binary codec and is the default wire format for cluster transports.
  - Optional JIT and AOT schema compilers are available as experimental modules.
  
  **Platform, HTTP and RPC**
  
  - `HttpApi` supports typed response headers, streaming and SSE responses, the HTTP `QUERY` method, `HttpApiTest` for in-memory testing, and much faster type checking for large APIs.
  - The HTTP modules add static file serving, response compression, rate-limited clients and graceful server shutdown.
  - `Socket` has a pull-based reader with backpressure and STARTTLS support. Network addresses are modeled by `effect/net`.
  - RPC serialization is schema-aware and supports server-originated requests and notifications.
  - `@effect/platform-deno` adds full Deno support. The Node, Bun, Deno and browser packages all provide the platform `Crypto` service, and the browser package adds IndexedDB support.
  
  **Cluster and Workflow**
  
  - Workflows can be declared with class syntax, and `DurableQueue` and an in-memory `WorkflowEngine` are available.
  - Runner memory can be bounded with `ShardingConfig` limits. Shutdown, entity movement and persisted replies are more reliable.
  
  **SQL**
  
  - `@effect/sql-pg` uses a built-in PostgreSQL client with pipelining, prepared statements and binary codecs, and no longer depends on `pg`.
  - `@effect/sql-sqlite-node` uses Node's built-in `node:sqlite` and requires Node 22.16 or newer.
  - `SqlError` exposes structured reasons such as `UniqueViolation`.
  
  **AI**
  
  - `effect/ai` adds `EmbeddingModel`, the `DecisionModel` classification and rating API, dynamic tools and tool approvals.
  - The MCP server supports protocol versions 2024-11-05 through 2026-07-28, including elicitation, sampling with tools, resource subscriptions and typed tool output.
  - Provider packages cover Anthropic, OpenAI, OpenAI-compatible APIs and OpenRouter.
  
  **CLI, Atom, observability and testing**
  
  - `effect/cli` adds global flags, command aliases and examples, an interactive wizard mode, and shell completions for Bash, Zsh and Fish.
  - `effect/reactivity` and the `@effect/atom-*` bindings add SSR hydration, stale-while-revalidate atoms and serializable RPC and HttpApi queries.
  - The OTLP exporters can be configured with standard OpenTelemetry environment variables, and `@effect/opentelemetry` aligns logs and spans with the OpenTelemetry specification.
  - `@effect/vitest` runs property tests with the native `Arbitrary` module and supports Vitest fixtures.
  
  **Requirements**
  
  - TypeScript 5.9 or newer. TypeScript 7 is recommended.
  - `@effect/vitest` and `@effect/doctest` require Vitest 5.
  - `@effect/atom-react` requires React 19.
  - `@effect/platform-deno` requires Deno 2.8.3 or newer.

## 4.0.0-rc.118

### Patch Changes

- [#8367](https://github.com/Effect-TS/effect/pull/8367) [`f75468a`](https://github.com/Effect-TS/effect/commit/f75468a1358bdea7203344eecc818cc3370d45a1) Thanks @Marve10s! - Add `Arbitrary.configureGlobal` to set default options for property checking and sampling, including the run count used by `@effect/vitest`. Explicit per-call options take precedence; passing an empty object restores the built-in defaults.

- [#8543](https://github.com/Effect-TS/effect/pull/8543) [`34cc788`](https://github.com/Effect-TS/effect/commit/34cc78833df55bcc35b1f92603897aad36976b49) Thanks @front-depiction! - Fix missed updates through stale `AtomRegistry` nodes, premature dependency release, leaked superseded builds, and failed observed builds that never recover.

- [#8421](https://github.com/Effect-TS/effect/pull/8421) [`eb02cbb`](https://github.com/Effect-TS/effect/commit/eb02cbb3f4d1f4bf20e597fe8fc707892aa930e0) Thanks @danieljvdm! - Defer `Atom.swr` stale refreshes until after reads, skipping them if the source becomes fresh or the atom is disposed. One-shot unmounted reads no longer refresh stale sources after disposal.

- [#8534](https://github.com/Effect-TS/effect/pull/8534) [`4bb949e`](https://github.com/Effect-TS/effect/commit/4bb949e64f513b136f47e7e8ca6790fa0fe9aca9) Thanks @tim-smart! - Check identity authorization before resolving unencrypted event-log session bindings

- [#8353](https://github.com/Effect-TS/effect/pull/8353) [`b409e3f`](https://github.com/Effect-TS/effect/commit/b409e3f8f48a108620c2c9ba52512942dfcf7563) Thanks @tim-smart! - Make `Effect.awaitAllChildren` interruptible while it waits for child fibers.

- [#8510](https://github.com/Effect-TS/effect/pull/8510) [`4093507`](https://github.com/Effect-TS/effect/commit/4093507c667c8888d44920a0d742573b39c66723) Thanks @tim-smart! - Fix `Cache.get` retaining zero-TTL lookup results, which could evict live entries.

- [#8339](https://github.com/Effect-TS/effect/pull/8339) [`325e0fb`](https://github.com/Effect-TS/effect/commit/325e0fb66a69705decafacb781e6f9fb45f4f462) Thanks @tim-smart! - Add data-last forms for selected safe Queue operations and selected Option, TxSemaphore, and AsyncResult APIs

- [#8503](https://github.com/Effect-TS/effect/pull/8503) [`e54211a`](https://github.com/Effect-TS/effect/commit/e54211a57d067d941d499e24deb0cae8fb381ca1) Thanks @marbemac! - `Cause.pretty` and `Cause.prettyErrors` now restore `Error.stackTraceLimit` when formatting an error throws, instead of leaving it at `1` for the rest of the process.

- [#8413](https://github.com/Effect-TS/effect/pull/8413) [`0c6c2de`](https://github.com/Effect-TS/effect/commit/0c6c2dec861becef8ff6c240a60bf0a61254040a) Thanks @front-depiction! - `Cause.squash` no longer allocates intermediate arrays to pick the first failure or defect.

- [#8371](https://github.com/Effect-TS/effect/pull/8371) [`cdeccc7`](https://github.com/Effect-TS/effect/commit/cdeccc7e526ac386cfeb04107881642bcc9b320d) Thanks @front-depiction! - Fix asymmetric `Chunk.makeEquivalence` comparisons on sparse arrays. Avoid redundant copies in `Chunk` and `Array.dedupeWith`, and balance `Chunk.flatMap` concatenations.

- [#8504](https://github.com/Effect-TS/effect/pull/8504) [`254fcc1`](https://github.com/Effect-TS/effect/commit/254fcc1944574118ac32c57ca0298a715b558889) Thanks @IMax153! - Fix the CLI lexer to treat negative numbers such as `-3.70` as values instead of short options, so `--lon -3.70` parses correctly

- [#8474](https://github.com/Effect-TS/effect/pull/8474) [`bd14b64`](https://github.com/Effect-TS/effect/commit/bd14b6431a1eaf3619508beaaffd87e542c7ab03) Thanks @tim-smart! - `Scope.closeUnsafe` now requires a `Scope.Closeable`, matching `Scope.close`. Use a scope created by `Scope.make` or `Scope.fork`; a plain `Scope.Scope` cannot be closed directly.

- [#8473](https://github.com/Effect-TS/effect/pull/8473) [`37064fd`](https://github.com/Effect-TS/effect/commit/37064fdfc8fb7b6a765045e66b95f6106aef1955) Thanks @tim-smart! - `Scope.close` now requires a `Scope.Closeable`. Use a scope created by `Scope.make` or `Scope.fork`; a plain `Scope.Scope` cannot be closed directly.

- [#8542](https://github.com/Effect-TS/effect/pull/8542) [`702c34e`](https://github.com/Effect-TS/effect/commit/702c34e2af388d411d666fe3eb102fe9c7c11c78) Thanks @Marve10s! - Avoid retaining completed request ids when `MessageStorage` is disabled. Without storage, redelivering a completed request id now runs the request again instead of failing with `AlreadyProcessingMessage`.

- [#8454](https://github.com/Effect-TS/effect/pull/8454) [`7ef0ce6`](https://github.com/Effect-TS/effect/commit/7ef0ce6f4295ea6fab131ec8f4af9efd67d9cf1a) Thanks @front-depiction! - Delay copying a derived Context's base until it has been read at least as many times as its size (with a minimum of eight), avoiding full copies for short-lived contexts.

- [#8339](https://github.com/Effect-TS/effect/pull/8339) [`325e0fb`](https://github.com/Effect-TS/effect/commit/325e0fb66a69705decafacb781e6f9fb45f4f462) Thanks @tim-smart! - `TxPriorityQueue.fromIterable(order)(iterable)` passed its arguments to the implementation in the wrong order and produced a queue of `undefined` values; the data-first form was unaffected.

- [#8414](https://github.com/Effect-TS/effect/pull/8414) [`cdec5ef`](https://github.com/Effect-TS/effect/commit/cdec5efd02f6487f71bc1bdfc0ed8cf0ff2b49a1) Thanks @front-depiction! - Cache named time zones by the requested id as well as the Intl-resolved id, avoiding repeated formatter construction for aliases. Zones still report the Intl-resolved id.

- [#8386](https://github.com/Effect-TS/effect/pull/8386) [`f9179cb`](https://github.com/Effect-TS/effect/commit/f9179cba72cf2549574553e1e126669c71be52c0) Thanks @front-depiction! - Clean up rendered error stacks for common Effect callbacks and avoid per-step closure allocations in several combinators on V8.
  
  `Effect.flatMap` callbacks now receive only the value, without internal fiber/exit arguments or an internal `this` receiver.

- [#8442](https://github.com/Effect-TS/effect/pull/8442) [`c760e1e`](https://github.com/Effect-TS/effect/commit/c760e1e07497a658d971326152198b571fa5780e) Thanks @front-depiction! - Avoid allocating a closure context for each struct property and array element during sequential Schema traversal.

- [#8354](https://github.com/Effect-TS/effect/pull/8354) [`1b4461e`](https://github.com/Effect-TS/effect/commit/1b4461ec3a17e527dd39576f1783f73354187f1f) Thanks @tim-smart! - Move unstable modules from `effect/unstable/*` to `effect/*` and remove the old export paths. Drop the `unstable` segment from imports. These APIs remain `@stability unstable`.
  
  Move `Arbitrary` to the top level and update `@effect/vitest` to use the new entrypoint. Replace imports from `effect/arbitrary` or `effect/arbitrary/Arbitrary` with `import { Arbitrary } from "effect"` or `import * as Arbitrary from "effect/Arbitrary"`.

- [#8362](https://github.com/Effect-TS/effect/pull/8362) [`5709ef6`](https://github.com/Effect-TS/effect/commit/5709ef6c0375a4b0e028bfa288d6eb3f13d70d7b) Thanks @xia-chao! - Add type guards for `HttpBodyError`, `CookiesError`, `MultipartError`, and `NdjsonError`.

- [#8475](https://github.com/Effect-TS/effect/pull/8475) [`6b84149`](https://github.com/Effect-TS/effect/commit/6b84149622de85ba147e578da37ae4d996c1a683) Thanks @mugnivenko! - Annotate `Config.fail` return type as `Config<never>`, so it composes with `Config.orElse` without widening the result to `Config<unknown>`

- [#8469](https://github.com/Effect-TS/effect/pull/8469) [`508c70b`](https://github.com/Effect-TS/effect/commit/508c70be1379bbcf854d318604a992e0662122d6) Thanks @Marve10s! - Honor `startImmediately: false` in `FiberHandle.run`, `FiberMap.run`, and `FiberSet.run`.

- [#8443](https://github.com/Effect-TS/effect/pull/8443) [`382992f`](https://github.com/Effect-TS/effect/commit/382992f168d8187686010d6aa781f0d1fd48093a) Thanks @front-depiction! - Reduce the memory each fiber retains: the type brand now lives on the prototype, `Effect.callback` no longer binds its registration, and `Fiber.joinAll` no longer keeps a cancel closure per joined fiber.

- [#8427](https://github.com/Effect-TS/effect/pull/8427) [`83d7c95`](https://github.com/Effect-TS/effect/commit/83d7c954651fe6291c009f1d4198e796cad3b069) Thanks @front-depiction! - Preserve the original failure or interruption when an `onExit` finalizer throws synchronously.

- [#8535](https://github.com/Effect-TS/effect/pull/8535) [`6bf2eb7`](https://github.com/Effect-TS/effect/commit/6bf2eb76f0800d2e8ca402322023db6a32b1a899) Thanks @BleedingDev! - Build `FindMyWay` route params without `new Function`, avoiding string code generation in environments with CSP restrictions.

- [#8556](https://github.com/Effect-TS/effect/pull/8556) [`ccade14`](https://github.com/Effect-TS/effect/commit/ccade1492cdc6beb71f943d7605c2ef5208b155c) Thanks @Marve10s! - Process atom writes queued by batch commit listeners instead of dropping them.

- [#8150](https://github.com/Effect-TS/effect/pull/8150) [`b8d14d3`](https://github.com/Effect-TS/effect/commit/b8d14d3eed3cc15e939baa660e9800b96144a636) Thanks @Tyagiquamar! - Fix `Formatter.formatJson` to include `name` and `message` and preserve enumerable properties when stringifying `Error` instances without `toJSON`.
  
  ```ts
  import { Formatter } from "effect"
  
  Formatter.formatJson(new Error("boom")) // now `{"name":"Error","message":"boom"}`, previously `{}`
  ```

- [#8359](https://github.com/Effect-TS/effect/pull/8359) [`8fca194`](https://github.com/Effect-TS/effect/commit/8fca1947498e50dfa10480221290115a99cee05b) Thanks @gcanti! - Fix `Number.remainder` for decimal operands whose scaled coefficients exceed the safe integer range, preserving the exact value of integer operands. This also prevents `Schema.isMultipleOf` from accepting or rejecting large values incorrectly.

- [#8459](https://github.com/Effect-TS/effect/pull/8459) [`34e09be`](https://github.com/Effect-TS/effect/commit/34e09becb6b93b885bbdbc1da4780b7f848bd2d0) Thanks @gcanti! - Align JSON Schema imports with Unicode string semantics by counting code points for string length keywords and applying regular expression patterns in ECMAScript Unicode mode.

- [#8415](https://github.com/Effect-TS/effect/pull/8415) [`97afa37`](https://github.com/Effect-TS/effect/commit/97afa37ed03caba82fe3aec8e376ca8388450742) Thanks @front-depiction! - Reduce allocations in `Graph` traversals: `neighbors` / `successors` / `predecessors` deduplicate without an intermediate `Set` for typical degrees, and `unweightedDistances`, `astar` and `allShortestPaths` no longer allocate a closure or predecessor record per visited node or relaxation.

- [#8360](https://github.com/Effect-TS/effect/pull/8360) [`321bae6`](https://github.com/Effect-TS/effect/commit/321bae616dfafc17f89a5406919f52f8d133c4d1) Thanks @tim-smart! - Improve hash composition, number hashing, cyclic equality, native collection comparison, and `HashMap` hashing. Fix invalid caches and referential `MutableHashMap` lookups. Hash values may change.

- [#8572](https://github.com/Effect-TS/effect/pull/8572) [`fb718d3`](https://github.com/Effect-TS/effect/commit/fb718d3192acdcc6123daff69d150d040d911bf2) Thanks @tim-smart! - Add per-slot `HttpApi` parse options for params, query, headers, payload, success and error codecs. Each slot falls back to `ParseOptions` when unset. Set `HeadersParseOptions` to `{}` to keep strict body parsing without rejecting transport headers.

- [#8477](https://github.com/Effect-TS/effect/pull/8477) [`ccd3440`](https://github.com/Effect-TS/effect/commit/ccd344096340fd1cdb28a315a6eb3eaced82ccbc) Thanks @tim-smart! - Build each `HttpRouter` entrypoint with a fresh router in a forked layer memo map. Routes on separate servers and handlers no longer leak into each other.
  
  Breaking changes:
  
  - Routes registered on a router provided by the app itself (for example, via `Layer.provide(HttpRouter.layer)`) are not served; the entrypoint serves its own router. For RPC, put the protocol and its handlers in the app passed to `serve`, for example `HttpRouter.serve(RpcLayer.pipe(Layer.provideMerge(RpcServer.layerProtocolHttp({ path: "/rpc" }))))`.
  - Layers first built inside an entrypoint are private to it. Providing the same stateful service to both the app and a sibling layer can build it twice depending on build order. Provide services that must be shared outside the entrypoint; services already built in the parent memo map are reused.

- [#8385](https://github.com/Effect-TS/effect/pull/8385) [`107dbec`](https://github.com/Effect-TS/effect/commit/107dbecab1debe45baae97e50913c0b5d6d84bb5) Thanks @front-depiction! - Fix interrupted `Layer` memoization so waiting and later requesters receive the interrupted build's exit instead of hanging, and shared layers are released when scopes close. Correct `MemoMap.get` observer accounting for effects run twice or never run.

- [#8511](https://github.com/Effect-TS/effect/pull/8511) [`af510e8`](https://github.com/Effect-TS/effect/commit/af510e8197a486d53a0164a49ca4bf9276f6a19a) Thanks @tim-smart! - Skip `LayerMap` preloading for keys with a zero idle TTL. With the default TTL, preload failures now surface on first use; set a non-zero `idleTimeToLive` to retain eager validation.

- [#8453](https://github.com/Effect-TS/effect/pull/8453) [`537cd82`](https://github.com/Effect-TS/effect/commit/537cd821740036410494e7f420bbae5b84b7c0af) Thanks @front-depiction! - Reduce allocations per `yield*` in `Effect.gen`, `Option.gen` and `Result.gen`, and per `Effect.fn` call.
  
  `Utils.SingleShotGen` now serves as its own completion result and is no longer an `IterableIterator`: it only implements `next`, and its `self` field has been removed.

- [#8512](https://github.com/Effect-TS/effect/pull/8512) [`ff554ae`](https://github.com/Effect-TS/effect/commit/ff554aeb9b000882accc1c7027507e753aabf277) Thanks @tim-smart! - Run `Scope.close` finalizers uninterruptibly so interruption cannot abandon remaining cleanup, including when closing a `ManagedRuntime`.

- [#8528](https://github.com/Effect-TS/effect/pull/8528) [`9a5a383`](https://github.com/Effect-TS/effect/commit/9a5a383cc6526843fef645309f822400e053e772) Thanks @tim-smart! - Wait for managed fibers and their cleanup to finish before releasing layer resources when disposing a `ManagedRuntime`.

- [#8439](https://github.com/Effect-TS/effect/pull/8439) [`d2f3547`](https://github.com/Effect-TS/effect/commit/d2f35475610c59596eec2cd47fb58c65b85ef0c1) Thanks @front-depiction! - Stop allocating closures on every `Effect.match` and `Effect.matchCause` call.

- [#8507](https://github.com/Effect-TS/effect/pull/8507) [`25d9e47`](https://github.com/Effect-TS/effect/commit/25d9e47f0132e485af466a75e6008600b12da999) Thanks @IMax153! - Clarify the `McpServer.toolkit` error when a tool's parameters are not an object schema.

- [#8505](https://github.com/Effect-TS/effect/pull/8505) [`372a45d`](https://github.com/Effect-TS/effect/commit/372a45de59170e2ac982aaac0b5d173d3f84b0f8) Thanks @IMax153! - Fix stdio MCP servers rejecting pings before initialization when a stateful protocol is configured, including when a stateless protocol is listed first. These pings now return an empty result without creating a session.

- [#8508](https://github.com/Effect-TS/effect/pull/8508) [`5e9fd25`](https://github.com/Effect-TS/effect/commit/5e9fd25cbda46b0e035644fb94aa4a9c8851263d) Thanks @IMax153! - Report all parameter validation errors for MCP tools in a single response, including missing or invalid fields and, for strict tools, unknown keys.

- [#8465](https://github.com/Effect-TS/effect/pull/8465) [`c85c8c3`](https://github.com/Effect-TS/effect/commit/c85c8c31783afab69ac2aff791549bd438ec6015) Thanks @izakfilmalter! - Preserve tool annotation titles in MCP `tools/list` responses for the 2025-06-18 and 2025-11-25 protocol revisions, alongside the top-level title and behavioral hints.

- [#8552](https://github.com/Effect-TS/effect/pull/8552) [`b501557`](https://github.com/Effect-TS/effect/commit/b501557939d74c5fa6228c40011e9546c2af0fb2) Thanks @Floriferous! - Report declared MCP tool failures with empty messages using their encoded value. Handler execution errors now return `isError` results on protocol version 2025-11-25 and `-32603 Internal error` on older versions, instead of `-32602 Invalid params`.

- [#8380](https://github.com/Effect-TS/effect/pull/8380) [`35ef06c`](https://github.com/Effect-TS/effect/commit/35ef06c56dcf2debedbf72043d660980eeb73e83) Thanks @front-depiction! - Fix `Metric` series key collisions, duplicate series for empty attributes, and updates lost after a registry is cleared. Reuse series keys when contextual attributes are unchanged.

- [#8420](https://github.com/Effect-TS/effect/pull/8420) [`d6cc5d9`](https://github.com/Effect-TS/effect/commit/d6cc5d987011c10e42985dc692130511949838d1) Thanks @danieljvdm! - Emit parts buffered while reading a multipart file before pulling more input.

- [#8450](https://github.com/Effect-TS/effect/pull/8450) [`83b7b1f`](https://github.com/Effect-TS/effect/commit/83b7b1fc9124d23519cc5b8b74a42129c2ce59d9) Thanks @front-depiction! - Fix `MutableList.prependAll` with empty input corrupting the list and breaking subsequent takes or appends.

- [#8447](https://github.com/Effect-TS/effect/pull/8447) [`f05fe36`](https://github.com/Effect-TS/effect/commit/f05fe36f877b751d8602aa3fc5cb0c9501619167) Thanks @front-depiction! - Release consumed slots in a growing `MutableList` bucket, and pass list indices rather than bucket offsets to `MutableList.filter` predicates.

- [#8448](https://github.com/Effect-TS/effect/pull/8448) [`1fd49d4`](https://github.com/Effect-TS/effect/commit/1fd49d4e379effa86cbfa81650afa39ca28293f5) Thanks @front-depiction! - Fix `MutableList.takeN` leaving a drained bucket at the head when it stops at a bucket boundary. This also prevents `Queue.takeN` from making subsequent messages inaccessible after an `offerAll` boundary.

- [#8340](https://github.com/Effect-TS/effect/pull/8340) [`c79088d`](https://github.com/Effect-TS/effect/commit/c79088d69372ba533ecd6cacb846a43322c2d075) Thanks @fubhy! - Add family-aware internet address and multicast interface types to `NetAddress`

- [#8407](https://github.com/Effect-TS/effect/pull/8407) [`0cbb457`](https://github.com/Effect-TS/effect/commit/0cbb45792b59e9ea00e19001a019e790d53407e6) Thanks @tim-smart! - Store `NetAddress` IPv4 and IPv6 addresses as numbers instead of a `Uint8Array`, making construction, `Equal` and `Hash` cheaper, especially on Deno.

- [#8545](https://github.com/Effect-TS/effect/pull/8545) [`8202a6e`](https://github.com/Effect-TS/effect/commit/8202a6ea410aa9a5a92988ad54f83b831a9737fe) Thanks @hsyntax! - Mark OpenAPI parameters and response headers as optional when their encoded key is optional, such as keys using `Schema.withDecodingDefaultKey` or `Schema.withDecodingDefault`. Generated documents previously marked these keys as required, even though they can be absent on the wire.

- [#8547](https://github.com/Effect-TS/effect/pull/8547) [`8d070c3`](https://github.com/Effect-TS/effect/commit/8d070c3eadc89bda58fec23977ba8ceebc244347) Thanks @gcanti! - Generate OpenAPI parameters and response headers from their encoded object representation while preserving property annotations.

- [#8551](https://github.com/Effect-TS/effect/pull/8551) [`0cf7655`](https://github.com/Effect-TS/effect/commit/0cf7655d1fe0ca959f34d261e345cc222fd8e5fd) Thanks @hsyntax! - Preserve encoded string literals and exportable checks such as `pattern` in OpenAPI schemas for `HttpApiSchema.asText()` bodies. Text bodies keep their string type even when their schemas are opaque or referenced components.

- [#8522](https://github.com/Effect-TS/effect/pull/8522) [`d470d54`](https://github.com/Effect-TS/effect/commit/d470d54495b9b7ac66375abd95e294417ebc64b9) Thanks @FNDEVVE! - Drain OTLP export response bodies before completing or retrying each request.

- [#8395](https://github.com/Effect-TS/effect/pull/8395) [`2121472`](https://github.com/Effect-TS/effect/commit/21214728d20b17b4b0497dac85bc9be5c8ed0bd3) Thanks @tim-smart! - Prevent lost permits when a partitioned semaphore acquisition is interrupted, and keep competing immediate takes from acquiring the same permit.

- [#8558](https://github.com/Effect-TS/effect/pull/8558) [`4113bc7`](https://github.com/Effect-TS/effect/commit/4113bc78eeed050b5833c9460d398cf8d8887e48) Thanks @fe-franco! - Fail `@effect/sql-pg` transactions when PostgreSQL returns `ROLLBACK` for `COMMIT` after a caught statement error. `SqlClient.make` accepts a commit effect so drivers can inspect the result.

- [#8468](https://github.com/Effect-TS/effect/pull/8468) [`a41a441`](https://github.com/Effect-TS/effect/commit/a41a4414d30a7f96aa8f17ec25039dd194718ef5) Thanks @lloydrichards! - In MCP protocols that omit string `structuredContent`, return plain text for toolkit and hand-written tool results whose single text block is an exact JSON mirror of that string.

- [#8337](https://github.com/Effect-TS/effect/pull/8337) [`3af6bd0`](https://github.com/Effect-TS/effect/commit/3af6bd0803ebdbc44b75ef82b16daa9a82ffa768) Thanks @mugnivenko! - Add PlatformError.isPlatformError guard

- [#8502](https://github.com/Effect-TS/effect/pull/8502) [`67ee3b8`](https://github.com/Effect-TS/effect/commit/67ee3b87f025089cc01631985ad7860b391d6ef3) Thanks @elizabethcheng! - Use a consistent row-lock order for PostgreSQL shard lease acquisition, refresh, and bulk release when `shardLockDisableAdvisory` is enabled.

- [#8540](https://github.com/Effect-TS/effect/pull/8540) [`e8df3d8`](https://github.com/Effect-TS/effect/commit/e8df3d8e7650ce272256559081ad91156826bf54) Thanks @Marve10s! - Treat an `Infinity` capacity passed to `PubSub` as unbounded.

- [#8345](https://github.com/Effect-TS/effect/pull/8345) [`1dbc4c3`](https://github.com/Effect-TS/effect/commit/1dbc4c382c783099c74c93dae20d72a12db92e69) Thanks @xia-chao! - Add `PubSub.isPubSub`, matching `Queue.isQueue` and `TxPubSub.isTxPubSub`.

- [#8449](https://github.com/Effect-TS/effect/pull/8449) [`80d5adb`](https://github.com/Effect-TS/effect/commit/80d5adb16787b11507a67809fbe6978da719d76a) Thanks @front-depiction! - Fix a race where interrupting a waiting `PubSub` subscriber could swallow a later message, or interrupting a backpressured publisher could still publish when space became available.

- [#8569](https://github.com/Effect-TS/effect/pull/8569) [`aa430d8`](https://github.com/Effect-TS/effect/commit/aa430d89c134520d9e77babbf759a73650244c89) Thanks @tim-smart! - Batch takes drain remaining messages when a queue closes, even below the requested minimum. Later takes receive the terminal error.

- [#8568](https://github.com/Effect-TS/effect/pull/8568) [`24f7d32`](https://github.com/Effect-TS/effect/commit/24f7d32b389026f0395b9ec30d49f9091eb2b114) Thanks @tim-smart! - Withdraw pending `Queue.offer` and `Queue.offerAll` values when their producer is interrupted after `Queue.end` or `Queue.fail`. The queue can finish closing once those offers are withdrawn.

- [#8412](https://github.com/Effect-TS/effect/pull/8412) [`f4dd1ae`](https://github.com/Effect-TS/effect/commit/f4dd1aec1ab5aaad01d831958c8ee709a9f4661b) Thanks @front-depiction! - Fix lost wake-ups in `Queue` when a fiber yields between checking for a message or capacity and registering its waiter.
  
  `Queue.offer` on a zero-capacity `dropping` queue now hands the message to a waiting taker, matching `offerUnsafe` and `offerAll`.

- [#8472](https://github.com/Effect-TS/effect/pull/8472) [`0981d01`](https://github.com/Effect-TS/effect/commit/0981d01df8e20390ca407e3b64d9e6b56f59d4b5) Thanks @tim-smart! - Fix Queue takers missing offers that arrive while they are registering.

- [#8514](https://github.com/Effect-TS/effect/pull/8514) [`0a29ca6`](https://github.com/Effect-TS/effect/commit/0a29ca6840a362cbc9d32fb263cddef804cbc6fd) Thanks @tim-smart! - Retry failed background pool acquisitions when borrowed, rather than passing stale errors to later queries. Callers awaiting their own failed connection still receive its error.

- [#8397](https://github.com/Effect-TS/effect/pull/8397) [`17810b4`](https://github.com/Effect-TS/effect/commit/17810b478d3d01445ab8da9062df48f7f841b508) Thanks @tim-smart! - Close the interruption gap before scope and cache cleanup registration.

- [#8365](https://github.com/Effect-TS/effect/pull/8365) [`62b2ea9`](https://github.com/Effect-TS/effect/commit/62b2ea97fe8fd85f44b508cf2633fee5d1e285e9) Thanks @tim-smart! - Rename the HTTP API entry point from `effect/httpapi` to `effect/http-api` and remove the old export path. Runtime TypeIds under `~effect/httpapi/*`, service keys under `effect/httpapi/*`, and the reserved `effect/httpapi/stream/failure` SSE event name now use `http-api` as well.

- [#8378](https://github.com/Effect-TS/effect/pull/8378) [`4e4fa8b`](https://github.com/Effect-TS/effect/commit/4e4fa8b18455dc05c5a601ae7613b95c27aadabd) Thanks @gcanti! - Rename range checks so their subject comes last: `Schema.isBetweenLength`, `Schema.isBetweenCodePoints`, `Schema.isBetweenSize`, and `Schema.isBetweenProperties`. Also rename the string checks to the grammatical `Schema.isStartingWith`, `Schema.isEndingWith`, and `Schema.isIncluding`. Update the corresponding `SchemaRepresentation.*Reviver` exports and persisted `effect/schema/...` check IDs to use the new names.

- [#8533](https://github.com/Effect-TS/effect/pull/8533) [`3495bd8`](https://github.com/Effect-TS/effect/commit/3495bd8858de3a7b7e75090587f813e096e851ee) Thanks @tim-smart! - Keep the source result type for Effect.repeat with times or schedule, even when while or until is a refinement. Bounded repetition may finish before the predicate stops it, so callers relying on the previous narrowed type must check the result.

- [#8390](https://github.com/Effect-TS/effect/pull/8390) [`b3032f0`](https://github.com/Effect-TS/effect/commit/b3032f01f288942e7ef7398efc654b58d6525792) Thanks @front-depiction! - Fix interrupt-time resource leaks:
  
  - `Pool.get`, `Pool.use` and `RcRef.get` register cleanup before they can be interrupted.
  - `RcRef` and `RcMap` finish closing expired resources even if their idle fibers are interrupted.
  - `ScopedRef` closes in-flight replacements with their owner. `make`, `fromAcquire` and `set` now interrupt if the owning scope has closed.

- [#8541](https://github.com/Effect-TS/effect/pull/8541) [`d26a913`](https://github.com/Effect-TS/effect/commit/d26a913221566bd6156be860dfb9cd5c55796d1c) Thanks @Marve10s! - Skip malformed ndjson lines and non-object JSON-RPC messages so later requests still decode. Handle non-string notification methods without throwing.

- [#8437](https://github.com/Effect-TS/effect/pull/8437) [`93f826a`](https://github.com/Effect-TS/effect/commit/93f826af79734296b9659400cb5f3c29f45dba32) Thanks @front-depiction! - Stop `Effect.map`, `Effect.tap`, `Effect.exit`, `Effect.match` and `Effect.matchCause` allocating a success `Exit` on every step.

- [#8519](https://github.com/Effect-TS/effect/pull/8519) [`330b747`](https://github.com/Effect-TS/effect/commit/330b7475e2135bb9bc6aad1df5d513d32299ebc1) Thanks @tim-smart! - Add `Schedule.once`, a schedule that recurs immediately once and outputs `void`.

- [#8441](https://github.com/Effect-TS/effect/pull/8441) [`b808b5d`](https://github.com/Effect-TS/effect/commit/b808b5d0c0132e7456f81125ff989b83106c1468) Thanks @front-depiction! - Skip generator allocation for synchronous array and tuple parsing.

- [#8440](https://github.com/Effect-TS/effect/pull/8440) [`2575fcc`](https://github.com/Effect-TS/effect/commit/2575fcc12bb4d1aed5603cfab579d9030e78e231) Thanks @front-depiction! - Avoid rebuilding the parser wrappers on every `SchemaParser.asserts` call.

- [#8364](https://github.com/Effect-TS/effect/pull/8364) [`287273c`](https://github.com/Effect-TS/effect/commit/287273cf55971f87dd62cb229d934dcf52242d74) Thanks @gcanti! - Add `Schema.isMinCodePoints`, `Schema.isMaxCodePoints`, and `Schema.isBetweenCodePoints` to validate string lengths by Unicode code point count, with JSON Schema export, representation revivers, and arbitrary generation support.

- [#8430](https://github.com/Effect-TS/effect/pull/8430) [`0860c0c`](https://github.com/Effect-TS/effect/commit/0860c0c125322a99454b30aafa2963f7289d70d6) Thanks @front-depiction! - Speed up schema decoder generation for deeply nested schemas.

- [#8451](https://github.com/Effect-TS/effect/pull/8451) [`8d27554`](https://github.com/Effect-TS/effect/commit/8d275546500c91a752da26ad37756e887fb4595c) Thanks @front-depiction! - Speed up Schema code generation for nested schemas, especially when a child cannot be generated.

- [#8429](https://github.com/Effect-TS/effect/pull/8429) [`c2e810c`](https://github.com/Effect-TS/effect/commit/c2e810cc7ae3f49f3e888ce83700ebdf1c34c503) Thanks @front-depiction! - Memoize recursive `Schema.toEquivalence` compilation and remove unused path tracking, reducing work and retained memory for deeply nested values.

- [#8423](https://github.com/Effect-TS/effect/pull/8423) [`35ecbb9`](https://github.com/Effect-TS/effect/commit/35ecbb986497d6593ff88faa44b8b1eb8e252024) Thanks @fml09! - Ignore non-enumerable own properties when checking schema excess properties, allowing `Schema.TaggedError` responses to encode under strict `HttpApi.ParseOptions`. Symbol index signatures now skip non-enumerable entries during decoding and encoding, matching string index signatures; make those properties enumerable or declare them explicitly in a `Struct` to retain them.

- [#8436](https://github.com/Effect-TS/effect/pull/8436) [`b442528`](https://github.com/Effect-TS/effect/commit/b442528ddf9608cf9b559b94b77198cc51643dd7) Thanks @front-depiction! - Fix `Schema.toFormatter` compiling a recursive schema again at every nesting level of the formatted value.

- [#8482](https://github.com/Effect-TS/effect/pull/8482) [`16623c7`](https://github.com/Effect-TS/effect/commit/16623c7d30c8ff654e33fce1122aae7f5e5d8d78) Thanks @gcanti! - Improve `Schema.toJsonSchemaDocument` export of built-in checks. String code-unit length checks now use safe code-point bounds, regex and literal checks avoid patterns that would reject accepted values under Unicode matching, and cardinality checks reject non-finite bounds instead of emitting invalid schemas. Custom check exporters can mark a fragment as approximate by returning `[schema, true]`; `oneOf` then falls back to `anyOf`, and approximate record-key patterns are not used as `patternProperties` selectors.
  
  Built-in checks whose exported constraints can be looser than their runtime checks, including approximations that predate this change:
  
  | Check                                                              | Approximation                                                                                                                                                                                                                                                                                                            | Change in this PR                                           |
  | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
  | `isPattern`                                                        | The default applies to direct `isPattern` checks: the pattern is omitted unless the RegExp uses the Unicode flag and its other flags are `d`, `g`, or `y`. Sticky patterns are anchored at the start. Built-in checks may override the default when their Unicode semantics are known to be safe or intentionally loose. | Updated export and approximation metadata.                  |
  | `isStartingWith`                                                   | A trailing high surrogate is removed from the exported prefix; if nothing remains, the pattern is omitted. Other prefixes retain an exact pattern.                                                                                                                                                                       | Updated export.                                             |
  | `isEndingWith`                                                     | A leading low surrogate is removed from the exported suffix; if nothing remains, the pattern is omitted. Other suffixes retain an exact pattern.                                                                                                                                                                         | Updated export.                                             |
  | `isIncluding`                                                      | A leading low surrogate or trailing high surrogate is removed from the exported substring; if nothing remains, the pattern is omitted. Other substrings retain an exact pattern.                                                                                                                                         | Updated export.                                             |
  | `isMinLength`                                                      | On strings, the exported minimum is `Math.ceil(minLength / 2)` code points. Bounds of 0 and 1 are exact; array bounds are unchanged.                                                                                                                                                                                     | Updated export; rejects non-finite bounds.                  |
  | `isMaxLength`                                                      | On strings, the exported maximum counts code points rather than UTF-16 code units. A bound of 0 is exact; array bounds are unchanged.                                                                                                                                                                                    | Updated type and union handling; rejects non-finite bounds. |
  | `isBetweenLength`                                                  | On strings, combines the lower- and upper-bound approximations above. Array bounds are unchanged.                                                                                                                                                                                                                        | Updated export; rejects non-finite bounds.                  |
  | `isUppercased`, `isLowercased`                                     | Patterns exclude only ASCII letters of the opposite case. Non-ASCII characters that change under JavaScript casing can still pass JSON Schema validation.                                                                                                                                                                | Marked as approximate.                                      |
  | `isCapitalized`, `isUncapitalized`                                 | Patterns exclude only ASCII letters of the opposite case at the start. Non-ASCII characters that change under JavaScript casing can still pass JSON Schema validation.                                                                                                                                                   | Marked as approximate.                                      |
  | `isInt`                                                            | Exports `type: "integer"` without the safe-integer bounds required by the runtime check.                                                                                                                                                                                                                                 | Marked as approximate.                                      |
  | `isMinProperties`, `isMaxProperties`, `isBetweenProperties`        | Counts match for parsed JSON objects, but JSON Schema property-count keywords do not constrain arrays, which these object-typed checks can also receive.                                                                                                                                                                 | Rejects non-finite bounds and tracks non-object use.        |
  | `isPropertyNames`                                                  | Inherits any approximation in the key schema. JSON Schema's `propertyNames` also does not constrain array keys.                                                                                                                                                                                                          | Propagates approximation from the key schema.               |
  | `isMinSize`, `isMaxSize`, `isBetweenSize`                          | The size constraint is omitted.                                                                                                                                                                                                                                                                                          | Rejects non-finite bounds and marks omission approximate.   |
  | `isUniqueKey`                                                      | Uniqueness of tuple keys is omitted.                                                                                                                                                                                                                                                                                     | Omission is now tracked as approximate.                     |
  | Comparison and range checks for `Date`, `BigInt`, and `BigDecimal` | Their bounds are omitted from JSON Schema export.                                                                                                                                                                                                                                                                        | Omission is now tracked as approximate.                     |
  
  Length checks on objects with a `length` property also omit that constraint. Code-point checks map directly to JSON Schema length bounds and are not approximate on strings; this PR adds rejection of non-finite bounds to those checks as well.

- [#8435](https://github.com/Effect-TS/effect/pull/8435) [`5521209`](https://github.com/Effect-TS/effect/commit/5521209a7697498dc26fe658a52d137c6c82c47e) Thanks @front-depiction! - Build the detailed traversal for structs without index signatures only when needed, avoiding unused parser allocations under default parse options.

- [#8434](https://github.com/Effect-TS/effect/pull/8434) [`477394d`](https://github.com/Effect-TS/effect/commit/477394deb644711551d4830e591b538d7267d0db) Thanks @front-depiction! - Split compiled tuple rest elements once per schema instead of on every equivalence or formatter call.

- [#8428](https://github.com/Effect-TS/effect/pull/8428) [`3036241`](https://github.com/Effect-TS/effect/commit/3036241e1e4366dd92047f4126f62e3f241abefd) Thanks @front-depiction! - Stop Schema unions rebuilding their runtime-type candidate list on every decode. The list is now built once per union and reused.

- [#8418](https://github.com/Effect-TS/effect/pull/8418) [`ca422fd`](https://github.com/Effect-TS/effect/commit/ca422fdf49416343328ac1d978bc1769877a5ebe) Thanks @front-depiction! - Run all scope finalizers even when one throws synchronously, and preserve the original failure when closing the scope.

- [#8457](https://github.com/Effect-TS/effect/pull/8457) [`4f5f866`](https://github.com/Effect-TS/effect/commit/4f5f86689657e935e881652fd107fa184dc6a542) Thanks @front-depiction! - Forked scopes detach from their parent on close, even if cleanup throws or is interrupted, without a bookkeeping finalizer. The readonly `Scope.parent` field exposes the parent scope.

- [#8396](https://github.com/Effect-TS/effect/pull/8396) [`54ff4f2`](https://github.com/Effect-TS/effect/commit/54ff4f2121d371f7c8c3b47df821c6e5ac8c923f) Thanks @tim-smart! - Shared `ScopedCache` lookups survive individual caller interruption. If the last waiter leaves while a lookup is pending, it is interrupted and its scope closed. Missing-key lookups, including `refresh`, now run in daemon fibers like `Cache`, so children forked by a lookup end with it rather than with the caller.

- [#8488](https://github.com/Effect-TS/effect/pull/8488) [`c8a9f85`](https://github.com/Effect-TS/effect/commit/c8a9f8543de5a93e021e1738af248b2f4e0a5b63) Thanks @gcanti! - - Allow `Config.withDefault` and `Config.option` to recover `Config.all` groups with missing children even when other children have values. Validation and source errors still propagate. A group default replaces the entire group; put defaults on individual children to preserve supplied values, or use `Config.schema(Schema.Struct(...))` to reject incomplete objects.
  - Make `Config.orElse` adopt the fallback's result, allowing a later default or option to handle an absent fallback even after invalid input was recovered.
  - Return `None` for `ShardingConfig.runnerListenAddress` when `listenHost` is absent and `listenPort` is valid. Supply `listenHost` to configure the listen address.

- [#8433](https://github.com/Effect-TS/effect/pull/8433) [`0c0aa5e`](https://github.com/Effect-TS/effect/commit/0c0aa5ebb0b833435156c63536be0a967cbe19a4) Thanks @front-depiction! - Avoid redundant context lookups for the tracer and tracing-enabled flag when creating spans.

- [#8356](https://github.com/Effect-TS/effect/pull/8356) [`d426feb`](https://github.com/Effect-TS/effect/commit/d426feb658448593980da79937b6456fbef4a258) Thanks @tim-smart! - Split the encoding API into `effect/encoding/Base64`, `effect/encoding/Base64Url`, `effect/encoding/Hex`, and `effect/encoding/EncodingError`. The former `effect/Encoding` module has been removed; migrate each helper to its format module and use the shared error entrypoint to name or narrow encoding failures.
  
  Two migrations need special attention: `randomHex` is now `Hex.random`, and the runtime value of `EncodingErrorTypeId` changed from `~effect/Encoding/EncodingError` to `~effect/encoding/EncodingError`.

- [#8529](https://github.com/Effect-TS/effect/pull/8529) [`2a8f5c7`](https://github.com/Effect-TS/effect/commit/2a8f5c748d83d8de22bf865618aa76ec77b000b2) Thanks @tim-smart! - Roll back SQLite transactions left open by a failed COMMIT, such as a deferred foreign key violation, so the connection can be reused.

- [#8445](https://github.com/Effect-TS/effect/pull/8445) [`6332de2`](https://github.com/Effect-TS/effect/commit/6332de29a8138cf220576656b418eda17aa1c4ba) Thanks @front-depiction! - Keep long chains of `Stream.concat` linear in their length.

- [#8416](https://github.com/Effect-TS/effect/pull/8416) [`c00c8ff`](https://github.com/Effect-TS/effect/commit/c00c8ffd48fe17f40ec1ba56a27bf1f2efed31b8) Thanks @front-depiction! - Fix `Stream.forever` and `Stream.repeat` slowing down and retaining pull layers with each repetition by using a constant-depth loop.

- [#8411](https://github.com/Effect-TS/effect/pull/8411) [`aa7de26`](https://github.com/Effect-TS/effect/commit/aa7de2663104e65677ec69a4a47f5df9a3adadc7) Thanks @front-depiction! - Fix concurrent `Stream.mapEffect` hanging when the mapping function throws synchronously. Run the function inside its forked fiber so the throw is reported as a defect.

- [#8410](https://github.com/Effect-TS/effect/pull/8410) [`6f44ca0`](https://github.com/Effect-TS/effect/commit/6f44ca0b98b27a4222c677bf0b89e85a16790ebb) Thanks @front-depiction! - Fix `Stream.broadcast`, `Stream.broadcastN`, `Stream.share` and `Stream.toPubSubTake` subscribers that never end.
  
  The upstream's exit was published as an ordinary message, so a subscriber that arrived after it, or whose bounded `dropping` PubSub was full, waited forever. The new `PubSub.end` ends a PubSub with a final message that every subscriber, current or future, receives after draining its buffered messages, and the broadcast operators now use it for the exit.

- [#8405](https://github.com/Effect-TS/effect/pull/8405) [`98792c3`](https://github.com/Effect-TS/effect/commit/98792c3bf8bf80237362c51505fc080d2a89ac1d) Thanks @tim-smart! - Add a `probabilityPrecision` option to `DecisionModel.make` that accepts and rescales the sum drift caused by a provider rounding each probability. OpenRouter and TypeSafe decision models set it to two decimals, so rounded distributions such as `0.02 / 0.93 / 0.04` no longer fail with `InvalidOutputError`. Providers that do not opt in keep strict sum validation.

- [#8531](https://github.com/Effect-TS/effect/pull/8531) [`1f76040`](https://github.com/Effect-TS/effect/commit/1f760401be854f8e50c414902be6eeea1d479682) Thanks @tim-smart! - `Toolkit.handle` now requires tool handler services on the outer Effect as well as the returned Stream. If a parameter decoder needs a service, provide it when running the outer `handle` Effect, not only when consuming the Stream.

- [#8530](https://github.com/Effect-TS/effect/pull/8530) [`cf7cfd6`](https://github.com/Effect-TS/effect/commit/cf7cfd6144faac0c0a4c236382706f38e246795d) Thanks @tim-smart! - Expose `AiError` in the error type of streams returned by `Toolkit.handle` in return mode. Result-encoding failures already fail the stream at runtime; consumers that treated the extracted stream as infallible must handle or propagate that error.

- [#8387](https://github.com/Effect-TS/effect/pull/8387) [`6bc0eee`](https://github.com/Effect-TS/effect/commit/6bc0eeea42fa557cab193c84646d2c4dae7f5b20) Thanks @front-depiction! - End tracing spans and restore fiber context when interruption occurs as a traced region starts. Ensure `HttpMiddleware.tracer` ends its span on interruption.

- [#8370](https://github.com/Effect-TS/effect/pull/8370) [`88b79d7`](https://github.com/Effect-TS/effect/commit/88b79d74f19567de3fb00c84e71df9f21455fe95) Thanks @front-depiction! - Build `Mime` lookup tables on first lookup so bundlers can drop the MIME data when no lookup is used.

- [#8361](https://github.com/Effect-TS/effect/pull/8361) [`db7b69e`](https://github.com/Effect-TS/effect/commit/db7b69efffa6b3c104dbe5f6f1192db5630df272) Thanks @xia-chao! - Add `isNonEmpty` predicates to `TxHashSet`, `TxPubSub`, and `TxQueue`.

- [#8452](https://github.com/Effect-TS/effect/pull/8452) [`43bbb25`](https://github.com/Effect-TS/effect/commit/43bbb257c22d5a819e423526a358091be629206b) Thanks @front-depiction! - Fix `Effect.tx` never committing a `TxRef` write of `-0` over `0`, and only wake retry waiters for refs a transaction wrote, not refs it only read.

- [#8372](https://github.com/Effect-TS/effect/pull/8372) [`6ecd4b3`](https://github.com/Effect-TS/effect/commit/6ecd4b380947ff4db0e8f2144c330526824e67d7) Thanks @front-depiction! - Fix `Effect.txRetry` blocking forever when a `TxRef` the transaction read was changed by another commit while the transaction was suspended. The transaction now reruns immediately instead of waiting for a later change.

- [#8348](https://github.com/Effect-TS/effect/pull/8348) [`7b81a95`](https://github.com/Effect-TS/effect/commit/7b81a95de1d0666e102ea9b29cd9a1fa05b2649c) Thanks @xia-chao! - Add `TxChunk.isTxChunk`, a type guard for `TxChunk` values. The other transactional data types already expose an equivalent `isTx*` guard.

- [#8446](https://github.com/Effect-TS/effect/pull/8446) [`dd8990b`](https://github.com/Effect-TS/effect/commit/dd8990bb1b3379e5bb09f384005e45b85980fe4d) Thanks @front-depiction! - `TxPriorityQueue.offerAll` merges new values into the sorted queue instead of re-sorting existing values.

- [#8334](https://github.com/Effect-TS/effect/pull/8334) [`19835f2`](https://github.com/Effect-TS/effect/commit/19835f2b92a9fca55a965903d74dda074b17e8ea) Thanks @nikelborm! - Added `Config.flatMap`

- [#8455](https://github.com/Effect-TS/effect/pull/8455) [`1a3eb9e`](https://github.com/Effect-TS/effect/commit/1a3eb9ea60dcfcfe09406bf0b766f806883cbf87) Thanks @henningpokriefke! - Derive workflow execution IDs from a length-prefixed workflow tag and idempotency key.

## 4.0.0-rc.117

### Patch Changes

- [#8331](https://github.com/Effect-TS/effect/pull/8331) [`9953c92`](https://github.com/Effect-TS/effect/commit/9953c92b860061ec928098b121279087ee56e5e9) Thanks @tim-smart! - Bound local sends that wait for an unregistered cluster entity type. These sends now fail with an `Entity type ... not registered` defect at the shared runner registration deadline. Once that startup deadline has elapsed, sends to not-yet-registered dynamic entity types fail immediately.

- [#8319](https://github.com/Effect-TS/effect/pull/8319) [`c6e8b20`](https://github.com/Effect-TS/effect/commit/c6e8b20c27b08e94549a9431c38e867aa014b724) Thanks @fubhy! - Extend `NetAddress.toCanonical` to accept internet addresses. IPv4-mapped IPv6 addresses become IPv4 while retaining the port. Other addresses retain their identity and IPv6 scope metadata.

- [#8317](https://github.com/Effect-TS/effect/pull/8317) [`8d40572`](https://github.com/Effect-TS/effect/commit/8d40572de3762d51b142cfff30e6927ef21e37a3) Thanks @tim-smart! - Fix cluster workflows stalling after request resets.

- [#8323](https://github.com/Effect-TS/effect/pull/8323) [`1b21e0d`](https://github.com/Effect-TS/effect/commit/1b21e0df6ab777d6a1664dfabdea88511f2d25d1) Thanks @fubhy! - Add validated multicast address refinements for IP and MAC addresses.

- [#8310](https://github.com/Effect-TS/effect/pull/8310) [`3b155e3`](https://github.com/Effect-TS/effect/commit/3b155e3e24e42b603d48dff5d3280715944998f0) Thanks @williamrobertson13! - Fix memory leaks in `Pool.makeWithTTL` with the usage strategy by releasing retired resources and consumed acquisition errors from the TTL queue.

- [#8326](https://github.com/Effect-TS/effect/pull/8326) [`895d944`](https://github.com/Effect-TS/effect/commit/895d94410f90c45546aec593730e5630f200ca1b) Thanks @lloydrichards! - Normalize identified MCP output schemas to object roots across protocol versions.
  Support identified object schemas in MCP elicitation requests.

- [#8318](https://github.com/Effect-TS/effect/pull/8318) [`705fb68`](https://github.com/Effect-TS/effect/commit/705fb6852ac24791352bd78889d57f07cbe949a9) Thanks @fubhy! - Add `Queue.shutdownUnsafe` to synchronously discard buffered messages and settle pending queue operations from callbacks. Both `Queue.shutdown` and `Queue.shutdownUnsafe` return `false` when the queue has already been shut down or completed; previously, `Queue.shutdown` always returned `true`.

- [#8325](https://github.com/Effect-TS/effect/pull/8325) [`87912c0`](https://github.com/Effect-TS/effect/commit/87912c014132648694015a5636177b2ba2bdeb2a) Thanks @fubhy! - Add `NetAddress.formatNativeHost` and `NetAddress.formatMulticastInterface` with explicit platform and scope ID map parameters for native socket APIs.

- [#8308](https://github.com/Effect-TS/effect/pull/8308) [`106af64`](https://github.com/Effect-TS/effect/commit/106af64cf7117dfad53d3b11b61bb3d17d63bfca) Thanks @tristanz! - Release savepoints after nested transactions succeed or successfully roll back in PostgreSQL, PGlite, MySQL, libSQL, and the Node, Bun, React Native, and WASM SQLite clients. This frees PostgreSQL transaction locks before the outer transaction completes.
  
  Custom SQL clients can opt in through the new `releaseSavepoint` option. Clients that omit it are unchanged.

- [#8323](https://github.com/Effect-TS/effect/pull/8323) [`1b21e0d`](https://github.com/Effect-TS/effect/commit/1b21e0df6ab777d6a1664dfabdea88511f2d25d1) Thanks @fubhy! - Add generic branded NetAddress classifications and named validating schemas.
  Singleton address constants retain their base-family types; guards expose
  classifications on demand. Operations that derive new address bits return only
  the IPv4 or IPv6 family until callers revalidate the classification.

- [#8305](https://github.com/Effect-TS/effect/pull/8305) [`3d59ae6`](https://github.com/Effect-TS/effect/commit/3d59ae6d5f9ff3e52cb6ed4a9f325320580218d5) Thanks @tim-smart! - Make `criteria` optional for `Decision.probability`. When supplied, `criteria` still requires descriptions for both `false` and `true`.
  
  `Decision.Probability.criteria` is now optional, so consumers reading outcome descriptions (for example, `decision.criteria.true`) must first guard against `undefined`.

- [#8329](https://github.com/Effect-TS/effect/pull/8329) [`89c9a39`](https://github.com/Effect-TS/effect/commit/89c9a398412f1f5e7f9c6f697a1badd982bcd741) Thanks @tim-smart! - Warn when conflicting cluster workflow definitions reuse a tag.

## 4.0.0-rc.116

### Patch Changes

- [#7908](https://github.com/Effect-TS/effect/pull/7908) [`c19c63f`](https://github.com/Effect-TS/effect/commit/c19c63fb710422aaf00b8d923188aa2e52a6776f) Thanks @gcanti! - Add experimental JIT and AOT schema compilers that work through the existing
  `SchemaParser` APIs and share a decoder registry. Enable JIT globally with
  `effect/unstable/schema/SchemaJITCompiler/enable`, selectively with
  `SchemaJITCompiler.enable(ast)`, or install generated AOT decoders without
  requiring dynamic function construction. The new
  `effect/unstable/schema/SchemaAOTCompiler/Build` entrypoint discovers direct
  Schema exports from explicit module loaders and writes a self-installing AOT
  module through Effect's `FileSystem` and `Path` services. Compiled decoders can
  provide optional synchronous `decode` and `make` operations; normal
  `SchemaParser` calls consume them transparently and retain `decodeEffect` and
  `makeEffect` as the detailed fallbacks. AOT targets declare the operations to
  prepare, so generated modules contain only those operation families and use
  the interpreter if an omitted operation is later called.
  
  ### Breaking changes
  
  `SchemaGetter.Getter` is now a tagged union that distinguishes synchronous,
  optional, and effectful transformations. Getter values now expose only `pipe`.
  Use the dual `SchemaGetter.map`, `SchemaGetter.compose`, and `SchemaGetter.run`
  functions instead of the former methods. Keeping these operations standalone
  lets bundlers remove composition code when an application does not use it.
  
  The public `Getter` constructor is removed. Use
  `SchemaGetter.transformOptionalEffect` instead of `new SchemaGetter.Getter`.
  `SchemaGetter.onSome` and `SchemaGetter.onNone` are also removed. Use
  `transformEffect` for an effectful transformation of present values and
  `transformOptionalEffect` when the transformation handles missing values.
  
  `Transformation#compose` is replaced by the dual standalone function
  `SchemaTransformation.composeTransformation`. Replace `first.compose(second)`
  with `SchemaTransformation.composeTransformation(first, second)` or
  `SchemaTransformation.composeTransformation(second)(first)`.
  
  `SchemaTransformation.make` is renamed to
  `SchemaTransformation.makeTransformation`. `SchemaTransformation.Transformation`
  and `SchemaTransformation.Middleware` now implement `Pipeable`, so both values
  can be passed through standalone combinators with `.pipe(...)`.
  
  `SchemaAST.Context.constructorDefault` now stores the constructor-default
  `Effect` directly instead of wrapping it in a `SchemaAST.Link`. Constructor
  defaults apply only during construction, so the direct representation avoids
  giving them encoding semantics and lets construction reuse already-completed
  synchronous Effects. Code that constructs or inspects `SchemaAST.Context`
  should pass or read the default `Effect` directly.

- [#8287](https://github.com/Effect-TS/effect/pull/8287) [`8cb0a4f`](https://github.com/Effect-TS/effect/commit/8cb0a4f28fba991e15659d08ecc09da28cf742d2) Thanks @tim-smart! - Add `Decision` and `DecisionModel` to `effect/unstable/ai` for batched classification, rating, and probability estimates over schema-encoded input.

- [#8221](https://github.com/Effect-TS/effect/pull/8221) [`8f420bb`](https://github.com/Effect-TS/effect/commit/8f420bb3dc3c9be8c4a48d57dccee201dcb0260d) Thanks @gcanti! - Add `Arbitrary.array(item, { minLength, maxLength })` for variable-length arrays of custom Arbitraries. Shrinking removes blocks of commands while preserving the remaining values and their order, and also simplifies individual elements.
  
  Schema-derived arrays now also try removing prefixes and interior blocks. Shrinking composed values and Schema objects preserves child candidates that were previously lost when exploring another branch.
  
  Shrunk results and replay paths may change from earlier native releases. Re-run affected properties to obtain new replay tokens, and preserve important failing inputs as regression tests.

- [#8233](https://github.com/Effect-TS/effect/pull/8233) [`1393080`](https://github.com/Effect-TS/effect/commit/1393080f1cc8f47d459119fcb759e2cc00fd7356) Thanks @gold-beyond! - Add `Crypto.randomULID` to generate ULIDs from the current `Clock` timestamp and cryptographically secure random bytes.

- [#8256](https://github.com/Effect-TS/effect/pull/8256) [`ccae354`](https://github.com/Effect-TS/effect/commit/ccae35423188f58d7c3dec5db3e36ed4bf42bcdf) Thanks @tim-smart! - Align the `Effect` and `Stream` APIs and fix several Stream type signatures.
  
  - `Effect.orElseSucceed` now passes the error to the fallback function, matching `Stream.orElseSucceed`.
  - `Effect.isEffect` narrows to `Effect<unknown, unknown, unknown>` instead of `any`.
  - `Stream.bind`, `Stream.bindEffect` and `Stream.let` allow re-binding an existing field and produce the same record type as their `Effect` counterparts.
  - `Stream.Success`, `Stream.Error` and `Stream.Services` are unconstrained and distributive like the `Effect` versions.
  - `Stream.partition` returns `[passes, fails]` and takes a `capacity` option, matching `Stream.partitionQueue` and `Stream.partitionEffect`. Its default capacity remains 16.
  - `Stream.mapBoth` takes `onElement` / `onError`, matching `Stream.tapBoth`.
  - `Stream.scan` and `Stream.scanEffect` take a lazy initial state.
  - `Stream.catchTags` rejects unknown tag keys like `Effect.catchTags`.
  - Fixed the data-first overloads of `Stream.runIntoPubSub` (error type was dropped), `Stream.cross` (swapped type parameter names) and `Stream.mapAccumArray` (`onHalt` return type).
  - Added `Stream.as`, `Stream.tapDefect`, `Stream.tapErrorTag` and `Stream.unwrapReason`.
  - Stream concurrency options use the `Types.Concurrency` alias, and JSDoc categories were consolidated across both modules.

- [#8235](https://github.com/Effect-TS/effect/pull/8235) [`553c403`](https://github.com/Effect-TS/effect/commit/553c403f1d9199df738f73446dacd090da2e698b) Thanks @tim-smart! - Retain durable deferred completions received before a workflow owner's first local run so replay can complete while the deferred reply is still being persisted.
  
  Keep pending completions in a cache keyed weakly by cluster activation. Handler rebuilds retain completions, and overlapping activations cannot clear each other's results. Results can be collected once their activation scope becomes unreachable; closing a scope alone does not guarantee collection.
  
  Release RPC stream and queue consumers when their request write fiber is interrupted.

- [#8243](https://github.com/Effect-TS/effect/pull/8243) [`45b5103`](https://github.com/Effect-TS/effect/commit/45b510352d42ac55718f9f5f43573975b323143f) Thanks @tim-smart! - Fix lost durable deferred wake-ups when a ClusterWorkflowEngine execution suspends before its run reply is persisted. Deferred completions now wait for the current run reply before resuming, so discarded executions can replay without relying on caller retries.

- [#8254](https://github.com/Effect-TS/effect/pull/8254) [`77a5612`](https://github.com/Effect-TS/effect/commit/77a56120354d1d3f7341b117266f211143a3734a) Thanks @tim-smart! - Fix file response content types: honor the `contentType` option and preserve explicit headers, including MIME types set by `HttpStaticServer`. The default `HttpPlatform.layer` now infers missing content types from file extensions.
  
  Web file responses on the default, Node, and Deno platforms prefer explicit content types, then nonempty `File.type`, then the file extension.
  
  Removed the unused `contentLength` option from `HttpServerResponse.file`; lengths are calculated from the file and requested range.

- [#8229](https://github.com/Effect-TS/effect/pull/8229) [`1076170`](https://github.com/Effect-TS/effect/commit/10761707b5cae0a66ef605abd1737ae59a18f5ac) Thanks @tim-smart! - Fix a deadlock in the memory workflow engine when a durable deferred is completed from a finalizer in the workflow awaiting it, including `DurableDeferred.into` inside `DurableDeferred.raceAll`.

- [#8206](https://github.com/Effect-TS/effect/pull/8206) [`f110af1`](https://github.com/Effect-TS/effect/commit/f110af1ac5a54a7d62c2b96e35d4521a09f3fa06) Thanks @tim-smart! - Fix multipart file streams hanging on body read errors and preserve error causes when persisting files.

- [#8284](https://github.com/Effect-TS/effect/pull/8284) [`0045152`](https://github.com/Effect-TS/effect/commit/0045152cdf796f20be5e690c69c40da611f813b8) Thanks @tim-smart! - `HttpServerResponse.toWeb` now keeps a raw `Response`'s headers and `Set-Cookie` values when the body is omitted (HEAD, or status 204, 205 or 304). Bodyless outer statuses keep the outer status and status text; HEAD keeps the raw `Response`'s. Outer cookies are appended to native `Set-Cookie` headers instead of replacing them.

- [#8202](https://github.com/Effect-TS/effect/pull/8202) [`51d4a2f`](https://github.com/Effect-TS/effect/commit/51d4a2f08a5c7691dc876415bc9fc0ecf467e153) Thanks @xia-chao! - Fix `RcRef.make` to treat `idleTimeToLive: 0` like `Duration.zero` and `"0 millis"` instead of an omitted option.

- [#8298](https://github.com/Effect-TS/effect/pull/8298) [`4d4c4e8`](https://github.com/Effect-TS/effect/commit/4d4c4e8a4436d49997a5a7234860ede651467537) Thanks @gcanti! - Fix `Schema.Redacted` to wrap the transformed result of its inner schema during decoding and encoding.

- [#8227](https://github.com/Effect-TS/effect/pull/8227) [`ccfe152`](https://github.com/Effect-TS/effect/commit/ccfe152d11bed497f2d26aba8ef1a3613d0d6746) Thanks @tim-smart! - Release non-persisted, interruptible `RunnerServer` handlers and mailbox slots when callers disconnect.
  
  Preserve dynamic `WithTransaction` annotations during replay and re-delivery.

- [#8261](https://github.com/Effect-TS/effect/pull/8261) [`d30a0c8`](https://github.com/Effect-TS/effect/commit/d30a0c880f8ffe06d7f0695c17f35910f1fcfbc9) Thanks @nikhilsnayak! - Add HTTP `QUERY` support to clients, routers, HttpApi endpoints, and AI request metadata. Configure CORS support through `allowedMethods`; defaults are unchanged.
  
  OpenAPI 3.1 output represents `QUERY` through `x-oai-additionalOperations`, which requires consumer support for that extension. The OpenAPI generator accepts the extension and the native OpenAPI 3.2 `query` field.

- [#8255](https://github.com/Effect-TS/effect/pull/8255) [`84fe64a`](https://github.com/Effect-TS/effect/commit/84fe64a5fbfdecd23b66c207d0daa848d59dd825) Thanks @tim-smart! - Preserve literal suffixes such as `:wait` in `/operations/:id:wait` across `HttpApiClient`, `HttpApiBuilder`, and OpenAPI paths.
  
  Server routes without a params schema keep their existing matching for `RouteContext` consumers. Schemas whose keys cannot be enumerated keep the existing fallback.

- [#8228](https://github.com/Effect-TS/effect/pull/8228) [`49e4b37`](https://github.com/Effect-TS/effect/commit/49e4b37b831a573567e0b67d3ec4593403dc2e72) Thanks @lloydrichards! - Support prompt titles in `McpServer.prompt` and `McpServer.registerPrompt`.

- [#8228](https://github.com/Effect-TS/effect/pull/8228) [`49e4b37`](https://github.com/Effect-TS/effect/commit/49e4b37b831a573567e0b67d3ec4593403dc2e72) Thanks @lloydrichards! - Add an `instructions` option to MCP servers for initialization and discovery responses.

- [#7265](https://github.com/Effect-TS/effect/pull/7265) [`a2c4154`](https://github.com/Effect-TS/effect/commit/a2c4154cf8bcbe455bd43bf7f3f12d9cbf38247c) Thanks @lloydrichards! - Add server support for MCP protocol version 2026-07-28 through 2026_07_28

- [#8272](https://github.com/Effect-TS/effect/pull/8272) [`23a58c0`](https://github.com/Effect-TS/effect/commit/23a58c020b25dde573ce523c2d157032676de0a3) Thanks @fubhy! - Add `NetAddress.formatHost` and `NetAddress.inetAddressFromHostString` for socket APIs that accept numeric hosts and ports separately, preserving IPv6 scope IDs. Add `NetAddress.scopeIdsFromInterfaces` to build a scope map for resolving named IPv6 zones from supplied network interface entries without performing operating-system lookups.

- [#8293](https://github.com/Effect-TS/effect/pull/8293) [`feef90c`](https://github.com/Effect-TS/effect/commit/feef90ccbd86e5ab49b7e3cc3845591e23bdcb1b) Thanks @gcanti! - Treat `Never` as an uninhabited branch during `Arbitrary.schema` derivation. Schemas with another finite generation path, including optional properties, unions, and empty collections, no longer fail derivation.

- [#8212](https://github.com/Effect-TS/effect/pull/8212) [`755e863`](https://github.com/Effect-TS/effect/commit/755e863a793e5621183e7992cb3f85d29030ad7b) Thanks @IMax153! - Restrict `ByteSize.Input` strings to canonical non-negative integers with recognized units, rejecting malformed literals at compile time. Parse external strings and fractional quantities with `ByteSize.fromString` or `ByteSize.fromStringUnsafe` before passing them to APIs accepting `ByteSize.Input`.

- [#8228](https://github.com/Effect-TS/effect/pull/8228) [`49e4b37`](https://github.com/Effect-TS/effect/commit/49e4b37b831a573567e0b67d3ec4593403dc2e72) Thanks @lloydrichards! - Honor `Tool.Strict` in MCP input schemas and argument validation. Strict dynamic tools require Effect schemas; raw JSON Schema is rejected at registration.
  
  Support identified input schemas for non-strict tools. Invalid arguments use `InvalidParams` on protocols before 2025-11-25 and `isError: true` results on newer protocols.
  
  Distinguish validation failures from declared handler failures. Declared failures return `isError: true` without `structuredContent`: error mode uses `Error.message` or schema-encoded text, and return mode uses the encoded payload. Declared failures do not produce internal-error diagnostics.
  
  Log and report internal failures, including defects and encoding errors, while keeping client messages generic.
  
  Allow `Toolkit.handle` to accept `SchemaAST.ParseOptions` for parameter decoding. Expose the `Toolkit.FailureOrigin` cause annotation and shared `Tool.FailureOrigin` type, with the same origin available in `Tool.HandlerResult.failureOrigin` on returned failures.

- [#8269](https://github.com/Effect-TS/effect/pull/8269) [`9ad9891`](https://github.com/Effect-TS/effect/commit/9ad9891e24058065bcd445772e005f8ce4b3e42f) Thanks @tim-smart! - Add `HttpApi.ParseOptions` to configure server and client codecs at the API, group, or endpoint level.
  
  `Sse.decodeSchema` and `ChannelSchema.decode` accept parse options, and `Schema.Cause` encodes reasons to their wire fields.
  
  SSE decoding omits absent IDs, including with default options. Use `Schema.optional(Schema.String)` instead of `Schema.UndefinedOr(Schema.String)` for IDs. With `onExcessProperty: "error"`, declare `event` (default: `"message"`) and any `id`, including inherited IDs.
  
  `HttpApiSchema.StreamSse` data-mode types and OpenAPI schemas now make `id` optional.

- [#8296](https://github.com/Effect-TS/effect/pull/8296) [`0beded0`](https://github.com/Effect-TS/effect/commit/0beded04f5cffe8dd263f989c38a609e27f27fa5) Thanks @gcanti! - Improve Schema-derived BigInt and BigDecimal arbitraries with wider magnitude, precision, and exponent coverage and numeric boundary shrinking.
  
  Cover intermediate magnitudes up to large one-sided BigInt bounds, handle BigDecimal bounds with widely different scales, and refine decimal counterexamples between simple values.

- [#8260](https://github.com/Effect-TS/effect/pull/8260) [`2940742`](https://github.com/Effect-TS/effect/commit/2940742c3f8529bc3b024b379904fbefd40ece55) Thanks @xia-chao! - Fix repeated `text`, `json`, `arrayBuffer`, and `urlParamsBody` reads in `HttpServerResponse.toClientResponse` for raw Web `Response` bodies, preserving the original response for serving.

- [#8270](https://github.com/Effect-TS/effect/pull/8270) [`63c1566`](https://github.com/Effect-TS/effect/commit/63c15662f90ae970969de29761207c99ecdbf66b) Thanks @tim-smart! - Fix YAML indentless sequences, multiline scalar folding, and comments. Reject unsupported compact nested sequences (`- - value`) and document streams.
  
  Previously accepted values such as `description: Use when: deploy` and `description: Deploy:` now throw `SyntaxError`: YAML forbids colons followed by whitespace or end-of-value in plain scalars. Quote these values, for example `description: "Use when: deploy"`.

## 4.0.0-rc.115

### Patch Changes

- [#8196](https://github.com/Effect-TS/effect/pull/8196) [`657254b`](https://github.com/Effect-TS/effect/commit/657254b8218628b0116497d09aaf783cb88279f3) Thanks @gcanti! - Optimize schema initialization while preserving custom constructor options.

- [#8190](https://github.com/Effect-TS/effect/pull/8190) [`f9ef0e9`](https://github.com/Effect-TS/effect/commit/f9ef0e970260b5de143392d00593e6c8b4614cff) Thanks @javascript-unsafe! - Omit response bodies for statuses 204, 205, and 304 in `HttpServerResponse.toWeb` and the Bun/Deno HTTP adapters, preventing invalid Web responses and hung requests. Cancel omitted raw `ReadableStream` bodies, and finalize request resources without starting omitted Effect streams.

- [#8187](https://github.com/Effect-TS/effect/pull/8187) [`4f73f9e`](https://github.com/Effect-TS/effect/commit/4f73f9e0bd9538260f0f7166e0e6abdbd507a0e8) Thanks @tim-smart! - Parameterize persistence lookup keys in both SQL backing stores' `getMany` queries.

## 4.0.0-rc.114

### Patch Changes

- [#8177](https://github.com/Effect-TS/effect/pull/8177) [`3ff4952`](https://github.com/Effect-TS/effect/commit/3ff49521afa6fe6c85c2c230f7e986f7374ef353) Thanks @tim-smart! - Allow `Effect.cachedWithTTL` to compute the TTL from each completed `Exit`, so successes and failures can use different cache durations.

- [#8164](https://github.com/Effect-TS/effect/pull/8164) [`6d55555`](https://github.com/Effect-TS/effect/commit/6d55555b83701c42855758944985a6fdbf57fffe) Thanks @sam-goodwin! - Keep Node and Bun file stats usable when optional numeric metadata exceeds the safe integer range by returning `Option.none()` for those fields.

- [#8162](https://github.com/Effect-TS/effect/pull/8162) [`716e0c0`](https://github.com/Effect-TS/effect/commit/716e0c00942b42d36631b3114b1deb9a4a944ce3) Thanks @tim-smart! - Fix published declarations referencing symbols stripped as `@internal`, which broke consumers compiling with `skipLibCheck: false`. `Effectable.d.ts` now uses the public `Effect.TypeId`, `Match.d.ts` no longer aliases an internal `Contextual` type, `Schema.d.ts` ships the `AnnotationSchemaConstraint` alias it references, and the CLI's `toFlagDoc` helper is marked internal so it no longer leaks `Param.getParamMetadata`.

- [#8160](https://github.com/Effect-TS/effect/pull/8160) [`d4e4ad5`](https://github.com/Effect-TS/effect/commit/d4e4ad57d06d0a30d5e8090ed951f080bcd3a3d7) Thanks @gcanti! - Fix `SchemaRepresentation.toCodeDocument` generating invalid TypeScript for optional tuple elements containing unions or nested readonly tuples. Optional element types are now parenthesized, for example `readonly [(string | number)?]` instead of `readonly [string | number?]`. Generated runtime schemas are unchanged.

- [#8158](https://github.com/Effect-TS/effect/pull/8158) [`b1988f4`](https://github.com/Effect-TS/effect/commit/b1988f496eef07482f10f4cc03ef20b9570ea0ac) Thanks @gcanti! - Fix `SchemaRepresentation.toCodeDocument` dropping Struct fields named `__proto__` from generated schemas. These fields now use computed keys, such as `Schema.Struct({ ["__proto__"]: Schema.String })`, so the generated schema validates them correctly.

- [#8169](https://github.com/Effect-TS/effect/pull/8169) [`482b7d7`](https://github.com/Effect-TS/effect/commit/482b7d7eb08ebe6bc57781414a5a9a12600b2c71) Thanks @gcanti! - Improve `SchemaRepresentation.fromJsonSchemaDocument` and `fromJsonSchemaMultiDocument`:
  
  - Import `{ not: {} }` as `Schema.Never` ([#8137](https://github.com/Effect-TS/effect/issues/8137)).
  
  - Import closed records with one `patternProperties` entry, `additionalProperties: false`, and no declared or required properties when `patterns: "apply"` is enabled. These were previously rejected.
  
    ```json
    {
      "type": "object",
      "patternProperties": { "^a": { "type": "number" } },
      "additionalProperties": false
    }
    ```
  
    ```ts
    Schema.Record(
      Schema.String.check(Schema.isPattern(/^a/)),
      Schema.Finite
    )
    ```
  
  - Reject open patterned objects with `patterns: "apply"` instead of generating incompatible TypeScript index signatures.
  
    ```json
    {
      "type": "object",
      "patternProperties": { "^a": { "type": "number" } },
      "additionalProperties": true
    }
    ```
  
    Import now explains that the generated TypeScript index signatures would give incorrect types to unmatched keys, and reports the source path. The same applies when `additionalProperties` is omitted or `{}`. Patterns can still be combined with a closed object in `allOf` when the result has a finite set of keys. Use `patterns: "ignore"` only if you intend to discard the pattern and its value constraints.
  
  - Reject references inside a subschema with its own `$id` instead of potentially resolving against the wrong definitions. Resolve or flatten these references before importing. A `$id` on the document root remains supported.
  
    ```json
    {
      "$id": "https://example.com/root",
      "$defs": { "Value": { "type": "string" } },
      "type": "object",
      "properties": {
        "child": {
          "$id": "child",
          "$defs": { "Value": { "type": "number" } },
          "$ref": "#/$defs/Value"
        }
      }
    }
    ```
  
    Here `child` refers to the nested numeric `Value`, not the root string `Value`. Import now reports that references inside a subschema with its own `$id` are unsupported instead of incorrectly using the root definition.
  
  - Explain import failures using JSON Schema keyword names, the reason for rejection, and the source path. Reference errors distinguish missing definitions, unsupported reference formats, and circular aliases. Pattern errors explain how to opt in for trusted schemas or explicitly discard the constraints.

- [#8162](https://github.com/Effect-TS/effect/pull/8162) [`716e0c0`](https://github.com/Effect-TS/effect/commit/716e0c00942b42d36631b3114b1deb9a4a944ce3) Thanks @tim-smart! - Rename `Schema.Annotations.ToArbitrary.Constraint` to `Schema.Annotations.ToArbitrary.FilterConstraint`.
  
  Code that refers to the previous type name should update its type annotations to use `FilterConstraint`.

- [#8181](https://github.com/Effect-TS/effect/pull/8181) [`9941e6d`](https://github.com/Effect-TS/effect/commit/9941e6dbf800cfd3723bfb421306e04e36b5882d) Thanks @Ishkirat-Singh! - Make `message` optional for `Prompt.Select` and `Prompt.MultiSelect`. When omitted, prompts display only the choices and submission shows a tick followed by the selected titles. `Prompt.AutoComplete` still requires a message.

## 4.0.0-rc.113

### Patch Changes

- [#7738](https://github.com/Effect-TS/effect/pull/7738) [`49e3901`](https://github.com/Effect-TS/effect/commit/49e39010ff84acbde32c50d559a2f76426cf830e) Thanks @kitlangton! - Retain completed tool approval results in non-streaming responses so Chat records them and does not replay approved tools on later turns.

- [#7483](https://github.com/Effect-TS/effect/pull/7483) [`b945ded`](https://github.com/Effect-TS/effect/commit/b945ded23aa9a0ad88bb55aa4089680866dccf92) Thanks @tim-smart! - Align runtime type IDs with their module paths. Effect markers now omit legacy grouping prefixes and the `unstable` path segment, while OpenTelemetry spans use the `OtelTracer` module path. Custom implementations that copy these marker strings must adopt the corrected IDs.

- [#8014](https://github.com/Effect-TS/effect/pull/8014) [`d6422f4`](https://github.com/Effect-TS/effect/commit/d6422f4104062e3e176abe92ef0e444cd4cc6bab) Thanks @kitlangton! - Fix `Effect.all` to retain errors and required services from every branch of a union of record inputs.

- [#8095](https://github.com/Effect-TS/effect/pull/8095) [`5a80204`](https://github.com/Effect-TS/effect/commit/5a802043984727b0c5a291af39d1b9bbfa8d7b8b) Thanks @gcanti! - Fix `Arbitrary.schema` to respect applicable index signatures when generating and shrinking object properties, including fixed fields in `Schema.StructWithRest` and overlapping records.
  
  Combine compatible string, number, and bigint constraints during generation so cases such as a `String` field constrained by a `NonEmptyString` record remain productive at size zero. Other intersections are validated and may exhaust the discard budget.

- [#7796](https://github.com/Effect-TS/effect/pull/7796) [`53511ef`](https://github.com/Effect-TS/effect/commit/53511efcd1c7a05d34b4c9a19c19ed317ebc5d4c) Thanks @kitlangton! - Fix `Schema.ArrayEnsure` to preserve array-valued element branches and outer-array encoding cardinality.

- [#8067](https://github.com/Effect-TS/effect/pull/8067) [`79ae49f`](https://github.com/Effect-TS/effect/commit/79ae49f19cab9a42c8f27ae8b104d5e39e6131fa) Thanks @purwasadr! - Fix `AtomRpc.query` returning `never` for RPCs whose middleware declares service `requires`. The return-type conditional now infers all six `Rpc` type parameters, matching `mutation` and every utility in `Rpc`.

- [#7463](https://github.com/Effect-TS/effect/pull/7463) [`0d083ba`](https://github.com/Effect-TS/effect/commit/0d083ba26b2e1afec8d3e8d83db0d05683b6602b) Thanks @tim-smart! - Remove the `mime` runtime dependency. The new `effect/unstable/http/Mime` module provides top-level lookup functions
  backed by a vendored standard MIME registry.

- [#7477](https://github.com/Effect-TS/effect/pull/7477) [`be0f822`](https://github.com/Effect-TS/effect/commit/be0f8221e37abd52668567b60fc1be28e3ff3803) Thanks @candrewlee14! - Allow sockets to use browser, Bun, and Node WebSocket implementations without consumer casts. Platform constructors
  now support typed opening-handshake headers where available.

- [#7587](https://github.com/Effect-TS/effect/pull/7587) [`debe8fd`](https://github.com/Effect-TS/effect/commit/debe8fdc15d00d51cf707353365d7b877123eec6) Thanks @kitlangton! - Fix `Cache.invalidateWhen` and `ScopedCache.invalidateWhen` deleting a replacement entry while waiting for an earlier lookup.

- [#7585](https://github.com/Effect-TS/effect/pull/7585) [`a8588f9`](https://github.com/Effect-TS/effect/commit/a8588f99a43dc9b85dacb14f7be5d3e1ed994d4f) Thanks @kitlangton! - Fix interruption of `Cache.refresh` for a missing key removing a newer value written by `Cache.set`.

- [#7596](https://github.com/Effect-TS/effect/pull/7596) [`f17eb0a`](https://github.com/Effect-TS/effect/commit/f17eb0a6f669e09647c5ded5832ea6baac596659) Thanks @kitlangton! - Fix `Cache.refresh` and `ScopedCache.refresh` exceeding capacity when an existing key is evicted while its refresh is in progress. Publishing the refreshed entry now evicts older entries as needed, releasing their resources in `ScopedCache`.

- [#7595](https://github.com/Effect-TS/effect/pull/7595) [`f30cbfe`](https://github.com/Effect-TS/effect/commit/f30cbfe53951128ad8124ae733f12423dbc78bd8) Thanks @kitlangton! - Fix `Cache.refresh` for an initially missing key deleting a newer cached value when the refresh completes with zero time to live.

- [#7614](https://github.com/Effect-TS/effect/pull/7614) [`78cc9c0`](https://github.com/Effect-TS/effect/commit/78cc9c0d0f36b59f7034b2ace56a4a5c02b7a551) Thanks @kitlangton! - Prevent `Cache` from retaining synchronously interrupted lookups.

- [#7563](https://github.com/Effect-TS/effect/pull/7563) [`ccbdbd5`](https://github.com/Effect-TS/effect/commit/ccbdbd51e7bdb114302701fbc03021868b71956a) Thanks @alvarosevilla95! - Respect custom HTTP header redaction when recording server span attributes.

- [#7254](https://github.com/Effect-TS/effect/pull/7254) [`a63dcbf`](https://github.com/Effect-TS/effect/commit/a63dcbf04e5c3d8d934a41bc6122e9951b1cefa9) Thanks @gcanti! - Add the experimental Schema-first `effect/unstable/arbitrary/Arbitrary` module for native generation without
  fast-check. `Arbitrary.schema` derives an opaque arbitrary from the decoded Schema `Type`, `Arbitrary.sampleEffect`
  provides interruptible sampling with typed exhaustion, and `Arbitrary.checkEffect` returns structured property results.
  The initial implementation supports bounded discards, shrinking, replay, and recursive and mutually recursive Schemas.
  `SampleError` and `Exhausted` include the effective seed so discarded runs remain reproducible even when the caller did
  not provide one. `Arbitrary.isArbitrary` identifies values through the module's nominal protocol. Numeric constraints
  retain `NaN` when it is accepted by their supported `Order.Number` bounds. Union derivation validates `oneOf`
  exclusivity and isolates lazy cross-member shrinking from unrelated random generation. Object derivation keeps
  optional-property selection constructive when candidate fields have different recursive costs.
  Struct, Record, JSON-object, and record-shaped `Arbitrary.all` outputs periodically use a null prototype as an edge
  case, preserving that prototype throughout shrinking and replay without perturbing structural PRNG choices. The change
  adds 0.01–0.03 KB gzip to representative Arbitrary fixtures and leaves production-only bundle sentinels unchanged.
  
  Add `Arbitrary.map`, `Arbitrary.flatMap`, `Arbitrary.filter`, `Arbitrary.filterMap`, and `Arbitrary.all` for composing
  derived Arbitraries without exposing a second catalog of primitive constructors. Filtering remains bounded and
  promotes valid shrink descendants through rejected nodes. `maxShrinks` bounds every inspected shrink candidate,
  including candidates rejected before property evaluation, while retaining the best shrunk input found when the
  budget is exhausted. `flatMap` provides deterministic dependent generation, source-first shrinking, post-source PRNG
  checkpoints, and one shared residual recursion budget. `all` combines tuples, iterables, and records with a shared
  budget, randomized internal generation order, stable output shape, and independent member shrinking. Arbitrary values
  implement `Pipeable` for composition with data-last combinators.
  
  Add the experimental Schema `arbitraryConstraint` and `toCodecArbitrary` annotations and their
  `Schema.Annotations.ToArbitrary` types. Declarations can provide a Schema Link optimized for generation, while filters
  can contribute native semantic constraints. The callback receives decoded type parameters and normalized constraints.
  The compiler owns efficient representations for common built-ins, including JSON, RegExp, URL, Date, byte arrays,
  ReadonlyMap, and ReadonlySet. Effect-specific HashMap, HashSet, Chunk, Graph, BigDecimal, and date-time declarations keep
  local generation Links, while declarations with productive canonical codecs require no arbitrary-specific annotation.
  `Schema.isUniqueKey` provides key-based Map uniqueness for explicit array representations.
  
  The same ownership policy applies to formatter and equivalence derivation: implementations for common declarations
  live in their compiler, while domain-specific and dynamically constructed declarations retain local annotations.
  Declarations whose intrinsic `Equal` implementation already matches their Schema equivalence need no annotation or
  compiler special case. This keeps unused common callbacks out of production Schema bundles.
  
  Against the previous layout, `schema-toArbitrary` decreases from 36.68 KB to 33.24 KB gzip and
  `arbitrary-combinators` decreases from 37.16 KB to 33.70 KB. `schema-toFormatter` increases from 18.92 KB to 19.49 KB
  and `schema-toEquivalence` increases from 19.05 KB to 19.39 KB because callers that explicitly derive these capabilities
  now retain the common declaration handlers. Generic production fixtures remain unchanged; an equivalence-specific
  production fixture using common declarations decreases from 20.75 KB to 20.48 KB, while declarations whose intrinsic
  equality is sufficient decrease from 23.42 KB to 23.34 KB. An Arbitrary-specific production fixture using common
  declarations decreases from 20.35 KB to 19.61 KB, while one using the locally annotated BigDecimal and date-time
  declarations increases from 18.34 KB to 23.01 KB.
  The complete 31-scenario native Arbitrary comparison reports no statistically classified runtime regression; the five
  moved BigDecimal and date-time scenarios remain within measurement noise.
  
  Add `SchemaGetter.forbiddenEncoding`, a reusable getter for the encode side of decode-only Schema transformations.
  
  Remove the fast-check bridge from the `effect` package, including `Schema.toArbitrary` and
  `effect/testing/FastCheck`. Replace the legacy `Schema.Annotations.ToArbitrary` callback contract with the native
  Schema-first types. The `effect` package no longer depends on fast-check.
  
  Migrate `TestSchema.Asserts.verifyLosslessTransformation` and `TestSchema.Asserts.arbitrary().verifyGeneration` to the
  native runner. Both methods now accept native check options directly, bound unsuccessful generation, and include the
  shrunk input and replay token in property failures.
  
  Use the Arbitrary runner for all `@effect/vitest` property tests. Property inputs may combine Schemas and Arbitraries,
  and are composed directly with `Arbitrary.all`; check options are available through `arbitrary`. Raw fast-check
  arbitraries and the `fastCheck` options object are no longer supported. As with the previous fast-check adapter, thrown
  exceptions, defects, and typed failures from a property are shrinkable falsifications; Effect interruption remains an
  interruption.
  
  Optimize constructive regular-expression generation by caching feasible lengths on the compiled pattern, computing
  sequence-suffix feasibility once, and precomputing character-class metadata. Seeded generation, shrinking, and replay
  remain unchanged.
  
  Optimize `BigDecimal.Order` and `BigDecimal.Equivalence` with a shared hybrid comparator. Ordinary scale differences
  use cached, bounded coefficient alignment, while large differences are compared without materializing their decimal
  zeroes. `BigDecimal.make` now rejects scales that are not safe integers.
  
  Before its removal, the materialized fast-check bridge fixture
  `schema-toArbitrary-materialized-fast-check.ts` measured 79.00 KB minified and gzipped.
  
  Representative runtime measurements against corresponding hand-written fast-check 4.9.0 arbitraries are shown below.
  Values are median latency on Node 24.12.0 and Apple M3; lower is better. Both implementations validate the
  same output domains, although their generation distributions are not identical. Native speedup is fast-check latency
  divided by Native latency, so higher is better.
  
  | Scenario                            | fast-check |  Native | Native speedup |
  | ----------------------------------- | ---------: | ------: | -------------: |
  | 32 recursive samples                |     150 µs |  103 µs |          1.45x |
  | 128 optional Struct samples         |     244 µs | 86.0 µs |          2.84x |
  | 128 constrained strings             |     742 µs | 49.7 µs |         14.86x |
  | RegExp derivation and first sample  |    13.4 ms | 30.8 µs |        429.02x |
  | 64 RegExp strings                   |     595 µs |  919 µs |          0.64x |
  | RegExp failure and shrinking        |     168 µs | 88.2 µs |          1.91x |
  | 128 bounded numbers                 |    68.9 µs | 21.8 µs |          3.18x |
  | 128 `Uint8Array` samples            |    98.3 µs | 74.4 µs |          1.32x |
  | 128 `BigDecimal` samples            |    66.6 µs | 56.3 µs |          1.18x |
  | 128 `DateTime.Utc` samples          |    71.2 µs | 50.5 µs |          1.42x |
  | 128 named time zones                |    52.2 µs | 27.9 µs |          1.85x |
  | 128 time zones                      |    63.7 µs | 33.8 µs |          1.89x |
  | 128 zoned date-times                |     130 µs |  112 µs |          1.16x |
  | 32 samples through Schema filter    |    65.9 µs | 49.4 µs |          1.33x |
  | 32 unique arrays                    |     156 µs |  132 µs |          1.18x |
  | 128 literal samples                 |    40.0 µs | 3.70 µs |         10.78x |
  | 128 mapped samples                  |    59.0 µs | 14.1 µs |          4.21x |
  | 128 samples through passing filter  |    58.9 µs | 13.9 µs |          4.23x |
  | 32 samples through selective filter |    66.1 µs | 42.9 µs |          1.54x |
  | 128 `filterMap` samples             |    75.7 µs | 31.5 µs |          2.40x |
  | Filtered failure and shrinking      |    12.7 µs | 7.71 µs |          1.66x |
  | 128 `all` tuple samples             |    43.5 µs | 18.5 µs |          2.35x |
  | 128 `all` record samples            |    81.0 µs | 30.4 µs |          2.66x |
  | 128 dependent `flatMap` samples     |     125 µs | 67.2 µs |          1.86x |
  | `flatMap` failure and shrinking     |    20.1 µs | 6.71 µs |          2.99x |
  | Replay `flatMap` shrink path        |    14.3 µs | 6.57 µs |          2.17x |
  | Passing property, 100 runs          |    42.3 µs | 27.1 µs |          1.56x |
  | `TestSchema`, 100 generations       |    44.5 µs | 35.9 µs |          1.24x |
  | First failure plus one shrink       |    8.77 µs | 1.30 µs |          6.75x |
  | Replay recorded failure             |    6.35 µs | 1.19 µs |          5.36x |
  
  Cold recursive derivation is not included because the native fixture constructs and compiles a Schema, while the
  fast-check fixture constructs a hand-written arbitrary; it is not a like-for-like warm-generator comparison.
  
  Add a guide for the native module and a migration guide from the fast-check bridge published in `effect@4.0.0-rc.109`.

- [#7822](https://github.com/Effect-TS/effect/pull/7822) [`b845b18`](https://github.com/Effect-TS/effect/commit/b845b186379106c17ed4b1149e2462cd0d2d77b5) Thanks @tim-smart! - Add `Stream.catchDefect` and `Channel.catchDefect` for recovering from defects without catching typed failures or interruptions.

- [#7657](https://github.com/Effect-TS/effect/pull/7657) [`381b794`](https://github.com/Effect-TS/effect/commit/381b79464f8e0a520585fdcfdd3e95e0553d0b27) Thanks @kitlangton! - Remove `Channel.runDone`; use `Channel.runDrain` to consume all output and return the completion value.

- [#7989](https://github.com/Effect-TS/effect/pull/7989) [`4ffcaf4`](https://github.com/Effect-TS/effect/commit/4ffcaf4c4a94d3d9d5715db91aa37d7f5d9ecd99) Thanks @kitlangton! - Preserve astral Unicode escapes and following arguments in `ChildProcess.make` and `ChildProcess.prefix` template literals.

- [#8018](https://github.com/Effect-TS/effect/pull/8018) [`ba2fd82`](https://github.com/Effect-TS/effect/commit/ba2fd822e9618f30d0f430ae4eed2eaa4813e2e3) Thanks @tim-smart! - Wait for Node child process groups to exit during scoped release and `kill`.
  
  After signalling a process group, both operations now wait for its leader and descendants. Without `forceKillAfter`, the wait is limited to one second and never escalates. With `forceKillAfter`, the group receives `SIGKILL` at the deadline, followed by a final wait of up to one second. Native timers keep escalation working under a `TestClock`, and cleanup no longer depends on stdio closing.
  
  `exitCode` and `isRunning` remain tied to the leader's exit, and a leader that already exited successfully still leaves its group untouched. Process group checks count zombies, so cleanup may wait for the full bound under a non-reaping PID 1.

- [#7617](https://github.com/Effect-TS/effect/pull/7617) [`02be94c`](https://github.com/Effect-TS/effect/commit/02be94ce78a3c9fc1e4c516d37d8e11e1c0eef2e) Thanks @kitlangton! - Fix `Chunk` concatenation to preserve sliced elements.

- [#7453](https://github.com/Effect-TS/effect/pull/7453) [`115d8c2`](https://github.com/Effect-TS/effect/commit/115d8c22599640ece2fd6a10564925b1d79f8a8c) Thanks @gcanti! - Rename the built-in `Config` constructors to PascalCase and rename `Config.mapOrFail` to `Config.mapEffect`. `Config.Array` and `Config.Record` now construct configs directly, with overloads for pathless options or a path followed by options, while their specialized schemas and the other built-in schemas are kept internal.
  
  This is a breaking naming cleanup for the Effect 4 release candidate. It makes casing consistently identify typed config constructors, aligns effectful mapping with the rest of the library, and prevents implementation schemas from expanding the public `Config` interface.

- [#8020](https://github.com/Effect-TS/effect/pull/8020) [`1452635`](https://github.com/Effect-TS/effect/commit/14526354f3d0288bd1d0a85c8d4aeee8abe2cd9b) Thanks @kitlangton! - Ensure `Effect.acquireUseRelease` releases an acquired resource and `Effect.useSpan` ends its span when the use callback throws before returning an effect. The thrown exception remains a defect, but no longer skips cleanup.

- [#8087](https://github.com/Effect-TS/effect/pull/8087) [`77f85fe`](https://github.com/Effect-TS/effect/commit/77f85fe1613348f5c990016b49dc97e252576c82) Thanks @tim-smart! - use `new` instantiation for streams

- [#7802](https://github.com/Effect-TS/effect/pull/7802) [`a3f2b31`](https://github.com/Effect-TS/effect/commit/a3f2b319343f28edb028270f7074066cea0ec429) Thanks @kitlangton! - Preserve flags and nested commands when completing a CLI subcommand through its alias.

- [#7804](https://github.com/Effect-TS/effect/pull/7804) [`310f8d3`](https://github.com/Effect-TS/effect/commit/310f8d3424a025ce1f1cc5c338232db2362052d8) Thanks @kitlangton! - Include inherited shared flags in descendant CLI completions.

- [#8086](https://github.com/Effect-TS/effect/pull/8086) [`291d616`](https://github.com/Effect-TS/effect/commit/291d616282b666bbba3664143fa1d19e839a6a5d) Thanks @MaxFreedomPollard! - Allow `=` in values parsed by `Primitive.keyValuePair`, `Flag.keyValuePair`, and `Param.keyValuePair` in `effect/unstable/cli`.

- [#7687](https://github.com/Effect-TS/effect/pull/7687) [`48dbbb2`](https://github.com/Effect-TS/effect/commit/48dbbb22bb2e04f63992fc267dd711a0cbd76d72) Thanks @kitlangton! - Allow optional alternative CLI flags.

- [#8121](https://github.com/Effect-TS/effect/pull/8121) [`b43bfd6`](https://github.com/Effect-TS/effect/commit/b43bfd644a3205f1518abbfd006f761e31b3a5f9) Thanks @tim-smart! - Rename CLI constructors to PascalCase, aligning scalar names with `Schema` and `Config`. This is a breaking change; parsing behavior is unchanged.
  
  In `Primitive`, `Param`, `Flag`, and `Argument`, capitalize existing constructor names, with these exceptions:
  
  | Previous  | New        | Modules               |
  | --------- | ---------- | --------------------- |
  | `integer` | `Int`      | All four              |
  | `float`   | `Finite`   | All four              |
  | `none`    | `Never`    | All four              |
  | `choice`  | `Literals` | Param, Flag, Argument |
  
  `Primitive.choice` becomes `Primitive.Choice`; `choiceWithValue` becomes `ChoiceWithValue` where available.
  
  In `Prompt`, capitalize control constructors except `text` → `String`, `integer` → `Int`, and `float` → `Number`. Rename public types `IntegerOptions` → `IntOptions` and `FloatOptions` → `NumberOptions`. Shared `TextOptions` is unchanged. `Prompt.Number` retains its existing parser, without a finite-number restriction.
  
  In `GlobalFlag`, rename `action` → `Action` and `setting` → `Setting`. Factories and combinators, including `Command.make` and `Prompt.succeed`, keep their names.
  
  Update public `_tag` matches and completion descriptors:
  
  - `Primitive`: `"Integer"` → `"Int"`, `"Float"` → `"Finite"`, `"None"` → `"Never"`.
  - `Completions.FlagType` and `Completions.ArgumentType`: `"Integer"` → `"Int"`, `"Float"` → `"Finite"`.
  
  Sentinels still always fail; their internal parameter name is now `"__never__"`. Help labels and completion scripts are unchanged.

- [#7685](https://github.com/Effect-TS/effect/pull/7685) [`1c89c78`](https://github.com/Effect-TS/effect/commit/1c89c78f9faa3638f398772f3ed7182aa97a1edd) Thanks @kitlangton! - Fix defaulted variadic arguments when omitted.

- [#8059](https://github.com/Effect-TS/effect/pull/8059) [`9bbe1a5`](https://github.com/Effect-TS/effect/commit/9bbe1a5940eee4642ffe854356128b617e0a064c) Thanks @kitlangton! - Fix CLI wizard handling of negative numbers and other flag values beginning with `-`.

- [#7489](https://github.com/Effect-TS/effect/pull/7489) [`dd99ab0`](https://github.com/Effect-TS/effect/commit/dd99ab007e3352761187dae330d52f65feeff7c0) Thanks @tim-smart! - Cluster no longer retains fiber ids for every local teardown.
  
  Transient persisted interrupts are now classified from live teardown state
  (entity, shard, singleton, entity type, and node shutdown) instead of a
  process-lifetime set of fiber ids. The registry is bounded by in-flight
  teardowns and returns to baseline after entity reap storms.

- [#7939](https://github.com/Effect-TS/effect/pull/7939) [`8f397ed`](https://github.com/Effect-TS/effect/commit/8f397ed4e7852026591819cc4c8c1995bdd2fb8c) Thanks @kitlangton! - Fix `Reply.Reply` codecs to require client services when decoding and server services when encoding.

- [#7485](https://github.com/Effect-TS/effect/pull/7485) [`d7ae6b6`](https://github.com/Effect-TS/effect/commit/d7ae6b6491a88f2710612bfcddaf608ebe925f7c) Thanks @tim-smart! - Transient routing states for persisted cluster messages no longer surface as errors.
  
  If an entity moves runners or is shut down before replying, the caller keeps
  waiting for the reply via message storage while the entity moves. If the local
  runner is shutting down while a caller is waiting, the call is interrupted
  instead of failing with `EntityNotAssignedToRunner`: the request is already
  durable and will be served under the next owner.
  
  Durable workflows treat such an interrupt as an abandoned run attempt: the run
  stops with nothing persisted, without running compensations or resuming the
  parent, ready to replay on the replacement runner.

- [#7933](https://github.com/Effect-TS/effect/pull/7933) [`8cf1203`](https://github.com/Effect-TS/effect/commit/8cf12030e8a3e1e76384884d41afa96e2bd72b13) Thanks @kitlangton! - Fix saved curried `Context.get` calls incorrectly inferring their required service as `unknown`.

- [#8064](https://github.com/Effect-TS/effect/pull/8064) [`87654c5`](https://github.com/Effect-TS/effect/commit/87654c5eed150387f4eac7153751b6085616ba52) Thanks @Avaq! - Fix the `CookiesError` tag in `effect/unstable/http` from `CookieError` to `CookiesError` to match the class name.

- [#7621](https://github.com/Effect-TS/effect/pull/7621) [`f05ae0b`](https://github.com/Effect-TS/effect/commit/f05ae0b3fd2cfc7f12b668af244b3cf3fae59bc5) Thanks @kitlangton! - Apply DateTime calendar parts without intermediate overflow.

- [#7884](https://github.com/Effect-TS/effect/pull/7884) [`436f5eb`](https://github.com/Effect-TS/effect/commit/436f5eb44aa234bdf1de37b07da2ce8dc31ad4ec) Thanks @kitlangton! - Fix `ConfigProvider.fromDotEnvContents` variable expansion to preserve replacement tokens such as `$&` in referenced values.

- [#7840](https://github.com/Effect-TS/effect/pull/7840) [`d8ff960`](https://github.com/Effect-TS/effect/commit/d8ff9605bb5ef7b0cacd80e3b43ed1ce9e3d5e36) Thanks @kitlangton! - Fix `DurableClock.sleep` to preserve explicit `0` and `0n` in-memory thresholds.

- [#7941](https://github.com/Effect-TS/effect/pull/7941) [`8766475`](https://github.com/Effect-TS/effect/commit/876647502300b9fb79d163de10fd497716d93be0) Thanks @kitlangton! - Require schema encoding services when `DurableDeferred.into` records an exit.

- [#7750](https://github.com/Effect-TS/effect/pull/7750) [`b64f406`](https://github.com/Effect-TS/effect/commit/b64f406de13a1b9da4664dbde2dbddaa5f776a05) Thanks @kitlangton! - Update dynamic tools to advertise replacement parameter schemas after `setParameters`.

- [#7572](https://github.com/Effect-TS/effect/pull/7572) [`4697aaa`](https://github.com/Effect-TS/effect/commit/4697aaa1d38f9da7fe0bcb62f708183f766fe496) Thanks @tim-smart! - Align CLI help tables by terminal display width for wide, emoji, combining, and zero-width graphemes.

- [#7588](https://github.com/Effect-TS/effect/pull/7588) [`cec6c2d`](https://github.com/Effect-TS/effect/commit/cec6c2d7bec7bea0ea179123af581a23c2e24494) Thanks @tim-smart! - Route tool call parameter validation failures through the tool's `failureMode` and drop `ToolParameterValidationError.toolParams`.

- [#7643](https://github.com/Effect-TS/effect/pull/7643) [`9956f0e`](https://github.com/Effect-TS/effect/commit/9956f0e6f47096a6e31305ec2c7320b8e1a140af) Thanks @tim-smart! - Reduce memory usage in Effect primitives and fibers.
  
  Breaking: context-derived `Fiber` fields now live under `fiber.cache`. The
  `currentScheduler`, `currentSpan`, `currentLogLevel`, `currentStackFrame`, and
  `currentPreventYield` fields are now `scheduler`, `span`, `logLevel`,
  `stackFrame`, and `preventYield`. Access `minimumLogLevel` and
  `maxOpsBeforeYield` through `cache` as well.

- [#7650](https://github.com/Effect-TS/effect/pull/7650) [`5c7eed0`](https://github.com/Effect-TS/effect/commit/5c7eed0c5aa0988716206dd374359223edf828ee) Thanks @tim-smart! - Reduce HTTP server allocation churn when tracing is not configured and for requests that complete synchronously.

- [#7649](https://github.com/Effect-TS/effect/pull/7649) [`183c2ea`](https://github.com/Effect-TS/effect/commit/183c2ea65ee1e9b967c746aa1b0bf2b8d3422de2) Thanks @tim-smart! - Reduce per-request RPC server allocations.

- [#7772](https://github.com/Effect-TS/effect/pull/7772) [`1e92dbd`](https://github.com/Effect-TS/effect/commit/1e92dbd26f5a74bb32103cbaac0f09460b7954de) Thanks @tim-smart! - Improve HTTP server throughput by reducing routing, request handling, response
  construction, and body encoding overhead. Add `Effect.withFiberSucceed` for
  synchronously computing successful values from the current fiber. Copy pooled
  byte views by their exact range when exposing `ArrayBuffer` values.

- [#7956](https://github.com/Effect-TS/effect/pull/7956) [`4eb0fa7`](https://github.com/Effect-TS/effect/commit/4eb0fa72302b0a63ac34c6515a9cdf96338e586a) Thanks @tim-smart! - Reduce HTTP server overhead: complete freshly created header maps in place in
  `HttpServerResponse.setHeader` and `setHeaders`, compare static route prefixes
  with a prepared `startsWith`, map `HttpApi` schema errors eagerly for completed
  decoder results, and implement `Effect.cached` as a dedicated one-time memo
  without time-to-live machinery.

- [#7426](https://github.com/Effect-TS/effect/pull/7426) [`534b8b9`](https://github.com/Effect-TS/effect/commit/534b8b9dba195ec38a4795fe564d5e0876cb6468) Thanks @tim-smart! - Replace `@effect/sql-pg`'s `pg` runtime with a native PostgreSQL client. `PgConnection` and `PgPool` now handle connection setup, binary queries, prepared statements, pipelining, streaming, notifications, cancellation, and custom codecs. `PgConnection.listen` and `PgClient.listen` return scoped notification dequeues after PostgreSQL confirms the subscription. `PgClient` uses the native stack, and the legacy `fromPool`, `fromClient`, and `makeWith` constructors are removed.
  
  ### Breaking changes
  
  - `fromPool`, `fromClient`, and `makeWith` are removed. Use `make` for a pool or `makeClient` for one connection.
  - `PgClient.listen` returns a scoped `Effect<Dequeue<string>, SqlError, Scope>` instead of a `Stream`. Acquisition completes after PostgreSQL confirms `LISTEN`, so notifications sent after it returns cannot be missed.
  - `PgClientConfig.types` now accepts a `PgTypes.Registry` instead of `pg.CustomTypesConfig`. Plain object parameters are no longer inferred as JSON; wrap them with `sql.json`.
  - Query strings must contain one statement. PostgreSQL's extended protocol rejects multi-statement strings.
  - Results use the native binary codecs. In particular, `int8` decodes to `bigint`, `date` to a string, timestamps to Unix epoch milliseconds, and `bytea` or unknown OIDs to `Uint8Array`. `executeRaw` returns the native `PgConnection.Result` shape rather than `pg.Result`.
  - Named prepared statements are enabled by default. Set `prepare: false` when using a pooler that cannot preserve prepared statements between queries. `Statement.unprepared` and `Statement.valuesUnprepared` use unnamed extended queries without adding entries to the prepared-statement cache.
  
  Inferred parameters stay permissive: strings bind untyped so the backend derives the type from the statement, and safe integers beyond the `int4` range bind as `int8`.
  
  Add `Pool.reserve` for exclusive access to a concurrent pool item, and fix waiter wakeups and capacity replacement after invalidation.

- [#7514](https://github.com/Effect-TS/effect/pull/7514) [`b76a1cf`](https://github.com/Effect-TS/effect/commit/b76a1cf32b0a742c24c1874137e2da8fed5c48eb) Thanks @tim-smart! - Add Socket.upgrade, for upgrading tcp sockets using STARTTLS

- [#7568](https://github.com/Effect-TS/effect/pull/7568) [`acc1e53`](https://github.com/Effect-TS/effect/commit/acc1e5384aa5cb7b072f60308013f078b0099bdf) Thanks @tim-smart! - Normalize core service and runtime identities under their owning module namespaces.

- [#8001](https://github.com/Effect-TS/effect/pull/8001) [`4950a91`](https://github.com/Effect-TS/effect/commit/4950a914a68306531a1111d4cdc4504aa8d3854e) Thanks @kitlangton! - Fix `Effect.fnUntracedEager` to pass the original function arguments to each transform after the current effect, matching `Effect.fn` and `Effect.fnUntraced`.

- [#8005](https://github.com/Effect-TS/effect/pull/8005) [`c020987`](https://github.com/Effect-TS/effect/commit/c020987a0611c9e610a7eef347648b60026745b8) Thanks @kitlangton! - Fix `Effect.updateServiceScoped` cleanup when an inner service provider has already completed. Closing the scope now preserves the service's absence instead of failing with a missing-service defect.

- [#8007](https://github.com/Effect-TS/effect/pull/8007) [`abe95d1`](https://github.com/Effect-TS/effect/commit/abe95d12340e1dd435e5df623b1967bf01938c94) Thanks @kitlangton! - Preserve the original cause in `Effect.catchReason` and `Effect.catchReasons` when no nested reason matches and no fallback is provided.

- [#7915](https://github.com/Effect-TS/effect/pull/7915) [`027ceb9`](https://github.com/Effect-TS/effect/commit/027ceb91e003fbc36f0559f72e1c614cd9198c1a) Thanks @kitlangton! - Fix `Effectable.Class` evaluation by delegating to its abstract `asEffect()` method. The method is called on the instance for each execution, preserving current receiver state and provided services.

- [#7907](https://github.com/Effect-TS/effect/pull/7907) [`3d203b7`](https://github.com/Effect-TS/effect/commit/3d203b702e26687d2fea4aaae7cc01dcfb82c05e) Thanks @KhraksMamtsov! - Add `Effectable.Mixin` to insert the Effect prototype into an existing class inheritance chain. The returned abstract class requires an `asEffect` method and derives its Effect type from that method through polymorphic `this`.

- [#8009](https://github.com/Effect-TS/effect/pull/8009) [`a29b8f4`](https://github.com/Effect-TS/effect/commit/a29b8f4de5aee58dd9ee645365c04cfe1ea6fa9f) Thanks @kitlangton! - Fix the `onError` and `onSyncError` argument tuple types in `Effect.effectify` to include only caller inputs, excluding the synthesized callback. Mapper annotations that expected a callback slot must use the caller-input tuple instead. Runtime behavior is unchanged.

- [#7902](https://github.com/Effect-TS/effect/pull/7902) [`ce4aa65`](https://github.com/Effect-TS/effect/commit/ce4aa65409e8500908fb6496eca06270ef5b636f) Thanks @kitlangton! - Fix `EntityProxyServer` handler layers to include client-side codec service requirements.

- [#7889](https://github.com/Effect-TS/effect/pull/7889) [`a8ea807`](https://github.com/Effect-TS/effect/commit/a8ea80799a0bf187c577e052fef0b7245494c7bf) Thanks @kitlangton! - Honor the entity layer's `disableFatalDefects` option in `Entity.makeTestClient`. When enabled, a handler defect no longer fails other pending calls to the same entity ID. The failing call still reports its defect; omitted or false options retain fatal-defect behavior.

- [#7862](https://github.com/Effect-TS/effect/pull/7862) [`a3ebb7f`](https://github.com/Effect-TS/effect/commit/a3ebb7fcb208f3933a40a0fd949dbcfdf1ca2921) Thanks @kitlangton! - Retry `EventLogRemote` writes and change streams when authentication returns `Forbidden`.

- [#7842](https://github.com/Effect-TS/effect/pull/7842) [`473bd81`](https://github.com/Effect-TS/effect/commit/473bd814a97dba66070435cfe84933bcc143effe) Thanks @kitlangton! - Return one empty chunk when `ChunkedMessage.split` receives an empty `Uint8Array`.

- [#7525](https://github.com/Effect-TS/effect/pull/7525) [`53843f6`](https://github.com/Effect-TS/effect/commit/53843f6490f4eebaf1eeb91fdcc5f1c542b0e132) Thanks @fubhy! - Add `ByteSize` module and use it across the ecosystem

- [#8115](https://github.com/Effect-TS/effect/pull/8115) [`c5eca65`](https://github.com/Effect-TS/effect/commit/c5eca6539f0d605acd5ce19437fa88f167d69bb7) Thanks @tim-smart! - Calculate `HttpBody.file`, `HttpBody.fileFromInfo`, and `HttpClientRequest.bodyFile` content lengths with exact bigint arithmetic and EOF clamping.

- [#7784](https://github.com/Effect-TS/effect/pull/7784) [`d6f9eba`](https://github.com/Effect-TS/effect/commit/d6f9eba7e8df0c8bd74762c313402884d94ba146) Thanks @kitlangton! - Ensure `ExecutionPlan.captureRequirements` provides captured services to effectful `while` predicates.

- [#7460](https://github.com/Effect-TS/effect/pull/7460) [`8d1e97a`](https://github.com/Effect-TS/effect/commit/8d1e97adbf5a36b4b53ab56f797c2ec0267a8821) Thanks @tim-smart! - Fix contextual typing for `Match` tag and discriminator handler maps when handlers use `Effect.fn` or `Effect.fnUntraced`.

- [#8070](https://github.com/Effect-TS/effect/pull/8070) [`b28ab48`](https://github.com/Effect-TS/effect/commit/b28ab48be7cf7f2bd30f9467ccac0ab41260f7ad) Thanks @tim-smart! - Fix parallel child workflows inside activities to dispatch before suspending, release activity resources during durable waits, and resume reliably when children complete during cleanup.

- [#7677](https://github.com/Effect-TS/effect/pull/7677) [`9960708`](https://github.com/Effect-TS/effect/commit/9960708052fcaaa873c471aea144ca46955e6023) Thanks @kitlangton! - Set `duplex` for raw Web stream request bodies in `FetchHttpClient`.

- [#7615](https://github.com/Effect-TS/effect/pull/7615) [`8ac53b6`](https://github.com/Effect-TS/effect/commit/8ac53b6ae677f06d88d7d81f932ab5ff9b59a10e) Thanks @kitlangton! - Fix `FiberMap` losing track of fibers started under the same key by a replaced fiber's synchronous finalizer, ensuring they are interrupted when the map's scope closes.

- [#7967](https://github.com/Effect-TS/effect/pull/7967) [`84ad49a`](https://github.com/Effect-TS/effect/commit/84ad49a357ef156b4ff46cefc945efbe3e292eff) Thanks @kitlangton! - Preserve an already registered fiber when `FiberHandle` or `FiberMap` registers it again with `onlyIfMissing: true`, instead of interrupting it and clearing the entry.

- [#8083](https://github.com/Effect-TS/effect/pull/8083) [`72cfa24`](https://github.com/Effect-TS/effect/commit/72cfa2420977919ba57a8e6de538e01e06d5f380) Thanks @nikelborm! - Exposed the platform specific pretty loggers separately.

- [#7788](https://github.com/Effect-TS/effect/pull/7788) [`95c2581`](https://github.com/Effect-TS/effect/commit/95c2581e0f78e1537aad21764fe562206ca50adb) Thanks @kitlangton! - Fix `FileSystem.sink` to retain its default write flag when `flag` is undefined.

- [#8074](https://github.com/Effect-TS/effect/pull/8074) [`d5c7cd2`](https://github.com/Effect-TS/effect/commit/d5c7cd2c47b2b01523aaea48d2dd039b89b36114) Thanks @nikelborm! - Removed unused stderr option from Logger.consolePretty signature

- [#7965](https://github.com/Effect-TS/effect/pull/7965) [`fe4fed1`](https://github.com/Effect-TS/effect/commit/fe4fed1b014c78043a8efe37520c527100910010) Thanks @kitlangton! - Match `AtomHttpApi` query and mutation success types to the generated HTTP client,
  including SSE, binary streams, and header-wrapped responses. Stream transport,
  decoding, and SSE errors now appear in the stream's error channel instead of
  `never`, so code that assumed a failure-free stream may need to handle them.
  Runtime and serialization behavior are unchanged.

- [#7959](https://github.com/Effect-TS/effect/pull/7959) [`d150a64`](https://github.com/Effect-TS/effect/commit/d150a643c4f60da2dc19ae813b807d48b580087e) Thanks @kitlangton! - Fix `AtomHttpApi` query and mutation dispatch for top-level API groups.

- [#7961](https://github.com/Effect-TS/effect/pull/7961) [`05b1e80`](https://github.com/Effect-TS/effect/commit/05b1e80cde3a8da1ff1afe288f8539b72c05bb87) Thanks @kitlangton! - Honor explicit `timeToLive: 0` and `timeToLive: 0n` in `AtomRpc` and `AtomHttpApi` queries. Zero now opts out of the registry's default idle retention, matching other zero-duration inputs, so an unmounted query can be disposed and fetched again on remount. Omitting `timeToLive` still uses the registry default.

- [#7963](https://github.com/Effect-TS/effect/pull/7963) [`414dc90`](https://github.com/Effect-TS/effect/commit/414dc9056a39aa22f7cc27aeb5e631231ce50982) Thanks @kitlangton! - Fix `AtomRpc` mutation and query atoms to include client middleware errors in their result error types.

- [#7740](https://github.com/Effect-TS/effect/pull/7740) [`3f51acd`](https://github.com/Effect-TS/effect/commit/3f51acdf5e2490d7d0a833cd67ce06d1d867facd) Thanks @kitlangton! - Forward `Atom.withFallback` writes to the primary atom.

- [#7693](https://github.com/Effect-TS/effect/pull/7693) [`d68ff05`](https://github.com/Effect-TS/effect/commit/d68ff05506ab5bb3ec07e1b759ce296423b0dbbe) Thanks @kitlangton! - Fix `HttpMiddleware.cors` to preserve `Origin` and other required `Vary` dimensions.

- [#8140](https://github.com/Effect-TS/effect/pull/8140) [`f3cf1e6`](https://github.com/Effect-TS/effect/commit/f3cf1e6c36f1aac8399d9b540aecb6410be3096f) Thanks @gcanti! - Fix `Types.DeepMutable` to preserve built-in objects, Effect data types, and other objects with methods or symbol-keyed properties while recursively making arrays, tuples, maps, sets, and plain records mutable.

- [#7695](https://github.com/Effect-TS/effect/pull/7695) [`6525771`](https://github.com/Effect-TS/effect/commit/6525771eef7df6b71a3ef6e299ee93d798ed3dda) Thanks @kitlangton! - Use body status and encoding defaults in `HttpApiSchema.encodeToWithHeaders`.

- [#8110](https://github.com/Effect-TS/effect/pull/8110) [`4ab4e83`](https://github.com/Effect-TS/effect/commit/4ab4e838a4c9ab3c9cc0d52d3e83de88686601b0) Thanks @tim-smart! - Prevent precision loss in Node/Bun filesystem operations and `HttpPlatform` file responses.

- [#8111](https://github.com/Effect-TS/effect/pull/8111) [`f7f1d78`](https://github.com/Effect-TS/effect/commit/f7f1d78e52023bdfbebf76949c550db8bb9411dd) Thanks @tim-smart! - Clamp HttpPlatform file response ranges to the file size so Content-Length matches the bytes available. Oversized reads stop at EOF, and offsets at or past EOF return an empty body with Content-Length 0. Apply the same clamping to the default Web file response implementation.

- [#7699](https://github.com/Effect-TS/effect/pull/7699) [`47b358a`](https://github.com/Effect-TS/effect/commit/47b358a4b85d22973a7957abd1a859f65b75b7da) Thanks @kitlangton! - Fix `HttpApiClient` decoding form-urlencoded responses.

- [#7705](https://github.com/Effect-TS/effect/pull/7705) [`45ffa72`](https://github.com/Effect-TS/effect/commit/45ffa7221259c7e4be9797b90f6ca569fe7ec8a3) Thanks @kitlangton! - Run registered pre-response handlers before `HttpApiTest` returns responses.

- [#7701](https://github.com/Effect-TS/effect/pull/7701) [`6232650`](https://github.com/Effect-TS/effect/commit/62326505a74fcd8fe27c8e2064128d2dea484ecc) Thanks @kitlangton! - Fix `HttpApiClient.urlBuilder` dropping base URL pathnames.

- [#7661](https://github.com/Effect-TS/effect/pull/7661) [`4b73e1b`](https://github.com/Effect-TS/effect/commit/4b73e1bd5576346d7939be8915f3053e428d1c0e) Thanks @kitlangton! - Add `JsonPointer.parseUriFragment` and `JsonPointer.formatUriFragment` for converting RFC 6901 URI fragments, and use them to preserve percent-encoded definition names in exported JSON Schema references. JSON Schema compilation now rejects malformed local definition references returned by `toJsonSchema` hooks. Such hooks must percent-encode characters that URI fragments do not permit, for example `%` as `%25` and `#` as `%23`.

- [#7675](https://github.com/Effect-TS/effect/pull/7675) [`284050c`](https://github.com/Effect-TS/effect/commit/284050c2aa6e78eceb08e5eff1803501cc80a658) Thanks @kitlangton! - Normalize MIME type parameters and whitespace in `Mime.getAllExtensions`.

- [#8108](https://github.com/Effect-TS/effect/pull/8108) [`c85fc0b`](https://github.com/Effect-TS/effect/commit/c85fc0b8f2195780929d6fc8ecdc084faf18736c) Thanks @tim-smart! - On Node and Deno, `FileSystem.File.seek` now rejects negative resulting positions with a `BadArgument` platform error, leaving the cursor unchanged. Its return type is now `Effect<bigint, PlatformError>`.

- [#8148](https://github.com/Effect-TS/effect/pull/8148) [`7999b07`](https://github.com/Effect-TS/effect/commit/7999b078950fda15e235db1e61e8db5eb0632528) Thanks @tim-smart! - Preserve the response Content-Type when compressing file, raw, stream, and byte-array responses on Node, Bun, Deno, and the web platform, including headers overridden after body construction.

- [#7703](https://github.com/Effect-TS/effect/pull/7703) [`7d455f5`](https://github.com/Effect-TS/effect/commit/7d455f51acf2f0e9f710f298e14e4d81179a9259) Thanks @kitlangton! - Apply endpoint OpenAPI overrides and transforms after schema generation.

- [#8057](https://github.com/Effect-TS/effect/pull/8057) [`d681c2e`](https://github.com/Effect-TS/effect/commit/d681c2eb1bb07d782540286368e8b42533df3063) Thanks @kitlangton! - Fix `Prompt.date` carrying typed digits into the next field when pressing Tab, including when navigation wraps.

- [#7742](https://github.com/Effect-TS/effect/pull/7742) [`84d2a47`](https://github.com/Effect-TS/effect/commit/84d2a470ecc0fcad7f1d1e7a50464e02af0e6972) Thanks @kitlangton! - Prevent `Reactivity.query` cleanup from failing when keys are repeated.

- [#7659](https://github.com/Effect-TS/effect/pull/7659) [`ed74b18`](https://github.com/Effect-TS/effect/commit/ed74b18b95b0797808f2f7928f413f1cf2279d77) Thanks @kitlangton! - Preserve pending leftovers when a `Sink.flatMap` continuation completes without consuming input.

- [#7671](https://github.com/Effect-TS/effect/pull/7671) [`2245997`](https://github.com/Effect-TS/effect/commit/2245997ad2214591b7d9674777595092926743cf) Thanks @kitlangton! - Preserve SSE events with mixed line endings.

- [#7691](https://github.com/Effect-TS/effect/pull/7691) [`d386979`](https://github.com/Effect-TS/effect/commit/d386979fedbdd433d28816f9cc74675a9af45189) Thanks @kitlangton! - Ignore Range headers on non-GET requests in HttpStaticServer.

- [#8109](https://github.com/Effect-TS/effect/pull/8109) [`fc9fedf`](https://github.com/Effect-TS/effect/commit/fc9fedf59fc26a8bc6e45c3860a921f3b7e0f971) Thanks @tim-smart! - Parse HttpStaticServer byte range integers exactly, including values above Number.MAX_SAFE_INTEGER. Oversized starts now return 416 with Content-Range instead of falling back to 200. Oversized ends clamp to the last byte, and oversized suffixes return the whole file as 206.

- [#7697](https://github.com/Effect-TS/effect/pull/7697) [`7750dbe`](https://github.com/Effect-TS/effect/commit/7750dbe0d5b9929c6d92b0365b42784b993ea2a6) Thanks @kitlangton! - Fix `HttpApiBuilder` ignoring the status annotation on a `HttpApiSchema.WithHeaders` wrapper around a streaming success, which defected when the wrapper and inner statuses differed.

- [#7667](https://github.com/Effect-TS/effect/pull/7667) [`fc91af6`](https://github.com/Effect-TS/effect/commit/fc91af659d0682659e6347eede288f90f618acc0) Thanks @kitlangton! - Fix `Toml.parse` rejecting child tables in separate array-of-tables entries.

- [#8106](https://github.com/Effect-TS/effect/pull/8106) [`39b9738`](https://github.com/Effect-TS/effect/commit/39b9738727ab4d87298fd640edd138f352c70ee3) Thanks @tim-smart! - Fix tool result serialization to select the codec using `isFailure` and preserve `encodedResult` through `Response.AllParts` round trips.
  
  Add `Tool.failureResultSchema(tool)` and `Tool.ExecutionFailure` to handle user failures, `AiError`, and denied or interrupted calls consistently. Also export `HttpRequestDetails` and `HttpResponseDetails` from `AiError`; the `Response` exports remain available.
  
  ### Breaking changes
  
  - Stored results must match the selected schema. With success `Schema.Number` and failure `Schema.NumberFromString`, migrate failed results from `404` to `"404"`.
  - `Response.ToolResultPart` returns `Schema.Codec` instead of `Schema.decodeTo`. Update annotations that depend on the old type.
  - `Tool.FailureResult` and `Tool.Result`, including their encoded variants, now include `Tool.ExecutionFailure` in both failure modes. Handle it when narrowing failed results.

- [#8132](https://github.com/Effect-TS/effect/pull/8132) [`88093b5`](https://github.com/Effect-TS/effect/commit/88093b57951a1b597599fe4772ab690b36a95818) Thanks @LeonardoTrapani! - Fix activity count leaks when workflow activity acquisition is interrupted, which could block later workflow suspension.

- [#7669](https://github.com/Effect-TS/effect/pull/7669) [`d14c463`](https://github.com/Effect-TS/effect/commit/d14c4631ac82911a8ca0b6c24c14ecb95863ee6b) Thanks @kitlangton! - Fix folded YAML scalars to preserve paragraph and indentation breaks.

- [#7872](https://github.com/Effect-TS/effect/pull/7872) [`d473bd3`](https://github.com/Effect-TS/effect/commit/d473bd3ee966a3a0c245d0e3c752fd91368b8ff6) Thanks @kitlangton! - Preserve defined falsy Error causes (`0`, `false`, `""`, `null`, `0n`, and `NaN`) in `Formatter.format` output. Missing and explicitly `undefined` causes remain omitted.

- [#7451](https://github.com/Effect-TS/effect/pull/7451) [`84864bc`](https://github.com/Effect-TS/effect/commit/84864bc30c9e92a1226f65bb78b0641a7e0acea2) Thanks @gcanti! - Fix equivalence derivation for schema class APIs by adopting the equivalence of
  their declared fields. Class declarations previously fell back to
  `Equal.equals`, which also compared runtime properties outside the schema and
  could make field-equivalent class instances compare as unequal.

- [#7920](https://github.com/Effect-TS/effect/pull/7920) [`e2ae724`](https://github.com/Effect-TS/effect/commit/e2ae72481e755a454f28ce45e90f43b857b7c6e5) Thanks @kitlangton! - Fix `Graph.bellmanFord` reporting a negative cycle as affecting a target across an impassable, positive-infinite-weight edge. Targets separated from the cycle by such edges now retain their finite shortest path or remain unreachable, while targets reachable from the cycle through finite-weight edges still report an error.

- [#7625](https://github.com/Effect-TS/effect/pull/7625) [`f921ed3`](https://github.com/Effect-TS/effect/commit/f921ed305c63415dc468e94d9319cc3237119138) Thanks @kitlangton! - Prevent `HashMap` iterators from exposing mutable internal collision entries.

- [#7886](https://github.com/Effect-TS/effect/pull/7886) [`1df933d`](https://github.com/Effect-TS/effect/commit/1df933d1dee2e09a25f9c27214b31aa94fa9d020) Thanks @kitlangton! - Fix `HashRing.getShards` skipping an eligible node at the first ring position when other nodes have reached their allocation quota.

- [#7629](https://github.com/Effect-TS/effect/pull/7629) [`829aff9`](https://github.com/Effect-TS/effect/commit/829aff97d71d7900b7765ba2f63e33874b898cdc) Thanks @kitlangton! - Compare header names case-insensitively in `Headers.isRedactedName`.

- [#7627](https://github.com/Effect-TS/effect/pull/7627) [`aa0aba3`](https://github.com/Effect-TS/effect/commit/aa0aba383382ca1b99fbe618dceba63c3a5a6a53) Thanks @kitlangton! - Fix `Headers.redact` and `Headers.isRedactedName` skipping matches when a redaction pattern is a global or sticky regular expression.

- [#7945](https://github.com/Effect-TS/effect/pull/7945) [`a71140f`](https://github.com/Effect-TS/effect/commit/a71140fbe79809aa5311a55b1c6908905dc2df26) Thanks @kitlangton! - Constrain the data-first `HttpClient.catch(client, recover)` overload to recover with
  `HttpClientResponse` values, matching the data-last overload. Callbacks returning other
  success types are now rejected; use `Effect.catch` on the result of `client.execute(request)`
  to recover to arbitrary values.

- [#7922](https://github.com/Effect-TS/effect/pull/7922) [`0276a27`](https://github.com/Effect-TS/effect/commit/0276a27ddbb15d163daf56f059ca9f62c4fd9939) Thanks @kitlangton! - Fix `HttpClient.followRedirects` bypassing response-level recovery when request preprocessing fails.

- [#8131](https://github.com/Effect-TS/effect/pull/8131) [`10d2c98`](https://github.com/Effect-TS/effect/commit/10d2c983a80d19b84fb52f33c7f719ebd81746bb) Thanks @gcanti! - Fix `HttpClientResponse.schemaJson` and `HttpClientResponse.schemaNoBody` to apply parse options when decoding response
  schemas.

- [#7679](https://github.com/Effect-TS/effect/pull/7679) [`c86c999`](https://github.com/Effect-TS/effect/commit/c86c99939e1628813a2f92f0906cfbbe924504e8) Thanks @kitlangton! - Close request scopes for streaming HEAD responses.

- [#7681](https://github.com/Effect-TS/effect/pull/7681) [`975f758`](https://github.com/Effect-TS/effect/commit/975f7586f3dcda5743d6570a740013a9fbdce9a7) Thanks @kitlangton! - Preserve `Content-Length` headers in `HttpServerResponse.fromWeb`.

- [#7689](https://github.com/Effect-TS/effect/pull/7689) [`2a3a478`](https://github.com/Effect-TS/effect/commit/2a3a4783bcd2d4e91e3505c7a6c1e398fea89595) Thanks @kitlangton! - Normalize router prefixes before removing them from handler request URLs.

- [#7898](https://github.com/Effect-TS/effect/pull/7898) [`1e6e206`](https://github.com/Effect-TS/effect/commit/1e6e206f6327a114f55a541775f465c0bc9fbf3e) Thanks @kitlangton! - Fix `HttpRunner` HTTP and WebSocket client URLs adding an extra leading slash to slash-prefixed paths. Insert the address/path separator only when it is missing, preserving intentional leading and interior slashes.
  
  This path correction is normally masked by router normalization, but prevents route misses for non-root paths when duplicate-slash normalization is disabled. Applications that compensate for the extra slash may need to remove that compensation. Router defaults and shared trailing-slash handling are unchanged.

- [#7927](https://github.com/Effect-TS/effect/pull/7927) [`fa6027b`](https://github.com/Effect-TS/effect/commit/fa6027b16e65376078e526fa33116ac0cc82485b) Thanks @tim-smart! - Reduce cold start cost of `HttpRouter` and `HttpEffect` web handlers.
  
  - `HttpServerRespondable` no longer imports `Schema` to detect schema errors, which removes the Schema modules from bundles that do not otherwise use them (about 23% of a minimal `HttpRouter` bundle).
  - `HttpRouter.toWebHandler`, `HttpEffect.toWebHandlerLayer` and `HttpEffect.toWebHandlerLayerWith` now build the layer immediately instead of on the first request. A failed build never surfaces as an unhandled rejection; every request rejects with the build error instead.

- [#7561](https://github.com/Effect-TS/effect/pull/7561) [`7616f73`](https://github.com/Effect-TS/effect/commit/7616f73c16bd45a3a3e2202d3f81c6d1cc63f4e0) Thanks @jensdev! - Fix `HttpApiMiddleware`-declared errors being duplicated and mis-encoded.

- [#7954](https://github.com/Effect-TS/effect/pull/7954) [`fc668b6`](https://github.com/Effect-TS/effect/commit/fc668b61e9755545a47582dee6c4425d5652cbb6) Thanks @fitchmultz! - Allow generated `HttpApiClient` methods and `AtomHttpApi` queries and mutations to accept native SSE decode options per call through the request's `sseOptions` field.

- [#7994](https://github.com/Effect-TS/effect/pull/7994) [`d425c8c`](https://github.com/Effect-TS/effect/commit/d425c8c1319519e861714bcb9d055b63a9434fad) Thanks @tim-smart! - Prevent unencodable atom values from aborting dehydration of the rest of an atom registry.

- [#7935](https://github.com/Effect-TS/effect/pull/7935) [`ce120f4`](https://github.com/Effect-TS/effect/commit/ce120f474b87d8a5a787dd7f848177ecd3b960fc) Thanks @kitlangton! - Fix `Layer.tapError` and `Layer.tapCause` to require observers that accept the source layer's complete error type.

- [#7983](https://github.com/Effect-TS/effect/pull/7983) [`248201f`](https://github.com/Effect-TS/effect/commit/248201f7846d855685a4dc1b2f01968981706d69) Thanks @kitlangton! - Honor `captureStackTrace` in both forms of `Layer.withSpan`. Layer construction diagnostics previously reported a location inside `Layer.ts` instead of the `withSpan` call site, and ignored `captureStackTrace: false` or a supplied lazy stack.

- [#7937](https://github.com/Effect-TS/effect/pull/7937) [`e80d397`](https://github.com/Effect-TS/effect/commit/e80d3972fcca4e986b6497d67406f45ee1be540d) Thanks @kitlangton! - Preserve resource acquisition errors on `LayerMap.Service` when `preload: true` is set. The yielded service instance and its `get`, `contextEffect`, and `contextEffectOption` accessors now retain the resource error type because a resource can fail when reacquired, even if preloading succeeded.
  
  Consumers that assumed these accessors had a `never` error must handle the resource error. Runtime behavior is unchanged.

- [#7874](https://github.com/Effect-TS/effect/pull/7874) [`f1a941d`](https://github.com/Effect-TS/effect/commit/f1a941d52c2f71973e998883869e4e9ef510abf2) Thanks @kitlangton! - Fix `Logger.toFile` dropping the remainder of a log batch when a successful file write writes only part of the buffer. File logging now uses the complete-write contract; write errors continue to be ignored.

- [#7814](https://github.com/Effect-TS/effect/pull/7814) [`73bc3a1`](https://github.com/Effect-TS/effect/commit/73bc3a13b6e1b7a060e6bcd19ae7796443211a80) Thanks @kitlangton! - Fix `McpServer` HTTP resource templates failing to resolve.

- [#7816](https://github.com/Effect-TS/effect/pull/7816) [`b628bb1`](https://github.com/Effect-TS/effect/commit/b628bb1240a09df2244c3ff6c587f978feb25225) Thanks @kitlangton! - Fix `McpServer.registerPrompt` callback types to use decoded prompt parameters.

- [#7495](https://github.com/Effect-TS/effect/pull/7495) [`6e3ae7b`](https://github.com/Effect-TS/effect/commit/6e3ae7b6359bda08cea74b761fd54224d7af45e2) Thanks @IMax153! - McpServer no longer sends `null` or array tool results as `structuredContent`, which MCP requires to be a JSON object.

- [#7835](https://github.com/Effect-TS/effect/pull/7835) [`e891247`](https://github.com/Effect-TS/effect/commit/e8912473bd4128714a0f8cb04621f3e12f62a910) Thanks @kitlangton! - Remove queued control envelopes when clearing an address from in-memory message storage.

- [#7993](https://github.com/Effect-TS/effect/pull/7993) [`53e6c73`](https://github.com/Effect-TS/effect/commit/53e6c7311b948a62e93e57f6daee66a8ec24b030) Thanks @kitlangton! - Ensure metrics with equal attributes share a series regardless of attribute insertion order.

- [#7991](https://github.com/Effect-TS/effect/pull/7991) [`1579d6f`](https://github.com/Effect-TS/effect/commit/1579d6fd063e444e4fcdfd08ff194c7485203f9c) Thanks @kitlangton! - Fix metrics reused across different `MetricRegistry` services to read and update the active registry while preserving each registry's values when revisited.

- [#7665](https://github.com/Effect-TS/effect/pull/7665) [`d3c6b73`](https://github.com/Effect-TS/effect/commit/d3c6b73cc4b78f22fdb2e25c8bebda027551540b) Thanks @kitlangton! - Fix `Model.FieldOption` to preserve omitted variants.

- [#7987](https://github.com/Effect-TS/effect/pull/7987) [`4a59c6a`](https://github.com/Effect-TS/effect/commit/4a59c6a559e69d399b00c6acd48c8e1977e34875) Thanks @kitlangton! - Add `Multipart.isStreamPart` to recognize only a text `Field` or streamed `File`, while preserving `Multipart.isPart` for all branded multipart parts, including `PersistedFile` values.

- [#7519](https://github.com/Effect-TS/effect/pull/7519) [`145d8e1`](https://github.com/Effect-TS/effect/commit/145d8e1013220425b8edf34f7011c73f73e1cdcf) Thanks @gcanti! - Fix `Schema.mutable` to preserve array and tuple metadata and reject node-level encodings.

- [#7776](https://github.com/Effect-TS/effect/pull/7776) [`f74282c`](https://github.com/Effect-TS/effect/commit/f74282cb08de808b678ce67687acbcd61939d2f6) Thanks @kitlangton! - Preserve values added to an empty `MutableList` by `prependAll` when appending more values.

- [#7571](https://github.com/Effect-TS/effect/pull/7571) [`0a38623`](https://github.com/Effect-TS/effect/commit/0a3862349ebfbc41746aa0de5e682992719c1da6) Thanks @tim-smart! - Export the `Random.Random` service interface and `Metric.MetricRegistry` type so custom service implementations can be annotated without accessing `Context.Reference` phantom types.

- [#7524](https://github.com/Effect-TS/effect/pull/7524) [`0a08ae0`](https://github.com/Effect-TS/effect/commit/0a08ae0626f8124779ec2e32ae2088d28db157c6) Thanks @fubhy! - Add `NetAddress` under `effect/unstable/net` for MAC, IP, internet socket, and Unix socket addresses, with checked parsing, schemas, equality, canonical string serialization, and URL formatting. Companion modules `IpInterface` and `IpNetwork` represent IP interfaces and CIDR networks.
  
  HTTP and socket servers now expose `NetAddress.SocketAddress`. Replace TCP `hostname` access with `NetAddress.formatIp(address.address)` and use `UnixPathAddress.path` for Unix sockets. URL helpers bracket IPv6 addresses and reject scoped IPv6. Bun and Deno HTTP server layers can now fail with `ServeError` when listener address conversion fails.
  
  PostgreSQL `inet` values now use `IpInterface`; `cidr` values use `IpNetwork` and reject addresses with host bits set.

- [#7443](https://github.com/Effect-TS/effect/pull/7443) [`fa6a56b`](https://github.com/Effect-TS/effect/commit/fa6a56b862229cfb699e076bac50e3b737ae3c72) Thanks @youngspe! - Terminate the `Stream.fromEventListener` stream after one item if `once: true`.

- [#7510](https://github.com/Effect-TS/effect/pull/7510) [`d60c5d4`](https://github.com/Effect-TS/effect/commit/d60c5d40b5954ea1557aef1502b4b87f98bbf134) Thanks @gcanti! - Normalize numeric collection and batch counts across `Stream`, `Channel`, `Sink`, `MutableList`, `RequestResolver`, `Queue`, `TxQueue`, `PubSub`, and `HashRing`, preventing fractional, `NaN`, and non-positive counts from producing incorrect output, exceptions, waits for the wrong batch size, or non-terminating pulls.

- [#7910](https://github.com/Effect-TS/effect/pull/7910) [`07ffd25`](https://github.com/Effect-TS/effect/commit/07ffd25bd0e82c9e6b72b8e669833fb4531a9da3) Thanks @kitlangton! - Fix `Number.remainder` to preserve negative-zero dividends with ordinary finite divisors.

- [#7547](https://github.com/Effect-TS/effect/pull/7547) [`9b517ad`](https://github.com/Effect-TS/effect/commit/9b517ad28a0c2f213693bcab408658c40e3b6d9b) Thanks @tim-smart! - Improve `PersistedQueue` reliability across SQL, Redis, and memory stores. Retry policy now lives on `make()`, attempts count on claim, retries follow a `Schedule`, and exhausted or undecodable elements are dead-lettered. Add retention cleanup, durable acknowledgement retries, storage schema fixes, local poll wakeups, and fixes for the memory take race and Redis dedup growth.

- [#7778](https://github.com/Effect-TS/effect/pull/7778) [`604b1c1`](https://github.com/Effect-TS/effect/commit/604b1c109d6c9e654b9b7fcc98d6b80361400325) Thanks @kitlangton! - Ensure `Optic.pick` and `Optic.omit` delete focused optional fields omitted from a replacement.

- [#7780](https://github.com/Effect-TS/effect/pull/7780) [`ccc2e02`](https://github.com/Effect-TS/effect/commit/ccc2e02def5965f5535ca97fac2051f4387c4e13) Thanks @kitlangton! - Fix `Optic.optionalKey` to splice tuple elements selected by string indices.

- [#7782](https://github.com/Effect-TS/effect/pull/7782) [`14d810a`](https://github.com/Effect-TS/effect/commit/14d810a726caad8a7b0d42f04a6876f25fbcc005) Thanks @kitlangton! - Fix `Order.combineAll` consuming one-shot iterables after the first comparison.

- [#7931](https://github.com/Effect-TS/effect/pull/7931) [`a9d1ee3`](https://github.com/Effect-TS/effect/commit/a9d1ee3d4d51e97ea33440fe6100935d5fd5aada) Thanks @tim-smart! - Fix disabled OTLP batching to skip empty exports and avoid resending buffered items.

- [#7929](https://github.com/Effect-TS/effect/pull/7929) [`a31adbe`](https://github.com/Effect-TS/effect/commit/a31adbefd6c04c70536de11433edba9edd1f5013) Thanks @tim-smart! - Speed up `OtlpTracer` span creation and export. Spans now allocate identifiers, attributes, and events lazily, and `Encoding.randomHex` produces flat strings for 16 and 32 character identifiers so serialization no longer flattens ropes.

- [#7584](https://github.com/Effect-TS/effect/pull/7584) [`7245f87`](https://github.com/Effect-TS/effect/commit/7245f87ace09806d15893df8f0bac8f0b9b817db) Thanks @kitlangton! - Fix `PartitionedSemaphore` leaving a new waiter suspended when a previously resumed waiter for the same partition is interrupted before its acquisition completes.

- [#7766](https://github.com/Effect-TS/effect/pull/7766) [`3a0828b`](https://github.com/Effect-TS/effect/commit/3a0828b058abb4b4646bd880458b4e636d77d1c3) Thanks @kitlangton! - Persist synchronous defects thrown by `PersistedCache` lookups.

- [#7604](https://github.com/Effect-TS/effect/pull/7604) [`cd83544`](https://github.com/Effect-TS/effect/commit/cd83544dd594b99e8ea0d7a7645c086f5861769b) Thanks @kitlangton! - Keep `Pool.reserve` items out of shared circulation when other borrowers return or overlapping reservations close. Restore available slots only after the last reservation closes.

- [#8078](https://github.com/Effect-TS/effect/pull/8078) [`6550a07`](https://github.com/Effect-TS/effect/commit/6550a074c5c501d8a95dcd354f17e9785a1ae1eb) Thanks @tim-smart! - Port `HttpApiBuilder.handler` from v3 to define reusable endpoint callbacks with inferred request, response, error, and service types.

- [#7663](https://github.com/Effect-TS/effect/pull/7663) [`6f090d4`](https://github.com/Effect-TS/effect/commit/6f090d4c2032cc35f7f9a9eac900d0329b8ac07e) Thanks @kitlangton! - Preserve schema classes when extracting their default `VariantSchema` variant.

- [#7760](https://github.com/Effect-TS/effect/pull/7760) [`b505c0d`](https://github.com/Effect-TS/effect/commit/b505c0db03e86eb126237690a5867f457eb4237f) Thanks @kitlangton! - Preserve negative counter deltas in OTLP and OpenTelemetry metric exports.

- [#7478](https://github.com/Effect-TS/effect/pull/7478) [`186dd49`](https://github.com/Effect-TS/effect/commit/186dd4914084fa346a870ce9c637b9c2a6cc8100) Thanks @gcanti! - Normalize numeric collection counts consistently across `Array`, `Chunk`, `Iterable`, and `String`, and make `TupleOf` fall back to `Array` for positive fractional lengths.

- [#8097](https://github.com/Effect-TS/effect/pull/8097) [`9f37e58`](https://github.com/Effect-TS/effect/commit/9f37e58d00e06150d96af48fffe780947ca0d519) Thanks @tim-smart! - Keep the previous prompt frame visible until the next frame or submission is ready to display.

- [#7637](https://github.com/Effect-TS/effect/pull/7637) [`4446451`](https://github.com/Effect-TS/effect/commit/44464510114773e1ebd1abb6efffa382cf69998e) Thanks @kitlangton! - Preserve text parts and provider options when serializing prompts.

- [#7639](https://github.com/Effect-TS/effect/pull/7639) [`58be972`](https://github.com/Effect-TS/effect/commit/58be97238ee1f6cd26f6a3a645d1df97a091a224) Thanks @kitlangton! - Preserve generated files when converting AI responses to prompts.

- [#7603](https://github.com/Effect-TS/effect/pull/7603) [`1320075`](https://github.com/Effect-TS/effect/commit/1320075fd4ed381f60f6f37f280dbec17cb29b81) Thanks @kitlangton! - Fix capacity-one PubSub subscriber cursors after sliding past messages, including duplicate delivery and invalid state when unsubscribing from a slid message.

- [#7487](https://github.com/Effect-TS/effect/pull/7487) [`ba53b64`](https://github.com/Effect-TS/effect/commit/ba53b646e9dad9b39fd6cf5b2d89de9bf858bb80) Thanks @tim-smart! - Redesign `Socket` around a scoped, pull-based reader with transport backpressure.
  
  `Socket` now exposes `reader` and `writer`. Client reader acquisition dials and yields a pull of non-empty batches: one buffer for TCP and one entry per WebSocket frame. TCP applies backpressure while paused; pausable WebSockets pause at `highWaterMark` (64 KiB by default) and resume after draining. Browser WebSockets cannot pause, so they can fail with `SocketReadError` at a configured `highWaterMark`. Writes await native drain signals and batch with `cork` / `uncork` where available.
  
  ### Breaking changes
  
  - `Socket.run`, `Socket.runString`, and `Socket.runRaw` are removed. Acquire `socket.reader` (or `Socket.readerBytes` / `Socket.readerString`) in a scope and pull in a loop. Code before the first pull replaces `onOpen`.
  - `Socket.make` now takes `{ reader, writer }`. The writer acquisition is infallible and yields a `Writer` with `write` and `writeAll`; both operations can still fail with `SocketError`.
  - Every close fails the pull with `SocketError` wrapping `SocketCloseError`. The close-code predicates are removed; use `Effect.retry` around the scoped read loop to reconnect.
  - `Socket.toChannel` and `Socket.toChannelString` now read from the pull and fail on close. `Socket.toStream` is added for read-only consumption.
  - `fromWebSocket` drops the `onInitialRun` option; `SendQueueCapacity` is removed.
  - Accepted server sockets pause immediately. Their reader attaches to the existing connection and cannot reconnect after close.

- [#7806](https://github.com/Effect-TS/effect/pull/7806) [`f7490d4`](https://github.com/Effect-TS/effect/commit/f7490d49c75b99118c6c42549511ffa166459f59) Thanks @tim-smart! - Add `Queue.flush` and `Queue.flushUnsafe` for manually releasing pending takers, including after synchronous offers.

- [#7576](https://github.com/Effect-TS/effect/pull/7576) [`c8ea602`](https://github.com/Effect-TS/effect/commit/c8ea60231ad69e23c0bf319f6f6b3ff28fc45e4b) Thanks @kitlangton! - Fix `Queue` message duplication, capacity overruns, and consumer defects when a resumed producer synchronously uses the same queue. Zero-capacity queues now reserve each handed-off message for its consumer before resuming the producer.

- [#7498](https://github.com/Effect-TS/effect/pull/7498) [`62d82f4`](https://github.com/Effect-TS/effect/commit/62d82f4919c72d8cc0cfd2b704ed6900f69ad9a8) Thanks @gjermundgaraba! - Allow `SqlEventJournal` to decode entry identifiers and payloads from SQL drivers that return BLOB values as `ArrayBuffer`.

- [#7644](https://github.com/Effect-TS/effect/pull/7644) [`a2c9e7c`](https://github.com/Effect-TS/effect/commit/a2c9e7c17a4118b74a1eab3332042dafe0bb7318) Thanks @gcanti! - Remove the redundant `Graph.Proto` interface. Use `Graph.Graph<N, E, Graph.Kind>` when accepting any immutable graph.

- [#7497](https://github.com/Effect-TS/effect/pull/7497) [`97dd022`](https://github.com/Effect-TS/effect/commit/97dd022fe7fbd1696dd60f3319eae594abdd3760) Thanks @javascript-unsafe! - Treat `NaN` as a non-positive count in `Stream.take`.

- [#7864](https://github.com/Effect-TS/effect/pull/7864) [`f984ee8`](https://github.com/Effect-TS/effect/commit/f984ee82d255c7958eeed6f0dd08de1b88cbbfd6) Thanks @kitlangton! - Fix `Random.nextBetween` and `Crypto.randomBetween` returning their exclusive upper bound when floating-point arithmetic rounds up.

- [#7985](https://github.com/Effect-TS/effect/pull/7985) [`f1b2910`](https://github.com/Effect-TS/effect/commit/f1b291027c3055f801c2f288dda21ba84c361956) Thanks @kitlangton! - Report the exact remaining store lifetime in `RateLimiter` fixed-window `resetAfter` metadata when `onExceeded` is `"delay"`, instead of rounding up to a whole window. Admission, returned delays, and remaining-token counts are unchanged.

- [#7516](https://github.com/Effect-TS/effect/pull/7516) [`a29e05a`](https://github.com/Effect-TS/effect/commit/a29e05a907053a8617763b4e7408e1f012b59049) Thanks @kitlangton! - Fix `RcMap` and `LayerMap` cleanup after invalidating an actively borrowed entry and reacquiring the same key.
  The invalidated resource is released when its last borrower closes, even with infinite idle TTL, without removing
  the replacement entry. Old idle timers also leave replacement entries untouched.

- [#7605](https://github.com/Effect-TS/effect/pull/7605) [`1aa1d8b`](https://github.com/Effect-TS/effect/commit/1aa1d8bd0f2c2d429938657927f34f8ff0f940a0) Thanks @kitlangton! - Fix `RcMap` entries getting stuck when the lookup function throws synchronously. Later borrowers now receive the defect, and unused entries are released according to their idle TTL instead of permanently consuming capacity.

- [#7598](https://github.com/Effect-TS/effect/pull/7598) [`bb99734`](https://github.com/Effect-TS/effect/commit/bb99734ef87bcc377c628bc4072aa856ce5f7ca6) Thanks @kitlangton! - Keep `RcRef` closed when an in-flight acquisition finishes after its owning scope has closed. Release the late-acquired resource and interrupt waiting borrowers instead of making the resource available again.

- [#7586](https://github.com/Effect-TS/effect/pull/7586) [`222e7ca`](https://github.com/Effect-TS/effect/commit/222e7caa4bb0da6d81a4eabf25dffc181c20f6a3) Thanks @kitlangton! - Prevent `RcRef` borrower cleanup from discarding replacement resources after invalidation or reopening a reference after its owner scope has closed.

- [#7565](https://github.com/Effect-TS/effect/pull/7565) [`797c9e3`](https://github.com/Effect-TS/effect/commit/797c9e3c1f2e66db1570cf6aa5c4a15e94507bf0) Thanks @typedrat! - Type `Cause.Reason#annotate` as accepting a `Context` only.

- [#7461](https://github.com/Effect-TS/effect/pull/7461) [`b4d5398`](https://github.com/Effect-TS/effect/commit/b4d5398598c04a84054a55873c943d587880058d) Thanks @tim-smart! - Remove the MessagePack encoding and RPC serialization APIs together with the `msgpackr` dependency. Event-log persistence and remote messages now use SchemaBinary, and cluster transports use SchemaBinary unless NDJSON is selected explicitly.

- [#8143](https://github.com/Effect-TS/effect/pull/8143) [`c8349ed`](https://github.com/Effect-TS/effect/commit/c8349ede1a2add807e9ec9c37612b3a39bf284f8) Thanks @gcanti! - Rename `SchemaGetter.transformOrFail` to `SchemaGetter.transformEffect` and `SchemaTransformation.transformOrFail` to `SchemaTransformation.transformEffect`. Replace calls to the old names with their `transformEffect` equivalents.

- [#8022](https://github.com/Effect-TS/effect/pull/8022) [`8426e5f`](https://github.com/Effect-TS/effect/commit/8426e5f7ad11f15e39565cf8ba0874bf974f5085) Thanks @kitlangton! - Correct the `Effect.repeatOrElse` fallback type to expose the previous step's `Schedule.Metadata`, matching the existing runtime value.

- [#7520](https://github.com/Effect-TS/effect/pull/7520) [`26e0085`](https://github.com/Effect-TS/effect/commit/26e0085d098f6e526c085c357b8d82ee068b6518) Thanks @ebramanti! - Report recovered MCP toolkit failures and defects to configured `ErrorReporter`s, including declared tool failures returned with `isError: true`.

- [#7583](https://github.com/Effect-TS/effect/pull/7583) [`1a86166`](https://github.com/Effect-TS/effect/commit/1a86166f102b517ee4d89dca0095e28f738eee10) Thanks @kitlangton! - Fix `RequestResolver.withCache` retaining abandoned entries when a pending request is cancelled

- [#7613](https://github.com/Effect-TS/effect/pull/7613) [`0856631`](https://github.com/Effect-TS/effect/commit/0856631a89d8f72d206c366905ddac75468a8e85) Thanks @kitlangton! - Preserve completed results and propagate resolver failures from `RequestResolver.persisted`.

- [#7594](https://github.com/Effect-TS/effect/pull/7594) [`0af0985`](https://github.com/Effect-TS/effect/commit/0af0985d5c132b33e14a2df59e0567d7ba2a1710) Thanks @kitlangton! - Keep completed results in `RequestResolver.withCache` when a losing `RequestResolver.race` resolver is interrupted after the winner completes, avoiding repeated backend requests on subsequent equal lookups.

- [#7979](https://github.com/Effect-TS/effect/pull/7979) [`bc582c9`](https://github.com/Effect-TS/effect/commit/bc582c94313cbb89d87b3844ffffabebbb4ffa83) Thanks @kitlangton! - Preserve typed errors, defects, and interrupts from `RequestResolver.fromEffectTagged` handlers.

- [#7981](https://github.com/Effect-TS/effect/pull/7981) [`2c63f1e`](https://github.com/Effect-TS/effect/commit/2c63f1e07e375b7958e14929c6a4b358c819a9d0) Thanks @kitlangton! - Fix `RequestResolver.fromEffectTagged` to consume handler results as an iterable, allowing arrays, iterators, and generators to resolve requests in order.

- [#8024](https://github.com/Effect-TS/effect/pull/8024) [`0d98213`](https://github.com/Effect-TS/effect/commit/0d9821346453d44696258103643d5482e63638b4) Thanks @kitlangton! - Fix `Types.RequiredKeys` dropping named required keys on types with index signatures. Derived type annotations may need to include these keys.

- [#7496](https://github.com/Effect-TS/effect/pull/7496) [`ca6f0dc`](https://github.com/Effect-TS/effect/commit/ca6f0dc4fcea564b351bf505df015d16a8b965ed) Thanks @nikhilsnayak! - Add `HttpClientResponse.url`, including query parameters and excluding the hash. When redirects are followed, it reports
  the final URL.

- [#7683](https://github.com/Effect-TS/effect/pull/7683) [`d8cc9ed`](https://github.com/Effect-TS/effect/commit/d8cc9ed80e1df9c056a46ba62df01f7fc0f531c3) Thanks @kitlangton! - Preserve zero and empty-string request IDs in JSON-RPC control messages.

- [#7930](https://github.com/Effect-TS/effect/pull/7930) [`42fd969`](https://github.com/Effect-TS/effect/commit/42fd969b45025eed6d60cb87b97c5ff88d187671) Thanks @tim-smart! - The default scheduler falls back to a microtask when setting a timer throws. Cloudflare Workers disallow timers in global scope, so an effect that yielded while running at module load failed with "Disallowed operation called within global scope".

- [#7558](https://github.com/Effect-TS/effect/pull/7558) [`5641ad3`](https://github.com/Effect-TS/effect/commit/5641ad333a88bb9e56baf886006682678391be0a) Thanks @gcanti! - Move the built-in schema revivers from `Schema` to `SchemaRepresentation`.
  Rename the reviver constructors to `makeReviverDeclaration`,
  `makeReviverFilter`, and `makeReviverFilterGroup`.
  
  Change `Schema.toEncoderXml` to fail with `SchemaIssue.Issue` directly instead
  of wrapping failures in `SchemaError`. Consumers that read `error.issue` should
  now use the error value itself.

- [#7641](https://github.com/Effect-TS/effect/pull/7641) [`629870d`](https://github.com/Effect-TS/effect/commit/629870d461b36d3dacb30c8d203b8d20d4beaba0) Thanks @kitlangton! - Preserve array-valued leaves when `SchemaGetter.makeTreeRecord` aggregates duplicate paths.

- [#7673](https://github.com/Effect-TS/effect/pull/7673) [`d592c14`](https://github.com/Effect-TS/effect/commit/d592c1492ad895ea72537e10387b735f3ba0e7de) Thanks @kitlangton! - Preserve leading U+FEFF characters in SchemaBinary string values when decoding.

- [#8131](https://github.com/Effect-TS/effect/pull/8131) [`10d2c98`](https://github.com/Effect-TS/effect/commit/10d2c983a80d19b84fb52f33c7f719ebd81746bb) Thanks @gcanti! - Align Schema construction and parsing semantics, simplify parse options, accept inherited declared fields, and move Union settings into a node-local options object.
  
  ### Breaking changes
  
  - `Class.make`, `Class.makeOption`, and `Class.makeEffect` now return an existing instance unchanged. This avoids duplicate initialization and makes the construction APIs consistent. Use `new MyClass(input)` when a distinct instance is required.
  
  - `Literal(0)` and `Literal(-0)` continue to accept either signed zero, but decoding and encoding now preserve the input sign. Add an explicit transformation when a canonical sign is required.
  
  - `parseOptions` annotations no longer affect parsing. Options passed when creating or calling a decoder, encoder, or constructor adapter now apply to the complete operation. Move operation-wide settings from annotations to the relevant parser API.
  
  - `propertyOrder` has been removed from `ParseOptions` because preserving input order required a separate, rarely used object reconstruction path. Schema parsing no longer guarantees that decoded object keys follow their input order. Remove the option and apply any required presentation or serialization order after parsing.
  
  - `concurrency` now applies only to product children: tuple elements, array elements, struct fields, record entries, and structs with rest. It follows `Effect.forEach` semantics, defaults to sequential execution, and applies independently at every nested product. Union candidates remain sequential because speculative candidate evaluation can run transformations that are not selected. Existing product parsing can keep the option. Replace code that relied on concurrent Union candidates with explicitly coordinated parser calls. With concurrent Record key transformations, completion order determines the retained value when transformed keys collide.
  
  - `onExcessProperty: "preserve"` has been removed because it allowed unvalidated values absent from the schema type to cross the parsing boundary. Model additional properties with `Record` or `StructWithRest`; `"ignore"` and `"error"` remain available.
  
  - Declared `Struct` fields may now be inherited and are copied to own properties in the output. Dynamic `Record` index signatures remain own-only, while finite literal record keys are declared and may be inherited. The `__proto__` field remains own-only. Check ownership before parsing when every declared field must be own.
  
  - `SchemaAST.Union.mode` moved to `SchemaAST.Union.options?.mode` so node-local constructor settings live in one options object instead of special top-level fields. An absent value defaults to `"anyOf"`. `SchemaRepresentation.Union` now serializes `{ options: { mode: "oneOf" } }`; update direct AST access and regenerate or migrate persisted representation documents. The public `Schema.Union(members, { mode })` call is unchanged.

- [#8147](https://github.com/Effect-TS/effect/pull/8147) [`53909a9`](https://github.com/Effect-TS/effect/commit/53909a9bf14b29725a08dcccde02bee8e95a6b14) Thanks @gcanti! - JSON Schema generation now follows the canonical JSON codec more closely and leaves unmodeled object properties open by default, matching Effect decoding.
  
  ### Breaking changes
  
  `Schema.ToJsonSchemaOptions.additionalProperties` has been replaced by `onExcessProperty`:
  
  - Replace `{ additionalProperties: true }` with `{ onExcessProperty: "ignore" }`.
  - Replace `{ additionalProperties: false }` with `{ onExcessProperty: "error" }`.
  - Replace a schema-valued `additionalProperties` option with `Schema.Record` or `Schema.StructWithRest`.
  
  `Schema.Enum` now rejects non-finite numeric members. `Schema.isMultipleOf` now rejects zero and non-finite divisors, and normalizes negative divisors.
  
  Generation is more accurate for index signatures, empty structs, template literal alternatives, capitalized strings, and unique symbols. Conjunctive index keys remain open by default; `onExcessProperty: "error"` constrains them with `propertyNames`.

- [#7606](https://github.com/Effect-TS/effect/pull/7606) [`78a4269`](https://github.com/Effect-TS/effect/commit/78a42697f6085c87c09b18e8095bb7541bd65261) Thanks @kitlangton! - Fix `ScopedCache.invalidateAll` discarding entries created by reentrant resource finalizers without releasing them. Entries are now removed before their finalizers run, so replacement resources remain cached and are released when the cache closes.

- [#7612](https://github.com/Effect-TS/effect/pull/7612) [`06c6307`](https://github.com/Effect-TS/effect/commit/06c6307d3d5538bc398c67a44239bc3d52ab1a4d) Thanks @kitlangton! - Capture synchronous defects thrown by `ScopedCache.refresh` lookup callbacks.

- [#8026](https://github.com/Effect-TS/effect/pull/8026) [`0847c41`](https://github.com/Effect-TS/effect/commit/0847c41e2472a347cd8f77d460d3cbdfecd4adf0) Thanks @kitlangton! - Fix `Effect.annotateLogsScoped` to restore or remove unchanged `NaN` annotations when the scope closes.

- [#8155](https://github.com/Effect-TS/effect/pull/8155) [`5a77084`](https://github.com/Effect-TS/effect/commit/5a77084651bc58617b9988606473cf9ba5ca0032) Thanks @tim-smart! - Use branded interfaces for `Reactivity`, `LanguageModel`, `EmbeddingModel`, and `Chat`. Refer to each service's same-name type instead of `.Service` or `["Service"]`; custom implementations must include `[TypeId]: TypeId`.

- [#7913](https://github.com/Effect-TS/effect/pull/7913) [`96f99b3`](https://github.com/Effect-TS/effect/commit/96f99b325da32bfa535e826d89d838d0edec0dea) Thanks @Hoishin! - Fix HttpRouter nested prefixed application order

- [#7906](https://github.com/Effect-TS/effect/pull/7906) [`7bb8781`](https://github.com/Effect-TS/effect/commit/7bb878176b8ad20cf0e671b570caf72e194f9515) Thanks @kitlangton! - Honor services explicitly supplied when registering cluster entities while retaining construction-context services as fallbacks.

- [#8114](https://github.com/Effect-TS/effect/pull/8114) [`4907e9b`](https://github.com/Effect-TS/effect/commit/4907e9b2470894ddaf0cbdec2612b59f04a51dbe) Thanks @tim-smart! - Skip optional stack capture when `Error.stackTraceLimit` is zero.

- [#8090](https://github.com/Effect-TS/effect/pull/8090) [`2a30248`](https://github.com/Effect-TS/effect/commit/2a30248b6eb739f22403456209bc468f2f4ef26a) Thanks @tim-smart! - Reduce the basic Effect bundle size by keeping cause deduplication local, making encoding lookup tables tree-shakeable, removing redundant cause field declarations, and simplifying primitive hash dispatch without changing hash values.

- [#7825](https://github.com/Effect-TS/effect/pull/7825) [`8364ddd`](https://github.com/Effect-TS/effect/commit/8364ddda233d35ee472cc2356312317a60a148a2) Thanks @kitlangton! - Resume paused WebSockets after their readers take ownership.

- [#7827](https://github.com/Effect-TS/effect/pull/7827) [`ad67d8c`](https://github.com/Effect-TS/effect/commit/ad67d8c5a1b195ff5468a9f2e963c59aa0b3166f) Thanks @kitlangton! - Count buffered WebSocket text frames by their UTF-8 byte length when enforcing `highWaterMark`.

- [#7798](https://github.com/Effect-TS/effect/pull/7798) [`ec0c087`](https://github.com/Effect-TS/effect/commit/ec0c0875262fb81c7992f5023776b8fa894c49b6) Thanks @kitlangton! - Emit CR-terminated lines from `Stream.splitLines` without pulling upstream again.

- [#7443](https://github.com/Effect-TS/effect/pull/7443) [`fa6a56b`](https://github.com/Effect-TS/effect/commit/fa6a56b862229cfb699e076bac50e3b737ae3c72) Thanks @youngspe! - Loosen Stream.addEventListener type parameter

- [#7844](https://github.com/Effect-TS/effect/pull/7844) [`a2c1ce6`](https://github.com/Effect-TS/effect/commit/a2c1ce62f04214d98d848f4cfe33d677e1a87d39) Thanks @kitlangton! - Preserve callback error identity in `SqlEventJournal.write` and `SqlEventJournal.withRemoteUncommited`.

- [#7837](https://github.com/Effect-TS/effect/pull/7837) [`91e9af0`](https://github.com/Effect-TS/effect/commit/91e9af0d5f138933d3a131ca1cfbc52d3bc55481) Thanks @kitlangton! - Preserve reply IDs in SQL-backed `MessageStorage.unprocessedMessagesById` reads.

- [#7635](https://github.com/Effect-TS/effect/pull/7635) [`7bd3f34`](https://github.com/Effect-TS/effect/commit/7bd3f34385a06157b249a351e32ffdcbe1cf2c37) Thanks @kitlangton! - Fix placeholder numbering for cached fragments used in returning helpers.

- [#7493](https://github.com/Effect-TS/effect/pull/7493) [`ef16581`](https://github.com/Effect-TS/effect/commit/ef165814eae0a199fdca5b3c2839bb4fcdfd5b5d) Thanks @utopyin! - Add `Statement.SpanPropagationEnabled` to scope driver span parenting under `sql.execute` for any SQL client. Disabled by default.
  
  ```ts
  import { Effect } from "effect"
  import { Statement } from "effect/unstable/sql"
  
  query.pipe(Effect.provideService(Statement.SpanPropagationEnabled, true))
  ```

- [#7633](https://github.com/Effect-TS/effect/pull/7633) [`1693a87`](https://github.com/Effect-TS/effect/commit/1693a877324273f5a23fa7d7fc892f4ee12f20c2) Thanks @kitlangton! - Fix SQL returning helpers to compile identifiers with dialect-specific escaping.

- [#7860](https://github.com/Effect-TS/effect/pull/7860) [`df3fc47`](https://github.com/Effect-TS/effect/commit/df3fc47609eda7843dae2b557c8fe834299e26b4) Thanks @kitlangton! - Ensure PostgreSQL shard acquisition and refresh return only the requested shards.

- [#7904](https://github.com/Effect-TS/effect/pull/7904) [`e11be41`](https://github.com/Effect-TS/effect/commit/e11be41dfc73fa6b5643ab9af7df18d6907927d7) Thanks @kitlangton! - Include the model's decoding services in the public requirements of `SqlModel.makeResolvers().insert`, alongside its existing input-encoding services.
  
  This intentionally tightens compile-time checking: previously accepted callers must now provide the services already needed to decode inserted rows at runtime. Provide those services when executing the insert with `SqlResolver.request`. `insertVoid` still requires only input-encoding services, and service-free models need no changes. Runtime behavior is unchanged.

- [#7655](https://github.com/Effect-TS/effect/pull/7655) [`2e39e8b`](https://github.com/Effect-TS/effect/commit/2e39e8bafef7d3fee9f3b324b7d50cc064376667) Thanks @kitlangton! - Fix `Stream.rechunk` failing on large source chunks.

- [#7538](https://github.com/Effect-TS/effect/pull/7538) [`11c5ee7`](https://github.com/Effect-TS/effect/commit/11c5ee7202acd3bb789d0a8ce78e6c4523071553) Thanks @gwagjiug! - Parse `Content-Length` metadata strictly across HTTP modules, ignoring malformed or unsafe values instead of coercing them.

- [#7522](https://github.com/Effect-TS/effect/pull/7522) [`1742d2f`](https://github.com/Effect-TS/effect/commit/1742d2f48441cb7b1a8d9aca3a8e6f0acbc35a96) Thanks @gwagjiug! - Ignore `Set-Cookie` headers whose cookie names do not satisfy the RFC 6265 token syntax.

- [#7619](https://github.com/Effect-TS/effect/pull/7619) [`8efc70e`](https://github.com/Effect-TS/effect/commit/8efc70ea16bee43fd9adde2871cf82a8131b80a0) Thanks @kitlangton! - Honor numeric property selectors in Struct selection and mapping utilities.

- [#7560](https://github.com/Effect-TS/effect/pull/7560) [`9642776`](https://github.com/Effect-TS/effect/commit/964277661423f398f777ec2eab4b3ecc0b53f53b) Thanks @gcanti! - Expose `SchemaAST` nodes, `SchemaIssue` nodes, `SchemaGetter.Getter`, and the `SchemaTransformation` models through structural instance interfaces instead of concrete class declarations. The constructors remain usable with `new` and `instanceof`, but their `prototype` is no longer part of the public TypeScript API. Replace type-level access through a constructor's `prototype` with the corresponding named instance interface, such as `SchemaGetter.Getter<T, E, R>`.
  
  `SchemaAST.Base` is no longer exported. Use `SchemaAST.AST` when accepting any AST node, and use the `SchemaAST.is*` guards to narrow individual variants.

- [#7790](https://github.com/Effect-TS/effect/pull/7790) [`6680828`](https://github.com/Effect-TS/effect/commit/668082885f52672e4c7fad4e0fe2bfa0e69703e2) Thanks @kitlangton! - Fix the curried `SynchronizedRef.modifySomeEffect` overload to accept only the callback, matching its runtime behavior.

- [#7569](https://github.com/Effect-TS/effect/pull/7569) [`c34edcb`](https://github.com/Effect-TS/effect/commit/c34edcb6d7a6151d53e19828c92abf7dd8450c2a) Thanks @tim-smart! - Stop declaring `SynchronizedRef` as a subtype of `Ref`, preventing `Ref` combinators from accepting values that do not implement the required runtime representation.

- [#8012](https://github.com/Effect-TS/effect/pull/8012) [`7b2c5bd`](https://github.com/Effect-TS/effect/commit/7b2c5bd3c394fa4751fb229394ac9c03e401f441) Thanks @kitlangton! - Preserve the source error type when a saved `Effect.tapDefect` operator is applied. The source error is now inferred from each application instead of when the operator is created. Runtime behavior is unchanged.

- [#7427](https://github.com/Effect-TS/effect/pull/7427) [`1a2ccee`](https://github.com/Effect-TS/effect/commit/1a2ccee2bbb93514dc66e0a9cdeb52a82172ab0e) Thanks @tim-smart! - Use SchemaBinary as the default RPC serialization for TCP cluster connections, including configurable frame limits.
  
  Cluster payloads are encoded with the binary codec on the wire. When a persisted reply cannot be encoded for JSON storage, the defect fallback that storage records is now also the reply delivered to waiting callers, so live replies always match what was persisted.
  
  SchemaBinary codecs are memoized by schema identity and wire mode, so per-message codec requests reuse the derived codec instead of rebuilding it.

- [#8094](https://github.com/Effect-TS/effect/pull/8094) [`db995df`](https://github.com/Effect-TS/effect/commit/db995df19b0381b64cc39b50aa28d7bd8f2c1294) Thanks @gcanti! - Separate template literal validation from transformed tuple parsing. `TemplateLiteralParser` now propagates its parts' decoding and encoding service requirements.
  
  ### Breaking changes
  
  `Schema.TemplateLiteral` and `SchemaAST.TemplateLiteral` now throw during construction when a part contains an encoding, including inside unions and nested templates. This also rejects transformations whose decoded and encoded types are equal. Brands and supported checks without encodings remain valid.
  
  Use `Schema.Literals([0, 1])` to describe bit spellings or `Schema.Finite` to describe finite numeric spellings. Use `Schema.TemplateLiteralParser` when you need to decode transformed parts into a tuple. Explicit `Schema.toType` or `Schema.toEncoded` projections can remove an encoding, but do not necessarily preserve the strings accepted by the old template. For example, a `Finite` part rejects the empty segment accepted by `FiniteFromString`.
  
  `Schema.toEncoded(Schema.TemplateLiteralParser(...))` now validates the structure of the template instead of accepting any string. Use `Schema.String` when unrestricted strings are intended.
  
  When parser parts require services, provide those services to the corresponding decoding or encoding effect. These requirements were previously omitted from the parser's types.

- [#7870](https://github.com/Effect-TS/effect/pull/7870) [`af0ccdd`](https://github.com/Effect-TS/effect/commit/af0ccdd13aa8917bce7161b8bc257fbe51c6a6a5) Thanks @kitlangton! - Fix `TestSchema.Asserts.ast.fields.equals` to compare ASTs for all own struct fields, including symbol and non-enumerable keys. Equivalent field schemas now compare equally regardless of schema instance identity, while differing ASTs and distinct symbol keys remain unequal.

- [#8127](https://github.com/Effect-TS/effect/pull/8127) [`addeaea`](https://github.com/Effect-TS/effect/commit/addeaea0b0abe0dc24ca1d4d0fd194a0e458be70) Thanks @tim-smart! - dispatch websocket events directly

- [#7448](https://github.com/Effect-TS/effect/pull/7448) [`7704034`](https://github.com/Effect-TS/effect/commit/770403411bcd8befef0552a0e40066abc417f6ea) Thanks @candrewlee14! - Fix response tool part assignability after narrowing generic intersected tool records.

- [#7486](https://github.com/Effect-TS/effect/pull/7486) [`e72b12f`](https://github.com/Effect-TS/effect/commit/e72b12fc305710550bc6dcb978e92de8abff88cd) Thanks @tim-smart! - Make automatic tool resolution interruption-safe for incomplete language model responses.

- [#7481](https://github.com/Effect-TS/effect/pull/7481) [`310dd9c`](https://github.com/Effect-TS/effect/commit/310dd9ce9681e97f558bb042adb35f6040ab81e3) Thanks @jpenilla! - Restore the `Effect.timeout` error message so `TimeoutError` includes the elapsed duration.

- [#8032](https://github.com/Effect-TS/effect/pull/8032) [`1c2afc1`](https://github.com/Effect-TS/effect/commit/1c2afc15bbf4ce5a91d24da99bc275b5bd744e77) Thanks @kitlangton! - Fix `Effect.timeoutOrElse` to finish interrupting the source before evaluating the fallback, preventing the source from winning after the timeout.
  
  Fallbacks now run in the caller fiber and inherit its interruptibility and supervision.

- [#8103](https://github.com/Effect-TS/effect/pull/8103) [`44f44ca`](https://github.com/Effect-TS/effect/commit/44f44cae65249801c082c3a3848016eeeac5eb24) Thanks @tim-smart! - Fix token-bucket `retryAfter`, `delay` and `resetAfter` in the memory and Redis stores. Timing now follows whole-token refill boundaries and accounts for elapsed time, including fractional token costs. Redis preserves signed fractional counts and keeps keys until capacity actually refills.
  
  `RateLimiterStore.tokenBucket` now returns `[remaining, elapsedMillis]` instead of `remaining`. Custom stores must return both values from the same atomic operation; see the `tokenBucket` docs for the contract. Returning `[remaining, 0]` keeps the old timing bug.

- [#7912](https://github.com/Effect-TS/effect/pull/7912) [`f43b9d6`](https://github.com/Effect-TS/effect/commit/f43b9d6d99cb591c0377bb1474121827201627c9) Thanks @kitlangton! - Fix `Tokenizer.truncate` to account for token costs between messages.

- [#7748](https://github.com/Effect-TS/effect/pull/7748) [`56e72b3`](https://github.com/Effect-TS/effect/commit/56e72b38c01bbe6ec921ad151f83b7849444f219) Thanks @kitlangton! - Encode tool results with the schema for their known success or failure branch.

- [#8030](https://github.com/Effect-TS/effect/pull/8030) [`50ef80e`](https://github.com/Effect-TS/effect/commit/50ef80e251b85b5ee63aed06fe0244b5433ec2fa) Thanks @kitlangton! - Fix `Effect.track(metric, mapper)` to reject source errors the mapper cannot handle.

- [#7774](https://github.com/Effect-TS/effect/pull/7774) [`fc3b718`](https://github.com/Effect-TS/effect/commit/fc3b7187114a31cbb21a250f55fda601bb3edcf0) Thanks @kitlangton! - Preserve valued prefix nodes when removing a longer key from a `Trie`.

- [#8016](https://github.com/Effect-TS/effect/pull/8016) [`ee336d8`](https://github.com/Effect-TS/effect/commit/ee336d80b4024b51654e7a2b8d869d244153fcdf) Thanks @kitlangton! - Correct the error types of `Effect.try` and `Effect.tryPromise`. Direct function forms retain `Cause.UnknownError`, while `{ try, catch }` options use the error type returned by `catch`.
  
  Explicit two-generic direct calls, union-valued arguments, and generic aliases that combine the two forms no longer compile. Use `{ try, catch }` with a real error mapper, or narrow a union before calling the constructor.
  
  Runtime behavior, callback arguments, and error mapping are unchanged.

- [#7924](https://github.com/Effect-TS/effect/pull/7924) [`d12f922`](https://github.com/Effect-TS/effect/commit/d12f922853eff2310dbe9fc9b31562ad81b38435) Thanks @kitlangton! - Correct `Tuple.evolve` result types when a transform may be `undefined`. The result now includes both the transformed and unchanged element types, matching the existing runtime behavior. Accepted inputs and runtime behavior are unchanged.
  
  Code relying on the previous, incorrect result type must handle both outcomes. For example, a number-to-string transform that may be absent now produces `number | string`, so callers assuming a number-only result must adjust.

- [#7553](https://github.com/Effect-TS/effect/pull/7553) [`46d8310`](https://github.com/Effect-TS/effect/commit/46d83101e8408c0428d9a8760e06e23a69ad6070) Thanks @tim-smart! - Move the Cookie, Cookies, Headers, and UrlParams schemas from `effect/unstable/http` to `effect/Schema`, including their record and JSON-field helper schemas.

- [#7623](https://github.com/Effect-TS/effect/pull/7623) [`59812fd`](https://github.com/Effect-TS/effect/commit/59812fd221cde16fc77c03d326c6a2cf8fbec6b9) Thanks @kitlangton! - Fix `UrlParams.fromInput` to stringify `null` values.

- [#7631](https://github.com/Effect-TS/effect/pull/7631) [`f9d0dec`](https://github.com/Effect-TS/effect/commit/f9d0dec12c5f229f05d7a74d532a85c6bbffefbf) Thanks @kitlangton! - Prevent `UrlParams.setAll` from mutating reusable overrides.

- [#7855](https://github.com/Effect-TS/effect/pull/7855) [`4372c79`](https://github.com/Effect-TS/effect/commit/4372c79a32fcecc7b6b284d49a215b2c4fef9d77) Thanks @gcanti! - Treat only unpadded decimal integers from `0` through `4294967294` as array indices in environment-backed configuration and bracket-path decoding. This preserves numeric-looking object keys and prevents out-of-range environment keys from producing impossible array lengths. Bracket paths that intend to address arrays must use `[1]` instead of `[01]`.

- [#7551](https://github.com/Effect-TS/effect/pull/7551) [`81485ef`](https://github.com/Effect-TS/effect/commit/81485ef0288a3321e75d7d4ae32b7e0e06b6f86b) Thanks @tim-smart! - Cluster shard-lock recovery no longer stalls behind a wedged reserved SQL connection.
  
  While lock storage is unhealthy, the empty liveness probe (`refresh(address, [])`) now runs on the shared pool instead of the reserved lock connection, so a hung reserved connection cannot block recovery. Failed probes are also logged as warnings instead of being silently swallowed.

- [#8028](https://github.com/Effect-TS/effect/pull/8028) [`bd393d6`](https://github.com/Effect-TS/effect/commit/bd393d63c19bdd0ab212d95576cec89051c8501c) Thanks @kitlangton! - Fix `Effect.withErrorReporting` to return an `Effect` instead of preserving input
  subtypes such as `Exit`, whose subtype-specific fields are not present on the wrapper.

- [#7570](https://github.com/Effect-TS/effect/pull/7570) [`0c95c04`](https://github.com/Effect-TS/effect/commit/0c95c04b41c2d5d09e4564fd997572207fd72595) Thanks @tim-smart! - Fix `Worker.run` hanging uninterruptibly when a worker dies before the ready handshake.

## 4.0.0-rc.112

### Minor Changes

- [#7390](https://github.com/Effect-TS/effect/pull/7390) [`a5f78d3`](https://github.com/Effect-TS/effect/commit/a5f78d3fcbaa792d49e80d103ab438e0b50812fd) Thanks @tim-smart! - Make RPC serialization schema-aware.
  
  Add `codecFor` to RPC serialization and client/server protocols so RPC and cluster
  network payloads use the transport's schema codec. Framing, cluster storage, and
  existing built-in wire formats remain unchanged.

### Patch Changes

- [#7411](https://github.com/Effect-TS/effect/pull/7411) [`20cb4f2`](https://github.com/Effect-TS/effect/commit/20cb4f260e45d37fa417c292c57be015314efe16) Thanks @altendky! - Add `RcMap.getOption` and `LayerMap.contextEffectOption` for atomically retaining
  entries only when they are already cached.

- [#7437](https://github.com/Effect-TS/effect/pull/7437) [`44675cb`](https://github.com/Effect-TS/effect/commit/44675cbce3dabfb85c68a3703b5de525768336fb) Thanks @wmaurer! - Add an optional `description` to `AiError.AuthenticationError`, rendered after the kind-based suggestion, and pass the provider's own error text through it on HTTP 401 and 403, so authentication failures report what actually went wrong instead of only a category.

- [#7393](https://github.com/Effect-TS/effect/pull/7393) [`b6bf5e1`](https://github.com/Effect-TS/effect/commit/b6bf5e14492643076454131148f97cde24ad5306) Thanks @wmaurer! - Fix `Prompt.autoComplete` swallowing `j` and `k` while typing a filter query.

- [#7401](https://github.com/Effect-TS/effect/pull/7401) [`0b9f780`](https://github.com/Effect-TS/effect/commit/0b9f780ff28b71042241791a9e8bcb5b631be2bd) Thanks @gjermundgaraba! - Retry transient EventLog remote write failures so pending local entries are synchronized after recovery.

- [#7384](https://github.com/Effect-TS/effect/pull/7384) [`150e92c`](https://github.com/Effect-TS/effect/commit/150e92c4169c245e701da02575eef0b69c3ecd64) Thanks @tim-smart! - Improve synchronous Schema decode and encode performance by preserving completed parser exits and using a direct loop for common struct parsers.

- [#7386](https://github.com/Effect-TS/effect/pull/7386) [`6740db2`](https://github.com/Effect-TS/effect/commit/6740db247ed20cb85da43c9f48ade8fecfd8c1ae) Thanks @tim-smart! - Add `Schema.TaggedUnion.matchOrElse` for partial case matching with a typed fallback.

- [#7389](https://github.com/Effect-TS/effect/pull/7389) [`d57bba1`](https://github.com/Effect-TS/effect/commit/d57bba1486fa60971b6e0bf7459a329cfd5acdc4) Thanks @tim-smart! - Improve `SchemaError` construction performance by skipping stack frame capture.

- [#7402](https://github.com/Effect-TS/effect/pull/7402) [`be75d5e`](https://github.com/Effect-TS/effect/commit/be75d5ea6e516c25e3affec25806d31c2b203bc4) Thanks @tim-smart! - Improve Pool acquisition and release performance. Pool now tracks usage
  incrementally, stores available items in an intrusive FIFO, and skips work for
  fixed and empty pools. This changes the public `Pool.State` and `Pool.PoolItem`
  interfaces.

- [#7402](https://github.com/Effect-TS/effect/pull/7402) [`be75d5e`](https://github.com/Effect-TS/effect/commit/be75d5ea6e516c25e3affec25806d31c2b203bc4) Thanks @tim-smart! - Add `Pool.use`, which borrows an item while an effect runs and returns it on any
  exit. Unlike `Effect.scoped(Pool.get(pool))`, it does not require a `Scope`.

- [#7402](https://github.com/Effect-TS/effect/pull/7402) [`be75d5e`](https://github.com/Effect-TS/effect/commit/be75d5ea6e516c25e3affec25806d31c2b203bc4) Thanks @tim-smart! - Reduce scoped resource acquisition allocations by storing the first Scope
  finalizer inline and allocating a Map only when a second is added. This changes
  the public `Scope.State.Open` interface.

- [#7424](https://github.com/Effect-TS/effect/pull/7424) [`02a5146`](https://github.com/Effect-TS/effect/commit/02a5146d6933c7f6052553550bce5658225e4100) Thanks @tim-smart! - Skip remote event journal write callbacks when there are no uncommitted entries and return an `Option` indicating
  whether the callback ran.

- [#7312](https://github.com/Effect-TS/effect/pull/7312) [`15272a6`](https://github.com/Effect-TS/effect/commit/15272a66adf02501e7747761e2a3c41bff67bb46) Thanks @godu! - Fix shell completion for choice values containing quotes, spaces, word-break characters, Unicode, and shell metacharacters.
  
  Bash now quotes candidates for readline, keeps choice values intact when reconstructing words, and supports Bash 3.2 without associative arrays. Fish and Zsh escape choices across both parsing rounds, and Fish hides value-taking flags after use without suppressing their value completions.

- [#7395](https://github.com/Effect-TS/effect/pull/7395) [`436f10d`](https://github.com/Effect-TS/effect/commit/436f10d1efccec308426532ff3f88df9a96434f3) Thanks @wmaurer! - Fix `Prompt.file` swallowing `j` and `k` while typing a filter query.

- [#7406](https://github.com/Effect-TS/effect/pull/7406) [`058fb15`](https://github.com/Effect-TS/effect/commit/058fb15647fa01ad771277bd368783fcf5f262e8) Thanks @gcanti! - Preserve finite string and unique symbol key unions in the return types of `Array.groupBy` and `Iterable.groupBy`.
  
  Previously, grouping widened finite keys to `string` or `symbol`, which lost known-key autocomplete and allowed access to keys that the selector could never produce. The new `Record.ReadonlyRecord.GroupByResult` keeps finite keys and marks their properties optional because any group may be absent at runtime, while open `string` and `symbol` selectors retain their existing record index signatures.

- [#7415](https://github.com/Effect-TS/effect/pull/7415) [`4d89bb8`](https://github.com/Effect-TS/effect/commit/4d89bb8ffb4cf567a1d11072246b6161ce638712) Thanks @gcanti! - Reject unsupported JSON Schema references instead of resolving them by their final path segment, closes [#7409](https://github.com/Effect-TS/effect/issues/7409).

- [#7420](https://github.com/Effect-TS/effect/pull/7420) [`480fb15`](https://github.com/Effect-TS/effect/commit/480fb156590785cf98f67bdec4fc282a608e2d87) Thanks @gcanti! - Make JSON Schema dialect conversions preserve custom keywords, translate conditionals, contains, dependencies, identifiers, and tuples where representable, relocate local references after structural changes, and throw instead of silently changing unsupported constraints.

- [#7417](https://github.com/Effect-TS/effect/pull/7417) [`f77ec19`](https://github.com/Effect-TS/effect/commit/f77ec19cff1cbbeeae928e3bd0ece00a7d22bab8) Thanks @Makisuo! - Defer built-in OpenAPI response generation until the documentation route is first requested, retrying after generation defects.

- [#7388](https://github.com/Effect-TS/effect/pull/7388) [`925b82a`](https://github.com/Effect-TS/effect/commit/925b82a81f59a4d459b488621030f24ba99d6a27) Thanks @ebramanti! - Fix MCP initialize rejected over the protocol version header
  
  `McpServer.layerHttp` validated the `MCP-Protocol-Version` header on every POST, including
  the `initialize` request. That header reports the version negotiated by an earlier
  `initialize`, so on a fresh connection a client can only send its own default. Whenever
  that default was not among the server's registered protocols the `initialize` returned
  `400` and never reached version negotiation, even when the body offered a version the
  server supports.
  
  The header check now applies only to requests after initialization, where the
  specification requires it. An `initialize` negotiates from the version offered in its
  body, through the protocol registry, and reports the selected version in the response.

- [#7403](https://github.com/Effect-TS/effect/pull/7403) [`7455246`](https://github.com/Effect-TS/effect/commit/7455246f352385f5cbbdd8299555265ee289490e) Thanks @hsyntax! - Add support for explicit cache breakpoints on the OpenAI responses API for GPT-5.6-or-later.

- [#7442](https://github.com/Effect-TS/effect/pull/7442) [`118124d`](https://github.com/Effect-TS/effect/commit/118124d913d0a02ac5c1f7799a39bd90031769d9) Thanks @tim-smart! - Redact password prompt values from CLI wizard command output.

- [#7366](https://github.com/Effect-TS/effect/pull/7366) [`0dd7825`](https://github.com/Effect-TS/effect/commit/0dd7825e4da4d3a00fa9bd410a1d55f3d4874d07) Thanks @tim-smart! - Add `SchemaBinary`, a compact schema-derived codec with streaming, optional fingerprints and dictionaries, and RPC support.

- [#7404](https://github.com/Effect-TS/effect/pull/7404) [`b722eca`](https://github.com/Effect-TS/effect/commit/b722eca6d283a88970ad0efba0b4e921915eca78) Thanks @gcanti! - Add a public `StandardSchema` module containing the vendored Standard Schema V1 specification and remove the direct dependency on `@standard-schema/spec`.

- [#7436](https://github.com/Effect-TS/effect/pull/7436) [`811d579`](https://github.com/Effect-TS/effect/commit/811d579c432856a9e3fc05b517fd8e924cbf991a) Thanks @gcanti! - Fix JSON Schema imports:
  
  - Type-specific keywords no longer imply a type. For example, `minLength` validates strings without rejecting
    non-string values.
  - Constraints next to `const`, `enum`, and `$ref` are now applied instead of being ignored.
  - Disjoint and linear union intersections are imported without a Cartesian expansion. Other overlapping union
    intersections fail with an explicit error.
  - References to definitions without unions no longer make otherwise linear intersections fail.
  - Imported `oneOf` schemas remain `oneOf` when exported again.
  - `minItems` is preserved when `prefixItems` does not fully enforce it.

- [#7382](https://github.com/Effect-TS/effect/pull/7382) [`043b587`](https://github.com/Effect-TS/effect/commit/043b587e6e93f6624bf974bcd7ed976eaa17f0e1) Thanks @tim-smart! - Replace per-prompt prefix options with a context-based theme for CLI prompt symbols and colors.

- [#7373](https://github.com/Effect-TS/effect/pull/7373) [`8583727`](https://github.com/Effect-TS/effect/commit/85837274fa929a921985464585513a68c261e365) Thanks @ChubbyDuck! - Drop unreachable concurrency guard in iteratorEagerImpl

- [#7429](https://github.com/Effect-TS/effect/pull/7429) [`d9d2cfc`](https://github.com/Effect-TS/effect/commit/d9d2cfcb732754001b7323cf8afaccc48539bb74) Thanks @gcanti! - Reject unsupported JSON Schema validation keywords and object or array `const` / `enum` values during import instead of
  silently weakening validation.

- [#7428](https://github.com/Effect-TS/effect/pull/7428) [`5c4b7a0`](https://github.com/Effect-TS/effect/commit/5c4b7a0b17931cd1538c6595a54b21ffe9c1e906) Thanks @ebramanti! - Return workflow execution IDs from generated RPC and HTTP discard endpoints.

## 4.0.0-rc.111

### Patch Changes

- [#7311](https://github.com/Effect-TS/effect/pull/7311) [`0ce3b00`](https://github.com/Effect-TS/effect/commit/0ce3b007531563ce33f94c6a057492d379cfd9e8) Thanks @fubhy! - Reject graph shortest-path calculations that overflow or underflow the finite number range.

- [#7352](https://github.com/Effect-TS/effect/pull/7352) [`d846331`](https://github.com/Effect-TS/effect/commit/d84633171b4333e87a05f8d74c02c95d83d1b50d) Thanks @nikhilsnayak! - Preserve the `Context.mapUnsafe` accessor when code is compiled with loose object spread transforms.

- [#7300](https://github.com/Effect-TS/effect/pull/7300) [`f93616f`](https://github.com/Effect-TS/effect/commit/f93616f31f42345af844b8396fb19259556ae236) Thanks @fubhy! - Fix graph index exhaustion, A* path consistency, snapshot validation, Mermaid line endings, and topological initials.

- [#7336](https://github.com/Effect-TS/effect/pull/7336) [`16bf1ef`](https://github.com/Effect-TS/effect/commit/16bf1efdf41ba1d000b8588a8cc052a394856ba4) Thanks @gcanti! - Compact JSON Schema check constraints when they can be safely merged without keyword collisions.

- [#7360](https://github.com/Effect-TS/effect/pull/7360) [`d568968`](https://github.com/Effect-TS/effect/commit/d5689682e963f43157571cd71d4b422247ae09b9) Thanks @gcanti! - Add configurable schema representation reference policies and propagate them through JSON Schema and OpenAPI generation. By default, only schemas with resolved identifiers become references. Closes [#7357](https://github.com/Effect-TS/effect/issues/7357).

- [#7304](https://github.com/Effect-TS/effect/pull/7304) [`bc06292`](https://github.com/Effect-TS/effect/commit/bc062920ac47f956786d12c6d0bacb9468fa66e2) Thanks @fubhy! - Add graph snapshots, low-link connectivity analysis, bipartite matching, maximum flow, and minimum cut APIs.

- [#7364](https://github.com/Effect-TS/effect/pull/7364) [`e03ea90`](https://github.com/Effect-TS/effect/commit/e03ea907720b58d19d99929695df159c42fff101) Thanks @kitlangton! - Fix `Deferred` completion skipping waiters when an earlier waiter dies during resume. Completing a `Deferred` with an interrupt cause kills a suspended waiter synchronously inside its resume; the dying waiter's `await` cleanup spliced the shared `resumes` array mid-iteration, so the next waiter was never resumed and hung forever. Completion now clears `resumes` before resuming waiters.

- [#7347](https://github.com/Effect-TS/effect/pull/7347) [`9b10fc8`](https://github.com/Effect-TS/effect/commit/9b10fc85dde7866fb60e8142a93a6ed6a184537c) Thanks @tim-smart! - Shut down the internal effects queue when ordered concurrent channel mapping closes.

- [#7335](https://github.com/Effect-TS/effect/pull/7335) [`770c6d0`](https://github.com/Effect-TS/effect/commit/770c6d0f0ddcab7dbdde9fe701aded08deaee3fd) Thanks @tim-smart! - Fix `Effect.fn` binding the final transform as the generator body when using the `{ self }` overload.

- [#7344](https://github.com/Effect-TS/effect/pull/7344) [`7425bcb`](https://github.com/Effect-TS/effect/commit/7425bcb7f74bdccc1941883bc7f9472fbe6ae8b4) Thanks @tim-smart! - Ensure fiber observer cancellation during exit does not skip remaining observers.

- [#7301](https://github.com/Effect-TS/effect/pull/7301) [`563815a`](https://github.com/Effect-TS/effect/commit/563815a250e10a02e2a719c7d9b159478b0da933) Thanks @fubhy! - Preserve depth-first traversal order with finite radii and validate A* heuristics for trivial paths.

- [#7350](https://github.com/Effect-TS/effect/pull/7350) [`1e83ca1`](https://github.com/Effect-TS/effect/commit/1e83ca110d5cb74641bae148a08e7eb6b3c2e2ed) Thanks @tim-smart! - Align in-memory workflow interrupt finalization with the cluster workflow engine.

- [#7316](https://github.com/Effect-TS/effect/pull/7316) [`550a41a`](https://github.com/Effect-TS/effect/commit/550a41a2547ce0dd5f085f1637a6f8a5794acba7) Thanks @tim-smart! - Update dependencies across the Effect workspace.

- [#7306](https://github.com/Effect-TS/effect/pull/7306) [`45d79c7`](https://github.com/Effect-TS/effect/commit/45d79c7cbd9c56c643361c6e6d1689f1aa62ae32) Thanks @fubhy! - Add bulk node and edge removal operations, and disallow graph mutations from callbacks that traverse or transform the same graph.

- [#7317](https://github.com/Effect-TS/effect/pull/7317) [`aac8584`](https://github.com/Effect-TS/effect/commit/aac8584fd997f3ce3341aeb077b816219832de58) Thanks @tim-smart! - Fix `Match.value` terminal combinators failing to typecheck when the input
  contains a generic type parameter.
  
  The fifth type argument of `Matcher` for value matchers is now `ValueFlavor`,
  and `ValueMatcher` has a seventh flavor argument; update hand-written
  annotations accordingly.

- [#7361](https://github.com/Effect-TS/effect/pull/7361) [`7f87022`](https://github.com/Effect-TS/effect/commit/7f870225bb10a7ee7cb54b4835cb3bf64c0cacd8) Thanks @tim-smart! - Merge effect and finalizer failures during cleanup, preserving other failures alongside `Cause.Done`.

- [#7326](https://github.com/Effect-TS/effect/pull/7326) [`425457c`](https://github.com/Effect-TS/effect/commit/425457c1e9eec7c176df130f7ec6ad3d616c086e) Thanks @tim-smart! - Emit mixed struct and record schema types as intersections, preventing optional
  properties in open OpenAPI objects from conflicting with their index signature.

- [#7324](https://github.com/Effect-TS/effect/pull/7324) [`008c423`](https://github.com/Effect-TS/effect/commit/008c423e413fe311085c4bfc07c19b9c70529dfa) Thanks @tim-smart! - Allow path-level common parameters in OpenAPI generator input types.

- [#7359](https://github.com/Effect-TS/effect/pull/7359) [`4f6ae04`](https://github.com/Effect-TS/effect/commit/4f6ae041a2886c27e941c5d9e4916aa2a32e0a1c) Thanks @gcanti! - Add dual standalone functions for reading and updating values through optics, closes [#7299](https://github.com/Effect-TS/effect/issues/7299).

- [#7250](https://github.com/Effect-TS/effect/pull/7250) [`b6b63e1`](https://github.com/Effect-TS/effect/commit/b6b63e151595b5599ad2d65069ab6d298cfd7be7) Thanks @xianjianlf2! - Preserve `JSON.rawJSON` values when cloning cached OpenAPI specs.

- [#7351](https://github.com/Effect-TS/effect/pull/7351) [`92922ee`](https://github.com/Effect-TS/effect/commit/92922ee7de0a2d932121e37677f3e75ea38482f1) Thanks @tim-smart! - Preserve unsafe in-memory workflow interrupts across replay.

- [#7328](https://github.com/Effect-TS/effect/pull/7328) [`859c02f`](https://github.com/Effect-TS/effect/commit/859c02fe9020b0f28f713aa85910a0cc2d002560) Thanks @fubhy! - Keep graph caches consistent during bulk removals and validate graph kinds at runtime.

- [#7358](https://github.com/Effect-TS/effect/pull/7358) [`ffc8235`](https://github.com/Effect-TS/effect/commit/ffc823537a0925171cf41d0841643a0b26895a4c) Thanks @tim-smart! - Bound framed RPC server HTTP response streams to 16 items by default, with a configurable buffer size or an unbounded opt-out.

- [#6324](https://github.com/Effect-TS/effect/pull/6324) [`a29eb70`](https://github.com/Effect-TS/effect/commit/a29eb702ffe3fc58bd28c4d7857298cd65d73668) Thanks @tim-smart! - Add scoped Redis pub/sub subscriptions that expose received messages through an Effect queue.

- [#7354](https://github.com/Effect-TS/effect/pull/7354) [`0be2303`](https://github.com/Effect-TS/effect/commit/0be2303dd39f9f2f7d8f96a28e25c938cd914e1a) Thanks @tim-smart! - Add support for server-originated RPC requests and notifications. Buffered
  JSON-RPC HTTP drops notifications until streaming responses are available.

- [#7349](https://github.com/Effect-TS/effect/pull/7349) [`b44636f`](https://github.com/Effect-TS/effect/commit/b44636ff7233763fad060bc0f9de10512454a29b) Thanks @gcanti! - When canonical JSON derivation adds a transformation for a schema without a direct JSON representation, keep source checks and annotations on the source side. This prevents duplicate check execution and ensures generated JSON Schema documents describe only the encoded target, closes [#7192](https://github.com/Effect-TS/effect/issues/7192).

- [#7337](https://github.com/Effect-TS/effect/pull/7337) [`b19ccc7`](https://github.com/Effect-TS/effect/commit/b19ccc7325469a5dea091349bda4ae2ec00ec865) Thanks @gcanti! - Add `Schema.JsonObject` for readonly string-keyed records containing JSON-compatible values. This provides a canonical,
  reusable schema instead of requiring callers to repeatedly compose `Schema.Record(Schema.String, Schema.Json)`.

- [#7330](https://github.com/Effect-TS/effect/pull/7330) [`ff98f0b`](https://github.com/Effect-TS/effect/commit/ff98f0b0e2beb331209e37e42095d8d6e8e0b6c2) Thanks @gcanti! - Preserve JSON Schema object keyword scopes when importing `allOf` intersections, including closed empty objects and required-only keys. Emit intersecting index signatures without weakening their constraints, and reject object scope intersections that cannot be represented faithfully.

- [#7363](https://github.com/Effect-TS/effect/pull/7363) [`a47cbf1`](https://github.com/Effect-TS/effect/commit/a47cbf1feafd10e305c9753fa02a5f5f977d2c37) Thanks @tim-smart! - Add `Match.fn` for reusable matchers that select a value from multiple arguments.

- [#7362](https://github.com/Effect-TS/effect/pull/7362) [`39b55f8`](https://github.com/Effect-TS/effect/commit/39b55f850aecbecf2e3b0c5f3ae2d1a77e6da949) Thanks @tim-smart! - Preserve encoded AI tool call parameters when automatic tool call resolution is disabled, and update
  `Toolkit.handle` to accept the encoded parameter type it decodes at runtime.

- [#7305](https://github.com/Effect-TS/effect/pull/7305) [`c6c49c9`](https://github.com/Effect-TS/effect/commit/c6c49c96990d009341341a53ed26beb140c267a9) Thanks @fubhy! - Fix mutable graph cache consistency and guard weighted pathfinding against inconsistent snapshots and numeric overflow.

- [#7342](https://github.com/Effect-TS/effect/pull/7342) [`bf23ba7`](https://github.com/Effect-TS/effect/commit/bf23ba7033a4b426caf379bdcf84c58bb64d7010) Thanks @misterclayt0n! - Forward every worker-runner client disconnect to the RPC server, not just the first one.

## 4.0.0-rc.110

### Patch Changes

- [#7234](https://github.com/Effect-TS/effect/pull/7234) [`6eebd0a`](https://github.com/Effect-TS/effect/commit/6eebd0a618308a91f95947bae6e0fb206ae3939d) Thanks @lloydrichards! - MCP servers can now use the 2025-11-25 protocol, including sampling with tools and both form- and URL-based elicitation.
  
  Enable it by adding `McpProtocol.v2025_11_25` to the server's `protocols` option.

- [#7234](https://github.com/Effect-TS/effect/pull/7234) [`6eebd0a`](https://github.com/Effect-TS/effect/commit/6eebd0a618308a91f95947bae6e0fb206ae3939d) Thanks @lloydrichards! - MCP servers can now provide icons for server information, resources, resource templates, prompts, and tools using `McpSchema.Icon`.
  
  Each icon can specify its source URI, MIME type, supported sizes, and light or dark theme.

- [#7291](https://github.com/Effect-TS/effect/pull/7291) [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f) Thanks @fubhy! - Include traversed edge indexes in graph shortest-path results.

- [#7291](https://github.com/Effect-TS/effect/pull/7291) [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f) Thanks @fubhy! - Add deterministic, index-preserving `Graph.minimumSpanningForest`.

- [#7291](https://github.com/Effect-TS/effect/pull/7291) [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f) Thanks @fubhy! - Add index-preserving transitive reduction for directed acyclic graphs.

- [#7261](https://github.com/Effect-TS/effect/pull/7261) [`189b003`](https://github.com/Effect-TS/effect/commit/189b003a2367fa44dd4b8544aa62979f0345d179) Thanks @fubhy! - Add `Graph.Snapshot` and `Graph.fromSnapshot` for constructing immutable graphs with explicit node and edge indexes, and simplify `Graph.Edge` to a type-only structural interface.

- [#7261](https://github.com/Effect-TS/effect/pull/7261) [`189b003`](https://github.com/Effect-TS/effect/commit/189b003a2367fa44dd4b8544aa62979f0345d179) Thanks @fubhy! - Add `Schema.Graph` for schema-based encoding and decoding of immutable directed and undirected graphs.

- [#7267](https://github.com/Effect-TS/effect/pull/7267) [`0a127b8`](https://github.com/Effect-TS/effect/commit/0a127b8847fb213d46621a5018c069019414c00d) Thanks @tim-smart! - Allow customizing the prefix displayed by CLI prompts.

- [#7272](https://github.com/Effect-TS/effect/pull/7272) [`e491deb`](https://github.com/Effect-TS/effect/commit/e491deb1cd1717bc442aaee96e5d7b4001710cc9) Thanks @fubhy! - Preserve scoped Graph mutation callback errors when the callback manually finalizes its mutable handle.

- [#7266](https://github.com/Effect-TS/effect/pull/7266) [`f99c508`](https://github.com/Effect-TS/effect/commit/f99c508a09e9fccddb09edd16fa3393891c55d48) Thanks @tim-smart! - Fix SQL persisted queue delivery on SQLite builds without `SQLITE_ENABLE_UPDATE_DELETE_LIMIT`.

- [#7199](https://github.com/Effect-TS/effect/pull/7199) [`7e3f07c`](https://github.com/Effect-TS/effect/commit/7e3f07cf3e4b6a907840aface36ae5ee67ca8979) Thanks @rekram1-node! - Fix Zsh completions for CLI commands with both positional arguments and subcommands.

- [#7274](https://github.com/Effect-TS/effect/pull/7274) [`a894fe1`](https://github.com/Effect-TS/effect/commit/a894fe1df8974077293d9c1b924a7f80fc7fe7f1) Thanks @fubhy! - Ignore removed allocator history when comparing and hashing immutable Graph values with the same active indexed structure.

- [#7291](https://github.com/Effect-TS/effect/pull/7291) [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f) Thanks @fubhy! - Add `Graph.findCycle` with exact node and edge witnesses.

- [#7294](https://github.com/Effect-TS/effect/pull/7294) [`7e9923b`](https://github.com/Effect-TS/effect/commit/7e9923b1a0adf1f842216b298d7542bed980c9a5) Thanks @tim-smart! - Add custom reviver support to HTTP JSON parsing APIs.

- [#7200](https://github.com/Effect-TS/effect/pull/7200) [`f064121`](https://github.com/Effect-TS/effect/commit/f0641210f960563f813ac6f728804e5447c03341) Thanks @mikearnaldi! - Support narrowing schedule input and output types with type guard predicates passed to `Schedule.while`.

- [#7291](https://github.com/Effect-TS/effect/pull/7291) [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f) Thanks @fubhy! - Add index-preserving `Graph.inducedSubgraph`.

- [#7244](https://github.com/Effect-TS/effect/pull/7244) [`b660bf0`](https://github.com/Effect-TS/effect/commit/b660bf01d9c427552296cd9e0195e21504f45e1f) Thanks @AnnaSuSu! - Normalize unbounded PubSub replay capacities to positive integers.

- [#7293](https://github.com/Effect-TS/effect/pull/7293) [`f4fbe9c`](https://github.com/Effect-TS/effect/commit/f4fbe9ca0209cdfaaaff54fc3805221be80f1ffa) Thanks @tim-smart! - Support standalone Effect.forEach data-last usage

- [#7291](https://github.com/Effect-TS/effect/pull/7291) [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f) Thanks @fubhy! - Add bounded lazy enumeration of simple paths and all tied shortest paths.

- [#7259](https://github.com/Effect-TS/effect/pull/7259) [`e811353`](https://github.com/Effect-TS/effect/commit/e811353e3b79ba392af1d9fb8d7f93fd729dabf9) Thanks @fubhy! - Prevent graph edge reads from exposing internal edge records and reject non-finite A* heuristic values.

- [#7251](https://github.com/Effect-TS/effect/pull/7251) [`9761c3c`](https://github.com/Effect-TS/effect/commit/9761c3c4787b3815346c1b650d8984efec8f1051) Thanks @tim-smart! - Add `Encoding.randomHex`, a lightweight non-cryptographic generator that coerces lengths to unsigned 32-bit multiples of 8.

- [#7296](https://github.com/Effect-TS/effect/pull/7296) [`baa99fc`](https://github.com/Effect-TS/effect/commit/baa99fc176efed4986c19c78726d1dbe7bd17765) Thanks @tim-smart! - Make unstable CLI boolean flags required when omitted, allowing optional, default, config, and prompt fallbacks to handle absence consistently.

- [#7246](https://github.com/Effect-TS/effect/pull/7246) [`7fd79b2`](https://github.com/Effect-TS/effect/commit/7fd79b2cc95973f85b3db43b0cf3c5cb7d2f69c4) Thanks @tim-smart! - Add `Effect.head` for retrieving the first element of an iterable produced by an effect.

- [#7273](https://github.com/Effect-TS/effect/pull/7273) [`a82ffc0`](https://github.com/Effect-TS/effect/commit/a82ffc03df0fb34e02f16773b96bfa3e0208e427) Thanks @fubhy! - Validate Graph traversal radii, isolate traversal start configuration, and prioritize the first supplied DFS root.

- [#7291](https://github.com/Effect-TS/effect/pull/7291) [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f) Thanks @fubhy! - Throw `GraphError` when a negative cycle affects a Bellman-Ford target, reserving `Option.none()` for unreachable paths.

- [#7248](https://github.com/Effect-TS/effect/pull/7248) [`4026e2d`](https://github.com/Effect-TS/effect/commit/4026e2dde3b098e70ffb3f1fcddd200176acdefd) Thanks @tim-smart! - Improve tracing performance in span creation and HTTP middleware.

- [#7276](https://github.com/Effect-TS/effect/pull/7276) [`397bf1e`](https://github.com/Effect-TS/effect/commit/397bf1ebd95c0d6d58dc53e4f33c8ad3f34746f6) Thanks @fubhy! - Deduplicate directed neighbor-node queries while preserving first edge occurrence order.

- [#7291](https://github.com/Effect-TS/effect/pull/7291) [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f) Thanks @fubhy! - Add incident-edge, edges-between, and directed and undirected degree queries to `Graph`.

- [#7291](https://github.com/Effect-TS/effect/pull/7291) [`d10ceb0`](https://github.com/Effect-TS/effect/commit/d10ceb06d56108c11100868f591d2b42ddff5e9f) Thanks @fubhy! - Add unweighted reachability, explicit weak and strong connectivity predicates, weak components, and tree detection to `Graph`.

## 4.0.0-rc.109

### Patch Changes

- [#7219](https://github.com/Effect-TS/effect/pull/7219) [`a0743f2`](https://github.com/Effect-TS/effect/commit/a0743f2b9f20fb5d150f35510e68819f01630bac) Thanks @tim-smart! - Add SQL, HttpApi testing, and CLI schema examples to the published AI documentation.

- [#7241](https://github.com/Effect-TS/effect/pull/7241) [`17892e7`](https://github.com/Effect-TS/effect/commit/17892e75a8d584f79127805506c42b19320990a7) Thanks @tim-smart! - Use Context mapUnsafe in less call sites

- [#7240](https://github.com/Effect-TS/effect/pull/7240) [`4d8a230`](https://github.com/Effect-TS/effect/commit/4d8a2306dfff8fd5406ab75d0c8d22e5300d1faa) Thanks @tim-smart! - Fix `Effect.fromOption` data-first inference for inline `Option` expressions.

- [#7216](https://github.com/Effect-TS/effect/pull/7216) [`f21f9c9`](https://github.com/Effect-TS/effect/commit/f21f9c9f73dc59db922bda411b6d5245dae37cdb) Thanks @tim-smart! - Add a `HttpStatus` module to `effect/unstable/http` that centralizes the mapping from HTTP status literal names to numeric codes and exports `HttpStatus.fromLiteral`. `HttpApiSchema.status` now consumes the new module.

- [#6829](https://github.com/Effect-TS/effect/pull/6829) [`18270dd`](https://github.com/Effect-TS/effect/commit/18270ddeaf4ad28723ca8a40aff04a5d4707b575) Thanks @lloydrichards! - MCP servers now support the 2024-11-05 and 2025-03-26 RPC revisions through version-specific protocol adapters.

- [#7218](https://github.com/Effect-TS/effect/pull/7218) [`26db404`](https://github.com/Effect-TS/effect/commit/26db404a3284cfdbf4a3f351ccd05afc0de743b8) Thanks @tim-smart! - Run SQL `PersistedQueue` table creation through versioned migrations so future schema changes can be applied safely.

- [#7210](https://github.com/Effect-TS/effect/pull/7210) [`2670398`](https://github.com/Effect-TS/effect/commit/26703982612e12954360382e4b1d177002699d1c) Thanks @tim-smart! - Preserve nanosecond precision when adjusting `TestClock` with large durations.

- [#7205](https://github.com/Effect-TS/effect/pull/7205) [`3702bed`](https://github.com/Effect-TS/effect/commit/3702bedd8f6bcb3f603b87c640c521878d824eb3) Thanks @tim-smart! - Remove the `kubernetes-types` dependency by vendoring the Kubernetes Pod declarations used by the cluster helpers and exporting them from `effect/unstable/cluster/K8sTypes`.

- [#7236](https://github.com/Effect-TS/effect/pull/7236) [`ccae60e`](https://github.com/Effect-TS/effect/commit/ccae60e5edb2bef553f4af52afb509dfd443cd03) Thanks @roninjin10! - Propagate a failed `BEGIN` or `SAVEPOINT` from `SqlClient.withTransaction` as a typed `SqlError`.
  
  `makeWithTransaction` wrapped the `begin` step together with the transaction body, so a
  failed `BEGIN` took the rollback branch. No transaction was active at that point, the
  `ROLLBACK` failed, and its `Effect.orDie` wrapper replaced the original typed error with a
  defect (`cannot rollback - no transaction is active`). Callers could no longer classify the
  failure as retryable. The path became reachable when the sqlite client started using
  `BEGIN IMMEDIATE`, which acquires a write lock and can fail with `SQLITE_BUSY`.
  
  Commit and rollback now run only after `begin` or `savepoint` succeeds. A failed `begin` or
  `savepoint` fails with its original `SqlError`, leaves the wrapped effect unexecuted, and
  still closes the acquired connection scope.

- [#7206](https://github.com/Effect-TS/effect/pull/7206) [`6ff5396`](https://github.com/Effect-TS/effect/commit/6ff53968138bbd7d4728ce8014e35eae8d6ca5d0) Thanks @tim-smart! - Bound cluster runner entity residency and storage reads.
  
  `ShardingConfig` gains two knobs:
  
  - `maxResidentEntities` (default `10_000`): the maximum number of entities
    that can be resident on a runner at the same time. At the cap, the storage
    read loop stops admitting messages for new entity addresses (they stay in
    storage until a slot frees up) and volatile sends to new addresses fail with
    `MailboxFull`. Persisted sends still succeed. `"unbounded"` restores the
    previous behaviour and can only be set programmatically.
  - `unprocessedMessageBatchSize` (default `1024`): the maximum number of
    unprocessed messages read from storage in a single poll.
  
  `MessageStorage.unprocessedMessages` accepts an optional
  `{ limit, addresses }` argument, and only claims the messages it actually
  returns. The memory implementation now applies the same ten-minute claim
  window as SQL, so bounded reads advance past in-flight requests; resetting an
  address or shard makes its claimed messages immediately eligible again.
  
  The encoded driver contract replaces `Encoded.resetAddress` with the batched
  `Encoded.resetAddresses` operation. `SqlMessageStorage.makeEncoded` constructs
  the SQL encoded driver directly for custom storage composition.
  
  `ClusterWorkflowEngine` entities (workflows and the durable clock) now use a
  fixed ten-second idle time, so completed and suspended executions release their
  entity slots quickly. Their state is durable, so an evicted execution is
  rebuilt from storage when its next message arrives.

## 4.0.0-rc.108

### Patch Changes

- [#6546](https://github.com/Effect-TS/effect/pull/6546) [`dfb173e`](https://github.com/Effect-TS/effect/commit/dfb173efffd20c4feded4efe409018dd55acdca8) Thanks @xianjianlf2! - Handle BigInt values safely and consistently across JSON diagnostics and logger formats.

- [#7174](https://github.com/Effect-TS/effect/pull/7174) [`005e090`](https://github.com/Effect-TS/effect/commit/005e0902cace9f8960a4f43573665a3a9b53b6fa) Thanks @tim-smart! - Fix `Queue.await` failing with `Cause.Done` when registered before the queue ends.

- [#7180](https://github.com/Effect-TS/effect/pull/7180) [`c82c532`](https://github.com/Effect-TS/effect/commit/c82c53228dc1c50cc99654ce6de7766b4de09e75) Thanks @gcanti! - Prioritize redacted representations in formatters and normalize text logger levels to uppercase.

- [#7193](https://github.com/Effect-TS/effect/pull/7193) [`22b579f`](https://github.com/Effect-TS/effect/commit/22b579f6c582e6e2d951784791fea6f1802517ed) Thanks @kitlangton! - Fix `Deferred.await` dying with a `TypeError` when a waiter is interrupted after the `Deferred` has been completed.

- [#7179](https://github.com/Effect-TS/effect/pull/7179) [`3e19539`](https://github.com/Effect-TS/effect/commit/3e19539205082b1006d84553045d1b03db9cc8a1) Thanks @tim-smart! - Fix `DurableDeferred.raceAll` so a completed deferred can wake an active workflow without changing success-biased race semantics

- [#7189](https://github.com/Effect-TS/effect/pull/7189) [`08a3c74`](https://github.com/Effect-TS/effect/commit/08a3c74133206fc1cc728e0aa96d02e672fd80bd) Thanks @gcanti! - Fix `HttpApi` query decoding for array parameters with a single value.

- [#6550](https://github.com/Effect-TS/effect/pull/6550) [`eb0bae0`](https://github.com/Effect-TS/effect/commit/eb0bae08d543d58754c9bb7a57e67c1e2bb3f55a) Thanks @xianjianlf2! - Return fresh OpenAPI specs from cached `OpenApi.fromApi` calls.

- [#7188](https://github.com/Effect-TS/effect/pull/7188) [`97b544d`](https://github.com/Effect-TS/effect/commit/97b544d8b636587647b90691d669305c0eb4fc66) Thanks @gcanti! - Mark the internal `~sentinels` Schema annotation as `@internal` so release declaration stripping removes it together with `SchemaAST.Sentinel`. This keeps the published declarations self-consistent for consumers that type-check dependencies with `skipLibCheck: false`.

- [#7158](https://github.com/Effect-TS/effect/pull/7158) [`4f6d131`](https://github.com/Effect-TS/effect/commit/4f6d131e85d74ab0ec0300e52e503a5f943fc576) Thanks @k3dom! - Improve Union candidate selection: a nested union member is dispatched by the sentinels common to all its members, and candidates whose sentinel the input contradicts are excluded.

- [#7178](https://github.com/Effect-TS/effect/pull/7178) [`fad4b7c`](https://github.com/Effect-TS/effect/commit/fad4b7c5138b3f38c2427436da2e0685c1ca4e9b) Thanks @tim-smart! - Use Promise microtasks for synchronous Scheduler dispatch.

- [#7181](https://github.com/Effect-TS/effect/pull/7181) [`accf447`](https://github.com/Effect-TS/effect/commit/accf4474513064e2a21d14b1937503261b4f34dc) Thanks @gcanti! - Move `SchemaError` into the `Schema` module and remove the standalone `SchemaError` module.

- [#7195](https://github.com/Effect-TS/effect/pull/7195) [`31b27e4`](https://github.com/Effect-TS/effect/commit/31b27e49903c351588435f666c953aaac28f6120) Thanks @tim-smart! - Ensure discarded non-persisted cluster messages complete without waiting for the entity reply.

- [#7191](https://github.com/Effect-TS/effect/pull/7191) [`8458951`](https://github.com/Effect-TS/effect/commit/84589518c3966c63d7f3679a5296d380eb1ba887) Thanks @Digifox03! - Fix `HttpRouter.Middleware.layer` to provide request error services for errors declared in `handles`, and expose global
  middleware errors from `HttpRouter.toHttpEffect`.

## 4.0.0-beta.107

### Patch Changes

- [#7156](https://github.com/Effect-TS/effect/pull/7156) [`596f3f9`](https://github.com/Effect-TS/effect/commit/596f3f92d7fe355811b815cb212332b082268ce8) Thanks @tim-smart! - Terminate active multipart file streams when a parser limit is exceeded or the body ends unexpectedly, so file parts fail instead of hanging.

- [#7153](https://github.com/Effect-TS/effect/pull/7153) [`9611ed4`](https://github.com/Effect-TS/effect/commit/9611ed42d11300546b339ab13492a0f7bdb1ebfb) Thanks @rajanpanth! - Fix `Duration`'s `Hash.symbol` implementation to hash a canonical nanoseconds form instead of the raw internal `Millis`/`Nanos` representation. Two durations that `Duration.equals`/`Equal.equals` consider equal (e.g. `Duration.seconds(5)` and `Duration.nanos(5_000_000_000n)`) previously hashed differently, violating the Hash/Equal contract and silently breaking `HashSet`/`HashMap` lookups keyed by `Duration`.

- [#7166](https://github.com/Effect-TS/effect/pull/7166) [`8b91605`](https://github.com/Effect-TS/effect/commit/8b9160548556e4b0ec7ee2f2707716776be49018) Thanks @CDVolvik! - Import migrations through a file URL in `Migrator.fromFileSystem`, so absolute Windows paths are accepted by the ESM loader.
  
  Previously the directory and file name were passed to `import` as a plain path. On Windows that produced a specifier such as `D:\migrations\1_init.ts`, which the ESM loader rejects with `Only URLs with a scheme in: file, data, and node are supported`.
  
  `fromFileSystem` now resolves the specifier through the `Path` service, so its type widens from `Loader<FileSystem>` to `Loader<FileSystem | Path>`. Callers that already provide an aggregate platform layer such as `NodeServices.layer` are unaffected; callers that provide `FileSystem` on its own now also need a `Path` layer, and on Windows it must be a platform-aware one rather than the POSIX `Path.layer`.

- [#7157](https://github.com/Effect-TS/effect/pull/7157) [`d901928`](https://github.com/Effect-TS/effect/commit/d901928efa44f573ed1247f53fdb203a8e4fcede) Thanks @tim-smart! - Add `Channel.mkUint8Array` and reuse it from `Stream` and multipart file collection. This also fixes quadratic buffering in `File.contentEffect`, improving collection of a 16 MiB chunked upload by approximately 90x.

- [#7149](https://github.com/Effect-TS/effect/pull/7149) [`b32bdef`](https://github.com/Effect-TS/effect/commit/b32bdef0d119a1ad1463dc01a46763ffee1f9bd9) Thanks @gcanti! - Require explicit handling for regular expression pattern constraints translated from JSON Schema documents, with modes to apply trusted patterns or ignore their constraints.

## 4.0.0-beta.106

### Patch Changes

- [#7110](https://github.com/Effect-TS/effect/pull/7110) [`2695168`](https://github.com/Effect-TS/effect/commit/269516851b24916d72771f8a554b88722e3732e7) Thanks @fubhy! - Ensure concurrent first `RcRef` borrowers share the same resource generation.

- [#7114](https://github.com/Effect-TS/effect/pull/7114) [`6310a8c`](https://github.com/Effect-TS/effect/commit/6310a8c68c74dcf1d23948ec9243ac5f407a1651) Thanks @fubhy! - Report buffered worker send failures as `WorkerError` values.

- [#7117](https://github.com/Effect-TS/effect/pull/7117) [`c2071b1`](https://github.com/Effect-TS/effect/commit/c2071b1647e2326568c1d0689274ef62b8a7183f) Thanks @fubhy! - Make `TxQueue.shutdown` safe to call after a queue has already been interrupted.

- [#7119](https://github.com/Effect-TS/effect/pull/7119) [`7aff81a`](https://github.com/Effect-TS/effect/commit/7aff81a9cefe681483ef8abf717d786fd10e7e8d) Thanks @fubhy! - Prevent SQL resolvers from invoking non-empty batch callbacks when every request fails encoding.

- [#7105](https://github.com/Effect-TS/effect/pull/7105) [`a1d4057`](https://github.com/Effect-TS/effect/commit/a1d4057711935a544ef441bc2d0ac3565dfa9266) Thanks @tim-smart! - Add `ConfigProvider.fromEnvRecord` for building a provider from an explicit environment record.

- [#7111](https://github.com/Effect-TS/effect/pull/7111) [`abf77b0`](https://github.com/Effect-TS/effect/commit/abf77b04009dcb4d67a258f9d8ada778e9f4ffae) Thanks @fubhy! - Preserve input fiber error types in `Fiber.joinAll`.

- [#7134](https://github.com/Effect-TS/effect/pull/7134) [`6c60375`](https://github.com/Effect-TS/effect/commit/6c60375e68683a32d54554150cc493e16550a06d) Thanks @marbemac! - Fix cluster shutdown hangs by failing abandoned non-discard requests and stream chunk acknowledgements with `EntityNotAssignedToRunner`, including persisted requests sent after runner unregistration. This adds `EntityNotAssignedToRunner` to the typed error channel of entity clients and request-only `EntityProxy` RPC/HTTP endpoints; discard endpoints remain unchanged.

- [#7107](https://github.com/Effect-TS/effect/pull/7107) [`22f4897`](https://github.com/Effect-TS/effect/commit/22f4897bbae24783d4516f6bef353f1db4ec6d03) Thanks @fubhy! - Preserve FormData bodies when converting client requests through HttpServerRequest.

- [#7120](https://github.com/Effect-TS/effect/pull/7120) [`615d1d5`](https://github.com/Effect-TS/effect/commit/615d1d5d0256ec8160f2e08d0dcf5dc83acb7bf1) Thanks @fubhy! - Fix `SqlResolver.findById` failing to complete duplicate requests when id encoding fails, which surfaced as a `RequestResolver did not complete request` defect instead of the underlying `SchemaError`.

- [#7131](https://github.com/Effect-TS/effect/pull/7131) [`3a86757`](https://github.com/Effect-TS/effect/commit/3a867573ddeed5888dabdeb3225a9ebbf00491e7) Thanks @fubhy! - Ignore MCP cancellation notifications for unknown request identifiers.

- [#7104](https://github.com/Effect-TS/effect/pull/7104) [`f4a9762`](https://github.com/Effect-TS/effect/commit/f4a9762bb9dfad59c215f2e099dcc829d74f4ed1) Thanks @gcanti! - Add `Function.memoizeIdempotent` and use it to avoid reprocessing canonical Schema ASTs, including optional and mutable property modifiers. Cache Config schema cursor AST compilation.

- [#7144](https://github.com/Effect-TS/effect/pull/7144) [`0bcf6ed`](https://github.com/Effect-TS/effect/commit/0bcf6ed57c22e8a36964726b15464101d90f5997) Thanks @fubhy! - Stop multipart parsing after part count, part size, or field size limits are exceeded.

- [#7121](https://github.com/Effect-TS/effect/pull/7121) [`ba9cb63`](https://github.com/Effect-TS/effect/commit/ba9cb63b87d45ce2df872dd8ef0905da147cc675) Thanks @fubhy! - Prevent execution-plan event observer defects from changing attempt outcomes or leaving attempt events unpaired.

- [#7147](https://github.com/Effect-TS/effect/pull/7147) [`42c810d`](https://github.com/Effect-TS/effect/commit/42c810dd372275b822dd99c7d7e774e153f0a752) Thanks @tim-smart! - Release worker pool entries when an RPC worker's receive loop fails.

- [#7148](https://github.com/Effect-TS/effect/pull/7148) [`1416ccd`](https://github.com/Effect-TS/effect/commit/1416ccd474bc9da8979f51b72b5e53fb3ac56edf) Thanks @gcanti! - Consolidate schema arbitrary derivation into `Schema.toArbitrary`, which now returns a `Schema.Arbitrary` factory that accepts the fast-check module. Remove `Schema.toArbitraryLazy` and arbitrary derivation reports.

- [#7109](https://github.com/Effect-TS/effect/pull/7109) [`08d0d39`](https://github.com/Effect-TS/effect/commit/08d0d39a225deccb9db213ab5fcf55edb9f9ba5d) Thanks @fubhy! - Fix `RcRef` leaking resources acquired before a failed acquisition.

- [#7146](https://github.com/Effect-TS/effect/pull/7146) [`548908a`](https://github.com/Effect-TS/effect/commit/548908a71d9337cb7defe7fc93b2fba8f6a04b6f) Thanks @gcanti! - Improve Schema representation identity, anonymous-reference eligibility, and JSON Schema alias finalization.

- [#6862](https://github.com/Effect-TS/effect/pull/6862) [`4b3460d`](https://github.com/Effect-TS/effect/commit/4b3460daa434ec465a95a50704fe1103a9275999) Thanks @fubhy! - Ensure `ScopedRef.set` releases a replacement when the previous value's finalizer defects.

- [#7060](https://github.com/Effect-TS/effect/pull/7060) [`d170596`](https://github.com/Effect-TS/effect/commit/d17059615cca37ca2776654078fe0501ac5202e6) Thanks @fubhy! - Preserve `maxItems` semantics when importing JSON Schema `prefixItems`.

- [#7116](https://github.com/Effect-TS/effect/pull/7116) [`aea89d0`](https://github.com/Effect-TS/effect/commit/aea89d0c42ee0ac707a4962cd348fd3158cb469b) Thanks @fubhy! - Keep span end times at zero when tracer timing is disabled.

- [#7124](https://github.com/Effect-TS/effect/pull/7124) [`deed5fb`](https://github.com/Effect-TS/effect/commit/deed5fbdc91cf8bf8c5fce7dfa5d6527ac944726) Thanks @fubhy! - Use a distinct AES-GCM initialization vector for each encrypted event log entry. `EventLogEncryption.encrypt` now returns each IV with its ciphertext, and encrypted event log clients and servers must be upgraded together because the `WriteEntries` wire shape changed.

## 4.0.0-beta.105

### Patch Changes

- [#7087](https://github.com/Effect-TS/effect/pull/7087) [`0418564`](https://github.com/Effect-TS/effect/commit/04185644dabb8e4169f1ef6cbbc0b36c4db2f7f4) Thanks @tim-smart! - Recognize tagged Config and RPC errors across duplicated `effect` package copies.

- [#6827](https://github.com/Effect-TS/effect/pull/6827) [`d334a85`](https://github.com/Effect-TS/effect/commit/d334a8593aafcd60753995a9449b654c67bfdcc1) Thanks @jaipaljadeja! - Add bounded 429 retries and custom response header names to `HttpClient.withRateLimiter`.

- [#7084](https://github.com/Effect-TS/effect/pull/7084) [`f0be855`](https://github.com/Effect-TS/effect/commit/f0be8554da6ee00293a6b23869ac46a0b0d97dc8) Thanks @tim-smart! - Stop capturing definition-location stack frames in `Context.Service`.

- [#7090](https://github.com/Effect-TS/effect/pull/7090) [`b206fa5`](https://github.com/Effect-TS/effect/commit/b206fa5d7655c1634c9993410a9203f6616a5ca2) Thanks @tim-smart! - Expose `stdinIsTerminal` and `stdoutIsTerminal` effects through the `Stdio` service.

- [#7093](https://github.com/Effect-TS/effect/pull/7093) [`b938c8a`](https://github.com/Effect-TS/effect/commit/b938c8ad2823bd88493187922f7d9090eff037b6) Thanks @gcanti! - Add the opt-in `reportInput` parse option for retaining rejected inputs in enumerable fields on value-bearing schema issues and including them in default formatted messages. Value-bearing issue constructors accept the rejected input and parse options directly, and `Schema.Annotations.Issue` now supports `expected` for default messages.
  
  Schema issues no longer format implicitly through `Issue#toString`. Use `SchemaIssue.makeFormatterDefault()` when a human-readable message is needed. The throwing and Promise-based adapters in `SchemaParser` now use the generic message `"Schema validation failed"` and expose the structured `SchemaIssue.Issue` as the error `cause`; consumers that previously read the formatted error message should inspect and explicitly format that cause instead.
  
  `Schema.makeEffect` now returns `SchemaIssue.Issue` failures instead of wrapping them in `SchemaError`, and `Schema.withConstructorDefault` accepts an `Effect` that fails with `SchemaIssue.Issue`. Fallible `Optic` operations return structured `SchemaIssue.Issue` failures, while schema failures from `Schema.toIso` and `Schema.toDifferJsonPatch` use the generic error message and preserve the issue in `cause` instead of formatting it internally.

- [#7097](https://github.com/Effect-TS/effect/pull/7097) [`8525f05`](https://github.com/Effect-TS/effect/commit/8525f05d1e14ea12298e9e1a0df497bfaac2ce9a) Thanks @tim-smart! - Add `Cron.format` for converting a `Cron` instance to a cron expression, with an option to include the seconds field.

## 4.0.0-beta.104

### Minor Changes

- [#7076](https://github.com/Effect-TS/effect/pull/7076) [`0f721d4`](https://github.com/Effect-TS/effect/commit/0f721d406df8703ea92ca28777b3f09599e2056d) Thanks @tim-smart! - Return the new file offset as a `Size` from `File.seek`.

### Patch Changes

- [#6934](https://github.com/Effect-TS/effect/pull/6934) [`1001bcc`](https://github.com/Effect-TS/effect/commit/1001bccb9e874918d59dbb36860f1c5d4499ac20) Thanks @tim-smart! - httpapi: add typed response headers across handlers, generated clients (including `HttpApiTest`), streaming responses, and OpenAPI with `HttpApiSchema.WithHeaders`. Add `HttpApiSchema.encodeToWithHeaders` for folding response headers into domain types such as error classes. Explicit `content-type` and `content-length` values applied with `HttpServerResponse.setHeader` or `setHeaders` now override body-derived values.

- [#7044](https://github.com/Effect-TS/effect/pull/7044) [`993ba60`](https://github.com/Effect-TS/effect/commit/993ba60ee6c7ca6eb84522040f8b0d268b6ba7d4) Thanks @fubhy! - Commit SQL event journal entries only after their write callback succeeds.

- [#6957](https://github.com/Effect-TS/effect/pull/6957) [`67faacd`](https://github.com/Effect-TS/effect/commit/67faacd4679242559bee31717c05a5b10b990322) Thanks @fubhy! - Select Bash completions for the active positional argument.

- [#6941](https://github.com/Effect-TS/effect/pull/6941) [`b78acdf`](https://github.com/Effect-TS/effect/commit/b78acdf422568f10ae8684fd3f10d52b065f0b56) Thanks @fubhy! - Generate even and odd safe integers in Crypto random APIs.

- [#6965](https://github.com/Effect-TS/effect/pull/6965) [`fbb9ce5`](https://github.com/Effect-TS/effect/commit/fbb9ce5e625d1a7d6b7005bda42cbb6cd31476c5) Thanks @fubhy! - Correct the runtime tag spelling for `CliError.UnknownSubcommand`.

- [#6963](https://github.com/Effect-TS/effect/pull/6963) [`722ea48`](https://github.com/Effect-TS/effect/commit/722ea484c9d01364c9242d929c0a564f7831a57c) Thanks @fubhy! - Exclude disabled choices from multi-select prompt selection and submission.

- [#7001](https://github.com/Effect-TS/effect/pull/7001) [`3058fd5`](https://github.com/Effect-TS/effect/commit/3058fd594f5a683034212d71d957017fcc084006) Thanks @fubhy! - Keep ordered SQL resolver results aligned when batched request encoding fails.

- [#6937](https://github.com/Effect-TS/effect/pull/6937) [`62d0575`](https://github.com/Effect-TS/effect/commit/62d057566c241405c23ecf0bf4156186bd2be924) Thanks @fubhy! - Fix the encoded output type of `TestSchema.Encoding.encodeUnknownEffect`.

- [#7014](https://github.com/Effect-TS/effect/pull/7014) [`99dd6b5`](https://github.com/Effect-TS/effect/commit/99dd6b580434f97c5b40adc919f429e4abc3dfe7) Thanks @tim-smart! - Add lightweight INI, YAML, and TOML parsers under `effect/unstable/encoding` and remove their runtime dependencies.

- [#7053](https://github.com/Effect-TS/effect/pull/7053) [`7963ce1`](https://github.com/Effect-TS/effect/commit/7963ce1cd95f037fbefea67a29ead49cce4d16cb) Thanks @fubhy! - Fix arbitrary generation for tuples with multiple optional elements.

- [#7047](https://github.com/Effect-TS/effect/pull/7047) [`af14e75`](https://github.com/Effect-TS/effect/commit/af14e752edd65e2b652e960411afafc88975a8d8) Thanks @fubhy! - Fix `Tuple.pick` return types to preserve the requested index order and duplicate indices.

- [#7066](https://github.com/Effect-TS/effect/pull/7066) [`24e22d2`](https://github.com/Effect-TS/effect/commit/24e22d23a73a2e93ebf6d8edd2246a4a406942c8) Thanks @fubhy! - Close `ResourceMap` acquisition scopes when a lookup fails.

- [#7036](https://github.com/Effect-TS/effect/pull/7036) [`647d14e`](https://github.com/Effect-TS/effect/commit/647d14e572c8004fa92fba256e00552b42bf34b7) Thanks @fubhy! - Fix scoped reentrant lock finalizers releasing under the wrong fiber owner.

- [#6983](https://github.com/Effect-TS/effect/pull/6983) [`1434eec`](https://github.com/Effect-TS/effect/commit/1434eecbd368e00839c24b3950f0b7a69218669a) Thanks @fubhy! - Apply byte range and chunk size options to default Web file responses.

- [#7071](https://github.com/Effect-TS/effect/pull/7071) [`a5278b1`](https://github.com/Effect-TS/effect/commit/a5278b18242011d1b2b08304c7c128151f9a4370) Thanks @fubhy! - Fix MCP sampling metadata optionality and validate it as an object.

- [#6946](https://github.com/Effect-TS/effect/pull/6946) [`6af04a5`](https://github.com/Effect-TS/effect/commit/6af04a50bd019238f6acdb9cbda40439a3c09210) Thanks @fubhy! - Defer memoized Layer state installation until Effect execution.

- [#6943](https://github.com/Effect-TS/effect/pull/6943) [`cb6c837`](https://github.com/Effect-TS/effect/commit/cb6c8376b2f322d4e7cbfc0973fc3b4f2951ee6e) Thanks @fubhy! - Reject zero execution attempts in `ExecutionPlan` steps.

- [#7026](https://github.com/Effect-TS/effect/pull/7026) [`d44cead`](https://github.com/Effect-TS/effect/commit/d44cead7e0e0ce61f0d980906e494f49a07e7899) Thanks @tim-smart! - Add execution-plan lifecycle events via an optional `onEvent` handler on `Effect.withExecutionPlan` and `Stream.withExecutionPlan`.
  
  The handler receives an `ExecutionPlan.Event`, a tagged union of `AttemptStart`, `AttemptSuccess`, and `AttemptFailure`, allowing attempt outcomes to be observed from outside the effect for logging and metrics:
  
  ```ts
  import { Effect } from "effect"
  
  Effect.withExecutionPlan(program, plan, {
    onEvent: (event) => Effect.log("execution plan event", event)
  })
  ```
  
  Every `AttemptStart` is followed by exactly one terminal event. `AttemptFailure` carries the full failure `Cause`, so defects and interruption are reported as well as expected errors, and terminal events run like finalizers so they are emitted even when the attempt is interrupted. Event numbering matches `ExecutionPlan.CurrentMetadata`: `attempt` is cumulative across steps, while `stepAttempt` is 1-based within the current step.

- [#7077](https://github.com/Effect-TS/effect/pull/7077) [`88c7632`](https://github.com/Effect-TS/effect/commit/88c7632c2b59a49fcc40d250865bd8d0dccf31b0) Thanks @tim-smart! - Rename `Schedule.andThen` and `Schedule.andThenResult` to `Schedule.concat` and `Schedule.concatResult`.

- [#6975](https://github.com/Effect-TS/effect/pull/6975) [`abcbb2a`](https://github.com/Effect-TS/effect/commit/abcbb2abe16f1b6c587c15007df14371e1e70e93) Thanks @fubhy! - Encode SSE events with empty data as dispatchable events.

- [#7037](https://github.com/Effect-TS/effect/pull/7037) [`8f63cce`](https://github.com/Effect-TS/effect/commit/8f63cce636700fde26b140b82e350ef916989d86) Thanks @fubhy! - Preserve OTLP metric delta checkpoints when an export fails.

- [#7057](https://github.com/Effect-TS/effect/pull/7057) [`d56dfcf`](https://github.com/Effect-TS/effect/commit/d56dfcf54c2b9c53c3d098ce4b0ffcc84496c5f7) Thanks @fubhy! - Fix the error type exposed by the curried `Sink.catch` overload.

- [#6947](https://github.com/Effect-TS/effect/pull/6947) [`a98cda9`](https://github.com/Effect-TS/effect/commit/a98cda9422e1352f22e81696f759f326ffcfb667) Thanks @fubhy! - Check symbol-keyed properties in Match object patterns.

- [#6956](https://github.com/Effect-TS/effect/pull/6956) [`6704bb8`](https://github.com/Effect-TS/effect/commit/6704bb84c320547f83cf50e8586ffc4c5e4c3cc5) Thanks @fubhy! - Emit valid CSI sequences from the unstable CLI `cursorTo` helper.

- [#7008](https://github.com/Effect-TS/effect/pull/7008) [`6143de2`](https://github.com/Effect-TS/effect/commit/6143de21ee22038b45a8d4eba86f5aade6238eba) Thanks @tim-smart! - Prevent Bash completions from treating flag values as subcommands.

- [#7032](https://github.com/Effect-TS/effect/pull/7032) [`936b135`](https://github.com/Effect-TS/effect/commit/936b1358396eb0a1a7c8e0878ba63297e2106812) Thanks @marbemac! - Fix a `@effect/cluster` shutdown deadlock on single-runner topologies (e.g. single-node deployments and `TestRunner`), where `Sharding.sendOutgoing` retried `EntityNotAssignedToRunner` forever during teardown.

- [#6940](https://github.com/Effect-TS/effect/pull/6940) [`1bbae84`](https://github.com/Effect-TS/effect/commit/1bbae84f88b577a26d04ceb2e76d3143d09c4a20) Thanks @fubhy! - Omit services removed by `Context.addOrOmit` from the returned context type.

- [#7065](https://github.com/Effect-TS/effect/pull/7065) [`d795ee7`](https://github.com/Effect-TS/effect/commit/d795ee771701ea62bd187ef7c0307d9737f68c1a) Thanks @tim-smart! - Fix DevTools span requests to preserve their state when queued for sending.

- [#7016](https://github.com/Effect-TS/effect/pull/7016) [`0a82d88`](https://github.com/Effect-TS/effect/commit/0a82d88b7da73278b6f270118e396d5ed4a64747) Thanks @brandon-julio-t! - Normalize cluster durable clock wake-up timestamps to whole milliseconds.

- [#6945](https://github.com/Effect-TS/effect/pull/6945) [`9215bc5`](https://github.com/Effect-TS/effect/commit/9215bc5da7dd10aa45f07fe44b98f06b6e433d62) Thanks @fubhy! - Preserve integral precision when parsing decimal nano and micro duration inputs

- [#7050](https://github.com/Effect-TS/effect/pull/7050) [`a1b5df2`](https://github.com/Effect-TS/effect/commit/a1b5df2064d92431cfc6e638af613cc3114313d7) Thanks @fubhy! - Include schedule errors in the error channel of `Effect.schedule` and `Effect.scheduleFrom`.

- [#7062](https://github.com/Effect-TS/effect/pull/7062) [`92a9ac5`](https://github.com/Effect-TS/effect/commit/92a9ac5ac0aa63d8975b9ba7a094d6a8f59a98f2) Thanks @fubhy! - Fix the inspectable JSON identity of `FiberSet`.

- [#6959](https://github.com/Effect-TS/effect/pull/6959) [`6bde7f2`](https://github.com/Effect-TS/effect/commit/6bde7f27f3243427203e53fe74472990e5c2a349) Thanks @fubhy! - Match Fish completions against the full nested command path.

- [#6951](https://github.com/Effect-TS/effect/pull/6951) [`a712131`](https://github.com/Effect-TS/effect/commit/a7121310dbb60cbd819bbd702f97663098ec7bb8) Thanks @fubhy! - Use the supplied hash for `HashMap.modifyHash` insertions, updates, and removals.

- [#6989](https://github.com/Effect-TS/effect/pull/6989) [`2e6f760`](https://github.com/Effect-TS/effect/commit/2e6f760dcb44e2b984f3311a8af03a1d68a2ec7e) Thanks @fubhy! - Support standard `BodyInit` values when reading converted client request bodies through `HttpServerRequest`.

- [#6986](https://github.com/Effect-TS/effect/pull/6986) [`aa05804`](https://github.com/Effect-TS/effect/commit/aa0580497e027ed30b756058db0067c3fe07664f) Thanks @fubhy! - Synchronize HTTP server response content headers when replacing the body.

- [#6944](https://github.com/Effect-TS/effect/pull/6944) [`badd3bf`](https://github.com/Effect-TS/effect/commit/badd3bf65fac4dd1e66e1f602db43659722dfced) Thanks @fubhy! - Make `Iterable.flatten` stack safe across empty iterables.

- [#6968](https://github.com/Effect-TS/effect/pull/6968) [`02b0265`](https://github.com/Effect-TS/effect/commit/02b02651ede46a5a2dd3ef8081d0ad89648d0cbf) Thanks @fubhy! - Allow MCP tool calls to omit optional arguments.

- [#7033](https://github.com/Effect-TS/effect/pull/7033) [`3437e21`](https://github.com/Effect-TS/effect/commit/3437e21a56d805781c5e5946a6189795a1dfd411) Thanks @fubhy! - Fix memory journal conflict detection skipping the first newer entry.

- [#7034](https://github.com/Effect-TS/effect/pull/7034) [`41a550d`](https://github.com/Effect-TS/effect/commit/41a550d1fed31e829929a8f5362b5340303164ac) Thanks @fubhy! - Return the first unused remote sequence from the in-memory event journal.

- [#7042](https://github.com/Effect-TS/effect/pull/7042) [`17b5d50`](https://github.com/Effect-TS/effect/commit/17b5d50219ad49533cf9e33d01924a3e16af5eb3) Thanks @fubhy! - Relay entries imported into an in-memory event journal to other remotes.

- [#7074](https://github.com/Effect-TS/effect/pull/7074) [`96e5e95`](https://github.com/Effect-TS/effect/commit/96e5e9576b0315c747462761a61940ff9fe32dd1) Thanks @fubhy! - Preserve and update runner health in the in-memory cluster runner storage.

- [#7038](https://github.com/Effect-TS/effect/pull/7038) [`e4d589e`](https://github.com/Effect-TS/effect/commit/e4d589e0ea08dc57c4793053b395dc0fcc499f34) Thanks @fubhy! - Clear in-memory message primary-key indexes when clearing an entity address.

- [#7005](https://github.com/Effect-TS/effect/pull/7005) [`ae4cf7b`](https://github.com/Effect-TS/effect/commit/ae4cf7b5e2cb5f8c55657e31a61789ad21c38c18) Thanks @fubhy! - Generate valid MSSQL upserts for multi-table persistence.

- [#6998](https://github.com/Effect-TS/effect/pull/6998) [`6ef5f1a`](https://github.com/Effect-TS/effect/commit/6ef5f1a041f3a40bf03fadd0b1feb275c277c635) Thanks @fubhy! - Decode split UTF-8 sequences correctly in NDJSON streams.

- [#6972](https://github.com/Effect-TS/effect/pull/6972) [`2235a29`](https://github.com/Effect-TS/effect/commit/2235a29502c3f33cf6468511ad931089013a7916) Thanks @tim-smart! - Persist a serializable defect when a cluster reply cannot be encoded, preventing persisted entity callers from hanging.

- [#6962](https://github.com/Effect-TS/effect/pull/6962) [`b32f4cb`](https://github.com/Effect-TS/effect/commit/b32f4cb7b2d8ebe817075322622498e3beb05336) Thanks @fubhy! - Support empty records and non-array iterables in `Prompt.all`.

- [#7023](https://github.com/Effect-TS/effect/pull/7023) [`7f4c095`](https://github.com/Effect-TS/effect/commit/7f4c095b62da43780dd7fc2a5d1785ddfce60edf) Thanks @tim-smart! - Rename `RateLimiter.makeSleep` to `RateLimiter.sleep` and support self-first partially applied and uncurried usage.

- [#7041](https://github.com/Effect-TS/effect/pull/7041) [`5f3fb81`](https://github.com/Effect-TS/effect/commit/5f3fb814d18d8a54946c1c1cd0b41459cdb24006) Thanks @fubhy! - End runner streams after emitting their terminal replies.

- [#7020](https://github.com/Effect-TS/effect/pull/7020) [`17f0b91`](https://github.com/Effect-TS/effect/commit/17f0b91a243ccfe4a38d27debdc983adf434e738) Thanks @gcanti! - Fix `Schema.make` to preserve existing nested `Schema.Class` instances, including in array fields, while recursively constructing plain class inputs provided at runtime inside unions. Constructor defaults remain scoped to structural field and element occurrences, with `SchemaAST.Context.constructorDefault` representing the single default link for each occurrence.
  
  Optimize `Function.memoize` to use a single `WeakMap` lookup for cached values. Its callback no longer accepts `undefined` as a return type because `undefined` represents a cache miss.
  
  The performance of the two array paths can be reproduced by saving the following program as
  `scratchpad/schema-make-6890-benchmark.ts` and running `node scratchpad/schema-make-6890-benchmark.ts` from the repository
  root:
  
  ```ts
  import { Schema } from "effect"
  import { performance } from "node:perf_hooks"
  
  class Row extends Schema.Class<Row>("Row")({ value: Schema.String }) {}
  class DirectTable extends Schema.Class<DirectTable>("DirectTable")({ rows: Schema.Array(Row) }) {}
  class UnionTable extends Schema.Class<UnionTable>("UnionTable")({ rows: Schema.Array(Schema.Union([Row])) }) {}
  
  const rows = Array.from({ length: 30_000 }, (_, value) => Row.make({ value: String(value) }))
  
  function benchmark(label: string, make: () => { readonly rows: ReadonlyArray<Row> }) {
    const samples: Array<number> = []
    for (let i = 0; i < 6; i++) {
      const start = performance.now()
      const result = make()
      samples.push(performance.now() - start)
      if (result.rows[0] !== rows[0] || result.rows.at(-1) !== rows.at(-1)) {
        throw new Error(`${label} did not preserve Row identity`)
      }
    }
    console.log(`${label}: ${samples.slice(1).map((n) => n.toFixed(3)).join(", ")} ms`)
  }
  
  benchmark("Array(Class)", () => DirectTable.make({ rows }))
  benchmark("Array(Union([Class]))", () => UnionTable.make({ rows }))
  ```
  
  Representative local results on Node 24.12.0 (six runs, with the first discarded):
  
  ```text
  Array(Class): 0.639, 0.498, 0.447, 0.448, 0.451 ms
  Array(Union([Class])): 3.141, 2.195, 2.126, 2.108, 2.057 ms
  ```

- [#7055](https://github.com/Effect-TS/effect/pull/7055) [`0cdadd7`](https://github.com/Effect-TS/effect/commit/0cdadd75bc8abbbcad7956a4bc71f4e7a9b13250) Thanks @fubhy! - Fix `Stream.slidingSize` to produce the same windows regardless of upstream chunk boundaries.

- [#6978](https://github.com/Effect-TS/effect/pull/6978) [`39b57d7`](https://github.com/Effect-TS/effect/commit/39b57d7857358040558b67dd33eafc7bb5457830) Thanks @fubhy! - Retain the last SSE event ID across dispatched events.

- [#6976](https://github.com/Effect-TS/effect/pull/6976) [`5a6a573`](https://github.com/Effect-TS/effect/commit/5a6a5738e5bfc39e3a37ae7ba99081601fa19ac3) Thanks @fubhy! - Recognize and ignore a leading UTF-8 byte order mark in server-sent event streams.

- [#7048](https://github.com/Effect-TS/effect/pull/7048) [`59f5e99`](https://github.com/Effect-TS/effect/commit/59f5e9981913b92d7a9beb2214a21d658b999d3a) Thanks @fubhy! - Ignore malformed retry directives when parsing server-sent event streams.

- [#7028](https://github.com/Effect-TS/effect/pull/7028) [`45379d6`](https://github.com/Effect-TS/effect/commit/45379d6179ee4df2cbd3f848bd39ff7149c24a38) Thanks @fubhy! - Fix `Trie.insert` to replace existing values without mutating the original trie or increasing its size.

- [#6973](https://github.com/Effect-TS/effect/pull/6973) [`1949439`](https://github.com/Effect-TS/effect/commit/1949439175809ef81ab9c6411ed5559109edb4c9) Thanks @fubhy! - Separate the default `VariantSchema` cache from named variant entries.

- [#7072](https://github.com/Effect-TS/effect/pull/7072) [`e443403`](https://github.com/Effect-TS/effect/commit/e443403cf0e4effea14bb6cd950c5ac1c86cc748) Thanks @fubhy! - Keep MCP tool calls that return void successful.

- [#7000](https://github.com/Effect-TS/effect/pull/7000) [`03af7e8`](https://github.com/Effect-TS/effect/commit/03af7e85551204c605ea2fa2c43c10a4538ac8fb) Thanks @fubhy! - Close suspended workflow scopes after resumed completion.

- [#7027](https://github.com/Effect-TS/effect/pull/7027) [`130b28d`](https://github.com/Effect-TS/effect/commit/130b28df552d7053407b041a96ff09dae82575e5) Thanks @pawelblaszczyk5! - Prevent Effect.updateService and Effect.updateServiceScoped supertype widening

- [#6948](https://github.com/Effect-TS/effect/pull/6948) [`c987a12`](https://github.com/Effect-TS/effect/commit/c987a12a01b6a52ad53d29edf02613b03574dbcc) Thanks @fubhy! - Honor numeric zero time-to-live values in `Cache.make` and `ScopedCache.make`.

- [#6974](https://github.com/Effect-TS/effect/pull/6974) [`4158562`](https://github.com/Effect-TS/effect/commit/41585620977de9b84171f76619b72e29cc2284e5) Thanks @fubhy! - Handle accepted undefined fields during variant extraction.

- [#7013](https://github.com/Effect-TS/effect/pull/7013) [`306014a`](https://github.com/Effect-TS/effect/commit/306014a1ce4d5cb956c76bdc20e4e28ab3e61a6a) Thanks @tim-smart! - Fix several edge cases in the vendored FindMyWay router.

- [#6949](https://github.com/Effect-TS/effect/pull/6949) [`729a663`](https://github.com/Effect-TS/effect/commit/729a663275dd31f2357c446fe69664429220a83d) Thanks @fubhy! - Keep TestClock nanosecond access total after infinite adjustments.

- [#6997](https://github.com/Effect-TS/effect/pull/6997) [`caf84b6`](https://github.com/Effect-TS/effect/commit/caf84b660044089e8d7f4067b279b27b8b50e8fd) Thanks @fubhy! - Isolate compiled SQL fragment caches by compiler instance.

- [#6960](https://github.com/Effect-TS/effect/pull/6960) [`ce067f7`](https://github.com/Effect-TS/effect/commit/ce067f799ea27735d4194345298a216aaf429f01) Thanks @fubhy! - Mark omittable CLI flags and arguments as optional in structured help.

- [#7025](https://github.com/Effect-TS/effect/pull/7025) [`7a41f5a`](https://github.com/Effect-TS/effect/commit/7a41f5aa72d540ecf2746992ecc3fa3e6b40d31f) Thanks @pawelblaszczyk5! - Prevent Effect.provideServiceEffect supertype widening

- [#7056](https://github.com/Effect-TS/effect/pull/7056) [`781022a`](https://github.com/Effect-TS/effect/commit/781022acdd3537ca18c88e2fa3681bafa6ef1b21) Thanks @fubhy! - Fix Map and Set equality allowing a right-side entry to match multiple left-side entries.

- [#7063](https://github.com/Effect-TS/effect/pull/7063) [`39f1297`](https://github.com/Effect-TS/effect/commit/39f1297acc08864feb12de6b8cf2bf73434f6cf5) Thanks @fubhy! - Preserve literal element types in `Tuple.make`.

- [#6955](https://github.com/Effect-TS/effect/pull/6955) [`2db266b`](https://github.com/Effect-TS/effect/commit/2db266b1bfbc81868bc1778c37c76032a267c79f) Thanks @fubhy! - Include plain variant structs in the default variant union.

- [#6954](https://github.com/Effect-TS/effect/pull/6954) [`2141e28`](https://github.com/Effect-TS/effect/commit/2141e28903754d72604acf81673ceb2c62a56646) Thanks @fubhy! - Preserve CRLF state across SSE input chunk boundaries.

- [#6950](https://github.com/Effect-TS/effect/pull/6950) [`3c5e429`](https://github.com/Effect-TS/effect/commit/3c5e429878669ffcf5e0da4ddfbf50bde5bbcaad) Thanks @fubhy! - Preserve nanosecond precision for large `TestClock` wall-clock timestamps.

- [#6958](https://github.com/Effect-TS/effect/pull/6958) [`20ddc63`](https://github.com/Effect-TS/effect/commit/20ddc630584f8fe488162ba384adcae53fc6810a) Thanks @fubhy! - Preserve hidden command metadata when adding subcommands or shared flags.

- [#6939](https://github.com/Effect-TS/effect/pull/6939) [`841b3ea`](https://github.com/Effect-TS/effect/commit/841b3ea6ae19a784bc1c20497b02f632af0c91e9) Thanks @fubhy! - Preserve sibling provider input evidence when `Config.all` evaluates a failing child.

- [#6836](https://github.com/Effect-TS/effect/pull/6836) [`82a3fbf`](https://github.com/Effect-TS/effect/commit/82a3fbfce8b9df33e587076b7d7168ecd6799e17) Thanks @mkdynamic! - Route provider-executed tool results into the assistant message in `Prompt.fromResponseParts`

- [#7003](https://github.com/Effect-TS/effect/pull/7003) [`eb9ee83`](https://github.com/Effect-TS/effect/commit/eb9ee83b38844a71d1cd5653a229309cfcb04a36) Thanks @fubhy! - Persist permanent entries in KVS `setMany` operations.

- [#7039](https://github.com/Effect-TS/effect/pull/7039) [`64dc7c7`](https://github.com/Effect-TS/effect/commit/64dc7c76dc5c89887b9e7c181d1873dcbb7820d1) Thanks @fubhy! - Fix failed `ResourceRef` rebuilds permanently blocking waiters.

- [#6971](https://github.com/Effect-TS/effect/pull/6971) [`84dc8ab`](https://github.com/Effect-TS/effect/commit/84dc8ab7accc682bc668c78a97e4a1776b633be8) Thanks @tim-smart! - Serialize concurrent nested SQL transactions to prevent savepoint collisions. Cross-dependent sibling nested
  transactions now deadlock instead of interleaving and risking silent data corruption.

- [#6952](https://github.com/Effect-TS/effect/pull/6952) [`b4463f4`](https://github.com/Effect-TS/effect/commit/b4463f46fc33d3b01ea5eadd7d012a5abda347a3) Thanks @fubhy! - Register alternate flags used by `Param.orElse` and `Param.orElseResult`.

- [#6732](https://github.com/Effect-TS/effect/pull/6732) [`592dd36`](https://github.com/Effect-TS/effect/commit/592dd361645739ac0cd8e6babb084cd27403c172) Thanks @tim-smart! - Rename the Schema error constructors to align with their `Data` counterparts.
  
  - `Schema.ErrorClass` is now `Schema.Error`.
  - `Schema.TaggedErrorClass` is now `Schema.TaggedError`.
  - The JavaScript `Error` instance schema is now `Schema.ErrorInstance`.
  - `Schema.ErrorReviver` is now `Schema.ErrorInstanceReviver`.

- [#7068](https://github.com/Effect-TS/effect/pull/7068) [`85d2b44`](https://github.com/Effect-TS/effect/commit/85d2b446e3059de4919be730105868f79728308d) Thanks @tim-smart! - Report retried RPC socket open failures through the `onTransientError` protocol hook and fail in-flight requests when the retry policy is exhausted.

- [#7006](https://github.com/Effect-TS/effect/pull/7006) [`32e4a69`](https://github.com/Effect-TS/effect/commit/32e4a69b3151b7ec4058af2213b96a41d11e9e06) Thanks @fubhy! - Scope custom persisted queue ID deduplication to each named queue.

- [#6938](https://github.com/Effect-TS/effect/pull/6938) [`13c5872`](https://github.com/Effect-TS/effect/commit/13c5872ed30830360367ad89af2dab68a003c351) Thanks @fubhy! - Honor populated variables before dotenv expansion defaults in `ConfigProvider`.

- [#7040](https://github.com/Effect-TS/effect/pull/7040) [`3454cdb`](https://github.com/Effect-TS/effect/commit/3454cdb528fdb5d3ed0c5c5c8169bc47de41fbd8) Thanks @fubhy! - Fix `SynchronizedRef.getAndUpdateSome` to update its backing ref.

- [#7018](https://github.com/Effect-TS/effect/pull/7018) [`e930804`](https://github.com/Effect-TS/effect/commit/e9308045be1d8a00c0b4046f1e8ff22cf68c93da) Thanks @tim-smart! - Hold persisted cluster messages while entity layers are still registering, while retaining a bounded failure when
  registration never begins.

- [#6987](https://github.com/Effect-TS/effect/pull/6987) [`7f12d4b`](https://github.com/Effect-TS/effect/commit/7f12d4b4e731dc3a213ae5c3f60db9edc50292d2) Thanks @fubhy! - Map WebSocket send exceptions and transform stream write rejections to typed `SocketError` failures.

- [#6977](https://github.com/Effect-TS/effect/pull/6977) [`181c9ef`](https://github.com/Effect-TS/effect/commit/181c9ef5e5d4ab247bf4aec06424f15b0a1e802e) Thanks @fubhy! - Default empty Server-Sent Event types to `message`.

- [#7010](https://github.com/Effect-TS/effect/pull/7010) [`dd9f891`](https://github.com/Effect-TS/effect/commit/dd9f891e23f316abb6192893008f0e33ece9d97d) Thanks @tim-smart! - Rename `Command.withHidden` to `Command.unlisted`, along with the `hidden` command property which is now `unlisted`.

- [#7054](https://github.com/Effect-TS/effect/pull/7054) [`433fb81`](https://github.com/Effect-TS/effect/commit/433fb81ca4c15c681a8ae097ce3ff9bd3a9c9aa5) Thanks @fubhy! - Fix the return type of `Channel.runCount` to expose its numeric result.

- [#7012](https://github.com/Effect-TS/effect/pull/7012) [`8459cdb`](https://github.com/Effect-TS/effect/commit/8459cdbae8a476dc04b6247fffe6a1668dcb1217) Thanks @tim-smart! - Vendor the multipart parser as `effect/unstable/http/MultipartParser`, add the Node.js adapter at `@effect/platform-node/NodeMultipartParser`, and remove the external `multipasta` dependency.

- [#6953](https://github.com/Effect-TS/effect/pull/6953) [`6124ab3`](https://github.com/Effect-TS/effect/commit/6124ab39eb64688fbd5d688d24766542f9cb5a2c) Thanks @fubhy! - Reject truncated MessagePack frames at the end of a stream.

- [#6961](https://github.com/Effect-TS/effect/pull/6961) [`01bd954`](https://github.com/Effect-TS/effect/commit/01bd9546f142706fca1628f7261e6d1cb9638948) Thanks @fubhy! - Preserve file and directory semantics in CLI completion descriptors.

- [#6990](https://github.com/Effect-TS/effect/pull/6990) [`ba2c3aa`](https://github.com/Effect-TS/effect/commit/ba2c3aa05eb87ec05d263b960017ecf29746f66a) Thanks @fubhy! - Generate unique persisted paths for multipart files with duplicate filenames.

- [#7019](https://github.com/Effect-TS/effect/pull/7019) [`0a45ef3`](https://github.com/Effect-TS/effect/commit/0a45ef3bb4a1ae9b345c43c548db4336a31b3191) Thanks @tim-smart! - Round Redis persistence TTLs up to whole milliseconds before passing them to integer-only expiration commands.

- [#7012](https://github.com/Effect-TS/effect/pull/7012) [`8459cdb`](https://github.com/Effect-TS/effect/commit/8459cdbae8a476dc04b6247fffe6a1668dcb1217) Thanks @tim-smart! - Prevent malformed encoded multipart filenames from throwing during parsing.

- [#7029](https://github.com/Effect-TS/effect/pull/7029) [`eaa7e71`](https://github.com/Effect-TS/effect/commit/eaa7e71b88bf59b24610128c6115a2a126432731) Thanks @fubhy! - Fix unencrypted event log conflict scanning to inspect the newer history suffix.

- [#6988](https://github.com/Effect-TS/effect/pull/6988) [`db4c2cc`](https://github.com/Effect-TS/effect/commit/db4c2ccdec77d813b6f4cc72a302ee7c4fe6e39d) Thanks @fubhy! - Preserve lexical ordering in streaming template interpolation.

- [#6964](https://github.com/Effect-TS/effect/pull/6964) [`22f150a`](https://github.com/Effect-TS/effect/commit/22f150a0936cef30517e87eaca73bff1c5e4873a) Thanks @fubhy! - Correct year, ordinal, and meridiem date-mask formatting.

- [#6966](https://github.com/Effect-TS/effect/pull/6966) [`90ffb08`](https://github.com/Effect-TS/effect/commit/90ffb083b3091c211300f50a42ba7bf56536c0ee) Thanks @fubhy! - Preserve fractional leading zeros while editing float prompts.

- [#6982](https://github.com/Effect-TS/effect/pull/6982) [`d517692`](https://github.com/Effect-TS/effect/commit/d517692ef75f45d5f6d9d68b32d41fa0ccc56c99) Thanks @fubhy! - Reject NDJSON values without a JSON representation.

- [#6942](https://github.com/Effect-TS/effect/pull/6942) [`01af079`](https://github.com/Effect-TS/effect/commit/01af079c189d1fc5067d3b1933b2870c4baf2693) Thanks @fubhy! - Validate object-based DateTime instants before construction.

- [#6985](https://github.com/Effect-TS/effect/pull/6985) [`32a59e8`](https://github.com/Effect-TS/effect/commit/32a59e8058b1ec9738cb083cf1cb116b393ca114) Thanks @fubhy! - Preserve original HTTP response bytes when reading response text first.

## 4.0.0-beta.103

### Minor Changes

- [#6793](https://github.com/Effect-TS/effect/pull/6793) [`b2f95a9`](https://github.com/Effect-TS/effect/commit/b2f95a9c2f2581deb89dc3bae9e89cf819e82923) Thanks @tim-smart! - Add `Semaphore.takeIfAvailable` for non-blocking manual permit acquisition.

- [#6693](https://github.com/Effect-TS/effect/pull/6693) [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046) Thanks @lloydrichards! - Expose object-shaped Toolkit success schemas as MCP tool output schemas.

- [#6807](https://github.com/Effect-TS/effect/pull/6807) [`d0f1a22`](https://github.com/Effect-TS/effect/commit/d0f1a2295155c350b04efb46852cb40032805273) Thanks @alecbuffi! - Separate wall-clock timestamps from monotonic elapsed time.

  `Clock.Clock` now requires `monotonicTimeNanosUnsafe()` and `monotonicTimeNanos` for measuring elapsed time. Custom `Clock` implementations must provide both members. The live clock's `currentTimeNanos` now re-anchors its high-resolution Unix wall-clock timestamp when it drifts from `Date.now()`, while `Effect.timed`, duration metric tracking, and `Sink.withDuration` use monotonic time so wall-clock corrections do not distort elapsed durations.

### Patch Changes

- [#6697](https://github.com/Effect-TS/effect/pull/6697) [`e56cd8f`](https://github.com/Effect-TS/effect/commit/e56cd8f90c3559baccf8fcf2852ea911235d5944) Thanks @schickling-assistant! - Add a configurable filter for HTTP client request and response header span attributes.

- [#6883](https://github.com/Effect-TS/effect/pull/6883) [`f77c120`](https://github.com/Effect-TS/effect/commit/f77c120d8e04779ddeb8bce8e9cde932f268e4b6) Thanks @gcanti! - Add support for converting JSON Schema documents to Draft-04, preserve literal `$ref` values, `$ref` sibling constraints, `not`, `readOnly`, and `writeOnly` in Draft-07 conversions, correct the Draft-07 meta-schema URI, and prevent OpenAPI component-key collisions during conversion.

- [#6564](https://github.com/Effect-TS/effect/pull/6564) [`04fd44a`](https://github.com/Effect-TS/effect/commit/04fd44a42abfa8dc2642300dcf49ee48c8ef4539) Thanks @AVtheking! - Run shared-table SQL persistence expiration cleanup in indexed, bounded background batches.

- [#6911](https://github.com/Effect-TS/effect/pull/6911) [`b74333d`](https://github.com/Effect-TS/effect/commit/b74333d83e15b9d042e4698ad23040de60454afe) Thanks @fubhy! - Update existing `HashRing` nodes when adding a value with the same primary key.

- [#6909](https://github.com/Effect-TS/effect/pull/6909) [`1c40b28`](https://github.com/Effect-TS/effect/commit/1c40b2809503d6aa1358777196fc66317906e657) Thanks @AlfGoto! - Add `DateTime.toEpochSeconds` and `DateTime.fromEpochSeconds` for converting date-time values to and from Unix epoch seconds.

- [#6693](https://github.com/Effect-TS/effect/pull/6693) [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046) Thanks @lloydrichards! - MCP tool handler defects now return a stable internal error without exposing defect details.

- [#6874](https://github.com/Effect-TS/effect/pull/6874) [`b3901d2`](https://github.com/Effect-TS/effect/commit/b3901d29c543fd5bd05ceec669a17896c8e19006) Thanks @fubhy! - Fix `Equal.equals` and `Hash.hash` to handle invalid dates and `DataView` values without throwing.

- [#6869](https://github.com/Effect-TS/effect/pull/6869) [`4a0984a`](https://github.com/Effect-TS/effect/commit/4a0984af62738fedf4bd3e87adb4d4d641ce9147) Thanks @fubhy! - Fix SQL-backed Persistence `getMany` to preserve duplicate key positions.

- [#6868](https://github.com/Effect-TS/effect/pull/6868) [`fffd88b`](https://github.com/Effect-TS/effect/commit/fffd88b3135abdf928ca7c4b0e00e610985091c7) Thanks @fubhy! - Ensure clearing an empty Redis-backed persistence store succeeds.

- [#6903](https://github.com/Effect-TS/effect/pull/6903) [`f3f6c1e`](https://github.com/Effect-TS/effect/commit/f3f6c1e02cb543423fcffef5dc2db03fac503588) Thanks @fubhy! - Preserve equals signs in inline CLI option values after the first separator.

- [#6876](https://github.com/Effect-TS/effect/pull/6876) [`ef07642`](https://github.com/Effect-TS/effect/commit/ef07642dfe671d5258b65d1c1480c4d05c495f15) Thanks @fubhy! - Fix `Sink.reduceWhileArray` applying its reducer more than once per input array.

- [#6802](https://github.com/Effect-TS/effect/pull/6802) [`f1bc827`](https://github.com/Effect-TS/effect/commit/f1bc8274a608813d7b09d28dcca04adbf62f8c92) Thanks @tim-smart! - Cap incomplete RPC frames buffered by the NDJSON and MessagePack streaming decoders, and close socket transports when the limit is exceeded.

- [#6693](https://github.com/Effect-TS/effect/pull/6693) [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046) Thanks @lloydrichards! - RPC servers now suppress responses after a client cancels an in-flight request.

- [#6723](https://github.com/Effect-TS/effect/pull/6723) [`081f4d8`](https://github.com/Effect-TS/effect/commit/081f4d8cd06a2ac222d2810b46e61efcee26939e) Thanks @tim-smart! - add platform literal to HttpPlatform

- [#6788](https://github.com/Effect-TS/effect/pull/6788) [`5287b24`](https://github.com/Effect-TS/effect/commit/5287b24f5f8fa094ba20e117bfb1a80fba6d2cf5) Thanks @gcanti! - Refine the `ConfigProvider` interface so lookup absence uses `undefined` and
  path transformation is provider behavior.

  `ConfigProvider.load` and the lookup function accepted by
  `ConfigProvider.make` now return `Node | undefined`. Use `undefined` when a path
  does not exist and return the `Node` directly when it does.

  `ConfigProvider` now exposes `mapInput` as a capability. The exported
  `ConfigProvider.mapInput` combinator delegates to it, preserving transformation
  order and composition through `orElse` without requiring provider
  representation state.

- [#6863](https://github.com/Effect-TS/effect/pull/6863) [`13d31cf`](https://github.com/Effect-TS/effect/commit/13d31cfc2dde46210e94391b5b6767ae9aeaf2c9) Thanks @fubhy! - Decode percent-encoded OTLP environment header values.

- [#6781](https://github.com/Effect-TS/effect/pull/6781) [`acee269`](https://github.com/Effect-TS/effect/commit/acee26944bc89ee554d7b9fadab7443f9edc28a9) Thanks @gcanti! - Deduplicate equivalent fallback definitions when compiling JSON Schema, and reconstruct only definitions reachable from multi-document roots.

  Remove `SchemaMultiDocument` and `fromSchemaMultiDocument`; multi-document import and revival now return the ordered root schemas directly.

  Stop the OpenAPI generator from emitting component schemas that are not reachable from a generated root.

- [#6717](https://github.com/Effect-TS/effect/pull/6717) [`31170c1`](https://github.com/Effect-TS/effect/commit/31170c19b236c37abb5476c821bc6f5bfa2735ab) Thanks @IMax153! - Document that `CommandOptions.extendEnv` defaults to `false` and that providing `env` without enabling it replaces the inherited child environment.

- [#6657](https://github.com/Effect-TS/effect/pull/6657) [`205ebc7`](https://github.com/Effect-TS/effect/commit/205ebc776062012581e98fced7ced19adfc44ee7) Thanks @tim-smart! - Use cancellable microtasks when dispatching yielded work from synchronous Effect runs.

- [#6661](https://github.com/Effect-TS/effect/pull/6661) [`ed0ebf8`](https://github.com/Effect-TS/effect/commit/ed0ebf8e5c864d46fed1f232e99c0e680f10a58f) Thanks @tim-smart! - Fix hydrated atoms with `Atom.withReactivity` to refresh after reactive mutations.

- [#6665](https://github.com/Effect-TS/effect/pull/6665) [`a3fd084`](https://github.com/Effect-TS/effect/commit/a3fd08482157bd78b089f77c7b173d54ef68b5cd) Thanks @tim-smart! - Fix `HttpRouter.toWebHandler` context inference for services provided by the application layer.

- [#6681](https://github.com/Effect-TS/effect/pull/6681) [`ee29ddf`](https://github.com/Effect-TS/effect/commit/ee29ddf862c3723ad466abc93ab6f6fe723b2319) Thanks @tim-smart! - Add Web Stream interoperability for `Channel` and `Sink`, plus byte limiting and `ArrayBuffer` collection for `Stream`.

- [#6730](https://github.com/Effect-TS/effect/pull/6730) [`6086309`](https://github.com/Effect-TS/effect/commit/60863090af8e5af0bfa1435f08dc5390f9993e30) Thanks @tim-smart! - Support replaying initial WebSocket messages and normalize `ArrayBuffer` frames to `Uint8Array`.

- [#6763](https://github.com/Effect-TS/effect/pull/6763) [`4a57af2`](https://github.com/Effect-TS/effect/commit/4a57af24011db1d66e947289d2f7ffc2074696d2) Thanks @tim-smart! - Validate cookie names, domains, and paths before constructing or serializing cookies.

- [#6771](https://github.com/Effect-TS/effect/pull/6771) [`660875b`](https://github.com/Effect-TS/effect/commit/660875b4325e6eebb3f04513998301cd2a0847ec) Thanks @tim-smart! - Strip credential headers on cross-origin HTTP redirects and align redirected request methods with fetch.

- [#6777](https://github.com/Effect-TS/effect/pull/6777) [`8e7c706`](https://github.com/Effect-TS/effect/commit/8e7c706b0aca855489b53d987404566d3e9cb5e7) Thanks @tim-smart! - Bound pending SSE decoder state with a configurable maximum event size.

- [#6772](https://github.com/Effect-TS/effect/pull/6772) [`5f63adb`](https://github.com/Effect-TS/effect/commit/5f63adbe75fc9d50d23706a52b3e483ad2a1a01c) Thanks @tim-smart! - Reject empty, `.` and `..` keys in file-backed key-value stores.

- [#6773](https://github.com/Effect-TS/effect/pull/6773) [`053bc42`](https://github.com/Effect-TS/effect/commit/053bc42e2a964755611a216e78ed214322efee37) Thanks @tim-smart! - Escape terminal control characters in unstable CLI error output.

- [#6898](https://github.com/Effect-TS/effect/pull/6898) [`c0a1534`](https://github.com/Effect-TS/effect/commit/c0a153494484ecf9f0d0f20895a7a648b4be363b) Thanks @tim-smart! - Add HTTP response compression support. Node.js, Bun, and Deno use asynchronous
  `node:zlib` one-shot compression for byte-array bodies, preserving an exact
  `Content-Length`; stream and raw bodies remain streaming transforms.

- [#6859](https://github.com/Effect-TS/effect/pull/6859) [`f1e3a37`](https://github.com/Effect-TS/effect/commit/f1e3a378c144f974a6122b299f421b75595af20f) Thanks @fubhy! - Fix `String.snakeToCamel` and `String.snakeToPascal` to return an empty string for empty input.

- [#6746](https://github.com/Effect-TS/effect/pull/6746) [`cedb01a`](https://github.com/Effect-TS/effect/commit/cedb01a025492a1faf9e59eb23eb96bc3b5e2fff) Thanks @fubhy! - Prefer explicit OTLP resource configuration over environment configuration.

- [#6677](https://github.com/Effect-TS/effect/pull/6677) [`1747440`](https://github.com/Effect-TS/effect/commit/1747440de9a51a56ed3660da748cc01b256adce7) Thanks @tim-smart! - Expose runtime schemas for AI prompt parts and message-specific part unions.

- [#6693](https://github.com/Effect-TS/effect/pull/6693) [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046) Thanks @lloydrichards! - MCP servers now advertise logging and honor each client's selected log level when sending log notifications.

- [#6693](https://github.com/Effect-TS/effect/pull/6693) [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046) Thanks @lloydrichards! - Preserve MCP sampling request preferences and response content.

- [#6878](https://github.com/Effect-TS/effect/pull/6878) [`b4f1ee2`](https://github.com/Effect-TS/effect/commit/b4f1ee238d96aa78c5f040158cb78671d75b381e) Thanks @fubhy! - Fix Array index operations handling `NaN` and fractional indexes.

- [#6751](https://github.com/Effect-TS/effect/pull/6751) [`a4757f1`](https://github.com/Effect-TS/effect/commit/a4757f1c47067d8d016a6c4a2c541bb8ae520f9b) Thanks @tim-smart! - Fix Atom dependency tracking and re-entrant invalidation during batch rebuilds.

- [#6870](https://github.com/Effect-TS/effect/pull/6870) [`cd122b9`](https://github.com/Effect-TS/effect/commit/cd122b90300d995a237993a2edb7a049785ab6a4) Thanks @fubhy! - Ensure `BigInt.gcd` and `BigInt.lcm` return non-negative values and handle zero operands in `BigInt.lcm`.

- [#6844](https://github.com/Effect-TS/effect/pull/6844) [`5de588b`](https://github.com/Effect-TS/effect/commit/5de588b2472fb0f4eb919766eb8472583a044772) Thanks @fubhy! - Prevent an interrupted cache lookup from removing a newer value written with `Cache.set`.

- [#6879](https://github.com/Effect-TS/effect/pull/6879) [`3895b9c`](https://github.com/Effect-TS/effect/commit/3895b9cf179262cd277a9c6daafe9050dcf8265e) Thanks @fubhy! - Preserve failure annotations when mapping errors with `Cause.map`.

- [#6820](https://github.com/Effect-TS/effect/pull/6820) [`89ce5f3`](https://github.com/Effect-TS/effect/commit/89ce5f3e16e23a193daa475dc72ea8133ae1dacd) Thanks @fubhy! - Fix `ChannelSchema.decodeUnknown` to accept unknown input chunks while keeping `ChannelSchema.decode` typed to the schema's encoded input.

- [#6899](https://github.com/Effect-TS/effect/pull/6899) [`985de09`](https://github.com/Effect-TS/effect/commit/985de097d75906db2aed784841f81e23cc978b43) Thanks @fubhy! - Ensure `Chunk.take` and `Chunk.drop` produce valid chunks for fractional counts.

- [#6579](https://github.com/Effect-TS/effect/pull/6579) [`9800e3a`](https://github.com/Effect-TS/effect/commit/9800e3acc8f36530f671bc8b91558cb112f449a7) Thanks @marbemac! - Scope cluster reply serialization failures and peer-delivered defects to their own request instead of the whole runner connection

- [#6800](https://github.com/Effect-TS/effect/pull/6800) [`4dc35f6`](https://github.com/Effect-TS/effect/commit/4dc35f64641746366f867ea3dbfedb9cd4685ada) Thanks @tim-smart! - Fix persisted cluster stream recovery when SQL drivers return a null reply kind.

- [#6814](https://github.com/Effect-TS/effect/pull/6814) [`e8eb62b`](https://github.com/Effect-TS/effect/commit/e8eb62b3d0ef27e9761cdc2eb93bdec52d6ee204) Thanks @gcanti! - Preserve provider input evidence when `Config.orElse` recovers a configuration failure.

- [#6873](https://github.com/Effect-TS/effect/pull/6873) [`ecd9993`](https://github.com/Effect-TS/effect/commit/ecd99936112cb69efdb02de3a2fd57f47baefdf3) Thanks @fubhy! - Propagate the `FiberSet.runtime` interruption option when registering managed fibers.

- [#6872](https://github.com/Effect-TS/effect/pull/6872) [`5ab9c08`](https://github.com/Effect-TS/effect/commit/5ab9c08463ce049c45f3502676954a7b72c6b024) Thanks @fubhy! - Fix `Formatter.format` handling of shared references and ensure `Formatter.formatJson` always returns valid JSON.

- [#6867](https://github.com/Effect-TS/effect/pull/6867) [`f5cf965`](https://github.com/Effect-TS/effect/commit/f5cf96548afd51f4b3cf1aea11b04d7f8549ce90) Thanks @fubhy! - Remove stale `content-length` headers when replacing an HTTP client request body with one of unknown length.

- [#6924](https://github.com/Effect-TS/effect/pull/6924) [`a94cbed`](https://github.com/Effect-TS/effect/commit/a94cbed84e9e49bea4bff925599c0f19c4e3deab) Thanks @fubhy! - Ignore `uniqueItems` when set to `false` while importing JSON Schema documents.

- [#6871](https://github.com/Effect-TS/effect/pull/6871) [`9160ad7`](https://github.com/Effect-TS/effect/commit/9160ad7d146d4376dd12f7510c025e5b2f638a70) Thanks @fubhy! - Fix `LayerMap` preload options so configured entries are acquired during construction.

- [#6693](https://github.com/Effect-TS/effect/pull/6693) [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046) Thanks @lloydrichards! - MCP completion handlers now receive resolved argument context, and completion responses are limited to one hundred values.

- [#6693](https://github.com/Effect-TS/effect/pull/6693) [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046) Thanks @lloydrichards! - MCP servers now return protocol errors for invalid tool, prompt, completion, resource, and logging requests.

- [#6901](https://github.com/Effect-TS/effect/pull/6901) [`52494be`](https://github.com/Effect-TS/effect/commit/52494be9e8eb3bb542d06a3dfefc6bca4e168984) Thanks @fubhy! - Prevent distinct metric attribute sets from sharing registry state.

- [#6822](https://github.com/Effect-TS/effect/pull/6822) [`5441c8e`](https://github.com/Effect-TS/effect/commit/5441c8e656a6418c0d27feb2df67565a3e1155f4) Thanks @fubhy! - Fix `Metric.isMetric` to recognize metrics using their current runtime brand.

- [#6821](https://github.com/Effect-TS/effect/pull/6821) [`c9b56ab`](https://github.com/Effect-TS/effect/commit/c9b56ab507f224426ee8388dc450da447ec4715f) Thanks @fubhy! - Fix `Metric.linearBoundaries` to space boundaries by the configured width.

- [#6847](https://github.com/Effect-TS/effect/pull/6847) [`8ef7257`](https://github.com/Effect-TS/effect/commit/8ef72577d1f43212cab87951d659e54e3c8d7d91) Thanks @fubhy! - Fix `MutableList.prepend` on empty lists and handle non-positive `toArrayN` bounds.

- [#6865](https://github.com/Effect-TS/effect/pull/6865) [`1519406`](https://github.com/Effect-TS/effect/commit/1519406fed6e8b017ae178dc20bcaa2cf318b570) Thanks @fubhy! - Fix `OtlpResource` to decode percent-encoded environment attributes and preserve bigint precision.

- [#6805](https://github.com/Effect-TS/effect/pull/6805) [`9716990`](https://github.com/Effect-TS/effect/commit/97169902eec3c99baa7f0b2c7b45a0a5eae75819) Thanks @tim-smart! - Prevent replay-enabled PubSubs from retaining values beyond each subscription's replay window.

- [#6711](https://github.com/Effect-TS/effect/pull/6711) [`733f75b`](https://github.com/Effect-TS/effect/commit/733f75b7125e3016a975fdd251c0179ae5393786) Thanks @andrskr! - Preserve serialization and retention metadata on reactive `AtomRpc` and `AtomHttpApi` queries.

- [#6855](https://github.com/Effect-TS/effect/pull/6855) [`48155c8`](https://github.com/Effect-TS/effect/commit/48155c8ccfc12dcca8a00fa358d50b20c30874e4) Thanks @fubhy! - Fix `Schedule.during` to recur until the configured duration has elapsed.

- [#6712](https://github.com/Effect-TS/effect/pull/6712) [`951d06b`](https://github.com/Effect-TS/effect/commit/951d06b83d459d3e8fa9024e727a5db1662d3322) Thanks @gcanti! - Make `Schema.isPattern` deterministic for regular expressions with global or sticky flags.

- [#6782](https://github.com/Effect-TS/effect/pull/6782) [`d767b65`](https://github.com/Effect-TS/effect/commit/d767b65a7687e38be23f0b0ee3d52ab5f2360cbe) Thanks @gcanti! - SchemaRepresentation: generate references from encoded AST identity, suffix colliding identifiers instead of throwing, and preserve sharing across property-key context. This avoids false-positive duplicate identifier errors while keeping referentially distinct schemas addressable; generated fallback definitions now use the clearer `Encoded` suffix.

- [#6704](https://github.com/Effect-TS/effect/pull/6704) [`5d52d9d`](https://github.com/Effect-TS/effect/commit/5d52d9d148aaa7f736ed8c310fc8bfa9dc81badf) Thanks @gcanti! - Fix Union candidate selection for recovering middleware and suspended members.

- [#6848](https://github.com/Effect-TS/effect/pull/6848) [`f4151e1`](https://github.com/Effect-TS/effect/commit/f4151e1937c26de14f1d64566f8126173f1b5014) Thanks @fubhy! - Keep the current `ScopedRef` resource alive when acquiring its replacement fails.

- [#6910](https://github.com/Effect-TS/effect/pull/6910) [`e02fbb6`](https://github.com/Effect-TS/effect/commit/e02fbb66f5a0f13dba6c33ef63528a37a17a0676) Thanks @z4p5a9! - Fix `Semaphore.withPermits` leaking permits when interrupted between acquiring them and installing their release.

- [#6877](https://github.com/Effect-TS/effect/pull/6877) [`724ce09`](https://github.com/Effect-TS/effect/commit/724ce09650a458d4565e5c7331ea92ca04f08e68) Thanks @tim-smart! - Fix `Stream.aggregateWithin` and `Stream.groupedWithin` retaining fiber continuations on every schedule tick while upstream is idle.

- [#6889](https://github.com/Effect-TS/effect/pull/6889) [`dbe91f6`](https://github.com/Effect-TS/effect/commit/dbe91f6961ef9f7e8da910ee5758d9c0d385fca8) Thanks @tim-smart! - Fix `Stream.withExecutionPlan` retry limits resetting after partial stream emissions.

- [#6823](https://github.com/Effect-TS/effect/pull/6823) [`4c008d2`](https://github.com/Effect-TS/effect/commit/4c008d28b370d817f7ae4579db09836fe084c8d2) Thanks @fubhy! - Fix data-first dispatch for `Stream.mapAccumArrayEffect`.

- [#6900](https://github.com/Effect-TS/effect/pull/6900) [`b650832`](https://github.com/Effect-TS/effect/commit/b6508328708a842f3163467b72486bd228f1a289) Thanks @fubhy! - Ensure `Stream.range` emits the full range when the chunk size is zero.

- [#6849](https://github.com/Effect-TS/effect/pull/6849) [`b46c92f`](https://github.com/Effect-TS/effect/commit/b46c92f3b314f4ffd612b831efa55dd856c587a3) Thanks @fubhy! - Fix `SubscriptionRef.getAndUpdateSome` to return the current value when no update is selected.

- [#6808](https://github.com/Effect-TS/effect/pull/6808) [`5335797`](https://github.com/Effect-TS/effect/commit/5335797003076d9c6fd170da98d779696d555596) Thanks @fubhy! - Fix `SubscriptionRef.getAndUpdateEffect` to execute the effectful update.

- [#6862](https://github.com/Effect-TS/effect/pull/6862) [`4b3460d`](https://github.com/Effect-TS/effect/commit/4b3460daa434ec465a95a50704fe1103a9275999) Thanks @fubhy! - Fix `Trie.longestPrefixOf` returning a valued sibling that does not match the input key.

- [#6856](https://github.com/Effect-TS/effect/pull/6856) [`6301fd7`](https://github.com/Effect-TS/effect/commit/6301fd710b4325718de2c42997dac28a9e9aa250) Thanks @fubhy! - Fix `Trie` to preserve entries whose value is `undefined`.

- [#6850](https://github.com/Effect-TS/effect/pull/6850) [`aebc5c6`](https://github.com/Effect-TS/effect/commit/aebc5c61664b89a840465ec65b79ce635a5ceee8) Thanks @fubhy! - Fix `TxPubSub.publishAll` dropping values from one-shot iterables when a transaction retries.

- [#6851](https://github.com/Effect-TS/effect/pull/6851) [`52b2d7b`](https://github.com/Effect-TS/effect/commit/52b2d7b5bd3c7cce3bd5b69c6ab3941004da70f3) Thanks @fubhy! - Ensure `TxQueue.poll` and `TxQueue.clear` complete a closing queue after draining its buffered items.

- [#6853](https://github.com/Effect-TS/effect/pull/6853) [`eec5744`](https://github.com/Effect-TS/effect/commit/eec57445dfa0ef3c5977195ad69415b7e7d42bb6) Thanks @fubhy! - Fix `TxQueue.offerAll` to preserve one-shot iterables across transaction retries and repeated runs.

- [#6783](https://github.com/Effect-TS/effect/pull/6783) [`24e0e93`](https://github.com/Effect-TS/effect/commit/24e0e93dc307dc2c2ae86caacb7289e1dab3c103) Thanks @tim-smart! - Propagate trace context through persisted cluster workflow requests.

- [#6693](https://github.com/Effect-TS/effect/pull/6693) [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046) Thanks @lloydrichards! - MCP servers now return standard JSON-RPC errors for malformed requests, unknown methods, and invalid parameters.

- [#6693](https://github.com/Effect-TS/effect/pull/6693) [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046) Thanks @lloydrichards! - MCP servers now enforce revision-specific JSON-RPC batch and protocol-version header requirements.

- [#6707](https://github.com/Effect-TS/effect/pull/6707) [`1a7ce81`](https://github.com/Effect-TS/effect/commit/1a7ce8150e3977586c44d8ccb9a8384389bb4d49) Thanks @gcanti! - Mark `Schema.UnknownFromJsonString` as internal and remove its type-level interface. Use `Schema.fromJsonString(Schema.Unknown)` instead. Add `reviver`, callback or array `replacer`, and `space` options to `Schema.fromJsonString`, and make `SchemaTransformation.fromJsonString` a configurable factory.

- [#6828](https://github.com/Effect-TS/effect/pull/6828) [`48f22a7`](https://github.com/Effect-TS/effect/commit/48f22a7d16ae57ee2175d450dafbdeb69e187d2a) Thanks @tim-smart! - Use layered storage for Context, making `Context.add` O(1) and eliminating per-request service map clones in the HTTP servers. Docgen now omits `@internal` option properties from generated signatures.

- [#6780](https://github.com/Effect-TS/effect/pull/6780) [`c96b7f6`](https://github.com/Effect-TS/effect/commit/c96b7f6359662053c3e09344f61dddc7a6caf4ac) Thanks @tim-smart! - Include typed tool output schemas in MCP `tools/list` responses.

- [#6733](https://github.com/Effect-TS/effect/pull/6733) [`6d2a942`](https://github.com/Effect-TS/effect/commit/6d2a942ed7cd33b8fd79d549edba33bc9e2a7e3e) Thanks @gcanti! - Avoid validating `Schema.Class` fields twice when decoding.

- [#6659](https://github.com/Effect-TS/effect/pull/6659) [`cc27b19`](https://github.com/Effect-TS/effect/commit/cc27b194b9d13fa3a66ab037e853fca9d41700ff) Thanks @tim-smart! - Preserve prototype accessors when code is compiled with loose object spread transforms.

- [#6912](https://github.com/Effect-TS/effect/pull/6912) [`8f9499f`](https://github.com/Effect-TS/effect/commit/8f9499f562729f5f7b08d8bcc4db86b4aeff8a21) Thanks @gcanti! - Remove `actual` fields from every `SchemaIssue` variant, together with
  `SchemaIssue.getActual`, `SchemaIssue.redact`, and `Schema.redact`. Built-in
  formatters now use static messages that do not interpolate rejected input,
  while paths, AST metadata, union successes, and user-provided messages and
  annotations are preserved unchanged.

  Runtime performance was measured across the 16 Effect fixtures in the
  `schema-benchmarks` suite. These are the scenarios used for the cross-library
  comparison with Valibot and Zod. The paired HEAD-versus-`main` run classified 3
  fixtures as improvements, 0 as regressions, and 13 as inconclusive. Negative
  changes are faster. Absolute library values are medians from the same
  cross-library run; `—` means that the corresponding adapter does not expose
  that scenario.

  | Scenario                 | Effect (ns/op) | Valibot (ns/op) | Zod (ns/op) | HEAD vs main | Classification |
  | ------------------------ | -------------: | --------------: | ----------: | -----------: | -------------- |
  | `initialization-schema`  |      108191.30 |    **30549.81** |   212715.66 |       -0.92% | inconclusive   |
  | `initialization-decoder` |  **109796.34** |               — |           — |       +1.98% | inconclusive   |
  | `validation-valid`       |        5221.80 |     **5070.81** |           — |       +2.06% | inconclusive   |
  | `validation-invalid`     |        1279.77 |      **234.92** |           — |       +0.59% | inconclusive   |
  | `parsing-all-valid`      |    **5144.58** |         5192.19 |     7176.19 |       -3.79% | inconclusive   |
  | `parsing-all-invalid`    |    **7594.49** |        15236.82 |    37780.35 |       -5.94% | improvement    |
  | `parsing-first-valid`    |        5188.33 |     **5135.75** |           — |       -1.49% | inconclusive   |
  | `parsing-first-invalid`  |        1330.82 |      **243.64** |           — |       +1.01% | inconclusive   |
  | `standard-all-valid`     |        5722.01 |         5200.05 | **3801.26** |       -1.78% | inconclusive   |
  | `standard-all-invalid`   |   **12024.65** |        15528.50 |    30982.17 |       -7.78% | improvement    |
  | `standard-first-valid`   |    **5655.33** |               — |           — |       +3.84% | inconclusive   |
  | `standard-first-invalid` |    **2001.69** |               — |           — |       -4.56% | inconclusive   |
  | `codec-typed-encode`     |         342.59 |               — |   **39.29** |       -7.62% | inconclusive   |
  | `codec-typed-decode`     |         418.78 |               — |   **50.14** |      -10.89% | improvement    |
  | `codec-unknown-encode`   |     **328.38** |               — |           — |       -5.55% | inconclusive   |
  | `codec-unknown-decode`   |     **347.35** |               — |           — |       -5.25% | inconclusive   |

- [#6692](https://github.com/Effect-TS/effect/pull/6692) [`3eeea73`](https://github.com/Effect-TS/effect/commit/3eeea73cfc3e9b126975c2ddbdb7f7c8c92026e2) Thanks @schickling-assistant! - Fix unstable CLI subcommands dropping operands after the `--` end-of-options terminator.

- [#6625](https://github.com/Effect-TS/effect/pull/6625) [`0a532e5`](https://github.com/Effect-TS/effect/commit/0a532e503f165fdea485a5343fc2f420917e8376) Thanks @lloydrichards! - Add adapter-valued MCP server protocol declarations, route requests through the selected protocol before schema decoding, and add built-in support for MCP `2025-06-18`.

- [#6864](https://github.com/Effect-TS/effect/pull/6864) [`f398149`](https://github.com/Effect-TS/effect/commit/f398149c134fd9b67b6cdc52eae3f3248d5c7bbe) Thanks @fubhy! - Honor HTTP-date `Retry-After` values when retrying OTLP exports.

- [#6693](https://github.com/Effect-TS/effect/pull/6693) [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046) Thanks @lloydrichards! - MCP Streamable HTTP servers now validate content negotiation, session lifecycle, negotiated protocol versions, and browser Origins before dispatching requests.

- [#6824](https://github.com/Effect-TS/effect/pull/6824) [`ace903e`](https://github.com/Effect-TS/effect/commit/ace903e09c2549ceebdec380797beb027cd29f3d) Thanks @tim-smart! - Skip HTTP server span attribute collection when the span is not sampled.

- [#6814](https://github.com/Effect-TS/effect/pull/6814) [`e8eb62b`](https://github.com/Effect-TS/effect/commit/e8eb62b3d0ef27e9761cdc2eb93bdec52d6ee204) Thanks @gcanti! - Refine `Config` loading and absence semantics. `Config.schema` now derives a provider loading policy from the encoded `StringTree` schema, materializes mixed-shape union members independently, and leaves separated scalar parsing to `Config.Array` and `Config.Record`. Schemas whose canonical `StringTree` encoding remains opaque, such as `Schema.Any`, `Schema.Unknown`, or `Schema.Json`, are rejected when the config is constructed; use a concrete shape or `Schema.fromJsonString(Schema.Json)` for scalar JSON. Missing or unavailable representations are decoded as `undefined` before `Config.withDefault` and `Config.option` decide absence. Partially supplied `Config.all` groups are rejected, successful values such as `undefined` and explicitly present empty structures are preserved, and the internal path prefix is removed from the public `Config.parse` signature.

- [#6693](https://github.com/Effect-TS/effect/pull/6693) [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046) Thanks @lloydrichards! - MCP servers now refresh roots after capable clients report that their root list changed.

- [#6828](https://github.com/Effect-TS/effect/pull/6828) [`48f22a7`](https://github.com/Effect-TS/effect/commit/48f22a7d16ae57ee2175d450dafbdeb69e187d2a) Thanks @tim-smart! - Remove `Context.mutate` and `Context.getReferenceUnsafe`. Context updates now use overlays, and `Context.get` resolves reference defaults.

- [#6649](https://github.com/Effect-TS/effect/pull/6649) [`d48506d`](https://github.com/Effect-TS/effect/commit/d48506d97525040aa714305e928126df799795b4) Thanks @gcanti! - Remove the `keyValueCombiner` option from `Schema.Record` and the corresponding
  `SchemaAST.KeyValueCombiner` and `SchemaAST.IndexSignature.merge` APIs.
  For transformed key collisions, sequential parsing keeps the later selected
  value, while concurrent parsing keeps the value applied last in completion
  order.

- [#6693](https://github.com/Effect-TS/effect/pull/6693) [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046) Thanks @lloydrichards! - MCP servers now support session-scoped resource subscriptions on transports that can deliver server notifications and filter resource updates by each client's subscribed URIs.

- [#6649](https://github.com/Effect-TS/effect/pull/6649) [`d48506d`](https://github.com/Effect-TS/effect/commit/d48506d97525040aa714305e928126df799795b4) Thanks @gcanti! - Preserve untouched `Result` branches by identity in `Result.map` and
  `Result.mapError`.

- [#6649](https://github.com/Effect-TS/effect/pull/6649) [`d48506d`](https://github.com/Effect-TS/effect/commit/d48506d97525040aa714305e928126df799795b4) Thanks @gcanti! - Improve Schema parsing, schema construction and adapter runtime performance
  while preserving current parsing behavior.

  ## Runtime performance

  The `effect@beta`, Valibot and Zod timing cases from
  [`open-circle/schema-benchmarks`](https://github.com/open-circle/schema-benchmarks)
  were reproduced as a dedicated `runtimeperf` suite. The table includes every
  case exposed by each upstream adapter; `—` means that the adapter does not
  provide that benchmark.

  Effect `main` (`45e781088`) and the branch based on `d775bf4b2` were compared
  with five paired processes per case, 150 ms measurement time and 50 ms warmup.
  The two initially inconclusive Effect cases were repeated with 15 paired
  processes, 500 ms measurement time and 150 ms warmup. Valibot and Zod values
  use five processes, 300 ms measurement time and 100 ms warmup. Environment:
  Node `v24.12.0`, macOS arm64, Apple M3.

  Zod parsing uses `safeParse` with `{ jitless: true }`; its Standard Schema and
  codec cases use the corresponding native adapter APIs. All values are median
  microseconds per operation (`µs/op`), lower is better. Cross-library values are
  diagnostic because they are independent rather than paired measurements.

  | Scenario                             | Effect `main` | Effect branch |    Valibot |      Zod 4 |   Delta | 95% CI             | Classification |
  | ------------------------------------ | ------------: | ------------: | ---------: | ---------: | ------: | ------------------ | -------------- |
  | Initialize schema                    |        137.28 |        118.23 |  **40.24** |     318.56 | -12.69% | -21.02% to -5.35%  | improvement    |
  | Initialize schema and decoder        |        144.81 |    **130.50** |          — |          — | -10.88% | -14.22% to -3.29%  | improvement    |
  | Validate valid product               |         8.478 |     **5.415** |       5.63 |          — | -35.18% | -41.65% to -32.83% | improvement    |
  | Validate invalid product             |         1.516 |         1.348 | **0.2431** |          — | -11.59% | -13.81% to -6.31%  | improvement    |
  | Parse valid product, all errors      |         8.360 |         5.366 |   **5.22** |       7.16 | -36.28% | -54.41% to -31.67% | improvement    |
  | Parse invalid product, all errors    |        11.302 |     **9.100** |      15.70 |      41.58 | -19.42% | -21.32% to -13.12% | improvement    |
  | Parse valid product, first error     |         8.201 |     **5.294** |       5.37 |          — | -35.44% | -37.75% to -34.59% | improvement    |
  | Parse invalid product, first error   |         1.510 |         1.352 | **0.2572** |          — | -10.51% | -12.52% to -9.53%  | improvement    |
  | Standard Schema valid, all errors    |         9.284 |         5.935 |       5.35 |   **3.83** | -35.96% | -53.29% to -33.49% | improvement    |
  | Standard Schema invalid, all errors  |        16.718 |    **15.203** |      16.51 |      32.85 | -11.31% | -13.97% to -7.65%  | improvement    |
  | Standard Schema valid, first error   |         8.889 |     **5.843** |          — |          — | -34.17% | -35.13% to -33.94% | improvement    |
  | Standard Schema invalid, first error |         2.435 |     **2.244** |          — |          — |  -8.44% | -12.76% to -4.82%  | improvement    |
  | Typed codec encode                   |        0.4692 |        0.3420 |          — | **0.0405** | -27.60% | -32.35% to -22.50% | improvement    |
  | Typed codec decode                   |        0.5191 |        0.3762 |          — | **0.0463** | -27.19% | -34.75% to -22.71% | improvement    |
  | Unknown codec encode                 |        0.4910 |    **0.3472** |          — |          — | -28.58% | -30.42% to -27.59% | improvement    |
  | Unknown codec decode                 |        0.5061 |    **0.3637** |          — |          — | -29.26% | -29.82% to -21.70% | improvement    |

  Overall Effect classification: 16 improvements and no regressions.

- [#6896](https://github.com/Effect-TS/effect/pull/6896) [`52262be`](https://github.com/Effect-TS/effect/commit/52262be2edce0e350c6ac10f8f725678606399c5) Thanks @tim-smart! - Bind event-log read and write requests to the identities authenticated on their RPC connection.

- [#6735](https://github.com/Effect-TS/effect/pull/6735) [`1284aa1`](https://github.com/Effect-TS/effect/commit/1284aa183451955ad7921bbe01fd0e095695d444) Thanks @gcanti! - Fix three issues in the public `Optic` API:

  - Composed `Iso` and `Prism` setters no longer try to read a source value before writing.
  - Calling `notUndefined` on an `Optional` now returns an `Optional`, because writing can still fail.
  - The internal `node` property is no longer exposed by public optic types.

- [#6701](https://github.com/Effect-TS/effect/pull/6701) [`9867b9f`](https://github.com/Effect-TS/effect/commit/9867b9fc69f9cc6c443594fc7eccc7be0c674d9c) Thanks @fubhy! - Removed explicit ./index entrypoints

- [#6875](https://github.com/Effect-TS/effect/pull/6875) [`979ce39`](https://github.com/Effect-TS/effect/commit/979ce3985d7d62ce2bf240681ca19feda3027452) Thanks @fubhy! - Fix protobuf serialization of negative signed integers to use ten-byte two's-complement varints.

- [#6696](https://github.com/Effect-TS/effect/pull/6696) [`b6d3e67`](https://github.com/Effect-TS/effect/commit/b6d3e67c7cc143cd8470cdf704324e79d23954a9) Thanks @tim-smart! - remove file descriptor type

- [#6860](https://github.com/Effect-TS/effect/pull/6860) [`adf6c6c`](https://github.com/Effect-TS/effect/commit/adf6c6cd388af8a3c0c546492e71555368556f6a) Thanks @fubhy! - Honor custom split and strip regular expressions passed to `String.noCase`.

- [#6866](https://github.com/Effect-TS/effect/pull/6866) [`7314d60`](https://github.com/Effect-TS/effect/commit/7314d605284717aaafe7fc34b88c3c93397e865c) Thanks @fubhy! - Fix partial file-backed HTTP bodies to report the selected byte range as their content length.

- [#6693](https://github.com/Effect-TS/effect/pull/6693) [`aeba0c8`](https://github.com/Effect-TS/effect/commit/aeba0c8c9ffc5f125d961ae21e4ac15491e51046) Thanks @lloydrichards! - MCP HTTP servers now reject requests sent before initialization with the required lifecycle response.

- [#6759](https://github.com/Effect-TS/effect/pull/6759) [`1acbd8b`](https://github.com/Effect-TS/effect/commit/1acbd8b44c68ebb23735e9810476b870dbe58aea) Thanks @tim-smart! - Harden JSON-RPC wire message classification against inherited properties.

- [#6705](https://github.com/Effect-TS/effect/pull/6705) [`7bde6cc`](https://github.com/Effect-TS/effect/commit/7bde6ccb2b144fe953ff30a7ef5e1ecc97697146) Thanks @tylergibbs1! - Restore the `recursive` option for `FileSystem.watch`, with non-recursive watching as the default.

- [#6798](https://github.com/Effect-TS/effect/pull/6798) [`a959a8b`](https://github.com/Effect-TS/effect/commit/a959a8bf21cdb976369f494dc949fa00a050d3e0) Thanks @tim-smart! - Namespace PostgreSQL advisory shard locks by the `SqlRunnerStorage` table prefix.

  This changes the advisory-lock protocol. PostgreSQL clusters using advisory locks require a full cluster stop before upgrading; a rolling deploy is unsafe because old and new runners use different lock keys and can both acquire the same shard.

## 4.0.0-beta.102

### Patch Changes

- [#6563](https://github.com/Effect-TS/effect/pull/6563) [`b6392e1`](https://github.com/Effect-TS/effect/commit/b6392e119704553edec1b4fd2869ac0dbec621ef) Thanks @tim-smart! - unstable/reactivity Atom: add `withEquality` combinator for customizing how the registry detects value changes

- [#6574](https://github.com/Effect-TS/effect/pull/6574) [`7ed9450`](https://github.com/Effect-TS/effect/commit/7ed945044eb56aa9aeaf62d4746a011c96c58628) Thanks @tim-smart! - unstable/http HttpClientRequest: add `updateHeaders` and `removeHeader` combinators for transforming or removing request headers, closes [#6271](https://github.com/Effect-TS/effect/issues/6271)

- [#6641](https://github.com/Effect-TS/effect/pull/6641) [`45762bd`](https://github.com/Effect-TS/effect/commit/45762bd78df9ecd87c98b8d3738cdeeac7d81128) Thanks @tim-smart! - Add manual flushing to the OTLP exporters through a shared `Flusher` service exposed by each signal layer. The signal layer output types now include `Flusher`, and `OtlpExporter.make` requires it so custom exporters register unconditionally.

- [#6616](https://github.com/Effect-TS/effect/pull/6616) [`a6e8391`](https://github.com/Effect-TS/effect/commit/a6e8391cd31acd898fae18b3f8e7ca4c6f14f065) Thanks @tim-smart! - Add `Tool.setNeedsApproval` for replacing the approval policy of an existing tool.

- [`4ac7e8b`](https://github.com/Effect-TS/effect/commit/4ac7e8b136c61a26c3e438c013dfd7349b38e999) Thanks @IMax153! - Add `Effect.updateServiceScoped` for updating a context service until the current scope closes, with customizable reset behavior.

- [#6593](https://github.com/Effect-TS/effect/pull/6593) [`4cd40f5`](https://github.com/Effect-TS/effect/commit/4cd40f5692477783bef84fed3c5ef1c0cf5602e6) Thanks @tim-smart! - Fix `Channel.mergeAll` to propagate outer failures promptly and interrupt active inner channels.

- [#6610](https://github.com/Effect-TS/effect/pull/6610) [`6956bc0`](https://github.com/Effect-TS/effect/commit/6956bc0e6cb27f53fbec39d9b18545940f9f598f) Thanks @ebramanti! - Update `McpServer.layerHttp` to return `405` for unsupported HTTP methods, reject unsupported `MCP-Protocol-Version` headers with `400`, and return an empty `202` for accepted notifications and responses.

- [#6608](https://github.com/Effect-TS/effect/pull/6608) [`0e50ec7`](https://github.com/Effect-TS/effect/commit/0e50ec7dbb94390666f292cf9120719bf30a7246) Thanks @gcanti! - Add `Schema.Natural` for non-negative safe integers and use canonical `Schema.Int`, `Schema.Finite`, and `Schema.Natural` schemas for numeric domain values across Effect, AI protocols, and OpenAPI patches.

  Update the date, date-time, file, time-zone, cluster, event-log, persistence, socket, SQL, and DevTools schemas to reject invalid non-finite or non-integer values where appropriate. Correct the decoded schema of `Schema.NumberFromString`, and allow `Schema.DurationFromMillis` and `Schema.DurationFromNanos` to represent negative durations.

- [#6599](https://github.com/Effect-TS/effect/pull/6599) [`9fcdade`](https://github.com/Effect-TS/effect/commit/9fcdade4a8af772b9ccd8b8a24fe8cee0e5d8470) Thanks @tim-smart! - Interrupt in-flight stream pulls when closing an async iterator.

- [#6638](https://github.com/Effect-TS/effect/pull/6638) [`57367d5`](https://github.com/Effect-TS/effect/commit/57367d54de55047ff0c5fce9685475e236bf354c) Thanks @tim-smart! - Fix `PartitionedSemaphore.take` leaking partially acquired permits when interrupted.

- [#6615](https://github.com/Effect-TS/effect/pull/6615) [`35c445f`](https://github.com/Effect-TS/effect/commit/35c445ff18029d192900ea0914c993f58d5cf1a5) Thanks @tim-smart! - Expose the tool call ID to AI tool handlers and `Toolkit.WithHandler.handle` wrappers.

- [#6561](https://github.com/Effect-TS/effect/pull/6561) [`c917bb9`](https://github.com/Effect-TS/effect/commit/c917bb94a4c1c4e0a24372a8ebb8a5ca232e36b5) Thanks @hsubra89! - Reject unexpected positional arguments left after command parsing, including values exceeding `Argument.variadic` maximum bounds.

- [#6613](https://github.com/Effect-TS/effect/pull/6613) [`bc1f358`](https://github.com/Effect-TS/effect/commit/bc1f3583e63344cb2c398d9040d9c975488ed123) Thanks @tim-smart! - Ignore duplicate chunk indexes when joining event log messages.

- [#6552](https://github.com/Effect-TS/effect/pull/6552) [`0e0c9d7`](https://github.com/Effect-TS/effect/commit/0e0c9d7922ff463c1093d9e0576fae12cb0698d5) Thanks @xianjianlf2! - Fix a race where FiberHandle.clear could remove a newer fiber installed while the previous fiber was still interrupting.

- [#6598](https://github.com/Effect-TS/effect/pull/6598) [`73d40aa`](https://github.com/Effect-TS/effect/commit/73d40aacd8fcae1b48c23f5b0a5c542127401d1d) Thanks @tim-smart! - Fix `LanguageModel.streamText` to apply the configured concurrency limit to tool call resolution, including approval checks.

- [#6637](https://github.com/Effect-TS/effect/pull/6637) [`4f1e318`](https://github.com/Effect-TS/effect/commit/4f1e3183f7123591c46224e9c587df7594562a5f) Thanks @tim-smart! - Fix Latch open/release resuming waiters that registered after a subsequent close.

  `Latch.open` and `Latch.release` schedule the waiter flush on the fiber's
  dispatcher. Previously the flush drained whatever waiters existed at flush
  time, so a waiter that registered after the latch was closed again could be
  resumed by the stale flush. The waiters are now snapshotted at schedule time,
  so only waiters covered by an `open`/`release` call are resumed.

- [#6614](https://github.com/Effect-TS/effect/pull/6614) [`9d8d85c`](https://github.com/Effect-TS/effect/commit/9d8d85c1bb7da51970845b8ea830e386e777514a) Thanks @tim-smart! - Fix histogram and summary maximum values for negative-only observations.

- [#6634](https://github.com/Effect-TS/effect/pull/6634) [`6079fda`](https://github.com/Effect-TS/effect/commit/6079fda7b02f2f01ad91c15ab8c307336f3ba252) Thanks @fubhy! - Fix OTLP exporter shutdown to await in-flight and final buffered exports up to the configured shutdown timeout.

- [#6567](https://github.com/Effect-TS/effect/pull/6567) [`5101e92`](https://github.com/Effect-TS/effect/commit/5101e92c9c149c153423f43dd7a94f6194653c06) Thanks @gcanti! - Add `Record.assignProperty` and safely handle dynamic record keys such as `__proto__` and inherited property names.

- [#6592](https://github.com/Effect-TS/effect/pull/6592) [`d0b3265`](https://github.com/Effect-TS/effect/commit/d0b3265c3262670761471ab3518cf933b1b3b20a) Thanks @tim-smart! - Fix `Stream.haltWhen` to observe halt effects at pull boundaries for synchronous streams.

- [#6618](https://github.com/Effect-TS/effect/pull/6618) [`7a03c89`](https://github.com/Effect-TS/effect/commit/7a03c893ce6492bf94c0ebfb00b63bf25dcbf83e) Thanks @tim-smart! - unstable/cluster: hash over-length SQL message deduplication keys to prevent `message_id` overflow, closes [#6317](https://github.com/Effect-TS/effect/issues/6317).

  The composed request deduplication key (`entityType/entityId/tag/primaryKey`) can legally exceed the 255-character `message_id` column — the address columns alone allow 458 characters before the RPC primary key is appended. `SqlMessageStorage` now stores a SHA-256 digest (64 hex characters) of the composed key in the unique `message_id` column when the key exceeds 255 characters, so keys of any length work on PostgreSQL, MySQL, MSSQL, and SQLite. Keys that fit are stored as plaintext, byte-compatible with rows written by previous versions, so existing deployments keep deduplicating with no migration or schema change.

  `SqlMessageStorage.layer`/`layerWith` (and consequently `SingleRunner.layer`) now require `Crypto.Crypto`. The Node and Bun cluster convenience layers provide the platform Crypto implementation internally, so their requirements are unchanged.

- [#6577](https://github.com/Effect-TS/effect/pull/6577) [`cea1d9c`](https://github.com/Effect-TS/effect/commit/cea1d9c92601e69ebda040af8a1d860d604d885c) Thanks @tim-smart! - ManagedRuntime: add `Symbol.asyncDispose`, enabling `await using` syntax

  ```ts
  import { Effect, Layer, ManagedRuntime } from "effect";

  await using runtime = ManagedRuntime.make(Layer.empty);

  await runtime.runPromise(Effect.log("Hello, world!"));
  // runtime is disposed automatically at the end of the scope
  ```

- [#6644](https://github.com/Effect-TS/effect/pull/6644) [`078e1f5`](https://github.com/Effect-TS/effect/commit/078e1f5636e31b76a86722a636afc37a8cc25580) Thanks @gcanti! - Improve the performance of `Array.dedupe`, `Array.union`, `Array.intersection`, `Array.difference`, and Schema unique item validation by using hash-based equality lookup.

- [#6609](https://github.com/Effect-TS/effect/pull/6609) [`97bafea`](https://github.com/Effect-TS/effect/commit/97bafeab460833b9781527b437d1cb9cbee63260) Thanks @tim-smart! - Allow embedding usage input tokens to be omitted during decoding, including after JSON serialization.

- [#6606](https://github.com/Effect-TS/effect/pull/6606) [`fab0ab8`](https://github.com/Effect-TS/effect/commit/fab0ab8f7ab15ae596faa4ccf75615a494d11b0b) Thanks @tim-smart! - Allow optional AI response fields to be omitted during decoding, including after JSON serialization.

- [#6607](https://github.com/Effect-TS/effect/pull/6607) [`c323d8b`](https://github.com/Effect-TS/effect/commit/c323d8b30dbbe85f9df25b67288b93d5332de333) Thanks @ebramanti! - Prevent MCP tool failures from exposing Cause rendering, stack traces, and internal paths while preserving actionable validation messages.

- [#6576](https://github.com/Effect-TS/effect/pull/6576) [`6966353`](https://github.com/Effect-TS/effect/commit/69663534d626003eb10a5e55ab1f13e0379fead1) Thanks @tim-smart! - Record: make `fromIterableBy` dual, allowing data-last usage in `pipe`

  ```ts
  import { pipe, Record } from "effect";

  const users = [
    { id: "2", name: "name2" },
    { id: "1", name: "name1" },
  ];

  pipe(
    users,
    Record.fromIterableBy((user) => user.id),
  );
  ```

- [#6622](https://github.com/Effect-TS/effect/pull/6622) [`0444004`](https://github.com/Effect-TS/effect/commit/04440041989c1785fe4db286379f2be2c15baa85) Thanks @gcanti! - Remove the experimental `SchemaUtils` module and its `getNativeClassSchema` helper. The helper duplicated a composition already available through the primary Schema APIs and did not justify a separate public module.

- [#6653](https://github.com/Effect-TS/effect/pull/6653) [`028bbb3`](https://github.com/Effect-TS/effect/commit/028bbb391e161185da10d974ab33381f769940d7) Thanks @tim-smart! - Remove `Effect.withConcurrency`, the `References.CurrentConcurrency` reference backing it, and the `"inherit"` option from `Types.Concurrency`. Use an explicit `number` or `"unbounded"` concurrency value instead.

- [#6620](https://github.com/Effect-TS/effect/pull/6620) [`ff5d6e2`](https://github.com/Effect-TS/effect/commit/ff5d6e278a1fdff714315dc1a17075012f05c1f0) Thanks @gcanti! - Make `Schema.Date` reject invalid dates and remove the redundant `Schema.DateValid`, `Schema.isDateValid`, and `Schema.isDateValidReviver` APIs.

  `Schema.DateFromString` and `Schema.DateFromMillis` now fail decoding when their input would produce an invalid date.

  Remove `Schema.Annotations.ToArbitrary.GenerationConstraint.valid`; `Schema.Date` arbitraries now generate only valid dates by default.

- [#6575](https://github.com/Effect-TS/effect/pull/6575) [`1bfce93`](https://github.com/Effect-TS/effect/commit/1bfce93e6d2bf0794c11733daf51c2390e7de375) Thanks @gcanti! - Schema: make schemas directly extendable as classes with static method support
  and remove `Schema.asClass`.

  `Bottom` and `BottomLazy` now include the class-compatible `new` signature,
  while `BottomWithoutNew` and `BottomLazyWithoutNew` expose the schema protocol
  without it for schema types that define a specialized construct signature.

  **Example**

  ```ts
  import { Schema } from "effect";

  class MyString extends Schema.String {
    static readonly decodeUnknownSync = Schema.decodeUnknownSync(this);
  }

  MyString.decodeUnknownSync("a"); // "a"
  ```

- [#6424](https://github.com/Effect-TS/effect/pull/6424) [`7ce815c`](https://github.com/Effect-TS/effect/commit/7ce815cd5af6af991dfc13b890fd22345fc77c20) Thanks @gcanti! - Refactor the `SchemaRepresentation` module to improve clarity and maintainability.

  The representation pipeline is now open and compiler-extensible. The same encoded-side representation is used for JSON persistence, runtime reconstruction, JSON Schema Draft 2020-12 compilation, TypeScript code generation, AI structured output, and HTTP / OpenAPI schemas.

  ### New representation model
  - Add `RepresentationAnnotation` and `CheckRepresentationAnnotation`, which identify declarations and checks with a stable `id`, JSON `payload`, and optional schema dependencies.
  - Preserve checks on every non-reference representation node instead of storing constraints in the previous closed `meta` unions.
  - Add compiler hooks for checks and declarations through `SchemaRepresentation.ToJsonSchema` and `SchemaRepresentation.Generation`.
  - Add `SchemaMultiDocument`, `fromSchemaMultiDocument`, and `fromRepresentations` so several live schemas and named definitions can be converted and reconstructed together. Explicit definitions are preserved even when no root references them.
  - Preserve shared structural nodes, annotated recursion, union member order, identifiers, reference siblings, and structural checks when projecting encoded schemas.

  ### Persistence and revivers
  - Add `toJson`, `fromJson`, `toJsonMultiDocument`, and `fromJsonMultiDocument` as the persistence boundary for representation documents.
  - Live representations store literal, enum, and property-name scalars as native values. JSON persistence encodes them as `{ type, value }` tagged unions so their runtime types remain distinct across persistence formats, canonically encodes structural bigint and global symbol values, keeps JSON-valued annotations, and removes runtime-only callbacks and other non-JSON annotation values.
  - Replace the generic reviver callback with typed `DeclarationReviver`, `FilterReviver`, and `FilterGroupReviver` contracts. Add `makeDeclarationReviver`, `makeFilterReviver`, and `makeFilterGroupReviver`, which infer their payload type from `payloadSchema`.
  - Resolve acyclic references to concrete runtime schemas and reserve `Schema.suspend` wrappers for recursive back-edges. Acyclic alias chains may be normalized while preserving the outer reference identifier.
  - Export individual revivers for built-in declarations and checks from `Schema`. Consumers opt in to exactly the revivers accepted when reconstructing persisted documents:
    - declaration revivers: `OptionReviver`, `ResultReviver`, `RedactedReviver`, `CauseReasonReviver`, `CauseReviver`, `ErrorReviver`, `ExitReviver`, `ReadonlyMapReviver`, `HashMapReviver`, `ReadonlySetReviver`, `HashSetReviver`, `ChunkReviver`, `RegExpReviver`, `URLReviver`, `DateReviver`, `DurationReviver`, `BigDecimalReviver`, `FileReviver`, `FormDataReviver`, `URLSearchParamsReviver`, `Uint8ArrayReviver`, `DateTimeUtcReviver`, `TimeZoneOffsetReviver`, `TimeZoneNamedReviver`, `TimeZoneReviver`, `DateTimeZonedReviver`, `JsonReviver`, and `MutableJsonReviver`
    - check revivers: `isTrimmedReviver`, `isPatternReviver`, `isStringFiniteReviver`, `isStringBigIntReviver`, `isStringSymbolReviver`, `isUUIDReviver`, `isGUIDReviver`, `isULIDReviver`, `isBase64Reviver`, `isBase64UrlReviver`, `isStartsWithReviver`, `isEndsWithReviver`, `isIncludesReviver`, `isUppercasedReviver`, `isLowercasedReviver`, `isCapitalizedReviver`, `isUncapitalizedReviver`, `isFiniteReviver`, `isGreaterThanReviver`, `isGreaterThanOrEqualToReviver`, `isLessThanReviver`, `isLessThanOrEqualToReviver`, `isBetweenReviver`, `isMultipleOfReviver`, `isIntReviver`, `isDateValidReviver`, `isGreaterThanDateReviver`, `isGreaterThanOrEqualToDateReviver`, `isLessThanDateReviver`, `isLessThanOrEqualToDateReviver`, `isBetweenDateReviver`, `isGreaterThanBigIntReviver`, `isGreaterThanOrEqualToBigIntReviver`, `isLessThanBigIntReviver`, `isLessThanOrEqualToBigIntReviver`, `isBetweenBigIntReviver`, `isMinLengthReviver`, `isMaxLengthReviver`, `isLengthBetweenReviver`, `isMinSizeReviver`, `isMaxSizeReviver`, `isSizeBetweenReviver`, `isMinPropertiesReviver`, `isMaxPropertiesReviver`, `isPropertiesLengthBetweenReviver`, `isPropertyNamesReviver`, and `isUniqueReviver`
  - Validate reviver payloads with their `payloadSchema`, and report missing or duplicate reviver identifiers.

  ### JSON Schema and code generation
  - Compile JSON Schema from the canonical JSON codec and the encoded-side representation. Custom checks can contribute constraints through `Annotations.Filter.toJsonSchema` without modifying a central metadata registry.
  - Import JSON Schema directly as live schemas. The importer now supports shared definitions, aliases, recursion, reference siblings, and definitions that are not reachable from a root.
  - Add the named `FromJsonSchemaOptions` type for the importer `onEnter` callback.
  - Generate code from live `toCode` annotations on declarations and checks. Compiler callbacks receive generated type parameters or schema dependencies and can emit multiple import declarations.
  - Add import artifacts to `CodeDocument` and preserve all explicit definitions during multi-document code generation.
  - Reject distinct schemas that declare the same identifier instead of silently merging them or generating suffixed references.

  ### Canonical codecs and integrations
  - Preserve schema identifiers, property context, key encodings, and applicable checks while deriving canonical JSON codecs.
  - Treat `Schema.Json` and `Schema.MutableJson` as already canonical. JSON validation now rejects sparse arrays, and non-finite numbers decode only from the canonical strings `"Infinity"`, `"-Infinity"`, and `"NaN"` rather than raw non-finite numeric inputs.
  - Declarations without `toCodecJson` or `toCodec` now use JSON validation as their fallback instead of silently encoding to `null`. `toCodecJson` callbacks may return `undefined` when a declaration is already canonical.
  - Add `Annotations.Declaration.toCodecStringTree`; StringTree derivation now requires a declaration to provide a structural StringTree, JSON, or general codec instead of silently encoding an opaque declaration to `undefined`.
  - Update AI structured-output, HTTP schema, HttpApi OpenAPI, and OpenAPI generator integrations to consume the same canonical encoded representation and compiler hooks. Provider-specific structured-output transforms may remove unsupported JSON Schema keywords, while the Effect codec remains the validation authority.

  ### Breaking changes
  - Rename the low-level representation constructors:
    - `SchemaRepresentation.fromAST` -> `SchemaRepresentation.toRepresentation`
    - `SchemaRepresentation.fromASTs` -> `SchemaRepresentation.toRepresentations`
  - Replace `SchemaRepresentation.toSchema` with `fromRepresentation`, and add `fromRepresentations` for multi-root documents. Both reconstruction functions require `{ revivers: [...] }`; no default reviver is installed implicitly.
  - Remove `SchemaRepresentation.toSchemaDefaultReviver`. Pass the required built-in revivers exported by `Schema`, or custom revivers created with the new constructors.
  - Replace `DocumentFromJson` and `MultiDocumentFromJson` with the `toJson` / `fromJson` and `toJsonMultiDocument` / `fromJsonMultiDocument` functions.
  - The persisted `Document` and `MultiDocument` format is incompatible with the previous format. Nodes now contain `checks`; encoded literal values, enum values, and property signature names use tagged `{ type, value }` objects while decoded documents expose their native scalar values; declarations no longer contain `encodedSchema`; persisted opaque declarations and leaf filters require a `{ id, payload }` representation identity; and checks no longer contain closed `meta` payloads. Regenerate stored documents from their source schemas with the new API, or migrate their shape before passing them to `fromJson`.
  - Replace the generic `Reviver<T>` function type with `DeclarationReviver<P>`, `FilterReviver<P>`, `FilterGroupReviver<P>`, `CheckReviver<P>`, `Reviver<P>`, and `AnyReviver`.
  - Remove the closed metadata types `StringMeta`, `NumberMeta`, `BigIntMeta`, `ArraysMeta`, `ObjectsMeta`, `DateMeta`, `SizeMeta`, `DeclarationMeta`, and `Meta` from `SchemaRepresentation`.
  - Remove the exported representation validation schemas and `PrimitiveTree`: `$PrimitiveTree`, `$Annotations`, `$Null`, `$Undefined`, `$Void`, `$Never`, `$Unknown`, `$Any`, `$StringMeta`, `$String`, `$NumberMeta`, `$Number`, `$Boolean`, `$BigInt`, `$Symbol`, `$LiteralValue`, `$Literal`, `$UniqueSymbol`, `$ObjectKeyword`, `$Enum`, `$TemplateLiteral`, `$Element`, `$Arrays`, `$PropertySignature`, `$IndexSignature`, `$ObjectsMeta`, `$Objects`, `$Union`, `$Reference`, `$DateMeta`, `$SizeMeta`, `$DeclarationMeta`, `$Declaration`, `$Suspend`, `$Representation`, `$Document`, and `$MultiDocument`.
  - Replace schema annotations as follows:
    - remove `Annotations.Bottom.meta` and `Annotations.Filter.meta`
    - remove `Annotations.Declaration.typeConstructor`; use `representation`
    - remove `Annotations.Declaration.generation`; use the `toCode` callback
    - add `Annotations.Filter.representation`, `toJsonSchema`, and `toCode`
    - add `Annotations.Augment.contentSchema` as a JSON-valued annotation
    - allow `Annotations.Declaration.toCodecJson` and `toCodecStringTree` to return `undefined`
  - Remove the top-level `contentMediaType` and `contentSchema` fields from `SchemaRepresentation.String`. Content metadata is now carried in ordinary annotations, and `contentSchema` is a JSON Schema value rather than a nested Effect representation.
  - Remove `Schema.Annotations.BuiltInMetaDefinitions`, `BuiltInMeta`, `MetaDefinitions`, and `Meta`. Custom checks should carry a representation identity and compiler callbacks instead of augmenting the metadata registry.
  - `fromJsonSchemaDocument` now returns `Schema.Top` instead of a representation `Document`. `fromJsonSchemaMultiDocument` now returns `SchemaMultiDocument` instead of `MultiDocument`; call `fromSchemaMultiDocument` when a representation multi-document is required.
  - `toCodeDocument` now accepts only a live `MultiDocument`; remove its `reviver` option. Reconstruct persisted documents first so revivers can restore runtime compiler callbacks.
  - Rename the `generation` field of `Artifact` values for symbols and enums to `code`. Declaration generation no longer has an `Encoded` output, and `importDeclaration` is replaced by `importDeclarations` on callback output.
  - Remove the exported `sanitizeJavaScriptIdentifier`, `topologicalSort`, and `TopologicalSort` helpers.
  - Negative zero no longer receives special representation handling. Do not rely on preserving its sign across JSON persistence or generated code, where it may be normalized to `0`.
  - With `{ errors: "all" }`, structural checks run only after their base array, object, or declaration parses successfully; they are no longer added to an already failing child parse.

- [#6646](https://github.com/Effect-TS/effect/pull/6646) [`7271a7f`](https://github.com/Effect-TS/effect/commit/7271a7faf1080aa75f2f53ca6a0b5ec9334c1d38) Thanks @gcanti! - Precompile union formatters and equivalences, select transformed union members using their decoded type, and allow deriving an equivalence for `Never`.

- [#6516](https://github.com/Effect-TS/effect/pull/6516) [`475fe5c`](https://github.com/Effect-TS/effect/commit/475fe5c12c2d6504c475797c0634f90da01e1797) Thanks @tim-smart! - Prevent SQL runner lock refreshes from hanging when reserved connections become unresponsive.

## 4.0.0-beta.101

### Patch Changes

- [#6545](https://github.com/Effect-TS/effect/pull/6545) [`731bea1`](https://github.com/Effect-TS/effect/commit/731bea19416755a904ff5e809413e5922785d0a4) Thanks @tim-smart! - Interrupt and await concurrent traversal workers when mapper or refill callbacks throw.

- [#6545](https://github.com/Effect-TS/effect/pull/6545) [`731bea1`](https://github.com/Effect-TS/effect/commit/731bea19416755a904ff5e809413e5922785d0a4) Thanks @tim-smart! - Preserve current stack frame annotations on terminal root failures.

- [#6545](https://github.com/Effect-TS/effect/pull/6545) [`731bea1`](https://github.com/Effect-TS/effect/commit/731bea19416755a904ff5e809413e5922785d0a4) Thanks @tim-smart! - Store interrupting fiber stack frames separately from interrupted target stack frames.

- [#6545](https://github.com/Effect-TS/effect/pull/6545) [`731bea1`](https://github.com/Effect-TS/effect/commit/731bea19416755a904ff5e809413e5922785d0a4) Thanks @tim-smart! - Avoid allocating a scheduler dispatcher when `runSyncExit` completes without yielding.

- [#6545](https://github.com/Effect-TS/effect/pull/6545) [`731bea1`](https://github.com/Effect-TS/effect/commit/731bea19416755a904ff5e809413e5922785d0a4) Thanks @tim-smart! - Make awaitAllChildren child selection linear in the number of fibers.

- [#6523](https://github.com/Effect-TS/effect/pull/6523) [`b35ed29`](https://github.com/Effect-TS/effect/commit/b35ed2904f01536d303b21f288daf343cf740462) Thanks @gcanti! - Simplify the displayed `Type`, `Encoded`, and `Iso` types of required readonly `Schema.Struct` fields, closes [#6521](https://github.com/Effect-TS/effect/issues/6521).

- [#6514](https://github.com/Effect-TS/effect/pull/6514) [`dd44624`](https://github.com/Effect-TS/effect/commit/dd446245736a0e88c807a02f03c21450bb9340fa) Thanks @tim-smart! - Fix `MutableList.filter` leaving an invalid empty bucket when no values match.

- [#6545](https://github.com/Effect-TS/effect/pull/6545) [`731bea1`](https://github.com/Effect-TS/effect/commit/731bea19416755a904ff5e809413e5922785d0a4) Thanks @tim-smart! - Deliver pending interrupts when interruptibleMask restores fiber interruptibility.

- [#6526](https://github.com/Effect-TS/effect/pull/6526) [`2bae1ac`](https://github.com/Effect-TS/effect/commit/2bae1accce9d3b72cf6d5aefc9b2161af6d88436) Thanks @tim-smart! - Fix `HttpRouter.toWebHandler` middleware inference to exclude request services supplied by the HTTP adapter.

## 4.0.0-beta.100

### Patch Changes

- [#6501](https://github.com/Effect-TS/effect/pull/6501) [`c1288dd`](https://github.com/Effect-TS/effect/commit/c1288dd1a52a2811ab7df57fc4ce236c6be4c745) Thanks @gcanti! - Add a `discriminants` tuple to schemas augmented with `Schema.toTaggedUnion` and reject duplicate discriminant
  property keys.

- [#6475](https://github.com/Effect-TS/effect/pull/6475) [`2b58a3d`](https://github.com/Effect-TS/effect/commit/2b58a3dab6bc99776dddaf76e27d811e0f47f3d8) Thanks @fubhy! - Normalize cron month and weekday aliases independently of the host locale.

- [#6492](https://github.com/Effect-TS/effect/pull/6492) [`6dc83f2`](https://github.com/Effect-TS/effect/commit/6dc83f26ddf20d48db28cf761dd8f3716e5273fb) Thanks @gcanti! - Preserve nested class construction when applying constructor defaults, closes [#6491](https://github.com/Effect-TS/effect/issues/6491).

- [#6476](https://github.com/Effect-TS/effect/pull/6476) [`c1e2fe0`](https://github.com/Effect-TS/effect/commit/c1e2fe0cf93564f4d919e3998874c3e70b0cf30f) Thanks @fubhy! - Add `Cron` day and weekday intersection semantics in inspection representations.

- [#6474](https://github.com/Effect-TS/effect/pull/6474) [`f3fbae8`](https://github.com/Effect-TS/effect/commit/f3fbae8d7bae0d77cb4f35a1598b26c58e3bf94d) Thanks @fubhy! - Validate `Cron.make` field constraints and treat weekday `7` as Sunday consistently with cron parsing.

- [#6472](https://github.com/Effect-TS/effect/pull/6472) [`e000f80`](https://github.com/Effect-TS/effect/commit/e000f80fd55bcd8edc699fdbf4cd109004f4f754) Thanks @fubhy! - Fix `Cron.prev` day-of-month rollover across shorter months and non-leap years.

- [#6471](https://github.com/Effect-TS/effect/pull/6471) [`f4ee765`](https://github.com/Effect-TS/effect/commit/f4ee7655ee052cf9ba726fd602bb87c89c7c62a9) Thanks @fubhy! - Fix `Cron.prev` weekday wrapping to always return a matching instant before the input.

- [#6477](https://github.com/Effect-TS/effect/pull/6477) [`510b55f`](https://github.com/Effect-TS/effect/commit/510b55f3e21750685dbfd5f476a130c1c5af9dbd) Thanks @fubhy! - Make Cron equality and hashing include the optional timezone consistently.

- [#6433](https://github.com/Effect-TS/effect/pull/6433) [`31d3fc4`](https://github.com/Effect-TS/effect/commit/31d3fc4327c50867bb8d881fa7353aeb03ea2826) Thanks @coyaSONG! - Fix the published declaration for `HttpEffect.appendPreResponseHandlerUnsafe`.

- [#6487](https://github.com/Effect-TS/effect/pull/6487) [`875e618`](https://github.com/Effect-TS/effect/commit/875e618c3764a7b817ac863d0af86924449528f2) Thanks @rvaccone! - Fix doubled `Expected: Expected ...` prefixes in CLI `InvalidValue` error messages, closes [#6312](https://github.com/Effect-TS/effect/issues/6312).

- [#6496](https://github.com/Effect-TS/effect/pull/6496) [`688d46a`](https://github.com/Effect-TS/effect/commit/688d46afd0ef923d983ad3d7385f52f217b28d70) Thanks @tim-smart! - Port `Effect.reduce` from Effect v3.

- [#6480](https://github.com/Effect-TS/effect/pull/6480) [`6ff5023`](https://github.com/Effect-TS/effect/commit/6ff502363b9840a5a5ee0a24bc6cae734ac3a3eb) Thanks @fubhy! - Correct the diagnostic for cron step values above a field's maximum.

- [#6484](https://github.com/Effect-TS/effect/pull/6484) [`c0333e7`](https://github.com/Effect-TS/effect/commit/c0333e7f755f42ddcca7051e029da8b4eed527bf) Thanks @tim-smart! - Fix fiber self-interuption from inside a running operation

- [#6493](https://github.com/Effect-TS/effect/pull/6493) [`06e7e8c`](https://github.com/Effect-TS/effect/commit/06e7e8c66015ee318f871b9d2218dee82df2b108) Thanks @tim-smart! - Make multipart errors respond with an HTTP status based on their reason and ignore them in the error reporter.

- [#6498](https://github.com/Effect-TS/effect/pull/6498) [`eb9b102`](https://github.com/Effect-TS/effect/commit/eb9b10256c8558881b441c2fef833b7037174400) Thanks @thewilkybarkid! - Don’t create a table when it’s not needed

- [#6494](https://github.com/Effect-TS/effect/pull/6494) [`8b155da`](https://github.com/Effect-TS/effect/commit/8b155da06e0740c354ec562957a45ab65eb4573b) Thanks @tim-smart! - only interrupt cache lookup when all awaiters are gone

- [#6495](https://github.com/Effect-TS/effect/pull/6495) [`3a87335`](https://github.com/Effect-TS/effect/commit/3a8733564c5db35271aa20564ed0d344daa2a79f) Thanks @tim-smart! - clean up more references on fiber exit

## 4.0.0-beta.99

### Patch Changes

- [#6397](https://github.com/Effect-TS/effect/pull/6397) [`8ce4795`](https://github.com/Effect-TS/effect/commit/8ce4795ccbaebca4292757db568c005a992546a4) Thanks @IMax153! - Add a scoped `CliConfig` service for customizing the built-in global flags used by CLI command runners.

  For example, provide an explicit list that omits `GlobalFlag.LogLevel` to remove the built-in `--log-level` flag:

  ```ts
  import { Effect } from "effect";
  import { CliConfig, Command, GlobalFlag } from "effect/unstable/cli";

  const program = Command.run(command, { version: "1.0.0" }).pipe(
    Effect.provide(
      CliConfig.layer({
        builtIns: [GlobalFlag.Help, GlobalFlag.Version, GlobalFlag.Completions],
      }),
    ),
  );
  ```

- [#6409](https://github.com/Effect-TS/effect/pull/6409) [`80b539f`](https://github.com/Effect-TS/effect/commit/80b539f8aba68f478c75c35c2b4140c4ffc4fada) Thanks @IMax153! - Reintroduce interactive CLI wizard mode through the `--wizard` flag and `Command.wizard`.

- [#6394](https://github.com/Effect-TS/effect/pull/6394) [`88a54cc`](https://github.com/Effect-TS/effect/commit/88a54cc341006e3ebcb13482c618f62a680ce199) Thanks @lloydrichards! - add a `radius` option to `Graph` search configuration, allowing `dfs`, `bfs`, and `dfsPostOrder` traversals to limit returned nodes by edge distance from the configured start nodes. Traversals can also use `direction: "undirected"` to follow edges in either direction.

- [#6457](https://github.com/Effect-TS/effect/pull/6457) [`e6e6dba`](https://github.com/Effect-TS/effect/commit/e6e6dba6e9d86e7c2ad27dcedf289db76a19697f) Thanks @fubhy! - Improve `Graph.dijkstra` and `Graph.astar` priority queue performance.

- [#6468](https://github.com/Effect-TS/effect/pull/6468) [`bfb203e`](https://github.com/Effect-TS/effect/commit/bfb203e95aa439f731acad37fc3a9a831a190f1c) Thanks @gcanti! - Distribute `HttpApiBuilder` handler requirements per service so request middleware layers can provide them, closes [#6464](https://github.com/Effect-TS/effect/issues/6464).

- [#6389](https://github.com/Effect-TS/effect/pull/6389) [`2e9a34a`](https://github.com/Effect-TS/effect/commit/2e9a34ac2bece4f3a206160480c991e3841dc67a) Thanks @IMax153! - Report an error when a CLI flag, including `--completions`, is provided without its required value.

- [#6359](https://github.com/Effect-TS/effect/pull/6359) [`55d4eb3`](https://github.com/Effect-TS/effect/commit/55d4eb34f2c64d54f6a25a305b5c5438ebd7934e) Thanks @evermake! - - Fix `Command.withSubcommands` collapsing the inferred requirements type to `never` when given more than one subcommand
  - Export a `Command.Services` utility type to extract the required services from a `Command`

- [#6462](https://github.com/Effect-TS/effect/pull/6462) [`bddb010`](https://github.com/Effect-TS/effect/commit/bddb010eac3d4436cb094edbbee7460c5440c162) Thanks @fubhy! - Fix immutable Graph equality and hashing to include future node and edge identifier allocation.

- [#6425](https://github.com/Effect-TS/effect/pull/6425) [`a328835`](https://github.com/Effect-TS/effect/commit/a328835e50d76bc96648a1c1550456e8c9f81210) Thanks @fubhy! - Fix `Graph.bellmanFord` to detect reachable negative cycles when the source and target are the same node.

- [#6454](https://github.com/Effect-TS/effect/pull/6454) [`5560d05`](https://github.com/Effect-TS/effect/commit/5560d05aa6abdd29466d9c3412cc5e648b0adbde) Thanks @fubhy! - Fix standalone data-last `Graph.getNode` and `Graph.getEdge` inference.

- [#6418](https://github.com/Effect-TS/effect/pull/6418) [`8f6e3ad`](https://github.com/Effect-TS/effect/commit/8f6e3adb185b16e8820b98c509b308086f7ff1af) Thanks @fubhy! - Fix `Graph.mapEdges` and `Graph.filterMapEdges` to preserve `Graph.Edge` instances when transforming edge data.

- [#6426](https://github.com/Effect-TS/effect/pull/6426) [`46997fa`](https://github.com/Effect-TS/effect/commit/46997fa60401f5e3c93daa4b61f7df8e31caaab4) Thanks @fubhy! - Reject `NaN` and `-Infinity` edge weights in Graph shortest-path algorithms.

- [#6461](https://github.com/Effect-TS/effect/pull/6461) [`9e6e12d`](https://github.com/Effect-TS/effect/commit/9e6e12d75c118cd265496f2880490d1f33a5c8bf) Thanks @fubhy! - Fix mutable Graph equality and hashing to use reference identity while preserving structural semantics for immutable graphs.

- [#6456](https://github.com/Effect-TS/effect/pull/6456) [`3394b93`](https://github.com/Effect-TS/effect/commit/3394b93d97d6f24fc38670641d1490289ffca7f1) Thanks @fubhy! - Fix topological walkers silently completing with an incomplete order when a mutable graph becomes cyclic after walker creation.

- [#6460](https://github.com/Effect-TS/effect/pull/6460) [`febeabc`](https://github.com/Effect-TS/effect/commit/febeabc3f7c31094da000a23edeaabfe2ab00a38) Thanks @fubhy! - Restrict `Graph.topo` to directed graphs at the type level while retaining runtime validation for unsafe undirected inputs.

- [#6455](https://github.com/Effect-TS/effect/pull/6455) [`54161c9`](https://github.com/Effect-TS/effect/commit/54161c98f6f3569e0c31842f54e6a257f9421c4c) Thanks @fubhy! - Fix `Graph.Walker` to create a fresh iterable for each direct iteration.

- [#6414](https://github.com/Effect-TS/effect/pull/6414) [`385f7a4`](https://github.com/Effect-TS/effect/commit/385f7a4ee4a7359928597ea56d151dbaf5eb5802) Thanks @fubhy! - Fix `Graph.toGraphViz` to quote DOT graph names and escape labels as literal text.

- [#6438](https://github.com/Effect-TS/effect/pull/6438) [`7eea4d0`](https://github.com/Effect-TS/effect/commit/7eea4d0b73ec554915d7066a71f46326ce2ba45f) Thanks @tim-smart! - Fix one-shot iterable handling in Array.rotate, Iterable.cartesian, and in-memory RunnerStorage acquisition

- [#6371](https://github.com/Effect-TS/effect/pull/6371) [`7543afe`](https://github.com/Effect-TS/effect/commit/7543afea6f4d97d1f1ad876224323838a48daadd) Thanks @polRk! - Tool: preserve the tool kind when cloning provider-defined and dynamic tools.

  `Tool.addDependency`, `setParameters`, `setSuccess`, `setFailure`, `annotate`, and `annotateMerge` previously rebuilt the tool as a user-defined tool, which flipped `Tool.isProviderDefined` to `false`, corrupted the provider `id` (e.g. `anthropic.memory_20250818`), and crashed `Tool.getStrictMode`. These operations now clone the tool while preserving its prototype, `id`, and kind. Provider-defined tools also now carry an empty annotations context so `Tool.getStrictMode`/`annotate` work on them. Closes [#2615](https://github.com/Effect-TS/effect/issues/2615).

- [#6421](https://github.com/Effect-TS/effect/pull/6421) [`44b9cf3`](https://github.com/Effect-TS/effect/commit/44b9cf3d240d726997b4bbcd0ede48e074d3c456) Thanks @fubhy! - Preserve null edge data in Graph.floydWarshall costs.

- [#6438](https://github.com/Effect-TS/effect/pull/6438) [`7eea4d0`](https://github.com/Effect-TS/effect/commit/7eea4d0b73ec554915d7066a71f46326ce2ba45f) Thanks @tim-smart! - ensure one-shot iterables work with Fiber apis

- [#6420](https://github.com/Effect-TS/effect/pull/6420) [`0a8aa6a`](https://github.com/Effect-TS/effect/commit/0a8aa6acb90a72b91c24d17133c950e4cacd8abd) Thanks @fubhy! - Fix `Graph.isAcyclic` to detect cycles formed by parallel undirected edges.

- [#6417](https://github.com/Effect-TS/effect/pull/6417) [`c8d9fcf`](https://github.com/Effect-TS/effect/commit/c8d9fcf7b030f7c474effbab2764ce7aee1c7209) Thanks @fubhy! - Reject `Graph` mutation operations on mutable handles after `Graph.endMutation` finalizes them.

- [#6423](https://github.com/Effect-TS/effect/pull/6423) [`9ca7f9a`](https://github.com/Effect-TS/effect/commit/9ca7f9a69363e4485645966d5a93b8f9597c5206) Thanks @fubhy! - Fix Graph.isGraph narrowing for mutable and undirected graphs.

- [#6459](https://github.com/Effect-TS/effect/pull/6459) [`e7aca89`](https://github.com/Effect-TS/effect/commit/e7aca894bb32fbb785b5830837e6061c415a6015) Thanks @fubhy! - Reject asynchronous `Graph` mutation callbacks and finalize scoped mutable handles when callbacks fail.

- [#6458](https://github.com/Effect-TS/effect/pull/6458) [`55d7560`](https://github.com/Effect-TS/effect/commit/55d75609b8acf8a1b54c1b1c7fbbb65ec741aa3e) Thanks @fubhy! - Fix undirected `Graph` equality and hashing to ignore stored edge endpoint orientation.

- [#6415](https://github.com/Effect-TS/effect/pull/6415) [`f809189`](https://github.com/Effect-TS/effect/commit/f809189ddf6b6011ba43a9901baaa734e315da2a) Thanks @fubhy! - Fix `Graph.Walker` iteration for receiver-sensitive iterables.

- [#6394](https://github.com/Effect-TS/effect/pull/6394) [`88a54cc`](https://github.com/Effect-TS/effect/commit/88a54cc341006e3ebcb13482c618f62a680ce199) Thanks @lloydrichards! - added graph set operations for combining and comparing graphs
  - `Graph.make` - creates a graph constructor for a dynamically selected graph kind
  - `Graph.compose` - composition of two graphs, merging nodes by identity
  - `Graph.intersection` - intersection of two graphs, keeping only common nodes and edges
  - `Graph.difference` - difference of two graphs, removing edges present in the second graph
  - `Graph.symmetricDifference` - symmetric difference of two graphs, keeping edges present in exactly one graph

- [#6395](https://github.com/Effect-TS/effect/pull/6395) [`0ebdbe7`](https://github.com/Effect-TS/effect/commit/0ebdbe74463dc84385956d0b1e8c2b79ebab5400) Thanks @Chaoran-Huang! - Fix multipart parser limit violations being silently swallowed

- [#6419](https://github.com/Effect-TS/effect/pull/6419) [`7517d09`](https://github.com/Effect-TS/effect/commit/7517d09f12a0b183a81bd425962c4e280a68b05d) Thanks @fubhy! - Make the public Graph interfaces opaque by hiding internal mutable storage fields from their TypeScript surface.

- [#6390](https://github.com/Effect-TS/effect/pull/6390) [`212493b`](https://github.com/Effect-TS/effect/commit/212493b9a1eb98cd1ef6959c707a2e5784a5ae91) Thanks @alvarosevilla95! - Fix Redis script evaluation so transient `SCRIPT LOAD` failures are retried instead of being cached indefinitely.

- [#6394](https://github.com/Effect-TS/effect/pull/6394) [`88a54cc`](https://github.com/Effect-TS/effect/commit/88a54cc341006e3ebcb13482c618f62a680ce199) Thanks @lloydrichards! - add advanced graph set operations for deriving related graph structures
  - `Graph.complement` - complement over the existing node set, adding missing edges between distinct nodes
  - `Graph.neighborhood` - induced subgraph containing nodes within a radius of a node
  - `Graph.sum` - disjoint union of two graphs without merging equal node data

- [#6430](https://github.com/Effect-TS/effect/pull/6430) [`80ea8cb`](https://github.com/Effect-TS/effect/commit/80ea8cb9222ca73f564c8267ab2f82966fea027a) Thanks @fubhy! - Fix Graph BFS, topological sort, and DFS postorder iterators to skip nodes removed from a MutableGraph without recursive self-calls.

- [#6465](https://github.com/Effect-TS/effect/pull/6465) [`8df19f4`](https://github.com/Effect-TS/effect/commit/8df19f4fe81d90cc33ace88b9a77e5534f82d604) Thanks @gcanti! - Fix `isInt32` to apply custom annotations only to its filter group.

## 4.0.0-beta.98

### Patch Changes

- [#2587](https://github.com/Effect-TS/effect-smol/pull/2587) [`989603b`](https://github.com/Effect-TS/effect-smol/commit/989603b60ab1197b64acf214208e0d370cd1f842) Thanks @gcanti! - Expose `SchemaError` as a public module and re-export `Schema.isSchemaError`.

  This gives consumers a stable import path and guard for schema failures without
  depending on the internal schema implementation, while preserving the existing
  `Schema.SchemaError` surface.

- [#2592](https://github.com/Effect-TS/effect-smol/pull/2592) [`214c458`](https://github.com/Effect-TS/effect-smol/commit/214c458084bb6995d543cd37d1055f24be3d454e) Thanks @gcanti! - Apply `transformClient` when building an individual HttpApi endpoint client, preserving the supplied client's error and service channels.

- [#2598](https://github.com/Effect-TS/effect-smol/pull/2598) [`a037273`](https://github.com/Effect-TS/effect-smol/commit/a0372736ac34796969b051bbba4717d7983f1ebe) Thanks @gcanti! - Preserve `__proto__` group and endpoint identifiers in HTTP APIs, generated clients, and URL builders.

- [#2578](https://github.com/Effect-TS/effect-smol/pull/2578) [`97fdaa9`](https://github.com/Effect-TS/effect-smol/commit/97fdaa9c1f522c65e579365d314a07878e2b904f) Thanks @tim-smart! - Fix `Atom.kvs` async mode to retain its `AsyncResult` value shape after writes.

- [#2612](https://github.com/Effect-TS/effect-smol/pull/2612) [`b24d248`](https://github.com/Effect-TS/effect-smol/commit/b24d248c8df44222ce642087cde2bd859a2dc709) Thanks @gptguy! - Fix replay of persisted `DurableDeferred.raceAll` results.

- [#2580](https://github.com/Effect-TS/effect-smol/pull/2580) [`19c222c`](https://github.com/Effect-TS/effect-smol/commit/19c222cac2353a3d7b7733caecb00556fffe9a5c) Thanks @gcanti! - Fix HttpApi authorization decoding.

  Previously, `HttpApiBuilder.securityDecode` removed the expected scheme length and one following character from the `Authorization` header without verifying either value. A Bearer decoder could therefore pass credentials from a different scheme such as `Basic`, accept a malformed header without a separating space, or retain leading spaces when more than one separator was present.

  The decoder now validates the declared scheme before returning credentials, matches it case-insensitively as required by [RFC 9110 section 11.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-11.1), and consumes one or more separating spaces. Missing, malformed, or mismatched headers produce the existing empty credential value so security middleware can reject them consistently.

  Basic authentication previously split the decoded `user-pass` value at every colon, causing otherwise valid passwords containing `:` to be discarded. It now uses only the first colon as the separator and preserves the rest of the password, following [RFC 7617 section 2](https://www.rfc-editor.org/rfc/rfc7617.html#section-2).

- [#2581](https://github.com/Effect-TS/effect-smol/pull/2581) [`eec85dd`](https://github.com/Effect-TS/effect-smol/commit/eec85ddba09ea326fd268ee33eeffd47e50d4671) Thanks @gcanti! - Fix HttpApi client error decoding.

  Generated clients previously combined every error schema for a status into one union decoder. When schemas used different encodings, their declaration order could determine the decoded error instead of the response `Content-Type`; for example, a text decoder could accept a JSON response before the JSON decoder was tried.

  Error responses are now grouped and selected by normalized content type, matching buffered success responses. Normalization happens before grouping, so declarations that differ only by casing or parameters such as `charset` share one union decoder instead of making later schemas unreachable.

  No-content schemas are represented by a headerless alternative, allowing empty error responses without a `Content-Type` header to decode correctly. Unsupported content types preserve the existing combination of `StatusCodeError` and the response decoding failure.

- [#2605](https://github.com/Effect-TS/effect-smol/pull/2605) [`0082f4f`](https://github.com/Effect-TS/effect-smol/commit/0082f4f74fb139fd578f87f0a790e845133983dc) Thanks @gcanti! - Fix `Number.remainder` for very small and large values formatted in scientific notation.

- [#2611](https://github.com/Effect-TS/effect-smol/pull/2611) [`8849052`](https://github.com/Effect-TS/effect-smol/commit/884905232d1e9a365e046d8dde27bf9c5707f57f) Thanks @tim-smart! - Fix `PersistedQueue` to count schema decoding and malformed SQL payload failures as processing attempts.

- [#2500](https://github.com/Effect-TS/effect-smol/pull/2500) [`c15e16a`](https://github.com/Effect-TS/effect-smol/commit/c15e16ad130d1fbde25d912b7ac55995066cb35b) Thanks @hsubra89! - Fix Redis-backed `PersistedQueue` reset and failed-item handling.

- [#2602](https://github.com/Effect-TS/effect-smol/pull/2602) [`01d00a3`](https://github.com/Effect-TS/effect-smol/commit/01d00a3abfbf1f37996cdbe738ea5137c646cdd7) Thanks @gcanti! - Fix a bug where decoding bracket paths from FormData or URLSearchParams could mutate inherited object prototypes.

- [#2588](https://github.com/Effect-TS/effect-smol/pull/2588) [`8bd4589`](https://github.com/Effect-TS/effect-smol/commit/8bd458975a1b3a8ed042eccf317b93d28ded91e7) Thanks @gcanti! - Fix `SchemaAST.isJson` to reject class instances and other non-record objects.

- [#2605](https://github.com/Effect-TS/effect-smol/pull/2605) [`0082f4f`](https://github.com/Effect-TS/effect-smol/commit/0082f4f74fb139fd578f87f0a790e845133983dc) Thanks @gcanti! - Fix JSON Schema `allOf` imports for tuple intersections and preserve primitive refinements when combining literal constraints.

- [#2604](https://github.com/Effect-TS/effect-smol/pull/2604) [`6e08428`](https://github.com/Effect-TS/effect-smol/commit/6e08428d980501b856f846ad3f3f0e4ea46e7786) Thanks @gcanti! - Fix `Schema.toFormatter` and `Schema.toEquivalence` indexing for tuples with multiple post-rest elements.

- [#2603](https://github.com/Effect-TS/effect-smol/pull/2603) [`388dcf9`](https://github.com/Effect-TS/effect-smol/commit/388dcf953f65d317547f34d40e6443c5f264205f) Thanks @gcanti! - Fix union candidate selection and decoding order so that unions now:
  - consider matches from every sentinel key instead of dropping valid members after the first match;
  - reject ambiguous `oneOf` inputs when members with different sentinel keys both match;
  - preserve declared member order when combining discriminated members with non-discriminated fallbacks;
  - commit concurrent decoding results in declaration order instead of completion order.

  Reserved SSE failure event names with non-`Cause` data are now emitted as application events instead of producing a runtime defect.

- [#2609](https://github.com/Effect-TS/effect-smol/pull/2609) [`2b7ce2b`](https://github.com/Effect-TS/effect-smol/commit/2b7ce2b513e7ec2a77822f1116dc6ffb6ba93f4e) Thanks @tim-smart! - Fix SQL-backed persisted queues to refresh locks for actively acquired elements.

- [#2583](https://github.com/Effect-TS/effect-smol/pull/2583) [`87bea7e`](https://github.com/Effect-TS/effect-smol/commit/87bea7e16259246f3bcdf565446394751abca953) Thanks @MrGovindan! - Fixed Clock.sleep handling of large durations

- [#2582](https://github.com/Effect-TS/effect-smol/pull/2582) [`ce38dc3`](https://github.com/Effect-TS/effect-smol/commit/ce38dc33bda805a684432cca071f4dc3c6b9a1ba) Thanks @gcanti! - Harden HttpApi documentation HTML rendering.

  Scalar descriptions and CDN versions were interpolated without attribute-safe escaping. Embedded OpenAPI JSON in Scalar and Swagger also handled only the exact `</script>` sequence, not other valid [script end-tag forms](https://html.spec.whatwg.org/multipage/parsing.html#script-data-end-tag-name-state).

  Attribute values and CDN versions are now encoded for their contexts, and embedded JSON escapes `<` so it cannot close its script element.

- [#2591](https://github.com/Effect-TS/effect-smol/pull/2591) [`a807cd1`](https://github.com/Effect-TS/effect-smol/commit/a807cd170341deca8a1cfb52c4222585f2431bb9) Thanks @gcanti! - Keep HttpApi composition immutable.

  `HttpApi.addHttpApi` applied annotations from the added API by mutating its shared groups. It now creates annotated group copies, keeping the source API and independently annotated variants unchanged while preserving annotation precedence.

- [#2584](https://github.com/Effect-TS/effect-smol/pull/2584) [`fd8a356`](https://github.com/Effect-TS/effect-smol/commit/fd8a356f06a8c9ce4e7e0a13fc4021c178ed31de) Thanks @gcanti! - Normalize HttpApi payload media types.

  Payload schemas were stored under their exact declared `Content-Type`, but the server lowercased the incoming header and removed its parameters before looking it up. For example, a schema declared as `Application/Vnd.Effect+JSON; profile=declared` was stored under that value, while the server looked for `application/vnd.effect+json`. This could produce a `415` response even when the generated client and server used the same API.

  The same mismatch allowed incompatible encodings for equivalent media types to bypass validation. Generated form-urlencoded requests also ignored custom content types and always used the default one.

  Payload maps now use normalized keys for matching and conflict checks, while each encoding keeps its declared content type. Generated requests and OpenAPI use the declared values, including every parameterized variant, and custom form-urlencoded content types are preserved.

- [#2476](https://github.com/Effect-TS/effect-smol/pull/2476) [`c2a5edc`](https://github.com/Effect-TS/effect-smol/commit/c2a5edc3abd31ad5bc123362bc1213e03e4095c3) Thanks @gcanti! - Improve unstable `HttpApi` type-level performance.

  The implementation now uses identifier-keyed maps and lighter structural
  constraints in several hot type-level paths. Generated group clients consume the
  concrete endpoint map directly instead of rebuilding it from the endpoint union.

  ## New Features
  - Add `HttpApiBuilder.Handlers.handleAll`, which registers an identifier-keyed batch of endpoint handlers for a group. Each entry can be either a handler function or `{ handler, options }`, and the object can be supplied in multiple partial batches. Endpoint identifiers that were already handled are rejected across batches.
  - `HttpApi.groups` now preserves the concrete group type for each group identifier. For example, `Api.groups.users` is typed as the `users` group instead of the full group union.
  - `HttpApiGroup.endpoints` now preserves the concrete endpoint type for each endpoint identifier. For example, `Group.endpoints.getUser` is typed as the `getUser` endpoint instead of the full endpoint union.
  - `HttpApiEndpoint` values can now be extended as classes, matching the class-like
    runtime shape already used by `HttpApi` and `HttpApiGroup`.

  ## Measured Type-Level Performance

  Main/current comparisons use identical generated fixtures compiled once per
  revision with TypeScript 7.0.2. The recorded revisions are `main` at
  `97fdaa9c1f52` and the branch source at `5798fc5fafcd`. The focused pre/post
  curves below were captured with the regular `httpapi` regression suite during
  development. The retained suite uses representative stress points instead of
  rerunning every point in those historical curves. All numbers are
  type-instantiation deltas over the corresponding shared baseline.

  Endpoint declaration costs now grow with a lower slope:

  | endpoints |    main | current |
  | --------: | ------: | ------: |
  |        10 |   4,580 |   2,808 |
  |        50 |  15,500 |   9,168 |
  |       100 |  29,150 |  17,118 |
  |       500 | 138,350 |  80,718 |

  Class-like endpoint declarations are slightly cheaper than inline endpoint
  values in the same 500-endpoint fixture shape:

  | fixture       | inline | class-like |
  | ------------- | -----: | ---------: |
  | 500 endpoints | 82,207 |     71,850 |

  `HttpApiBuilder` fluent handler registration avoids the previous non-linear
  blow-up in the cross-ref comparison:

  | fixture          |       main |   current |
  | ---------------- | ---------: | --------: |
  | 10 endpoints     |     37,856 |    11,582 |
  | 50 endpoints     |    568,576 |    63,702 |
  | 100 endpoints    |  2,154,476 |   182,852 |
  | 500 endpoints    | 51,741,676 | 3,296,052 |
  | 500 raw handlers | 51,734,176 | 3,294,550 |

  In the recorded regular-suite measurements, `handleAll` remains the scalable
  alternative to the equivalent fluent chain:

  | fixture              |    fluent | `handleAll` |
  | -------------------- | --------: | ----------: |
  | 10 endpoints         |    11,579 |       9,146 |
  | 50 endpoints         |    63,699 |      25,106 |
  | 100 endpoints        |   182,849 |      45,056 |
  | 500 endpoints        | 3,296,049 |     204,656 |
  | 500 eps, two batches | 3,296,049 |     223,613 |

  Generated-client type production also improves for the hot method-building
  paths:

  | fixture                                 |    main | current |
  | --------------------------------------- | ------: | ------: |
  | client methods, 500 endpoints           | 245,795 | 176,850 |
  | top-level client methods, 500 endpoints | 243,651 | 179,809 |
  | client endpoint method, 500 endpoints   |  56,738 |  46,294 |
  | client groups, 100 groups x 5 endpoints |  49,019 |  25,893 |

  The following focused curves were captured immediately before and after each
  isolated type-level change.

  The focused `Client.Group` curve shows the improvement from consuming the
  identifier-keyed endpoint map directly:

  | endpoints | union remapping | endpoint map |
  | --------: | --------------: | -----------: |
  |        10 |          12,448 |       12,294 |
  |        50 |          19,169 |       18,935 |
  |       100 |          27,570 |       27,236 |
  |       500 |          94,770 |       93,636 |

  The focused `Client.TopLevelMethods` curve improves by reading endpoint
  identifiers directly from the endpoint union:

  | endpoints | pre-change | post-change |
  | --------: | ---------: | ----------: |
  |        10 |     12,531 |      12,476 |
  |        50 |     19,252 |      19,197 |
  |       100 |     27,653 |      27,598 |
  |       500 |     94,853 |      94,798 |

  The focused `HttpApiClient.endpoint` selection curve improves by reading
  endpoint identifiers directly from the selected endpoint union:

  | endpoints | pre-change | post-change |
  | --------: | ---------: | ----------: |
  |        10 |      7,666 |       7,588 |
  |        50 |      8,707 |       8,629 |
  |       100 |     10,008 |       9,930 |
  |       500 |     20,408 |      20,330 |

  The focused `HttpApiBuilder.endpoint` selection curve improves by reading
  endpoint identifiers directly from the selected endpoint union:

  | endpoints | pre-change | post-change |
  | --------: | ---------: | ----------: |
  |        10 |     12,828 |      12,745 |
  |        50 |     13,869 |      13,786 |
  |       100 |     15,170 |      15,087 |
  |       500 |     25,570 |      25,487 |

  URL builder types now avoid repeatedly expanding the full API/group shape:

  | fixture                              |    main | current |
  | ------------------------------------ | ------: | ------: |
  | URL builder, 500 endpoints           | 211,356 |  91,610 |
  | top-level URL builder, 500 endpoints | 210,724 |  93,118 |
  | builder endpoint, 500 endpoints      |  62,894 |  51,952 |

  ## Breaking Changes

  These changes affect unstable `HttpApi` type-level APIs and structural API,
  group, and endpoint types.

  ### Renamed Constraint Types
  - Broad structural constraint exports have been renamed to align with
    `Schema.Constraint` terminology: `HttpApi.Any` to `HttpApi.Constraint`,
    `HttpApi.AnyWithProps` to `HttpApi.Top`, `HttpApiGroup.Any` to
    `HttpApiGroup.Constraint`, `HttpApiGroup.AnyWithProps` to `HttpApiGroup.Top`,
    and `HttpApiEndpoint.Any` to `HttpApiEndpoint.Constraint`.
  - `HttpApiEndpoint.AnyWithProps` has been replaced by `HttpApiEndpoint.Top`, whose
    schema parameters are constrained to `Schema.Top`, including success and error
    schemas.
  - Type guards now expose the widened runtime-prop shapes: `HttpApi.isHttpApi`
    returns `HttpApi.Top`, `HttpApiGroup.isHttpApiGroup` returns
    `HttpApiGroup.Top`, and `HttpApiEndpoint.isHttpApiEndpoint` returns
    `HttpApiEndpoint.Top`.
  - `HttpApiGroup.ApiGroup` has been renamed to `HttpApiGroup.Service`.

  ### API, Group, And Endpoint Shapes
  - `HttpApi.groups` is now typed as an identifier-keyed group map instead of
    `ReadonlyRecord<string, Groups>`, and `HttpApi` tracks its group union
    invariantly. Dynamic string indexing must refine the key first or cast to a
    broad runtime record.
  - `HttpApiGroup.endpoints` is now typed as an identifier-keyed endpoint map instead of
    `ReadonlyRecord<string, Endpoints>`, and `HttpApiGroup` tracks its endpoint
    union invariantly. Dynamic string indexing must refine the key first or cast to
    a broad runtime record.
  - `HttpApiEndpoint` now exposes its stable key as `identifier` instead of `name`,
    aligning endpoints with APIs and groups and leaving `name` available for future
    class-based endpoint patterns.
  - `HttpApiEndpoint` values are now function objects instead of plain objects.
    Runtime checks such as `typeof endpoint` now return `"function"`, and
    `endpoint.name` is the native function name. Use `endpoint.identifier` for the
    stable endpoint key.
  - Identifier helper types have been renamed from `Name` / `WithName` to
    `Identifier` / `WithIdentifier`; `HttpApiGroup.Service` now exposes
    `identifier` instead of `name`.

  ### Builder Handler Types
  - `HttpApiBuilder.Handlers` now tracks endpoints through an identifier-keyed endpoint map and a set of handled endpoint identifiers, instead of tracking the remaining endpoint union. Its public type parameters changed from `Handlers<R, Endpoints>` to `Handlers<R, EndpointsByIdentifier, HandledIdentifiers>`, and its phantom fields changed from `_Endpoints` to `~EndpointsByIdentifier` / `~HandledIdentifiers`.
  - The unused `HttpApiBuilder.Handlers.Any` helper type has been removed.
  - The exported `HttpApiBuilder.HandlersTypeId` symbol has been removed; `Handlers`
    now uses a private string type id.
  - Duplicate `handle` / `handleRaw` registrations for the same endpoint are rejected
    at the call site, and `handleAll` rejects endpoint identifiers that were already
    handled by an earlier batch. Missing endpoint handlers are still rejected by
    the final `HttpApiBuilder.group` return validation.

  ### Client Types
  - `HttpApiClient.Client.Group` now derives a client from a concrete group type: `Client.Group<Group, E, R>`. The previous group-union plus group-identifier form is no longer supported.
  - `HttpApiClient.Client.TopLevelMethods` now returns an identifier-keyed method record instead of a union of `[identifier, method]` tuples.
  - `HttpApiClient.makeWith` removes the default `HttpClientError.HttpClientError` from custom client error types in the returned `Client`, while preserving any additional custom client errors.

  ### Endpoint Helper Types
  - `HttpApiEndpoint.HttpApiEndpoint` now stores lightweight phantom metadata for middleware and request shapes: `~Middleware`, `~MiddlewareServices`, `~Request`, and `~RequestRaw`. Its type identifier field is now `readonly [TypeId]: typeof TypeId`.
  - `HttpApiEndpoint.Constraint` is now a lightweight structural endpoint constraint and does not extend `Pipeable`; values typed only as `HttpApiEndpoint.Constraint` do not expose `.pipe`.
  - `HttpApiEndpoint.AddError` has been removed; it was not used internally by the `HttpApi` implementation.
  - `HttpApiEndpoint.Json` and `HttpApiEndpoint.StringTree` have been removed in
    favor of the canonical `Schema.toCodecJson` and `Schema.toCodecStringTree`
    types.
  - Omitted request-part metadata now remains `never` instead of being wrapped as
    `Schema.toCodecStringTree<never>`; codec metadata is applied only when
    a params, query, payload, or headers schema is present.
  - Success metadata now applies `Schema.toCodecJson` only to buffered
    success schemas and preserves stream success schemas unchanged, including
    mixed buffered and streaming success arrays.
  - Handler request parts are now flattened with `Struct.Simplify`, improving
    displayed request types while reducing handler instantiations.
  - Endpoint helper types now read metadata fields directly instead of re-inferring all type parameters from the full `HttpApiEndpoint` interface. This affects helpers such as `Identifier`, `Success`, `Error`, `Params`, `Query`, `Payload`, `Headers`, `Middleware`, `MiddlewareServices`, `Errors`, `ErrorServicesEncode`, `ErrorServicesDecode`, `Request`, `RequestRaw`, `ServerServices`, and `ClientServices`.
  - `HttpApiClient.Client.Method` and related generated-client helpers now require endpoint types that satisfy `HttpApiEndpoint.ConstraintRequest`. Endpoint-like structural types must include the lightweight request metadata fields to be accepted.

- [#2585](https://github.com/Effect-TS/effect-smol/pull/2585) [`5946da3`](https://github.com/Effect-TS/effect-smol/commit/5946da3804a1be5e752b05b96bd058cdba50a1bf) Thanks @gcanti! - Reuse HttpApi response schemas.

  `HttpApiBuilder` looked up cached response schemas by their source AST but stored them by the transformed AST, so the cache normally missed. It now uses the source AST consistently.

- [#2590](https://github.com/Effect-TS/effect-smol/pull/2590) [`4ae0c5f`](https://github.com/Effect-TS/effect-smol/commit/4ae0c5ffcbe6c56ddfcb05c639112a079483539e) Thanks @IMax153! - Cleanup internals of CLI package

- [#2607](https://github.com/Effect-TS/effect-smol/pull/2607) [`5b2a0bc`](https://github.com/Effect-TS/effect-smol/commit/5b2a0bceea3a28a33a58555210c90a415dc74a76) Thanks @tim-smart! - ensure WithTransaction wraps entire rpc handler

- [#2613](https://github.com/Effect-TS/effect-smol/pull/2613) [`72ac585`](https://github.com/Effect-TS/effect-smol/commit/72ac585884befde6af9208da738699a93f1bae79) Thanks @tim-smart! - Add `HttpApiError.UnprocessableEntity` and `HttpApiError.UnprocessableEntityNoContent` for status 422 responses.

- [#2594](https://github.com/Effect-TS/effect-smol/pull/2594) [`5e8c1b8`](https://github.com/Effect-TS/effect-smol/commit/5e8c1b82bfafa121311f987a49ab75395e3647a7) Thanks @gcanti! - Reject unknown and duplicate HttpApi handler registrations with descriptive errors.

- [#2595](https://github.com/Effect-TS/effect-smol/pull/2595) [`0f9c078`](https://github.com/Effect-TS/effect-smol/commit/0f9c07841b04183f485ee6e6458de73b290b09f5) Thanks @gcanti! - Reject duplicate OpenAPI operations and operation identifiers, and reject incompatible security schemes that reuse a name.

## 4.0.0-beta.97

## 4.0.0-beta.96

### Patch Changes

- [#2563](https://github.com/Effect-TS/effect-smol/pull/2563) [`1503f45`](https://github.com/Effect-TS/effect-smol/commit/1503f45cb5bb2a74f4705252ec505a1f0ade7e62) Thanks @tim-smart! - update dependencies

- [#2566](https://github.com/Effect-TS/effect-smol/pull/2566) [`57fe793`](https://github.com/Effect-TS/effect-smol/commit/57fe79316ffbc380b30626a168981fb26ae97459) Thanks @tim-smart! - change rpc ids to string | number

- [#2561](https://github.com/Effect-TS/effect-smol/pull/2561) [`0c2f78f`](https://github.com/Effect-TS/effect-smol/commit/0c2f78f695ec474e1ff5474da183577975e418f5) Thanks @tim-smart! - Remove `Schedule.elapsed`.

- [#2561](https://github.com/Effect-TS/effect-smol/pull/2561) [`0c2f78f`](https://github.com/Effect-TS/effect-smol/commit/0c2f78f695ec474e1ff5474da183577975e418f5) Thanks @tim-smart! - Remove `Schedule.tapInput` and `Schedule.tapOutput`. Use `Schedule.tap` instead.

- [#2561](https://github.com/Effect-TS/effect-smol/pull/2561) [`0c2f78f`](https://github.com/Effect-TS/effect-smol/commit/0c2f78f695ec474e1ff5474da183577975e418f5) Thanks @tim-smart! - Update `Schedule.addDelay` and `Schedule.modifyDelay` to receive full schedule metadata instead of separate output and delay arguments.

- [#2562](https://github.com/Effect-TS/effect-smol/pull/2562) [`97f29df`](https://github.com/Effect-TS/effect-smol/commit/97f29df457f7ffd07cfb4b379315c12c086af805) Thanks @tim-smart! - use Sets to track atom relationships

## 4.0.0-beta.95

### Patch Changes

- [#2542](https://github.com/Effect-TS/effect-smol/pull/2542) [`a482442`](https://github.com/Effect-TS/effect-smol/commit/a482442abdeb490e9652b854ec3495e4aa7273e7) Thanks @IGassmann! - Add `Schema.DateFromMillis` and `SchemaTransformation.dateFromMillis` for decoding millisecond timestamps into `Date` values.

- [#2559](https://github.com/Effect-TS/effect-smol/pull/2559) [`fbefa85`](https://github.com/Effect-TS/effect-smol/commit/fbefa850fab2f0a302c20614496aeaaa2a8b5590) Thanks @tim-smart! - fix activity retry policy

- [#2547](https://github.com/Effect-TS/effect-smol/pull/2547) [`0b4a32f`](https://github.com/Effect-TS/effect-smol/commit/0b4a32f4260f0d8500942a133001b0d349328102) Thanks @fubhy! - Allow cron fields like `5/15` to expand from the starting value through the field maximum.

- [#2557](https://github.com/Effect-TS/effect-smol/pull/2557) [`18a49e1`](https://github.com/Effect-TS/effect-smol/commit/18a49e1786679456258002ff9397faf02f678c2d) Thanks @fubhy! - Fix `Schedule.cron` when the test clock is adjusted to infinity.

- [#2560](https://github.com/Effect-TS/effect-smol/pull/2560) [`266cb90`](https://github.com/Effect-TS/effect-smol/commit/266cb90bb2c17aabc40563c32db334f09ba3d74b) Thanks @gcanti! - Treat empty strings as missing values in built-in `ConfigProvider`s by default.

  `ConfigProvider.fromEnv`, `ConfigProvider.fromDotEnvContents`, `ConfigProvider.fromDotEnv`, `ConfigProvider.fromUnknown`, and `ConfigProvider.fromDir` now treat literal empty strings as absent values when loaded as values, allowing `Config.withDefault` and `Config.option` to recover. Container discovery still reflects the source structure. Pass `preserveEmptyStrings: true` to restore the previous behavior.

  `ConfigProvider.fromDotEnv({ expandVariables: true })` now expands variables consistently with `ConfigProvider.fromDotEnvContents`.

- [#2554](https://github.com/Effect-TS/effect-smol/pull/2554) [`912f095`](https://github.com/Effect-TS/effect-smol/commit/912f095a34572bbd3cedf6edb27878443e3e4a95) Thanks @tim-smart! - Add Schedule.upTo options for limiting schedules by duration and/or recurrence count.

- [#2556](https://github.com/Effect-TS/effect-smol/pull/2556) [`a6718f9`](https://github.com/Effect-TS/effect-smol/commit/a6718f9e00a15ca903b0732da46116cbf3d6aca7) Thanks @fubhy! - Fix cron parsing and scheduling edge cases for whitespace, Sunday `7`, strict numeric tokens, explicit full day ranges, and month-constrained day-of-month / weekday matching.

- [#2551](https://github.com/Effect-TS/effect-smol/pull/2551) [`bef5154`](https://github.com/Effect-TS/effect-smol/commit/bef51540a243aa2f872a00c01d0cd58b7a769baa) Thanks @tim-smart! - Remove the `Schedule.both` APIs and add `Schedule.max` for combining schedules by their slowest delay.

- [#2553](https://github.com/Effect-TS/effect-smol/pull/2553) [`18e0564`](https://github.com/Effect-TS/effect-smol/commit/18e0564bd0f8ebbdfcaf1e2c21529948e9e4a81d) Thanks @tim-smart! - Remove some Schedule APIs: `collectInputs`, `collectOutputs`, `collectWhile`, `delays`, `reduce`, `satisfiesErrorType`, `satisfiesInputType`, `satisfiesOutputType`, `satisfiesServicesType`, and `unfold`.

- [#2558](https://github.com/Effect-TS/effect-smol/pull/2558) [`fb50f14`](https://github.com/Effect-TS/effect-smol/commit/fb50f14fc3657c1973785aa5b72ecf0b0d28e0b2) Thanks @tim-smart! - Remove the Schedule.either APIs and add Schedule.min for fastest-duration schedule composition.

## 4.0.0-beta.94

### Patch Changes

- [#2538](https://github.com/Effect-TS/effect-smol/pull/2538) [`95a0e9b`](https://github.com/Effect-TS/effect-smol/commit/95a0e9bb62797af0e81c9998773405f248f218c5) Thanks @tim-smart! - fork memo map on nested builds

- [#2545](https://github.com/Effect-TS/effect-smol/pull/2545) [`a0a3490`](https://github.com/Effect-TS/effect-smol/commit/a0a3490bbce765f199d8e077aceac504f0462e63) Thanks @marbemac! - Use registration context for cluster entities

- [#2524](https://github.com/Effect-TS/effect-smol/pull/2524) [`f11ce73`](https://github.com/Effect-TS/effect-smol/commit/f11ce73af60823754dc24194f4ffc561b9ea1c2d) Thanks @gcanti! - Fix `HttpApi.make` so it stores the API identifier and starts with an empty `groups` object instead of a `Map`. This makes empty APIs match the shape they have after groups are added.

- [#2546](https://github.com/Effect-TS/effect-smol/pull/2546) [`ff30b6e`](https://github.com/Effect-TS/effect-smol/commit/ff30b6e7c2c63ffc56a4c5818d6d86b01b5ad528) Thanks @tim-smart! - Fix ClusterWorkflowEngine partial workflow clients colliding with full workflow clients.

- [#2523](https://github.com/Effect-TS/effect-smol/pull/2523) [`1caab3c`](https://github.com/Effect-TS/effect-smol/commit/1caab3cc30f626efbf15e59d74f539a487e5c85c) Thanks @rajzik! - Add glob to filesystem

- [#2541](https://github.com/Effect-TS/effect-smol/pull/2541) [`aa80c47`](https://github.com/Effect-TS/effect-smol/commit/aa80c4775a04db87553e5568764cab7e32a72814) Thanks @tim-smart! - add LayerRef module

- [#2539](https://github.com/Effect-TS/effect-smol/pull/2539) [`c2ae4fc`](https://github.com/Effect-TS/effect-smol/commit/c2ae4fce2f03a4cd1861c2b1179da7df656e662d) Thanks @gcanti! - Schema: add `Schema.Decoder` and `Schema.Encoder`, and accept simpler schema types in APIs that only decode, only encode, or only need the basic schema shape, closes [#2536](https://github.com/Effect-TS/effect-smol/issues/2536)

- [#2545](https://github.com/Effect-TS/effect-smol/pull/2545) [`a0a3490`](https://github.com/Effect-TS/effect-smol/commit/a0a3490bbce765f199d8e077aceac504f0462e63) Thanks @marbemac! - add Effect.setContext for fully replacing the fiber context

## 4.0.0-beta.93

### Patch Changes

- [#2512](https://github.com/Effect-TS/effect-smol/pull/2512) [`00652fe`](https://github.com/Effect-TS/effect-smol/commit/00652fe95c18f87208e91343eb8bf218faa2f677) Thanks @gcanti! - Preserve content schema identifiers when emitting JSON Schema for `Schema.fromJsonString`.

  This keeps user-defined identifiers attached to the decoded JSON payload while giving the generated JSON string wrapper its own derived name, avoiding client codegen outputs where the payload type is renamed behind the transport wrapper.

- [#2492](https://github.com/Effect-TS/effect-smol/pull/2492) [`6c58167`](https://github.com/Effect-TS/effect-smol/commit/6c5816746eaf91d2a3c7c899c5720809fa230ae3) Thanks @maxprilutskiy! - Map HttpApi json defects to SchemaError

- [#2519](https://github.com/Effect-TS/effect-smol/pull/2519) [`2bc5415`](https://github.com/Effect-TS/effect-smol/commit/2bc541501a7ef89e542d7cb98e96beb53cd205cc) Thanks @tim-smart! - Fix structural equality for request-style values when structural hashes collide.

- [#2507](https://github.com/Effect-TS/effect-smol/pull/2507) [`e11cccc`](https://github.com/Effect-TS/effect-smol/commit/e11cccc7d5fe631abccc7d6e3bd296938de0fa2e) Thanks @tim-smart! - ensure handler errors don't cause httpapi security middleware to fallback

- [#2518](https://github.com/Effect-TS/effect-smol/pull/2518) [`ba7e77e`](https://github.com/Effect-TS/effect-smol/commit/ba7e77e046b8641a3a4e9750bb88ca4a1d063d3f) Thanks @tim-smart! - Move `UrlParams.makeUrl` to `Url.make` and return `Url.UrlError` for URL construction failures.

- [#2505](https://github.com/Effect-TS/effect-smol/pull/2505) [`5713ee7`](https://github.com/Effect-TS/effect-smol/commit/5713ee7edbc3054efde407b2286bbfd45bbc6e1c) Thanks @KhraksMamtsov! - accept UrlParams.Input in some UrlParams apis

## 4.0.0-beta.92

### Patch Changes

- [#2501](https://github.com/Effect-TS/effect-smol/pull/2501) [`affdc13`](https://github.com/Effect-TS/effect-smol/commit/affdc139045cc325dce321a84a580fdc1b2da7b9) Thanks @gcanti! - Fix excess property handling in schema-backed class constructors, closes [#2499](https://github.com/Effect-TS/effect-smol/issues/2499).

## 4.0.0-beta.91

### Patch Changes

- [#2498](https://github.com/Effect-TS/effect-smol/pull/2498) [`b135b25`](https://github.com/Effect-TS/effect-smol/commit/b135b2517fca9e7839734ace3699a7dfa75b9075) Thanks @gcanti! - Fix `Schedule.andThenResult` to emit `self` outputs as `Failure` and `other` outputs as `Success`, closes [#2497](https://github.com/Effect-TS/effect-smol/issues/2497).

- [#2488](https://github.com/Effect-TS/effect-smol/pull/2488) [`aaa21a3`](https://github.com/Effect-TS/effect-smol/commit/aaa21a369a171c600db294f2a4f640583043e150) Thanks @fubhy! - Fix `String.camelCase` and `String.pascalCase` handling of numeric word segments, and add `String.configCase` for configuration key casing.

- [#2485](https://github.com/Effect-TS/effect-smol/pull/2485) [`3475ee6`](https://github.com/Effect-TS/effect-smol/commit/3475ee6c2bda6b05c6d7a12ce30c8bb840b5b1a6) Thanks @tim-smart! - fix RequestResolver interruption

## 4.0.0-beta.90

### Patch Changes

- [#2483](https://github.com/Effect-TS/effect-smol/pull/2483) [`d237fdf`](https://github.com/Effect-TS/effect-smol/commit/d237fdf726481f76eb52a6196e111b24122bc3d5) Thanks @tim-smart! - Fix `Config.schema` so missing array values are treated as missing data, allowing `Config.withDefault` to apply.

## 4.0.0-beta.89

### Patch Changes

- [#2475](https://github.com/Effect-TS/effect-smol/pull/2475) [`b7d46ab`](https://github.com/Effect-TS/effect-smol/commit/b7d46ab7e1a29d8711817bab583c9febf48a0dad) Thanks @tim-smart! - Update `Schema.Void` to model ignored `void` return values.

  Runtime parsing now accepts any present value and discards it as `undefined`.
  This matches TypeScript `void` return values, where callers do not observe the
  returned value. Use `Schema.Undefined` when the input must be exactly
  `undefined`.

- [#2479](https://github.com/Effect-TS/effect-smol/pull/2479) [`7777e15`](https://github.com/Effect-TS/effect-smol/commit/7777e1540fd3680dd8346723cffec812b9384669) Thanks @tim-smart! - Add custom error callbacks to Effect.fromOption.

- [#2480](https://github.com/Effect-TS/effect-smol/pull/2480) [`5376197`](https://github.com/Effect-TS/effect-smol/commit/5376197ca8e50358a41b1fd3cec27bd1ec680ec6) Thanks @tim-smart! - render causes in OtlpTracer exception events

## 4.0.0-beta.88

### Patch Changes

- [#2472](https://github.com/Effect-TS/effect-smol/pull/2472) [`911f1b8`](https://github.com/Effect-TS/effect-smol/commit/911f1b84790ce42b3a70c95b33e6f6fd9e74de8b) Thanks @tim-smart! - Add adaptive consume and feedback operations to the unstable persistent RateLimiterStore API, including in-memory and Redis-backed bounded cooldown, learning, learned pacing, and expiry behavior for 429 Retry-After feedback.

- [#2457](https://github.com/Effect-TS/effect-smol/pull/2457) [`8beeeea`](https://github.com/Effect-TS/effect-smol/commit/8beeeea52879d8613a39468848f01c3092bd54d4) Thanks @P0lip! - Localize missing rpc method errors to the provided request id

- [#2428](https://github.com/Effect-TS/effect-smol/pull/2428) [`c306fcf`](https://github.com/Effect-TS/effect-smol/commit/c306fcfeb1ef38455156932a1faf49292b1318da) Thanks @MrGovindan! - Add `isOpen` to `Latch` to allow querying the latch's open state

## 4.0.0-beta.87

### Patch Changes

- [#2468](https://github.com/Effect-TS/effect-smol/pull/2468) [`5a0c1a4`](https://github.com/Effect-TS/effect-smol/commit/5a0c1a4faee5707b5cc35e646ff1ffdad70f1956) Thanks @gcanti! - Expose the original input schema on `Schema.toType`, `Schema.toEncoded`, `Schema.toCodecJson`, and `Schema.toCodecStringTree` results via the `schema` property. This aligns these schema wrappers with other wrappers that retain their source schema for type-level and runtime introspection.

- [#2466](https://github.com/Effect-TS/effect-smol/pull/2466) [`1eea2ea`](https://github.com/Effect-TS/effect-smol/commit/1eea2ea3795ba47316b82b1ac8d4612c0ba389ed) Thanks @gcanti! - Use `URL.canParse` to validate URL string schema decoding before constructing a `URL`. This avoids relying on thrown exceptions for routine validation while preserving the same invalid URL issue and successful decode output.

## 4.0.0-beta.86

### Patch Changes

- [#2462](https://github.com/Effect-TS/effect-smol/pull/2462) [`0b5795a`](https://github.com/Effect-TS/effect-smol/commit/0b5795a0ab4395e8f15955d8d96f2303084bfc64) Thanks @tim-smart! - Add `Statement.valuesUnprepared` for returning unprepared SQL statement rows as arrays.

- [#2455](https://github.com/Effect-TS/effect-smol/pull/2455) [`3e3a859`](https://github.com/Effect-TS/effect-smol/commit/3e3a859ec6351a9e0d31674aabbd48fcefabb12e) Thanks @fubhy! - Fix `Cron.next` skipping earlier matching days when the upcoming day-of-month does not exist in the current month.

- [#2454](https://github.com/Effect-TS/effect-smol/pull/2454) [`7dbec24`](https://github.com/Effect-TS/effect-smol/commit/7dbec240dbf3bca599a20c486632abce694ef5ab) Thanks @StarpTech! - Exclude response metadata from HTTP server span failures after response headers have been sent.

- [#2449](https://github.com/Effect-TS/effect-smol/pull/2449) [`d8c00a1`](https://github.com/Effect-TS/effect-smol/commit/d8c00a171ac7141e8adc08c332d1162d9a9d56fc) Thanks @gcanti! - Fix Schema handling of encoded-side checks for container ASTs.

  Checks added after `flip` are now preserved as `encodingChecks` across
  `Declaration`, `Arrays`, `Objects`, and `Union`, even when rebuilding the AST
  does not change child nodes. `toType` now projects those checks consistently,
  and parsing applies encoded-side checks to the local encoded value when an
  encoding chain is present without allowing encoded-side `parseOptions`
  annotations to affect the current parser side.

- [#2446](https://github.com/Effect-TS/effect-smol/pull/2446) [`85b6317`](https://github.com/Effect-TS/effect-smol/commit/85b631701e935866f2762bd595237aa718370cd9) Thanks @IMax153! - Allow schemas provided to CLI flags / arguments to utilize the environment required by the CLI

- [#2452](https://github.com/Effect-TS/effect-smol/pull/2452) [`6d0fda0`](https://github.com/Effect-TS/effect-smol/commit/6d0fda0d0cbdfffc523c89c57dfdb1608f84fb12) Thanks @gcanti! - Remove the `keepDeclarations` option from `Schema.toCodecStringTree`.

- [#2461](https://github.com/Effect-TS/effect-smol/pull/2461) [`108a933`](https://github.com/Effect-TS/effect-smol/commit/108a9335ff8571928197e5847a09c28ac83d6f46) Thanks @tim-smart! - Fail RpcClient HTTP requests with a defect when the response stream closes before the request receives a terminal response.

- [#2442](https://github.com/Effect-TS/effect-smol/pull/2442) [`7e1f455`](https://github.com/Effect-TS/effect-smol/commit/7e1f455fab5005d769b939c91e519d450f802cf9) Thanks @gcanti! - Improve Schema type-level performance by lazily computing schema views,
  specializing common struct projections, and using lighter schema constraints at
  API boundaries that do not need the full schema protocol.

  This also adds the Schema type-performance benchmark suite, introduces
  `Schema.toCodecArrayFromSingle`, preserves canonical StringTree array codecs,
  renames the arbitrary-generation annotation constraint for clarity, and updates
  affected codec, parser, channel, SQL, HTTP API, persistence, RPC, AI, OpenAPI,
  and workflow typings to match the refined Schema surface.

- [#2464](https://github.com/Effect-TS/effect-smol/pull/2464) [`46b3e79`](https://github.com/Effect-TS/effect-smol/commit/46b3e79944cfdae7901eb148135c85b7eb39834e) Thanks @tim-smart! - do not use performance.timeOrigin and calculate origins lazily

## 4.0.0-beta.85

### Patch Changes

- [#2436](https://github.com/Effect-TS/effect-smol/pull/2436) [`328d97c`](https://github.com/Effect-TS/effect-smol/commit/328d97cc53c0dcb89077a5623e35b095eaa59a8c) Thanks @MohanedMashaly! - change default operation in redis from LPUSH TO RPUSH

- [#2431](https://github.com/Effect-TS/effect-smol/pull/2431) [`8441836`](https://github.com/Effect-TS/effect-smol/commit/8441836e6dde70e8ae2126be9cefe9b45798b134) Thanks @gcanti! - Derive template literal arbitraries from encoded parts, closes [#2414](https://github.com/Effect-TS/effect-smol/issues/2414).

- [#2439](https://github.com/Effect-TS/effect-smol/pull/2439) [`074e436`](https://github.com/Effect-TS/effect-smol/commit/074e4361091289104cb0ab6959dc3b0ea7794a6a) Thanks @gcanti! - Allow schema class `.extend` to accept a `Struct` and preserve checks from the extension schema, closes [#2419](https://github.com/Effect-TS/effect-smol/issues/2419).

- [#2444](https://github.com/Effect-TS/effect-smol/pull/2444) [`c1dfd60`](https://github.com/Effect-TS/effect-smol/commit/c1dfd60663eb13a58916f3712d877499943b628a) Thanks @bweis! - Avoid throwing when `Error.stackTraceLimit` is non-writable (frozen intrinsics / SES / deterministic sandboxes such as Temporal).

  Effect manipulates `Error.stackTraceLimit` in several internal spots to capture short or empty stack traces cheaply. In hardened environments where `Error` is frozen and `stackTraceLimit` is read-only, assigning to it throws, which broke Effect entirely. Stack-trace-limit manipulation is now best-effort and silently no-ops when the property cannot be modified, mirroring Node's own internal guard. Behavior in normal (writable) environments is unchanged.

- [#2425](https://github.com/Effect-TS/effect-smol/pull/2425) [`2ba316b`](https://github.com/Effect-TS/effect-smol/commit/2ba316bd15fcbf1c50626500d44a2c9b3bec19f5) Thanks @tim-smart! - Add Random.choice for selecting a random element from an iterable.

- [#2434](https://github.com/Effect-TS/effect-smol/pull/2434) [`7ce7344`](https://github.com/Effect-TS/effect-smol/commit/7ce7344c41056c79e2ee19ee6a9346c0f1d227c1) Thanks @gcanti! - Use semantic matching for TemplateLiteral parsing and index signature keys

  Replace regex-based TemplateLiteral parsing with backtracking segmentation over
  template literal parts, applying part checks during matching.

  Use schema membership when selecting Record index signature keys, including
  checked string, number, symbol, and TemplateLiteral parameters. Tighten valid
  index signature parameters on both type and encoded sides, and preserve key
  parameter semantics in codec transformations.

## 4.0.0-beta.84

### Patch Changes

- [#2420](https://github.com/Effect-TS/effect-smol/pull/2420) [`87f52ba`](https://github.com/Effect-TS/effect-smol/commit/87f52ba16c4370ffa3f84bf8e53038e1419c284e) Thanks @tim-smart! - Add `Effect.transposeOption` for converting an `Option<Effect<A, E, R>>` into an `Effect<Option<A>, E, R>`.

- [#2374](https://github.com/Effect-TS/effect-smol/pull/2374) [`b8ee07f`](https://github.com/Effect-TS/effect-smol/commit/b8ee07ffda8903b5ec2e45a786ddcba59f128fda) Thanks @gcanti! - Import unconstrained JSON Schema nodes as `Schema.Json` instead of `Schema.Unknown`.

- [#2407](https://github.com/Effect-TS/effect-smol/pull/2407) [`867c0d7`](https://github.com/Effect-TS/effect-smol/commit/867c0d70a09079b040260d45a1e92ff04dbfbf2f) Thanks @gcanti! - Normalize error behavior for Schema and SchemaParser boundary APIs.

  `SchemaError` now extends `Data.TaggedError`, so it is also a native `Error`.
  SchemaParser Promise APIs now reject an `Error` whose cause is the
  `SchemaIssue.Issue` for schema failures.

  Schema and SchemaParser `Effect` and `Exit` adapters now preserve full causes
  while mapping schema issue failures to their public error type. The `is`,
  `asserts`, `Promise`, `Sync`, `Result`, `Option`, `make`, and `makeOption`
  adapters now distinguish schema issues from non-schema causes. Schema-only
  failures are converted to the adapter's normal representation (`false`,
  rejected or thrown schema error, `Result.fail`, or `None`), while non-schema
  causes throw or reject with an `Error` whose cause is the underlying `Cause`.

- [#2409](https://github.com/Effect-TS/effect-smol/pull/2409) [`b93bc6c`](https://github.com/Effect-TS/effect-smol/commit/b93bc6c9cb27b909a41d094c97c4f9d25bbc6d6b) Thanks @tim-smart! - Fix Stream.runForEachWhile so it continues across chunk boundaries while the predicate returns true and stops when the predicate returns false.

- [#2424](https://github.com/Effect-TS/effect-smol/pull/2424) [`57d387f`](https://github.com/Effect-TS/effect-smol/commit/57d387f92c30ab63e15e3e641f0a903b65886610) Thanks @tim-smart! - Fix cluster workflow activity defect hydration

- [#2403](https://github.com/Effect-TS/effect-smol/pull/2403) [`bacca41`](https://github.com/Effect-TS/effect-smol/commit/bacca4141c2400effae1eabfdb36c89a459cf246) Thanks @lloydrichards! - align ProcessInput.Input runtime field name with type definition on Prompt.custom

- [#2423](https://github.com/Effect-TS/effect-smol/pull/2423) [`0f8ac79`](https://github.com/Effect-TS/effect-smol/commit/0f8ac7959d29ed68c68ce25aabd6bf0cb7e63ecc) Thanks @tim-smart! - RpcGroup.toHandlers is definition first

- [#2383](https://github.com/Effect-TS/effect-smol/pull/2383) [`25b4482`](https://github.com/Effect-TS/effect-smol/commit/25b448270c01317703f25107e1480d4cd0246d9a) Thanks @gcanti! - Fix config path composition and directory-backed lookup behavior.

  `ConfigProvider.orElse` now keeps each side's own `nested` and `mapInput`
  behavior. Applying `nested` or `mapInput` to a combined provider now applies the
  same transformation to both sides.

  `ConfigProvider` path transformations now compose as a single path function.
  This makes `nested` and `mapInput` behave consistently with normal function
  composition.

  `Config.nested` now tracks the logical config path in `Config` itself instead of
  wrapping the provider. This keeps lookup paths and schema error paths aligned.
  The low-level `Config.make` constructor is no longer exported; use config
  constructors and combinators, or implement custom lookup behavior with
  `ConfigProvider.make`.

  `ConfigProvider.fromDir` now returns `undefined` when neither a file nor a
  directory exists at the requested path, so `orElse` can fall back instead of
  failing with `SourceError`.

- [#2415](https://github.com/Effect-TS/effect-smol/pull/2415) [`9cf3a25`](https://github.com/Effect-TS/effect-smol/commit/9cf3a25c66b0c44a52be9829870c44517ea52db2) Thanks @gcanti! - Fix `Effect.try` thunk usage and `Effect.tryPromise` mapper and signal handling defects.

  `Effect.try` now supports passing a thunk directly, matching `Effect.tryPromise`. Thrown values from direct-thunk usage are mapped to `Cause.UnknownError`.

  When a promise handled by `Effect.tryPromise` rejected and the custom `catch` mapper threw while mapping that rejection, the effect could remain pending and produce an unhandled rejection. The mapper is now guarded consistently with the synchronous throw path, so a thrown mapper error becomes an Effect defect. The JSDoc for `Effect.try` and `Effect.tryPromise` was also corrected.

  `Effect.tryPromise` now also only creates an `AbortController` when the wrapped thunk declares an `AbortSignal` parameter.

- [#2417](https://github.com/Effect-TS/effect-smol/pull/2417) [`8def767`](https://github.com/Effect-TS/effect-smol/commit/8def7674b1787f91035298cda4d122937e87ef72) Thanks @tim-smart! - deduplicate SqlResolver.findById requests

## 4.0.0-beta.83

### Patch Changes

- [#2394](https://github.com/Effect-TS/effect-smol/pull/2394) [`1f2e8ce`](https://github.com/Effect-TS/effect-smol/commit/1f2e8ceef09e0a791c850ed2ade01f97089596f9) Thanks @IMax153! - Fix published HttpApi declaration files by exporting schema metadata types referenced by public declarations.

## 4.0.0-beta.82

### Patch Changes

- [#2391](https://github.com/Effect-TS/effect-smol/pull/2391) [`193690b`](https://github.com/Effect-TS/effect-smol/commit/193690b642ea802bbed40d663bd677251bbe9dc3) Thanks @IMax153! - Fix HttpApiEndpoint endpoint error inference when success schemas include streams.

## 4.0.0-beta.81

### Patch Changes

- [#2387](https://github.com/Effect-TS/effect-smol/pull/2387) [`93cb4f8`](https://github.com/Effect-TS/effect-smol/commit/93cb4f8fbfb9e07cb9dc86ce6b155fd1f8167914) Thanks @gcanti! - `Config.withDefault` now only recovers from missing data for literal/union
  schemas. Invalid present values now propagate validation errors instead of
  using the default, closes [#2384](https://github.com/Effect-TS/effect-smol/issues/2384).

- [#2388](https://github.com/Effect-TS/effect-smol/pull/2388) [`60341d9`](https://github.com/Effect-TS/effect-smol/commit/60341d9ca744d0473ce3fab621ca9bd225af3a39) Thanks @gcanti! - `Config.withDefault` no longer recovers from schema filter failures. A filter
  failure means a present value reached refinement checks, so using the default
  could hide invalid configuration values.

- [#2389](https://github.com/Effect-TS/effect-smol/pull/2389) [`1105ab5`](https://github.com/Effect-TS/effect-smol/commit/1105ab56cb724212f7ea7b431396ce82e8fd0484) Thanks @gcanti! - Fix `Schema.toTaggedUnion(...).isAnyOf` narrowing for custom discriminant keys, closes [#2386](https://github.com/Effect-TS/effect-smol/issues/2386).

  Previously, the type predicate always extracted union members by `_tag`, even
  when `toTaggedUnion` was created with a different discriminant key. Runtime
  behavior already used the supplied key, so this aligns the type-level narrowing
  with the existing runtime behavior.

- [#2270](https://github.com/Effect-TS/effect-smol/pull/2270) [`4500fbf`](https://github.com/Effect-TS/effect-smol/commit/4500fbfe00763d8a72af6e5d6c5988e8bd4ade36) Thanks @IMax153! - Add HTTP API streaming response support

## 4.0.0-beta.80

### Patch Changes

- [#2205](https://github.com/Effect-TS/effect-smol/pull/2205) [`d944330`](https://github.com/Effect-TS/effect-smol/commit/d94433090ee03f426d43e13b883abae4494e55e6) Thanks @lloydrichards! - add support for merging external events into `Prompt.custom` render loops via an optional `events` dequeue and `receive` handler.

  The prompt races user input against events from the dequeue, allowing background events to trigger re-renders without waiting for a keypress:

  ```ts
  const eventQueue = yield * Queue.make<number>();

  const prompt = Prompt.custom(
    { count: 0 },
    Queue.asDequeue(eventQueue), // <-- provide the event queue as a dequeue to the prompt
    {
      render: (state) => Effect.succeed(`Count: ${state.count}`),
      process: (input, state) =>
        Effect.succeed(
          Match.value(input).pipe(
            // handle user input
            Match.tag("Input", () => Action.Submit({ value: state.count })),
            // handle external events from the queue
            Match.tag("Event", (input) =>
              Action.NextFrame({ state: { count: state.count + input.value } }),
            ),
            Match.exhaustive,
          ),
        ),
      clear: () => Effect.succeed(""),
    },
  );
  ```

- [#2369](https://github.com/Effect-TS/effect-smol/pull/2369) [`f48659f`](https://github.com/Effect-TS/effect-smol/commit/f48659fdcc84930ebc1e5b45b540c0f973389182) Thanks @gcanti! - Round fractional durations symmetrically when normalizing to nanoseconds.

- [#2373](https://github.com/Effect-TS/effect-smol/pull/2373) [`7652aaa`](https://github.com/Effect-TS/effect-smol/commit/7652aaa3bdbc39f241fe58b54b9a43b713e22e12) Thanks @StarpTech! - Stream.fromReadableStream: swallow the `reader.cancel()` rejection in the finalizer. Cancelling the reader of an already-errored ReadableStream rejects with the stored error, which turned the typed `onError` failure into a defect.

- [#2371](https://github.com/Effect-TS/effect-smol/pull/2371) [`98630b7`](https://github.com/Effect-TS/effect-smol/commit/98630b7c8f679c352ba6796636c85688fa009d8d) Thanks @gcanti! - Emit `Schema.ObjectKeyword` as an object-or-array JSON Schema union.

- [#2376](https://github.com/Effect-TS/effect-smol/pull/2376) [`90ae23c`](https://github.com/Effect-TS/effect-smol/commit/90ae23cf07284da5e1bcd9dffa882e85df7e617b) Thanks @fubhy! - Add `Graph.successors` and `Graph.predecessors`, deprecate `Graph.neighborsDirected`, and fix graph algorithm edge cases around reversal, undirected edge queries, shortest-path weight validation, topological sort initials, and strongly connected components.

## 4.0.0-beta.79

### Patch Changes

- [#2364](https://github.com/Effect-TS/effect-smol/pull/2364) [`b9704dc`](https://github.com/Effect-TS/effect-smol/commit/b9704dc9de9f1649ad502371014fe869b69a49a3) Thanks @mikearnaldi! - Fix module-level side effects that defeated bundler tree-shaking.

  Bare top-level statements cannot be `#__PURE__`-annotated by the build, so
  bundlers must retain them and everything they reference, even in bundles that
  never use the code:
  - `Option`: the standalone `Object.defineProperty(SomeProto, "valueOrUndefined", ...)`
    statement anchored the whole `Option` proto chain into every bundle. It is
    now folded into the `SomeProto` initializer.
  - `Headers`: same pattern with `Object.defineProperties(Proto, ...)`, folded
    into the initializer.
  - `Logger`: module-level `process.stdout.isTTY` property reads (potential
    getters, never droppable) moved inside `consolePretty`.
  - `Utils`: when `internalCall` was unused, its dropped binding left behind a
    retained initializer tail (`standard`/`forced` probe with computed property
    reads). The selection is now wrapped in a single pure-annotated call.

  A minimal `Effect.succeed(123).pipe(Effect.runFork)` bundle shrinks by ~1.3%
  gzipped; bundles that don't use `Option` or `Headers` no longer pay for them.

- [#2339](https://github.com/Effect-TS/effect-smol/pull/2339) [`a207113`](https://github.com/Effect-TS/effect-smol/commit/a207113f66837bb54416926718a9a7d66774d079) Thanks @tim-smart! - Fix EntityManager defect restarts so in-flight requests are replayed instead of being dropped when the old entity scope is interrupted.

- [#2362](https://github.com/Effect-TS/effect-smol/pull/2362) [`5e9b9e2`](https://github.com/Effect-TS/effect-smol/commit/5e9b9e217b164ebfd4a002dd4380b3b1563200c3) Thanks @fubhy! - Fix Graph traversal and shortest-path algorithms to traverse undirected edges independently of their stored source/target orientation.

- [#2366](https://github.com/Effect-TS/effect-smol/pull/2366) [`7c128ae`](https://github.com/Effect-TS/effect-smol/commit/7c128aef458a1e2d224712e51c483c9badad1d44) Thanks @IMax153! - Fix string seed encoding in Random.withSeed so short, trailing, and astral UTF-8 bytes affect deterministic streams.

- [#2352](https://github.com/Effect-TS/effect-smol/pull/2352) [`0ada457`](https://github.com/Effect-TS/effect-smol/commit/0ada457c0513d8d908254ab77ebb7d29d2b523d6) Thanks @alvarosevilla95! - Fix the Redis `RateLimiterStore` token-bucket failing with opaque errors under memory pressure: it now writes its keys with a TTL and guards against a missing refill timestamp.

- [#2359](https://github.com/Effect-TS/effect-smol/pull/2359) [`d7cc5a2`](https://github.com/Effect-TS/effect-smol/commit/d7cc5a2bede3de10943aa0c6bdb4f26836a91efd) Thanks @gcanti! - Fix `Struct` key renaming and `Schema.encodeKeys` to support symbol keys, and reject duplicate encoded keys.

- [#2365](https://github.com/Effect-TS/effect-smol/pull/2365) [`aad63be`](https://github.com/Effect-TS/effect-smol/commit/aad63becf65e0a6b076e94f8973be7bbe7fbd46f) Thanks @gcanti! - Fix `Schema` encoding so container-level checks are validated against the decoded value instead of the encoded output.

  Disallow adding checks directly to `Schema.suspend(...)`; add the checks to the suspended schema instead.

  Fix `StructWithRest` so index signatures do not re-parse or overwrite fixed properties.

- [#2342](https://github.com/Effect-TS/effect-smol/pull/2342) [`09809f6`](https://github.com/Effect-TS/effect-smol/commit/09809f60f19ec98232f98b33e33e02ecb7e4fbd6) Thanks @gcanti! - Use generic ordered constraints for schema arbitrary derivation.

  Range checks such as `isGreaterThan`, `isLessThan`, and `isBetween` now populate `ctx.constraints.ordered`
  instead of type-specific range fields on `number`, `date`, or `bigint` constraints. Custom `toArbitrary`
  annotations that read range constraints should migrate to `ctx.constraints.ordered`.

  This also fixes BigDecimal arbitrary generation by adapting decimal bounds to the generated scale, avoiding
  invalid fast-check bigint ranges for narrow decimal intervals.

- [#2368](https://github.com/Effect-TS/effect-smol/pull/2368) [`2fddda5`](https://github.com/Effect-TS/effect-smol/commit/2fddda5311929f46b61e503f0ade4fc749e8c77d) Thanks @IMax153! - Encode HTTP API client path parameters when building request URLs.

- [#2348](https://github.com/Effect-TS/effect-smol/pull/2348) [`5f21768`](https://github.com/Effect-TS/effect-smol/commit/5f2176833399757c4500d8875b7f2fba0393de75) Thanks @gcanti! - Update Schema arbitrary derivation to use the new filter metadata, candidate generation, optional derivation reports, recursion-aware generation, and the renamed `OrderedConstraint<T>` model.

  Migration from the previous v4 API:
  - Replace filter annotations from `toArbitraryConstraint: constraint` to `arbitrary: { constraint }`. When a filter cannot be described as a constraint, use `arbitrary: { candidate }` to add a weighted source that is still checked by the filter.
  - Replace bucketed constraints with the flat `Schema.Annotations.ToArbitrary.Constraint` shape:
    - `string.minLength`, `array.minLength`, object property counts, collection sizes -> `minLength`
    - `string.maxLength`, `array.maxLength`, object property counts, collection sizes -> `maxLength`
    - `string.patterns` -> `patterns`
    - `number.isInteger` -> `integer`
    - `number.noNaN` -> `noNaN`
    - `number.noDefaultInfinity` -> `noInfinity`
    - `date.noInvalidDate` -> `valid`
    - `array.comparator` for uniqueness -> `unique` using Effect equality
    - `ordered.min` / `minExcluded` / `max` / `maxExcluded` -> `ordered.minimum` / `exclusiveMinimum` / `maximum` / `exclusiveMaximum`
  - In arbitrary hooks, read `context.constraint` instead of `context.constraints`. Replace `context.isSuspend` with `context.recursion`; when combining finite and recursive branches, pass `context.recursion` to `fc.oneof` with the finite branch first.
  - Generic declaration hooks now receive type parameters as `{ arbitrary, terminal }`. Atomic declarations may still return a bare `FastCheck.Arbitrary<T>`, but generic declarations should return `{ arbitrary, terminal }` when they can preserve a finite terminal branch.
  - `Schema.toArbitrary(schema, { report: true })` now returns `{ value, report }`; without `{ report: true }`, it keeps returning the arbitrary directly. `Schema.toArbitraryLazy` always returns a lazy arbitrary.

- [#2343](https://github.com/Effect-TS/effect-smol/pull/2343) [`f27003e`](https://github.com/Effect-TS/effect-smol/commit/f27003e00524ff83f20dd9909f62b2f8795efe03) Thanks @MohanedMashaly! - Add meta-var that shows log level and bash options in command line.

## 4.0.0-beta.78

### Patch Changes

- [#2333](https://github.com/Effect-TS/effect-smol/pull/2333) [`7836b8e`](https://github.com/Effect-TS/effect-smol/commit/7836b8eb8bb0f3e04cdf554ee070caccf74f00c1) Thanks @tim-smart! - Fix Schema.Defect JSON encoding for Error values whose message property is not a string.

- [#2329](https://github.com/Effect-TS/effect-smol/pull/2329) [`35d49a3`](https://github.com/Effect-TS/effect-smol/commit/35d49a3a09bdba6b513de87ddcead9e61a1042ba) Thanks @alvarosevilla95! - Retry Redis scripts after `NOSCRIPT` and declare the token bucket refill key

- [#2334](https://github.com/Effect-TS/effect-smol/pull/2334) [`4093258`](https://github.com/Effect-TS/effect-smol/commit/40932580e65bafab5f23c5f14b520cb411d0b2cd) Thanks @tim-smart! - clean up otlp config

## 4.0.0-beta.77

### Patch Changes

- [#2326](https://github.com/Effect-TS/effect-smol/pull/2326) [`6e9a5ca`](https://github.com/Effect-TS/effect-smol/commit/6e9a5ca62a61156fd67b2518ad3ab14ac0d25f23) Thanks @fubhy! - Prefer OTEL resource environment variables over explicit `OtlpResource.fromConfig` options.

- [#2325](https://github.com/Effect-TS/effect-smol/pull/2325) [`302f398`](https://github.com/Effect-TS/effect-smol/commit/302f3984ce206e35d86ddd99d3b72be144850a51) Thanks @fubhy! - Add OTEL environment variable configuration for unstable OTLP observability.

## 4.0.0-beta.76

### Patch Changes

- [#2320](https://github.com/Effect-TS/effect-smol/pull/2320) [`016108a`](https://github.com/Effect-TS/effect-smol/commit/016108a472af7048ddbbfd05f233e67529fafe12) Thanks @gcanti! - Add `Schema.isGUID` and update `Schema.isUUID` to accept the RFC 9562 max UUID.

- [#2319](https://github.com/Effect-TS/effect-smol/pull/2319) [`95c03d2`](https://github.com/Effect-TS/effect-smol/commit/95c03d2c55930668c215b5a41c23cf7742fead84) Thanks @fubhy! - Add support for configuring Scalar API reference pages with a custom fetch implementation.

- [#2318](https://github.com/Effect-TS/effect-smol/pull/2318) [`07299a3`](https://github.com/Effect-TS/effect-smol/commit/07299a33c09fd52faa9810d30835a2622c752386) Thanks @gcanti! - Replace the `Schema.Error` and `Schema.Defect` schema constants with constructor
  functions, `Schema.Error()` and `Schema.Defect()`.

  Unify `Schema.ErrorWithStack` into `Schema.Error({ includeStack: true })` and
  `Schema.DefectWithStack` into `Schema.Defect({ includeStack: true })`.

  Error causes are encoded by default using the same JSON defect encoding
  semantics used by `Schema.Defect`; pass `{ excludeCause: true }` to omit nested
  cause data.

  Equivalent `Schema.Error` and `Schema.Defect` options are canonicalized, so
  repeated constructor calls with the same option values reuse the same schema.

  `Schema.Defect()` now models defects as `unknown` values with a JSON encoded
  form. Error-shaped JSON objects with a string `message` decode to JavaScript
  `Error` values, so non-`Error` objects such as `{ message: "boom" }` do not
  round-trip unchanged. Other non-`Error` values are normalized through JSON
  serialization, with non-JSON values falling back to Effect's formatted string
  representation.

## 4.0.0-beta.75

### Patch Changes

- [#2294](https://github.com/Effect-TS/effect-smol/pull/2294) [`81b187c`](https://github.com/Effect-TS/effect-smol/commit/81b187c17a0d8817b58232826939154010ae49d7) Thanks @mattiamanzati! - Align workflow tags with RPCs by changing `Workflow.make` to accept the tag as its first argument, exposing workflow tags as `_tag`, and supporting `class MyWorkflow extends Workflow.make(...) {}`.

- [#2312](https://github.com/Effect-TS/effect-smol/pull/2312) [`ad4b535`](https://github.com/Effect-TS/effect-smol/commit/ad4b535e17f94ce35261829d5a3675f0a7808b4e) Thanks @gcanti! - Validate `Schema.StructWithRest` fixed fields against rest index signatures at the type level so schemas cannot be constructed with incompatible decoded, encoded, or make shapes. This keeps `StructWithRest` types sound and updates the generated OpenAI conversation-items request schema to keep accepting arbitrary additional fields under the stricter validation.

- [#2314](https://github.com/Effect-TS/effect-smol/pull/2314) [`a29c2e7`](https://github.com/Effect-TS/effect-smol/commit/a29c2e7e3570920156702671d6f3367cd0195f6c) Thanks @gcanti! - Preserve `Schema.Redacted` options when roundtripping through schema representations.
  This keeps `label` validation and `disallowJsonEncode` behavior intact when
  schemas are revived from a representation or emitted through code generation.

- [#2298](https://github.com/Effect-TS/effect-smol/pull/2298) [`1fdd9ae`](https://github.com/Effect-TS/effect-smol/commit/1fdd9aeed92b6bb70987c862e7f6f66ead0339b3) Thanks @gcanti! - Remove the `Types.MergeRecord` alias. Use `Types.MergeLeft` instead.

- [#2298](https://github.com/Effect-TS/effect-smol/pull/2298) [`1fdd9ae`](https://github.com/Effect-TS/effect-smol/commit/1fdd9aeed92b6bb70987c862e7f6f66ead0339b3) Thanks @gcanti! - Align Schema adapter failures: `Schema` result, promise, and sync adapters now surface `SchemaError`, while `SchemaParser` result, promise, and sync adapters expose `SchemaIssue.Issue`. Mark `SchemaParser` option adapters as internal because their error details are discarded.

- [#2313](https://github.com/Effect-TS/effect-smol/pull/2313) [`ffea4ec`](https://github.com/Effect-TS/effect-smol/commit/ffea4ecf2925f6a4c9fd13079d47584cbf2bed00) Thanks @MohanedMashaly! - Add -v alias for version flag

- [#2306](https://github.com/Effect-TS/effect-smol/pull/2306) [`4255c9b`](https://github.com/Effect-TS/effect-smol/commit/4255c9ba78bb98c7838fbe9dccdd8465e9da5427) Thanks @sam-goodwin! - Fix `HttpApiSecurity` bearer/http credential decoding

## 4.0.0-beta.74

### Patch Changes

- [#2295](https://github.com/Effect-TS/effect-smol/pull/2295) [`b1fc6a4`](https://github.com/Effect-TS/effect-smol/commit/b1fc6a4b4d0ca7fa9fd162799ae17c86f2f7ee8e) Thanks @jgoux! - Fix CLI parsing so command-local flags can override globals without breaking global flags before subcommands.

## 4.0.0-beta.73

### Patch Changes

- [#2291](https://github.com/Effect-TS/effect-smol/pull/2291) [`361ca30`](https://github.com/Effect-TS/effect-smol/commit/361ca30eb6e134feece547d6e00f82be4cb23f75) Thanks @tim-smart! - Add HttpApiSecurity.http for passing custom schemes

- [#2289](https://github.com/Effect-TS/effect-smol/pull/2289) [`b9598c6`](https://github.com/Effect-TS/effect-smol/commit/b9598c6a209e75bfdb87ee3b024ecd1e3923ff6e) Thanks @tim-smart! - make EntityResource lazy by default

## 4.0.0-beta.72

### Patch Changes

- [#2287](https://github.com/Effect-TS/effect-smol/pull/2287) [`73e67d1`](https://github.com/Effect-TS/effect-smol/commit/73e67d119a84d697773eaecb4865c6a71eb1a9cb) Thanks @tim-smart! - Ensure ClusterWorkflowEngine routes durable clock wakeups and registered workflow deferred completions through the owning workflow's shard group.

- [#2286](https://github.com/Effect-TS/effect-smol/pull/2286) [`01d71ec`](https://github.com/Effect-TS/effect-smol/commit/01d71ec5a75f3c2747a8d3b1ad9701d1e27b7ce5) Thanks @tim-smart! - Add default value support to `Prompt.file`.

- [#2285](https://github.com/Effect-TS/effect-smol/pull/2285) [`fcd707e`](https://github.com/Effect-TS/effect-smol/commit/fcd707e091a16e1b35343c901cc4052274e32239) Thanks @tim-smart! - Add default value support to CLI integer prompts.

## 4.0.0-beta.71

### Patch Changes

- [#2252](https://github.com/Effect-TS/effect-smol/pull/2252) [`d8ac76b`](https://github.com/Effect-TS/effect-smol/commit/d8ac76b5bad458c42cebe8a0c1b3843f955ac293) Thanks @tim-smart! - Added `Schedule.tap`, which allows observing full schedule metadata without altering schedule inputs or outputs.

- [#2261](https://github.com/Effect-TS/effect-smol/pull/2261) [`2c3c00a`](https://github.com/Effect-TS/effect-smol/commit/2c3c00af6faba7b7d422af26a7a2bbc35636d230) Thanks @gcanti! - Add JSON Schema custom annotation passthrough option, closes [#2260](https://github.com/Effect-TS/effect-smol/issues/2260)

- [#2269](https://github.com/Effect-TS/effect-smol/pull/2269) [`3751e7c`](https://github.com/Effect-TS/effect-smol/commit/3751e7cf353e7a54cd692c37401207d9afba1e63) Thanks @gcanti! - Schema: reintroduce `.value` on `Schema.Array` and `Schema.NonEmptyArray` for consistency with other collection wrappers (`Chunk`, `HashSet`, etc.), closes [#2268](https://github.com/Effect-TS/effect-smol/issues/2268).

- [#2272](https://github.com/Effect-TS/effect-smol/pull/2272) [`fc5f25b`](https://github.com/Effect-TS/effect-smol/commit/fc5f25b03ada5fc2431987768a74d3d3e75ca485) Thanks @gcanti! - Clarify that `Data.$is(tag)` only checks the `_tag` field, not the full structure, closes [#2271](https://github.com/Effect-TS/effect-smol/issues/2271).

- [#2257](https://github.com/Effect-TS/effect-smol/pull/2257) [`7ccced4`](https://github.com/Effect-TS/effect-smol/commit/7ccced42867c14c013b01160b3d292f14c05bd04) Thanks @bwbuchanan! - Fixed the `catch*` combinators silently dropping unhandled error types

- [#2263](https://github.com/Effect-TS/effect-smol/pull/2263) [`a2e1fe5`](https://github.com/Effect-TS/effect-smol/commit/a2e1fe5835c98c8ee4393a091b1d11b75126e349) Thanks @patroza! - Use `WeakMap` for `pendingBatches` instead of `Map`, to allow GC to collect resolvers

- [#2266](https://github.com/Effect-TS/effect-smol/pull/2266) [`4a4a36b`](https://github.com/Effect-TS/effect-smol/commit/4a4a36b10e6e616cad07584a43908f6a7e07e618) Thanks @gcanti! - Fix schema arbitrary constraints for exclusive BigInt, Date, and integer number bounds.

- [#2249](https://github.com/Effect-TS/effect-smol/pull/2249) [`d350292`](https://github.com/Effect-TS/effect-smol/commit/d3502922b4740fa9d745797cbc3775cb67839b6d) Thanks @tim-smart! - allow encoding Redacted by default, and add option to disallow encoding

- [#2276](https://github.com/Effect-TS/effect-smol/pull/2276) [`730afb6`](https://github.com/Effect-TS/effect-smol/commit/730afb66696adf9bd5a328cbca29df9c05968771) Thanks @tim-smart! - Fix AtomRef notifications when a listener re-subscribes itself during notification.

- [#2250](https://github.com/Effect-TS/effect-smol/pull/2250) [`df1b008`](https://github.com/Effect-TS/effect-smol/commit/df1b008f370f414c2a67a7b8139ef747af8e5fba) Thanks @tim-smart! - Fix `Argument.variadic(argument)` so it supports direct calls without options.

- [#2277](https://github.com/Effect-TS/effect-smol/pull/2277) [`6d469d5`](https://github.com/Effect-TS/effect-smol/commit/6d469d567a7c41d7e5343bdee21d45b07b0e8190) Thanks @tim-smart! - Fix string messages and annotations being double-quoted by simple and logfmt loggers.

## 4.0.0-beta.70

### Patch Changes

- [#2228](https://github.com/Effect-TS/effect-smol/pull/2228) [`af7782d`](https://github.com/Effect-TS/effect-smol/commit/af7782d3008d08b043f3a3f261516001514b2b4e) Thanks @avallete! - Add `Command.withHidden` to hide subcommands from `--help` output, shell completions, and "did you mean?" suggestions, while keeping them fully invocable by exact name.

  Useful for experimental or internal subcommands that should be accepted but not advertised on the public CLI surface.

  ```ts
  import { Command } from "effect/unstable/cli";

  const experimental = Command.make("experimental").pipe(Command.withHidden);

  const root = Command.make("mycli").pipe(
    Command.withSubcommands([experimental]),
  );
  ```

- [#2244](https://github.com/Effect-TS/effect-smol/pull/2244) [`7212d70`](https://github.com/Effect-TS/effect-smol/commit/7212d701a3eee7b3553ff502e2c066126e52e839) Thanks @tim-smart! - Fix TestClock adjustment when its layer is provided to programs run without an ambient Scope.

## 4.0.0-beta.69

### Patch Changes

- [#2227](https://github.com/Effect-TS/effect-smol/pull/2227) [`70ea04a`](https://github.com/Effect-TS/effect-smol/commit/70ea04aa96a2a7859d738d414e1f0e3ed081a27a) Thanks @avallete! - Add `Flag.withHidden` (and `Param.withHidden`) to hide flags from `--help` output and shell completions while keeping them fully parseable on the command line.

  Useful for experimental, internal, or deprecated flags that should be accepted but not advertised, e.g. `--experimental-foo`, debug toggles, or escape hatches that are not yet committed to the public CLI surface.

  ```ts
  import { Flag } from "effect/unstable/cli";

  const experimental = Flag.boolean("experimental-foo").pipe(Flag.withHidden);
  ```

- [#2240](https://github.com/Effect-TS/effect-smol/pull/2240) [`d0ea8b0`](https://github.com/Effect-TS/effect-smol/commit/d0ea8b03f7d73ae076c1db12666141e480d11178) Thanks @tim-smart! - pass workflow parent on discard

- [#2237](https://github.com/Effect-TS/effect-smol/pull/2237) [`a57674b`](https://github.com/Effect-TS/effect-smol/commit/a57674b64845e9e75a456cf907bfdcb858859118) Thanks @notkadez! - Fix `Stream.scoped` and `Channel.scoped` so pull effects run with the scoped resource scope.

- [#2239](https://github.com/Effect-TS/effect-smol/pull/2239) [`59aa334`](https://github.com/Effect-TS/effect-smol/commit/59aa334fbd0a504dda3c36f6d2ef1be7449b4b8b) Thanks @tim-smart! - fix RpcWorker Protocol service key

- [#2242](https://github.com/Effect-TS/effect-smol/pull/2242) [`8f4208e`](https://github.com/Effect-TS/effect-smol/commit/8f4208ee83bc7bdaa6793b5429847b45aab72470) Thanks @tim-smart! - Accept `.mjs` and `.mts` migration files in SQL migrator loaders.

## 4.0.0-beta.68

### Patch Changes

- [#2210](https://github.com/Effect-TS/effect-smol/pull/2210) [`af8267f`](https://github.com/Effect-TS/effect-smol/commit/af8267f2f3588c3fb611e9286f6f933f29ce1217) Thanks @tim-smart! - Add Stream.broadcastN for fixed-size stream broadcasts.

- [#2180](https://github.com/Effect-TS/effect-smol/pull/2180) [`0176eaf`](https://github.com/Effect-TS/effect-smol/commit/0176eaf3ecd7c1b99a10268f2af02d7e8ce161e5) Thanks @IMax153! - update Model uuid helpers

- [#2180](https://github.com/Effect-TS/effect-smol/pull/2180) [`0176eaf`](https://github.com/Effect-TS/effect-smol/commit/0176eaf3ecd7c1b99a10268f2af02d7e8ce161e5) Thanks @IMax153! - Add a platform-agnostic `Crypto` service for cryptographic random bytes, secure random generators, UUIDv4 / UUIDv7 generation, and digest operations. UUID generation should now use the `Crypto` service's `randomUUIDv4` or `randomUUIDv7`, which format bytes from the platform `Crypto` service; UUIDv7 also uses the `Clock` service timestamp. `Random.nextUUIDv4` has been removed because the base `Random` service is not cryptographically secure.

- [#2221](https://github.com/Effect-TS/effect-smol/pull/2221) [`f136bb7`](https://github.com/Effect-TS/effect-smol/commit/f136bb763048cbc6b17edd26496dba3e2415b9fa) Thanks @gcanti! - Change `Schema.asserts` and `SchemaParser.asserts` to assert a value directly with `asserts(schema, input)` and remove `Schema.Codec.ToAsserts`.

- [#2209](https://github.com/Effect-TS/effect-smol/pull/2209) [`6f38f07`](https://github.com/Effect-TS/effect-smol/commit/6f38f07d5941a211b251383aaab0f4f55e8a6557) Thanks @tim-smart! - Fix Channel.decodeText corrupting UTF-8 characters split across chunk boundaries.

- [#2207](https://github.com/Effect-TS/effect-smol/pull/2207) [`aec9c40`](https://github.com/Effect-TS/effect-smol/commit/aec9c401a53db227f18bf5e0c84db7130ad862d6) Thanks @tim-smart! - rename Model.Generated to Model.GeneratedByDb

## 4.0.0-beta.67

### Patch Changes

- [#2185](https://github.com/Effect-TS/effect-smol/pull/2185) [`a42ef66`](https://github.com/Effect-TS/effect-smol/commit/a42ef6632abbddfa820995ae310ccc84ae8d9b6f) Thanks @lloydrichards! - add rows to Terminal

- [#2111](https://github.com/Effect-TS/effect-smol/pull/2111) [`35594f8`](https://github.com/Effect-TS/effect-smol/commit/35594f811cafe471acd490114b103a1f8392c8d8) Thanks @thiagofelix! - Fix `EntityProxyServer.layerHttpApi` using `path.entityId` instead of `params.entityId`

- [#2201](https://github.com/Effect-TS/effect-smol/pull/2201) [`8bddd62`](https://github.com/Effect-TS/effect-smol/commit/8bddd628cb623f9533d345082583ff51cead6836) Thanks @sjh9714! - Fix `MutableList.filter` and `MutableList.remove` length updates.

- [#2181](https://github.com/Effect-TS/effect-smol/pull/2181) [`4be4c8d`](https://github.com/Effect-TS/effect-smol/commit/4be4c8d60862aa963869ee2ed9ffa048ffac0527) Thanks @zeyuri! - Fix workflow proxy RPC handlers to provide the context expected by RpcServer.

- [#2177](https://github.com/Effect-TS/effect-smol/pull/2177) [`0c9d3ab`](https://github.com/Effect-TS/effect-smol/commit/0c9d3ab43eb721a370ed8306260cbac218c27e87) Thanks @mikearnaldi! - Add forked memo maps so nested layer scopes can reuse parent allocations without leaking sibling-local layers. Update `@effect/vitest` to fork memo maps for nested `it.layer` suites, isolating sibling setup while preserving parent sharing.

- [#2206](https://github.com/Effect-TS/effect-smol/pull/2206) [`b156acc`](https://github.com/Effect-TS/effect-smol/commit/b156accd2691b4a051f823affdece7c39923ce85) Thanks @tim-smart! - add `availableShardGroups` to ShardingConfig, to ensure advisory locks do not conflict

- [#2184](https://github.com/Effect-TS/effect-smol/pull/2184) [`d16c034`](https://github.com/Effect-TS/effect-smol/commit/d16c03434ee3e6dcd3bfc82b65d99e881d89025b) Thanks @gcanti! - Restore support for passing schema parse options when creating decode and encode helpers, closes [#2174](https://github.com/Effect-TS/effect-smol/issues/2174).

- [#2176](https://github.com/Effect-TS/effect-smol/pull/2176) [`b559d68`](https://github.com/Effect-TS/effect-smol/commit/b559d68845f848a10153395778f035682d399075) Thanks @patroza! - Allow Schema decoding defaults to require Effect services.

  The `Effect` passed to `Schema.withDecodingDefault`, `Schema.withDecodingDefaultKey`, `Schema.withDecodingDefaultType`, and `Schema.withDecodingDefaultTypeKey` now accepts a context `R` in its third type parameter. The required services are propagated into the resulting schema's `DecodingServices`. `SchemaGetter.withDefault` is widened in the same way.

- [#2113](https://github.com/Effect-TS/effect-smol/pull/2113) [`a3de5d9`](https://github.com/Effect-TS/effect-smol/commit/a3de5d9215e5cc4a62e2666efbd7c1bf595eb84f) Thanks @patroza! - Allow Schema constructor and decoding defaults to fail with `SchemaError`.

  The `Effect` passed to `Schema.withConstructorDefault`, `Schema.withDecodingDefault`, `Schema.withDecodingDefaultKey`, `Schema.withDecodingDefaultType`, and `Schema.withDecodingDefaultTypeKey` now accepts `SchemaError` in its error channel. When a default fails, the parser unwraps the underlying `SchemaIssue.Issue` and propagates it as a parse failure with the surrounding path attached. This makes it easy to use another schema's `makeEffect` / `decode*` as the default value.

- [#2172](https://github.com/Effect-TS/effect-smol/pull/2172) [`7e6c12e`](https://github.com/Effect-TS/effect-smol/commit/7e6c12ec9b3a5945f6c26e272cc8f6390541ad3e) Thanks @gcanti! - Rename `SchemaParser.makeUnsafe` to `SchemaParser.make`.

- [#2167](https://github.com/Effect-TS/effect-smol/pull/2167) [`098167a`](https://github.com/Effect-TS/effect-smol/commit/098167a220fe07da6f14455818733ab1b269c9dd) Thanks @tim-smart! - update dependencies

## 4.0.0-beta.66

### Patch Changes

- [#2163](https://github.com/Effect-TS/effect-smol/pull/2163) [`ca2498e`](https://github.com/Effect-TS/effect-smol/commit/ca2498e702ac2d83fb7187707b7eb069bdb261a2) Thanks @tim-smart! - remove Effect.Yieldable

- [#2161](https://github.com/Effect-TS/effect-smol/pull/2161) [`cd7d1fb`](https://github.com/Effect-TS/effect-smol/commit/cd7d1fba7e2e2c5ac3ad64e1be433440a5bda436) Thanks @wking-io! - Fix request ID tracking in the RPC server HTTP protocol finalizer.

- [#2158](https://github.com/Effect-TS/effect-smol/pull/2158) [`19a7033`](https://github.com/Effect-TS/effect-smol/commit/19a703367ec817cffc41d152da9b594827408e2b) Thanks @ColaFanta! - Change `Type_<>` implementation, from using `Exclude<F, O | M>` type util to `keyof F as xx`, this implementation keeps IDE provenance link. This enables clicking "Go to definition (F12)" in VSCode on an object made from Schema Struct jumps to the correct Struct field definition.

- [#2153](https://github.com/Effect-TS/effect-smol/pull/2153) [`33d26b4`](https://github.com/Effect-TS/effect-smol/commit/33d26b4210b2e974f146a71e7eed962f8ce00900) Thanks @Gabrola! - Allow `HttpApiTest.groups` to accept an optional `baseUrl` override while preserving the existing default of `"http://localhost:3000"`.

- [#2160](https://github.com/Effect-TS/effect-smol/pull/2160) [`856766b`](https://github.com/Effect-TS/effect-smol/commit/856766b2c506aaed6d2df1d63bf3a5b1b062e1d4) Thanks @tim-smart! - Remove the auto-incrementing suffix from HTTP server logger log span names.

- [#2164](https://github.com/Effect-TS/effect-smol/pull/2164) [`079c7df`](https://github.com/Effect-TS/effect-smol/commit/079c7df82559bb9ce10a86dffb85d25e6ce07dc3) Thanks @tim-smart! - Add the unstable workflow DurableQueue module.

## 4.0.0-beta.65

### Patch Changes

- [#2148](https://github.com/Effect-TS/effect-smol/pull/2148) [`6f11454`](https://github.com/Effect-TS/effect-smol/commit/6f11454a9b6c3bd00f6b35fd7af14a2f2d63a0a2) Thanks @tim-smart! - Add `UniqueViolation` as a new SQL error reason. Supported unique constraint violations now classify as `UniqueViolation` instead of the broader `ConstraintError` reason.

  This covers PostgreSQL, PGlite, MySQL, MSSQL, and the shared SQLite classification used by the SQLite-family clients. `UniqueViolation.constraint` contains the best available constraint, index, or key identifier and falls back to exactly `"unknown"` when no reliable identifier is available.

## 4.0.0-beta.64

### Patch Changes

- [#2137](https://github.com/Effect-TS/effect-smol/pull/2137) [`7d4877a`](https://github.com/Effect-TS/effect-smol/commit/7d4877a1929cdb690280ea254326c04f2ec97ea5) Thanks @tim-smart! - Add optional soft delete column support to SqlModel repositories and resolvers.

## 4.0.0-beta.63

### Patch Changes

- [#2136](https://github.com/Effect-TS/effect-smol/pull/2136) [`7f927ff`](https://github.com/Effect-TS/effect-smol/commit/7f927ffb7a9801dcfc4096c29e369d13d65cd0ac) Thanks @tim-smart! - add HttpApiTest module

- [#2123](https://github.com/Effect-TS/effect-smol/pull/2123) [`a696b3e`](https://github.com/Effect-TS/effect-smol/commit/a696b3e83a8504cdbe261a18c10a1cc0619ae102) Thanks @lewxdev! - add `Effect.acquireDisposable`

## 4.0.0-beta.62

### Patch Changes

- [#2131](https://github.com/Effect-TS/effect-smol/pull/2131) [`4ab4b90`](https://github.com/Effect-TS/effect-smol/commit/4ab4b9007dc27a52ffabc6fcb37c96eeec795bf7) Thanks @tim-smart! - Allow Kubernetes pod condition `lastTransitionTime` values to be null in K8sHttpClient schemas.

## 4.0.0-beta.61

### Patch Changes

- [#2130](https://github.com/Effect-TS/effect-smol/pull/2130) [`50790af`](https://github.com/Effect-TS/effect-smol/commit/50790af9b190c38d10fb0723837d49b66432638f) Thanks @tim-smart! - Record fiber runtime start metrics when fibers are constructed so yielded fibers are only counted once.

- [#2120](https://github.com/Effect-TS/effect-smol/pull/2120) [`71f7c3d`](https://github.com/Effect-TS/effect-smol/commit/71f7c3df997deda92c84146d569696dab3bd645c) Thanks @tim-smart! - Port `Effect.firstSuccessOf` from Effect v3.

- [#2122](https://github.com/Effect-TS/effect-smol/pull/2122) [`aae8797`](https://github.com/Effect-TS/effect-smol/commit/aae8797b9cb383be0c182dd58d03d787c354238b) Thanks @tim-smart! - fix empty body decoding in HttpApiBuilder

## 4.0.0-beta.60

### Patch Changes

- [#2115](https://github.com/Effect-TS/effect-smol/pull/2115) [`f69d567`](https://github.com/Effect-TS/effect-smol/commit/f69d5675dcff9f4137295752baf066b7153fdc09) Thanks @tim-smart! - add Rpc.custom

- [#2119](https://github.com/Effect-TS/effect-smol/pull/2119) [`7909c95`](https://github.com/Effect-TS/effect-smol/commit/7909c954b8f6244a35a4b429f8dd0dff45dad620) Thanks @gcanti! - Remove `Inspectable.stringifyCircular` and fix `Formatter.formatJson` so shared object references are preserved while only circular references are omitted.

- [`bbb4dcc`](https://github.com/Effect-TS/effect-smol/commit/bbb4dcc6c406b83a416b4ad3541cc02037c420e4) Thanks @tim-smart! - allow using Duration.Input with accessors

- [#2117](https://github.com/Effect-TS/effect-smol/pull/2117) [`7af2207`](https://github.com/Effect-TS/effect-smol/commit/7af2207901eabf3132c1b7010a69b3899c06fbbe) Thanks @gcanti! - Add `Schema.DurationFromString` and `SchemaTransformation.durationFromString`, support `"Infinity"` and `"-Infinity"` in `Duration.fromInput`, and simplify config duration parsing around the shared schema codec, closes [#2092](https://github.com/Effect-TS/effect-smol/issues/2092).

- [#2116](https://github.com/Effect-TS/effect-smol/pull/2116) [`848b40a`](https://github.com/Effect-TS/effect-smol/commit/848b40a4bd4bf54a5098617d50c33c88eee8270a) Thanks @gcanti! - Add a `Config.literals` convenience constructor for `Schema.Literals`, closes [#2091](https://github.com/Effect-TS/effect-smol/issues/2091).

## 4.0.0-beta.59

### Patch Changes

- [#2106](https://github.com/Effect-TS/effect-smol/pull/2106) [`56837ea`](https://github.com/Effect-TS/effect-smol/commit/56837ea2a338395b35550641374e9e589bd8b71d) Thanks @IMax153! - Fix entity proxy RPC handlers to provide the context expected by RpcServer.

## 4.0.0-beta.58

### Patch Changes

- [#2097](https://github.com/Effect-TS/effect-smol/pull/2097) [`11993d4`](https://github.com/Effect-TS/effect-smol/commit/11993d4934c66f5dc611b8bbf553f01d501ef8f7) Thanks @Leka74! - Add an exhaustive finalizer to the AsyncResult builder.

- [#2098](https://github.com/Effect-TS/effect-smol/pull/2098) [`96c8b22`](https://github.com/Effect-TS/effect-smol/commit/96c8b22c2057ccddbf10ed269d7697f22119b3ec) Thanks @tim-smart! - generate binary arrays from streams with less copying

- [#2098](https://github.com/Effect-TS/effect-smol/pull/2098) [`96c8b22`](https://github.com/Effect-TS/effect-smol/commit/96c8b22c2057ccddbf10ed269d7697f22119b3ec) Thanks @tim-smart! - improve http body consumption

## 4.0.0-beta.57

### Patch Changes

- [#2085](https://github.com/Effect-TS/effect-smol/pull/2085) [`a971f5c`](https://github.com/Effect-TS/effect-smol/commit/a971f5cbd92dfe4274420bf0966595eb35531060) Thanks @tim-smart! - add Effect.abortSignal

- [#2088](https://github.com/Effect-TS/effect-smol/pull/2088) [`8e110c5`](https://github.com/Effect-TS/effect-smol/commit/8e110c5f02a429ccc43a91df8678e402138c0851) Thanks @tim-smart! - ensure each sql client gets a unique transaction service

## 4.0.0-beta.56

## 4.0.0-beta.55

### Patch Changes

- [#2081](https://github.com/Effect-TS/effect-smol/pull/2081) [`42cc744`](https://github.com/Effect-TS/effect-smol/commit/42cc744570968deb365fb46d47b53d3277050c93) Thanks @gcanti! - Export the `Schema.encodeKeys` interface, closes [#2070](https://github.com/Effect-TS/effect-smol/issues/2070).

  Previously the interface was internal, so exporting a value whose inferred type referenced it triggered TypeScript error `TS4023: Exported variable has or is using name 'encodeKeys' from external module ... but cannot be named`, e.g.:

- [#2067](https://github.com/Effect-TS/effect-smol/pull/2067) [`04855ce`](https://github.com/Effect-TS/effect-smol/commit/04855ceeca4d40c55a5750dd9893b691f8ea741a) Thanks @mrazauskas! - fix `isNullish()` type predicate

## 4.0.0-beta.54

### Patch Changes

- [#2078](https://github.com/Effect-TS/effect-smol/pull/2078) [`e4b74f9`](https://github.com/Effect-TS/effect-smol/commit/e4b74f9c01a0e9b6cd58416de4af3a26d51da7c8) Thanks @tim-smart! - add Socket.make

- [#2075](https://github.com/Effect-TS/effect-smol/pull/2075) [`4c72808`](https://github.com/Effect-TS/effect-smol/commit/4c728081851c66dacf889a816535671bc841ae96) Thanks @tim-smart! - ensure workflow failures are not squashed by suspension interrupts

## 4.0.0-beta.53

### Patch Changes

- [#2068](https://github.com/Effect-TS/effect-smol/pull/2068) [`0768509`](https://github.com/Effect-TS/effect-smol/commit/07685094e931af07d104165195826a535b55fa7e) Thanks @tim-smart! - Fix `AtomHttpApi` query and mutation error inference to include endpoint middleware and client middleware errors, matching `HttpApiClient` behavior (including response-only mutation mode).

- [#2062](https://github.com/Effect-TS/effect-smol/pull/2062) [`476aede`](https://github.com/Effect-TS/effect-smol/commit/476aede69c6efa06b5781ca5eb3e3b128ca29141) Thanks @aldotestino! - Fix `HttpIncomingMessage.schemaBodyJson` to forward parse options via the `parseOptions` annotation key.

- [#2074](https://github.com/Effect-TS/effect-smol/pull/2074) [`4f79c54`](https://github.com/Effect-TS/effect-smol/commit/4f79c542e7b508c235ff485d862cc8b29a8260c5) Thanks @tim-smart! - fix Latch.release

- [#2069](https://github.com/Effect-TS/effect-smol/pull/2069) [`4be6a7c`](https://github.com/Effect-TS/effect-smol/commit/4be6a7cf35dab2a01d652f56dd35f0358c5a7e88) Thanks @mikearnaldi! - Fix `TestClock.currentTimeNanosUnsafe()` to floor fractional millisecond instants before converting them to `BigInt`.

- [#2065](https://github.com/Effect-TS/effect-smol/pull/2065) [`88927eb`](https://github.com/Effect-TS/effect-smol/commit/88927ebb896162cdba103b36553280b58e0facac) Thanks @tim-smart! - add Effectable module

## 4.0.0-beta.52

### Patch Changes

- [#2057](https://github.com/Effect-TS/effect-smol/pull/2057) [`8e04bfc`](https://github.com/Effect-TS/effect-smol/commit/8e04bfc95554b74eac205d67a20388e056b21499) Thanks @tim-smart! - add HttpApiSchemaError for determining where a schema error originates from

- [#2055](https://github.com/Effect-TS/effect-smol/pull/2055) [`cf3a311`](https://github.com/Effect-TS/effect-smol/commit/cf3a311d863a8abb818840c3b80f847e621c43c1) Thanks @tim-smart! - ensure tagged enum \_tag is correctly set

- [#2057](https://github.com/Effect-TS/effect-smol/pull/2057) [`8e04bfc`](https://github.com/Effect-TS/effect-smol/commit/8e04bfc95554b74eac205d67a20388e056b21499) Thanks @tim-smart! - make HttpApi schema errors defects unless transformed

- [#2058](https://github.com/Effect-TS/effect-smol/pull/2058) [`131fdd5`](https://github.com/Effect-TS/effect-smol/commit/131fdd5b1f26531e265fe1a08f002002f47c276e) Thanks @tim-smart! - mcp http request with no session header is 404 response

## 4.0.0-beta.51

### Patch Changes

- [#2049](https://github.com/Effect-TS/effect-smol/pull/2049) [`778d2af`](https://github.com/Effect-TS/effect-smol/commit/778d2afe9b5154bc1f9abae46d93ea7e54c87344) Thanks @bohdanbirdie! - Add `RpcSerialization.makeMsgPack` for creating MessagePack serialization with custom msgpackr options. On Cloudflare Workers with `allow_eval_during_startup` (default for `compatibility_date >= 2025-06-01`), pass `{ useRecords: false }` to prevent msgpackr's JIT code generation via `new Function()`, which is blocked during request handling. Also fixes silent error swallowing in the `msgPack` decode path — non-incomplete errors are now rethrown instead of returning `[]`.

- [#2010](https://github.com/Effect-TS/effect-smol/pull/2010) [`4e24dcf`](https://github.com/Effect-TS/effect-smol/commit/4e24dcf75037f65eebc1eb68623bc7cbf9d5512a) Thanks @tim-smart! - process schema properties / elements concurrently

- [#2052](https://github.com/Effect-TS/effect-smol/pull/2052) [`4b1c015`](https://github.com/Effect-TS/effect-smol/commit/4b1c0150e9bdb5559ed32d250deb66e17b4240c7) Thanks @gcanti! - Schema: expand `FilterOutput` and add `FilterIssue` for richer filter failures.

  The return type of a `Schema.makeFilter` predicate now supports two additional shapes:
  - `{ path, issue }` where `issue` is `string | SchemaIssue.Issue` (previously only `{ path, message: string }` was accepted). The `issue` arm lets you attach a fully-formed `Issue` at a nested path without manually constructing a `Pointer`.
  - `ReadonlyArray<Schema.FilterIssue>` to report several failures at once. An empty array is success, a single-element array is equivalent to returning that element, and multi-entry arrays are grouped into an `Issue.Composite`. This removes the need to import `SchemaIssue` and hand-build a `Composite` for multi-field validators.

  The single-failure shapes (`undefined`, `true`, `false`, `string`, `SchemaIssue.Issue`) are unchanged.

  **Breaking**: the object shape renamed from `{ path, message }` to `{ path, issue }`. Call sites that used the old shape must rename the field; the migration is mechanical.

  ```ts
  // before
  Schema.makeFilter((o) => ({ path: ["a"], message: "bad" }));

  // after
  Schema.makeFilter((o) => ({ path: ["a"], issue: "bad" }));
  ```

  Also renamed `{ path, message }` to `{ path, issue }` in the accepted return type of `SchemaGetter.checkEffect`.

- [#2047](https://github.com/Effect-TS/effect-smol/pull/2047) [`454f8ad`](https://github.com/Effect-TS/effect-smol/commit/454f8adad822929c3ef60f8280d0987226b049fd) Thanks @gcanti! - Fix `SchemaAST.isJson` rejecting DAGs as cycles, closes [#2021](https://github.com/Effect-TS/effect-smol/issues/2021).

  The previous implementation marked every visited object in a single `seen` set and never removed it, so any value that referenced the same object through two different paths (a DAG, e.g. `{ x: shared, y: shared }`) was treated as a cycle and returned `false`. Cycle detection now tracks only the current recursion path (popping on exit) and memoizes fully validated subtrees, so DAGs are accepted while true cycles are still rejected.

- [#2051](https://github.com/Effect-TS/effect-smol/pull/2051) [`6754a0c`](https://github.com/Effect-TS/effect-smol/commit/6754a0cd18626b06805a079cc5265525a5eb7d27) Thanks @tim-smart! - disable sql traces for EventLog, RunnerStorage

- [#2053](https://github.com/Effect-TS/effect-smol/pull/2053) [`90f7fd5`](https://github.com/Effect-TS/effect-smol/commit/90f7fd5243871b30980964135db4512b8119fa82) Thanks @tim-smart! - remove use of bigint literals

- [#2046](https://github.com/Effect-TS/effect-smol/pull/2046) [`d7e1519`](https://github.com/Effect-TS/effect-smol/commit/d7e151974934201fd93fa4c8a1192ee9a5d965a0) Thanks @gcanti! - Remove the `options` parameter from `OpenApi.fromApi`.

  The parameter only carried `additionalProperties`, but the function caches results in a `WeakMap` keyed solely on the `api` instance. Passing different options across calls for the same api was silently ignored, making the parameter order-dependent and effectively single-shot. No call sites were using it, so the signature is now simply `fromApi(api)`.

- [#2044](https://github.com/Effect-TS/effect-smol/pull/2044) [`72a8122`](https://github.com/Effect-TS/effect-smol/commit/72a81228e09782bae512f7d041bbfbc78bc668d0) Thanks @tim-smart! - ensure envelope payloads are correctly encoded for notify path

## 4.0.0-beta.50

### Patch Changes

- [#2038](https://github.com/Effect-TS/effect-smol/pull/2038) [`07be594`](https://github.com/Effect-TS/effect-smol/commit/07be594825de60f8e1b2102d21dbb9b8fc63b414) Thanks @tim-smart! - add support for deferred responses in rpc

- [#2040](https://github.com/Effect-TS/effect-smol/pull/2040) [`ae02433`](https://github.com/Effect-TS/effect-smol/commit/ae02433103ce28f53a0c9bfb4a44e75773289b7b) Thanks @tim-smart! - require a option to make AtomRpc.query atoms serializatable

## 4.0.0-beta.49

### Patch Changes

- [#2035](https://github.com/Effect-TS/effect-smol/pull/2035) [`7d87873`](https://github.com/Effect-TS/effect-smol/commit/7d8787340ff549370f6f2a88b612e9ebbfd6ba45) Thanks @tim-smart! - Add support for common HTTP status string literals in `HttpApiSchema.status` (for example, `HttpApiSchema.status("Created")` resolves to status code `201`).

- [#2036](https://github.com/Effect-TS/effect-smol/pull/2036) [`c2f6f90`](https://github.com/Effect-TS/effect-smol/commit/c2f6f901b200a6e515b4f02c93ce8005b7bbf1c5) Thanks @tim-smart! - add RpcGroup.omit

- [#2034](https://github.com/Effect-TS/effect-smol/pull/2034) [`216f13c`](https://github.com/Effect-TS/effect-smol/commit/216f13c1fce454a21b489bb915714a17e791a1ac) Thanks @IMax153! - Fix issue with exported CLI `Completions` types

## 4.0.0-beta.48

### Patch Changes

- [#2025](https://github.com/Effect-TS/effect-smol/pull/2025) [`4da56ec`](https://github.com/Effect-TS/effect-smol/commit/4da56ecff129b2da40137ffede23a73cc4e532d8) Thanks @tim-smart! - update dependencies

- [#2029](https://github.com/Effect-TS/effect-smol/pull/2029) [`a5e6f77`](https://github.com/Effect-TS/effect-smol/commit/a5e6f774bab195cf50ecdc818240765f69a3bf4a) Thanks @tim-smart! - omit scope from HttpApi handlers

- [#2023](https://github.com/Effect-TS/effect-smol/pull/2023) [`f1ba5b8`](https://github.com/Effect-TS/effect-smol/commit/f1ba5b8584d325a541156928cecf041b37fd5070) Thanks @tim-smart! - EventLog Identity string encodes to base 64

- [#2023](https://github.com/Effect-TS/effect-smol/pull/2023) [`f1ba5b8`](https://github.com/Effect-TS/effect-smol/commit/f1ba5b8584d325a541156928cecf041b37fd5070) Thanks @tim-smart! - disable tracer propagation for otlp exporter

## 4.0.0-beta.47

### Patch Changes

- [#2017](https://github.com/Effect-TS/effect-smol/pull/2017) [`c584726`](https://github.com/Effect-TS/effect-smol/commit/c58472674e750e6938df955044eab88feda95e45) Thanks @gcanti! - Schema: add `annotateEncoded` function for annotating the encoded side of a schema.

- [#2013](https://github.com/Effect-TS/effect-smol/pull/2013) [`86a91a4`](https://github.com/Effect-TS/effect-smol/commit/86a91a4f0c59286dfa9393232d8020dea70ed4db) Thanks @gcanti! - Schema: add withDecodingDefaultTypeKey / withDecodingDefaultType, closes #2012

- [#2018](https://github.com/Effect-TS/effect-smol/pull/2018) [`131caf9`](https://github.com/Effect-TS/effect-smol/commit/131caf9525151a0cb29803a8f1dffa0f4f479d12) Thanks @gcanti! - Schema: allow `Class` constructors to accept `void` when all fields are optional, closes #2015.

- [#2016](https://github.com/Effect-TS/effect-smol/pull/2016) [`c3615c8`](https://github.com/Effect-TS/effect-smol/commit/c3615c88379b9daf252df0db72c6ac5a20326406) Thanks @gcanti! - Schema: rename `"~rebuild.out"` to `"Rebuild"`

## 4.0.0-beta.46

### Patch Changes

- [#2008](https://github.com/Effect-TS/effect-smol/pull/2008) [`3a30b9e`](https://github.com/Effect-TS/effect-smol/commit/3a30b9e2ec2bd8b8193e1aa139f6878a07e3f5ee) Thanks @tim-smart! - fix eventlog skipping entries

## 4.0.0-beta.45

### Patch Changes

- [#1883](https://github.com/Effect-TS/effect-smol/pull/1883) [`5c3af6d`](https://github.com/Effect-TS/effect-smol/commit/5c3af6d554f60be34f8fc21d598d9a298ae11beb) Thanks @tim-smart! - Add EventLogServerUnencrypted module

## 4.0.0-beta.44

### Patch Changes

- [#1943](https://github.com/Effect-TS/effect-smol/pull/1943) [`e3f0621`](https://github.com/Effect-TS/effect-smol/commit/e3f0621454c3f5d11070d30619da27c9232cadc1) Thanks @gcanti! - Add `DateFromString`, `BigIntFromString`, `BigDecimalFromString`, `TimeZoneNamedFromString`, `TimeZoneFromString`, and `DateTimeZonedFromString` schemas, closes #1941.

- [#1996](https://github.com/Effect-TS/effect-smol/pull/1996) [`5b476ab`](https://github.com/Effect-TS/effect-smol/commit/5b476abc0bd7e9bb59135ea1bcad2e4936227ced) Thanks @gcanti! - Schema: add `StringFromBase64`, `StringFromBase64Url`, `StringFromHex`, and `StringFromUriComponent` schemas for decoding encoded strings into UTF-8 strings, closes #1995.

- [#1952](https://github.com/Effect-TS/effect-smol/pull/1952) [`6b40e5a`](https://github.com/Effect-TS/effect-smol/commit/6b40e5a4a6bd2087c15a3d7374d25057fdedfa16) Thanks @tim-smart! - Effect.repeat now uses effect return value when using options

- [#1961](https://github.com/Effect-TS/effect-smol/pull/1961) [`7bb5dce`](https://github.com/Effect-TS/effect-smol/commit/7bb5dce60e1d904ef049a0287dec2b2e6113c970) Thanks @IMax153! - Rename Atom's `Context` type to `AtomContext`

- [#1975](https://github.com/Effect-TS/effect-smol/pull/1975) [`3b09fb3`](https://github.com/Effect-TS/effect-smol/commit/3b09fb31c40c2802b01f21c23bcdd1fe7fb0aa82) Thanks @tim-smart! - catch defects when building Entity handlers

- [#2000](https://github.com/Effect-TS/effect-smol/pull/2000) [`2370410`](https://github.com/Effect-TS/effect-smol/commit/237041062e5af4594d32db91597e34e70a632877) Thanks @tim-smart! - fix cache constructor inference by moving the lookup option

- [#1928](https://github.com/Effect-TS/effect-smol/pull/1928) [`dabc272`](https://github.com/Effect-TS/effect-smol/commit/dabc272444a700eb629c07ba3e77671a841ca86e) Thanks @tim-smart! - Add `schema.makeEffect(input, options?)` to `Schema.Bottom` and schema-backed classes, matching the existing constructor behavior exposed by `makeUnsafe` / `makeOption` while returning an `Effect` failure with `Schema.SchemaError`.

- [#1949](https://github.com/Effect-TS/effect-smol/pull/1949) [`08b63c3`](https://github.com/Effect-TS/effect-smol/commit/08b63c3df11bd35c9fd6090dbd166287fdc40664) Thanks @tim-smart! - Update the unstable HTTP middleware logger to annotate only the request path in `http.url` instead of including the full URL (query / fragment), and add a regression test.

- [#1962](https://github.com/Effect-TS/effect-smol/pull/1962) [`dfff04c`](https://github.com/Effect-TS/effect-smol/commit/dfff04c4c2b1d352dfad83992a6dce1280c85cf9) Thanks @tim-smart! - Add `KeyValueStore.layerSql` to back key-value storage with a SQL database via `SqlClient`.

- [#1963](https://github.com/Effect-TS/effect-smol/pull/1963) [`9baed9e`](https://github.com/Effect-TS/effect-smol/commit/9baed9e17e84702e6e480fcef6f86404f9e24be9) Thanks @tim-smart! - Fix `Unify.unify` so Layer unions merge correctly, and add type tests covering Layer unification.

- [#2004](https://github.com/Effect-TS/effect-smol/pull/2004) [`7846792`](https://github.com/Effect-TS/effect-smol/commit/7846792adc7e1631d62d26d657bd7ba6139f369b) Thanks @tim-smart! - Fix `Stream.toQueue` types and implementation to return a `Queue.Dequeue` in both overloads and delegate to `Channel.toQueueArray`.

- [#1974](https://github.com/Effect-TS/effect-smol/pull/1974) [`1556a24`](https://github.com/Effect-TS/effect-smol/commit/1556a247623636b7ebe438fb56d77f1a7bf957bb) Thanks @juliusmarminge! - Fix unstable CLI boolean flags so `Flag.optional(Flag.boolean(...))` returns `Option.none()` when omitted, and support canonical `--no-<flag>` negation for boolean flags.

- [#1980](https://github.com/Effect-TS/effect-smol/pull/1980) [`7c11bc2`](https://github.com/Effect-TS/effect-smol/commit/7c11bc292ab8e46252fe8f7576fb685917bfb8b5) Thanks @tim-smart! - fix Entity.keepAlive

- [#1929](https://github.com/Effect-TS/effect-smol/pull/1929) [`b5ea591`](https://github.com/Effect-TS/effect-smol/commit/b5ea5913ec1d45d0dd12a327b9dd966bda2f6d02) Thanks @gcanti! - Simplify and align the default-value APIs.

  `Schema.withConstructorDefault` now accepts an `Effect<T>` instead of `(o: Option<undefined>) => Option<T> | Effect<Option<T>>`.

  `Schema.withDecodingDefault` / `Schema.withDecodingDefaultKey` now accept an `Effect<T>` instead of `() => T`, enabling effectful defaults.

  `SchemaGetter.withDefault` follows the same change, accepting `Effect<T>` instead of `() => T`.

- [#1966](https://github.com/Effect-TS/effect-smol/pull/1966) [`0853afa`](https://github.com/Effect-TS/effect-smol/commit/0853afaeb1633b2d7f8b66893bd01c3aa1ef2c22) Thanks @gcanti! - Reuse existing references when duplicate identifiers have the same representation, closes #1927.

- [#1942](https://github.com/Effect-TS/effect-smol/pull/1942) [`ac845f3`](https://github.com/Effect-TS/effect-smol/commit/ac845f3ab40e0b8719576e7f9bc16ea2e0e02cd4) Thanks @gcanti! - Fix `ErrorClass` and `TaggedErrorClass` `toString` to match native `Error` output format (e.g. `E: my message` instead of `E({"message":"my message"})`), closes #1940.

  Also fix prototype properties (e.g. `name`) being lost after `.extend()`.

- [#1956](https://github.com/Effect-TS/effect-smol/pull/1956) [`b80c462`](https://github.com/Effect-TS/effect-smol/commit/b80c46247480f47bb64fc480fab48a3f37bc8888) Thanks @gcanti! - Add `Schema.resolveAnnotationsKey` API to retrieve the context (key-level) annotations from a schema, closes #1947.

  Also rename `Schema.resolveInto` to `Schema.resolveAnnotations`.

- [#2005](https://github.com/Effect-TS/effect-smol/pull/2005) [`b3f535d`](https://github.com/Effect-TS/effect-smol/commit/b3f535d9a7ac13b5fb984c29f93561c57a081ff0) Thanks @gcanti! - Fix `Stream.splitLines` to correctly handle standalone `\r` as a line terminator and flush the final unterminated line when the stream ends, closes #2002.

- [#1936](https://github.com/Effect-TS/effect-smol/pull/1936) [`6fe2e93`](https://github.com/Effect-TS/effect-smol/commit/6fe2e93cc2f1b173ef89651d74b6a5d2626b3226) Thanks @IMax153! - Fix `Stream.groupedWithin` dropping partial batches when the upstream ends or goes idle.

- [#1981](https://github.com/Effect-TS/effect-smol/pull/1981) [`cda8004`](https://github.com/Effect-TS/effect-smol/commit/cda800451c1ffbdddfc08415aed7b2d91e0412ee) Thanks @tim-smart! - add rpc ConnectionHooks

- [#1965](https://github.com/Effect-TS/effect-smol/pull/1965) [`8335477`](https://github.com/Effect-TS/effect-smol/commit/8335477a8a936a24b5f3ee6203c1b268bd1bfc3c) Thanks @tim-smart! - return resolvers directly from SqlModel.makeResolvers

- [#1960](https://github.com/Effect-TS/effect-smol/pull/1960) [`8c836f9`](https://github.com/Effect-TS/effect-smol/commit/8c836f99ab1e896b9580a71d67773625baff2eaf) Thanks @IMax153! - Add `ChildProcessHandle.unref`, returning an `Effect` that restores the child process reference when run.

- [#1984](https://github.com/Effect-TS/effect-smol/pull/1984) [`718ff6f`](https://github.com/Effect-TS/effect-smol/commit/718ff6fe3e3d3820cefd67d2bff1b2224fe08060) Thanks @jannabiforever! - Make `Effect.retry` with `times` argument to propagate the original error.

- [#1930](https://github.com/Effect-TS/effect-smol/pull/1930) [`7eed84f`](https://github.com/Effect-TS/effect-smol/commit/7eed84fc33c5781a6fb11bf4fd189d424902ebd4) Thanks @mikearnaldi! - Add `Stream.service` and `Stream.serviceOption` for accessing services as single-element streams.

- [#1935](https://github.com/Effect-TS/effect-smol/pull/1935) [`5df46fe`](https://github.com/Effect-TS/effect-smol/commit/5df46fe2f654d59ab5fc1578f4fc27fa40368ef9) Thanks @gcanti! - Schema: add `asClass` API to turn any schema into a class with static method support.

  **Example**

  ```ts
  import { Schema } from "effect";

  class MyString extends Schema.asClass(Schema.String) {
    static readonly decodeUnknownSync = Schema.decodeUnknownSync(this);
  }

  MyString.decodeUnknownSync("a"); // "a"
  ```

- [#1958](https://github.com/Effect-TS/effect-smol/pull/1958) [`82dd0f2`](https://github.com/Effect-TS/effect-smol/commit/82dd0f26c6442b07143762ef7bc33742d3978dd6) Thanks @gcanti! - Schema: add `MissingSelfGeneric` compile-time error for `Class`, `TaggedClass`, `ErrorClass`, and `TaggedErrorClass` when the `Self` type parameter is omitted.

- [#1957](https://github.com/Effect-TS/effect-smol/pull/1957) [`03ae41e`](https://github.com/Effect-TS/effect-smol/commit/03ae41e7304cffac9f18feea22b73468feafc43a) Thanks @gcanti! - Schema: remove `"~annotate.in"` type from `Bottom` interface, inlining it where needed

- [#1951](https://github.com/Effect-TS/effect-smol/pull/1951) [`4677a0a`](https://github.com/Effect-TS/effect-smol/commit/4677a0a58f95eea38a211efcd3f345f237a9e44a) Thanks @gcanti! - Rename `Schema.makeUnsafe` instance method back to `Schema.make` on all schemas and schema-backed classes.

  Also remove the `static readonly make` override from `ShardId` to avoid conflicting with the inherited schema `make` method. The module-level `ShardId.make(group, id)` function is still available.

- [#1999](https://github.com/Effect-TS/effect-smol/pull/1999) [`87e1fc8`](https://github.com/Effect-TS/effect-smol/commit/87e1fc8b67e4901d75f567b2fecc3841ab762cc4) Thanks @tim-smart! - use NoInfer in Layer constructors to prevent type erasure

- [#1971](https://github.com/Effect-TS/effect-smol/pull/1971) [`c1af1b7`](https://github.com/Effect-TS/effect-smol/commit/c1af1b756f63291e9c0298cf95c98a6920a0c2a0) Thanks @joepjoosten! - Allow unstable CLI fallback prompts to be created dynamically from an `Effect`.

- [#1961](https://github.com/Effect-TS/effect-smol/pull/1961) [`7bb5dce`](https://github.com/Effect-TS/effect-smol/commit/7bb5dce60e1d904ef049a0287dec2b2e6113c970) Thanks @IMax153! - Rename the `ServiceMap` module to `Context` across exports, docs, and tests.

- [#1973](https://github.com/Effect-TS/effect-smol/pull/1973) [`c8a877b`](https://github.com/Effect-TS/effect-smol/commit/c8a877b53e8f29616335719e5dd1c3992dddf780) Thanks @joepjoosten! - Underline the active label in CLI multi-select prompts and add a scratchpad example for manual verification.

- [#1967](https://github.com/Effect-TS/effect-smol/pull/1967) [`7da961a`](https://github.com/Effect-TS/effect-smol/commit/7da961ae4916229d2246699a5d3b20e5b2dd2020) Thanks @tim-smart! - clean up ShardId

## 4.0.0-beta.43

### Patch Changes

- [#1904](https://github.com/Effect-TS/effect-smol/pull/1904) [`2ae33d0`](https://github.com/Effect-TS/effect-smol/commit/2ae33d050914915f7cb9c25ab0a020901e08d596) Thanks @juliusmarminge! - Fix JSON-RPC serialization for `id` values that are falsey but valid, including `0` and `""`, while still mapping `null` to Effect's internal notification sentinel.

- [#1900](https://github.com/Effect-TS/effect-smol/pull/1900) [`979811a`](https://github.com/Effect-TS/effect-smol/commit/979811a4c3f7ed21ed18ef560c49fb7f5569e80e) Thanks @tim-smart! - Fix AI structured output schema generation for `Schema.Class` and `Schema.ErrorClass` by resolving top-level `$ref` entries before passing JSON Schema to providers and default codec transformers.

- [#1908](https://github.com/Effect-TS/effect-smol/pull/1908) [`eb7dbef`](https://github.com/Effect-TS/effect-smol/commit/eb7dbeffa883386ad912815e62c0820cac1fdf8e) Thanks @tim-smart! - Fix stream requests in Entity.toLayerQueue

- [#1907](https://github.com/Effect-TS/effect-smol/pull/1907) [`cf50eb4`](https://github.com/Effect-TS/effect-smol/commit/cf50eb49cb04706dae5185f624708117c413dee8) Thanks @tim-smart! - add WorkflowEngine interruptUnsafe

- [#1903](https://github.com/Effect-TS/effect-smol/pull/1903) [`1d046fe`](https://github.com/Effect-TS/effect-smol/commit/1d046fe484560e23f3e22cb23eec6433f8f1fa02) Thanks @kitlangton! - Add `Layer.suspend` as a lazy constructor for dynamically choosing a layer while preserving normal layer sharing.

## 4.0.0-beta.42

### Patch Changes

- [#1897](https://github.com/Effect-TS/effect-smol/pull/1897) [`924e216`](https://github.com/Effect-TS/effect-smol/commit/924e216caa7e0bbf22e994a0cd2ce8b1f0f0b3ee) Thanks @IMax153! - Append concrete choice values to CLI flag help descriptions so generated help shows valid command-line inputs.

- [#1894](https://github.com/Effect-TS/effect-smol/pull/1894) [`80e7f0c`](https://github.com/Effect-TS/effect-smol/commit/80e7f0cd9116e811e97b0ce30a77a8d1ecd072aa) Thanks @tim-smart! - Fix `MutableList.appendAll` / `appendAllUnsafe` so empty arrays are treated as a no-op instead of leaving behind an empty internal bucket.

- [#1895](https://github.com/Effect-TS/effect-smol/pull/1895) [`f8328bf`](https://github.com/Effect-TS/effect-smol/commit/f8328bf0314da3dc7f31d314f94a5840e8d5217f) Thanks @tim-smart! - Changed socket close handling so all close codes are treated as errors by default unless `closeCodeIsError` is overridden.

- [#1899](https://github.com/Effect-TS/effect-smol/pull/1899) [`66d1c06`](https://github.com/Effect-TS/effect-smol/commit/66d1c06039079129707a230f7ad8c676439d7133) Thanks @gcanti! - SchemaRepresentation: support `anyOf`/`oneOf` with sibling keywords in `fromJsonSchemaMultiDocument`

- [#1893](https://github.com/Effect-TS/effect-smol/pull/1893) [`bee800b`](https://github.com/Effect-TS/effect-smol/commit/bee800bf285192a01bec72a7b7b51bc1159434e6) Thanks @gcanti! - `Number.remainder`: fix incorrect results for small floats in scientific notation (e.g. `1e-7`).

- [#1898](https://github.com/Effect-TS/effect-smol/pull/1898) [`8930441`](https://github.com/Effect-TS/effect-smol/commit/8930441dee6f94c59c583d18d3ebd677cf1f2623) Thanks @mikearnaldi! - Rename `Effect.transaction` to `Effect.tx` and `Effect.retryTransaction` to `Effect.txRetry`, remove `Effect.transactionWith` / `Effect.withTxState`, make nested `Effect.tx` calls compose into the active transaction, and make the public `Tx*` APIs establish atomic transactions without requiring `Transaction` in common usage.

## 4.0.0-beta.41

### Patch Changes

- [#1881](https://github.com/Effect-TS/effect-smol/pull/1881) [`36f5c21`](https://github.com/Effect-TS/effect-smol/commit/36f5c2174d31ab42c4598bf81f178f40d0802283) Thanks @gcanti! - Added `BigDecimal.sumAll` and `BigDecimal.multiplyAll` for feature parity with `Number` and `BigInt`, closes #1880.

- [#1869](https://github.com/Effect-TS/effect-smol/pull/1869) [`d8ce758`](https://github.com/Effect-TS/effect-smol/commit/d8ce758669d6297ae932ac3251d83e7b49b22f30) Thanks @gcanti! - Schema: collapse same-type literal branches in JSON Schema output into a single `enum` array, closes #1868.

  Before:

  ```json
  {
    "anyOf": [
      { "type": "string", "enum": ["A"] },
      { "type": "string", "enum": ["B"] }
    ]
  }
  ```

  After:

  ```json
  {
    "type": "string",
    "enum": ["A", "B"]
  }
  ```

- [#1879](https://github.com/Effect-TS/effect-smol/pull/1879) [`11aab4c`](https://github.com/Effect-TS/effect-smol/commit/11aab4c6d37d5691adafc2d33da1a631b28ce814) Thanks @tim-smart! - Highlight active option labels in `Prompt.select` and `Prompt.multiSelect` using cyan text so selection state is visible beyond the pointer / checkbox icon.

- [#1884](https://github.com/Effect-TS/effect-smol/pull/1884) [`3bc1efb`](https://github.com/Effect-TS/effect-smol/commit/3bc1efb53dd75b4a40de46f1f80c7f8a7d50af86) Thanks @tim-smart! - Fail RpcClient HTTP requests when the server response contains no RPC messages instead of leaving requests pending.

- [#1875](https://github.com/Effect-TS/effect-smol/pull/1875) [`70e724e`](https://github.com/Effect-TS/effect-smol/commit/70e724e604604d4be1061cd8da0d360494998c84) Thanks @IMax153! - Fix AI text method toolkit typing to support generic handler toolkits, preserve toolkit union inference, and keep response part narrowing by tool name.

- [#1876](https://github.com/Effect-TS/effect-smol/pull/1876) [`738dee7`](https://github.com/Effect-TS/effect-smol/commit/738dee7edfd70af82dc4d2376db3a8ebe603eb48) Thanks @tim-smart! - Track ManagedRuntime fibers in a scope

- [#1886](https://github.com/Effect-TS/effect-smol/pull/1886) [`2111963`](https://github.com/Effect-TS/effect-smol/commit/2111963f19b4c28c800664a8fac9590c1321885f) Thanks @tim-smart! - add ClusterSchema.WithTransaction annotation

- [#1877](https://github.com/Effect-TS/effect-smol/pull/1877) [`198a553`](https://github.com/Effect-TS/effect-smol/commit/198a553d9ce45f6a00bfc4d65ed0640669602d95) Thanks @tim-smart! - allow Context.Key to be covariant

## 4.0.0-beta.40

### Patch Changes

- [#1863](https://github.com/Effect-TS/effect-smol/pull/1863) [`f62860f`](https://github.com/Effect-TS/effect-smol/commit/f62860f0e5e45978fabf7256ae620a13152a772a) Thanks @tim-smart! - fix issues with metro bundler

- [#1866](https://github.com/Effect-TS/effect-smol/pull/1866) [`973f281`](https://github.com/Effect-TS/effect-smol/commit/973f2812529aadc1cc54598b2039799fa72b80f8) Thanks @tim-smart! - add Stream.timeoutOrElse

## 4.0.0-beta.39

### Patch Changes

- [#1844](https://github.com/Effect-TS/effect-smol/pull/1844) [`f91fd3d`](https://github.com/Effect-TS/effect-smol/commit/f91fd3db39fe5628439fd175fba201a65a1aa9d0) Thanks @tim-smart! - Relax `HttpApiClient.urlBuilder` to accept `HttpApi.Any` instead of requiring `HttpApi.AnyWithProps`.
  This allows use in helpers generic over `HttpApi.Any` while preserving inferred URL builder types.

- [#1851](https://github.com/Effect-TS/effect-smol/pull/1851) [`edaae9d`](https://github.com/Effect-TS/effect-smol/commit/edaae9d65f464f941d7eddd723cd33d324f4b071) Thanks @tim-smart! - Re-export additional core runtime references from `effect/References`, including logger and error reporter references.

- [#1856](https://github.com/Effect-TS/effect-smol/pull/1856) [`b47db0b`](https://github.com/Effect-TS/effect-smol/commit/b47db0bd5802064b6a24b3ea27c6ff2e0520d513) Thanks @gcanti! - Fix `Struct` utility return types (for example `pick`) to preserve the previous simplified shape instead of exposing raw utility types like `Pick<T, K>`, closes #1855.

- [#1849](https://github.com/Effect-TS/effect-smol/pull/1849) [`82d3c8e`](https://github.com/Effect-TS/effect-smol/commit/82d3c8e4f3f49b00df611b25aa6f8f74ec21b59b) Thanks @tim-smart! - Fix the `Queue.takeN` documentation example to end the queue before showing a partial batch.

- [#1848](https://github.com/Effect-TS/effect-smol/pull/1848) [`7c22b31`](https://github.com/Effect-TS/effect-smol/commit/7c22b315d198dcbf44ae8cdb8b37879e1c9e3996) Thanks @tim-smart! - Remove `Schedule.compose` in favor of `Schedule.both`, and update schedule examples to use `Schedule.both`.

## 4.0.0-beta.38

### Patch Changes

- [#1842](https://github.com/Effect-TS/effect-smol/pull/1842) [`f4dbe5b`](https://github.com/Effect-TS/effect-smol/commit/f4dbe5b26b9c2d33fae024bf44afbdf8541792cd) Thanks @gcanti! - Schema: rename `MakeOptions.disableValidation` to `disableChecks`. Apply constructor defaults when `disableChecks` is true, closes #1841.

- [#1837](https://github.com/Effect-TS/effect-smol/pull/1837) [`a71a607`](https://github.com/Effect-TS/effect-smol/commit/a71a607c89fb6669a12a562c2c23be81dfbe1adb) Thanks @kitlangton! - Fix `HttpApiBuilder` security middleware caching so separate handler builds do not reuse the first provided middleware implementation.

- [#1840](https://github.com/Effect-TS/effect-smol/pull/1840) [`66a0494`](https://github.com/Effect-TS/effect-smol/commit/66a0494ed75cd12f2721dcbb1d8a072e3d9e14b6) Thanks @tim-smart! - Rename HttpApiClient request option `withResponse` to `responseMode` and add support for `responseMode: "response-only"` to return the raw `HttpClientResponse` without decoding.

- [#1838](https://github.com/Effect-TS/effect-smol/pull/1838) [`5ef7218`](https://github.com/Effect-TS/effect-smol/commit/5ef7218fc559d57301fe929b8a0cab4033f4f1fd) Thanks @tim-smart! - Update `HttpApiClient.urlBuilder` to mirror client shape, and encode params/query via endpoint schemas before building URLs.

- [#1700](https://github.com/Effect-TS/effect-smol/pull/1700) [`472d260`](https://github.com/Effect-TS/effect-smol/commit/472d260655bc311fba5c2c6e23bb77d8f7e36ba0) Thanks @tim-smart! - add `useCodecs` option to HttpClientEndpoint constructors

## 4.0.0-beta.37

### Patch Changes

- [#1812](https://github.com/Effect-TS/effect-smol/pull/1812) [`f7a0b71`](https://github.com/Effect-TS/effect-smol/commit/f7a0b711da8fdd645597dee29cacc5619c6afcf2) Thanks @tim-smart! - Consolidate the SqlError changes to the new reason-based shape across effect and the SQL drivers, classifying native failures into structured reasons with Unknown fallback where native codes are unavailable.

- [#1816](https://github.com/Effect-TS/effect-smol/pull/1816) [`1e223c3`](https://github.com/Effect-TS/effect-smol/commit/1e223c30ccf835dfbb21284535d78549efaeca80) Thanks @tim-smart! - unstable/http HttpClientRequest: add toWeb and fromWeb conversions for web Request objects

- [#1829](https://github.com/Effect-TS/effect-smol/pull/1829) [`53740f4`](https://github.com/Effect-TS/effect-smol/commit/53740f47aa76d114b7d535649fb50efc54a09608) Thanks @tim-smart! - Fix sql migrator lock handling to only treat duplicate migration-row inserts as a concurrent migration lock.

- [#1831](https://github.com/Effect-TS/effect-smol/pull/1831) [`8c7cf89`](https://github.com/Effect-TS/effect-smol/commit/8c7cf89f719e580cbce1bf6c24e6996f1992a0a6) Thanks @tim-smart! - Fix `Schedule.fixed` to run the next iteration immediately when the previous action takes longer than the configured interval.

- [#1833](https://github.com/Effect-TS/effect-smol/pull/1833) [`b6b81a9`](https://github.com/Effect-TS/effect-smol/commit/b6b81a940eaafcbc792d25413d6c02c707de31b2) Thanks @tim-smart! - Fix `Unify.unify` so unions of `Effect` values collapse to a single unified `Effect` type again.

- [#1825](https://github.com/Effect-TS/effect-smol/pull/1825) [`8f4c1f9`](https://github.com/Effect-TS/effect-smol/commit/8f4c1f97ed60f8810b0b327b50117ffb2d8260d4) Thanks @skoshx! - Fix DevToolsClient not flushing final span events on teardown.

  The stream consumer was `forkScoped`, causing it to be interrupted before
  it could drain remaining queue items. Replaced with `forkChild` and
  `Fiber.await` in the finalizer so the stream drains naturally after the
  queue is failed.

- [#1824](https://github.com/Effect-TS/effect-smol/pull/1824) [`f2479f9`](https://github.com/Effect-TS/effect-smol/commit/f2479f9d3113b1f012db17a3852b4e28f478cf9c) Thanks @tim-smart! - Ignore unsupported Ctrl key combinations in interactive CLI prompts to avoid rendering control characters such as Ctrl+L form feed into prompt input.

- [#1819](https://github.com/Effect-TS/effect-smol/pull/1819) [`c919921`](https://github.com/Effect-TS/effect-smol/commit/c9199217fad65529421d2cf95ecfff41257090fd) Thanks @j! - HttpServerResponse: fix `fromWeb` to preserve Content-Type header when response has a body

  Previously, when converting a web `Response` to an `HttpServerResponse` via `fromWeb`, the `Content-Type` header was not passed to `Body.stream()`, causing it to default to `application/octet-stream`. This affected any code using `HttpApp.fromWebHandler` to wrap web handlers, as JSON responses would incorrectly have their Content-Type set to `application/octet-stream` instead of `application/json`.

- [#1821](https://github.com/Effect-TS/effect-smol/pull/1821) [`7af90c2`](https://github.com/Effect-TS/effect-smol/commit/7af90c2e3c99038eafa39650433839523790e2fe) Thanks @gcanti! - Schema: relax `asserts` and `is` constraints.

- [#1822](https://github.com/Effect-TS/effect-smol/pull/1822) [`f3be185`](https://github.com/Effect-TS/effect-smol/commit/f3be18569e5ca57c25eabf00df3ca601ebab43c7) Thanks @tim-smart! - improve runSync error when executing async effects

## 4.0.0-beta.36

### Patch Changes

- [#1793](https://github.com/Effect-TS/effect-smol/pull/1793) [`60fcbcc`](https://github.com/Effect-TS/effect-smol/commit/60fcbcc43d09471e8f7e0969955d99dcefc5be81) Thanks @tim-smart! - Ensure streamed tool results are emitted before the finish part so chat history includes tool outputs before stream termination.

- [#1762](https://github.com/Effect-TS/effect-smol/pull/1762) [`0a60837`](https://github.com/Effect-TS/effect-smol/commit/0a6083713124440e630030375bab367e8d7df24e) Thanks @kitlangton! - Allow unstable HttpApi middleware to declare multiple error schemas with arrays.

  Middleware errors now follow endpoint error behavior for response status resolution, client decoding, and generated API schemas.

- [#1805](https://github.com/Effect-TS/effect-smol/pull/1805) [`49164d2`](https://github.com/Effect-TS/effect-smol/commit/49164d2c20a8d21b66514992c4a15d8521f6b36e) Thanks @tim-smart! - Fix `Effect.cachedWithTTL` and `Effect.cachedInvalidateWithTTL` to start TTL expiration when the cached value is produced instead of when computation starts.

- [#1808](https://github.com/Effect-TS/effect-smol/pull/1808) [`334b6e4`](https://github.com/Effect-TS/effect-smol/commit/334b6e4f76fe11941b516d61f57e268bc31f0ca6) Thanks @tim-smart! - Backport `Cron.prev` with reverse lookup tables and cron stepping logic, including DST-aware reverse traversal.

- [#1789](https://github.com/Effect-TS/effect-smol/pull/1789) [`5700695`](https://github.com/Effect-TS/effect-smol/commit/5700695f76ae6da6b94c9c87d4dd2b8054fb829b) Thanks @mikearnaldi! - Fix `Stream.scanEffect` hanging and repeatedly emitting the initial state.

- [#1810](https://github.com/Effect-TS/effect-smol/pull/1810) [`f8f4456`](https://github.com/Effect-TS/effect-smol/commit/f8f445644f3aa7ec093cab7445198a62ba18a480) Thanks @tim-smart! - Support key-derived `idleTimeToLive` in `LayerMap` options (`make`, `fromRecord`, and `LayerMap.Service`) and add `LayerMap` tests for dynamic TTL behavior.

- [#1802](https://github.com/Effect-TS/effect-smol/pull/1802) [`969d24f`](https://github.com/Effect-TS/effect-smol/commit/969d24fdfa48c4838e811983848d9cb4e9b3b12c) Thanks @kitlangton! - PubSub.publish and PubSub.publishAll now return false on shutdown instead of interrupting, matching Queue.offer semantics.

- [#1796](https://github.com/Effect-TS/effect-smol/pull/1796) [`851eda0`](https://github.com/Effect-TS/effect-smol/commit/851eda0533946e39bacaaf581896320d7a4f3e8c) Thanks @tim-smart! - Improve `Prompt.file` to support incremental filtering while typing, including backspace and ctrl-u handling.

- [#1806](https://github.com/Effect-TS/effect-smol/pull/1806) [`8059c1c`](https://github.com/Effect-TS/effect-smol/commit/8059c1c3eba9a90af7cd889ea261bcb8fff0c185) Thanks @tim-smart! - Fix a regression in `PubSub.shutdown` so shutting down a pubsub interrupts suspended subscribers (including `takeAll`) by ensuring subscriptions are scoped under the pubsub shutdown scope.

- [#1797](https://github.com/Effect-TS/effect-smol/pull/1797) [`6f83295`](https://github.com/Effect-TS/effect-smol/commit/6f8329546a73eaddc7cb5e85ea8e37e73fbfb611) Thanks @tim-smart! - Add \`Ctrl-A\` and \`Ctrl-E\` key handling for editable CLI text prompts to move the cursor to the beginning or end of the current input line.

- [#1633](https://github.com/Effect-TS/effect-smol/pull/1633) [`65f7f57`](https://github.com/Effect-TS/effect-smol/commit/65f7f5737575fed668987462c96d29a446707c32) Thanks @kitlangton! - Schema: add `decodeUnknownResult` / `decodeResult` and `encodeUnknownResult` / `encodeResult` helpers for synchronous `Result`-based parsing.

- [#1798](https://github.com/Effect-TS/effect-smol/pull/1798) [`e7fabd2`](https://github.com/Effect-TS/effect-smol/commit/e7fabd2265db690eae5cfc9b83730c84699aef61) Thanks @gcanti! - Schema: allow using `Struct` type helpers directly, e.g. `Schema.Struct.Type<F>` instead of `Schema.Schema.Type<Schema.Struct<F>>`.

- [#1794](https://github.com/Effect-TS/effect-smol/pull/1794) [`89c3e98`](https://github.com/Effect-TS/effect-smol/commit/89c3e985401eb38f33a3ae21a94ad27de3c1d28b) Thanks @tim-smart! - Fix ai LanguageModel streaming finish parts so finish events are always emitted when a toolkit is provided.

- [#1785](https://github.com/Effect-TS/effect-smol/pull/1785) [`53794ab`](https://github.com/Effect-TS/effect-smol/commit/53794ab7af30aa5c5004ecf53659fafbe4b10542) Thanks @KhraksMamtsov! - add missing Equivalence.Date

## 4.0.0-beta.35

### Patch Changes

- [#1782](https://github.com/Effect-TS/effect-smol/pull/1782) [`9252b43`](https://github.com/Effect-TS/effect-smol/commit/9252b43560f507709c2985abcf52a7837b23ddf8) Thanks @gcanti! - Add `Schema.ArrayEnsure`.

- [#1784](https://github.com/Effect-TS/effect-smol/pull/1784) [`7daf387`](https://github.com/Effect-TS/effect-smol/commit/7daf3870a656882a488a60f67881e6808c8f4d04) Thanks @gcanti! - Add `Config.Success` type utility, closes #1783.

- [#1778](https://github.com/Effect-TS/effect-smol/pull/1778) [`e1664a3`](https://github.com/Effect-TS/effect-smol/commit/e1664a38bc31ef4ceb4e9324c7226e1e99bf9c07) Thanks @tim-smart! - Allow `Effect.acquireRelease` release finalizers to depend on the surrounding environment.

- [#1777](https://github.com/Effect-TS/effect-smol/pull/1777) [`fdaa6e0`](https://github.com/Effect-TS/effect-smol/commit/fdaa6e0a41b6b6605438fa8557441792135380a2) Thanks @tim-smart! - Remove an unreachable array branch in `decodeJsonRpcRaw` to simplify JSON-RPC decode logic without changing behavior.

- [#1774](https://github.com/Effect-TS/effect-smol/pull/1774) [`19aa47e`](https://github.com/Effect-TS/effect-smol/commit/19aa47ef7b470e427620edca8970dd9cdd551216) Thanks @tim-smart! - Align CLI help flag and global flag descriptions to a single column even when some flag names are very long.

- [#1780](https://github.com/Effect-TS/effect-smol/pull/1780) [`c667dad`](https://github.com/Effect-TS/effect-smol/commit/c667dad07777b860e4764a3ba9a6cc41c236cd98) Thanks @tim-smart! - Fix `LanguageModel` incremental prompt fallback to reliably retry with the full prompt when an incremental request fails with `InvalidRequestError`.

- [#1781](https://github.com/Effect-TS/effect-smol/pull/1781) [`764d150`](https://github.com/Effect-TS/effect-smol/commit/764d1501bc5026b60fc8aef6cb02a5a87c762801) Thanks @gcanti! - Fix `DateTime.makeUnsafe` incorrectly appending "Z" to date strings containing "GMT"

- [#1772](https://github.com/Effect-TS/effect-smol/pull/1772) [`3c27098`](https://github.com/Effect-TS/effect-smol/commit/3c27098b5685a63db2c2eff654a250c94d3fcfa7) Thanks @tim-smart! - make Layer.mock work with Stream and Channel

## 4.0.0-beta.34

### Patch Changes

- [#1758](https://github.com/Effect-TS/effect-smol/pull/1758) [`f2f75ee`](https://github.com/Effect-TS/effect-smol/commit/f2f75ee564bce1cd95f5189c7bdeeed4f92dacb1) Thanks @tim-smart! - Use a normal Map in ResponseIdTracker and clear it on divergence / reset instead of reallocating a WeakMap.

- [#1764](https://github.com/Effect-TS/effect-smol/pull/1764) [`342fc4b`](https://github.com/Effect-TS/effect-smol/commit/342fc4b051739e32e7977159f26ff9541eda664f) Thanks @tim-smart! - Add unstable EmbeddingModel support across core and OpenAI providers.
  - Add the unstable EmbeddingModel module API surface in `effect`, including service, request, response, and provider types.
  - Implement the unstable EmbeddingModel runtime constructor in `effect`, with `RequestResolver` batching, `embed` / `embedMany` spans, provider error propagation, deterministic ordering, and empty-input `embedMany` fast-path behavior.
  - Add and align EmbeddingModel behavior tests in `effect` for embedding usage, batching, ordering, and error handling.
  - Add `OpenAiEmbeddingModel` in `@effect/ai-openai`, including model / make / layer constructors, config overrides, and provider output index validation with deterministic reordering.
  - Add OpenAI-compatible EmbeddingModel provider support in `@effect/ai-openai-compat`, including config overrides, layer constructors, and output index validation.

- [#1766](https://github.com/Effect-TS/effect-smol/pull/1766) [`5d704ee`](https://github.com/Effect-TS/effect-smol/commit/5d704ee10d20e8eb107e34bb8a21feb5aa4a7685) Thanks @tim-smart! - Fix JSDoc wording for `Effect.catch` to consistently reference the current API name.

- [#1771](https://github.com/Effect-TS/effect-smol/pull/1771) [`00add69`](https://github.com/Effect-TS/effect-smol/commit/00add69b59551e9df34772eb927638b093f6d71e) Thanks @tim-smart! - Add `EmbeddingModel.ModelDimensions` and require dimensions in embedding provider `model` constructors.

- [#1767](https://github.com/Effect-TS/effect-smol/pull/1767) [`58217d3`](https://github.com/Effect-TS/effect-smol/commit/58217d318a7d716ccd707cce0f41573946939c28) Thanks @gcanti! - Add `isMutableHashMap` and `isMutableHashSet`, and align nominal guard implementations and tests across collections and transactional data types.

- [#1765](https://github.com/Effect-TS/effect-smol/pull/1765) [`f4e2aba`](https://github.com/Effect-TS/effect-smol/commit/f4e2aba01b76d1e3059b297e3cc942284dfeafb2) Thanks @tim-smart! - retry incremental prompt on invalid request

- [#1756](https://github.com/Effect-TS/effect-smol/pull/1756) [`e3b44b6`](https://github.com/Effect-TS/effect-smol/commit/e3b44b6a2af9ee21dc5c1e928f0c20af857fa7a9) Thanks @tim-smart! - add HttpApiMiddleware.layerSchemaErrorTransform

- [#1732](https://github.com/Effect-TS/effect-smol/pull/1732) [`e1472b7`](https://github.com/Effect-TS/effect-smol/commit/e1472b7525c5d57a48bdec2353c3b742f7f916c0) Thanks @KhraksMamtsov! - port Url module from v3

- [#1761](https://github.com/Effect-TS/effect-smol/pull/1761) [`7686320`](https://github.com/Effect-TS/effect-smol/commit/7686320cd123fa352b5c3d076fb18a3cac0a9bba) Thanks @gcanti! - Fix `Tool.make` type and runtime behavior when `parameters` is not provided.

## 4.0.0-beta.33

### Patch Changes

- [#1754](https://github.com/Effect-TS/effect-smol/pull/1754) [`571447d`](https://github.com/Effect-TS/effect-smol/commit/571447da67334449f8ae3d6ecb3d77ea4e0c4295) Thanks @tim-smart! - narrow types for Effect.retry/repeat while option

## 4.0.0-beta.32

### Patch Changes

- [#1717](https://github.com/Effect-TS/effect-smol/pull/1717) [`bf8fff8`](https://github.com/Effect-TS/effect-smol/commit/bf8fff8a5f54b6df74cb7bbb42346fe9ba52435a) Thanks @gcanti! - Schema: add `OptionFromOptionalNullOr` schema, closes #1707.

- [#1722](https://github.com/Effect-TS/effect-smol/pull/1722) [`1af3ef3`](https://github.com/Effect-TS/effect-smol/commit/1af3ef3e3ca7fd417d0fc15f8ca8fe207eba4f74) Thanks @tim-smart! - Fix `RpcSerialization.json` decode so JSON array payloads are not wrapped in an extra outer array.

- [#1725](https://github.com/Effect-TS/effect-smol/pull/1725) [`27fea0f`](https://github.com/Effect-TS/effect-smol/commit/27fea0f66910de5905f40fd63f8ddbb6f7ac5aba) Thanks @tim-smart! - Improve unstable HttpApi runtime failures for missing server middleware and missing group implementations.
  - HttpApiBuilder.applyMiddleware now resolves middleware services via Context.getUnsafe, so missing middleware fails with a clear "Service not found: <middleware>" error instead of an opaque is not a function TypeError.
  - HttpApiBuilder.layer now reports missing groups with actionable context (group identifier, service key, suggested HttpApiBuilder.group(...) call, and available group keys).
  - Added regression tests in packages/platform/node/test/HttpApi.test.ts covering:
    - addHttpApi + API-level middleware applied across merged groups
    - missing middleware service diagnostics
    - missing addHttpApi group layer diagnostics

- [#1727](https://github.com/Effect-TS/effect-smol/pull/1727) [`2ad6c1b`](https://github.com/Effect-TS/effect-smol/commit/2ad6c1b2c85a3a0fe351e3d56636a75eb76b4b4e) Thanks @tim-smart! - Make all built-in `HttpApiError` classes implement `HttpServerRespondable`, so they can be returned directly from plain HTTP server handlers outside of `HttpApi`.

- [#1739](https://github.com/Effect-TS/effect-smol/pull/1739) [`398ac3e`](https://github.com/Effect-TS/effect-smol/commit/398ac3e01cb75efce0e4e2913d1450cf65866732) Thanks @tim-smart! - Use predicate-based `dual` dispatch for `Stream.merge` so data-last calls with optional `options` are handled correctly.

- [#1741](https://github.com/Effect-TS/effect-smol/pull/1741) [`51fe22f`](https://github.com/Effect-TS/effect-smol/commit/51fe22f3266e417b6c541aaed4b75d246fac91e7) Thanks @tim-smart! - Add `Layer.tap`, `Layer.tapError`, and `Layer.tapCause` APIs for effectful observation of layer success and failure without changing layer outputs.

- [#1740](https://github.com/Effect-TS/effect-smol/pull/1740) [`4605db6`](https://github.com/Effect-TS/effect-smol/commit/4605db69cfacddbdbf1525865ddfde135158090c) Thanks @tim-smart! - Refactor call sites with multiple `Context` mutations to use `Context.mutate` for batched updates.

- [#1750](https://github.com/Effect-TS/effect-smol/pull/1750) [`f4de1b0`](https://github.com/Effect-TS/effect-smol/commit/f4de1b087c998d0bad1d9468f70b7d16c13b9f6f) Thanks @gcanti! - Improve unstable AI structured output handling for empty tool params and add `Tool.EmptyParams`, closes #1749.

- [#1525](https://github.com/Effect-TS/effect-smol/pull/1525) [`60214f2`](https://github.com/Effect-TS/effect-smol/commit/60214f2080b2aeb091f691140eb20acb741691c3) Thanks @tim-smart! - use Option<A> instead of undefined | A

- [#1747](https://github.com/Effect-TS/effect-smol/pull/1747) [`c4b8b0f`](https://github.com/Effect-TS/effect-smol/commit/c4b8b0ffa8efb47c4cd7578a8943d6868509373f) Thanks @tim-smart! - seperate scheduler dispatch from yield decisions

- [#1729](https://github.com/Effect-TS/effect-smol/pull/1729) [`6d9393a`](https://github.com/Effect-TS/effect-smol/commit/6d9393a0770a18722d23340e77f15455de341245) Thanks @tim-smart! - add Context.mutate

- [#1753](https://github.com/Effect-TS/effect-smol/pull/1753) [`6de4efe`](https://github.com/Effect-TS/effect-smol/commit/6de4efe463c783614ceb0c094d77a336a899cbe0) Thanks @tim-smart! - Add dtslint coverage for `Stream.catchIf` to lock in predicate and refinement inference behavior in both data-first and data-last forms.

- [#1716](https://github.com/Effect-TS/effect-smol/pull/1716) [`4f969d1`](https://github.com/Effect-TS/effect-smol/commit/4f969d1563ba755ffa116c8ae409bb3436bd881d) Thanks @gcanti! - Remove unused `effect/NullOr` module.

- [#1721](https://github.com/Effect-TS/effect-smol/pull/1721) [`6cc67c8`](https://github.com/Effect-TS/effect-smol/commit/6cc67c855e054ee3f3ac3485dca5f7805e79e8fb) Thanks @IMax153! - Correct the type of the schema parameter accepted by the `fileSchema` methods in the CLI to be `Schema.Decoder<A>`

- [#1709](https://github.com/Effect-TS/effect-smol/pull/1709) [`8531a22`](https://github.com/Effect-TS/effect-smol/commit/8531a22ffbb52e11a030b09f358cafbfdf5edff7) Thanks @mikearnaldi! - Add module-level helpers for `Semaphore`, `Latch`, and extracted `PartitionedSemaphore` operations.

- [#1752](https://github.com/Effect-TS/effect-smol/pull/1752) [`b226760`](https://github.com/Effect-TS/effect-smol/commit/b22676067617f15c00722a3a63fd7c2c172c3d45) Thanks @tim-smart! - simplify SubscriptionRef

- [#1743](https://github.com/Effect-TS/effect-smol/pull/1743) [`47a51ab`](https://github.com/Effect-TS/effect-smol/commit/47a51aba0ecdf3ef478bfa28a498bca188399bd4) Thanks @tim-smart! - default ws close codes to 1001 in case they are undefined

- [#1728](https://github.com/Effect-TS/effect-smol/pull/1728) [`1521d02`](https://github.com/Effect-TS/effect-smol/commit/1521d02e1f19f1d795edaaf862c1a1031d9c755e) Thanks @tim-smart! - add graceful shutdown to http servers

## 4.0.0-beta.31

### Patch Changes

- [#1696](https://github.com/Effect-TS/effect-smol/pull/1696) [`5a84853`](https://github.com/Effect-TS/effect-smol/commit/5a8485397b7f321ae021640c1999821143659462) Thanks @krzkaczor! - Add `DurationObject` to `Duration.Input` to support Temporal-style object input.

  Durations can now be created from objects with named unit properties like `{ hours: 1, minutes: 30 }`, similar to `Temporal.Duration.from()`. Supported fields: `weeks`, `days`, `hours`, `minutes`, `seconds`, `millis`, `micros`, `nanos`.

- [#1705](https://github.com/Effect-TS/effect-smol/pull/1705) [`6f23f0e`](https://github.com/Effect-TS/effect-smol/commit/6f23f0ed4cba573cd9395c2e582f582fe7271544) Thanks @tim-smart! - Preserve message item ordering in the default logger when logging a `Cause` with message values.

- [#1711](https://github.com/Effect-TS/effect-smol/pull/1711) [`654aaec`](https://github.com/Effect-TS/effect-smol/commit/654aaec593305521b65dd042c204d761cc6e8c28) Thanks @tim-smart! - Fix `RpcGroup.toLayer` and `RpcGroup.toLayerHandler` service requirement inference so handler dependencies are preserved for non-stream RPC handlers.

- [#1712](https://github.com/Effect-TS/effect-smol/pull/1712) [`2958a42`](https://github.com/Effect-TS/effect-smol/commit/2958a42078966a8713a98f00485ab36484d5eccf) Thanks @tim-smart! - Expose CLI completions as a public unstable module at `effect/unstable/cli/Completions`.

- [#1713](https://github.com/Effect-TS/effect-smol/pull/1713) [`95d27a2`](https://github.com/Effect-TS/effect-smol/commit/95d27a239ed5147302605ab0b3147a056541b0c7) Thanks @tim-smart! - Make `Layer.mock` a dual API so it supports both `Layer.mock(Service)(impl)` and `Layer.mock(Service, impl)`.

- [#1704](https://github.com/Effect-TS/effect-smol/pull/1704) [`0fbaea8`](https://github.com/Effect-TS/effect-smol/commit/0fbaea8f9555a8044cec31a770394db613fc78e2) Thanks @tim-smart! - Support toolkit unions in `LanguageModel` options.

- [#1701](https://github.com/Effect-TS/effect-smol/pull/1701) [`21d5d5e`](https://github.com/Effect-TS/effect-smol/commit/21d5d5e0439fd4d9bb6e508377215b1087555d45) Thanks @tim-smart! - wrap httpapi request context with HttpRouter.Request

- [#1696](https://github.com/Effect-TS/effect-smol/pull/1696) [`5a84853`](https://github.com/Effect-TS/effect-smol/commit/5a8485397b7f321ae021640c1999821143659462) Thanks @krzkaczor! - allow assigning Temporal types to DateTime & Duration input

- [#1698](https://github.com/Effect-TS/effect-smol/pull/1698) [`6e49959`](https://github.com/Effect-TS/effect-smol/commit/6e499590357a104c81779b3176cd3f84e4f91064) Thanks @tim-smart! - Include toolkit tool handler requirements in AI generation API environment inference.

- [#1703](https://github.com/Effect-TS/effect-smol/pull/1703) [`8f5805d`](https://github.com/Effect-TS/effect-smol/commit/8f5805dbdd0d1bc0ff0727cc398c8d80e544edee) Thanks @tim-smart! - Relax `Ndjson` byte-stream channel signatures to accept plain `Uint8Array`.

- [#1710](https://github.com/Effect-TS/effect-smol/pull/1710) [`990df2c`](https://github.com/Effect-TS/effect-smol/commit/990df2c3ceeb32e659acc10cc9485617f7b3c423) Thanks @gcanti! - Schema: `toCodecJson` now returns `Codec<T, Json, RD, RE>` instead of `Codec<T, unknown, RD, RE>`.

  Http: the `json` property on `HttpIncomingMessage`, `HttpClientResponse`, `HttpServerRequest`, and `HttpServerResponse` now returns `Effect<Schema.Json, E>` instead of `Effect<unknown, E>`.

## 4.0.0-beta.30

### Patch Changes

- [#1675](https://github.com/Effect-TS/effect-smol/pull/1675) [`c88e5b7`](https://github.com/Effect-TS/effect-smol/commit/c88e5b723ff09da4edaef6ce14d927ca01104a32) Thanks @gijsbartman! - Fix consolePretty ignoring explicit colors option in non-TTY environments.

  When colors is explicitly set to true, prettyLoggerTty was still gating it with processStdoutIsTTY check, making it impossible to enable colors in non-TTY environments like Vite dev server.

- [#1690](https://github.com/Effect-TS/effect-smol/pull/1690) [`947d0e4`](https://github.com/Effect-TS/effect-smol/commit/947d0e4268ba5c4020ead380aa80812c7342408f) Thanks @gcanti! - Fix `Cause.hasInterruptsOnly` to return `false` for empty causes.

- [#1620](https://github.com/Effect-TS/effect-smol/pull/1620) [`7517908`](https://github.com/Effect-TS/effect-smol/commit/75179085d159b88a1ab0bce70669d76dcf0d79a4) Thanks @kitlangton! - Fix `TaggedUnion.match` to use `Unify` for return types, allowing
  branches to return distinct Effect types that are properly merged.

- [#1680](https://github.com/Effect-TS/effect-smol/pull/1680) [`a49ecd5`](https://github.com/Effect-TS/effect-smol/commit/a49ecd5a183d7e7d33f47ff95e9d2dea5a12ead5) Thanks @KhraksMamtsov! - make HttpClientResponse pipeable

- [#1681](https://github.com/Effect-TS/effect-smol/pull/1681) [`6993e33`](https://github.com/Effect-TS/effect-smol/commit/6993e3329122c834c20bacea72d8678232f4f103) Thanks @mikearnaldi! - Add an optional `message` field to `Effect.ignore` and `Effect.ignoreCause` for custom log output.

- [#1695](https://github.com/Effect-TS/effect-smol/pull/1695) [`514f2a2`](https://github.com/Effect-TS/effect-smol/commit/514f2a2ae54580fcacdbe2ea2196a83a852d0748) Thanks @gcanti! - Remove unused APIs from the `Utils` module.

- [#1644](https://github.com/Effect-TS/effect-smol/pull/1644) [`3214b47`](https://github.com/Effect-TS/effect-smol/commit/3214b47676de2d33fddc5fecfc2d226e6e83cc7b) Thanks @patroza! - fix: update Service interface to use 'this: void' in 'of' method signatures

- [#1693](https://github.com/Effect-TS/effect-smol/pull/1693) [`95ec5ed`](https://github.com/Effect-TS/effect-smol/commit/95ec5ed345de77c893049e182d37a37cf164a268) Thanks @tim-smart! - fix cli subcommand context

## 4.0.0-beta.29

### Patch Changes

- [#1672](https://github.com/Effect-TS/effect-smol/pull/1672) [`9d93adb`](https://github.com/Effect-TS/effect-smol/commit/9d93adb1c1795d1978391b30d7d2972c88052662) Thanks @gcanti! - Add `Newtype` module.

- [#1677](https://github.com/Effect-TS/effect-smol/pull/1677) [`b52721c`](https://github.com/Effect-TS/effect-smol/commit/b52721cf0d11a567722b060c8536e3bdd4161f07) Thanks @gcanti! - Fix `Schema.isUUID` so the `version` parameter is optional in its public signature.

- [#1667](https://github.com/Effect-TS/effect-smol/pull/1667) [`a891c7b`](https://github.com/Effect-TS/effect-smol/commit/a891c7b12f415b2287613dd4b91a09dfd38ef30d) Thanks @tim-smart! - Preserve `Atom.withReactivity(...)` refresh behavior when registry initial values seed the wrapped atom.

- [#1678](https://github.com/Effect-TS/effect-smol/pull/1678) [`ef26cdf`](https://github.com/Effect-TS/effect-smol/commit/ef26cdfb65d9955fc7e161629191930c2cc2c63f) Thanks @tim-smart! - Abort HTTP client requests when response streams are consumed only partially.

- [#1665](https://github.com/Effect-TS/effect-smol/pull/1665) [`82fd3ed`](https://github.com/Effect-TS/effect-smol/commit/82fd3ed922063ee5a34f96f3993c15c7515e4f67) Thanks @tim-smart! - Remove placeholder fallback behavior from CLI prompt inputs now that default values are prefilled.

## 4.0.0-beta.28

### Minor Changes

- [#1637](https://github.com/Effect-TS/effect-smol/pull/1637) [`42bc7ce`](https://github.com/Effect-TS/effect-smol/commit/42bc7ce5480f6f2953c39f8cb5c850d61df6f5a2) Thanks @tim-smart! - Add a new `effect/unstable/http/HttpStaticServer` module for static file serving with MIME resolution, directory index fallback, SPA fallback, and safe path resolution.

### Patch Changes

- [#1659](https://github.com/Effect-TS/effect-smol/pull/1659) [`ff533f2`](https://github.com/Effect-TS/effect-smol/commit/ff533f203cd06302ad08032a27e01269b4a2d4c6) Thanks @tim-smart! - Persist MCP HTTP session and protocol headers after initialize so follow-up JSON-RPC requests include `MCP-Protocol-Version`.

- [#1663](https://github.com/Effect-TS/effect-smol/pull/1663) [`dc803ee`](https://github.com/Effect-TS/effect-smol/commit/dc803ee52ebd3e9f931118f0dfcb804542847556) Thanks @tim-smart! - Add `HttpServerResponse.fromClientResponse` for directly converting client responses into server responses.

- [#1657](https://github.com/Effect-TS/effect-smol/pull/1657) [`d660b1c`](https://github.com/Effect-TS/effect-smol/commit/d660b1c99cb93d4f79715e91c7a4486801c0eefa) Thanks @tim-smart! - Add `Ctrl-U` line clearing support to editable CLI prompts.

- [#1645](https://github.com/Effect-TS/effect-smol/pull/1645) [`93a05e3`](https://github.com/Effect-TS/effect-smol/commit/93a05e3eaa624058b162aedd66aad70102837270) Thanks @gijsbartman! - ensure transformed Atom's don't extend idle ttl

- [#1655](https://github.com/Effect-TS/effect-smol/pull/1655) [`2a65cf6`](https://github.com/Effect-TS/effect-smol/commit/2a65cf6fd81ef63d944e6fb51f058d439bf4a834) Thanks @tim-smart! - Make `AtomRpc.query` and `AtomHttpApi.query` return serializable atoms by default when query results are schema-backed.

  The atom serialization key now uses each API's built-in request schemas so dehydrated state can be keyed consistently across server and client.

- [#1662](https://github.com/Effect-TS/effect-smol/pull/1662) [`a561a40`](https://github.com/Effect-TS/effect-smol/commit/a561a40cc41c548c2cf3153aca065ee92ee8aa57) Thanks @tim-smart! - Add `HttpServerRequest.toClientRequest` for direct server-to-client request conversion.

- [#1648](https://github.com/Effect-TS/effect-smol/pull/1648) [`29cd24d`](https://github.com/Effect-TS/effect-smol/commit/29cd24d1fe78480a72eeb38a90281ffddc0530bc) Thanks @gcanti! - Fix `Types.VoidIfEmpty` to correctly detect empty object types. Remove deprecated `Types.MatchRecord` in favor of the simplified implementation, closes #1647.

- [#1664](https://github.com/Effect-TS/effect-smol/pull/1664) [`662a8e6`](https://github.com/Effect-TS/effect-smol/commit/662a8e6857dac64a7cd13bd8df4b0674654622f8) Thanks @tim-smart! - Add `HttpServerRequest.fromClientRequest` for direct client-request-backed server request conversion.

- [#1656](https://github.com/Effect-TS/effect-smol/pull/1656) [`d2b52ba`](https://github.com/Effect-TS/effect-smol/commit/d2b52bae5b9336cf59729fbdcc4d7f09512b0cbf) Thanks @tim-smart! - Persist MCP client capability context across HTTP requests by resolving initialized payloads through the standard `Mcp-Session-Id` HTTP header in `McpServer`.

  Adds a regression test that initializes an MCP HTTP client, verifies the MCP server echoes `Mcp-Session-Id`, and then checks a later tool call can still read `McpServer.clientCapabilities`.

- [#1639](https://github.com/Effect-TS/effect-smol/pull/1639) [`407c3b4`](https://github.com/Effect-TS/effect-smol/commit/407c3b43a5d1414558e0e33b6f1fc0e6a6d489cc) Thanks @tim-smart! - Add `Scheduler.PreventSchedulerYield` and expose it via `References` so fibers can skip scheduler `shouldYield` checks when needed.

- [#1649](https://github.com/Effect-TS/effect-smol/pull/1649) [`e741322`](https://github.com/Effect-TS/effect-smol/commit/e74132226cbfee24234311c7c1c13e6b7391384e) Thanks @tim-smart! - Set `Schema.TaggedErrorClass` instance `name` to the tag value, matching `Data.TaggedError` behavior.

- [#1646](https://github.com/Effect-TS/effect-smol/pull/1646) [`5c75fa8`](https://github.com/Effect-TS/effect-smol/commit/5c75fa8fb71163bc4c035ba1a215574dfd4badfc) Thanks @tim-smart! - Simplify internal and documented request usage by passing request resolvers directly to `Effect.request` instead of wrapping them with `Effect.succeed`.

- [#1641](https://github.com/Effect-TS/effect-smol/pull/1641) [`747177b`](https://github.com/Effect-TS/effect-smol/commit/747177b0602f12d4461a843e953dfdffbeb0a429) Thanks @tim-smart! - Don't transform Tool result schemas, as they aren't sent to the providers as
  json schemas

- [#1636](https://github.com/Effect-TS/effect-smol/pull/1636) [`326cd48`](https://github.com/Effect-TS/effect-smol/commit/326cd4828bce573fe985f35152155464bf4c5a70) Thanks @tim-smart! - Add `Cookies.expireCookie` / `expireCookieUnsafe` and `HttpServerResponse.expireCookie` / `expireCookieUnsafe` for emitting expired cookies.

- [#1653](https://github.com/Effect-TS/effect-smol/pull/1653) [`627e922`](https://github.com/Effect-TS/effect-smol/commit/627e922b8d1e9521eae5e1caa5d667ad00b1619a) Thanks @tim-smart! - expose mcp client capabilities

- [#1660](https://github.com/Effect-TS/effect-smol/pull/1660) [`662287e`](https://github.com/Effect-TS/effect-smol/commit/662287e9abc76c941ccc2ee330aa07904d571341) Thanks @tim-smart! - Add `HttpServerResponse.toClientResponse` for converting server responses into `HttpClientResponse` values.

## 4.0.0-beta.27

### Patch Changes

- [#1621](https://github.com/Effect-TS/effect-smol/pull/1621) [`903a839`](https://github.com/Effect-TS/effect-smol/commit/903a839e94239e6ec4568315af28e405bcad95f4) Thanks @kitlangton! - unstable/http Headers: add `removeMany` combinator for removing multiple headers at once

- [#1622](https://github.com/Effect-TS/effect-smol/pull/1622) [`91a0168`](https://github.com/Effect-TS/effect-smol/commit/91a016836680a6669308ecf464d3584bcc4ae1b7) Thanks @tim-smart! - Add `Model.BooleanSqlite`, a model field schema that uses `0 | 1` encoding for database variants and plain `boolean` encoding for JSON variants.

- [#1631](https://github.com/Effect-TS/effect-smol/pull/1631) [`c890f9a`](https://github.com/Effect-TS/effect-smol/commit/c890f9a1b3a989ed22528bd5a43326342e05b142) Thanks @gcanti! - unstable/httpapi HttpApiBuilder: fix void responses producing a non-empty body instead of `Response.empty`, closes #1628.

- [#1618](https://github.com/Effect-TS/effect-smol/pull/1618) [`1e985f2`](https://github.com/Effect-TS/effect-smol/commit/1e985f237d250b51b91de22dde77160c1e778ce7) Thanks @tim-smart! - Default `Effect.context()` to `Effect.context<never>()` when no type parameter is provided.

## 4.0.0-beta.26

### Patch Changes

- [#1603](https://github.com/Effect-TS/effect-smol/pull/1603) [`fb21462`](https://github.com/Effect-TS/effect-smol/commit/fb21462642cdd5b1bada92f3eba18ae20445be42) Thanks @tim-smart! - Add `responseText` to `AiError.StructuredOutputError` and populate it from `LanguageModel.generateObject` so failed structured output decodes include the full LLM text.

- [#1613](https://github.com/Effect-TS/effect-smol/pull/1613) [`2ed26b1`](https://github.com/Effect-TS/effect-smol/commit/2ed26b139805700e3df39efaa768ff01565e5c86) Thanks @lucas-barake! - Add `disableFatalDefects` to `RpcServer.layerHttp`, `RpcServer.toHttpEffect`, and `RpcServer.toHttpEffectWebsocket` option types to match existing runtime support.

- [#1599](https://github.com/Effect-TS/effect-smol/pull/1599) [`e832a57`](https://github.com/Effect-TS/effect-smol/commit/e832a57b570fe38f010c1fd99bceac5a325a9e07) Thanks @tim-smart! - add trait for customizing exit codes

- [#1611](https://github.com/Effect-TS/effect-smol/pull/1611) [`7f01be7`](https://github.com/Effect-TS/effect-smol/commit/7f01be7f8db363d4b2e88e6b5571e96bb815786f) Thanks @WebWalks! - Fixed the Error Type on AtomHttpApiClient (Server errors were being incorrectly reported, and we could not determine \_tag to handle)

- [#1612](https://github.com/Effect-TS/effect-smol/pull/1612) [`e965143`](https://github.com/Effect-TS/effect-smol/commit/e9651431e114479e6becf8ca7b1ed99ac7e91ccc) Thanks @tim-smart! - Expose the optional `orElse` fallback parameter in `Effect.catchTags`.

- [#1606](https://github.com/Effect-TS/effect-smol/pull/1606) [`b9b80f1`](https://github.com/Effect-TS/effect-smol/commit/b9b80f1f15e152ceef0a727d150b7dc230abae99) Thanks @gcanti! - Schema: `toJsonSchemaDocument` now emits JSON Schema `false` for unannotated
  `Never` index signatures (including `additionalProperties`) instead of `{ not: {} }`.
  Annotated `Never` still emits a schema object so metadata like `description` is preserved.

- [#1607](https://github.com/Effect-TS/effect-smol/pull/1607) [`98252aa`](https://github.com/Effect-TS/effect-smol/commit/98252aa0c0b17fc73fbdad65d0a1104965f9fc0f) Thanks @gcanti! - Schema: improve `Schema.Unknown` / `Schema.ObjectKeyword` handling in `toCodecJson` and `toCodecStringTree`

- [#1616](https://github.com/Effect-TS/effect-smol/pull/1616) [`56fbd94`](https://github.com/Effect-TS/effect-smol/commit/56fbd94311ad19a05001ad649d9e34ab00c74541) Thanks @lucas-barake! - Add `Atom.swr` to `effect/unstable/reactivity` for staleTime-gated stale-while-revalidate reads, optional mount and window-focus revalidation, and forceful manual refresh.

- [#1600](https://github.com/Effect-TS/effect-smol/pull/1600) [`3faa109`](https://github.com/Effect-TS/effect-smol/commit/3faa109b7d093fbf14ad410d3e11d663f16e28f1) Thanks @tim-smart! - add args to Stdio service

- [#1610](https://github.com/Effect-TS/effect-smol/pull/1610) [`692ecfe`](https://github.com/Effect-TS/effect-smol/commit/692ecfed99fe58056b7a5afe001f4fcd1a61c446) Thanks @kitlangton! - Refine unstable CLI parent/subcommand flag composition.
  - Add `Command.withSharedFlags` conflict validation against existing subcommands, including the `withSubcommands(...).withSharedFlags(...)` composition order.
  - Reorder `Command` type parameters to `Command<Name, Input, ContextInput, E, R>` for clearer parent-context modeling.
  - Make `Command.withSubcommands` input typing sound for downstream input-based combinators by reflecting that subcommand paths only carry parent context input.

- [#1604](https://github.com/Effect-TS/effect-smol/pull/1604) [`1e70b72`](https://github.com/Effect-TS/effect-smol/commit/1e70b72d0b210474d0e96a15a5cfc279eae37e0c) Thanks @lucas-barake! - Fix `unstable/sql/SqlSchema` request input typing so `findAll` and `findNonEmpty` accept `Request["Type"]` instead of `Request["Encoded"]`.

- [#1602](https://github.com/Effect-TS/effect-smol/pull/1602) [`ecf0782`](https://github.com/Effect-TS/effect-smol/commit/ecf07829ef2dfc01d8943c96c4fe9c1b44b97926) Thanks @tim-smart! - Replace the default HttpApi schema-validation error with `HttpApiError.BadRequestNoContent`.

## 4.0.0-beta.25

### Patch Changes

- [#1597](https://github.com/Effect-TS/effect-smol/pull/1597) [`fa17bb5`](https://github.com/Effect-TS/effect-smol/commit/fa17bb5be9f2533d01e11322b14804c7dec43714) Thanks @tim-smart! - Fix `Effect.forkScoped` data-first typings to include `Scope` in requirements.

- [#1598](https://github.com/Effect-TS/effect-smol/pull/1598) [`f46e5b5`](https://github.com/Effect-TS/effect-smol/commit/f46e5b5ca2a918ee4d9270167e79db223077c96f) Thanks @tim-smart! - compare transaction connections by reference

- [#1596](https://github.com/Effect-TS/effect-smol/pull/1596) [`ce4767c`](https://github.com/Effect-TS/effect-smol/commit/ce4767cadcacc6ce8ff4c3a0d0fbc82ede655f63) Thanks @tim-smart! - improve HttpClient.withRateLimiter initial state tracking

- [#1594](https://github.com/Effect-TS/effect-smol/pull/1594) [`c830a8b`](https://github.com/Effect-TS/effect-smol/commit/c830a8b6c292a6528d7f9318759d34800b00372d) Thanks @tim-smart! - HttpClient.withRateLimiter adds delay from retry-after headers

## 4.0.0-beta.24

### Patch Changes

- [#1586](https://github.com/Effect-TS/effect-smol/pull/1586) [`a909e1c`](https://github.com/Effect-TS/effect-smol/commit/a909e1c1ac2bc707527f5073776e3e7d239688d9) Thanks @gcanti! - Schema: add `Chunk` schema, closes #1585.

- [#1588](https://github.com/Effect-TS/effect-smol/pull/1588) [`8814a4e`](https://github.com/Effect-TS/effect-smol/commit/8814a4ef78d67144d27689370af10099ea210399) Thanks @gcanti! - Fix `Schema.toTaggedUnion` discriminant detection for class-based schemas, including unique symbol tags, closes #1584.

- [#1591](https://github.com/Effect-TS/effect-smol/pull/1591) [`3f942c5`](https://github.com/Effect-TS/effect-smol/commit/3f942c51cefa7b2ffa7c49e8c8a2c887570ba4c0) Thanks @tim-smart! - Add `HttpClient.withRateLimiter` for integrating the `RateLimiter` service with HTTP clients, including optional response-header driven limit updates and automatic 429 retry behavior.

- [#1583](https://github.com/Effect-TS/effect-smol/pull/1583) [`774ed59`](https://github.com/Effect-TS/effect-smol/commit/774ed59c52b2ab578bbb897c4f551f812231e1d2) Thanks @patroza! - feat: Support Reference classes

- [#1592](https://github.com/Effect-TS/effect-smol/pull/1592) [`f54b8d3`](https://github.com/Effect-TS/effect-smol/commit/f54b8d398fedad1815fd1f4c49814ab938cfc385) Thanks @tim-smart! - Fix `HttpApi.prefix` so it updates endpoint path types the same way `HttpApiGroup.prefix` does.

## 4.0.0-beta.23

### Patch Changes

- [#1561](https://github.com/Effect-TS/effect-smol/pull/1561) [`5c73c41`](https://github.com/Effect-TS/effect-smol/commit/5c73c41b69eaeab80fcd62c9bfda490b446d1966) Thanks @gcanti! - SchemaRepresentation: only create references for recursive/mutually recursive schemas and schemas with an `identifier` annotation, closes #1560.

## 4.0.0-beta.22

### Patch Changes

- [#1578](https://github.com/Effect-TS/effect-smol/pull/1578) [`0874332`](https://github.com/Effect-TS/effect-smol/commit/0874332f7c81118b06ac2eb105e0710211631479) Thanks @tim-smart! - Proxy function arity from `Effect.fn` APIs so wrapped functions preserve the original `length` value.

- [#1580](https://github.com/Effect-TS/effect-smol/pull/1580) [`c592dcd`](https://github.com/Effect-TS/effect-smol/commit/c592dcde0697e322065c8f418c0480ef910cb183) Thanks @tim-smart! - simplify Filter by removing Args type parameter

- [#1575](https://github.com/Effect-TS/effect-smol/pull/1575) [`1dbe28d`](https://github.com/Effect-TS/effect-smol/commit/1dbe28dac8299cd3e218c9768450cfd173b5e294) Thanks @tim-smart! - fix Chat constructor types

- [#1581](https://github.com/Effect-TS/effect-smol/pull/1581) [`564d730`](https://github.com/Effect-TS/effect-smol/commit/564d730b6bbf38dd8548a3b046e7a693b28699a4) Thanks @tim-smart! - fix Duration.toMillis regression

- [#1579](https://github.com/Effect-TS/effect-smol/pull/1579) [`3cfadc4`](https://github.com/Effect-TS/effect-smol/commit/3cfadc458b070c6cba6c5674b72a059f1e49118b) Thanks @tim-smart! - Remove fiber-level keep-alive intervals and keep the process alive from `Runtime.makeRunMain` instead.

- [#1571](https://github.com/Effect-TS/effect-smol/pull/1571) [`6634fd0`](https://github.com/Effect-TS/effect-smol/commit/6634fd07da067d80b8261fb2959d1a952b9e412e) Thanks @tim-smart! - Add `HttpApiClient.urlBuilder` for type-safe endpoint URL construction from group + method/path keys.

- [#1573](https://github.com/Effect-TS/effect-smol/pull/1573) [`d10dabe`](https://github.com/Effect-TS/effect-smol/commit/d10dabeb7af9a368f995829cd36ad08167cd8f95) Thanks @tim-smart! - Expose a `chunkSize` option on `Stream.fromIterable` to control emitted chunk boundaries when constructing streams from iterables.

- [#1574](https://github.com/Effect-TS/effect-smol/pull/1574) [`f82f549`](https://github.com/Effect-TS/effect-smol/commit/f82f549a09e950e9d4987f279a800f4d953f0939) Thanks @tim-smart! - Fix AI tool handler error typing so `LanguageModel.generateText` with a toolkit exposes wrapped `AiError` values rather than leaking raw `AiErrorReason` in the error channel.

- [#1577](https://github.com/Effect-TS/effect-smol/pull/1577) [`78a3382`](https://github.com/Effect-TS/effect-smol/commit/78a3382ddfbe034408f7480fa794733d9e82147b) Thanks @tim-smart! - fix VariantSchema.Union

## 4.0.0-beta.21

### Patch Changes

- [#1555](https://github.com/Effect-TS/effect-smol/pull/1555) [`e691909`](https://github.com/Effect-TS/effect-smol/commit/e691909495ccb162ea7bfa351dd74632b99997cb) Thanks @tim-smart! - fix Stream.withSpan options

- [#1548](https://github.com/Effect-TS/effect-smol/pull/1548) [`d5f413f`](https://github.com/Effect-TS/effect-smol/commit/d5f413f3c8fc57f2413cc5649c2003d6d4e5a6d7) Thanks @effect-bot! - Fix `TxPubSub.publish` and `TxPubSub.publishAll` overloads to require `Effect.Transaction` in their return environment.

- [#1557](https://github.com/Effect-TS/effect-smol/pull/1557) [`139d152`](https://github.com/Effect-TS/effect-smol/commit/139d152941e562a073b5be12e8d66c8a4d4a8a57) Thanks @A386official! - Fix MCP resource template parameter names resolving as `param0`, `param1` instead of actual names by checking `isParam` on the original schema before `toCodecStringTree` transformation.

- [#1547](https://github.com/Effect-TS/effect-smol/pull/1547) [`947e3d4`](https://github.com/Effect-TS/effect-smol/commit/947e3d436ab8a017efda9b29be523efd1ca8df28) Thanks @effect-bot! - Fix `Schedule.reduce` to persist state updates when the combine function returns a synchronous value.

- [#1545](https://github.com/Effect-TS/effect-smol/pull/1545) [`84b2cce`](https://github.com/Effect-TS/effect-smol/commit/84b2ccefe2aa3a7413b86738a4dc33cdb311ca55) Thanks @effect-bot! - Fix TupleWithRest post-rest validation to check each tail index sequentially.

- [#1552](https://github.com/Effect-TS/effect-smol/pull/1552) [`7f5305e`](https://github.com/Effect-TS/effect-smol/commit/7f5305e69f5a33309e77b08a576edb25d7daaee2) Thanks @tim-smart! - Constrain `HttpServerRequest.source` to `object` and key server-side request weak caches by `request.source` so middleware request wrappers share the same cache entries.

- [#1556](https://github.com/Effect-TS/effect-smol/pull/1556) [`9e6fd84`](https://github.com/Effect-TS/effect-smol/commit/9e6fd8471c93a3c643929151a3bdb62cb9c0ca0e) Thanks @tim-smart! - rename WorkflowEngine.layer

- [#1558](https://github.com/Effect-TS/effect-smol/pull/1558) [`fdb8a4b`](https://github.com/Effect-TS/effect-smol/commit/fdb8a4b172721fbefe98bd5aa6fe4f0efd1da3eb) Thanks @tim-smart! - Fix `Workflow.executionId` to use schema `makeUnsafe` instead of the removed `.make` API.

- [#1553](https://github.com/Effect-TS/effect-smol/pull/1553) [`0f986ef`](https://github.com/Effect-TS/effect-smol/commit/0f986ef22f196fe091a7afdbd179485a7d888882) Thanks @kaylynb! - Fix spans never having parent span

- [#1541](https://github.com/Effect-TS/effect-smol/pull/1541) [`9355fc0`](https://github.com/Effect-TS/effect-smol/commit/9355fc0ffb5b7382146a5aed9eea83974b10d007) Thanks @tim-smart! - Add `Effect.findFirst` and `Effect.findFirstFilter` for short-circuiting effectful searches over iterables.

## 4.0.0-beta.20

### Patch Changes

- [#1533](https://github.com/Effect-TS/effect-smol/pull/1533) [`842a624`](https://github.com/Effect-TS/effect-smol/commit/842a624f79d5e1407460b0ef3ab27d14d48ccf74) Thanks @tim-smart! - move ChildProcess apis into spawner service

- [#1536](https://github.com/Effect-TS/effect-smol/pull/1536) [`4785eef`](https://github.com/Effect-TS/effect-smol/commit/4785eef5d7cf1edb96ef2509aed2ba4d1edf3862) Thanks @tim-smart! - add Context.Key type, used a base for Context.Service and Context.Reference

- [#1531](https://github.com/Effect-TS/effect-smol/pull/1531) [`8fac95b`](https://github.com/Effect-TS/effect-smol/commit/8fac95bd9e0338b7a82da8da579c1ac22afa045c) Thanks @gcanti! - Revert `Config.withDefault` to v3 behavior, closes #1530.

  Make `Config.withDefault` accept an eager value instead of `LazyArg`, aligning with CLI module conventions.

- [#1535](https://github.com/Effect-TS/effect-smol/pull/1535) [`12ee8e2`](https://github.com/Effect-TS/effect-smol/commit/12ee8e27df7eb393d83a5e403390d0cfc82ca732) Thanks @tim-smart! - change default ErrorReporter severity to Info

- [#1529](https://github.com/Effect-TS/effect-smol/pull/1529) [`e542c94`](https://github.com/Effect-TS/effect-smol/commit/e542c942bee4729138b02222f4421220a90a57d8) Thanks @tim-smart! - Add dedicated AiError metadata interfaces per reason so provider packages can safely augment metadata without conflicting module declarations.

- [#1531](https://github.com/Effect-TS/effect-smol/pull/1531) [`8fac95b`](https://github.com/Effect-TS/effect-smol/commit/8fac95bd9e0338b7a82da8da579c1ac22afa045c) Thanks @gcanti! - Fix `Config.withDefault` type inference, closes #1530.

- [#1528](https://github.com/Effect-TS/effect-smol/pull/1528) [`6f4ebd1`](https://github.com/Effect-TS/effect-smol/commit/6f4ebd193c2595983394127dd808601b75430d34) Thanks @tim-smart! - Add `Model.ModelName` and provide it from AI model constructors.

- [#1537](https://github.com/Effect-TS/effect-smol/pull/1537) [`989d1cc`](https://github.com/Effect-TS/effect-smol/commit/989d1cca936fce0cc459057825ba40e3f5ef3827) Thanks @tim-smart! - Revert `Effect.partition` to Effect v3 behavior by accumulating failures from the effect error channel and never failing.

## 4.0.0-beta.19

## 4.0.0-beta.18

### Minor Changes

- [#1515](https://github.com/Effect-TS/effect-smol/pull/1515) [`01e31fd`](https://github.com/Effect-TS/effect-smol/commit/01e31fdf8e5206849d23cbafd23a346f2f177ab8) Thanks @mikearnaldi! - Add transactional STM modules: TxDeferred, TxPriorityQueue, TxPubSub, TxReentrantLock, TxSubscriptionRef.

  Refactor transaction model: remove `Effect.atomic`/`Effect.atomicWith`, add `Effect.withTxState`. All Tx operations now return `Effect<A, E, Transaction>` requiring explicit `Effect.transaction(...)` at boundaries.

  Expose `TxPubSub.acquireSubscriber`/`releaseSubscriber` for composable transaction boundaries. Fix `TxSubscriptionRef.changes` race condition ensuring current value is delivered first.

  Remove `TxRandom` module.

### Patch Changes

- [#1518](https://github.com/Effect-TS/effect-smol/pull/1518) [`0890aab`](https://github.com/Effect-TS/effect-smol/commit/0890aab15ed9c5ba52c383a72fdc6a444d7504d5) Thanks @IMax153! - Fix `Command.withGlobalFlags` type inference when mixing `GlobalFlag.action` and `GlobalFlag.setting`.

  `Setting` service identifiers are now correctly removed from command requirements in mixed global flag arrays.

- [#1520](https://github.com/Effect-TS/effect-smol/pull/1520) [`725260b`](https://github.com/Effect-TS/effect-smol/commit/725260b53f5142d6af7a93a2f9f464f974eda92d) Thanks @IMax153! - Ensure that OpenAI JSON schemas for tool calls and structured outputs are properly transformed

## 4.0.0-beta.17

### Patch Changes

- [#1516](https://github.com/Effect-TS/effect-smol/pull/1516) [`8f59c32`](https://github.com/Effect-TS/effect-smol/commit/8f59c32922597a48392744f7203e284866747781) Thanks @gcanti! - Fix `Schema.encodeKeys` to encode non-remapped struct fields during encoding.

## 4.0.0-beta.16

### Patch Changes

- [#1513](https://github.com/Effect-TS/effect-smol/pull/1513) [`bf9096c`](https://github.com/Effect-TS/effect-smol/commit/bf9096c52a7d8791d93d232739e523eb84f6625a) Thanks @gcanti! - Add `SchemaParser.makeOption` and `Schema.makeOption` for constructing schema values as `Option`.

- [#1508](https://github.com/Effect-TS/effect-smol/pull/1508) [`29f81ca`](https://github.com/Effect-TS/effect-smol/commit/29f81ca07c67dba265804b140a7487fb15a5fc6b) Thanks @gcanti! - Schema: add `OptionFromUndefinedOr` and `OptionFromNullishOr` schemas.

- [#1498](https://github.com/Effect-TS/effect-smol/pull/1498) [`68eb28c`](https://github.com/Effect-TS/effect-smol/commit/68eb28c2b0fc67a9f6204ade9bd16c5b37803bfb) Thanks @kaylynb! - Fix OpenApi Multipart file upload schema generation

## 4.0.0-beta.15

### Patch Changes

- [#1500](https://github.com/Effect-TS/effect-smol/pull/1500) [`24ae609`](https://github.com/Effect-TS/effect-smol/commit/24ae60995d2fd7d621be356cdfdfd328c79639ba) Thanks @qadama831! - Unwrap `_Success` schema to enable field access.

- [#1486](https://github.com/Effect-TS/effect-smol/pull/1486) [`0e3c059`](https://github.com/Effect-TS/effect-smol/commit/0e3c059987caa55ebd0c134f7c7b147c639c328e) Thanks @tim-smart! - Fix `Stream.groupedWithin` to stop emitting empty arrays when schedule ticks fire while upstream is idle.

- [#1503](https://github.com/Effect-TS/effect-smol/pull/1503) [`e843b0a`](https://github.com/Effect-TS/effect-smol/commit/e843b0a7d7e7b600a0b3bd477f24e2e4cd26bc8b) Thanks @tim-smart! - allow creating standalone http handlers from HttpApiEndpoints

- [#1499](https://github.com/Effect-TS/effect-smol/pull/1499) [`f4389a2`](https://github.com/Effect-TS/effect-smol/commit/f4389a2cca3c5bbf00d69779f52ce41255f15a28) Thanks @tim-smart! - fix atom node timeout cleanup

- [#1494](https://github.com/Effect-TS/effect-smol/pull/1494) [`5b73de0`](https://github.com/Effect-TS/effect-smol/commit/5b73de095b3402d0c5c74092ace6ce18ebfad566) - Refine `ExtractServices` to omit tool handler requirements when automatic tool resolution is explicitly disabled through the `disableToolCallResolution` option.

- [#1496](https://github.com/Effect-TS/effect-smol/pull/1496) [`595d2d6`](https://github.com/Effect-TS/effect-smol/commit/595d2d6e7d50419f3532bd39266191532ace38f2) Thanks @IMax153! - Refactor unstable CLI global flags to command-scoped declarations.

  ### Breaking changes
  - Remove `GlobalFlag.add`, `GlobalFlag.remove`, and `GlobalFlag.clear`
  - Add `Command.withGlobalFlags(...)` as the declaration API for command/subcommand scope
  - Change `GlobalFlag.setting` constructor to curried form which carries type-level identifier:
    - before: `GlobalFlag.setting({ flag, ... })`
    - after: `GlobalFlag.setting("id")({ flag })`
  - Change setting context identity to a stable type-level string:
    - `effect/unstable/cli/GlobalFlag/${id}`

  ### Behavior changes
  - Global flags are now scoped by command path (root-to-leaf declarations)
  - Out-of-scope global flags are rejected for the selected subcommand path
  - Help now renders only global flags active for the requested command path
  - Setting defaults are sourced from `Flag` combinators (`optional`, `withDefault`) rather than setting constructor defaults

## 4.0.0-beta.14

### Patch Changes

- [#1471](https://github.com/Effect-TS/effect-smol/pull/1471) [`c414700`](https://github.com/Effect-TS/effect-smol/commit/c414700ef1932e4b67d0102856de417336912350) Thanks @IMax153! - Make CLI global settings directly yieldable and simplify built-in names.

  `GlobalFlag.setting` now takes `{ flag, defaultValue }` and returns a setting that is a `Context.Reference`, so handlers and `Command.provide*` effects can `yield*` global setting values directly.

  Built-in settings keep internal behavior in `runWith` (for example, `--log-level` still configures `References.MinimumLogLevel`) while also being readable as values.

  Also renamed built-in globals:
  - `GlobalFlag.CompletionsFlag` -> `GlobalFlag.Completions`
  - `GlobalFlag.LogLevelFlag` -> `GlobalFlag.LogLevel`

- [#1490](https://github.com/Effect-TS/effect-smol/pull/1490) [`a30c969`](https://github.com/Effect-TS/effect-smol/commit/a30c9699c0d736cf3952041e45d508b7d58907a9) Thanks @gcanti! - Fix `OpenApi.fromApi` preserving multiple response content types for one status code, closes #1485.

## 4.0.0-beta.13

### Patch Changes

- [#1454](https://github.com/Effect-TS/effect-smol/pull/1454) [`368f4c3`](https://github.com/Effect-TS/effect-smol/commit/368f4c363dd117e6f5a19ad77b161176cfd29fdd) Thanks @lucas-barake! - Expose `NoSuchElementError` in the error type of stream-based `Atom.make` overloads.

- [#1469](https://github.com/Effect-TS/effect-smol/pull/1469) [`db8a579`](https://github.com/Effect-TS/effect-smol/commit/db8a579e93e93ff73b1e60712732e03b597b916b) Thanks @tim-smart! - Update unstable schema variant helpers to use array-based arguments for `FieldOnly`, `FieldExcept`, and `Union`, aligning `VariantSchema` and `Model` with other v4 API shapes.

- [#1457](https://github.com/Effect-TS/effect-smol/pull/1457) [`668b703`](https://github.com/Effect-TS/effect-smol/commit/668b70337e9ddbb0d1ae2282a95c282ce404e562) Thanks @tim-smart! - Run request resolver batch fibers with request services by using `Effect.runForkWith`, so resolver delay effects and `runAll` execution see the request service map.

- [#1461](https://github.com/Effect-TS/effect-smol/pull/1461) [`d40e76b`](https://github.com/Effect-TS/effect-smol/commit/d40e76b973543979e60e04a6baca04a8c65bdfc2) Thanks @mikearnaldi! - Fix `Schedule.fixed` double-executing the effect due to clock jitter.

  The `elapsedSincePrevious > window` check included sleep time from the
  previous step, so any timer imprecision (e.g. 1001ms for a 1000ms sleep)
  triggered an immediate zero-delay re-execution.

- [#1464](https://github.com/Effect-TS/effect-smol/pull/1464) [`6e18cf8`](https://github.com/Effect-TS/effect-smol/commit/6e18cf883e9905ca718a6697b6a2a4bbd42739aa) Thanks @gcanti! - Use the `identifier` annotation as the expected message when available, closes #1458.

- [#1475](https://github.com/Effect-TS/effect-smol/pull/1475) [`86062e8`](https://github.com/Effect-TS/effect-smol/commit/86062e8a0c61bca5412fc40d2cf151d676901f08) Thanks @tim-smart! - Add a CI check job that runs `pnpm ai-docgen` and fails if it produces uncommitted changes.

- [#1448](https://github.com/Effect-TS/effect-smol/pull/1448) [`c27ce75`](https://github.com/Effect-TS/effect-smol/commit/c27ce75d34c74dcfc6dba1bf77f1ce88f410a0de) Thanks @IMax153! - Refactor CLI built-in options to use Effect services with `GlobalFlag`

  Built-in CLI flags (`--help`, `--version`, `--completions`, `--log-level`) are now implemented as Effect services using `Context.Reference`. This provides:
  - **Visibility**: Built-in flags now appear in help output's "GLOBAL FLAGS" section
  - **Extensibility**: Users can register custom global flags via `GlobalFlag.add`
  - **Override capability**: Built-in flag behavior can be replaced or disabled
  - **Composability**: Flags compose via Effect's service system

  New `GlobalFlag` module exports:
  - `Action<A>` and `Setting<A>` types for different flag behaviors
  - `Help`, `Version`, `Completions`, `LogLevel` references for built-in flags
  - `add`, `remove`, `clear` functions for managing global flags

  Example:

  ```typescript
  const app = Command.make("myapp");
  Command.run(app, { version: "1.0.0" }).pipe(
    GlobalFlag.add(CustomFlag, customFlagValue),
  );
  ```

- [#1468](https://github.com/Effect-TS/effect-smol/pull/1468) [`e2d4fbf`](https://github.com/Effect-TS/effect-smol/commit/e2d4fbfeeda6a5d2a4c5aeb0501d8240c248b9eb) Thanks @lucas-barake! - Fix `Rpc.ExtractProvides` to use middleware service ID instead of constructor type.

- [#1465](https://github.com/Effect-TS/effect-smol/pull/1465) [`114ab42`](https://github.com/Effect-TS/effect-smol/commit/114ab42ad0edc590d29169675a493e0e915aa58f) Thanks @lloydrichards! - tighten Schema on \_meta fields in McpSchema; closes #1463

- [#1470](https://github.com/Effect-TS/effect-smol/pull/1470) [`484caec`](https://github.com/Effect-TS/effect-smol/commit/484caec47cccac8b86db2910742e406dfc7173ab) Thanks @tim-smart! - Add `Command.withAlias` for unstable CLI commands, including subcommand parsing by alias and help output that renders aliases as `name, alias` in subcommand listings.

## 4.0.0-beta.12

### Patch Changes

- [#1439](https://github.com/Effect-TS/effect-smol/pull/1439) [`70a74e8`](https://github.com/Effect-TS/effect-smol/commit/70a74e88a8767c9d4acdb9e5f25aec9a33588d07) Thanks @gcanti! - Add `Config.nested` combinator to scope a config under a named prefix, closes #1437.

- [#1452](https://github.com/Effect-TS/effect-smol/pull/1452) [`b5b6e10`](https://github.com/Effect-TS/effect-smol/commit/b5b6e10621d54bf8c9857fec0d647ced78ecd857) Thanks @tim-smart! - make fiber keepAlive setInterval evaluation lazy

- [#1431](https://github.com/Effect-TS/effect-smol/pull/1431) [`f5ce5a9`](https://github.com/Effect-TS/effect-smol/commit/f5ce5a915359c6ebf254079e1da23cab6cde34fb) Thanks @tim-smart! - Add `Random.nextBoolean` for generating random boolean values.

- [#1450](https://github.com/Effect-TS/effect-smol/pull/1450) [`a29eb70`](https://github.com/Effect-TS/effect-smol/commit/a29eb702ffe3fc58bd28c4d7857298cd65d73668) Thanks @tim-smart! - use cause annotations for detecting client aborts

- [#1445](https://github.com/Effect-TS/effect-smol/pull/1445) [`c7b36e5`](https://github.com/Effect-TS/effect-smol/commit/c7b36e541a23e9a00f64e25b23851e51a37dfce5) Thanks @mattiamanzati! - Fix `Graph.toMermaid` to escape special characters using HTML entity codes per the Mermaid specification.

- [#1443](https://github.com/Effect-TS/effect-smol/pull/1443) [`9381d6d`](https://github.com/Effect-TS/effect-smol/commit/9381d6d4d9d819a81a46e56d0364c76e92a4fbca) Thanks @mikearnaldi! - Fix `HttpClient.retryTransient` autocomplete leaking `Schedule` internals by splitting the `{...} | Schedule` union into separate overloads.

- [#1444](https://github.com/Effect-TS/effect-smol/pull/1444) [`88439f1`](https://github.com/Effect-TS/effect-smol/commit/88439f13ca13549f3e4822c48c4f019c14fc2bcc) Thanks @gcanti! - Schema.encodeKeys: relax input constraint from Struct to schemas with fields so Schema.Class works, closes #1412.

- [#1438](https://github.com/Effect-TS/effect-smol/pull/1438) [`e35307d`](https://github.com/Effect-TS/effect-smol/commit/e35307dbeb8eb26a9923f958b894a8eaaf259bf2) Thanks @mikearnaldi! - Atom.searchParam: decode initial URL values correctly when a schema is provided

- [#1425](https://github.com/Effect-TS/effect-smol/pull/1425) [`c7df4bc`](https://github.com/Effect-TS/effect-smol/commit/c7df4bce34009474c63d62a807abfdafb76971eb) Thanks @candrewlee14! - Fix LanguageModel stripping of resolved approval artifacts across multi-round conversations.

  Previously, `stripResolvedApprovals` only ran when there were pending approvals
  in the current round. Stale artifacts from earlier rounds would leak to the
  provider, causing errors. The stripping now runs unconditionally.

  In streaming mode, pre-resolved tool results are also emitted as stream parts
  so `Chat.streamText` persists them to history, preventing re-resolution on
  subsequent rounds.

- [#1453](https://github.com/Effect-TS/effect-smol/pull/1453) [`accaf3b`](https://github.com/Effect-TS/effect-smol/commit/accaf3be7ac8da36e2334c509c23b8c9e88ea160) Thanks @tim-smart! - allow mcp errors to be encoded correctly

- [#1440](https://github.com/Effect-TS/effect-smol/pull/1440) [`3e1c270`](https://github.com/Effect-TS/effect-smol/commit/3e1c2707bbdf67720af1509642b8ced195790882) Thanks @lloydrichards! - extend McpSchema to work with extensions

- [#1447](https://github.com/Effect-TS/effect-smol/pull/1447) [`6cd81f7`](https://github.com/Effect-TS/effect-smol/commit/6cd81f73baad86f5bbfa455a55d75cde71e9611a) Thanks @tim-smart! - remove all non-regional service usage

- [#1451](https://github.com/Effect-TS/effect-smol/pull/1451) [`f222da3`](https://github.com/Effect-TS/effect-smol/commit/f222da3cdb44554f3324c2c52d0d005ee575053e) Thanks @tim-smart! - Add `Effect.annotateLogsScoped` to apply log annotations for the current scope and automatically restore previous annotations when the scope closes.

- [#1434](https://github.com/Effect-TS/effect-smol/pull/1434) [`61f901d`](https://github.com/Effect-TS/effect-smol/commit/61f901d830005b66e22d1de889fda132aeea97cd) Thanks @tim-smart! - Fix JSON-RPC serialization to return an object for non-batched requests while preserving array responses for true batch requests.

## 4.0.0-beta.11

### Patch Changes

- [#1429](https://github.com/Effect-TS/effect-smol/pull/1429) [`88659ed`](https://github.com/Effect-TS/effect-smol/commit/88659edb26e3623d557dccfe914c2c949672da16) Thanks @tim-smart! - Add grouped subcommand support to `Command.withSubcommands`, including help output sections for named groups while keeping ungrouped commands under `SUBCOMMANDS`.

- [#1426](https://github.com/Effect-TS/effect-smol/pull/1426) [`f2915e8`](https://github.com/Effect-TS/effect-smol/commit/f2915e8e2efe80d50c281e53f297b9701d6dc199) Thanks @tim-smart! - Add `Effect.validate` for validating collections while accumulating all failures, equivalent to the v3 `Effect.validateAll` behavior.

- [#1430](https://github.com/Effect-TS/effect-smol/pull/1430) [`eb71ace`](https://github.com/Effect-TS/effect-smol/commit/eb71acebbe0f228e4920278013beee3b67d62310) Thanks @tim-smart! - Add `Command.withExamples` to attach concrete usage examples to CLI commands, expose them through `HelpDoc.examples`, and render them in the default help formatter.

- [#1415](https://github.com/Effect-TS/effect-smol/pull/1415) [`2a16999`](https://github.com/Effect-TS/effect-smol/commit/2a169996c7513d377ac47adbfd68e1490457135c) Thanks @mikearnaldi! - HashMap: compare HAMT bit positions as unsigned to preserve entry lookup when bit 31 is set

- [#1417](https://github.com/Effect-TS/effect-smol/pull/1417) [`d42dd52`](https://github.com/Effect-TS/effect-smol/commit/d42dd52f11203f8e749fb5d3ecf7153e4a5a6814) Thanks @mikearnaldi! - unstable/http Headers: hide inspectable prototype methods from for..in iteration to avoid invalid header names in runtime fetch polyfills

- [#1418](https://github.com/Effect-TS/effect-smol/pull/1418) [`339adaf`](https://github.com/Effect-TS/effect-smol/commit/339adaf850a62a892adebcb208c2d9dddf3b97b3) Thanks @mikearnaldi! - runtime: guard keepAlive setInterval / clearInterval so Effect.runPromise works in runtimes that block timer APIs

- [#1416](https://github.com/Effect-TS/effect-smol/pull/1416) [`de19645`](https://github.com/Effect-TS/effect-smol/commit/de1964526d01102dd1cb99c8cfdd3e8df1f49ef1) Thanks @mikearnaldi! - Queue.collect: stop duplicating drained messages by appending each batch once

- [#1413](https://github.com/Effect-TS/effect-smol/pull/1413) [`9b1dc3b`](https://github.com/Effect-TS/effect-smol/commit/9b1dc3bcf2a1b68d0a67e3465db5ad01a1a56997) Thanks @gcanti! - Fix `Schema.TupleWithRest` incorrectly accepting inputs with missing post-rest elements, closes #1410.

- [#1409](https://github.com/Effect-TS/effect-smol/pull/1409) [`e4cb2f5`](https://github.com/Effect-TS/effect-smol/commit/e4cb2f55b30f4771ec1bf613ced36d6d96464dd5) Thanks @tim-smart! - add ErrorReporter module

- [#1427](https://github.com/Effect-TS/effect-smol/pull/1427) [`8bced95`](https://github.com/Effect-TS/effect-smol/commit/8bced954ecb35d4489197a57b0efe927e7d75f49) Thanks @tim-smart! - Add `Command.annotate` and `Command.annotateMerge` to unstable CLI commands, and include command annotations in `HelpDoc` so custom help formatters can access command metadata.

- [#1401](https://github.com/Effect-TS/effect-smol/pull/1401) [`9431420`](https://github.com/Effect-TS/effect-smol/commit/94314207c8019918200fbcb97aec992219f801f0) Thanks @tim-smart! - Add `WorkflowEngine.layer`, an in-memory layer for the unstable workflow engine.

- [#1428](https://github.com/Effect-TS/effect-smol/pull/1428) [`948dca2`](https://github.com/Effect-TS/effect-smol/commit/948dca22e4f672ba7a6db57f9899272bec7c08b8) Thanks @tim-smart! - Add `Command.withShortDescription` and use short descriptions for CLI subcommand listings, with fallback to the full command description.

- [#1405](https://github.com/Effect-TS/effect-smol/pull/1405) [`d18e327`](https://github.com/Effect-TS/effect-smol/commit/d18e32765a2665e31ffb31e746bf983fcfac34c5) Thanks @candrewlee14! - Strip resolved tool approval artifacts from prompt before sending to provider, preventing errors when providers reject pre-resolved approval requests.

- [#1424](https://github.com/Effect-TS/effect-smol/pull/1424) [`ab512f7`](https://github.com/Effect-TS/effect-smol/commit/ab512f7be1c0e6b359da921e22cd4944e4c57d3e) Thanks @tim-smart! - expose more atom Node properties

## 4.0.0-beta.10

### Patch Changes

- [#1396](https://github.com/Effect-TS/effect-smol/pull/1396) [`371acab`](https://github.com/Effect-TS/effect-smol/commit/371acabb58d56f3a7a5e3e33d3d5fdc9f5573c74) Thanks @gcanti! - Add `unstable/encoding` subpath export.

- [#1392](https://github.com/Effect-TS/effect-smol/pull/1392) [`856d774`](https://github.com/Effect-TS/effect-smol/commit/856d7741f1e296dd5048c6ff2b44b95d023e6ae4) Thanks @tim-smart! - Fix a race in `Semaphore.take` where interruption could leak permits after a waiter was resumed.

- [#1388](https://github.com/Effect-TS/effect-smol/pull/1388) [`b9e9202`](https://github.com/Effect-TS/effect-smol/commit/b9e92023c38caa322975d77cfe83e2d34ac9305a) Thanks @tim-smart! - Export `Effect` do notation APIs (`Do`, `bindTo`, `bind`, and `let`) from `effect/Effect` and add runtime and type-level coverage.

- [#1387](https://github.com/Effect-TS/effect-smol/pull/1387) [`1d1a974`](https://github.com/Effect-TS/effect-smol/commit/1d1a974bd280c81bff5d4505491cda03ba7a3f36) Thanks @tim-smart! - short circuit when Fiber.joinAll is called with an empty iterable

- [#1386](https://github.com/Effect-TS/effect-smol/pull/1386) [`6bfe2a6`](https://github.com/Effect-TS/effect-smol/commit/6bfe2a659bc6335db75709931f405da45301cba2) Thanks @tim-smart! - simplify http logger disabling

- [#1381](https://github.com/Effect-TS/effect-smol/pull/1381) [`b12c811`](https://github.com/Effect-TS/effect-smol/commit/b12c81157be287b1649c210616a244b50ec094d2) Thanks @tim-smart! - Fix `UrlParams.Input` usage to accept interface-typed records in HTTP client and server helpers while keeping coercion constraints for url parameter values.

- [#1383](https://github.com/Effect-TS/effect-smol/pull/1383) [`d17d98a`](https://github.com/Effect-TS/effect-smol/commit/d17d98ad78e2b44d95ef434adab79ac3c35e75ab) Thanks @tim-smart! - Rename `HttpClient.retryTransient` option `mode` to `retryOn` and rename `"both"` to `"errors-and-responses"`.

- [#1399](https://github.com/Effect-TS/effect-smol/pull/1399) [`68c3c7c`](https://github.com/Effect-TS/effect-smol/commit/68c3c7cb1e06ed94fa5c4c123a234b4ccbfdecd8) Thanks @tim-smart! - Add `Random.shuffle` to shuffle iterables with seeded randomness support.

## 4.0.0-beta.9

### Patch Changes

- [#1376](https://github.com/Effect-TS/effect-smol/pull/1376) [`3386557`](https://github.com/Effect-TS/effect-smol/commit/338655731564a7be9f8859dedbf4d5bcac6eb350) Thanks @gcanti! - HttpApiEndpoint: relax `params`, `query`, and `headers` constraints to accept a full schema in addition to a record of fields.

- [#1379](https://github.com/Effect-TS/effect-smol/pull/1379) [`b6666e3`](https://github.com/Effect-TS/effect-smol/commit/b6666e3cf6bd44ba1a8704e65c256c30359cb422) Thanks @tim-smart! - Fix `AtomHttpApi.query` to forward v4 `params` / `query` request fields to `HttpApiClient` at runtime.
  Also align `AtomHttpApi` endpoint type inference with v4 `HttpApiEndpoint` params/query naming and add a regression test.

## 4.0.0-beta.8

### Patch Changes

- [#1371](https://github.com/Effect-TS/effect-smol/pull/1371) [`246e672`](https://github.com/Effect-TS/effect-smol/commit/246e672dbbd7848d60e0c78fd66671b2f10b3752) Thanks @IMax153! - Fix `ChildProcess` options type and implement `PgMigrator`

- [#1372](https://github.com/Effect-TS/effect-smol/pull/1372) [`807dec0`](https://github.com/Effect-TS/effect-smol/commit/807dec03801b4c58a6d00c237b6d98d6386911df) Thanks @pawelblaszczyk5! - Remove superfluous error from SqlSchema.findAll signature

## 4.0.0-beta.7

### Patch Changes

- [#1366](https://github.com/Effect-TS/effect-smol/pull/1366) [`a2bda6d`](https://github.com/Effect-TS/effect-smol/commit/a2bda6d4ef6de9d9b0c53ae2df5434f778d6161a) Thanks @tim-smart! - rename SqlSchema.findOne\* apis

- [#1360](https://github.com/Effect-TS/effect-smol/pull/1360) [`1f95a2b`](https://github.com/Effect-TS/effect-smol/commit/1f95a2b5aa9524bb38f4437f4691a664bf463ca1) Thanks @tim-smart! - Add `Schedule.jittered` to randomize schedule delays between 80% and 120% of the original delay.

- [#1364](https://github.com/Effect-TS/effect-smol/pull/1364) [`a8d5e79`](https://github.com/Effect-TS/effect-smol/commit/a8d5e792fec201a83af0eb92fc79928d055125fd) Thanks @gcanti! - Schema: avoid eager resolution for type-level helpers, closes #1332

- [#1369](https://github.com/Effect-TS/effect-smol/pull/1369) [`a5386ba`](https://github.com/Effect-TS/effect-smol/commit/a5386ba67005dff697d45a45398f398773f58dcf) Thanks @tim-smart! - align HttpClientRequest constructors with http method names

- [#1369](https://github.com/Effect-TS/effect-smol/pull/1369) [`a5386ba`](https://github.com/Effect-TS/effect-smol/commit/a5386ba67005dff697d45a45398f398773f58dcf) Thanks @tim-smart! - remove body restriction for HttpClientRequest's

- [#1358](https://github.com/Effect-TS/effect-smol/pull/1358) [`06d8a03`](https://github.com/Effect-TS/effect-smol/commit/06d8a0391631e6130e3ab25227e59817852e227f) Thanks @tim-smart! - Add `LogLevel.isEnabled` for checking a log level against `References.MinimumLogLevel`.

- [#1363](https://github.com/Effect-TS/effect-smol/pull/1363) [`8caac76`](https://github.com/Effect-TS/effect-smol/commit/8caac76a35821edfe03c75dab5eb056e8fc05430) Thanks @tim-smart! - rename DurationInput to Duration.Input

- [#1363](https://github.com/Effect-TS/effect-smol/pull/1363) [`8caac76`](https://github.com/Effect-TS/effect-smol/commit/8caac76a35821edfe03c75dab5eb056e8fc05430) Thanks @tim-smart! - DateTime.distance now returns a Duration

- [#1367](https://github.com/Effect-TS/effect-smol/pull/1367) [`f9e883e`](https://github.com/Effect-TS/effect-smol/commit/f9e883e266fbda870336ee62f46b7ac85ba3de6e) Thanks @tim-smart! - refactor SqlSchema apis

- [#1363](https://github.com/Effect-TS/effect-smol/pull/1363) [`8caac76`](https://github.com/Effect-TS/effect-smol/commit/8caac76a35821edfe03c75dab5eb056e8fc05430) Thanks @tim-smart! - remove rpc client nesting to improve type performance

## 4.0.0-beta.6

### Patch Changes

- [#1338](https://github.com/Effect-TS/effect-smol/pull/1338) [`3247da2`](https://github.com/Effect-TS/effect-smol/commit/3247da28331f345f68be5dbd2974a7e03d300fe1) Thanks @Leka74! - Add `showOperationId` to `HttpApiScalar.ScalarConfig`.

- [#1326](https://github.com/Effect-TS/effect-smol/pull/1326) [`f205705`](https://github.com/Effect-TS/effect-smol/commit/f2057050dbd034b8c186be2d40c3d03ee63a5a3b) Thanks @gcanti! - Schema: add `BigDecimal` schema with comparison checks (`isGreaterThanBigDecimal`, `isGreaterThanOrEqualToBigDecimal`, `isLessThanBigDecimal`, `isLessThanOrEqualToBigDecimal`, `isBetweenBigDecimal`).

- [#1328](https://github.com/Effect-TS/effect-smol/pull/1328) [`f35022c`](https://github.com/Effect-TS/effect-smol/commit/f35022c212e4111527e1bb43f360a67b2b49fa85) Thanks @gcanti! - Schema: add `DateTimeZoned`, `TimeZoneOffset`, `TimeZoneNamed`, and `TimeZone` schemas.

- [#1325](https://github.com/Effect-TS/effect-smol/pull/1325) [`8622721`](https://github.com/Effect-TS/effect-smol/commit/86227217b02d43680a3c6f3c21731b1d852c91f5) Thanks @KhraksMamtsov! - Make `Data.Class`, `Data.TaggedClass`, and `Cause.YieldableError` pipeable.

- [#1323](https://github.com/Effect-TS/effect-smol/pull/1323) [`fc660ab`](https://github.com/Effect-TS/effect-smol/commit/fc660ab8b5ebae38b8d6b96cbf2f9b880cc09253) Thanks @KhraksMamtsov! - Port `Pipeable.Class` from v3.

  ```ts
  class MyClass extends Pipeable.Class() {
    constructor(public a: number) {
      super();
    }
    methodA() {
      return this.a;
    }
  }
  console.log(new MyClass(2).pipe((x) => x.methodA())); // 2
  ```

  ```ts
  class A {
    constructor(public a: number) {}
    methodA() {
      return this.a;
    }
  }
  class B extends Pipeable.Class(A) {
    constructor(private b: string) {
      super(b.length);
    }
    methodB() {
      return [this.b, this.methodA()];
    }
  }
  console.log(new B("pipe").pipe((x) => x.methodB())); // ['pipe', 4]
  ```

- [#1337](https://github.com/Effect-TS/effect-smol/pull/1337) [`f37dc33`](https://github.com/Effect-TS/effect-smol/commit/f37dc335f64622fa9ce8d6d1d5dd8fc3f260257b) Thanks @IMax153! - Encoding: consolidate `effect/encoding` sub-modules (Base64, Base64Url, Hex, EncodingError) into a top-level `Encoding` module. Functions are now prefixed: `encodeBase64`, `decodeBase64`, `encodeHex`, `decodeHex`, etc. The `effect/encoding` sub-path export is removed.

- [#1351](https://github.com/Effect-TS/effect-smol/pull/1351) [`3662f32`](https://github.com/Effect-TS/effect-smol/commit/3662f328fcfa3b2fa01ffa79da40e12e93fcede8) Thanks @tim-smart! - add `Schema.HashSet` for decoding and encoding `HashSet` values.

- [#1336](https://github.com/Effect-TS/effect-smol/pull/1336) [`a7d436f`](https://github.com/Effect-TS/effect-smol/commit/a7d436f438dcd7f49b9485e4e95a4511f31fad7d) Thanks @mikearnaldi! - Extract `Semaphore` and `Latch` into their own modules.

  `Semaphore.make` / `Semaphore.makeUnsafe` replace `Effect.makeSemaphore` / `Effect.makeSemaphoreUnsafe`.
  `Latch.make` / `Latch.makeUnsafe` replace `Effect.makeLatch` / `Effect.makeLatchUnsafe`.

  Merge `PartitionedSemaphore` into `Semaphore` as `Semaphore.Partitioned`, `Semaphore.makePartitioned`, `Semaphore.makePartitionedUnsafe`.

- [#1345](https://github.com/Effect-TS/effect-smol/pull/1345) [`6856a41`](https://github.com/Effect-TS/effect-smol/commit/6856a415d7eddd9d73d60919e976f1d071421be4) Thanks @tim-smart! - allocate less effects when reading a file

- [#1350](https://github.com/Effect-TS/effect-smol/pull/1350) [`8c417d0`](https://github.com/Effect-TS/effect-smol/commit/8c417d03475e5e12d00dca0c4781d0af7e66b86c) Thanks @tim-smart! - Add "Previously Known As" JSDoc migration notes for the `Semaphore` and `Latch` APIs extracted from `Effect`.

- [#1355](https://github.com/Effect-TS/effect-smol/pull/1355) [`5419570`](https://github.com/Effect-TS/effect-smol/commit/5419570ba47ce882a3a10882707b46f66e464906) Thanks @tim-smart! - ensure non-middleware http errors are correctly handled

- [#1352](https://github.com/Effect-TS/effect-smol/pull/1352) [`449c5ed`](https://github.com/Effect-TS/effect-smol/commit/449c5ed5318e8a874e730420bcf52918fa2ec80f) Thanks @tim-smart! - Add `Schema.HashMap` for decoding and encoding `HashMap` values.

- [#1347](https://github.com/Effect-TS/effect-smol/pull/1347) [`4b5ec12`](https://github.com/Effect-TS/effect-smol/commit/4b5ec12f87f95f2a3cd8fe4d5b26c6eb0529381a) Thanks @tim-smart! - use .toJSON for default .toString implementations

- [#1329](https://github.com/Effect-TS/effect-smol/pull/1329) [`df87937`](https://github.com/Effect-TS/effect-smol/commit/df879375fc3b169c43f9c434b3775e12b80dffe4) Thanks @gcanti! - Schema: extract shared `dateTimeUtcFromString` transformation for `DateTimeUtc` and `DateTimeUtcFromString`.

- [#1318](https://github.com/Effect-TS/effect-smol/pull/1318) [`5dbfca8`](https://github.com/Effect-TS/effect-smol/commit/5dbfca8d1dbb6d18d1605d4f8562e99c86e2ff11) Thanks @gcanti! - Schema: rename `$` suffix to `$` prefix for type-level identifiers that conflict with built-in names (`Array$` → `$Array`, `Record$` → `$Record`, `ReadonlyMap$` → `$ReadonlyMap`, `ReadonlySet$` → `$ReadonlySet`).

- [#1356](https://github.com/Effect-TS/effect-smol/pull/1356) [`e629497`](https://github.com/Effect-TS/effect-smol/commit/e6294973d55597ab6b6deca6babbe1e946b2c91d) Thanks @tim-smart! - allow passing void for request constructors

- [#1348](https://github.com/Effect-TS/effect-smol/pull/1348) [`981c991`](https://github.com/Effect-TS/effect-smol/commit/981c991cd78db34def815d5754379d737157f005) Thanks @tim-smart! - Fix `Schedule.andThenResult` to initialize the right schedule only after the left schedule completes.
  This removes the extra immediate transition tick and correctly completes when the right schedule is finite.

- [#1320](https://github.com/Effect-TS/effect-smol/pull/1320) [`1ca2ed6`](https://github.com/Effect-TS/effect-smol/commit/1ca2ed67301a5dc40ae0ed94346b99f26fd22bbe) Thanks @gcanti! - Struct: add `Struct.Record` constructor for creating records with the given keys and value.

- [#1342](https://github.com/Effect-TS/effect-smol/pull/1342) [`45722bd`](https://github.com/Effect-TS/effect-smol/commit/45722bde974458311f11ad237711363a10ec6894) Thanks @cevr! - `Schema.TaggedErrorClass`, `Schema.Class`, and `Schema.ErrorClass` constructors now allow omitting the props argument when all fields have constructor defaults (e.g. `new MyError()` instead of `new MyError({})`).

- [#1322](https://github.com/Effect-TS/effect-smol/pull/1322) [`eb2a85e`](https://github.com/Effect-TS/effect-smol/commit/eb2a85ed4dc162b2535d304799333a5a20477fd0) Thanks @tim-smart! - Add a `requireServicesAt` option to `PersistedCache.make` so lookup-service requirements can be configured like `Cache`.

## 4.0.0-beta.5

### Patch Changes

- [#1317](https://github.com/Effect-TS/effect-smol/pull/1317) [`f6e133e`](https://github.com/Effect-TS/effect-smol/commit/f6e133e9a16b32317bd09ff08c12b97a0ae44600) Thanks @tim-smart! - support tag unions in Effect.catchTag/Reason

- [#1314](https://github.com/Effect-TS/effect-smol/pull/1314) [`e3893cc`](https://github.com/Effect-TS/effect-smol/commit/e3893ccf2632338c7d8e745f639dcd825a9d42f8) Thanks @zeyuri! - Fix `Atom.serializable` encode/decode for wire transfer.

  Use `Schema.toCodecJson` instead of `Schema.encodeSync`/`Schema.decodeSync` directly, so that encoded values are plain JSON objects that survive serialization roundtrips (JSON, seroval, etc.). Previously, `AsyncResult.Schema` encode produced instances with custom prototypes that were lost after wire transfer, causing decode to fail with "Expected AsyncResult" errors during SSR hydration.

- [#1315](https://github.com/Effect-TS/effect-smol/pull/1315) [`a88e206`](https://github.com/Effect-TS/effect-smol/commit/a88e206e44dc66ca5a2b45bedc797877c5dbb083) Thanks @tim-smart! - add Filter.reason api

- [#1314](https://github.com/Effect-TS/effect-smol/pull/1314) [`e3893cc`](https://github.com/Effect-TS/effect-smol/commit/e3893ccf2632338c7d8e745f639dcd825a9d42f8) Thanks @zeyuri! - Port ReactHydration to effect-smol.

  Add `Hydration` module to `effect/unstable/reactivity` with `dehydrate`, `hydrate`, and `toValues` for SSR state serialization. Add `HydrationBoundary` React component to `@effect/atom-react` with two-phase hydration (new atoms in render, existing atoms after commit).

## 4.0.0-beta.4

### Patch Changes

- [#1308](https://github.com/Effect-TS/effect-smol/pull/1308) [`c5a18ef`](https://github.com/Effect-TS/effect-smol/commit/c5a18ef44171e3880bf983faee74529908974b32) Thanks @tim-smart! - improve Schema.TaggedUnion .match auto completion

- [#1310](https://github.com/Effect-TS/effect-smol/pull/1310) [`bc6b885`](https://github.com/Effect-TS/effect-smol/commit/bc6b885b94d887a200657c0775dfa874dc15bc0c) Thanks @tim-smart! - Add `Schedule.duration`, a one-shot schedule that waits for the provided duration and then completes.

## 4.0.0-beta.3

### Patch Changes

- [#1303](https://github.com/Effect-TS/effect-smol/pull/1303) [`3a0cf36`](https://github.com/Effect-TS/effect-smol/commit/3a0cf36eff106ba48d74e133c1598cd40613e530) Thanks @tim-smart! - add Result.failVoid

- [#1307](https://github.com/Effect-TS/effect-smol/pull/1307) [`c4da328`](https://github.com/Effect-TS/effect-smol/commit/c4da328d32fad1d61e0e538f5d371edf61521d7e) Thanks @tim-smart! - Add `HttpClientRequest.bodyFormDataRecord` and `HttpBody.makeFormDataRecord` helpers for creating multipart form bodies from plain records.

## 4.0.0-beta.2

### Patch Changes

- [#1302](https://github.com/Effect-TS/effect-smol/pull/1302) [`a22ce73`](https://github.com/Effect-TS/effect-smol/commit/a22ce73b2bd9305b7ba665694d2255c0e6d5a8d0) Thanks @tim-smart! - allow undefined for VariantSchema.Overridable input

- [#1299](https://github.com/Effect-TS/effect-smol/pull/1299) [`ebdabf7`](https://github.com/Effect-TS/effect-smol/commit/ebdabf79ff4e62c8384aa8cf9a8d2787d536ee78) Thanks @tim-smart! - Port `SqlSchema.findOne` from effect v3 to return `Option` on empty results and add `SqlSchema.single` for the fail-on-empty behavior.

- [#1298](https://github.com/Effect-TS/effect-smol/pull/1298) [`8f663bb`](https://github.com/Effect-TS/effect-smol/commit/8f663bb121021bf12bd264e8ae385187cb7a5dae) Thanks @tim-smart! - Add `Effect.catchNoSuchElement`, a renamed port of v3 `Effect.optionFromOptional` that converts `NoSuchElementError` failures into `Option.none`.

## 4.0.0-beta.1

### Patch Changes

- [#1293](https://github.com/Effect-TS/effect-smol/pull/1293) [`0fecf70`](https://github.com/Effect-TS/effect-smol/commit/0fecf70048057623eed7c584a06671773a2b1743) Thanks @mikearnaldi! - Add `Effect.filter` support for synchronous `Filter.Filter` overloads and correctly handle non-effect `Result` return values at runtime.

- [#1294](https://github.com/Effect-TS/effect-smol/pull/1294) [`709569e`](https://github.com/Effect-TS/effect-smol/commit/709569ed76bead9ebb0670599e4d890a07ca5a43) Thanks @tim-smart! - Fix `Prompt.text` and related text prompts to initialize from `default` values so users can edit the default input directly.

## 4.0.0-beta.0

### Major Changes

- [#1183](https://github.com/Effect-TS/effect-smol/pull/1183) [`be642ab`](https://github.com/Effect-TS/effect-smol/commit/be642ab1b3b4cd49e53c9732d7aba1b367fddd66) Thanks @tim-smart! - v4 beta
