---
title: OpenAPI
label: Overview
description: Serve the router over REST, document it as OpenAPI 3.1, call REST routes from the client, and generate contracts from OpenAPI documents.
section: Contracts and OpenAPI
order: 1
v11: openapi
experiment: contracts
---

`@trpc12/trpc/openapi` puts the same router behind REST routes and an OpenAPI 3.1 document, so tools and clients that don't speak tRPC can call it. RPC and REST run side by side; neither changes the other.

```ts twoslash
// ---cut-start---
import { db } from './server.ts';
// ---cut-end---
import {
  experimental_createOpenApiHandler,
  experimental_generateOpenApi,
  experimental_openapi,
} from '@trpc12/trpc/openapi';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';

const t = initTrpc().concat(experimental_openapi());

const router = t.router({
  post: {
    byId: t.procedure
      .meta({ route: { method: 'GET', path: '/posts/{id}' } })
      .input(z.object({ id: z.string() }))
      .query((opts) => db.post.find(opts.input.id) ?? null),
  },
});

const rest = experimental_createOpenApiHandler({ router });
const doc = experimental_generateOpenApi(router, {
  info: { title: 'Blog', version: '1.0.0' },
});
```

`GET /api/posts/1` now calls `post.byId`, and `doc` describes it with the input and output schemas.

- [REST routes](./routes.md): route `meta`, the handler, how inputs map to paths, queries and bodies, and outputs and errors.
- [The document](./document.md): generate the document from the router's schemas, or from its types.
- [Calling REST from the client](./client.md): `experimental_openApiLink` sends each call to its REST route, typed from a contract.
- [A contract from OpenAPI](./from-document.md): generate a typed contract module from any OpenAPI 3.0 or 3.1 document, to call APIs that aren't tRPC.
- [Generating a client with Hey API](./hey-api.md): generate a typed SDK of the REST routes from the document, for apps that can't import the router's type.

The [`examples/experimental/openapi`](../../../examples/experimental/openapi/README.md) app serves one router over RPC and REST, generates its document from types, and calls it with `fetch` and `experimental_openApiLink`.

## Credits

REST routes declared in procedure `meta` come from [trpc-openapi](https://github.com/trpc/trpc-openapi), by [James Berry](https://github.com/jlalmes), which first brought OpenAPI to tRPC routers; [trpc-to-openapi](https://github.com/mcampa/trpc-to-openapi) maintains it for v11. Serving the whole router over REST with no configuration, `.route({ spec })` and OpenAPI-to-contract follow [oRPC](https://orpc.dev)'s OpenAPI support.
