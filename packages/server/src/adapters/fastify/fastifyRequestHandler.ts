/**
 * If you're making an adapter for tRPC and looking at this file for reference, you should import types and functions from `@trpc/server` and `@trpc/server/http`
 *
 * @example
 * ```ts
 * import type { AnyTRPCRouter } from '@trpc/server'
 * import type { HTTPBaseHandlerOptions } from '@trpc/server/http'
 * ```
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
// @trpc/server
import type { AnyRouter } from '../../@trpc/server';
// @trpc/server/http
import {
  resolveResponse,
  type HTTPBaseHandlerOptions,
  type ResolveHTTPRequestOptionsContextFn,
} from '../../@trpc/server/http';
// @trpc/server/node-http
import {
  incomingMessageToRequest,
  type IncomingMessageWithBody,
  type NodeHTTPCreateContextOption,
} from '../node-http';

export type FastifyHandlerOptions<
  TRouter extends AnyRouter,
  TRequest extends FastifyRequest,
  TResponse extends FastifyReply,
> = HTTPBaseHandlerOptions<TRouter, TRequest> &
  NodeHTTPCreateContextOption<TRouter, TRequest, TResponse>;

type FastifyRequestHandlerOptions<
  TRouter extends AnyRouter,
  TRequest extends FastifyRequest,
  TResponse extends FastifyReply,
> = FastifyHandlerOptions<TRouter, TRequest, TResponse> & {
  req: TRequest;
  res: TResponse;
  path: string;
};

export async function fastifyRequestHandler<
  TRouter extends AnyRouter,
  TRequest extends FastifyRequest,
  TResponse extends FastifyReply,
>(opts: FastifyRequestHandlerOptions<TRouter, TRequest, TResponse>) {
  const createContext: ResolveHTTPRequestOptionsContextFn<TRouter> = async (
    innerOpts,
  ) => {
    return await opts.createContext?.({
      ...opts,
      ...innerOpts,
    });
  };

  const incomingMessage = opts.req.raw as IncomingMessageWithBody;

  // monkey-path body to the IncomingMessage
  if ('body' in opts.req) {
    incomingMessage.body = opts.req.body;
  }
  const req = incomingMessageToRequest(incomingMessage, {
    maxBodySize: null,
  });

  const res = await resolveResponse({
    ...opts,
    req,
    error: null,
    createContext,
    onError(o) {
      opts?.onError?.({
        ...o,
        req: opts.req,
      });
    },
  });

  await opts.res.send(res);
}
