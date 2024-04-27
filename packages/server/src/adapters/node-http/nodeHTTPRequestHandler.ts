/**
 * If you're making an adapter for tRPC and looking at this file for reference, you should import types and functions from `@trpc/server` and `@trpc/server/http`
 *
 * @example
 * ```ts
 * import type { AnyTRPCRouter } from '@trpc/server'
 * import type { HTTPBaseHandlerOptions } from '@trpc/server/http'
 * ```
 */

// @trpc/server

import type * as http from 'http';
import {
  getTRPCErrorFromUnknown,
  TRPCError,
  type AnyRouter,
} from '../../@trpc/server';
import type { ResolveHTTPRequestOptionsContextFn } from '../../@trpc/server/http';
import { resolveResponse } from '../../@trpc/server/http';
import type {
  NodeHTTPRequest,
  NodeHTTPRequestHandlerOptions,
  NodeHTTPResponse,
} from './types';

function assertAsyncIterable<TValue>(
  value: any,
): asserts value is AsyncIterable<TValue> {
  if (!(Symbol.asyncIterator in value)) {
    throw new Error('Expected AsyncIterable - are you using Node >= 18.0.0?');
  }
}

/**
 * Convert an incoming message to a body stream with a max size
 */
function incomingMessageToBodyStream(
  req: http.IncomingMessage,
  opts: { maxBodySize: number | null },
) {
  type Value = Buffer | Uint8Array | string | null;
  let size = 0;
  const maxBodySize = opts.maxBodySize;

  let controller: ReadableStreamDefaultController<Value> =
    null as unknown as ReadableStreamDefaultController<Value>;
  const stream = new ReadableStream<Value>({
    start(c) {
      controller = c;
    },
    async pull(c) {
      const chunk: Value = req.read();

      if (chunk) {
        size += chunk.length;
      }
      if (maxBodySize !== null && size > maxBodySize) {
        controller.error(
          new TRPCError({
            code: 'PAYLOAD_TOO_LARGE',
          }),
        );
        return;
      }
      if (chunk === null) {
        c.close();
        return;
      }
      controller.enqueue(chunk);
    },
    cancel() {
      req.destroy();
    },
  });

  return stream;
}

export function incomingMessageToRequest(
  req: http.IncomingMessage,
  opts: {
    maxBodySize: number | null;
  },
): Request {
  const ac = new AbortController();
  const headers = new Headers(req.headers as any);
  const url = `http://${headers.get('host')}${req.url}`;
  req.once('aborted', () => ac.abort());

  const init: RequestInit = {
    headers,
    method: req.method,
    signal: ac.signal,
    // @ts-expect-error this is fine
    duplex: 'half',
  };
  if (req.method === 'POST') {
    if (!('body' in req)) {
      init.body = incomingMessageToBodyStream(req, opts);
    } else if (typeof req.body === 'string') {
      init.body = req.body;
    } else if (req.body !== undefined) {
      init.body = JSON.stringify(req.body);
    }
  }
  const request = new Request(url, init);

  return request;
}

export async function nodeHTTPRequestHandler<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>(opts: NodeHTTPRequestHandlerOptions<TRouter, TRequest, TResponse>) {
  const handleViaMiddleware = opts.middleware ?? ((_req, _res, next) => next());

  return handleViaMiddleware(opts.req, opts.res, async (err) => {
    const req = incomingMessageToRequest(opts.req, {
      maxBodySize: opts.maxBodySize ?? null,
    });

    // Build tRPC dependencies
    const createContext: ResolveHTTPRequestOptionsContextFn<TRouter> = async (
      innerOpts,
    ) => {
      return await opts.createContext?.({
        ...opts,
        ...innerOpts,
      });
    };

    const response = await resolveResponse({
      ...opts,
      req,
      error: err ? getTRPCErrorFromUnknown(err) : null,
      createContext,
      onError(o) {
        opts?.onError?.({
          ...o,
          req: opts.req,
        });
      },
    });

    if (opts.res.statusCode === 200) {
      // if the status code is set, we assume that it's been manually overridden
      opts.res.statusCode = response.status;
    }
    for (const [key, value] of response.headers) {
      opts.res.setHeader(key, value);
    }
    if (response.body) {
      assertAsyncIterable(response.body);
      for await (const chunk of response.body) {
        opts.res.write(chunk);
      }
    }
    opts.res.end();
  });
}
