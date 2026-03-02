---
id: headers
title: Custom header
sidebar_label: Create Custom Header
slug: /client/headers
---

The headers option can be customized in the config when using the [`httpBatchLink`](./links/httpBatchLink.md) or the [`httpLink`](./links/httpLink.md).

`headers` can be both an object or a function. If it's a function it will get called dynamically for every HTTP request.

```ts twoslash title='utils/trpc.ts'
// @filename: server.ts

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import type { AppRouter } from './server';

const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

let token: string;

export function setToken(newToken: string) {
  /**
   * You can also save the token to cookies, and initialize from
   * cookies above.
   */
  token = newToken;
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
      /**
       * Headers will be called on each request.
       */
      headers() {
        return {
          Authorization: token,
        };
      },
    }),
  ],
});
```

### Example with auth login

```ts twoslash title='auth.ts'
// @target: esnext
// @filename: server.ts

// @filename: auth.ts
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { AppRouter } from './server';
import { setToken } from './utils';

const t = initTRPC.create();
export const appRouter = t.router({
  auth: t.router({
    login: t.procedure
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(() => ({ accessToken: 'token' })),
  }),
});
export type AppRouter = typeof appRouter;

// @filename: utils.ts
export function setToken(token: string) {}

const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000' })],
});

// ---cut---
const result = await trpc.auth.login.mutate({
  username: 'user',
  password: 'pass',
});
setToken(result.accessToken);
```

The `token` can be whatever you want it to be. It's entirely up to you whether that's just a client-side
variable that you update the value of on success or whether you store the token and pull it from local storage.
