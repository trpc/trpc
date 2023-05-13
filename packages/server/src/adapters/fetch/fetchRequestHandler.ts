import { AnyRouter } from '../../core';
import { HTTPRequest } from '../../http';
import { HTTPResponse, ResponseChunk } from '../../http/internals/types';
import { resolveHTTPResponse } from '../../http/resolveHTTPResponse';
import { FetchHandlerOptions } from './types';

export type FetchHandlerRequestOptions<TRouter extends AnyRouter> = {
  req: Request;
  endpoint: string;
} & FetchHandlerOptions<TRouter>;

async function iteratorToResponse(
  iterator: AsyncGenerator<
    ResponseChunk | HTTPResponse,
    ResponseChunk | undefined,
    unknown
  >,
  headers: Headers,
) {
  const { value: responseInit, done: invalidInit } = await (
    iterator as AsyncGenerator<HTTPResponse, HTTPResponse | undefined>
  ).next();
  const { value: firstChunk, done: abort } = await (
    iterator as AsyncGenerator<ResponseChunk, ResponseChunk | undefined>
  ).next();

  if (invalidInit || (abort && !firstChunk)) {
    return new Response(null, {
      status: 500,
      headers,
    });
  }

  const status = responseInit.status;

  for (const [key, value] of Object.entries(responseInit.headers ?? {})) {
    if (typeof value === 'undefined') {
      continue;
    }
    if (typeof value === 'string') {
      headers.set(key, value);
      continue;
    }
    for (const v of value) {
      headers.append(key, v);
    }
  }

  if (abort) {
    if (firstChunk) {
      // case of a full response
      return new Response(firstChunk[1], {
        status,
        headers,
      });
    } else {
      // case of a method === "HEAD" response
      return new Response(null, {
        status,
        headers,
      });
    }
  }

  headers.set('Transfer-Encoding', 'chunked');

  let first = true;
  const body = new ReadableStream({
    async start(controller) {
      controller.enqueue('{\n');

      const sendChunk = ([index, body]: [number, string]) => {
        const comma = first ? '' : ',';
        first = false;
        controller.enqueue(`${comma}"${index}":${body}\n`);
      };

      sendChunk(firstChunk);
      for await (const chunk of iterator as AsyncGenerator<
        ResponseChunk,
        ResponseChunk | undefined
      >) {
        sendChunk(chunk);
      }

      controller.enqueue('}');
      controller.close();
    },
  });

  return new Response(body, {
    status,
    headers,
  });
}

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
    body:
      opts.req.headers.get('content-type') === 'application/json'
        ? await opts.req.text()
        : '',
  };

  const resultIterator = resolveHTTPResponse({
    req,
    createContext,
    path,
    router: opts.router,
    batching: opts.batching,
    responseMeta: opts.responseMeta,
    onError(o) {
      opts?.onError?.({ ...o, req: opts.req });
    },
  });

  const res = await iteratorToResponse(resultIterator, resHeaders);

  return res;
}
