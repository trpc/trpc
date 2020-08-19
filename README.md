<div align="center">
  <h1 align="center">tRPC</h1>
  <p>a toolkit for building a typesafe data layer</p>
</div>

# Motivation

⚠️ This library is undergoing rapid development and should be considered experimental. Not recommended for use in production. 🤙

tRPC is a framework for building strongly typed RPC APIs with TypeScript. Alternatively, you can think of it as a way to avoid APIs altogether.

# Usage

## Installation

`npm install --save trpc`;

`yarn add trpc`;

## Importing

```ts
import { trpc } from 'trpc';
```

## Define your endpoints

`trpc.endpoint(func: Function)=>TRPCEndpoint`

Instantiate an endpoint by passing any function into `trpc.endpoint()`. tRPC will detect the input and output types. It can be async.

By convention the first argument should be `ctx`. Even if you don't use it, you should include it. You'll see why later. Naming the variable `_ctx` will prevent TypeScript from complaining about unused variables.

```ts
const computeLength = trpc.endpoint((_ctx, data: string) => {
  return data.length;
});

const toLowerCase = trpc.endpoint(async (_ctx, data: string) => {
  return data.toLowerCase();
});
```

## Implement authorization

Every endpoint has an `.authorize` method where you decide whether to allow or disallow an incoming request. It can be async.

```ts
const computeLength = trpc
  .endpoint((ctx: {}, data: string) => {
    return data.length;
  })
  .authorize(async (ctx, data) => {
    if (!ctx.token) return false;
    if (data.length > 1000) return false;
    return true;
  });
```

## Define your router(s)

`trpc.router()=>TRPCRouter`

Routers are collections of endpoints. Here's how to create one and add the `getUserById` endpoint we created above.

```ts
const stringRouter = trpc.router().endpoint('computeLength', computeLength).endpoint('toLowerCase', toLowerCase);
```

You _must_ fluently chain multiple calls to `.endpoint()`. If you're familiar with Express you may be tempted to try this:

```ts
// DONT DO THIS
const stringRouter = trpc.router();

stringRouter.endpoint('getById', getUserById);
stringRouter.endpoint('otherEndpoint', otherEndpoint);
```

This won't work. In `trpc` routers are _immutable_. The `.endpoint()` method returns an entirely new router, so you must chain the calls.

## Compose multiple routers

You can compose routers into hierarchies.

```ts
const rootRouter = trpc.router().compose('stringRouter', stringRouter);
```

## Handle requests

`router.handle(payload: { path: string[], args: any[] })=>any`

Routers can handle "requests" using the `.handle` method.

```ts
rootRouter.handle({
  endpoint: ['stringRouter', 'computeLength'],
  args: [{}, '12characters'], // first arg is context
}); // => 12
```

This method accepts an input of type:

```ts
{
  endpoint: string[]; // the path to the appropriate endpoint
  args: any[]; // the arguments to the endpoint function
};
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

Similar to GraphQL, your entire API is exposed over a single endpoint (in this case `/rpc`). All incoming requests should POST to this endpoint with a payload of the following type:

```ts
{
  path: string[];
  args: unknown[];
}
```

## Generating SDKs

tRPC automatically keeps track of the structure of your router hierarchy and the input/output types of your endpoint. This means we can do some extremely exciting things.

### On the server

tRPC can autogenerate an "server SDK" from any router like so:

```ts
const serverSDK = rootRouter.toServerSDK();

serverSDK.stringRouter.computeLength({}, 'asdf'); // 4
serverSDK.stringRouter.toLowerCase({}, 'Hi Mom!'); // Promise<"hi mom!">
```

The first argument is the context. Just pass an empty object if it isn't used by your endpoint.

This is useful for server environments. It provides a standard way to "call your own APIs" without any code duplication. Plus it automatically bypasses all endpoint authorizations. Do not accidentally make this available to any client side code!

### On the client

You can also generate a client SDK that you can safely pass to your client-side code. You're able to provide entirely custom HTTP logic; tRPC is strictly BYOL: bring-your-own-library.

> It's easier than ever to share code using tools like [Yarn Workspaces](https://classic.yarnpkg.com/en/docs/workspaces/) or [Lerna](https://github.com/lerna/lerna), or you can use an integrated framework like [Next.js](https://nextjs.org/). The days of auto-generating an SDK from OpenAPI specifications — and GraphQL definition files 🙄 — is over.

```ts
// server.ts
const rootRouter = /* define router here */;
export const makeClientSDK = rootRouter.toClientSDK;

// client.tsx
import { makeClientSDK } from "./server";

const clientSDK = makeClientSDK({
  url: 'http:localhost:3000',
  getContext: async ()=>{
    const token = await getTokenFromCookies();
    return { token };
  },
  handler: async (url, payload) => {
    const context = /* get context */;
    const result = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });f
    return result.json();
  },
})
```

As you can see, `.toClientSDK` accepts a configuration object with the following keys:

- `url`: the URL of your tRPC endpoint, e.g. `http://localhost:3000/rpc`
- `getContext`: a (potentially async) function for gathering/computing/fetching the `context` of the request. This is where you will get and cookies/tokens you'd like to pass with the request. The value returned by this function will be passed as the _first input_ to your endpoint functions.
- `handler`: the function that handles all HTTP requests. You can use any HTTP library you like (fetch, axios, etc.) and implement custom error handling logic. This function accepts two inputs: `url` and `payload`. _You should never modify `payload`!_

Now that you've configured your client SDK you can use it like so:

```ts
clientSDK.stringRouter.computeLength('asdf'); // => Promise<4>
clientSDK.stringRouter.toLowerCase('Hi Mom!'); // => Promise<"hi mom!">
```

A few things to notice:

- The `.toClientSDK` method strips off the first (context) input from each of your endpoints. This lets tRPC provide a cleaner version of the SDK: `computeLength('asdf')` instead of `computeLength(getContext(), 'asdf')`. It makes it easy to separately provide the context and the "real inputs".
- The client SDK always returns a Promise, even if the server-side logic in synchronous. This is because the request still makes a round-trip between your client and your server.

## Usage with React

- TODO: React Hook
- TODO: Next.js/SWR
