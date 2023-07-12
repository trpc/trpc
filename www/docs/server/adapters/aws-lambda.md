---
id: aws-lambda
title: AWS Lambda + API Gateway Adapter
sidebar_label: AWS Lambda + API Gateway
slug: /server/adapters/aws-lambda
---

## AWS Lambda adapter

The AWS Lambda adapter is supported for API Gateway Rest API(v1) and HTTP API(v2) use cases.

## Example app

<table>
  <thead>
    <tr>
      <th>Description</th>
      <th>Links</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>API Gateway with NodeJS client.</td>
      <td>
        <ul>
          <li><a href="https://github.com/trpc/trpc/tree/main/examples/lambda-api-gateway">Source</a></li>
        </ul>
      </td>
    </tr>
  </tbody>
</table>

## How to add tRPC

### 1. Install deps

```bash
yarn add @trpc/server
```

### 2. Create a tRPC router

Implement your tRPC router. A sample router is given below:

```ts title='server.ts'
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();

const appRouter = t.router({
  getUser: t.procedure.input(z.string()).query((opts) => {
    opts.input; // string
    return { id: opts.input, name: 'Bilbo' };
  }),
});

// export type definition of API
export type AppRouter = typeof appRouter;
```

### 3. Use the Amazon API Gateway adapter

tRPC includes an adapter for API Gateway out of the box. This adapter lets you run your routes through the API Gateway handler.

```ts title='server.ts'
import { CreateAWSLambdaContextOptions, awsLambdaRequestHandler } from '@trpc/server/adapters/aws-lambda';

const appRouter = /* ... */;

// created for each request
const createContext = ({
  event,
  context,
}: CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>) => ({}) // no context
type Context = trpc.inferAsyncReturnType<typeof createContext>;

export const handler = awsLambdaRequestHandler({
  router: appRouter,
  createContext,
})
```

Build & deploy your code, now use your API Gateway URL to call your function.

| Endpoint  | HTTP URI                                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| `getUser` | `GET https://<execution-api-link>/getUser?input=INPUT` <br/><br/>where `INPUT` is a URI-encoded JSON string. |

## Notes

### 1. A word about payload format version

API Gateway has two different event data formats when it invokes a Lambda. For REST APIs they should be version "1.0"(`APIGatewayProxyEvent`), but you can choose which for HTTP APIs by stating either version "1.0" or "2.0".

- Version 1.0: `APIGatewayProxyEvent`
- Version 2.0: `APIGatewayProxyEventV2`

To infer what version you might have, supply the context as following:

```ts
function createContext({
  event,
  context,
}: CreateAWSLambdaContextOptions<APIGatewayProxyEvent>) {
  ...
}

// CreateAWSLambdaContextOptions<APIGatewayProxyEvent> or CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>
```

[Read more here about payload format version](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html)

### 2. Setting MultiValueHeaders / cookies

Version specific outputs, such as `multiValueHeaders` for `APIGatewayProxyEvent` and `cookies` for `APIGatewayProxyEventV2` can be returned with the following setup:

##### 1. Set the cookies/headers in your routes

Use the context available in each route to set the values of the cookies/headers you want to return.

```ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

export const t = initTRPC.create();

const appRouter = t.router({
  login: t.procedure.input({ username: z.string(), password: z.string() }).query(({ input, ctx }) => {

    // If using the v1 response format
    ctx.multiValueHeaders = {
      'Set-Cookie': ['cookie-1', 'cookie-2'],
    };

    // If using the v2 response format
    ctx.cookies = ['cookie-1', 'cookie-2'];

    return { id: opts.input, name: "🍪-monster" };
  }),
});

// export type definition of API
export type AppRouter = typeof appRouter;
```

##### 2. Create a responseMeta handler

Create or update your responseMeta function to attach the cookies/headers you specified in your routes to the response sent back to the client.

```ts
import { LambdaResponseMeta } from '@trpc/server/adapters/aws-lambda';

const responseMeta: ResponseMetaFn<
  typeof router,
  LambdaResponseMeta
> = ({ ctx }) => {
  const response: LambdaResponseMeta = {
    headers: {},
  };

  // If using the v1 response format
  if (ctx?.multiValueHeaders) {
    response.multiValueHeaders = ctx.multiValueHeaders;
  }

  // If using the v2 response format
  if (ctx?.cookies) {
    response.cookies = ctx.cookies;
  }

  return response;
};
```

##### 3. Specify the responseMeta in the adapter handler

```ts
export const handler = awsLambdaRequestHandler({
  router: appRouter,
  createContext,
  responseMeta,
});
```