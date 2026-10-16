---
name: orpc
description: "Build, serve, and call end-to-end typesafe APIs with oRPC v2. Use for any task in a project that depends on `@orpc/*` packages, even a one-procedure change: defining procedures with the os builder (.input/.output/.handler, any Standard Schema validator), assembling routers, middleware and context, typesafe errors with ORPCError, serving via RPCHandler on any runtime adapter, calling from server-side clients (call, createRouterClient) or client-side clients (createORPCClient with RPCLink), integrating TanStack Query, or streaming over SSE. Pretrained oRPC knowledge describes v1 and is wrong for v2, so load this skill even when the change looks trivial. Biases toward retrieval from the oRPC docs over pre-trained knowledge. For REST/OpenAPI exposure, prefer the orpc-openapi skill; for contract-first design, the orpc-contract skill; for tRPC or oRPC v1 migrations, the orpc-migrate skill."
license: MIT
---

# oRPC

oRPC is a typesafe API framework: write plain TypeScript functions on the server, call them from clients like local functions. Input is validated at runtime, types flow end to end, and there is no code generation step. The same router can also be served as a REST API with an OpenAPI spec.

This skill targets oRPC v2. Check what is installed before writing code: `npm ls @orpc/server` (or any `@orpc/*` package). A 1.x version means v1, where this skill's guidance does not apply; use the `orpc-migrate` skill to upgrade. v2 currently ships under the `beta` dist-tag (`npm install @orpc/server@beta @orpc/client@beta`; a plain install silently gets v1). If `npm view @orpc/server dist-tags` shows `latest` at 2.x, the beta has ended: install normally.

Pretrained oRPC knowledge describes v1 and is often wrong for v2 (routing moved to `.meta(openapi(...))`, `RPCLink` split `url` into `origin` plus a path, automatic middleware dedupe was removed). Prefer retrieval: the index of every docs page is at https://orpc.dev/llms.txt; see [Full documentation](#full-documentation) for the mechanics.

Package map:

- `@orpc/server`: the `os` builder, routers, middleware, `RPCHandler`, server-side clients (`call`, `createRouterClient`), `implement` for mocks
- `@orpc/client`: `createORPCClient`, `RPCLink`, `safe`, `createSafeClient`, `isDefinedError`
- `@orpc/contract`: contract-first API definitions implemented separately from their logic (see the `orpc-contract` skill)
- `@orpc/openapi`: `OpenAPIHandler`, `OpenAPILink`, OpenAPI 3.2 spec generation
- Integration packages such as `@orpc/tanstack-query` and `@orpc/nest`

## Define procedures

Build a procedure with the `os` builder: describe input with a schema, implement with `.handler`. Zod, Valibot, ArkType, and any other [Standard Schema](https://standardschema.dev/) library work for `.input`, `.output`, and error `data`.

```ts
import { os } from '@orpc/server'
import * as z from 'zod'

export const listPlanets = os
  .handler(async () => [{ id: 1, name: 'Earth' }]) // no .input: takes no arguments

export const findPlanet = os
  .input(z.object({ id: z.number() }))
  .handler(async ({ input }) => ({ id: input.id, name: 'Earth' }))
```

`.handler` is the only required step. The full chain, every other step optional:

```ts
const example = os
  .$context<{ headers: Headers }>() // initial context this procedure requires
  .errors({ NOT_FOUND: {} }) // typed errors
  .use(requireAuth) // middleware
  .input(z.object({ id: z.number() }))
  .output(z.object({ id: z.number(), name: z.string() })) // optional; also speeds up type checking
  .handler(async ({ input, context, errors }) => ({ id: input.id, name: 'Earth' }))
```

Every builder step returns a new instance, so share base builders freely: `const authed = os.use(requireAuth)` then build many procedures from `authed`.

## Assemble a router

A router is a plain object mapping keys to procedures (or nested routers). Do not use the keys `then`, `bind`, `valueOf`, `toString`, `toJSON`.

```ts
export const router = {
  planet: { list: listPlanets, find: findPlanet },
  admin: os.use(requireAuth).router({ deletePlanet }), // apply shared middleware to a subtree
  planetLazy: os.lazy(() => import('./planet')), // code-split; module's default export is a router
}
```

Infer types with `InferRouterInputs` / `InferRouterOutputs` from `@orpc/server`. Applying `.use` at both router and procedure level can run the same middleware twice; see the dedupe pattern below.

## Middleware and context

Context comes from two places. Initial context is declared with `.$context` and passed explicitly when serving or calling (environment values: headers, env, db). Injected context is added at runtime by middleware via `next({ context })` (runtime values: the authenticated user).

```ts
import { ORPCError, os } from '@orpc/server'

const base = os.$context<{ headers: Headers }>()

const requireAuth = base.middleware(async ({ context, next }) => {
  const user = await parseUser(context.headers)
  if (!user) {
    throw new ORPCError('UNAUTHORIZED')
  }
  return next({ context: { user } }) // handler now sees context.user, typed non-null
})
```

`.use` accepts named middleware or inline functions. Middleware registered before `.input` runs before validation, the rest after. Middleware can also declare typed input (`os.middleware(async ({ next }, id: number) => ...)`); adapt mismatched shapes with `.use(mw.adaptInput(input => input.id))`.

Best practice, dedupe expensive middleware: the same middleware can run twice in one call (router-level plus procedure-level `.use`, or a procedure `call`ing another). Cache the result in context:

```ts
const authProvider = os
  .$context<{ headers: Headers, auth?: { id: string }, authLoaded?: boolean }>()
  .middleware(async ({ context, next }) => {
    const auth = context.authLoaded ? context.auth : await loadAuth(context.headers)
    return next({ context: { auth, authLoaded: true } })
  })
```

## Typesafe errors

Throw `ORPCError` (a `code` plus optional `message` and `data`). Both `message` and `data` are sent to the client, so never put secrets in them. Throw only `Error` instances, never literals.

Define errors with `.errors` so clients can infer each error's shape:

```ts
const find = os
  .errors({
    NOT_FOUND: { message: 'Planet not found' }, // default message
    RATE_LIMITED: { data: z.object({ retryAfter: z.number() }) },
  })
  .handler(async ({ input, errors }) => {
    throw errors.NOT_FOUND()
  })
```

`throw new ORPCError('NOT_FOUND')` inside that handler is converted to the matching typed error when code and data match. Convert custom error classes to `ORPCError` in a middleware `try/catch`.

## Serve with RPCHandler

`RPCHandler` matches requests to procedures, validates input, runs handlers, and encodes results. Pick the adapter for your runtime. Fetch API (Bun, Deno, Cloudflare Workers):

```ts
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { CORSHandlerPlugin } from '@orpc/server/plugins'

const handler = new RPCHandler(router, {
  plugins: [new CORSHandlerPlugin()],
  interceptors: [onError(error => console.error(error))],
})

export async function fetch(request: Request): Promise<Response> {
  const { matched, response } = await handler.handle(request, {
    prefix: '/rpc',
    context: { headers: request.headers }, // provide the router's initial context here
  })
  return matched ? response : new Response('Not found', { status: 404 })
}
// Bun.serve({ fetch }) / Deno.serve(fetch) / export default { fetch } on Workers
```

Node HTTP:

```ts
import { createServer } from 'node:http'
import { RPCHandler } from '@orpc/server/node'

const handler = new RPCHandler(router)

const server = createServer(async (req, res) => {
  const { matched } = await handler.handle(req, res, { prefix: '/rpc', context: {} })
  if (matched)
    return
  res.statusCode = 404
  res.end('Not found')
})

server.listen(3000)
```

Unmatched requests fall through to your own handling. By default `RPCHandler` accepts only `POST`, `PUT`, `PATCH`, and `DELETE`; enabling `GET` via `allowMethods` is a CSRF risk with cookie auth, see [RPC Handler](https://orpc.dev/docs/rpc/handler). Handler options also include `interceptors`, `routingInterceptors`, `clientInterceptors`, `plugins`, `filter`, and `errorStatusMap`. Adapters also exist for [AWS Lambda](https://orpc.dev/docs/adapters/aws-lambda), [Fastify](https://orpc.dev/docs/adapters/fastify), [WebSocket](https://orpc.dev/docs/adapters/websocket), [Message Port](https://orpc.dev/docs/adapters/message-port), and [Expo](https://orpc.dev/docs/adapters/expo).

## Call procedures

Server side (same process, no HTTP; also the fastest way to test procedures):

```ts
import { call, createRouterClient } from '@orpc/server'

const planet = await call(findPlanet, { id: 1 }, { context: { headers } })

const client = createRouterClient(router, { context: { headers } }) // context can be a function
const planets = await client.planet.list()
```

Client side, `RPCLink` turns calls into HTTP requests. Import the router as a type only so no server code reaches the client bundle:

```ts
import type { RouterClient } from '@orpc/server'
import type { router } from '../server/router'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

const link = new RPCLink({
  origin: 'http://127.0.0.1:3000',
  url: '/rpc', // must match the server's prefix
  headers: () => ({ authorization: `Bearer ${token}` }), // options accept functions
})

export const orpc: RouterClient<typeof router> = createORPCClient(link)

const planet = await orpc.planet.find({ id: 1 })
```

Client error handling: plain `try/catch` works, but `safe` preserves typed error inference:

```ts
import { createSafeClient, isDefinedError, safe } from '@orpc/client'

const [error, data] = await safe(orpc.planet.find({ id: 1 }))
if (isDefinedError(error)) {
  console.log(error.code, error.data) // typed from the procedure's .errors
}
else if (error) {
  // unknown error
}

const safeClient = createSafeClient(orpc) // every call returns [error, data]
```

## Beyond the basics

- Streaming / SSE: return an async generator from `.handler`, validate events with `asyncIteratorObject`, resume via `lastEventId`: [AsyncIteratorObject](https://orpc.dev/docs/async-iterator-object)
- OpenAPI: serve the same router as REST with routing metadata plus `OpenAPIHandler`, and generate a spec (covered in depth by the `orpc-openapi` skill): [OpenAPI Handler](https://orpc.dev/docs/openapi/handler)
- Contract-first: define contracts with `@orpc/contract`, implement with `implement` (covered in depth by the `orpc-contract` skill): [Contracts](https://orpc.dev/docs/contract/procedure)
- Plugins for handler and link: batch, CORS, dedupe, retry, compression, request limits, smart coercion, static files, timeout, tmp file upload, and more. Fetch a plugin's docs page before configuring it; option names are not guessable: [Plugins](https://orpc.dev/docs/plugins/batch)
- Integrations: [TanStack Query](https://orpc.dev/docs/integrations/tanstack-query) (`createTanstackQueryUtils`), [SWR](https://orpc.dev/docs/integrations/swr), [Pinia Colada](https://orpc.dev/docs/integrations/pinia-colada), [Next.js](https://orpc.dev/docs/integrations/next), [NestJS](https://orpc.dev/docs/integrations/nest), [AI SDK](https://orpc.dev/docs/integrations/ai-sdk), [OpenTelemetry](https://orpc.dev/docs/integrations/opentelemetry)
- Testing: `call` procedures directly; mock with `implement(router.planet.list).handler(() => [])`, and run the project's typecheck before declaring success, since end-to-end types are oRPC's first correctness signal: [Testing and Mocking](https://orpc.dev/docs/recipes/testing-and-mocking)
- Monorepos: TypeScript project references keep client types resolvable: [Monorepo Setup](https://orpc.dev/docs/recipes/monorepo-setup)
- Migrating from tRPC or oRPC v1: use the `orpc-migrate` skill

## Full documentation

This skill is an overview; fetch exact docs instead of guessing APIs, and if this skill and a fetched page disagree, trust the page. The docs are served at https://orpc.dev (the v1 docs stay at https://v1.orpc.dev):

- https://orpc.dev/llms.txt : index of every page with descriptions
- https://orpc.dev/llms-full.txt : the entire docs in one file (large; prefer single pages)
- Append `.md` to any docs URL for that page's exact source markdown (for example https://orpc.dev/docs/procedure.md)

Doc map, all under `https://orpc.dev/docs/`:

- Top level: `procedure`, `router`, `middleware`, `context`, `error-handling`, `metadata`, plus `binary-data` (file uploads) and `async-iterator-object` (streaming/SSE)
- `rpc/*`, `openapi/*`: protocol details, handlers, links; `contract/*`: contract-first (the `orpc-contract` skill)
- `client/*`: server- and client-side clients, error handling, `DynamicLink`
- `adapters/*`: per-runtime serving quirks (fetch-api, node-http, aws-lambda, fastify, websocket, message-port, expo)
- `plugins/*`: twenty handler/link plugins; `helpers/*`: cookie, encryption, form-data, lock, publisher, ratelimit, signing, base64url
- `integrations/*`: framework glue; `recipes/*`: guidance (testing, SSR, monorepos, validation)
- `migrations/from-v1`, `migrations/from-trpc`: upgrades (use the `orpc-migrate` skill)
