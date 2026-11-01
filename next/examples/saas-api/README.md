# SaaS API example

A multi-tenant projects and tasks API, put together the way a production server is: extensions for tenancy and auditing, roles in procedure meta, typed errors, response headers and downloads, and one handler served on Effect's server, Express 5 and Fastify. Everything it uses is stable API.

```
server.ts            listen(port, kind): the handler on Effect's server, Express or Fastify
client.ts            main(url): the whole scenario against a server
start.ts             runs client.ts against each of the three servers
src/
  tenancy.ts         an extension, as a package would publish it: session, membership, role check
  audit.ts           a second extension that starts with tenancy's session middleware
  store.ts           in-memory data and the layer the router and extensions need
  trpc.ts            the roots, base procedures, lifecycle metrics and the ok() cache
  routers/           auth, projects, tasks, and admin (loaded with lazy())
  router.ts          mergeRouters() of the domains
  handler.ts         createFetchHandler with cors(), createContext and the layer
  servers.ts         Effect's server (handler.routes + /health), Express and Fastify
  api-client.ts      the client's links
  api.test.ts        in-process tests: createRouterClient, t.call() and localLink
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
- `dedupeLink`, `retryLink` (`client.ts` fails the first request of a query at the network), `loggerLink` and `httpLink` with batching.
- `safe()`, `createSafeClient()` and an exhaustive `matchError()` over every error `project.create` can fail with.
- `onResponse` to read a call's status and headers.

Batched calls stream their lines, and the handler sends those with `cache-control: no-cache`, so a header like `project.list`'s reaches the client on an unbatched call (`{ batch: false }`).

Client tracing (`traceparent`) needs an Effect tracer and is left to an Effect example.

## Running it

`pnpm start` runs `client.ts` against Effect's server, Express and Fastify in turn. To run the halves apart: `pnpm server` (`SERVER=express` or `fastify` to pick one, `PORT` to move it off 3000) and `pnpm client` (or `node client.ts <url>`). `pnpm test` runs `api.test.ts` and `pnpm typecheck` checks the types. From `next/`, `pnpm example` runs this with every other example, and `pnpm test` includes `api.test.ts`.
