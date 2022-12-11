---
id: api-handler
title: API Handler
sidebar_label: API Handler
slug: /api-handler
---
tRPC is not a backend of its own, but rather lives inside of other backends such as Next.js or Express. Despite that, most of tRPC's features and syntax are the same no matter which backend you are using. The API handler, also called [adapter](https://trpc.io/docs/adapters), enables this by acting as the glue between HTTP requests to your backend and tRPC.

The API Handler receives a request from the server, uses the `createContext` function to generate [context](./context), and then sends the request and context to a [procedure](./procedure) in the router. 

It can also take some optional arguments such as `onError`, a callback function that runs whenever an error is thrown inside of a procedure.

Below is an example implementation in Next.js. The process is similar for [AWS Lambda](./adapter/aws-lambda.md#3-use-the-amazon-api-gateway-adapter), [Express](./adapter/express.md#3-use-the-express-adapter), [Fastify](./adapter/fastify.md#create-fastify-server), and the [Fetch API](./adapter/fetch.mdx).

## Next.js example

```ts title='pages/api/trpc/[trpc].ts'
import { createNextApiHandler } from "@trpc/server/adapters/next";
import { createContext } from "../../../server/trpc/context";
import { appRouter } from "../../../server/trpc/router/_app";

// export API handler
export default createNextApiHandler({
  router: appRouter, // your outermost router, see https://trpc.io/docs/procedures
  createContext, // your request context, see https://trpc.io/docs/context
});
```
