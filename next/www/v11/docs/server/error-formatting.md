---
title: "Error Formatting"
description: ""
section: "Backend Usage"
order: 23
---

The error formatting in your router will be inferred all the way to your client.

## Usage example highlighted

### Adding custom formatting

```ts title="server.ts"
import { initTRPC } from '@trpc/server';
import { ZodError } from 'zod';

export const t = initTRPC.create({
  errorFormatter(opts) {
    const { shape, error } = opts;
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.code === 'BAD_REQUEST' && error.cause instanceof ZodError
            ? error.cause.flatten()
            : null,
      },
    };
  },
});
```

### Usage in React

```tsx title="components/MyComponent.tsx"
import { useEffect } from 'react';
import { trpc } from '../utils/trpc';

export function MyComponent() {
  const mutation = trpc.addPost.useMutation();

  useEffect(() => {
    mutation.mutate({ title: 'example' });
  }, []);

  if (mutation.error?.data?.zodError) {
    // zodError will be inferred
    return (
      <pre>Error: {JSON.stringify(mutation.error.data.zodError, null, 2)}</pre>
    );
  }
  return <>[...]</>;
}
```

## Per-procedure error formatting

Errors can be formatted on a per-procedure basis using the `.errors()` method, which can be chained to produce a union of possible error shapes for each procedure.

When a middleware or procedure throws an error, it bubbles upward through all `.errors()` handlers until one returns a shape or the global errorFormatter is reached.

```ts title="server.ts"
const rateLimitedProcedure = t.procedure
  .errors((opts) => {
    if (opts.error.cause instanceof RateLimitError) {
      return {
        ...opts.shape,
        data: { ...opts.shape.data, kind: 'RATE_LIMIT' as const },
      };
    }
    return undefined;
  })
  .use(opts => {
    // Important: errors bubble up so a throwing middleware must come after the .errors() handler
    if (isRateLimited(opts)) {
      throw new RateLimitError();
    }

    return opts.next();
  });

const billedProcedure = rateLimitedProcedure
  .errors((opts) => {
    if (opts.error.cause instanceof PaymentRequiredError) {
      return {
        ...opts.shape,
        data: {
          ...opts.shape.data,
          kind: 'PAYMENT_REQUIRED' as const,
          amountDue: opts.error.cause.amountDue,
        },
      };
    }
    return undefined;
  });

const addPostProcedure = billedProcedure.mutation(opts => {
  if (isPaymentRequired(opts)) {
    throw new PaymentRequiredError(100);
  }

  return {
    success: true,
  };
});
```

## All properties sent to `errorFormatter()`

> tRPC is compliant with [JSON-RPC 2.0](https://www.jsonrpc.org/specification)

```ts
interface ErrorFormatterOpts {
  error: TRPCError;
  type: 'query' | 'mutation' | 'subscription' | 'unknown';
  path: string | undefined;
  input: unknown;
  ctx: unknown;
  shape: { message: string; code: number; data: unknown };
}
```

**`DefaultErrorShape`:**

```ts
type DefaultErrorData = {
  code: TRPC_ERROR_CODE_KEY;
  httpStatus: number;
  /**
   * Path to the procedure that threw the error
   */
  path?: string;
  /**
   * Stack trace of the error (only in development)
   */
  stack?: string;
};

interface DefaultErrorShape {
  message: string;
  code: TRPC_ERROR_CODE_NUMBER;
  data: DefaultErrorData;
}
```
