---
id: headers
title: Custom header
sidebar_label: Create Custom Header
slug: /client/headers
---

The headers option can be customized in the config when using the [`httpBatchLink`](./links/httpBatchLink.md) or the [`httpLink`](./links/httpLink.md).

`headers` can be both an object or a function. If it's a function it will get called dynamically for every HTTP request.

```ts title='utils/trpc.ts'
// Import the router type from your server file
import type { AppRouter } from '@/server/routers/app';
import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';

let token: string;

export function setToken(newToken: string) {
  /**
   * You can also save the token to cookies, and initialize from
   * cookies above.
   */
  token = newToken;
}

export const trpc = createTRPCNext<AppRouter>({
  config(opts) {
    return {
      links: [
        httpBatchLink({
          url: 'http://localhost:3000/api/trpc',
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
    };
  },
});
```

### Example with auth login

```ts title='pages/auth.tsx'
const loginMut = trpc.auth.login.useMutation({
  onSuccess(opts) {
    token = opts.accessToken;
  },
});
```

The `token` can be whatever you want it to be. It's entirely up to you whether that's just a client-side
variable that you update the value of on success or whether you store the token and pull it from local storage.
