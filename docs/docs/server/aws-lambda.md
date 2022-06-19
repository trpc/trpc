---
id: aws-lambda
title: Usage with Amazon Lambda through the API Gateway
sidebar_label: 'Adapter: Amazon Lambda'
slug: /aws-lambda
---

## Amazon Lambda adapter

The AWS Lambda adapter is supported for API Gateway Rest API(v1) and HTTP API(v2) use cases.

## Example app

<table>
  <thead>
    <tr>
      <th>Description</th>
      <th>URL</th>
      <th>Links</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>API Gateway with NodeJS client.</td>
      <td><em>n/a</em></td>
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
import * as trpc from '@trpc/server';
import { z } from 'zod';

const appRouter = trpc.router().query('getUser', {
  input: z.string(),
  async resolve(req) {
    req.input; // string
    return { id: req.input, name: 'Bilbo' };
  },
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
}: CreateAWSLambdaContextOptions) => ({}) // no context
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

#### A word about payload format version

API Gateway has two different event data formats when it invokes a Lambda. For REST APIs they should be version "1.0"(`APIGatewayProxyEvent`), but you can chose which for HTTP APIs by stating either version "1.0" or "2.0".

- Version 1.0: `APIGatewayProxyEvent`
- Version 2.0: `APIGatewayProxyEventV2`

To infer what version you might have, supply the context as following:

```TypeScript
function createContext({
  event,
  context,
}: CreateAWSLambdaContextOptions<APIGatewayProxyEvent>) {
  ...
}

// CreateAWSLambdaContextOptions<APIGatewayProxyEvent> or CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>
```

[Read more here about payload format version](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html)
