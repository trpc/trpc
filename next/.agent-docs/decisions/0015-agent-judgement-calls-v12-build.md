# 0015 — Agent judgement calls for the first v12 build

| Proposal  | Date       | Status      | Supersedes | Superseded by                                                                      |
| --------- | ---------- | ----------- | ---------- | ---------------------------------------------------------------------------------- |
| (several) | 2026-10-10 | provisional | —          | [0018](./0018-platforms-through-effect-layers.md) (`trpcdev/node`, "no `ws`" rows) |

Alex asked for a first build of v12 "following what we've said in ideas.md. For decisions where you're waiting for human, make a judgement call — refactoring is cheap and we can do that later." Every call below is the agent's, not Alex's. Each one is cheap to revisit. Where a call departs from a proposal's recommendation, the reason is given.

A second pass ("do all of it") built every follow-up the first pass listed. The sections below describe the build as it now stands.

## Decision

### Builder and procedures (03, 04)

- **Q3.2 generics:** G-A, a mapped definition bag. The builder carries one `TDef` object type.
- **Q3.3 errors on `t`:** no `t.error`; errors come from `error()` (07).
- **Q4.1 procedure types:** T-A, keep `query`, `mutation` and `subscription`.
- **Resolver options:** `{ ctx, input, meta, path, type, signal, response, errors }`, plus `lastEventId` on subscriptions.
  - `response` (04 (d) R-A) has `headers` and a settable `status`. In a batch, headers from every call are merged (`set-cookie` is appended) and `status` is ignored. The batch response therefore waits for every call's head before it starts; deferred values still stream after that. WebSockets and message ports ignore both.
  - `errors` holds a constructor for each error declared with `.errors()`.
- **`.output()`** validates by default. The resolver returns the schema's input type, and the client sees its output type. On a subscription, `.output()` types each event. Resolvers may yield `tracked(id, data)` events whose `data` matches, and the client then sees `TrackedEnvelope<Output>`.
- **`.route()`** (04 (g)) holds REST metadata: method, path, status, summary, tags, `inputStructure` and `outputStructure`. The RPC endpoint ignores it; OpenAPI (18) reads it.

### Validation (05)

- **Q5.1:** V-A, Standard Schema and Effect Schema only (0012).
- **Q5.3:** C-A, inputs chain. Each schema sees the raw input, and object outputs are merged.
- **Q5.6:** D-A, `.input(({ ctx, meta, path }) => schema)` is the context-aware form. D-C (Effect Schema services) works too, because inputs are decoded with the procedure's provided services.

### Middleware (06)

- **N-A:** `next({ ctx })`.
- Middleware may return a `TRPCError` instead of calling `next()`. It short-circuits the call, and the error joins the procedure's error union (07 B).
- **`ok(value)`** (Q6.2) also short-circuits, with a value. The resolver does not run, but output validation does. The terminal checks the value against the procedure's output, through a phantom `'~short'` type. A phantom is needed because `next()`'s results would otherwise be inferred as shorts.
- **Standalone middleware:** `t.middleware(fn)` types `fn` against the root, and a middleware is a plain function, so the builder checks requirements through parameter contravariance.
- **Effect middleware (M-A):**
  - Made with `t.middleware.effect<{ provides?: S }>()(fn)`, or the standalone `middleware.effect<{ ctx?, meta?, input?, provides? }>()(fn)`.
  - `next()` returns an `Effect` that requires the declared `provides`, so a body that forgets to provide them does not compile.
  - The body's failures join the error union. Its requirements join the procedure's services, and `provides` is removed from them.
- **`.provide(Service, (opts) => value | Effect)`** stays alongside Effect middleware for the common one-service case.
- **Lifecycle helpers:** `onStart`, `onSuccess`, `onError` and `onFinish` are middleware factories, not hook options. They nest like any middleware, so `onFinish` added first observes everything after it.

### Effect (02)

- **Q2.1:** A1, one builder with runtime detection of `Effect`, `Stream`, `AsyncIterable` and `Promise` returns.
- **Q2.2:** S1, inferred services. The proposal recommends S2, but with plain-object routers (08 A) nothing carries a declared set, so the handler would have to be given `t`. Under S1 the router type carries `R`, and the handler's `layer` must provide `inferRouterServices<typeof router>`.
- **Q2.3:** d.ii.
  - A resolver whose `Effect` or `Stream` can fail with something other than a `TRPCError` is a compile error: "Map Effect failures to a TRPCError (e.g. Effect.catchTag) before returning them". The same check applies to Effect middleware bodies and `.provide()` factories.
  - At runtime the d.i behaviour stays as a safety net: an unmapped failure becomes a masked `INTERNAL_SERVER_ERROR`.
- **`call(procedure, input, { ctx, layer })`** and `createRouterClient(router, { ctx, layer })` both take a `layer`.

### Errors (07)

- The combined model. One isomorphic `TRPCError` class, built on Effect's `Data.Error` so it is yieldable, with `code`, `status`, `data` and `defined`.
- `error({ code, data?, message?, status? })` constructs one. Returned or failed `TRPCError`s are inferred into the union.
- **Declared errors (07 A):** `.errors({ NOT_FOUND: { status?, message?, data?: schema } })`.
  - The resolver gets a typed constructor for each code in `errors`.
  - Errors made by these constructors are `defined` even when thrown from helper code; a WeakSet records which errors came from a constructor.
  - `data` is validated. Invalid data is an unexpected error, because sending it would break the client's types.
- **Q7.3 `safe()`:** returns `[data, error]` that also carries `{ data, error }` properties, so both destructuring styles work.
- **Q7.5 (0003):** unexpected errors are masked unless the handler sets `exposeUnexpectedErrors: true`. It defaults to `true` only when `NODE_ENV` is `development` or `test`. Every handler shares this through one handler core.
- **Q7.7:** one class, the same `TRPCError` on server and client.

### Routers and server-side calls (08, 15)

- **Q8.1:** A, plain objects. Keys are path segments, and `mergeRouters` rejects duplicates (0010).
- **Path separator (Q10.2):** `.`, in both `path` and URLs (`/trpc/post.byId`).
- **SC-A:** `createRouterClient(router, { ctx, layer })` has the same shape as the HTTP client, so tests and SSR read the same. `call(procedure, input, { ctx, layer })` exists for a single procedure.

### Contract-first (09)

- **Q9.1:** resolver-less terminals (0009). `contract.create<{ meta }>()` returns a builder with `.input()`, `.output()`, `.errors()`, `.route()`, `.meta()` and `.query()` / `.mutation()` / `.subscription({ tracked? })`.
  - A contract procedure is an ordinary `Procedure` whose `resolver` is `undefined`. Clients, `generateOpenAPI` and `toContract` therefore accept contracts and routers alike.
  - The builder has its own small runtime, so a contract package doesn't load the server's execution code.
  - **Added:** `subscription({ tracked: true })`. Over the wire, a tracked event is `{ id, data }`, so a contract has to say whether its events are tracked for clients to be typed correctly.
- **Q9.2:** the mirror tree. `t.implement(contract)` returns builders pre-loaded with each leaf's input, output, errors and route.
  - Leaves offer only `.use()`, `.provide()` and the contract's terminal.
  - `impl.router()` checks completeness at the type level and at runtime: missing keys, extra keys and wrong procedure types.
  - `impl.router()` is generic, so each procedure's service requirements reach the handler. A manual `ExactRouter` check restores the excess-key error that a generic would otherwise lose (the spike's concern).
  - A top-level contract key named `router` would shadow `impl.router()`, so `t.implement()` throws on one.
- **Q9.3:** no. Implementations may only return errors the contract declares; this applies to resolvers and middleware alike. Thrown errors are never typed, so they are still allowed.
- **Q9.4:** yes. `toContract(router)` emits `{ version: 1, procedures: { [path]: { type, route?, input?, output?, errors? } } }` with JSON Schemas. It carries the router's client type through the `RouterType` brand, so `createTRPCClient({ router: contractJSON })` is typed. `inferContract<typeof router>` gives the same client types as `typeof router`.

### Protocol and serialization (10, 11, 14)

- **10 Option B**, as written, with these specifics:
  - Bodies keep danSON's `{ json, refs? }` wrapper. Dropping it is a follow-up.
  - Queries use `GET` with legible params (QP-C) and fall back to `POST` above `maxURLLength`. Mutations require `POST` with `content-type: application/json`, which is the CSRF guard.
  - Errors are `{ error: { code, message, data, defined } }`, with the status from the error.
  - Batching is `POST {base}` with `trpc-batch: 1`, answered with JSONL lines in completion order: `{ i, status, body }`, plus `{ i, chunk }` for deferred values.
  - Deferred values (a `Promise` or `AsyncIterable` nested in an output) stream as JSONL using danSON's async format. The server only switches to JSONL when the output contains one, so plain responses stay `application/json`.
  - Subscriptions use fetch-streamed SSE (0006).
    - Each event's `data:` is one serialized value. `tracked(id, data)` sets `id:`, and the client resumes with `last-event-id`.
    - An `event: error` carries a serialized error, and `event: done` ends the stream.
    - **Deferred values inside events** are sent as `event: deferred` with `data: { e, body }`, where `e` numbers the event. Their chunks follow as `event: chunk` with `data: { e, chunk }`, and `{ e }` alone ends that event's chunks. The next event is not held back while an earlier one streams.
  - `trpc-version: 1` on requests and responses. A mismatch is `UNSUPPORTED_PROTOCOL` (400).
- **WebSocket and MessagePort protocol** (10, 12, 0005): JSON messages over one connection, carrying many calls.
  - The client sends `{ type: 'init', version, connectionParams? }` first.
  - Calls are `{ id, type: 'request', method, path, input?, lastEventId? }` and `{ id, type: 'abort' }`.
  - The server answers with `result` (`deferred: true` when chunks follow), `event` (`eventId?`, `deferred?`), `chunk`, `chunkEnd`, `done`, and `error { id | null, status, body }`.
  - A version mismatch is an `id: null` error and close code 1002. Bodies use the endpoint's serializer.
- **11 S-A:** the danSON port is the default serializer. It is configured on the endpoint: the handler and `httpLink` both take `serializer`.

### Handlers (12)

- **P-A:** `createFetchHandler({ router, createContext?, layer?, serializer?, onError?, batch?, endpoint? })` returns `{ fetch, websocket, messagePort, dispose }`.
  - `websocket(socket, { request })` takes any standard `WebSocket` object (0005): Deno's, Bun's or the browser's.
  - `messagePort(port)` takes a `MessagePort`, a `Worker` or a `worker_threads` port.
  - **`createContext`** runs once per request message on sockets, with `info.transport` and `info.connectionParams`. A port without a request gets a placeholder `http://localhost/` request.
- **`trpcdev/node`:**
  - `toNodeListener(handler)` adapts the handler to `node:http`.
  - `toNodeUpgradeListener(handler, { endpoint?, allowOrigin?, maxPayload? })` accepts WebSocket upgrades. It uses a built-in RFC 6455 implementation (`NodeWebSocket`, about 300 lines, no `ws` dependency) that dispatches standard `MessageEvent` and `CloseEvent`s.
  - Upgrades to another path get a 404, a disallowed origin a 403, and a message above `maxPayload` (default 1 MiB) close code 1009.

### Client and links (16, 17)

- **CS-A:** `query(input, { signal, context })`, `mutate(…)`, and `subscribe(input, { signal, lastEventId })` returning an `AsyncIterable`.
- **Typing source:** D-C.
  - `createTRPCClient({ router: routerType<AppRouter>(), links })` infers the `context` fields the links declare.
  - `router:` also takes a contract or a `toContract()` value.
  - The explicit generic `createTRPCClient<AppRouter>({ links })` still works, with only the open `TRPCClientContext` interface.
  - **Name:** `routerType<T>()`, not 17's `type<T>()`, which 0012 bans. `routerType` names what it carries and cannot be mistaken for a validator.
- **Links are functions.** A link is a callable `TRPCLink<TDecl, TRouter>`: `({ op, next }) => Stream`.
  - `link(async fn)` and `link.effect(fn)` build one. `TDecl` declares the `context` fields the link reads (F-B), and declarations typed `any` are ignored when merging.
  - The declaration is an invariant phantom, so a link that declares nothing doesn't absorb the others' declarations in an array.
  - Links are callable because TypeScript only infers an inline generic link's type parameters from return-type context when the type is callable. That is what makes `splitLink({ condition: (op) => … })` see `op.path` as the router's paths.
- **L-B / OR-A:** links run on an Effect core where every operation is a `Stream`.
- **Built-in links:**
  - **`httpLink`:** `batch`, streaming and SSE by negotiation.
  - **`splitLink`:** typed with the router's paths.
  - **`loggerLink`, `retryLink`, `localLink`.**
  - **`wsLink`:**
    - connects lazily;
    - reconnects with attempts and an exponential delay, 5 attempts by default;
    - resends subscriptions with their `lastEventId`;
    - fails in-flight queries and mutations with `NETWORK_ERROR`;
    - has an optional `idleMs` close;
    - has `close()` and `Symbol.asyncDispose`.
  - **`messagePortLink`:** the same core, with no reconnect.
  - **`dedupeLink`:**
    - Shares in-flight queries with the same path and serialized input, and aborts the shared request only when every caller has aborted. Mutations and subscriptions are never shared.
    - `context: { dedupe: false }` opts out.
    - Results are shared by reference, so a deferred `AsyncIterable` can only be read once among the sharers.
- **Effect client:** `createEffectClient` in `trpcdev/effect`. Each call returns an `Effect` (or a `Stream` for subscriptions). It takes `router:` too.
- **Client output types:** the client types outputs as `Deserialized<Output>`. Generators become `AsyncIterable`s and thenables become `Promise`s at any depth, and built-ins (`Date`, `Map`, `URL`, …) are left alone. Custom serializer types are mapped structurally, so their methods stay but private fields are lost.

### OpenAPI (18)

- **Q18.1:** O-C.
  - **Handler:** `createOpenAPIHandler({ router, prefix = '/api', createContext?, layer?, plugins? })` serves the REST mapping, and is the main feature.
  - **Generator:** `generateOpenAPI(router, { info, servers?, target: 'openapi' | 'rpc', prefix?, filter? })` documents either the REST mapping or the RPC endpoint.
  - **RPC target:** describes the RPC endpoint with zero configuration, `{ json }` bodies included.
- **Q18.2:** defaults. Without `.route()`, a query is `GET {prefix}/post/byId`, a mutation `POST`, and a subscription `GET` with `text/event-stream`.
- **Request mapping:**
  - Path params are `{name}`. Static segments win over params, so `/posts/latest` is matched before `/posts/{id}`.
  - Two procedures on the same method and path throw at creation.
  - `GET` reads the query string; other methods read a JSON, urlencoded or multipart body. Path params are merged into the input in both cases.
- **Bracket notation:** `a[b]=1&tags[]=x`, plus repeated keys for arrays, in query strings and forms. Leaves are strings, or `File`s in forms.
- **Coercion:** strings are coerced from the input's JSON Schema to numbers, integers, booleans, `null`, enum or const values, and single-item arrays. Values the schema doesn't describe are left for validation to report. JSON bodies are not coerced; path params always are.
- **Responses:**
  - Plain JSON, with no danSON. A `Blob` or `File` output is sent as the body.
  - Errors are `{ defined, code, status, message, data? }` with the error's status.
  - Deferred values inside outputs are not supported over REST.
- **Spec:** built from Standard JSON Schema (`~standard.jsonSchema`, with `unrepresentable: 'any'`) and Effect's `Schema.toStandardJSONSchemaV1`, so no per-library converter is needed.
  - `$defs` are hoisted into `components.schemas`.
  - Declared errors become responses by status. Procedures with an input document the 400 validation error, and `default` documents the error format.
- **Q18.3:** later. The static TypeScript generator is not ported.
- **Q18.4:** yes. `openAPILink({ url, contract })` reads methods and paths from a `toContract()` value. It sends `multipart/form-data` when the input contains a `Blob`, and reads SSE for subscriptions.
- **Q18.5:** yes. The `openAPIReference({ path, specPath, docsProvider: 'scalar' | 'swagger', specGenerateOptions })` plugin serves the UI from a CDN and generates the document on its first request.

### Serializer and portability

- **Plain objects:** deserialized objects have `Object.prototype`, not a null prototype. The deserializer already rejects `__proto__`, `constructor` and `prototype` keys, and query-param parsing only follows own keys. One consequence is that a data key named `constructor` can't round-trip.
- **Nameable builder types:** `trpcdev/server` and `trpcdev/contract` export the generic aliases that inferred procedures reference (`With`, `BuildProcedure`, `InputDef`, `Split*`, `ConcatCheck`, `ImplementerDef`, `ImplementedProcedure`, `ContractWith`, …). They are public, experimental types rather than `@internal`, so a future `stripInternal` build cannot reintroduce TS2883. `test/portability` emits declarations to catch regressions, including contracts, `t.implement()`, `routerType` clients and OpenAPI.

## Rationale

These are the proposals' recommendations wherever one exists and nothing blocks it. One departure remains: S1 over S2 (02), because plain-object routers carry no declared set. The first pass's other two departures are resolved. D-C replaced the explicit generic as the recommended typing source, with `routerType` as the carrier, and d.ii replaced d.i. Refactoring is cheap at this stage, so the build favours working, tested end-to-end slices over settling every type-level question first.

## Rejected alternatives

- Waiting for each answer before building: rejected by Alex's instruction.
- `type<T>()` as the D-C carrier: banned by 0012.
- A non-generic `impl.router()` (the spike's suggestion): it would drop each implementation's Effect services from the router type, so the handler's `layer` would not be checked.
- Depending on `ws` for Node WebSockets: an RFC 6455 server is small, and the handler only needs the standard `WebSocket` interface (0005).

## Parity impact

See [`../reference/orpc-parity.md`](../reference/orpc-parity.md). With these calls, contract-first, OpenAPI (multiple schema libraries, bracket notation, the reference UI and the link), WebSockets, message ports and dedupe are built.

## Follow-ups

- [ ] Alex confirms or overrides each call. Superseding decisions replace this file's rows one by one.
- [x] D-C typing source with link-declared context (17): `routerType<T>()`.
- [x] d.ii strict `E` mapping (02).
- [x] `t.middleware.effect`, `ok()`, lifecycle helpers (06).
- [x] `response` handle and declared `.errors()` map (04, 07).
- [x] `wsLink` and the WebSocket server adapter, `messagePortLink` and the MessagePort server, `dedupeLink`, contract-first, OpenAPI.
- [x] `.output()` typing for `tracked()` subscription events.
- [x] Deferred values inside subscription events.
- [x] `call()` takes a `layer`.
- [ ] Contracts: no implementer-wide `.use()` yet (middleware is per leaf), and the contract's meta type isn't checked against `t`'s.
- [ ] OpenAPI:
  - errors that are only inferred (returned, not declared) are not in the document;
  - no `.route({ spec })` override for procedures without static schemas;
  - no response validation in `openAPILink`;
  - no OpenAPI-to-contract (Hey API) tool.
- [ ] `wsLink` sends no keep-alive pings; dead connections are only noticed when the socket closes.
- [ ] Bodies still use danSON's `{ json }` wrapper (10).
