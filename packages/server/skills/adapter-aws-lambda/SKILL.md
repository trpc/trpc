---
name: adapter-aws-lambda
description: >
  Deploy tRPC on AWS Lambda with awsLambdaRequestHandler() from
  @trpc/server/adapters/aws-lambda for API Gateway v1 (REST, APIGatewayProxyEvent)
  and v2 (HTTP, APIGatewayProxyEventV2), and Lambda Function URLs. Enable response
  streaming with awsLambdaStreamingRequestHandler() wrapped in
  awslambda.streamifyResponse(). CreateAWSLambdaContextOptions provides event and
  context for context creation.
type: core
library: trpc
library_version: '11.16.0'
requires:
  - server-setup
sources:
  - www/docs/server/adapters/aws-lambda.md
  - examples/lambda-url/
  - examples/lambda-api-gateway/
---

# tRPC — Adapter: AWS Lambda

## Setup

```ts
// server.ts
import { initTRPC } from '@trpc/server';
import type { CreateAWSLambdaContextOptions } from '@trpc/server/adapters/aws-lambda';
import { awsLambdaRequestHandler } from '@trpc/server/adapters/aws-lambda';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z } from 'zod';

const t = initTRPC.create();

const appRouter = t.router({
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => ({ greeting: `Hello, ${input.name}!` })),
});

export type AppRouter = typeof appRouter;

const createContext = ({
  event,
  context,
}: CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>) => ({
  event,
  lambdaContext: context,
});

export const handler = awsLambdaRequestHandler({
  router: appRouter,
  createContext,
});
```

## Core Patterns

### API Gateway v1 (REST) handler

```ts
import type { CreateAWSLambdaContextOptions } from '@trpc/server/adapters/aws-lambda';
import { awsLambdaRequestHandler } from '@trpc/server/adapters/aws-lambda';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { appRouter } from './router';

const createContext = ({
  event,
  context,
}: CreateAWSLambdaContextOptions<APIGatewayProxyEvent>) => ({
  user: event.requestContext.authorizer?.claims,
});

export const handler = awsLambdaRequestHandler({
  router: appRouter,
  createContext,
});
```

Use `APIGatewayProxyEvent` for REST API (v1 payload format) and `APIGatewayProxyEventV2` for HTTP API (v2 payload format).

### Response streaming with awsLambdaStreamingRequestHandler

```ts
/// <reference types="aws-lambda" />
import type { CreateAWSLambdaContextOptions } from '@trpc/server/adapters/aws-lambda';
import { awsLambdaStreamingRequestHandler } from '@trpc/server/adapters/aws-lambda';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { appRouter } from './router';

const createContext = ({
  event,
  context,
}: CreateAWSLambdaContextOptions<APIGatewayProxyEventV2>) => ({});

export const handler = awslambda.streamifyResponse(
  awsLambdaStreamingRequestHandler({
    router: appRouter,
    createContext,
  }),
);
```

Response streaming is supported for Lambda Function URLs and API Gateway REST APIs (with `responseTransferMode: STREAM`). The `awslambda` namespace is provided by the Lambda execution environment.

### Streaming async generator procedure

```ts
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

export const appRouter = t.router({
  countdown: t.procedure.query(async function* () {
    for (let i = 10; i >= 0; i--) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      yield i;
    }
  }),
});
```

Pair with `httpBatchStreamLink` on the client for streamed responses.

### Limiting batch size with maxBatchSize

```ts
import { awsLambdaRequestHandler } from '@trpc/server/adapters/aws-lambda';
import { appRouter } from './router';

export const handler = awsLambdaRequestHandler({
  router: appRouter,
  createContext,
  maxBatchSize: 10,
});
```

Requests batching more than `maxBatchSize` operations are rejected with a `400 Bad Request` error. Set `maxItems` on your client's `httpBatchLink` to the same value to avoid exceeding the limit.

## Common Mistakes

### HIGH Using httpBatchLink with per-procedure API Gateway resources

Wrong:

```ts
// API Gateway has a separate resource for each procedure
// e.g., /getUser, /createUser
// Client uses:
import { httpBatchLink } from '@trpc/client';

httpBatchLink({ url: 'https://api.example.com' });
// Batch request to /getUser,createUser → 404
```

Correct:

```ts
import { httpBatchLink, httpLink } from '@trpc/client';

// Option A: Single catch-all resource (e.g., /{proxy+})
httpBatchLink({ url: 'https://api.example.com' });

// Option B: Per-procedure resources with httpLink (no batching)
httpLink({ url: 'https://api.example.com' });
```

`httpBatchLink` sends multiple procedure names in the URL path (e.g., `getUser,createUser`). If API Gateway routes are per-procedure, the combined path does not match any resource and returns 404. Use a single catch-all resource or switch to `httpLink`.

Source: www/docs/server/adapters/aws-lambda.md

### HIGH Forgetting streamifyResponse wrapper for streaming

Wrong:

```ts
export const handler = awsLambdaStreamingRequestHandler({
  router: appRouter,
  createContext,
});
```

Correct:

```ts
export const handler = awslambda.streamifyResponse(
  awsLambdaStreamingRequestHandler({
    router: appRouter,
    createContext,
  }),
);
```

`awsLambdaStreamingRequestHandler` requires wrapping with `awslambda.streamifyResponse()` to enable Lambda response streaming. Without it, Lambda treats the handler as a standard buffered response.

Source: www/docs/server/adapters/aws-lambda.md

## See Also

- **server-setup** -- `initTRPC.create()`, router/procedure definition, context
- **adapter-fetch** -- alternative for edge/serverless runtimes using Fetch API
- **links** -- `httpBatchLink` vs `httpLink` for API Gateway routing considerations
- AWS Lambda docs: https://docs.aws.amazon.com/lambda/latest/dg/welcome.html
