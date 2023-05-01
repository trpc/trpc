import { FastifyReply, FastifyRequest } from 'fastify';
import { AnyRouter, inferRouterContext } from '../../core';
import { HTTPBaseHandlerOptions, HTTPRequest } from '../../http';
import { resolveHTTPResponse } from '../../http/resolveHTTPResponse';
import { NodeHTTPCreateContextOption } from '../node-http';

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
> = {
  req: TRequest;
  res: TResponse;
  path: string;
} & FastifyHandlerOptions<TRouter, TRequest, TResponse>;

export async function fastifyRequestHandler<
  TRouter extends AnyRouter,
  TRequest extends FastifyRequest,
  TResponse extends FastifyReply,
>(opts: FastifyRequestHandlerOptions<TRouter, TRequest, TResponse>) {
  const createContext = async function _createContext(): Promise<
    inferRouterContext<TRouter>
  > {
    return opts.createContext?.(opts);
  };

  const query = opts.req.query
    ? new URLSearchParams(opts.req.query as any)
    : new URLSearchParams(opts.req.url.split('?')[1]);

  const req: HTTPRequest = {
    query,
    method: opts.req.method,
    headers: opts.req.headers,
    body: opts.req.body ?? 'null',
    raw: opts.req,
  };

  const result = await resolveHTTPResponse({
    req,
    requestUtils: {
      getHeaders() {
        return opts.req.headers;
      },
      async getBodyStream() {
        // TODO: looks like 3rd party lib might be needed? https://github.com/fastify/fastify-multipart
        throw new Error(
          'Not Implemented: tRPC does not currently support streams / form-data with Fastify Adapter',
        );
      },
    },
    createContext,
    path: opts.path,
    router: opts.router,
    batching: opts.batching,
    responseMeta: opts.responseMeta,
    onError(o) {
      opts?.onError?.({ ...o, req: opts.req });
    },
  });

  const { res } = opts;

  if ('status' in result && (!res.statusCode || res.statusCode === 200)) {
    res.statusCode = result.status;
  }
  for (const [key, value] of Object.entries(result.headers ?? {})) {
    /* istanbul ignore if -- @preserve */
    if (typeof value === 'undefined') {
      continue;
    }

    void res.header(key, value);
  }
  await res.send(result.body);
}
