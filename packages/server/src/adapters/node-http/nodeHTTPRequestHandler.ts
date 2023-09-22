/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { AnyRouter } from '../../core';
import { inferRouterContext } from '../../core/types';
import { getBatchStreamFormatter, HTTPRequest } from '../../http';
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
  try {
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

      const onHead = (head: HTTPResponse) => {
        if (
          'status' in head &&
          (!opts.res.statusCode || opts.res.statusCode === 200)
        ) {
          opts.res.statusCode = head.status;
        }
        for (const [key, value] of Object.entries(head.headers ?? {})) {
          /* istanbul ignore if -- @preserve */
          if (typeof value === 'undefined') {
            continue;
          }
          opts.res.setHeader(key, value);
        }
      };

      const formatter = getBatchStreamFormatter();
      let isStream = false;
      const onChunk = ([index, string]: ResponseChunk) => {
        if (index === -1) {
          /**
           * Full response, no streaming. This can happen
           * - if the response is an error
           * - if response is empty (HEAD request)
           */
          opts.res.end(string);
          return;
        }
        if (!isStream) {
          opts.res.setHeader('Transfer-Encoding', 'chunked');
          const vary = opts.res.getHeader('Vary');
          opts.res.setHeader(
            'Vary',
            vary ? 'trpc-batch-mode, ' + vary : 'trpc-batch-mode',
          );
          isStream = true;
        }
        opts.res.write(formatter(index, string));
      };

      const closedPromise = new Promise<void>((_, reject) => {
        opts.res.on("close", () => {
          reject("CLOSED");
        })

        opts.res.on("error", () => {
          reject("CLOSED");
        })
      });


      await resolveHTTPResponse({
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
        onHead,
        onChunk,
        closedPromise
      }).catch(err => {
        console.error("resolveHTTPResponse error", err);
        throw err;
      })

      void closedPromise.catch(() => {
        // ignore
      })

      if (!isStream) {
        return opts.res;
      }

      opts.res.write(formatter.end());
      opts.res.end();
      return opts.res;
    });
  } catch (err) {
    console.error("nodeHTTPRequestHandler error", err);
    throw err;
  }
}
