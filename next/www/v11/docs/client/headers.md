---
title: "Headers"
description: ""
section: "Links"
order: 41
---

The headers option may be used with any of our HTTP links: [`httpBatchLink`](./links/httpBatchLink.md), [`httpBatchStreamLink`](./links/httpBatchStreamLink.md), [`httpLink`](./links/httpLink.md), or [`httpSubscriptionLink`](./links/httpSubscriptionLink.md).

`headers` can be both an object or a function. If it's a function it will get called dynamically for every HTTP request.

```ts title="utils/trpc.ts"
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from './server';

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

```ts title="auth.ts"
const result = await trpc.auth.login.mutate({ username: 'user', password: 'pass' });
setToken(result.accessToken);
```

The `token` can be whatever you want it to be. It's entirely up to you whether that's just a client-side
variable that you update the value of on success or whether you store the token and pull it from local storage.
