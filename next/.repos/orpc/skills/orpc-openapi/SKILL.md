---
name: orpc-openapi
description: "Expose an oRPC router as a spec-compliant OpenAPI HTTP API. Use when a project depends on @orpc/openapi, or for defining REST-style routes on oRPC procedures (openapi() metadata or .route with method, path, successStatus), serving them with OpenAPIHandler alongside RPCHandler, coercing query and path strings with Smart Coercion, calling an OpenAPI-shaped API with OpenAPILink, generating an OpenAPI 3.2 (or 3.1, 3.0) document with OpenAPIGenerator, or serving Scalar or Swagger docs with the OpenAPI Reference plugin. Biases toward retrieval from the oRPC docs over pre-trained knowledge. For contract-first work (defining contracts with oc, implementing them with implement, or generating a contract from an existing OpenAPI spec), use the orpc-contract skill; for plain RPC serving, core builder, middleware, or client work with no REST exposure, use the orpc skill instead."
license: MIT
---

# oRPC over OpenAPI

oRPC procedures speak two protocols from one router: the RPC protocol (`RPCHandler`/`RPCLink`) and plain OpenAPI HTTP (`OpenAPIHandler`/`OpenAPILink`). This skill covers the OpenAPI side. For core builder, middleware, context, and client concepts, load the `orpc` skill (it also carries the v2 install and version check); for contract-first workflows with `@orpc/contract`, load the `orpc-contract` skill.

This skill targets oRPC v2. Pretrained oRPC knowledge describes v1 and is often wrong for v2: when unsure of any API below, fetch its exact docs page first (see [Full documentation](#full-documentation)).

## Routing

A procedure defaults to `POST` with a path derived from the router structure (`planet.create` becomes `POST /planet/create`). Override with `openapi` metadata, on server (`os`) and contract (`oc`) builders alike:

```ts
import { openapi } from '@orpc/openapi'
import { os } from '@orpc/server'
import { z } from 'zod'

const getPlanet = os
  .meta(openapi({ method: 'GET', path: '/planets/{id}', successStatus: 200 }))
  .input(z.object({ id: z.string() }))
  .handler(async ({ input }) => ({ id: input.id, name: 'Earth' }))
```

- Path params: put `{id}` in `path` and the same key as a required field in the input schema. Use `{+path}` for catch-all segments that may contain `/`.
- `prefix` prepends a path to a procedure or a whole router: `os.meta(openapi({ prefix: '/api/v2' })).router({...})`. Always set a `prefix` on lazy routers so lazy loading only triggers for relevant requests.
- Merging across repeated `.meta(openapi(...))` calls: `prefix` and `tags` concatenate, `method`/`path`/`successStatus` last-wins, and setting a field to `undefined` resets it to the default.
- `successStatus` defaults to `200` and must be below 400.

For direct routing without `.meta(openapi(...))`, enable the `.route` extension with a side-effect import in a module that always runs at startup (base builder file or server entry):

```ts
import '@orpc/openapi/extensions/route'

const ping = os.route({ method: 'GET', path: '/ping' }).handler(async () => 'pong')
```

## Input and output mapping

Compact mode (default): path params merge with query params or the request body depending on the HTTP method, so `GET /planets/earth?q=life` yields input `{ id: 'earth', q: 'life' }`. The handler's return value becomes the response body with status `successStatus`.

Set `inputStructure: 'detailed'` in the metadata to receive `{ params, query, headers, body }` instead (define only the fields you need in the input schema). Set `outputStructure: 'detailed'` to return `{ status?, headers?, body? }` and vary the status per response.

Query strings and form data are decoded with bracket notation (fetch `openapi/bracket-notation` before designing schemas for nested query input; its limits are not guessable):

- Repeated keys become arrays: `?color=red&color=blue` gives `['red', 'blue']`; `color[]=red` pushes too.
- `[number]` targets an array index; `[key]` targets an object property: `?filter[status]=active` gives `{ filter: { status: 'active' } }`.
- It cannot represent empty objects or arrays, root-level arrays, or objects whose keys are all numbers, and query/form values always arrive as strings (or files, in form data).

Override decoding per parameter with `paramsStyles` (`'primitive'`, `'comma-delimited-array'`, `'comma-delimited-object'`) and `queryStyles` (those plus `'array'`, `'json'`, and space/pipe-delimited variants). Use `requestBodyHint`/`responseBodyHint` (`'json'`, `'form-data'`, `'event-stream'`, `'octet-stream'`, `'file'`, ...) when headers alone cannot tell the parser how to handle the body, for example a raw `ReadableStream` upload.

## Serving: OpenAPIHandler

Import from the adapter subpath (`@orpc/openapi/fetch`, `@orpc/openapi/node`, ...):

```ts
import { SmartCoercionHandlerPlugin } from '@orpc/json-schema'
import { OpenAPIHandler } from '@orpc/openapi/fetch'
import { ZodToJsonSchemaConverter } from '@orpc/zod'

const handler = new OpenAPIHandler(router, {
  plugins: [
    new SmartCoercionHandlerPlugin({ converters: [new ZodToJsonSchemaConverter()] }),
  ],
})

export async function fetch(request: Request): Promise<Response> {
  const { matched, response } = await handler.handle(request, { prefix: '/api', context: {} })
  return matched ? response : new Response('Not Found', { status: 404 })
}
```

`OpenAPIHandler` coexists with `RPCHandler`: both accept the same router, so mount them on different prefixes (for example `/api` and `/rpc`) and try each in turn, returning the first `matched` response.

Smart Coercion: query, path, and form values arrive as strings, so add `SmartCoercionHandlerPlugin` whenever input schemas expect non-string types from those sources. It coerces schema-driven, lossless conversions only (`'123'` to `123`, `'true'`/`'on'` to `true`, ISO strings to `Date`, arrays to `Set`/`Map` via `x-native-type`) and leaves ambiguous values untouched. Skip it when you already coerce in the schema or performance is critical; it adds runtime overhead.

Other handler options: `interceptors`/`routingInterceptors`/`clientInterceptors` for logging and error mapping, `filter` to exclude procedures from matching, and `errorStatusMap` plus `customErrorResponseBodyEncoder` to customize error responses (by default `ORPCError` codes map to statuses via `COMMON_ERROR_STATUS_MAP`, for example `NOT_FOUND` to 404).

## Calling: OpenAPILink

`OpenAPILink` calls an OpenAPI-shaped oRPC API (or any spec-compliant server) through a typesafe client. It needs the contract or router type to know each procedure's route:

```ts
import type { RouterContractClient } from '@orpc/contract'
import type { JsonifiedClient } from '@orpc/openapi'
import { createORPCClient } from '@orpc/client'
import { OpenAPILink } from '@orpc/openapi/fetch'

const link = new OpenAPILink(contract, {
  origin: 'https://api.example.com',
  url: '/api',
  headers: ({ context }) => ({
    authorization: context?.token ? `Bearer ${context.token}` : undefined,
  }),
})

const client: JsonifiedClient<RouterContractClient<typeof contract>> = createORPCClient(link)
```

With a router instead of a contract, type the client as `JsonifiedClient<RouterClient<typeof router>>` (`RouterClient` from `@orpc/server`). `JsonifiedClient` exists because OpenAPI serialization is one-way: a `Date` returns as a string. Add `SmartCoercionLinkPlugin` from `@orpc/json-schema` (same converters, first argument is the contract) to restore native types on responses, then drop the `JsonifiedClient` wrapper from the client type.

To ship a contract to clients without bundling server code, minify it to JSON and import it with a cast; the flow is in the `orpc-contract` skill under "Ship the contract".

## Spec document and interactive docs

`OpenAPIGenerator` turns a router or contract into an OpenAPI 3.2 document (pass any `3.1.x` or `3.0.x` `version` for tools that stop at an older version; `QUERY` procedures need 3.2). `OpenAPIReferenceHandlerPlugin` serves the spec at `/spec.json` and a Scalar UI at `/` under the handler prefix (change with `specPath`/`docsPath`, or set `provider: 'swagger'` for Swagger UI):

```ts
import { OpenAPIGenerator } from '@orpc/openapi'
import { OpenAPIReferenceHandlerPlugin } from '@orpc/openapi/plugins'
import { ZodToJsonSchemaConverter } from '@orpc/zod'

const generator = new OpenAPIGenerator({ converters: [new ZodToJsonSchemaConverter()] })

const handler = new OpenAPIHandler(router, {
  plugins: [
    new OpenAPIReferenceHandlerPlugin({
      spec: () => generator.generate(router, {
        base: {
          info: { title: 'Planet API', version: '1.0.0' },
          servers: [{ url: '/api' }], // absolute URL in production
        },
      }),
    }),
  ],
})
```

Enrich the document through `openapi` metadata: `operationId`, `summary`, `description`, `tags`, `successDescription`, and a `spec` callback that receives the generated operation object and returns an extended one (security requirements, extra responses). Write `spec` and `base` as OpenAPI 3.2 objects even when generating 3.1 or 3.0; the generator downgrades the whole document. Converters also exist for Valibot (`@orpc/valibot`) and ArkType (`@orpc/arktype`); schemas without a matching converter fall back to Standard JSON Schema conversion.

Verify the wiring before declaring success: request `/spec.json` under the handler prefix and one routed endpoint, and confirm the method, path, and status you configured.

## Contract-first

Contract-first workflows belong to the `orpc-contract` skill: defining the shape with `oc` from `@orpc/contract`, implementing it with `implement` from `@orpc/server`, consuming the contract from clients, shipping it as minified JSON, and generating it from an existing OpenAPI spec with Hey API. On the OpenAPI side a contract behaves exactly like a router: attach routes with `.meta(openapi({...}))` on `oc` as shown in [Routing](#routing), serve the implemented router with `OpenAPIHandler` as usual, generate the spec document from the contract directly, and give `OpenAPILink` the contract as its runtime value.

## Full documentation

If this skill and a fetched docs page disagree, trust the page: this skill is a summary and v2 is still moving. The docs are served at https://orpc.dev (the v1 docs stay at https://v1.orpc.dev):

- https://orpc.dev/llms.txt : index of every page with descriptions
- https://orpc.dev/llms-full.txt : the entire docs in one file (large; prefer single pages)
- Append `.md` to any docs URL for that page's exact source markdown (for example https://orpc.dev/docs/openapi/routing.md)

Pages to fetch when you need details beyond this skill:

- OpenAPI: `openapi/routing`, `openapi/input-and-output-mapping`, `openapi/bracket-notation`, `openapi/serializer`, `openapi/handler`, `openapi/link`, `openapi/specification`, `openapi/scalar`
- Plugins: `plugins/smart-coercion`, `plugins/openapi-reference`
