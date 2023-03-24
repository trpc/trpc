---
id: aborting-procedure-calls
title: Aborting Procedure Calls
sidebar_label: Aborting Procedure Calls
slug: /reactjs/aborting-procedure-calls
---

By default, tRPC does not cancel requests on unmount. If you want to opt into this behaviour, you can provide `abortOnUnmount` in your configuration.

```ts twoslash title="client.ts"
// @target: esnext
// ---cut---
// @filename: utils.ts
// @noErrors
import { createTRPCReact } from '@trpc/react-query';

export const trpc = createTRPCReact<AppRouter>({
  abortOnUnmount: true,
});
trpc.createClient({
  // ...
});
```

> Note: @tanstack/react-query only allows aborting queries.

You may also override this behaviour at the query level.

```tsx twoslash title="pages/post/[id].tsx"
// @filename: server/router.ts
// @include: router
// @filename: utils/trpc.ts
// ---cut---
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../server/router';
export const trpc = createTRPCReact<AppRouter>();

// @filename: pages/posts/[id].tsx
declare const useRouter: any;
// ---cut---
import { trpc } from '../../utils/trpc';

function PostViewPage() {
  const { query } = useRouter();
  const postQuery = trpc.post.byId.useQuery(
    { id: query.id },
    { trpc: { abortOnUnmount: true } }
  );

  // ...
}
```
