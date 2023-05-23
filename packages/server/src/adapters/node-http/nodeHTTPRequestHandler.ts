/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { AnyRouter } from '../../core';
import { inferRouterContext } from '../../core/types';
import { HTTPRequest } from '../../http';
import { HTTPResponse, ResponseChunk } from '../../http/internals/types';
import { resolveHTTPResponse } from '../../http/resolveHTTPResponse';
import { nodeHTTPJSONContentTypeHandler } from './content-type/json';
import { NodeHTTPContentTypeHandler } from './internals/contentType';
import {
  NodeHTTPRequest,
  NodeHTTPRequestHandlerOptions,
  NodeHTTPResponse,
} from './types';

const defaultJSONContentTypeHandler = nodeHTTPJSONContentTypeHandler();

export async function nodeHTTPRequestHandler<
  TRouter extends AnyRouter,
  TRequest extends NodeHTTPRequest,
  TResponse extends NodeHTTPResponse,
>(opts: NodeHTTPRequestHandlerOptions<TRouter, TRequest, TResponse>) {
  const handleViaMiddleware = opts.middleware ?? ((_req, _res, next) => next());

  return handleViaMiddleware(opts.req, opts.res, async (err) => {
    if (err) throw err;

    const createContext = async (): Promise<inferRouterContext<TRouter>> => {
      return await opts.createContext?.(opts);
    };

    const query = opts.req.query
      ? new URLSearchParams(opts.req.query as any)
      : new URLSearchParams(opts.req.url!.split('?')[1]);

    const jsonContentTypeHandler =
      defaultJSONContentTypeHandler as unknown as NodeHTTPContentTypeHandler<
        TRequest,
        TResponse
      >;

    const contentTypeHandlers = opts.experimental_contentTypeHandlers ?? [
      jsonContentTypeHandler,
    ];

    const contentTypeHandler =
      contentTypeHandlers.find((handler) =>
        handler.isMatch({
          ...opts,
          query,
        }),
      ) ??
      // fallback to json
      jsonContentTypeHandler;

    const bodyResult = await contentTypeHandler.getBody({
      ...opts,
      query,
    });

    const req: HTTPRequest = {
      method: opts.req.method!,
      headers: opts.req.headers,
      query,
      body: bodyResult.ok ? bodyResult.data : undefined,
    };

    const resultIterator = resolveHTTPResponse({
      batching: opts.batching,
      responseMeta: opts.responseMeta,
      path: opts.path,
      createContext,
      router: opts.router,
      req,
      error: bodyResult.ok ? null : bodyResult.error,
      preprocessedBody: bodyResult.ok ? bodyResult.preprocessed : false,
      onError(o) {
        opts?.onError?.({
          ...o,
          req: opts.req,
        });
      },
      contentTypeHandler,
    });

    return iteratorToResponse(resultIterator, opts.res);
  });
}

/**
 * @internal
 */
export async function iteratorToResponse(
  iterator: AsyncGenerator<
    ResponseChunk | HTTPResponse,
    ResponseChunk | undefined
  >,
  res: NodeHTTPResponse,
) {
  // iterator is expected to first yield the init object (status & headers), of type HTTPResponse
  const { value: responseInit, done: invalidInit } = await (
    iterator as AsyncGenerator<HTTPResponse, HTTPResponse | undefined>
  ).next();
  // then iterator can yield either, of type ResponseChunk
  // - the full response (streaming disabled or error body) => `done === true`, passed via `return`
  // - the body associated with the first resolved procedure => `done === false`, passed via `yield`
  const { value: firstChunk, done: abort } = await (
    iterator as AsyncGenerator<ResponseChunk, ResponseChunk | undefined>
  ).next();

  if (invalidInit) {
    res.statusCode = 500;
    return res.end();
  }
  if ('status' in responseInit && (!res.statusCode || res.statusCode === 200)) {
    res.statusCode = responseInit.status;
  }
  for (const [key, value] of Object.entries(responseInit.headers ?? {})) {
    /* istanbul ignore if -- @preserve */
    if (typeof value === 'undefined') {
      continue;
    }
    res.setHeader(key, value);
  }

  // iterator is already exhausted, this means we're not streaming the response
  if (abort) {
    if (firstChunk) {
      // case of a full response
      return res.end(firstChunk[1]);
    } else {
      // case of a method === "HEAD" response
      return res.end();
    }
  }

  // iterator is not exhausted, we can setup the streamed response
  res.setHeader('Transfer-Encoding', 'chunked');
  const vary = res.getHeader('Vary');
  res.setHeader(
    'Vary',
    vary ? 'trpc-batch-mode, ' + vary : 'trpc-batch-mode',
  );
  res.write('{\n');

  // each procedure body will be written on a new line of the JSON so they can be parsed independently
  let first = true;
  const sendChunk = ([index, body]: [number, string]) => {
    const comma = first ? '' : ',';
    first = false;
    res.write(`${comma}"${index}":${body}\n`);
  };

  // await every procedure
  sendChunk(firstChunk);
  for await (const chunk of iterator as AsyncGenerator<
    ResponseChunk,
    ResponseChunk | undefined
  >) {
    sendChunk(chunk);
  }

  // finalize response
  res.write('}');
  return res.end();
}
