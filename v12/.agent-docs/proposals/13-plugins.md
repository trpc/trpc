# 13 — Handler plugins

| Status     | Area             | Depends on | oRPC parity rows                                            |
| ---------- | ---------------- | ---------- | ----------------------------------------------------------- |
| `proposed` | server, adapters | 10, 12     | **Built-in plugins** (CORS, CSRF, retry, …), Batch requests |

## Summary

Decide how cross-cutting, transport-level behaviour is added to handlers: CORS, CSRF, body limits, batching, compression, headers, rate limiting and tracing.

**Recommendation:**

- One plugin interface with request-level and call-level hooks.
- A small set of first-party plugins with secure defaults.
- Plugins are untyped with respect to procedures; procedure-level logic stays in middleware.
- On the client, the equivalent concept is links (17).

## Today (v11)

There is no plugin system. Behaviour is scattered:

| Behaviour                        | Where it lives in v11                                   |
| -------------------------------- | ------------------------------------------------------- |
| Response headers and status      | `responseMeta`                                          |
| Logging                          | `onError`                                               |
| Batching                         | `allowBatching`, `maxBatchSize`                         |
| Method override                  | `allowMethodOverride`                                   |
| Body limits                      | `maxBodySize` (Node only)                               |
| CORS, compression, rate limiting | Delegated to framework middleware (Express `cors()`, …) |

Fetch-only deployments have to write those by hand.

## Goals

- Ship the common needs (CORS, CSRF, body limit, batch, headers) without framework middleware, so fetch-only platforms are covered.
- A clear line between plugins and middleware:
  - **plugins** are endpoint-level, transport-aware and untyped;
  - **middleware** is procedure-level, typed and transport-agnostic.
- Plugins can be written as Promises or as Effects (with services).

## Proposed interface

```ts
interface HandlerPlugin {
  name: string;
  /** Wraps the whole HTTP/WS request: CORS, body limit, compression, CSRF. */
  onRequest?: (opts: {
    request: Request;
    next: () => Promise<Response>;
  }) => Promise<Response> | Effect<Response>;
  /** Wraps each procedure call, after routing: logging, timing, rate limits, response headers. */
  onCall?: (opts: {
    path: string;
    type: ProcedureType;
    ctx: unknown;
    input: unknown;
    next: () => Promise<CallResult>;
  }) => Promise<CallResult> | Effect<CallResult>;
}

createHandler({
  router,
  plugins: [
    cors({ origin: ['https://app.example.com'] }),
    bodyLimit({ max: '1mb' }),
    batch(),
  ],
});
```

**Open:** whether `onCall` should also be available as untyped "global middleware". This would answer some of the router-level middleware demand from 06 (e).

```ts
// onCall as global middleware: runs for every procedure; ctx and input are unknown
const timing: HandlerPlugin = {
  name: 'timing',
  onCall: async ({ path, type, next }) => {
    const start = performance.now();
    const result = await next();
    log(`${type} ${path}: ${performance.now() - start}ms`);
    return result;
  },
};
createHandler({ router, plugins: [timing] });

// The typed alternative stays a base procedure (06 (e))
const procedure = t.procedure.use(async ({ path, next }) => {
  const start = performance.now();
  const result = await next();
  log(`${path}: ${performance.now() - start}ms`);
  return result;
});
```

The same hook as an Effect, for plugins that need services or spans:

```ts
const tracing: HandlerPlugin = {
  name: 'tracing',
  onCall: ({ path, next }) =>
    Effect.promise(next).pipe(Effect.withSpan(`trpc.${path}`)),
};
```

## First-party plugins (proposed)

| Plugin            | Default        | Notes                                                                                                                                                                |
| ----------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bodyLimit`       | **on** (1 MB?) | Protects every platform, including Node                                                                                                                              |
| `strictMethods`   | **on**         | GET only for queries, POST for mutations (oRPC "strict GET"); built into the protocol (10)                                                                           |
| `csrf`            | **on**         | Requires a non-simple content type or a `trpc-*` header on POST; OpenAPI checks the origin of form bodies ([openapi-csrf-guard](../decisions/openapi-csrf-guard.md)) |
| `batch`           | off            | Server half of batching; limits on by default (`maxSize: 20`)                                                                                                        |
| `cors`            | off            | Origin allow-list, credentials, preflight                                                                                                                            |
| `responseHeaders` | n/a            | Covered by `response` in resolver options (04); plugin form for plugins/middleware                                                                                   |
| `compression`     | off            | `CompressionStream`-based; may be better left to the platform                                                                                                        |
| `rateLimit`       | later          | Effect-based, store as a service (memory, Redis, CF Durable Object)                                                                                                  |
| `tracing`         | later          | Effect spans exported via `@effect/opentelemetry`; may just be docs                                                                                                  |

How first-party plugins would be written against `onRequest`:

```ts
// cors: origin allow-list and preflight
const cors = (opts: { origin: string[] }): HandlerPlugin => ({
  name: 'cors',
  onRequest: async ({ request, next }) => {
    const origin = request.headers.get('origin');
    const response =
      request.method === 'OPTIONS'
        ? new Response(null, { status: 204 })
        : await next();
    if (origin && opts.origin.includes(origin)) {
      response.headers.set('access-control-allow-origin', origin);
      response.headers.append('vary', 'origin');
    }
    return response;
  },
});

// csrf: a POST needs a non-simple content type or a trpc-* header
const csrf = (): HandlerPlugin => ({
  name: 'csrf',
  onRequest: async ({ request, next }) => {
    const type = request.headers.get('content-type') ?? '';
    const simple =
      /^(text\/plain|application\/x-www-form-urlencoded|multipart\/form-data)/.test(
        type,
      );
    const trpcHeader = [...request.headers.keys()].some((key) =>
      key.startsWith('trpc-'),
    );
    if (request.method === 'POST' && simple && !trpcHeader) {
      return new Response(null, { status: 403 });
    }
    return next();
  },
});
```

## Recommendation

- The interface above.
- `bodyLimit`, `strictMethods` and `csrf` on by default, but they can be disabled or configured.
- The other plugins are opt-in.
- Plugins do not change procedure types. A plugin that adds context exports a context type for users to merge into their own (as oRPC's `RequestHeadersPluginContext` does).

## Questions

- **Q13.1** One plugin interface with `onRequest` + `onCall` hooks? Is `onCall` also the answer for global, untyped middleware?
- **Q13.2** Which plugins are v1, and which are on by default? (Proposed on by default: `bodyLimit`, `strictMethods`, `csrf`.)
- **Q13.3** Should protocol features (batching, strict methods, CSRF) be plugins that can be turned off, or fixed protocol rules?
- **Q13.4** No type-level contribution from plugins to `ctx` (manual merge only)?

## Decision

- **Q13.1:** [ ] yes · [ ] no — `onCall` as global middleware: [ ] yes · [ ] no
- **Q13.2:** v1: `__________` — on by default: `__________`
- **Q13.3:** [ ] plugins · [ ] fixed rules
- **Q13.4:** [x] manual only (agent call) · [ ] typed contribution → [handlers](../decisions/handlers.md)
- **Notes:**
