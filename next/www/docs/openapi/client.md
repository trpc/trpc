---
title: Calling REST from the client
description: '`experimental_openApiLink` sends each call to its REST route, typed from a contract.'
section: Contracts and OpenAPI
order: 4
experiment: contracts
---

`experimental_openApiLink` sends each call to its REST route. It needs the routes, so it takes a contract; it never needs the router.

```ts twoslash
// ---cut-start---
import { createTrpcClient } from '@trpc12/trpc/client';
import { experimental_openapi } from '@trpc12/trpc/openapi';
import { initTrpc } from '@trpc12/trpc/server';
import { z } from 'zod';
import { db, type Context } from './server.ts';
const t = initTrpc<{ ctx: Context }>().concat(experimental_openapi());
const appRouter = t.router({
  post: {
    byId: t.procedure
      .meta({ route: { method: 'GET', path: '/posts/{id}' } })
      .input(z.object({ id: z.string() }))
      .query((opts) => db.post.find(opts.input.id)),
  },
});
// ---cut-end---
import { experimental_toContract } from '@trpc12/trpc/contract';
import { experimental_openApiLink } from '@trpc12/trpc/openapi';

const contract = experimental_toContract(appRouter); // or the JSON, shipped to the client
const client = createTrpcClient({
  router: contract,
  links: [
    experimental_openApiLink({
      url: 'https://api.example.com',
      contract,
      headers: { 'x-user': 'ada' },
    }),
  ],
});

await client.post.byId.query({ id: '1' }); // GET https://api.example.com/api/posts/1
```

Declared errors come back as typed `TrpcError`s, as they do over RPC.

A `ReadableStream` input to an [`experimental_byteStream()`](../server/byte-streams.md#over-openapi) procedure, or one in a detailed input's `body`, is sent as the `application/octet-stream` body itself, while it's read. As with `httpLink`, browsers send stream bodies only over HTTP/2 and later ([Streaming back](../server/byte-streams.md#streaming-back)).

REST responses are plain JSON, and the client types say so: a `createdAt: Date` output is a `string` through `experimental_openApiLink`. To get the types back, put `experimental_validationLink({ contract, output: 'json' })` in front: it decodes each result and each declared error's `data` with the Effect Schema's JSON codec, and the client types them as the schemas' types again. What it doesn't decode keeps its JSON types: streamed outputs, and procedures without an output schema or outside `contract` ([Validating on the client](../client/validation.md)):

```ts
links: [
  experimental_validationLink({ contract: appContract, output: 'json' }),
  experimental_openApiLink({
    url,
    contract: experimental_toContract(appContract),
  }),
];
```

## Credits

`experimental_openApiLink` follows [oRPC's OpenAPI link](https://orpc.dev/docs/openapi/link).
