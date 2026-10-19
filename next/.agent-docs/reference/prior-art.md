# Prior art

What we already tried, and what neighbouring libraries do. Proposals link here instead of repeating it.

## Abandoned tRPC experiments referenced in the [brief](../decisions/brief.md)

### Generic builder: [#6027](https://github.com/trpc/trpc/pull/6027) "wip - making a standalone middleware library"

- KATT, draft, Sep 2024, closed Nov 2025. Local branch `09-29-mws`. Related local RFC branch `02-18-mws-rfc` (`.rfcs/25-02-middlewares.md`).
- Goal: "Move the middleware abstraction and the base of the procedure builder out of tRPC so other libraries can leverage it." Use cases: an RSC-only library adding `.action()`, standalone apps, OpenAPI adapters, and `@trpc/server` adding `.query()`/`.mutation()` on top.
- **One options-bag generic** instead of positional generics (commit "1 generic to rule them all"):

  ```ts
  interface MiddlewareOptions {
    ctx: any;
    ctx_overrides: any;
    meta: any;
    input_in: any;
    input_out: any;
    output_in: any;
    output_out: any;
    errors: any[];
  }
  ```

- Extension attempt 1: `declare module` augmentation of the builder. Rejected in the PR description because it pollutes the global scope.
- Extension attempt 2: a Redux Toolkit–style module registry, `buildApi([coreModule(), extensionModule()])`, where each module registers builder props under a unique symbol in a `BuilderModules` interface.
- **State:** types only. Every runtime `init()` throws `'Not implemented'`. Stalled on type complexity (last commits: "i give up for today").
- The caller half of the idea shipped separately as `experimental_caller()` ([#5584](https://github.com/trpc/trpc/pull/5584), [#5589](https://github.com/trpc/trpc/pull/5589)).
- Earlier attempts: [#4200](https://github.com/trpc/trpc/pull/4200) `createProcedureExtension` ("a dead end thanks to TS type complexity problems") and [#5047](https://github.com/trpc/trpc/pull/5047) `composeMiddlewares` RFC.

**Lessons for vNext (proposal 03):** the options-bag generic is worth keeping. Open-ended builder extension is where it died, so we should avoid it in v1. Opt-in callers work fine as plain wrapper functions.

### Errors returned and inferred: [#5554](https://github.com/trpc/trpc/pull/5554) "infer errors"

- KATT, draft, Mar 2024. Branch `03-08-infer-error`. "Idea is to make it to be used in server actions."
- Middlewares **return** `trpcError({...})` instead of throwing, behind `.experimental_inferErrors()`. `ProcedureBuilder` gains a `TError` generic that `.use()` accumulates:

  ```ts
  const proc = procedure.experimental_inferErrors().use((opts) => {
    if (opts.ctx.foo !== 'bar')
      return trpcError({ code: 'UNAUTHORIZED', foo: 'bar' as const });
    return opts.next();
  });
  // inferError<typeof proc> = { code: 'UNAUTHORIZED'; foo: 'bar' }
  ```

- Consumed only by `createCaller` and the RSC data layer in [#5569](https://github.com/trpc/trpc/pull/5569) (`experimental_createDataLayer`, `.action(proc)` returning `{ ok: true, output } | { ok: false, error }`). Never reached the HTTP client or react-query.

**Lessons (proposal 07):** returning errors from middlewares and handlers gives inference with no declarations. The missing piece was carrying the inferred union through the client and integrations.

### Declared errors: [#7279](https://github.com/trpc/trpc/pull/7279) and the merged `.errors()` formatter [#7591](https://github.com/trpc/trpc/pull/7591)

- #7279 (Nick Lucas, 2026, closed): `createTRPCDeclaredError({ code, key }).data<…>().create(...)`, `t.procedure.errors([BadPhoneError])`, `error.isDeclaredError('BAD_PHONE')`, `const [result, error] = safe(...)`.
- Closed in favour of **#7591** (merged Sep 2026): per-procedure `.errors((opts) => shape | undefined)` formatters that claim or decline errors, chained from the tail backwards, with the global `errorFormatter` as the fallback. The client infers the union of all formatter return shapes. See `examples/minimal-per-procedure-errors`.

**Lessons (proposal 07):** the team recently preferred mapping domain errors in formatters over declaring error classes. Any vNext design should be able to express that pattern.

### Links informing call options: [#5498](https://github.com/trpc/trpc/pull/5498) "experimenting with standalone React-client"

- KATT, Feb 2024. Branch `02-19-standalone`. KATT later cited it in [#6421](https://github.com/trpc/trpc/pull/6421): typed client context should come from "`links` themselves [having] an impact on the context, e.g. adding a `cacheLink` would make a `.cache`-property available … very hard, have played with it in #5498", or from a second generic.
- Links declare a "decoration" (`query`/`mutation`/`subscription` call options plus runtime additions). A curried helper infers them from the links tuple:

  ```ts
  const getTrpcOptions = createTRPCClientOptions<AppRouter>()(() => ({
    links: [cacheLink(), loggerLink(), httpBatchLink({ url })],
  }));
  export const standaloneClient = createReactClient(getTrpcOptions);
  client.greeting.query({ text }, { ignoreCache: true }); // typed from cacheLink
  ```

- **No `satisfies ClientOptions` was found** in any tRPC PR. The only `satisfies CreateTRPCClientOptions` is in a test helper from [#6383](https://github.com/trpc/trpc/pull/6383). The memory may be mixed with [#5242](https://github.com/trpc/trpc/pull/5242) (`satisfies TRPCRouter`).
- The same PR prototyped a **`use()`-native React client** (`createReactClient`, request dedupe, re-render on link emissions). This is relevant to proposal 20.
- State: `createTRPCClient()` itself dropped the decoration (`opts as FIXME`), and `mutate` reused the `query` decoration. Last commits: "this is very confusing".

**Lessons (proposal 17):** without partial type-argument inference, `createTRPCClient<AppRouter>({ links })` cannot also infer link types. Some other shape is needed: currying, a `types` field, `Register` augmentation, or a return-type annotation.

### Other KATT experiments worth remembering

| PR                                                                                                                                                | Idea                                                                                           | Relevance |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------- |
| [#5225](https://github.com/trpc/trpc/pull/5225), [#5331](https://github.com/trpc/trpc/pull/5331)                                                  | `@trpc/core` package                                                                           | 01        |
| [#5242](https://github.com/trpc/trpc/pull/5242)                                                                                                   | `satisfies TRPCRouter` to keep `ctx` out of published types                                    | 01, 09    |
| [#6423](https://github.com/trpc/trpc/pull/6423)                                                                                                   | Input callback with `ctx`; "now that Standard Schema is out, we can … only support schemas"    | 05        |
| [#6587](https://github.com/trpc/trpc/pull/6587)                                                                                                   | `opts.next({ x })` instead of `opts.next({ ctx: { x } })`                                      | 06        |
| [#6488](https://github.com/trpc/trpc/pull/6488)                                                                                                   | Return `Response`s from procedures                                                             | 04        |
| [#4858](https://github.com/trpc/trpc/pull/4858), [#4911](https://github.com/trpc/trpc/pull/4911)                                                  | Superjson replacement / streaming serialization ([tupleson](https://github.com/KATT/tupleson)) | 11, 14    |
| [#6184](https://github.com/trpc/trpc/pull/6184)                                                                                                   | Standalone `queryOptions` package on React 19                                                  | 19, 20    |
| [#5676](https://github.com/trpc/trpc/pull/5676)                                                                                                   | Fetch-based response resolution (shipped in v11)                                               | 12        |
| [#7348](https://github.com/trpc/trpc/pull/7348), [#7352](https://github.com/trpc/trpc/pull/7352), [#7205](https://github.com/trpc/trpc/pull/7205) | TS7/tsgo, replacing Lerna, oxfmt/oxlint                                                        | 22        |

### danSON ([KATT/danson](https://github.com/KATT/danson), `danson@0.13.1`)

Referenced in the [brief](../decisions/brief.md) as the model for tRPC's serializer. It is a "progressive JSON" serializer.

- **Sync API:** `stringifySync`/`parseSync` produce `{ json, refs? }`. Non-JSON values are inline markers, `{ "_": "$", "type": "Date", "value": "…" }`. Constants are placeholder strings (`"$undefined"`, `"$NaN"`), and `$`-prefixed strings are escaped. Optional de-duplication; circular references via `refs`.
- **Async API:** `stringifyAsync`/`parseAsync` (and an event-stream variant). Streams `Promise`, `AsyncIterable` and `ReadableStream` values at any depth: a head chunk with placeholders, then `[index, status, { json }]` chunks (0 = value, 1 = failure, 2 = return).
- **`std` types:** BigInt, Date, Headers, Map, Set, RegExp, TypedArrays, URL, URLSearchParams, undefined, NaN, ±Infinity, -0. Custom types via `serializers`/`deserializers` records and `TransformerPair<TOriginal, TSerialized>`.

**Lessons (proposals 10, 11, 14):** one format can cover rich types, deferred values and streams. That would replace v11's transformer + JSONL + WebSocket-encoder trio. The open work is a legible query-param encoding for GET inputs and hardening for untrusted input.

## Effect v4 (`effect@4.0.2`, vendored in `.repos/effect`)

Verified from source. Many v3-era and v4-beta assumptions are **wrong** for 4.0.2:

- Services are `Context.Service` / `Context.Reference`. There is no `ServiceMap`, `Context.Tag` or `Effect.Service`.
- Former packages are folded into `effect` under plain paths: `effect/http`, `effect/http-api`, `effect/rpc`, `effect/socket`, … There is **no** `effect/unstable/*`. These modules are marked `@stability unstable` in JSDoc, which means breaking changes can land in minor releases (`MIGRATION.md`).
- Schema lives in `effect/Schema`. Schemas are **not** Standard Schema by default; use `Schema.toStandardSchemaV1(schema)` and `Schema.toStandardJSONSchemaV1(schema)`. Typed errors: `Schema.TaggedError`, `Data.TaggedError`.
- `effect/Micro` is gone. A minimal Effect program is ~6.3 KB min+gzip, ~15 KB with Schema (`MIGRATION.md`).
- Promise interop: `Effect.runPromise(effect, { signal })`, `runPromiseExit`, `runFork`, `ManagedRuntime.make(layer)`, `Effect.tryPromise({ try: (signal) => …, catch })`.
- Streams: `Stream.fromAsyncIterable`, `Stream.toAsyncIterable`, `Stream.fromReadableStream`, `Stream.toReadableStream`.
- Web handlers: `HttpEffect.toWebHandler`, `HttpRouter.toWebHandler`, `HttpServerRequest.fromWeb`. Node: `@effect/platform-node` `NodeHttpServer.makeHandler`. Note that `@effect/platform-node` depends on `undici` and `@effect/platform-node-shared`.

### `effect/rpc`

- `Rpc.make("Tag", { payload, success, error, stream: true })` (an options bag), grouped with `RpcGroup.make(...)`, implemented with `Group.toLayer({ Tag: (payload) => Effect | Stream })`.
- Middleware is a service with `provides` / `requires`: it can provide a service such as `CurrentUser` to handlers. This is the Effect-native analogue of tRPC context injection.
- Serialization: JSON, NDJSON, JSON-RPC, SchemaBinary (no msgpack). Protocols: HTTP, WebSocket, socket, stdio, workers.
- Schema-first: every RPC needs Effect schemas, and the wire format is Effect-specific. That makes it good reference material but not a protocol we can adopt for schema-less tRPC procedures.

### `effect/http-api`

- `HttpApiEndpoint.get("name", "/path", { params, query, headers, payload, success, error })` with OpenAPI generation (`OpenApi`, Scalar/Swagger). It also supports the HTTP **`QUERY`** method (`HttpApiEndpoint.query`).

## oRPC (`v1.15.5`)

Designs worth borrowing (see `orpc-parity.md` for the full feature list). Written against v1.15.5; v2's [`apps/content/docs/migrations/from-v1.mdx`](https://github.com/middleapi/orpc/blob/v2.0.0-beta.44/apps/content/docs/migrations/from-v1.mdx) lists what changed (several names below are gone).

- **Builder:** `os.$context<T>()`, `.$meta`, `.$route`, `.$input`, `.$config`; `.errors(map)`, `.use(mw, mapInput)`, `.route()`, `.prefix()`, `.tag()`, `.router()`, `.lazy()`, `.handler()`, `.callable()`, `.actionable()` (`packages/server/src/builder.ts`). There are no query/mutation/subscription types; everything is `.handler()`.
- **Errors:** `.errors({ CODE: { status?, message?, data?: schema } })`, `errors.CODE({ data })` constructors in handler and middleware options, `ORPCError`, `isDefinedError`, `safe()` returning `[error, data, isDefined]` or the object form, `createSafeClient`.
- **Contract-first:** `oc` contract builder, `implement(contract)`, `minifyContractRouter(router)` to JSON for clients.
- **Handlers** (`RPCHandler`, `OpenAPIHandler`) are created once, then `handle(request, { prefix, context })` returns `{ matched, response }`. Plugins and interceptors run at several lifecycle stages.
- **RPC protocol:** path-based routing (`/rpc/planet/create`), `{ json, meta }` payloads where `meta` lists native-type paths (bigint, date, nan, undefined, url, regexp, set, map), `FormData` with a `maps` field for files, and errors as `{ defined, code, status, message, data }`.
- **Client:** `createORPCClient(link)` typed by return annotation (`const client: RouterClient<typeof router, ClientContext> = …`), typed `ClientContext` per call, `DynamicLink`, `consumeEventIterator`.
- **TanStack Query:** `createTanstackQueryUtils(client)` with option-bag `queryOptions({ input, context })`, `infiniteOptions({ input: (pageParam) => … })`, `streamedOptions`, `liveOptions`, `.key()` for partial keys. No provider is required.
- **OpenAPI:** `.route({ method, path, successStatus, inputStructure: 'compact' | 'detailed', outputStructure, tags, summary, spec })`, bracket notation, smart coercion, per-library JSON Schema converters (`@orpc/zod`, `@orpc/valibot`, `@orpc/arktype`).
- **Interop:** `@orpc/trpc` converts a tRPC router into an oRPC router (`toORPCRouter`) to get OpenAPI. That is effectively a migration path away from tRPC.

## Standard Schema / Standard JSON Schema

- Standard Schema v1 (`~standard.validate`) is implemented by Zod (≥3.24), Valibot, ArkType and others.
- **Standard JSON Schema v1** (`~standard.jsonSchema.input(opts)` / `.output(opts)`, targets `draft-2020-12`, `draft-07`, `openapi-3.0`) is implemented by **Zod 4.2** (verified in `node_modules/zod/v4/core/standard-schema.d.ts`), and Effect provides it via `Schema.toStandardJSONSchemaV1`. This lets OpenAPI generation work without oRPC-style converter packages (proposal 18).
