---
title: Validating on the client
label: validationLink
description: validationLink checks inputs before sending and results when they arrive, against a contract.
section: Client
parent: client/links
order: 9
---

Clients ship no schemas by default. To check calls against a contract in the browser, add `validationLink`: inputs are validated before anything is sent (the same `BAD_REQUEST` the server returns, so forms can show its issues), and results and subscription events are checked when they arrive (`BAD_RESPONSE` when the server drifted from the contract, with the issues on its `cause`):

```ts twoslash
// ---cut-start---
import {
  createTrpcClient,
  httpLink,
  validationLink,
} from '@trpc12/trpc/client';
import { contract } from '@trpc12/trpc/contract';
import { z } from 'zod';
import { PostSchema } from './server.ts';
const c = contract.create();
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
  links: [validationLink({ contract: appContract }), httpLink({ url })],
});
```

Results are checked against the output's type side, so Effect Schema transformations don't run a second time. With `experimental_openApiLink`, whose results are plain JSON, `output: 'json'` decodes them with the Effect Schema's JSON codec, so `Date`s, `bigint`s and classes come back as their types. Standard Schema outputs are validated as they are.

See [Contract-first](../server/contract-first.md) for writing the contract, and Calling REST from the client for `experimental_openApiLink`.

## Credits

`validationLink` follows oRPC's [request validation](https://orpc.dev/docs/plugins/request-validation) and [response validation](https://orpc.dev/docs/plugins/response-validation) plugins.
