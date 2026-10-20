---
title: Validating on the client
label: '`experimental_validationLink`'
description: '`experimental_validationLink` checks inputs before sending and results when they arrive, against a contract.'
section: Contracts and OpenAPI
order: 6
experiment: contracts
---

Clients ship no schemas by default. To check calls against a contract in the browser, add `experimental_validationLink`: inputs are validated before anything is sent (the same `BAD_REQUEST` the server returns, so forms can show its issues), and results and subscription events are checked when they arrive (`BAD_RESPONSE` when the server drifted from the contract, with the issues on its `cause`):

```ts twoslash
// ---cut-start---
import {
  createTrpcClient,
  httpLink,
  experimental_validationLink,
} from '@trpc12/trpc/client';
import { experimental_contract } from '@trpc12/trpc/contract';
import { z } from 'zod';
import { PostSchema } from './server.ts';
const c = experimental_contract.create();
const appContract = {
  post: {
    byId: c
      .input(z.object({ id: z.string() }))
      .output(PostSchema)
      .query(),
  },
};
declare const url: string;
// ---cut-end---
const client = createTrpcClient({
  router: appContract,
  links: [
    experimental_validationLink({ contract: appContract }),
    httpLink({ url }),
  ],
});
```

Results are checked against the output's type side, so Effect Schema transformations don't run a second time. With `experimental_openApiLink`, whose results are plain JSON, `output: 'json'` decodes them with the Effect Schema's JSON codec, so `Date`s, `bigint`s and classes come back as their types. Standard Schema outputs are validated as they are.

Errors pass through unchecked, so their `data` stays plain JSON under `output: 'json'`, and its type says so: a `Date` in a declared error's `data` is a `string`.

See [Contract-first](../server/contract-first.md) for writing the contract, and [Calling REST from the client](../openapi/client.md) for `experimental_openApiLink`.

## Credits

`experimental_validationLink` follows oRPC's [request validation](https://orpc.dev/docs/plugins/request-validation) and [response validation](https://orpc.dev/docs/plugins/response-validation) plugins.
