---
title: The Effect client
description: createEffectClient returns an Effect per call and a Stream per subscription, with typed errors in the error channel.
section: Client
order: 6
---

`createEffectClient` from `@trpc12/trpc/effect` returns an `Effect` per call and a `Stream` per subscription. Typed errors are in the error channel, and interrupting the fiber aborts the request.

```ts twoslash
// ---cut-start---
import type { AppRouter } from './server.ts';
// ---cut-end---
import { httpLink, routerType } from '@trpc12/trpc/client';
import { createEffectClient } from '@trpc12/trpc/effect';
import { Effect } from 'effect';

const client = createEffectClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: 'http://localhost:3000/trpc' })],
});

const program = Effect.gen(function* () {
  const post = yield* client.post.byId.query({ id: '1' });
  return post.title;
});
```

The links are the same as the Promise client's ([Links](./links.md)). For spans around calls, see [Tracing](./tracing.md).
