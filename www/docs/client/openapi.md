---
id: openapi
title: OpenAPI / REST Client Generation
sidebar_label: OpenAPI Export
slug: /client/openapi
---

:::caution
The package described here is an alpha release and APIs may for no apparently reason.

Given it's targeting a specification the actual results should only improve over time
:::

The `@trpc/openapi` package generates an OpenAPI 3.1 specification from your tRPC router at build time. You can then feed this spec into any OpenAPI code generator (e.g. [hey-api/openapi-ts](https://github.com/hey-api/openapi-ts)) to produce a typed REST client — useful for consumers that don't use tRPC directly.

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
- **Subscriptions** are skipped (SSE coming soon)

## Using the generated client

tRPC uses a custom query format and response envelope that OpenAPI clients don't handle natively. The `@trpc/openapi/heyapi` package provides a `createTRPCHeyApiClientConfig` helper that configures the hey-api client to work correctly with tRPC endpoints.

### Without a transformer

```ts title='src/client.ts'
import { createTRPCHeyApiClientConfig } from '@trpc/openapi/heyapi';
import { client } from './generated/client.gen';

client.setConfig({
  baseUrl: 'http://localhost:3000',
  ...createTRPCHeyApiClientConfig(),
});
```

```ts title='src/usage.ts'
import { client } from './generated/client.gen';
import { Sdk } from './generated/sdk.gen';

const sdk = new Sdk({ client });

const result = await sdk.greeting({ query: { input: { name: 'World' } } });
const user = await sdk.user.create({ body: { name: 'Bob', age: 30 } });
```

### With a transformer (superjson, devalue, etc.)

:::warning
If your backend uses a [data transformer](/docs/server/data-transformers) like `superjson`, you **must** pass it to the client config. Without this, dates, Maps, Sets, and other non-JSON types may be silently wrong.
:::

Pass your transformer and it handles serialisation in both directions automatically:

```ts title='src/client.ts'
import { createTRPCHeyApiClientConfig } from '@trpc/openapi/heyapi';
import superjson from 'superjson';
import { client } from './generated/client.gen';

client.setConfig({
  baseUrl: 'http://localhost:3000',
  ...createTRPCHeyApiClientConfig({ transformer: superjson }),
});
```

You can then pass native types directly and get them back deserialised:

```ts title='src/usage.ts'
const event = await sdk.getEvent({
  query: { input: { id: 'evt_1', at: new Date('2025-06-15T10:00:00Z') } },
});
// event.data.result.data.at is a Date object ✅

const created = await sdk.createEvent({
  body: { name: 'Conference', at: new Date('2025-09-01T09:00:00Z') },
});
```
