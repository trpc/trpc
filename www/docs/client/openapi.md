---
id: openapi
title: OpenAPI (alpha)
sidebar_label: OpenAPI (alpha)
slug: /openapi
---

:::caution
This package is in alpha. APIs may change without notice.
:::

The `@trpc/openapi` package generates an OpenAPI 3.1 specification from your tRPC router. Use the spec to:

- Generate a typed API client in any language
- Call tRPC endpoints via HTTP tools like Postman or Insomnia
- Enable AI agent integrations such as MCP servers

## Install

```bash
pnpm install @trpc/openapi
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

The generator statically analyses your router's TypeScript types — it never executes your code.

## Generate a client from the spec

Any OpenAPI client generator should work, but the most tested integration is with [HeyAPI](https://heyapi.dev/openapi-ts/get-started).

A generated client will produce typed SDK functions matching your tRPC procedures:

- **Queries** → `GET /procedure.path`
- **Mutations** → `POST /procedure.path`
- **Subscriptions** are ignored (SSE coming soon)

### HeyAPI (TypeScript)

[HeyAPI Documentation](https://heyapi.dev/)

```bash
pnpm install @hey-api/openapi-ts
npx openapi-ts -i openapi.json -o src/generated
```

Out of the box, an OpenAPI-generated client won't know about your transformer setup or how to encode query parameters. The `@trpc/openapi/heyapi` package provides a `createTRPCHeyApiClientConfig` helper that bridges this gap — it configures request serialisation and response parsing so the generated SDK works correctly with tRPC endpoints.

#### Without a transformer

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

#### With a transformer (superjson, devalue, etc.)

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

### Using a different generator or language

The generated OpenAPI spec works with any OpenAPI-compatible client generator. To integrate correctly with tRPC's protocol, your client needs to handle two things:

- **Query Inputs** — GET requests encode input as `?input=<JSON>`, not as individual query parameters
- **Transformers** — if your tRPC API uses a transformer, the client must serialise inputs and deserialise outputs using the same format

See the [HeyAPI config source](https://github.com/trpc/trpc/blob/f346e9bb97ff3c8a7e874f59110a47730293097a/packages/openapi/src/heyapi/index.ts) for a complete reference implementation.

## Transformers

tRPC [data transformers](/docs/server/data-transformers) let you send rich types like `Date`, `Map`, `Set`, and `BigInt` over the wire. When using the OpenAPI client, the same transformer must be configured on both the server and client so that inputs are serialised and outputs are deserialised correctly.

Any transformer that implements the tRPC `DataTransformer` interface (`serialize` / `deserialize`) works with `createTRPCHeyApiClientConfig`. Below are some tested options.

### SuperJSON

The most popular transformer for TypeScript-to-TypeScript setups. Handles `Date`, `Map`, `Set`, `BigInt`, `RegExp`, and more.

```bash
pnpm install superjson
```

```ts title='src/server.ts'
import { initTRPC } from '@trpc/server';
import superjson from 'superjson';

const t = initTRPC.create({ transformer: superjson });
```

```ts title='src/client.ts'
import { createTRPCHeyApiClientConfig } from '@trpc/openapi/heyapi';
import superjson from 'superjson';
import { client } from './generated/client.gen';

client.setConfig({
  baseUrl: 'http://localhost:3000',
  ...createTRPCHeyApiClientConfig({ transformer: superjson }),
});
```

See the [superjson test](https://github.com/trpc/trpc/blob/main/packages/openapi/test/generate.test.ts) for a full end-to-end example.

### MongoDB Extended JSON v2

[EJSON](https://www.mongodb.com/docs/manual/reference/mongodb-extended-json/#mongodb-extended-json-v2-usage) is a good choice when you need cross-language support. The `bson` npm package provides `EJSON.serialize` / `EJSON.deserialize` which map directly to a tRPC `DataTransformer`.

Available in: C, C#, C++, Go, Java, Node.js, Perl, PHP, Python, Ruby, Scala

```bash
pnpm install bson
```

```ts title='src/transformer.ts'
import { EJSON } from 'bson';
import type { TRPCDataTransformer } from '@trpc/server';

export const ejsonTransformer: TRPCDataTransformer = {
  serialize: (value) => EJSON.serialize(value),
  deserialize: (value) => EJSON.deserialize(value as Document),
};
```

```ts title='src/client.ts'
import { createTRPCHeyApiClientConfig } from '@trpc/openapi/heyapi';
import { client } from './generated/client.gen';
import { ejsonTransformer } from './transformer';

client.setConfig({
  baseUrl: 'http://localhost:3000',
  ...createTRPCHeyApiClientConfig({ transformer: ejsonTransformer }),
});
```

See the [MongoDB EJSON test](https://github.com/trpc/trpc/blob/main/packages/openapi/test/mongoEjson.test.ts) for a full end-to-end example.

### Amazon Ion

[Amazon Ion](https://amazon-ion.github.io/ion-docs/) is a richly-typed data format with broad language support. It doesn't directly support the `TRPCDataTransformer` interface and requires a bit of boilerplate to make work with tRPC in JS/TS, but may be a good choice for your own system.

Available in: C, C#, D, Go, Java, JavaScript, PHP, Python, Rust

```bash
pnpm install ion-js
```

See the [Amazon Ion test](https://github.com/trpc/trpc/blob/main/packages/openapi/test/amazonIon.test.ts) for the transformer implementation, boilerplate, and a full end-to-end example.

### Writing a custom transformer

Any object with `serialize` and `deserialize` methods works:

```ts
import type { TRPCDataTransformer } from '@trpc/server';

const myTransformer: TRPCDataTransformer = {
  serialize: (value) => {
    /* encode rich types */
  },
  deserialize: (value) => {
    /* decode them back */
  },
};
```

Pass it to both `initTRPC.create({ transformer })` on the server and `createTRPCHeyApiClientConfig({ transformer })` on the client. See the [data transformers docs](/docs/server/data-transformers) for more details.

## Full example

For a complete, runnable project that ties all of these steps together, see the [openapi-codegen example](https://github.com/trpc/trpc/tree/main/examples/openapi-codegen).
