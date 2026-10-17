---
title: AWS Lambda
description: toLambdaHandler for API Gateway, ALB, function URLs and Lambda@Edge, with response streaming.
section: Adapters
order: 6
---

`@trpc12/trpc/aws-lambda` turns a fetch handler into a Lambda handler for API Gateway REST APIs (payload 1.0), HTTP APIs and function URLs (payload 2.0), Application Load Balancers and Lambda@Edge. The event becomes a web `Request` and the response becomes that event's result shape. `{ event, context }` is the platform argument:

```ts
import { toLambdaHandler, type LambdaPlatform } from '@trpc12/trpc/aws-lambda';

const handler = createFetchHandler<AppRouter, LambdaPlatform>({
  router,
  createContext: ({ platform }) => ({
    requestId: platform.context.awsRequestId,
  }),
});

export const main = toLambdaHandler(handler);
```

- Text bodies (JSON, JSONL, forms, `text/*`) stay text. Others, such as a `File` output, are base64 with `isBase64Encoded`.
- Set-cookie headers go where each event type expects them: `multiValueHeaders` (REST, ALB), `cookies` (HTTP API) or CloudFront headers (Edge).
- The call's `signal` aborts `timeoutMarginMs` (default 1000) before Lambda's deadline (`context.getRemainingTimeInMillis()`), so a slow call ends with an error response instead of a Lambda timeout.

## Response streaming

A buffered result only arrives once the response ends, so subscriptions and streamed outputs reach the client all at once. With response streaming (function URLs with `InvokeMode: RESPONSE_STREAM`, or API Gateway REST streaming), `toLambdaStreamingHandler` writes the status and headers first and then the body as it is produced:

```ts
import { toLambdaStreamingHandler } from '@trpc12/trpc/aws-lambda';

export const main = awslambda.streamifyResponse(
  toLambdaStreamingHandler(handler),
);
```
