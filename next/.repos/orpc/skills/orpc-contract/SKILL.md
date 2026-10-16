---
name: orpc-contract
description: "Design oRPC v2 APIs contract-first, defining the API shape with oc from `@orpc/contract`, implementing it with implement from `@orpc/server`, and consuming the contract from typesafe clients. Use when a project depends on `@orpc/contract`, when defining a contract with oc, implementing a contract with implement, sharing an API contract between server and client packages, generating a contract from an existing OpenAPI spec, or publishing a typed API client to npm. Biases toward retrieval from the oRPC docs over pre-trained knowledge. For core builder, serving, and client work without a contract, use the orpc skill; for REST/OpenAPI exposure, spec generation, and OpenAPILink details, use the orpc-openapi skill."
license: MIT
---

# oRPC Contract-First

Contract-first oRPC splits an API into two artifacts: a contract (schemas, errors, metadata, no business logic) defined with `oc` from `@orpc/contract`, and an implementation built from it with `implement` from `@orpc/server`. Server and client both depend on the contract, never on each other, so the API shape can live in its own package, be reviewed on its own, and ship to consumers as a typed SDK. Prefer it when server and client are separate packages or teams, when the shape starts from an existing OpenAPI spec, or when publishing a client to npm. Stay with the `os`-first flow when one codebase holds both sides and the client can import the router type directly; converting later is cheap because a plain router already works as a router contract (resolve lazy routers with `unlazyRouter` first).

This skill targets oRPC v2. The `orpc` skill carries the v2 install and version check plus core builder, middleware, serving, and client concepts. Pretrained oRPC knowledge describes v1 and is often wrong for v2: when unsure of any API below, fetch its docs page first (see [Full documentation](#full-documentation)).

## Define the contract with oc

Every chain is optional and each call returns a new instance, so share base contracts freely. A contract has no `.handler`. Zod, Valibot, ArkType, and any other Standard Schema library work.

```ts
import { oc } from '@orpc/contract'
import * as z from 'zod'

export const contract = {
  planet: {
    list: oc
      .output(z.array(z.object({ id: z.number(), name: z.string() }))),
    find: oc
      .errors({ NOT_FOUND: {} })
      .input(z.object({ id: z.number() }))
      .output(z.object({ id: z.number(), name: z.string() })),
  },
}
```

- Always define `.output`: without it clients infer the output as `unknown`.
- A router contract is a plain object mapping keys to procedure contracts or nested objects. Avoid the keys `then`, `bind`, `valueOf`, `toString`, `toJSON`.
- Attach shared metadata to a whole subtree with `oc.meta(someMeta).router({...})`.
- `.errors({ NOT_FOUND: {} })` declares typesafe errors; implementations throw them via `errors.NOT_FOUND()` and clients infer their shapes.
- Repeated `.input`/`.output` calls stack schemas instead of replacing them: object input schemas compose into one flat value, output schemas pipe. Use this to extend a base contract without repeating fields.
- Schema-library-free contracts use the `type` utility from `@orpc/contract`: `oc.input(type<{ value: number }>())`, optionally with a mapping function as `type<Input, Output>(fn)`.
- REST routes attach via `.meta(openapi({ method: 'GET', path: '/planets/{id}' }))` from `@orpc/openapi`, exactly as on `os`; routing rules, `prefix`, and spec generation belong to the `orpc-openapi` skill.

Infer types with `InferRouterContractInputs`, `InferRouterContractOutputs`, and `InferRouterContractErrors` from `@orpc/contract`.

## Implement with implement

`implement` turns the contract into an implementer that mirrors its shape and type-checks every handler; `.router` also enforces the contract at runtime.

```ts
import { implement } from '@orpc/server'

const implementer = implement(contract).$context<{ db: DB }>()

const listPlanets = implementer.planet.list.handler(async ({ context }) => context.db.list())

const findPlanet = implementer.planet.find.handler(async ({ input, context, errors }) => {
  const planet = await context.db.find(input.id)
  if (!planet)
    throw errors.NOT_FOUND()
  return planet
})

export const router = implementer.router({
  planet: { list: listPlanets, find: findPlanet },
})
```

- `.$context` declares the initial context the procedures require, as on `os`.
- Apply middleware per procedure with `.use(mw)` before `.handler`. That runs after input validation (the contract already registered `.input`); to wrap validation, apply it at router level: `implementer.use(mw)` for every procedure, or `implementer.planet.use(mw).list` for a subtree. Router-level plus procedure-level `.use` can run the same middleware twice; use the dedupe pattern from the `orpc` skill.
- `implementer.middleware(fn)` creates middleware that infers the contract's typesafe errors. When not every procedure defines a code, guard with the `in` operator: `if ('TOO_MANY_REQUESTS' in errors) throw errors.TOO_MANY_REQUESTS()`. Any type-compatible middleware also works.
- The result is a normal router: serve it with `RPCHandler` (`orpc` skill) or `OpenAPIHandler` (`orpc-openapi` skill), call it in-process with `call` or `createRouterClient` from `@orpc/server`.

## Consume the contract from clients

`RPCLink` needs only the contract type; `OpenAPILink` takes the contract as a runtime value to read each procedure's route. Get the client types exactly right:

```ts
import type { RouterContractClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { OpenAPILink } from '@orpc/openapi/fetch'

// RPC protocol (server side is RPCHandler)
const rpcLink = new RPCLink({ origin: 'https://api.example.com', url: '/rpc' })
const client: RouterContractClient<typeof contract> = createORPCClient(rpcLink)

// OpenAPI protocol (OpenAPIHandler or any spec-compliant server)
const openapiLink = new OpenAPILink(contract, { origin: 'https://api.example.com', url: '/api' })
const apiClient: JsonifiedClient<RouterContractClient<typeof contract>> = createORPCClient(openapiLink)
```

- Router-first equivalents use `RouterClient<typeof router>` from `@orpc/server` in the same positions.
- `JsonifiedClient` is required over `OpenAPILink` because OpenAPI serialization is one-way (a `Date` returns as a string); dropping it via Smart Coercion, plus `OpenAPILink` options and CORS caveats, are in the `orpc-openapi` skill.
- Per-call client context is the second type parameter, `RouterContractClient<typeof contract, ClientContext>`, then `client.planet.find(input, { context: { token } })`; link options like `headers` accept functions of that context.
- Export `RouterContractClient<typeof contract>` as a type from the server package so clients never import the contract module itself (still needed as a runtime value for `OpenAPILink`; ship the minified JSON below).
- In very large codebases, skip the root client: pin each procedure with `.meta(meta.path([...]))` and build per-procedure clients with `createContractClientFactory` from `@orpc/contract` (`createContractJsonifiedClientFactory` from `@orpc/openapi` when the link needs `JsonifiedClient`); fetch `contract/client-factory` before adopting it.

## Ship the contract

When the contract is derived from a router, importing it on the client is heavy and may expose internals. Minify and export JSON instead:

```ts
import fs from 'node:fs'
import { minifyRouterContract } from '@orpc/contract'
import { unlazyRouter } from '@orpc/server'

const minified = minifyRouterContract(await unlazyRouter(router))
fs.writeFileSync('./contract.json', JSON.stringify(minified))
```

`minifyRouterContract` keeps only client-needed metadata. On the client, import the JSON and cast, since schemas do not survive serialization: `new OpenAPILink(contract as typeof router, ...)`.

To publish a typed SDK to npm, export a factory that pairs the contract with a link:

```ts
import type { RouterContractClient } from '@orpc/contract'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

export function createMyApi(apiKey: string): RouterContractClient<typeof contract> {
  const link = new RPCLink({
    origin: 'https://example.com',
    url: '/rpc',
    headers: { 'x-api-key': apiKey },
  })
  return createORPCClient(link)
}
```

Bundle with `tsdown --dts src/index.ts`, point `exports` at `dist` types plus import entries, list `@orpc/client` and `@orpc/contract` as dependencies, and publish. Consumers get a fully typed client that works with every oRPC client integration (TanStack Query included). Fetch `recipes/publish-client-to-npm` for the complete `package.json`.

## Generate the contract from an existing OpenAPI spec

Use Hey API's `orpc` plugin instead of hand-writing the contract. Install `@hey-api/openapi-ts@next` as a dev dependency (oRPC v2 output requires the `next` tag until the next stable Hey API release) and create `openapi-ts.config.ts`:

```ts
import { defineConfig } from '@hey-api/openapi-ts'

export default defineConfig({
  input: 'https://example.com/openapi.json', // local file or URL
  output: 'src/contract',
  plugins: [{ name: 'orpc', compatibilityVersion: '2', validator: 'zod' }],
})
```

Then run `npx @hey-api/openapi-ts`. It writes `orpc.gen.ts` (one procedure contract per operation, routed via `.meta(openapi({...}))` with `inputStructure: 'detailed'`, plus a combined `contract` router) and `zod.gen.ts`. The generated files import `@orpc/contract`, `@orpc/openapi`, and `zod`, so install those too. From there, implement the contract on your own server, or point `OpenAPILink` at the existing spec-compliant server.

## Full documentation

If this skill and a fetched docs page disagree, trust the page: this skill is a summary and v2 is still moving. The docs are served at https://orpc.dev (the v1 docs stay at https://v1.orpc.dev):

- https://orpc.dev/llms.txt : index of every page with descriptions
- https://orpc.dev/llms-full.txt : the entire docs in one file (large; prefer single pages)
- Append `.md` to any docs URL for that page's exact source markdown (for example https://orpc.dev/docs/contract/procedure.md)

Pages to fetch when you need details beyond this skill:

- Contract: `contract/procedure`, `contract/router`, `contract/implementation`, `contract/generate-from-openapi`
- Clients: `client/client-side`, `client/server-side`, `client/error-handling`, `openapi/link`
- Workflows: `recipes/publish-client-to-npm`, `contract/client-factory`, `recipes/monorepo-setup`
