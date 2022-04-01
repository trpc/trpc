import type { AnyRouter } from '../';
import {
  NodeHTTPCreateContextFn,
  NodeHTTPCreateContextFnOptions,
  nodeHTTPRequestHandler as requestHandlerInner,
} from '../adapters/node-http';

/**
 * @deprecated use `nodeHTTPRequestHandler` from `@trpc/server/adapters/node-http`
 */
export const requestHandler: typeof requestHandlerInner = requestHandlerInner;

/**
 * @deprecated use `NodeHTTPCreateContextFn` from `@trpc/server/adapters/node-http`
 */
export type CreateContextFn<
  TRouter extends AnyRouter,
  TRequest,
  TResponse,
> = NodeHTTPCreateContextFn<TRouter, TRequest, TResponse>;

/**
 * @deprecated use `NodeHTTPCreateContextFnOptions` from `@trpc/server/adapters/node-http`
 */
export type CreateContextFnOptions<TRequest, TResponse> =
  NodeHTTPCreateContextFnOptions<TRequest, TResponse>;
