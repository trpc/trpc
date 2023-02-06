---
id: aborting-procedure-calls
title: Aborting Procedure Calls
sidebar_label: Aborting Procedure Calls
slug: /aborting-procedure-calls
---

## @trpc/react-query

By default, tRPC does not cancel requests on unmount. If you want to opt into this behavior, you can provide `abortOnUnmount` in your configuration.

```ts twoslash title="client.ts"
// @target: esnext
// ---cut---
// @filename: utils.ts
// @noErrors
import { createTRPCReact } from '@trpc/react-query';

export const trpc = createTRPCReact<AppRouter>();
trpc.createClient({
  // ...
  abortOnUnmount: true,
});
```

You may also override this behavior at the request level.

```ts twoslash title="client.ts"
// @target: esnext

// ---cut---
// @filename: pages/posts/[id].tsx
// @noErrors
import { trpc } from '~/utils/trpc';

const PostViewPage: NextPageWithLayout = () => {
  const id = useRouter().query.id as string;
  const postQuery = trpc.post.byId.useQuery({ id }, { trpc: { abortOnUnmount: true } });

  return (...)
}
```

> Note: @tanstack/react-query only allows aborting queries.

## @trpc/client

tRPC adheres to the industry standard when it comes to aborting procedures. All you have to do is pass an `AbortSignal` to the query-options and then call its parent `AbortController`'s `abort` method.

```ts twoslash title="utils.ts"
// @target: esnext
// ---cut---
// @filename: server.ts
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
// @noErrors
import type { AppRouter } from 'server.ts';

const proxy = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/trpc',
    }),
  ],
});

const ac = new AbortController();
const query = proxy.userById.query('id_bilbo', { signal: ac.signal });

// Cancelling
ac.abort();

console.log(query.status);
```

> Note: The vanilla tRPC client allows aborting both queries and mutations
