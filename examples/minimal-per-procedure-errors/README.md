# Per-procedure errors with `.errors()`

A minimal React + tRPC example built around **per-procedure error formatters**.

A router-wide `errorFormatter` gives every error the same shape, which means the
client can't tell a rate limit from a card decline without inspecting strings.
`.errors()` fixes that: a procedure declares the shapes it can fail with, and the
client receives them as a discriminated union it has to narrow.

## What to look at

[`server/index.ts`](./server/index.ts) builds the chain:

```ts
const rateLimitedProcedure = t.procedure.errors((opts) => {
  if (opts.error.cause instanceof RateLimitError) {
    return {
      ...opts.shape,
      data: {
        ...opts.shape.data,
        kind: 'RATE_LIMIT' as const,
        retryAfterMs: opts.error.cause.retryAfterMs,
      },
    };
  }
  // declining passes the error on
  return undefined;
});

// chaining widens the union rather than replacing it
const billedProcedure = rateLimitedProcedure.errors(/* PAYMENT_REQUIRED */);
```

[`client/src/Checkout.tsx`](./client/src/Checkout.tsx) narrows it:

```tsx
const data = checkout.error?.data;

if (data && 'kind' in data) {
  switch (data.kind) {
    case 'RATE_LIMIT':
      return `Retry in ${data.retryAfterMs}ms`; // only reachable here
    case 'PAYMENT_REQUIRED':
      return `$${data.amountDue / 100} due`;
  }
}

// nothing claimed it, so it has the router-wide shape
return data.handledBy;
```

## The rules it demonstrates

| Where                                               | Rule                                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `checkout`                                          | Returning a shape claims the error; returning `undefined` declines and passes it on.                         |
| `checkout`                                          | Chained `.errors()` calls widen the union. Handlers run tail-first and the first to return a shape wins.     |
| `checkout` with `unrelated-failure`                 | An error no handler claims reaches the global `errorFormatter`, so that shape is always in the union.        |
| `greeting`                                          | A procedure without `.errors()` only ever has the router-wide shape - no `kind` in its type.                 |
| `maintenance`                                       | A handler only sees errors thrown **after** it in the chain, so `.errors()` goes before a throwing `.use()`. |
| [`SafeCheckout.tsx`](./client/src/SafeCheckout.tsx) | `safe()` hands the same typed shapes back as a `[data, error]` pair instead of throwing.                     |

## Playing around

```bash
pnpm i
pnpm dev
```

The client runs on <http://localhost:3001> and the API on port `2023`.

Try editing the ts files to see the type checking in action :) Each `💡 Tip`
comment marks something worth breaking on purpose.

## Building

```bash
pnpm build
pnpm start
```
