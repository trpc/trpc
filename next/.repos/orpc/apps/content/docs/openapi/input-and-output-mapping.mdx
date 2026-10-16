---
title: "OpenAPI Input and Output Mapping"
description: "Learn how oRPC maps OpenAPI requests and responses to procedure inputs and outputs with compact and detailed structures, parameter styles, and body hints."
sidebar:
  label: "Input and Output Mapping"
---

## Input Mapping

By default, oRPC uses `compact` mode where path parameters are merged with either query parameters or the request body, depending on the HTTP method.

```ts
const searchPlanets = os
  .meta(openapi({ method: 'GET', path: '/planets/{id}' }))
  .input(z.object({
    id: z.string(),
    q: z.string().optional(),
  }))
  .handler(async ({ input }) => {
    return { id: input.id, q: input.q }
  })
```

For `GET /planets/earth?q=life`, the procedure receives:

```json
{
  "id": "earth",
  "q": "life"
}
```

:::info
Some requests cannot be merged into a single object. For example, `POST /planets/earth` with a non-object body cannot be merged. In that case, the input contains only the path params and the body is ignored. Use [detailed input structure](#detailed-input-structure) if you also need the body.
:::

### Detailed Input Structure

In `detailed` mode, the input is an object with separate `params`, `query`, `headers`, and `body` fields.

```ts
const updatePlanet = os
  .meta(openapi({
    method: 'POST',
    path: '/planets/{id}',
    inputStructure: 'detailed',
  }))
  .input(z.object({
    params: z.object({ id: z.string() }),
    query: z.object({ dryRun: z.coerce.boolean().optional() }).optional(),
    headers: z.object({ 'x-trace-id': z.string() }).optional(),
    body: z.object({ name: z.string() }),
  }))
  .handler(async ({ input }) => {
    return input
  })
```

For `POST /planets/earth?dryRun=true` with header `x-trace-id: abc123` and body `{ "name": "Earth" }`, the procedure receives:

```json
{
  "params": { "id": "earth" },
  "query": { "dryRun": true },
  "headers": { "x-trace-id": "abc123" },
  "body": { "name": "Earth" }
}
```

:::info
You only need to define the fields you want to access. For example, if you only care about path params and the request body, your input schema can include just `params` and `body`.
:::

### Path Parameter Styles

By default, path parameters are decoded as plain strings. Use `paramsStyles` to override how each path parameter is encoded and decoded.

```ts
const getPlanets = os
  .meta(openapi({
    method: 'GET',
    path: '/planets/{ids}/{filters}',
    paramsStyles: {
      ids: 'comma-delimited-array',
      filters: 'comma-delimited-object',
    },
  }))
  .input(z.object({
    ids: z.array(z.string()),
    filters: z.object({
      type: z.string(),
      status: z.string(),
    }),
  }))
  .handler(async () => [])
```

Supported path parameter styles:

| Style                    | Example path segment               | Decoded value                                     |
| ------------------------ | ---------------------------------- | ------------------------------------------------- |
| `primitive` _(default)_  | `/planets/earth`                   | `{ id: 'earth' }`                                 |
| `comma-delimited-array`  | `/planets/earth,mars`              | `{ ids: ['earth', 'mars'] }`                      |
| `comma-delimited-object` | `/planets/type,rocky,status,known` | `{ filters: { type: 'rocky', status: 'known' } }` |

:::warning
When using delimited styles, do not use delimiter characters like `,` in keys or values. They can make the parameter ambiguous.
:::

### Query Styles

By default, query parameters are decoded with [bracket notation](/docs/openapi/bracket-notation). Use `queryStyles` to override how each query parameter is encoded and decoded.

```ts
const searchPlanets = os
  .meta(openapi({
    method: 'GET',
    path: '/planets',
    queryStyles: {
      keyword: 'primitive',
      tags: 'comma-delimited-array',
      filters: 'comma-delimited-object',
      meta: 'json',
    },
  }))
  .handler(async () => [])
```

Supported query styles:

| Style                    | Example                                         | Decoded value                                             |
| ------------------------ | ----------------------------------------------- | --------------------------------------------------------- |
| `primitive`              | `?tag=a&tag=b`                                  | `{ tag: 'b' }`                                            |
| `array`                  | `?tag=a&tag=b`                                  | `{ tag: ['a', 'b'] }`                                     |
| `comma-delimited-array`  | `?tags=red,blue`                                | `{ tags: ['red', 'blue'] }`                               |
| `comma-delimited-object` | `?filter=size,large,brand,nike`                 | `{ filter: { size: 'large', brand: 'nike' } }`            |
| `space-delimited-array`  | `?tags=red blue`                                | `{ tags: ['red', 'blue'] }`                               |
| `space-delimited-object` | `?filter=size large brand nike`                 | `{ filter: { size: 'large', brand: 'nike' } }`            |
| `pipe-delimited-array`   | `?tags=red\|blue`                               | `{ tags: ['red', 'blue'] }`                               |
| `pipe-delimited-object`  | `?filter=size\|large\|brand\|nike`              | `{ filter: { size: 'large', brand: 'nike' } }`            |
| `json`                   | `?meta={"enabled":true}`                        | `{ meta: { enabled: true } }`                             |
| _default_                | `?tags[]=red&tags[]=blue&filter[status]=active` | `{ tags: ['red', 'blue'], filter: { status: 'active' } }` |

:::warning
When using delimited styles, do not use delimiter characters like `,`, ` `, or `|` in keys or values. They can make the parameter ambiguous.
:::

## Output Mapping

By default, oRPC uses `compact` mode. The procedure's return value becomes the response body, and the status code comes from `successStatus`, which defaults to `200` (should be in the `2xx` range and must be less than `400`).

```ts
const getPlanet = os
  .meta(openapi({ method: 'GET', path: '/planets', successStatus: 200 }))
  .handler(async () => {
    return { id: 'earth', name: 'Earth' }
  })
```

### Detailed Output Structure

In `detailed` mode, return an object with the following fields:

- `status`: optional success status code _(defaults to `successStatus`, should be in the `2xx` range and must be less than `400`)_
- `headers`: optional response headers in lower-case keys
- `body`: optional response body

```ts
const savePlanet = os
  .meta(openapi({
    method: 'PUT',
    path: '/planets/{id}',
    outputStructure: 'detailed',
    successStatus: 200,
  }))
  .input(z.object({ id: z.string() }))
  .output(z.union([
    z.object({
      status: z.literal(201).meta({ description: 'Created' }),
      body: z.object({ id: z.string(), name: z.string() }),
    }),
    z.object({
      status: z.literal(200).meta({ description: 'Updated' }),
      body: z.object({ id: z.string(), name: z.string() }),
    }),
  ]))
  .handler(async ({ input }) => {
    if (!isExistingPlanet(input.id)) {
      return {
        status: 201,
        headers: { 'x-created': 'true' },
        body: { id: 'earth', name: 'Earth' },
      }
    }

    return {
      body: { id: 'earth', name: 'Earth' },
    }
  })
```

### Redirect Response

Combine `successStatus` with the [detailed output structure](#detailed-output-structure) to return a standard HTTP redirect: a `3xx` status and a [`Location`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Location) header.

```ts
const redirect = os
  .meta(openapi({
    method: 'GET',
    path: '/redirect',
    successStatus: 307,
    outputStructure: 'detailed',
  }))
  .output(z.object({
    headers: z.object({ location: z.string() }),
  }))
  .handler(async () => {
    return {
      headers: { location: 'https://orpc.dev' },
    }
  })
```

:::warning
[OpenAPI Link](/docs/openapi/link) does not follow redirects and throws in browsers, where `fetch` hides redirect responses. Server runtimes receive the `3xx` response as the output.
:::

## Body Hints

The body parser normally uses `Content-Type`, `Content-Length`, `Content-Disposition`, and `Standard-Server` headers to decide how to parse the body. If that information is missing or misleading, use `requestBodyHint` to tell [OpenAPI Handler](/docs/openapi/handler) how to parse the request body. Likewise, use `responseBodyHint` to tell [OpenAPI Link](/docs/openapi/link) how to parse the response body.

```ts
const uploadLargeFile = os
  .meta(openapi({
    requestBodyHint: 'octet-stream',
    responseBodyHint: 'json',
  }))
  .input(z.instanceof(ReadableStream))
  .handler(async ({ input }) => {
    for await (const chunk of input) {
      // process chunk
    }

    return { ok: true }
  })
```

Supported body hints:

| Hint                | Parsed Result                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `json`              | JSON value                                                                                          |
| `form-data`         | `FormData` decoded with [bracket notation](/docs/openapi/bracket-notation)                          |
| `url-search-params` | `URLSearchParams` decoded with [bracket notation](/docs/openapi/bracket-notation)                   |
| `event-stream`      | [AsyncIteratorObject](/docs/async-iterator-object)                                                  |
| `octet-stream`      | [`ReadableStream<Uint8Array>`](/docs/binary-data#readablestreamuint8array) for streamed binary data |
| `file`              | `File` for binary data                                                                              |
| `none`              | `undefined`                                                                                         |

:::info
Learn more about body hints in the [Standard Server documentation](https://github.com/middleapi/standard-server#body-types)
:::

## Metadata Merging

When `openapi` is applied multiple times, `paramsStyles` and `queryStyles` are merged per parameter, and the most recent style defined for a parameter wins. `inputStructure`, `outputStructure`, `responseBodyHint`, and `requestBodyHint` are overridden by the most recent call. For the full merge behavior of every field, see [Metadata Merging](/docs/openapi/specification#metadata-merging).

```ts
const router = os
  .meta(openapi({ inputStructure: 'detailed' }))
  .router({
    get: os
      .meta(openapi({ method: 'GET', path: '/planets', inputStructure: 'compact' }))
      .meta(openapi({ queryStyles: { tags: 'comma-delimited-array' } }))
      .meta(openapi({ queryStyles: { q: 'primitive' } }))
      .input(z.object({ tags: z.array(z.string()), q: z.string().optional() }))
      .handler(async () => ([])),
  })
```

These are equivalent to:

```ts
const router = {
  get: os
    .meta(openapi({
      method: 'GET',
      path: '/planets',
      inputStructure: 'compact',
      queryStyles: {
        tags: 'comma-delimited-array',
        q: 'primitive',
      },
    }))
    .input(z.object({ tags: z.array(z.string()), q: z.string().optional() }))
    .handler(async () => ([])),
}
```

:::info
Metadata resets to its default behavior when set to `undefined` in subsequent calls:

```ts
const example = os
  .meta(openapi({ queryStyles: { tags: 'comma-delimited-array' } }))
  .meta(openapi({ queryStyles: undefined }))
```

In this example, the final `queryStyles` is `undefined`, so query parameters are parsed with the default bracket notation.

:::
