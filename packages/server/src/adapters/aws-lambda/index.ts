/**
 * If you're making an adapter for tRPC and looking at this file for reference, you should import types and functions from `@trpc/server` and `@trpc/server/http`
 *
 * @example
 * ```ts
 * import type { AnyTRPCRouter } from '@trpc/server'
 * import type { HTTPBaseHandlerOptions } from '@trpc/server/http'
 * ```
 */
import type { Context as APIGWContext, StreamifyHandler } from 'aws-lambda';
// @trpc/server
import type {
  AnyRouter,
  CreateContextCallback,
  inferRouterContext,
} from '../../@trpc/server';
// @trpc/server
import type {
  HTTPBaseHandlerOptions,
  ResolveHTTPRequestOptionsContextFn,
  TRPCRequestInfo,
} from '../../@trpc/server/http';
import { resolveResponse } from '../../@trpc/server/http';
import type { inferAPIGWReturn, LambdaEvent } from './getPlanner';

export type { inferAPIGWReturn, LambdaEvent } from './getPlanner';
import { getPlanner } from './getPlanner';

/**
 * What `createContext` gets in the AWS Lambda adapter: the event, the
 * Lambda context and the request's `info`.
 * @see https://trpc.io/docs/server/adapters/aws-lambda#2-create-a-trpc-router
 */
export type CreateAWSLambdaContextOptions<TEvent extends LambdaEvent> = {
  /** The API Gateway or function URL event. */
  event: TEvent;
  /** The Lambda invocation's context. */
  context: APIGWContext;
  info: TRPCRequestInfo;
};

/**
 * The options of `awsLambdaRequestHandler` and
 * `awsLambdaStreamingRequestHandler`.
 * @see https://trpc.io/docs/server/adapters/aws-lambda
 */
export type AWSLambdaOptions<
  TRouter extends AnyRouter,
  TEvent extends LambdaEvent,
> = HTTPBaseHandlerOptions<TRouter, TEvent> &
  CreateContextCallback<
    inferRouterContext<AnyRouter>,
    AWSLambdaCreateContextFn<TRouter, TEvent>
  >;

/** The `createContext` function the AWS Lambda adapter takes. */
export type AWSLambdaCreateContextFn<
  TRouter extends AnyRouter,
  TEvent extends LambdaEvent,
> = ({
  event,
  context,
  info,
}: CreateAWSLambdaContextOptions<TEvent>) =>
  | inferRouterContext<TRouter>
  | Promise<inferRouterContext<TRouter>>;

/**
 * Creates a Lambda handler for a router, for API Gateway (REST and HTTP
 * APIs) and Lambda function URLs.
 * @see https://trpc.io/docs/server/adapters/aws-lambda#3-use-the-amazon-api-gateway-adapter
 */
export function awsLambdaRequestHandler<
  TRouter extends AnyRouter,
  TEvent extends LambdaEvent,
>(
  opts: AWSLambdaOptions<TRouter, TEvent>,
): (event: TEvent, context: APIGWContext) => Promise<inferAPIGWReturn<TEvent>> {
  return async (event, context) => {
    const planner = getPlanner(event);

    const createContext: ResolveHTTPRequestOptionsContextFn<TRouter> = async (
      innerOpts,
    ) => {
      return await opts.createContext?.({ event, context, ...innerOpts });
    };

    const response = await resolveResponse({
      ...opts,
      createContext,
      req: planner.request,
      path: planner.path,
      error: null,
      onError(o) {
        opts?.onError?.({
          ...o,
          req: event,
        });
      },
    });

    return await planner.toResult(response);
  };
}

/**
 * Creates a Lambda handler that streams its response, for use with
 * `awslambda.streamifyResponse()`.
 * @see https://trpc.io/docs/server/adapters/aws-lambda#aws-lambda-response-streaming-adapter
 */
export function awsLambdaStreamingRequestHandler<
  TRouter extends AnyRouter,
  TEvent extends LambdaEvent,
>(opts: AWSLambdaOptions<TRouter, TEvent>): StreamifyHandler<TEvent> {
  return async (event, responseStream, context) => {
    const planner = getPlanner(event);

    const createContext: ResolveHTTPRequestOptionsContextFn<TRouter> = async (
      innerOpts,
    ) => {
      return await opts.createContext?.({ event, context, ...innerOpts });
    };

    const response = await resolveResponse({
      ...opts,
      createContext,
      req: planner.request,
      path: planner.path,
      error: null,
      onError(o) {
        opts?.onError?.({
          ...o,
          req: event,
        });
      },
    });

    await planner.toStream(response, responseStream);
  };
}
