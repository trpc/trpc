<div align="center">
  <h1 align="center">ZodRPC</h1>
</div>

<!-- Place this tag where you want the button to render. -->

<!-- Created by [@vriad](https://twitter.com/vriad), maintained by  -->

<!-- ### Table of contents -->

# Motivation

ZodRPC is a toolkit for creating typesafe backends powered by [Zod](https://github.com/vriad/zod).

# Usage

## Define your types with Zod

```ts
import * as z from 'zod';

const User = z.object({
  id: z.string().uuid(),
  name: z.string(),
  points: z.number(),
});
```

## Define your endpoints

Method: `zrpc.endpoint()`
Returns: instance of `ZodRPCEndpoint`

Think of an endpoint as a function; it has some set of arguments and a return type. By default, endpoints accept zero arguments and return `void`. You can use the `.args()` and `.returns()` methods to change that:

```ts
const getUserById = zrpc.endpoint().args(z.string().uuid()).returns(z.promise(User));
```

This endpoint is now of type `(id:string)=>Promise<User>`. You can implement the endpoint logic with `.implement()`:

```ts
const getUserById = zrpc
  .endpoint()
  .args(z.string().uuid())
  .returns(z.promise(User))
  .implement(async (id) => {
    return await fetchUser(id);
  });
```

## Define your router(s)

You can compose endpoints into routers.

```ts
const userRouter = zrpc.router().endpoint('getById', getUserById);
```

And compose routers into hierarchies.

```ts
const rootRouter = zrpc.router().compose('user', userRouter);
```

## Define your API

Once you've fully implemented your root router, pass it into `zrpc.api()`:

```ts
const myApi = zrpc.api(rootRouter);
```

## Integrate into your server

Out of the box, ZodRPC APIs can act as an express middleware.

```ts
import express from 'express';

import bodyParser from 'body-parser';
export const app = express();

app.use(bodyParser.json());

app.post('/rpc', api.to.express());
```

Similar to GraphQL, your entire API is exposed over a single endpoint (in this case `/rpc`). To call an endpoint, POST to this endpoint with a payload of the following type:

```ts
type RequestBody = {
  endpoint: string[];
  args: any[]; // the arguments to your endpoint
};
```

### An example with fetch

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

`ZodRPCAPI.to.sdk`You can generate an SDK from your API instance using the `.to.sdk()` method. It accepts a single argument of type:

```ts
type ToSDKParams = {
  url: string;
  handler: (url: string, body: { endpoint: string[]; args: any[] }) => Promise<any>;
};
```

```ts
const mySDK = myApi.to.sdk({
  url: 'http:localhost:3000',
  handler: async (url, body: any) => {
    const result = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });
    return result.json();
  },
});
```

You can use Lerna or Yarn Workspaces to share this SDK instance with your client. The SDK does not contain or expose _any_ of your endpoint implementation code! You can use it like this:

```ts
export const myFunction = async () => {
  // autocomplete! type checking!
  const myUser = await mySDK.user.getById('82de972f-04f7-4b88-92ec-6d1f92bc7883');
  // => User
};
```
