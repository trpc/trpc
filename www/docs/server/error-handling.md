---
id: error-handling
title: Error Handling
sidebar_label: Error Handling
slug: /error-handling
---

If a procedure fails we trigger a function with information about the procedure & ctx.

## Example with Next.js

```ts
export default trpcNext.createNextApiHandler({
  // [...]
  onError({ error }) {
    console.error('Error:', error);
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      // send to bug reporting
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
    console.log('Original error thrown', error.cause);
  },
});
```


## Error helpers

```ts
import { TRPCError } from '@trpc/server';

throw new TRPCError({
  code: 'INTERNAL_SERVER_ERROR',
  message: 'Optional Message',
  // optional: pass your thrown error to TRPCError to retain stack trace
  cause: myError,
});


// Some available codes:
//
// "FORBIDDEN"
// "BAD_REQUEST"
// "INTERNAL_SERVER_ERROR"
// "NOT_FOUND"
// "TIMEOUT"
// "PRECONDITION_FAILED"
```
