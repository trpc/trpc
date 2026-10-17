---
title: Validating on the client
description: validationLink checks inputs before sending and results when they arrive, against a contract.
section: Client
order: 5
---

Clients ship no schemas by default. To check calls against a contract in the browser, add `validationLink`: inputs are validated before anything is sent (the same `BAD_REQUEST` the server returns, so forms can show its issues), and results and subscription events are checked when they arrive (`PARSE_ERROR` when the server drifted from the contract):

```ts
const client = createTrpcClient({
  router: appContract,
  links: [validationLink({ contract: appContract }), httpLink({ url })],
});
```

Results are checked against the output's type side, so Effect Schema transformations don't run a second time. With `openApiLink`, whose results are plain JSON, `output: 'json'` decodes them with the Effect Schema's JSON codec, so `Date`s, `bigint`s and classes come back as their types. Standard Schema outputs are validated as they are.

See [Contract-first](../server/contract-first.md) for writing the contract, and [Calling REST from the client](../openapi/client.md) for `openApiLink`.
