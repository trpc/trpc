/**
 * If you're making an adapter for tRPC and looking at this file for reference, you should import types and functions from `@trpc/server` and `@trpc/server/http`
 *
 * @example
 * ```ts
 * import type { AnyTRPCRouter } from '@trpc/server'
 * import type { HTTPBaseHandlerOptions } from '@trpc/server/http'
 * ```
 */
import { Readable } from 'node:stream';
import type { FastifyReply, FastifyRequest } from 'fastify';
// @trpc/server
import type { AnyRouter } from '../../@trpc/server';
import type {
  HTTPRequest,
  HTTPResponse,
  ResolveHTTPRequestOptionsContextFn,
  ResponseChunk,
} from '../../@trpc/server/http';
import {
  getBatchStreamFormatter,
  resolveHTTPResponse,
} from '../../@trpc/server/http';
import { getFastifyHTTPJSONContentTypeHandler } from './content-type/json';
import type { FastifyRequestHandlerOptions } from './types';

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

  const jsonContentTypeHandler = getFastifyHTTPJSONContentTypeHandler<
    TRouter,
    TRequest,
    TResponse
  >();

  const query = opts.req.query
    ? new URLSearchParams(opts.req.query as any)
    : new URLSearchParams(opts.req.url.split('?')[1]);

  const req: HTTPRequest = {
    query,
    method: opts.req.method,
    headers: opts.req.headers,
  };

  let resolve: (value: FastifyReply) => void;
  const promise = new Promise<FastifyReply>((r) => (resolve = r));

  let isStream = false;
  let stream: Readable;
  let formatter: ReturnType<typeof getBatchStreamFormatter>;
  const unstable_onHead = (head: HTTPResponse, isStreaming: boolean) => {
    if (!opts.res.statusCode || opts.res.statusCode === 200) {
      opts.res.statusCode = head.status;
    }
    for (const [key, value] of Object.entries(head.headers ?? {})) {
      /* istanbul ignore if -- @preserve */
      if (typeof value === 'undefined') {
        continue;
      }
      void opts.res.header(key, value);
    }
    if (isStreaming) {
      void opts.res.header('Transfer-Encoding', 'chunked');
      void opts.res.header(
        'Vary',
        opts.res.hasHeader('Vary')
          ? 'trpc-batch-mode, ' + opts.res.getHeader('Vary')
          : 'trpc-batch-mode',
      );
      stream = new Readable();
      stream._read = () => {}; // eslint-disable-line @typescript-eslint/no-empty-function -- https://github.com/fastify/fastify/issues/805#issuecomment-369172154
      resolve(opts.res.send(stream));
      isStream = true;
      formatter = getBatchStreamFormatter();
    }
  };

  const unstable_onChunk = ([index, string]: ResponseChunk) => {
    if (index === -1) {
      // full response, no streaming
      resolve(opts.res.send(string));
    } else {
      stream.push(formatter(index, string));
    }
  };

  resolveHTTPResponse({
    ...opts,
    req,
    getInput(info) {
      return jsonContentTypeHandler.getInputs(opts, info);
    },
    createContext,
    onError(o) {
      opts?.onError?.({ ...o, req: opts.req });
    },
    unstable_onHead,
    unstable_onChunk,
  })
    .then(() => {
      if (isStream) {
        stream.push(formatter.end());
        stream.push(null); // https://github.com/fastify/fastify/issues/805#issuecomment-369172154
      }
    })
    .catch(() => {
      if (isStream) {
        stream.push(null);
      }
    });

  return promise;
}
