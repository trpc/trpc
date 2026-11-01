---
title: AWS Lambda
description: '`toLambdaHandler` for API Gateway, ALB, function URLs and Lambda@Edge, with response streaming.'
section: Adapters
order: 6
v11: server/adapters/aws-lambda
---

`@trpc12/trpc/aws-lambda` turns a fetch handler into a Lambda handler for API Gateway REST APIs (payload 1.0), HTTP APIs and function URLs (payload 2.0), Application Load Balancers and Lambda@Edge. The event becomes a web `Request` and the response becomes that event's result shape. `{ event, context }` is the platform argument:

```ts twoslash
// ---cut-start---
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
const t = initTrpc<{ ctx: { requestId: string | undefined } }>();
const router = t.router({ health: t.procedure.query(() => 'ok') });
type AppRouter = typeof router;
// ---cut-end---
import { toLambdaHandler, type LambdaPlatform } from '@trpc12/trpc/aws-lambda';

const handler = createFetchHandler<AppRouter, LambdaPlatform>({
  router,
  createContext: (opts) => ({
    requestId: opts.platform.context.awsRequestId,
  }),
});

export const main = toLambdaHandler(handler);
```

- Text bodies (JSON, JSONL, forms, `text/*`) stay text. Others, such as a `File` output, are base64 with `isBase64Encoded`.
- Set-cookie headers go where each event type expects them: `multiValueHeaders` (REST), `cookies` (HTTP API) or CloudFront headers (Edge). An ALB reads only `multiValueHeaders` when the target group has `lambda.multi_value_headers.enabled`, and only `headers` otherwise, so the result follows the event; without multi-value headers an ALB response carries one `Set-Cookie`, the last.
- The call's `signal` aborts `timeoutMargin` (default `'1 second'`) before Lambda's deadline (`context.getRemainingTimeInMillis()`), so a slow call ends with an error response instead of a Lambda timeout.

## Response streaming

A buffered result only arrives once the response ends, so subscriptions and streamed outputs reach the client all at once. With response streaming (function URLs with `InvokeMode: RESPONSE_STREAM`, or API Gateway REST streaming), `toLambdaStreamingHandler` writes the status and headers first and then the body as it is produced:

```ts twoslash
// ---cut-start---
import { handler } from './server.ts';
/** Lambda's Node.js runtime global; it marks the handler as streaming and returns it. */
declare namespace awslambda {
  function streamifyResponse<THandler>(handler: THandler): THandler;
}
// ---cut-end---
import { toLambdaStreamingHandler } from '@trpc12/trpc/aws-lambda';

export const main = awslambda.streamifyResponse(
  toLambdaStreamingHandler(handler),
);
```
