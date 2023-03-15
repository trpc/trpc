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

export const trpc = createTRPCReact<AppRouter>();
trpc.createClient({
  // ...
  abortOnUnmount: true,
});
```

You may also override this behaviour at the request level.

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
