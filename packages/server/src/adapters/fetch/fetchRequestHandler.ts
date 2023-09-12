import { AnyRouter } from '../../core';
import { getBatchStreamFormatter, HTTPRequest } from '../../http';
import { HTTPResponse, ResponseChunk } from '../../http/internals/types';
import { resolveHTTPResponse } from '../../http/resolveHTTPResponse';
import { FetchHandlerOptions } from './types';

export type FetchHandlerRequestOptions<TRouter extends AnyRouter> =
  FetchHandlerOptions<TRouter> & {
    req: Request;
    endpoint: string;
  };

export async function fetchRequestHandler<TRouter extends AnyRouter>(
  opts: FetchHandlerRequestOptions<TRouter>,
): Promise<Response> {
  const resHeaders = new Headers();

  const createContext = async () => {
    return opts.createContext?.({ req: opts.req, resHeaders });
  };

  const url = new URL(opts.req.url);
  const path = url.pathname.slice(opts.endpoint.length + 1);
  const req: HTTPRequest = {
    query: url.searchParams,
    method: opts.req.method,
    headers: Object.fromEntries(opts.req.headers),
    body: opts.req.headers.get('content-type')?.startsWith('application/json')
      ? await opts.req.text()
      : '',
  };

  let resolve: (value: Response) => void;
  const promise = new Promise<Response>((r) => (resolve = r));
  let status = 200;

  let isStream = false;
  let controller: ReadableStreamController<any>;
  let encoder: TextEncoder;
  let formatter: ReturnType<typeof getBatchStreamFormatter>;
  const unstable_onHead = (head: HTTPResponse, isStreaming: boolean) => {
    for (const [key, value] of Object.entries(head.headers ?? {})) {
      /* istanbul ignore if -- @preserve */
      if (typeof value === 'undefined') {
        continue;
      }
      if (typeof value === 'string') {
        resHeaders.set(key, value);
        continue;
      }
      for (const v of value) {
        resHeaders.append(key, v);
      }
    }
    status = head.status;
    if (isStreaming) {
      resHeaders.set('Transfer-Encoding', 'chunked');
      resHeaders.append('Vary', 'trpc-batch-mode');
      const stream = new ReadableStream({
        start(c) {
          controller = c;
        },
      });
      const response = new Response(stream, {
        status,
        headers: resHeaders,
      });
      resolve(response);
      encoder = new TextEncoder();
      formatter = getBatchStreamFormatter();
      isStream = true;
    }
  };

  const unstable_onChunk = ([index, string]: ResponseChunk) => {
    if (index === -1) {
      // full response, no streaming
      const response = new Response(string || null, {
        status,
        headers: resHeaders,
      });
      resolve(response);
    } else {
      controller.enqueue(encoder.encode(formatter(index, string)));
    }
  };

  resolveHTTPResponse({
    req,
    createContext,
    path,
    router: opts.router,
    batching: opts.batching,
    responseMeta: opts.responseMeta,
    onError(o) {
      opts?.onError?.({ ...o, req: opts.req });
    },
    unstable_onHead,
    unstable_onChunk,
  })
    .then(() => {
      if (isStream) {
        controller.enqueue(encoder.encode(formatter.end()));
        controller.close();
      }
    })
    .catch(() => {
      if (isStream) {
        controller.close();
      }
    });

  return promise;
}
