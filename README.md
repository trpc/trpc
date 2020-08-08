<div align="center">
  <h1 align="center">trpc</h1>
</div>

<!-- Place this tag where you want the button to render. -->

<!-- Created by [@vriad](https://twitter.com/vriad), maintained by  -->

<!-- ### Table of contents -->

# Motivation

trpc is a toolkit for creating typesafe backends. You can think of it as a way of building RPC APIs, or you can think of it as a way to avoid APIs.

# Usage

## Define your endpoints

`trpc.endpoint`: `<T>(func: Function)=>TRPCEndpoint`

An endpoint is just a function. Pass any function into `trpc.endpoint()` and `trpc` will automatically infer the input and output types.

```ts
const getUserById = trpc.endpoint((id: string) => {
  return await db.getUser({ id });
});
```

## Define your router(s)

`trpc.router()=>TRPCRouter`

Routers are collections of endpoints. You create on with `trpc.router()` (no arguments):

```ts
const userRouter = trpc.router();
```

Add endpoints to it like this:

```ts
userRouter.endpoint('getById', getUserById).endpoint('search', searchUsers);
```

Note that you _must_ chain together multiple calls to `.endpoint()`. If you're used to Express you may be tempted to try this:

```ts
// DONT DO THIS
const userRouter = trpc.router();

userRouter.endpoint('getById', getUserById);
userRouter.endpoint('search', searchUsers);
```

In `trpc` routers are _immutable_. The `.endpoint` function returns an entirely new router. It doesn't mutate `userRouter`.

You can also compose routers into hierarchies.

```ts
const rootRouter = trpc.router().compose('user', userRouter);
```

## Define your API

`trpc.router(root: TRPCRouter)=>TRPCApi`

Once you've fully implemented your root router, pass it into `trpc.api()`.

```ts
const myApi = trpc.api(rootRouter);
```

## Integrate into your server

Out of the box, trpc APIs can act as an Express middleware.

```ts
import express from 'express';
import bodyParser from 'body-parser';

export const app = express();
app.use(bodyParser.json());

// serve requests
app.post('/rpc', api.toExpress());
```

Similar to GraphQL, your entire API is exposed over a single endpoint (in this case `/rpc`). To call an endpoint, POST to this endpoint with a payload of the following type:

```ts
type RequestBody = {
  endpoint: string[];
  args: any[]; // the arguments to your endpoint
  context: any;
};
```

### A working example

```ts
// server
app.listen(3000); // listening on localhost:3000

// client
const response = await fetch(`http://localhost:3000`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: {
    endpoint: ['user', 'getById'],
    args: ['82de972f-04f7-4b88-92ec-6d1f92bc7883'],
  },
});

const result = await response.json();
// => { id: '82de972f-04f7-4b88-92ec-6d1f92bc7883', name: 'Ninja', points: 127 }
```

## Generating an SDK

`trpcAPI.makeSDK`

You can generate an SDK from your API instance using the `.makeSDK()` method. It accepts a single argument of type:

```ts
type ToSDKParams = {
  url: string;
  handler: (url: string, body: { endpoint: string[]; args: any[] }) => Promise<any>;
};
```

```ts
const mySDK = myApi.makeSDK({
  url: 'http:localhost:3000',
  handler: async (url, payload) => {
    const context = 'whatever';
    const result = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { ...payload, context },
    });

    return result.json();
  },
});
```

You can use Lerna or Yarn Workspaces to share this SDK instance with your client. The SDK does not contain or expose _any_ of your endpoint implementation code! So you can share it directly with the client without worrying about exposing your server code. You can use it like this:

```ts
export const myFunction = async () => {
  // autocomplete! type checking!
  const myUser = await mySDK.user.getById('82de972f-04f7-4b88-92ec-6d1f92bc7883');
  // => User
};
```
