---
id: aborting-procedure-calls
title: Aborting Procedure Calls
sidebar_label: Aborting Procedure Calls
slug: /nextjs/aborting-procedure-calls
---

By default, tRPC does not cancel requests on unmount. If you want to opt into this behavior, you can provide `abortOnUnmount` in your configuration callback.

### Globally

```ts twoslash title="client.ts"
// @target: esnext
// ---cut---
// @filename: utils.ts
// @noErrors
import { createTRPCNext } from '@trpc/next';

export const trpc = createTRPCNext<AppRouter>({
  config() {
    return {
      // ...
      abortOnUnmount: true,
    };
  },
});
```

### Per-request

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
