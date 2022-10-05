---
id: splitLink
title: Split Link
sidebar_label: Split Link
slug: /links/splitLink
---

`splitLink` is a link that allows you to branch your link chain's execution depending on a given condition.

## Usage Example

### Disable batching for certain requests

Let's say you're using `httpBatchLink` as the terminating link in your tRPC client config. This means request batching is enabled in every request. However, if you need to disable batching only for certain requests, you would need to change the terminating link in you tRPC client config dynamically between `httpLink` and `httpBatchLink`. This is a perfect opportunity for `splitLink` to be used:

#### 1. Configure client / `utils/trpc.ts`

```ts title="client/index.ts"
import {
  createTRPCProxyClient,
  httpBatchLink,
  httpLink,
  splitLink,
} from '@trpc/client';
import type { AppRouter } from '../server';

const url = `http://localhost:3000`;

const client = createTRPCProxyClient<AppRouter>({
  links: [
    splitLink({
      condition(op) {
        // check for context property `skipBatch`
        return op.context.skipBatch === true;
      },
      // when condition is true, use normal request
      true: httpLink({
        url,
      }),
      // when condition is false, use batching
      false: httpBatchLink({
        url,
      }),
    }),
  ],
});
```

#### 2. Perform request without batching

```ts title='client.ts'
const postResult = proxy.posts.query(null, {
  context: {
    skipBatch: true,
  },
});
```

or:

```tsx title='MyComponent.tsx'
export function MyComponent() {
  const postsQuery = proxy.posts.useQuery(undefined, {
    trpc: {
      context: {
        skipBatch: true,
      },
    }
  });
  return (
    <pre>{JSON.stringify(postsQuery.data ?? null, null, 4)}</pre>
  )
})
```

## `splitLink` Options

The `splitLink` function takes an options object that has three fields: `condition`, `true`, and `false`.

```ts
function splitLink<TRouter extends AnyRouter = AnyRouter>(opts: {
  condition: (op: Operation) => boolean;
  /**
   * The link to execute next if the test function returns `true`.
   */
  true: TRPCLink<TRouter> | TRPCLink<TRouter>[];
  /**
   * The link to execute next if the test function returns `false`.
   */
  false: TRPCLink<TRouter> | TRPCLink<TRouter>[];
}) => TRPCLink<TRouter>
```

## Reference

You can check out the source code for this link on [GitHub.](https://github.com/trpc/trpc/blob/next/packages/client/src/links/splitLink.ts)
