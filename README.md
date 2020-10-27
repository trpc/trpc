<div align="center">
  <h1 align="center">tRPC</h1>
  <p>a toolkit for building end-to-end TypeScript data layers</p>
</div>

<br/>
<br/>

# Motivation

> This library is undergoing rapid development and should be considered experimental. 🤙

tRPC is a framework for building strongly typed RPC APIs with TypeScript. Alternatively, you can think of it as a way to avoid APIs altogether.

# Usage

### Installation

`npm install trpc`

`yarn add trpc`

### Importing

```ts
import { trpc } from 'trpc';
```

### Compatibility

tRPC depends on the Proxy API and dynamic imports, both of which are [not supported in IE11 and earlier](https://caniuse.com/#feat=proxy).

Compatible with TypeScript 3.2+.

## Define your endpoints

`trpc.endpoint(func: (ctx: any) => (...args: any[]) => any)=>TRPCEndpoint`

Instantiate an endpoint with `trpc.endpoint()`. This function takes a _function that returns a function_.

```ts
const computeLength = trpc.endpoint(() => (data: string) => {
  return data.length;
});
```

The outer function can (optionally) accept a single `ctx` argument. This is how tRPC makes the `ctx` of your RPC calls avaiable to your endpoint logic.

<!-- If you don't need context, you should include it. You'll see why later. Naming the variable `_ctx` will prevent TypeScript from complaining about unused variables. -->

```ts
type Ctx = { token: string };

const getUsername = trpc.endpoint((ctx: Ctx) => () => {
  const user = await getUserFromToken(ctx.token);
  return user.username;
});
```

That is a simple endpoint that doesn't actually accept any inputs. Here's a more complex example that posts new "tweets" to the user's account.

```ts
type Ctx = { token: string };

const postTweet = trpc.endpoint((ctx: Ctx) => (data: { content: string }) => {
  const user = await getUserFromToken(ctx.token);
  const newTweet = await createTweet({
    content: data.content,
    userId: user.id,
  });
  return newTweet;
});
```

## Implement authorization

tRPC provides a built-in way to add authorization logic to your endpoints using the `.authorize` method. **By default all incoming requests are rejected!**

`.authorize` accepts a _function that returns a function_, just like `trpc.endpoint`. It must return a boolean. You can use `ctx` or the endpoint's arguments to determine whether to allow the request.

```ts
const getUsername = trpc
  .endpoint((ctx: Ctx) => async () => {
    const user = await getUserFromToken(ctx.token);
    return user.username;
  })
  .authorize((ctx) => async (data) => {
    if (!ctx.token) return false;
    return true;
  });
```

## Define your router(s)

`trpc.router()=>TRPCRouter`

Routers are collections of endpoints. Here's how to create a router and add the `getUsername` endpoint we created above.

```ts
const userRouter = trpc.router().endpoint('getUsername', getUsername);
```

To add multiple endpoints, you _must chain_ the calls to `.endpoint()`.

```ts
const userRouter = trpc
  .router()
  .endpoint('getUsername', getUsername)
  .endpoint('postTweet', postTweet);
```

If you're used to Express you may be tempted to try this:

```ts
// DONT DO THIS
const stringRouter = trpc.router();

stringRouter.endpoint('getById', getUserById);
stringRouter.endpoint('otherEndpoint', otherEndpoint);
```

This won't work. In `trpc` routers are _immutable_. The `.endpoint()` method returns an entirely new router, so you must chain the calls.

## Compose multiple routers

You can compose routers into hierarchies. Below we create a `rootRouter` with one endpoint (`computeLength`, defined above) and one child router (`userRouter`, defined above, aliased to `user`). This will be important later.

```ts
const rootRouter = trpc
  .router()
  .endpoint('computeLength', computeLength)
  .compose('user', userRouter);
```

## Handle requests

`router.handle(payload: Payload)=>any`

The `Payload` type is:

```ts
type Payload = {
  path: string[];
  context: any;
  args: any[];
};
```

Routers can handle "requests" using the `.handle` method.

```ts
rootRouter.handle({
  endpoint: ['computeLength'],
  context: {},
  args: ['this is a sample string'],
}); // => Promise<23>

rootRouter.handle({
  endpoint: ['user', 'postTweet'],
  context: { token: `SAMPLE_TOKEN` },
  args: [{ content: 'just setting up my twttr' }],
}); // => Promise<{ /* new Tweet object */ }>
```

### Express

There is a convenience function for generating an Express middleware from your router.

```ts
import express from 'express';
import bodyParser from 'body-parser';

export const app = express();
app.use(bodyParser.json());

// serve requests
app.post('/rpc', rootRouter.toExpress());
```

Similar to GraphQL, your entire API is exposed over a single endpoint (in this case `/rpc`). All incoming requests should POST to this endpoint with a body of type `Payload` (defined above).

## Creating a server SDK

tRPC automatically tracks the structure of your router hierarchy and the input/output types of your endpoint. This means we can do some exciting things.

tRPC can autogenerate an "server SDK" from any router like so:

```ts
const serverSDK = rootRouter.toServerSDK();

// synchronous
// first argument is context
const asdfLength = serverSDK.computeLength({}, 'asdf'); // => 4

const username = await serverSDK.user.getUsername({ token: 'SAMPLE_TOKEN' });
// Promise<"username">

const newTweet = await serverSDK.user.postTweet(
  { token: 'SAMPLE_TOKEN' },
  {
    content: 'just setting up my twttr',
  },
);
// Promise<"username">
```

The first argument to _all_ server SDK calls is the context. Just pass an empty object if your endpoint doesn't use context.

This is useful for server environments. It provides a standard way to call your own APIs without any code duplication. Plus it **automatically bypasses all authorization checks**. Do not accidentally make this available to any client side code!

## Creating a client SDK

⚠️ Follow the instructions below very carefully! Otherwise you may accidentally expose your server code to the client.

It's easier than ever to share code between your client and server. The example code below assumes you have a way to do this, either using a tool like [Yarn Workspaces](https://classic.yarnpkg.com/en/docs/workspaces/)/[Lerna](https://github.com/lerna/lerna) or a framework like [Next.js](https://nextjs.org/).

<!-- The days of auto-generating an SDK from OpenAPI specifications — and GraphQL definition files 🙄 — is over. -->

```ts
// server.ts

export const rootRouter = /* define router here */;
```

```ts
// client.tsx

import { trpc } from 'trpc';

// only import the TypeScript type of your router!
// this uses dynamic imports
type RootRouter = typeof import('../path/to/server.ts').rootRouter;

// pass in your router type
// as a generic parameter to trpc.sdk
const clientSDK = trpc.sdk<RootRouter>({
  url: 'http:localhost:3000',
  getContext: () => {
    const token = getTokenFromCookies();
    return { token };
  },
});
```

As you can see, `trpc.sdk()` accepts a params object with the following keys:

- `url: string` — the URL of your tRPC endpoint, e.g. `http://localhost:3000/rpc`
- `getContext: ()=>any` — a _synchronous_ function for gathering/computing/fetching any `context` data for the request. This is where you should return the cookies/tokens you'd like to pass with the request. The returned value will be provided to your endpoints in the `ctx` argument.

### Using the SDK

```ts
const trySDK = async () => {
  const query = clientSDK.computeLength('asdf');
};
```

The above SDK call _synchronously_ returns a result of type `TRPCResult<number>`. `TRPCResult<T>` is defined here:

```ts
type TRPCResult<T> = {
  run: () => Promise<T>;
  payload: {
    path: string[];
    args: unknown[];
    context: unknown;
  };
};
```

Here is how to retreive data from the server:

```ts
const trySDK = async () => {
  const query = clientSDK.computeLength('asdf');
  const result = await query.run();
};
```

This may seem redundant; why bother including the extra step of calling `.run()`?

Answer: to make it easier to implement a caching layer on top of TRPC. When you create a new "query" (e.g. `const query = clientSDK.computeLength('asdf');`) you immediately have access to a _serializable_ representation of that query in the `payload` parameter. This object _uniquely identifies_ the query you are making! So you can take `query.payload`, serialize it however you like (`JSON.stringify` would work fine), and use it to cache the request!

This also makes it much easier to integrate with tools like [SWR](https://swr.vercel.app/) which require a unique "key" for each request.

```ts
await clientSDK.computeLength('asdf'); // => Promise<4>
await clientSDK.user.getUsername(); // => Promise<"username">
await clientSDK.user.postTweet({ content: 'hello world' });
```

The client SDK always returns a Promise, even if the server-side logic in synchronous, since the SDK is making a round-trip HTTP request under the hood.

There's no need to pass a context object as the first input (as with the server SDK) because the context object is produced by the `getContext` function you passed into `trpc.sdk`.

### Custom request handler

By default tRPC uses Axios to send requests to the `url` you specify in the SDK params. Optionally you can provide an entirely custom HTTP request handler using with `handler`:

```ts
const clientSDK = trpc.sdk<RootRouter>({
  url: 'http:localhost:3000',
  getContext: () => {
    const token = getTokenFromCookies();
    return { token };
  },
  handler: async (url, payload) => {
    const result = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload,
    });
    return result.json();
  },
});
```

## Recipes

### Usage with Hooks

`tRPC` is designed to be as minimal as possible, so it doesn't ship with any React hooks out of the box. Instead you are encouraged to build your own, using tRPC as a building block, or use a hook built by the community. As a starting point, here is a fully functional example of a `useSDK` hook built with tRPC:

```ts
import { useState, useEffect } from 'react';
import { trpc, TRPCRequest } from 'trpc';

type RootRouter = typeof import('../api/api').rootRouter;

const SDK = trpc.sdk<RootRouter>({
  url: 'http://localhost:3000/api/rpc',
  getContext: () => {
    const token = getTokenFromCookies();
    if (!token) return null;
    return { token };
  },
});

export type SDK = typeof SDK;

export type UseSDKResult<T> = {
  loading: boolean;
  error: string | null;
  data: T | null;
};

export const useSDK = <T>(
  fetcher: (sdk: SDK) => TRPCRequest<T>,
): UseSDKResult<T> => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await fetcher(SDK).run();
        setData(data);
      } catch (err) {
        console.log(err);
        setError(err.message);
      }
      setLoading(false);
      return;
    };
    setLoading(true);
    fetchData();
  }, []);

  return { data, loading, error };
};
```

It is possible to build other hooks that integrate with popular data fetching libraries like [`react-query`](https://github.com/tannerlinsley/react-query) or [`swr`](https://swr.vercel.app/). If you do so, submit a PR and we'll include that code in the README!

©2020 Colin McDonnell [@vriad](https://twitter.com/vriad)
