---
id: data-transformers
title: Data Transformers
sidebar_label: Data Transformers
slug: /data-transformers
---

You are able to serialize the response data & input args. The transformers need to be added both to the server and the client.

## Using [superjson](https://github.com/blitz-js/superjson)

SuperJSON allows us to able to transparently use e.g. standard `Date`/`Map`/`Set`s over the wire between the server and client. That means you can return any of these types in your API-resolver and use them in the client without recreating the objects from JSON.

### Working Example

- `createNextApiHandler()` in [`./examples/next-prisma-todomvc/[trpc.ts]`](https://github.com/trpc/trpc/tree/main/examples/next-prisma-todomvc/pages/api/trpc/%5Btrpc%5D.ts), and
- `createTRPCClient` in [`./examples/next-prisma-todomvc/utils/trpc.ts`](https://github.com/trpc/trpc/tree/main/examples/next-prisma-todomvc/utils/trpc.ts)

### How to


#### 0. Install

```bash
yarn add superjson
```

#### 1. Add to `createTRPCCLient()`

```ts
import superjson from 'superjson';

// [...]

export const client = createTRPCClient<AppRouter>({
  // [...]
  transformer: superjson,
});
```

#### 2. Add to API handler

```ts
import superjson from 'superjson';

// [...]

export default trpcNext.createNextApiHandler({
  // [...]
  transformer: superjson,
});
```

## `DataTransformer` interface

```ts
type DataTransformer = {
  serialize(object: any): any;
  deserialize(object: any): any;
};
```