---
id: retryLink
title: Retry Link
sidebar_label: Retry Link
slug: /client/links/retryLink
---

`retryLink` is a link that allows you to retry failed operations in your tRPC client. It provides a customizable way to handle transient errors, such as network failures or server errors, by automatically retrying the failed requests based on specified conditions.

:::tip
If you use `@trpc/react-query` you will generally **not** need this link as it's built into the `useQuery()` and the `useMutation()` hooks from `@tanstack/react-query`.
:::

## Usage

You can import and add the `retryLink` to the `links` array when creating your tRPC client. This link can be placed before or after other links in your setup, depending on your requirements.

```ts
import { createTRPCClient, retryLink } from '@trpc/client';

const client = createTRPCClient<AppRouter>({
  links: [
    retryLink({
      retry(opts) {
        if (
          opts.error.data &&
          opts.error.data.code !== 'INTERNAL_SERVER_ERROR'
        ) {
          // Don't retry on non-500s
          return false;
        }
        if (opts.op.type !== 'query') {
          // Only retry queries
          return false;
        }

        // Retry up to 3 times
        return opts.attempts <= 3;
      },
    }),
    httpBatchLink({
      url: 'http://localhost:3000',
    }),
  ],
});
```

In the example above, we add the `retryLink` before the `httpBatchLink`. By default, `retryLink` will:

- Retry the request if the error is a `TRPCClientError` with a status code of 500 or if we couldn't get a valid TRPC error.
- Retry the request up to 3 times.

You can customize the retry logic by providing a custom `retry` function.

## Options

```ts
interface RetryLinkOptions<TInferrable extends InferrableClientTypes> {
  /**
   * The retry function
   */
  retry: (opts: RetryFnOptions<TInferrable>) => boolean;
}

interface RetryFnOptions<TInferrable extends InferrableClientTypes> {
  /**
   * The operation that failed
   */
  op: Operation;
  /**
   * The error that occurred
   */
  error: TRPCClientError<TInferrable>;
  /**
   * The number of attempts that have been made (including the first call)
   */
  attempts: number;
}
```

## Handling tracked() events

When using `retryLink` with subscriptions that use [`tracked()`](../../server/subscriptions.md#tracked), the link will automatically include the last known event ID when retrying. This ensures that when a subscription reconnects, it can resume from where it left off without missing any events.

For example, if you're using Server-sent Events (SSE) with `httpSubscriptionLink`, the `retryLink` will automatically handle reconnecting with the last event ID when errors like `401 Unauthorized` occur.
