---
id: cors
title: Send cookies cross-origin
sidebar_label: CORS & Cookies
slug: /cors
---

If your API reside on a different origin than your front-end and wish to send cookies to it, you will need to enable [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) on your server and send cookies with your requests by providing the option `{credentials: "include"}` to fetch.

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

## Enabling on the server

The tRPC handler is essentially just a function that takes a [request](https://developer.mozilla.org/en-US/docs/Web/API/Request) and [response](https://developer.mozilla.org/en-US/docs/Web/API/Response) objects, you can wrap the handler in another handler that modifies the response object to enable CORS, before passing it to the tRPC handler.

```ts twoslash title='server.ts'
//@filename router.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({
  foo: t.procedure.query(() => 'bar')
});
// @noErrors
// ---cut---
import http from 'http';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import { appRouter } from "./router";

// Create the tRPC handler
const trpcHandler = createHTTPHandler({
  router: appRouter,
  createContext: () => ({}),
});

// create and listen to the server handler
http.createServer((req, res) => {
  // act on the req/res objects

  // enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Request-Method', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', '*');

  // accepts OPTIONS
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // then we can pass the req/res to the tRPC handler
  trpcHandler(req, res);
}).listen(8080);
```

:::note
You can do the same thing when using Next.js, Express or any other framework.
:::