# SaaS API example

A multi-tenant projects and tasks API, put together the way a production server is: extensions for tenancy and auditing, roles in procedure meta, typed errors, response headers and downloads, and one handler served on Effect's server, Express 5 and Fastify. Everything it uses is stable API.

```
src/
  tenancy.ts         an extension, as a package would publish it: session, membership, role check
  audit.ts           a second extension that starts with tenancy's session middleware
  store.ts           in-memory data and the layer the router and extensions need
  trpc.ts            the roots, base procedures, lifecycle metrics and the ok() cache
  routers/           auth, projects, tasks, and admin (loaded with lazy())
  router.ts          mergeRouters() of the domains
  handler.ts         createFetchHandler with cors(), createContext and the layer
  servers.ts         Effect's server (handler.routes + /health), Express and Fastify
  client.ts          the client's links
  api.test.ts        in-process tests: createRouterClient, call() and localLink
smoke.ts             the same calls against each server
```

## What it shows

Server:

- `t.concat(tenancy())` and `.concat(audit())`: each extension brings ctx (`user`, `tenantId`, `role`), a meta key (`role`), errors (`UNAUTHORIZED`, `FORBIDDEN`, `TENANT_REQUIRED`, `INSUFFICIENT_ROLE`) and services. Tenancy uses the app's `Directory` and provides `Principal`. Audit uses the app's `AuditLog`, and needs the `tenantId` tenancy adds, which `t.concat()` checks.
- Standalone `middleware()` and `middleware.effect()`. Both extensions start with `withSession`, so it runs once per call (`api.test.ts` counts the lookups).
- `.meta({ role })` read by the extension's role check; `memberProcedure` and `adminProcedure` set it on a base procedure.
- An input-replacing middleware (`{ projectId }` becomes `{ project }`), with a second `.input()` after it in `task.add`.
- `ok()` short-circuiting `project.stats` from a cache keyed by the tenant's data version.
- `.output()` with a transform: dates leave the server as ISO strings.
- Errors three ways: inferred (`error({ code: 'NOT_FOUND', data })`), declared (`.errors({ TASK_NOT_FOUND })`) and `TrpcError.Tagged` classes (`QuotaExceeded`, `InsufficientRole`).
- `opts.response` (a session cookie and a 201) and the `Response` service (`cache-control`); `project.exportCsv` returns its own `HttpServerResponse`.
- `onFinish` and `onError` lifecycle middleware for metrics and crash logs.
- `lazy()` for the admin subtree and `mergeRouters()` for the domains.
- `cors()` in the handler's `middleware`; `handler.routes` merged with a `/health` route; `NodeHttpServer.makeHandler` mounted in Express (after `express.json()`, whose `req.body` the handler reuses) and Fastify.

Client:

- A custom `link()` declaring a `{ tenant }` call option.
- `switchLink` with a typed `{ via: 'app' | 'admin' }` call option: `admin.*` calls go unbatched and aren't retried.
- `dedupeLink`, `retryLink` (the smoke fails the first request of a query at the network), `loggerLink` and `httpLink` with batching.
- `safe()`, `createSafeClient()` and an exhaustive `matchError()` over every error `project.create` can fail with.
- `onResponse` to read a call's status and headers.

Batched calls stream their lines, and the handler sends those with `cache-control: no-cache`, so a header like `project.list`'s reaches the client on an unbatched call (`{ batch: false }`).

Client tracing (`traceparent`) needs an Effect tracer and is left to an Effect example.

## Running it

From `next/`: `pnpm example` runs every example's smoke, and `pnpm test` runs `api.test.ts` with the rest of the tests. Here: `pnpm smoke`, `pnpm test` and `pnpm typecheck`.
