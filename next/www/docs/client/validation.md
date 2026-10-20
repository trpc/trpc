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

The client types a result as its schema's type only where the link checks it: a procedure of `contract` with an output schema. Results of procedures without one, with `.output(schema, { validate: false })` or outside `contract`, and streamed (`stream()`) query and mutation outputs pass through undecoded, so under `output: 'json'` they stay plain JSON, and their types say so: a `Date` among them is a `string`. Subscription events are decoded like results.

## Errors' `data`

The same procedures' declared errors are checked too: the link decodes each one's `data` with the schema its `.errors()` entry gives, so under `output: 'json'` a `Date` in it arrives, and is typed, as a `Date`. The error stays a plain `TrpcError` matched by its code; `instanceof PostNotFound` is still `false` on the client:

```ts twoslash
// ---cut-start---
import {
  createTrpcClient,
  experimental_validationLink,
  httpLink,
  safe,
  TrpcError,
} from '@trpc12/trpc/client';
import { experimental_contract } from '@trpc12/trpc/contract';
import { Schema } from 'effect';
declare const url: string;
// ---cut-end---
class PostNotFound extends TrpcError.Tagged('POST_NOT_FOUND', {
  status: 404,
  data: Schema.Struct({ id: Schema.String, deletedAt: Schema.Date }),
}) {}
const c = experimental_contract.create();
const appContract = {
  post: {
    byId: c
      .input(Schema.Struct({ id: Schema.String }))
      .output(Schema.Struct({ id: Schema.String, title: Schema.String }))
      .errors({ POST_NOT_FOUND: PostNotFound })
      .query(),
  },
};
const client = createTrpcClient({
  router: appContract,
  links: [
    experimental_validationLink({ contract: appContract, output: 'json' }),
    httpLink({ url }),
  ],
});
const [, err] = await safe(client.post.byId.query({ id: '1' }));
if (err?.code === 'POST_NOT_FOUND') {
  err.data.deletedAt;
  //       ^?
}
```

An error whose `data` doesn't match its schema doesn't fail the call: it arrives undeclared (`defined: false`), as if the server hadn't declared it. A custom code keeps its `data` untyped, an [`UndeclaredError`](./errors.md) that `matchError()` hands to `unexpected`; a built-in code like `NOT_FOUND` loses it. Errors the procedure doesn't declare with a schema pass through as they arrive.

See [Contract-first](../server/contract-first.md) for writing the contract, and [Calling REST from the client](../openapi/client.md) for `experimental_openApiLink`.

## Credits

`experimental_validationLink` follows oRPC's [request validation](https://orpc.dev/docs/plugins/request-validation) and [response validation](https://orpc.dev/docs/plugins/response-validation) plugins.
