---
id: openapi
title: OpenAPI / REST Client Generation
sidebar_label: OpenAPI Export
slug: /client/openapi
---

The `@trpc/openapi` package generates an OpenAPI 3.0 specification from your tRPC router at build time. You can then feed this spec into any OpenAPI code generator (e.g. [hey-api/openapi-ts](https://github.com/hey-api/openapi-ts)) to produce a typed REST client — useful for consumers that don't use tRPC directly.

## Install

```bash
npm install @trpc/openapi
```

## Generate the spec

### CLI

```bash
npx trpc-openapi ./src/server/router.ts
```

| Option                | Default        | Description                      |
| --------------------- | -------------- | -------------------------------- |
| `-e, --export <name>` | `AppRouter`    | Name of the exported router type |
| `-o, --output <file>` | `openapi.json` | Output file path                 |
| `--title <text>`      | `tRPC API`     | OpenAPI `info.title`             |
| `--version <ver>`     | `0.0.0`        | OpenAPI `info.version`           |

```bash
npx trpc-openapi ./src/server/router.ts -o api.json --title "My API" --version 1.0.0
```

### Programmatic

```ts title='scripts/generate-openapi.ts'
import { generateOpenAPIDocument } from '@trpc/openapi';

const doc = generateOpenAPIDocument('./src/server/router.ts', {
  exportName: 'AppRouter',
  title: 'My API',
  version: '1.0.0',
});
```

The generator statically analyzes your router's TypeScript types — it never executes your code.

## Generate a client from the spec

Any OpenAPI client generator works. Here's an example with `@hey-api/openapi-ts`:

```bash
npm install @hey-api/openapi-ts @hey-api/client-fetch
npx openapi-ts -i openapi.json -o src/generated -c @hey-api/client-fetch
```

This produces typed SDK functions matching your tRPC procedures:

- **Queries** → `GET /procedure.path` with `?input=<JSON>`
- **Mutations** → `POST /procedure.path` with JSON body
- **Subscriptions** are skipped (not expressible in REST)

## Calling procedures through the generated client

The generated spec includes tRPC's response envelope (`{ result: { data: ... } }`) in every endpoint schema, so the generated client types match the actual HTTP responses out of the box.

```ts title='src/client.ts'
import { client } from './generated/client.gen';

client.setConfig({ baseUrl: 'http://localhost:3000' });
```

Then call procedures like normal SDK functions:

```ts title='src/usage.ts'
import { greeting, userCreate } from './generated/sdk.gen';

// Query with input — tRPC expects ?input=<JSON>
const result = await greeting({
  query: { input: { name: 'World' } },
  querySerializer: () =>
    `input=${encodeURIComponent(JSON.stringify({ name: 'World' }))}`,
});
console.log(result.data); // { result: { data: { message: "Hello World" } } }

// Mutation with body
const user = await userCreate({
  body: { name: 'Bob', age: 30 },
});
console.log(user.data); // { result: { data: { id: 2, name: "Bob", age: 30 } } }
```

## Handling transformers (superjson, devalue, etc.)

:::warning
If your backend uses a [data transformer](/docs/server/data-transformers) like `superjson`, generated REST clients **must** apply the same serialization on both input and output. Without this, dates, Maps, Sets, and other non-JSON types will be silently wrong.
:::

The OpenAPI spec is generated from your declared TypeScript types (e.g. `z.date()` → `{ type: "string", format: "date-time" }`). It does **not** know about the transformer. This means:

1. **Inputs** must be serialized with the transformer before sending
2. **Outputs** arrive wrapped in both the tRPC envelope and the transformer envelope (e.g. `{ result: { data: { json: {...}, meta: {...} } } }` for superjson) and must be deserialized

### What happens without transformer interceptors

Without deserialization, the `result.data` field contains the raw superjson envelope instead of your expected types:

```ts
// ❌ Without superjson deserialization
const result = await getEvent({
  query: { input: { id: 'evt_1', at: '2025-06-15T10:00:00Z' } },
  querySerializer: () => `input=${encodeURIComponent(JSON.stringify({ id: 'evt_1', at: '2025-06-15' }))}`,
});
// result.data.result.data = { json: { id: "evt_1", at: "2025-06-15T10:00:00.000Z" }, meta: { values: { at: ["Date"] } } }
//                            ^^^^^ raw superjson envelope, not your data!
```

### Adding superjson interceptors

You need a response interceptor to deserialize the superjson envelope inside `result.data`:

```ts title='src/client.ts'
import superjson from 'superjson';
import { client } from './generated/client.gen';

client.setConfig({ baseUrl: 'http://localhost:3000' });

// Deserialize the superjson envelope within the tRPC response
client.interceptors.response.use(async (response) => {
  if (!response.ok) return response;
  const body = await response.json();
  const sjEnvelope = body?.result?.data ?? body;
  const deserialized = superjson.deserialize(sjEnvelope);
  // Rewrite result.data with the deserialized value
  body.result.data = deserialized;
  return new Response(JSON.stringify(body), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
});
```

Inputs must also be serialized with superjson:

```ts title='src/usage-with-superjson.ts'
import superjson from 'superjson';
import { getEvent, createEvent } from './generated/sdk.gen';

// Query — serialize input with superjson
const sjInput = superjson.serialize({
  id: 'evt_1',
  at: new Date('2025-06-15T10:00:00Z'),
});
const event = await getEvent({
  query: { input: sjInput },
  querySerializer: () =>
    `input=${encodeURIComponent(JSON.stringify(sjInput))}`,
});
// event.data.result.data = { id: "evt_1", at: "2025-06-15T10:00:00.000Z" }  ✅

// Mutation — serialize body with superjson
const sjBody = superjson.serialize({
  name: 'Conference',
  at: new Date('2025-09-01T09:00:00Z'),
});
const created = await createEvent({
  body: sjBody,
});
// created.data.result.data = { name: "Conference", at: "2025-09-01T09:00:00.000Z" }  ✅
```

:::tip
The same pattern applies to any transformer — not just superjson. If you use `devalue` or a custom transformer, replace `superjson.serialize()` / `superjson.deserialize()` with your transformer's equivalent methods.
:::
