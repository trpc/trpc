/**
 * AWS Lambda: `main` for API Gateway, ALB and function URLs, and
 * `streaming` for function URLs with `InvokeMode: RESPONSE_STREAM`. Deploy
 * this file as is; `function-url.ts` serves it locally.
 */
import {
  toLambdaHandler,
  toLambdaStreamingHandler,
  type LambdaPlatform,
} from '@trpc12/trpc/aws-lambda';
import { createFetchHandler } from '@trpc12/trpc/server';
import { handlerOptions, Visits, type AppRouter } from '../src/router.ts';

const handler = createFetchHandler<AppRouter, LambdaPlatform>({
  ...handlerOptions,
  layer: Visits.memory,
  createContext: (opts) => ({
    runtime: {
      name: 'lambda',
      version: process.version,
      requestId: opts.platform.context.awsRequestId,
    },
  }),
});

/** Buffered: subscriptions and streamed outputs arrive once they end. */
export const main = toLambdaHandler(handler);

/** Lambda's Node.js runtime global; it isn't there outside Lambda. */
declare const awslambda:
  | { streamifyResponse<THandler>(handler: THandler): THandler }
  | undefined;

const streamingHandler = toLambdaStreamingHandler(handler);
/** Streamed: status and headers first, then the body as it's produced. */
export const streaming =
  typeof awslambda === 'undefined'
    ? streamingHandler
    : awslambda.streamifyResponse(streamingHandler);
