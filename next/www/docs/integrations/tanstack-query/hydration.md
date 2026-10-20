---
title: Hydration and offline mutations
label: Hydration and offline
description: "`hydrationOptions()` sends the cache to the browser with the client's serializer, and persisted mutations resume with `setMutationDefaults`."
section: Integrations
parent: integrations/tanstack-query
order: 11
---

## Hydration

`hydrationOptions({ client })` returns `{ dehydrate, hydrate }` options that serialize data with the client's [serializer](../../server/serializers.md), so the types it keeps (with danSON: `Date`, `Map`, `Set`, `bigint`, custom types) survive the trip, and that dehydrate pending queries. Their data is serialized once it settles. Without `client` it uses plain JSON; `serializer` overrides both.

```ts twoslash
// ---cut-start---
import { QueryClient } from '@tanstack/react-query';
import { hydrationOptions } from '@trpc12/tanstack-query';
import { client } from './client.ts';
// ---cut-end---
new QueryClient({ defaultOptions: hydrationOptions({ client }) });
```

Use the same options for the server's `QueryClient` and the browser's. In React Server Components, `createTrpcRsc` dehydrates with them on the server, and the browser's `QueryClient` takes them as above ([React Server Components](../rsc.md)).

## Offline mutations

A paused mutation that was persisted (with `persistQueryClient`, say) can only resume if the restored client knows its `mutationFn`. `mutationOptions()` returns the key and the function, so register them as defaults:

```ts twoslash
// ---cut-start---
import type { QueryClient } from '@tanstack/react-query';
import { createTrpcQueryUtils } from '@trpc12/tanstack-query';
import { client } from './client.ts';
const trpc = createTrpcQueryUtils({ client });
declare const queryClient: QueryClient;
// ---cut-end---
const createPost = trpc.post.create.mutationOptions();
queryClient.setMutationDefaults(createPost.mutationKey, createPost);
// after restoring: await queryClient.resumePausedMutations();
```
