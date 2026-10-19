---
id: cors
title: Send cookies cross-origin
sidebar_label: CORS & Cookies
slug: /cors
---

If your API reside on a different origin than your front-end and wish to send cookies to it, you will need to enable [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) on your server and send cookies with your requests by providing the option `{credentials: "include"}` to fetch.

The arguments provided to the fetch function used by tRPC can be modified as follow.

```ts title='app.ts'
import { createTRPCClient } from '@trpc/client';

const client = createTRPCClient<AppRouter>({
  url: 'YOUR_SERVER_URL',
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: 'include',
    });
  },
});
```
