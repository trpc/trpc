---
id: cors
title: Send cookies cross-origin
sidebar_label: CORS & Cookies
slug: /client/cors
---

If your API resides on a different origin than your front-end and you wish to send cookies to it, you will need to enable [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) on your server and send cookies with your requests by providing the option `{credentials: "include"}` to fetch.

The arguments provided to the fetch function used by tRPC can be modified as follow.

```ts title='app.ts'
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'YOUR_SERVER_URL',
      fetch(url, options) {
        return fetch(url, {
          ...options,
          credentials: 'include',
        });
      },
    }),
  ],
});
```

:::info
You also need to enable CORS on your server by modifying your [adapter](/docs/server/adapters), or the HTTP server which fronts your API. The best way to do this varies adapter-by-adapter and based on your hosting infrastructure, and individual adapters generally document this process where applicable.
:::
