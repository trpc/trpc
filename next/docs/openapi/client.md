---
title: Calling REST from the client
description: openApiLink sends each call to its REST route, typed from a contract.
section: OpenAPI
order: 3
---

`openApiLink` sends each call to its REST route. It needs the routes, so it takes a contract; it never needs the router.

```ts
import { toContract } from '@trpc12/trpc/contract';
import { openApiLink } from '@trpc12/trpc/openapi';

const contract = toContract(appRouter); // or the JSON, shipped to the client
const client = createTrpcClient({
  router: contract,
  links: [
    openApiLink({
      url: 'https://api.example.com',
      contract,
      headers: { 'x-user': 'ada' },
    }),
  ],
});

await client.post.byId.query({ id: '1' }); // GET https://api.example.com/api/posts/1
```

Declared errors come back as typed `TrpcError`s, as they do over RPC.

REST responses are plain JSON, and the client types say so: a `createdAt: Date` output is a `string` through `openApiLink`. To get the types back, put `validationLink({ contract, output: 'json' })` in front: it decodes each result with the Effect Schema's JSON codec, and the client types results as the schemas' types again ([Validating on the client](../client/validation.md)):

```ts
links: [
  validationLink({ contract: appContract, output: 'json' }),
  openApiLink({ url, contract: toContract(appContract) }),
];
```
