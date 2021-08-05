---
id: error-handling
title: Error Handling
sidebar_label: Error Handling
slug: /error-handling
---

If a procedure fails we trigger a function with information about the procedure & ctx.

Internal server errors are logged to the console unless a custom `onError` handler is specified.

## Example with Next.js

```ts
export default trpcNext.createNextApiHandler({
  // [...]
  onError({ error }) {
    console.error('Error:', error);
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // send to bug reporting, overriding the original `console.log` behavior
    }
  },
});
```

## All properties sent to `onError()`

```ts
{
  error: TRPCError;
  type: 'query' | 'mutation' | 'subscription' | 'unknown';
  path: string | undefined; // path of the procedure that was triggered
  input: unknown;
  ctx: Context | undefined;
  req: BaseRequest; // request object
}
```

## Accessing original error

```ts
export default trpcNext.createNextApiHandler({
  // [...]
  onError({ error }) {
    console.error('Error:', error);
    console.log('Original error thrown', error.originalError);
  },
});
```

## Error helpers

```ts
import { TRPCError } from '@trpc/server';

throw new TRPCError({
  code: 'INTERNAL_SERVER_ERROR',
  message: 'Optional Message',
});

// Some available codes:
//
// "FORBIDDEN"
// "BAD_REQUEST"
// "INTERNAL_SERVER_ERROR"
// "PATH_NOT_FOUND"
// "TIMEOUT"
```
