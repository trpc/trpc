---
id: api-handler
title: API Handler
sidebar_label: API Handler
slug: /server/api-handler
---

tRPC is not a backend of its own, but rather lives inside of other backends such as Next.js or Express. Despite that, most of tRPC's features and syntax are the same no matter which backend you are using. The API handler, also called [adapter](/docs/server/adapters), enables this by acting as the glue between HTTP requests to your backend and tRPC.

The API Handler sits on a route in your server (usually `/api/trpc`, but this is just a convention) and processes all requests to that route and its subroutes. It receives a request from the server, uses the `createContext` function to generate [context](./context.md), and then sends the request and context to a [procedure](./procedures.md) in the router.

It can also take some optional arguments such as `onError`, a callback function that runs whenever an error is thrown inside of a procedure.

Below is an example implementation in Next.js. The process is similar for [AWS Lambda](./adapters/aws-lambda.md#3-use-the-amazon-api-gateway-adapter), [Express](./adapters/express.md#3-use-the-express-adapter), [Fastify](./adapters/fastify.md#create-fastify-server), and the [Fetch API](./adapters/fetch.mdx).

## Next.js example

```ts title='pages/api/trpc/[trpc].ts'
import { createNextApiHandler } from '@trpc/server/adapters/next';
import { createContext } from '../../../server/trpc/context';
import { appRouter } from '../../../server/trpc/router/_app';

// export API handler
export default createNextApiHandler({
  router: appRouter, // your outermost router, see https://trpc.io/docs/procedures
  createContext, // your request context, see https://trpc.io/docs/context
});
```

## Advanced Usage

While you can usually just "set and forget" the API Handler as shown above, sometimes you might want to modify it further.

The API handler that is created by `createNextApiHandler` and equivalents in other frameworks is just a function that takes `req` and `res` objects. This means you can also modify those objects before passing them to the handler, for example to [enable CORS](/docs/client/cors).

```ts title='pages/api/trpc/[trpc].ts'
import { createNextApiHandler } from '@trpc/server/adapters/next';
import { createContext } from '../../../server/trpc/context';
import { appRouter } from '../../../server/trpc/router/_app';

// create the API handler, but don't return it yet
const nextApiHandler = createNextApiHandler({
  router: appRouter,
  createContext,
});

// @see https://nextjs.org/docs/api-routes/introduction
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Modify `req` and `res` objects here
  // In this case, we are enabling CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Request-Method', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', '*');

  // If you need to make authenticated CORS calls then
  // remove what is above and uncomment the below code

  // Allow-Origin has to be set to the requesting domain that you want to send the credentials back to
  // res.setHeader('Access-Control-Allow-Origin', 'http://example:6006');
  // res.setHeader('Access-Control-Request-Method', '*');
  // res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
  // res.setHeader('Access-Control-Allow-Headers', 'content-type');
  // res.setHeader('Referrer-Policy', 'no-referrer');
  // res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // pass the (modified) req/res to the handler
  return nextApiHandler(req, res);
}
```
