---
id: overview
title: Links Overview
sidebar_label: Overview
slug: /client/links
---

Links enable you to customize the flow of data between the tRPC Client and Server. A link should do only one thing, which can be either a self-contained modification to a tRPC operation (query, mutation, or subscription) or a side-effect based on the operation (such as logging).

You can compose links together into an array that you can provide to the tRPC client configuration via the `links` property, which represents a link chain. This means that the tRPC client will execute the links in the order they are added to the `links` array when doing a request and will execute them again in reverse when it's handling a response. Here's a visual representation of the link chain:

<div align="center" style={{marginBottom: '12px'}}>
  <img src="/img/links-diagram.svg" style={{background: 'white'}} alt="tRPC Link Diagram"/>
  <small>tRPC Link Diagram. Based on <a href="https://www.apollographql.com/docs/react/api/link/introduction/" target="_blank">Apollo's</a>.</small>
</div>

:::note
The below examples are assuming you use Next.js, but the same as below can be added if you use the vanilla tRPC client
:::

```tsx title='utils/trpc.ts'
import { httpBatchLink, loggerLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';

export default createTRPCNext<AppRouter>({
  config() {
    const url = `http://localhost:3000`;

    return {
      links: [
        loggerLink(),
        httpBatchLink({
          url,
        }),
      ],
    };
  },
});
```

## Creating a custom link

A link is a function that follows the `TRPCLink` type. Each link is composed of three parts:

1. The link returns a function that has a parameter with the `TRPCClientRuntime` type. This argument is passed by tRPC and it is used when creating a [**terminating link**](#the-terminating-link). If you're not creating a terminating link, you can just create a function that has no parameters. In such case, the link should be added to the `links` array without invoking (`links: [..., myLink, httpBatchLink(...)]`).
2. The function in step 1 returns another function that receives an object with two properties: `op` which is the `Operation` that is being executed by the client, and `next` which is the function we use to call the next link down the chain.
3. The function in step 2 returns a final function that returns the `observable` function provided by `@trpc/server`. The `observable` accepts a function that receives an `observer` which helps our link notify the next link up the chain how they should handle the operation result. In this function, we can just return `next(op)` and leave it as is, or we can subscribe to `next`, which enables our link to handle the operation result.

### Example

```tsx title='utils/customLink.ts'
import { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from 'server/routers/_app';

export const customLink: TRPCLink<AppRouter> = () => {
  // here we just got initialized in the app - this happens once per app
  // useful for storing cache for instance
  return ({ next, op }) => {
    // this is when passing the result to the next link

    // each link needs to return an observable which propagates results
    return observable((observer) => {
      console.log('performing operation:', op);
      const unsubscribe = next(op).subscribe({
        next(value) {
          console.log('we received value', value);
          observer.next(value);
        },
        error(err) {
          console.log('we received error', err);
          observer.error(err);
        },
        complete() {
          observer.complete();
        },
      });

      return unsubscribe;
    });
  };
};
```

### References

If you need a more real reference for creating your custom link, you can check out some of the built-in links tRPC provides on [GitHub](https://github.com/trpc/trpc/tree/main/packages/client/src/links).

## The terminating link

The **terminating link** is the last link in a link chain. Instead of calling the `next` function, the terminating link is responsible for sending your composed tRPC operation to the tRPC server and returning an `OperationResultEnvelope`.

The `links` array that you add to the tRPC client config should have at least one link, and that link should be a terminating link. If `links` don't have a terminating link at the end of them, the tRPC operation will not be sent to the tRPC server.

[`httpBatchLink`](./httpBatchLink.md) is the recommended terminating link by tRPC.

[`httpLink`](./httpLink.md) and [`wsLink`](./wsLink.md) are other examples of terminating links.

## Managing context

As an operation moves along your link chain, it maintains a context that each link can read and modify. This allows links to pass metadata along the chain that other links use in their execution logic.

Obtain the current context object and modify it by accessing `op.context`.

You can set the context object's initial value for a particular operation by providing the context parameter to the `query` or `useQuery` hook (or `mutation`, `subscription`, etc.).

For an example use case, see [Disable batching for certain requests](/docs/client/links/splitLink#disable-batching-for-certain-requests).
