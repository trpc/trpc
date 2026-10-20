---
title: Should `experimental_validationLink` also check declared errors' `data` and rebuild their error classes on the client?
summary: The validation link checks inputs and outputs only; it could also decode declared errors' `data` and make `instanceof PostNotFound` true on the client.
area: errors
recommended: A
questions: [Q24.8]
links:
  - kind: proposal
    label: 24 Error ownership
    url: ../proposals/24-error-ownership.md
  - kind: decision
    label: closed-client-errors
    url: ../decisions/closed-client-errors.md
  - kind: decision
    label: thrown-errors-and-exhaustive-declarations
    url: ../decisions/thrown-errors-and-exhaustive-declarations.md
  - kind: decision
    label: error-tags
    url: ../decisions/error-tags.md
  - kind: code
    label: experimental_validationLink
    url: ../../packages/trpc/src/client/links/validation.ts
  - kind: code
    label: fromWireError and TrpcError.Tagged (error.ts)
    url: ../../packages/trpc/src/internal/error.ts
  - kind: docs
    label: Server errors, on the client
    url: https://v12.trpc.io/v12/docs/server/errors#on-the-client
---

# Should `experimental_validationLink` also check declared errors' `data` and rebuild their error classes on the client?

## Why it matters

`experimental_validationLink` checks inputs and results against a contract's schemas; errors pass through it. `fromWireError` rebuilds every error as a plain `TrpcError`, so `instanceof PostNotFound` (a `TrpcError.Tagged` class) is false on the client, and under `output: 'json'` a `Date` in an error's `data` stays a string while the same `Date` in an output is decoded. The server already validates declared errors' `data` before sending it.

## Options

### A) Keep it as it is: errors stay plain `TrpcError`s

Errors are typed from the contract and matched by code.

```ts
const [, err] = await safe(client.post.byId.query({ id }));
if (err)
  matchError(err, {
    ...offline,
    POST_NOT_FOUND: (e) => e.data.id, // typed from the contract, JSON form
    unexpected: (e) => e.message,
  });
err instanceof PostNotFound; // false
```

- ✅ Nothing to build; `matchError()` and `Effect.catchTag` match on the code, so neither needs `instanceof`
- ✅ The link is experimental, so it can add this later without breaking anyone
- ❌ No `instanceof` on the client, and `Date`s in error `data` arrive as strings under `output: 'json'`

### B) Check declared errors' `data` and rebuild their classes

The link decodes each defined error's `data` with its spec from the contract and rebuilds the `TrpcError.Tagged` instance.

```ts
const client = createTrpcClient({
  router: appContract,
  links: [
    experimental_validationLink({ contract: appContract, output: 'json' }),
    httpLink({ url }),
  ],
});
const [, err] = await safe(client.post.byId.query({ id }));
err instanceof PostNotFound; // true
err.data.deletedAt; // Date, decoded with PostNotFound's schema
// `data` that fails its schema: BAD_RESPONSE, like an output mismatch
```

- ✅ What Effect's `HttpApiClient` does: errors decode through their schemas into their classes
- ✅ Outputs and errors are treated alike, and a server deployed from another contract is caught
- ❌ The client bundle ships the error schemas
- ❌ A mismatch turns the server's real error into `BAD_RESPONSE`

### C) Decode `data` only, without rebuilding classes

Under `output: 'json'`, decode defined errors' `data` with their schemas; the error stays a plain `TrpcError`.

```ts
const [, err] = await safe(client.post.byId.query({ id }));
err.data.deletedAt; // Date
err instanceof PostNotFound; // still false
```

- ✅ Fixes the JSON-form mismatch between outputs and errors with no class registry
- ❌ The same schema work as B, without `instanceof`

## Recommendation

**A** for now. Declared `.errors()` lists are exhaustive and checked on the server ([thrown-errors-and-exhaustive-declarations](../decisions/thrown-errors-and-exhaustive-declarations.md)), and matching is by code (`_tag` is the code, [error-tags](../decisions/error-tags.md)), so B mostly adds `instanceof` and `Date`s. B is the Effect-native shape if someone needs it, and fits the experimental link without a break.

## Blocked until answered

- Nothing.

## Details

- Undeclared errors (`UndeclaredError`, a thrown custom code from a procedure without `.errors()`) have no schema, so no option can check their `data`.
- `experimental_validationLink`'s own output mismatch is `BAD_RESPONSE`, with the issues on `cause.issues` ([closed-client-errors](../decisions/closed-client-errors.md)); B would use the same for an error's `data`.
- `offline` in the examples is the object of link-code handlers (`NETWORK_ERROR`, `BAD_RESPONSE`) the client errors docs spread into each `matchError()`.
