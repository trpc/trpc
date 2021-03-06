---
id: data-transformers
title: Data Transformers
sidebar_label: Data Transformers
slug: /data-transformers
---

You are able to serialize the response data & input args (in order to be able to transparently use e.g. standard `Date`s). The transformers need to be added both to the server and the client.


## Using [superjson](https://github.com/blitz-js/superjson)


### Working Example

- `createNextApiHandler()` in [`./examples/next-ssg-chat/[trpc.ts]`](https://github.com/trpc/trpc/tree/main//examples/next-ssg-chat/pages/api/trpc/%5Btrpc%5D.ts), and
- `createTRPCClient` in [`./examples/next-ssg-chat/utils/trpc.ts`](https://github.com/trpc/trpc/tree/main//examples/next-ssg-chat/utils/trpc.ts)

### Adding it

```bash
yarn add superjson
```

#### Add to `createTRPCCLient()`


```ts
import superjson from 'superjson';

// [...]

// create helper methods for queries, mutations, and subscriptionos
export const client = createTRPCClient<AppRouter>({
  url: '/api/trpc',
  transformer: superjson,
});
```


#### Add to `createTRPCCLient()`


```ts
import superjson from 'superjson';

// [...]

export const client = createTRPCClient<AppRouter>({
  url: '/api/trpc',
  transformer: superjson,
});
```

### Add to API handler

```ts
import superjson from 'superjson';

// [...]

export default trpcNext.createNextApiHandler({
  router,
  createContext,
  teardown: () => prisma.$disconnect(),
  transformer: superjson,
});
```