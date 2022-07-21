import type * as uWs from 'uWebSockets.js';
import { TRPCError } from '../TRPCError';
import { HTTPRequest } from '../http/internals/types';
import { resolveHTTPResponse } from '../http/resolveHTTPResponse';
import { AnyRouter, inferRouterContext } from '../router';
import { NodeHTTPCreateContextFnOptions } from './node-http/types';

export type UWebSocketsRegisterEndpointOptions<TRouter extends AnyRouter> = {
  router: TRouter;
  createContext?: (
    opts: UWebSocketsContextOptions,
  ) => Promise<inferRouterContext<TRouter>>;
};

export type UWebSocketsRequestObject = {
  headers: Record<string, string>;
  method: 'POST' | 'GET';
  query: URLSearchParams;
  path: string;
};

// if this to be used, it needs to be proxied
export type UWebSocketsResponseObject = uWs.HttpResponse;

export type UWebSocketsContextOptions = NodeHTTPCreateContextFnOptions<
  UWebSocketsRequestObject,
  UWebSocketsResponseObject
>;

/**
 * Adapter for uWebSockets.js https://github.com/uNetworking/uWebSockets.js
 *
 * Notes: res object inside the context must not be used.
 * To fix this, it would possible to proxy it. Or can just remove it and
 * force library consumer to either return or throw inside resolver/context
 *
 * @param uWsApp uWebsockets server instance
 * @param pathPrefix The path to endpoint without trailing slash (ex: "/trpc")
 * @param opts
 */
export function registerTRPCasUWebSocketsEndpoint<TRouter extends AnyRouter>(
  uWsApp: uWs.TemplatedApp,
  pathPrefix: string,
  opts: UWebSocketsRegisterEndpointOptions<TRouter>,
) {
  const prefixTrimLength = pathPrefix.length + 1; // remove /* from url

  const handler = async (res: uWs.HttpResponse, req: uWs.HttpRequest) => {
    const method = req.getMethod().toUpperCase();
    if (method !== 'GET' && method !== 'POST') {
      // handle only get and post requests, while the rest
      // will not be captured and propagated further
      req.setYield(true);
      return;
    }
    const path = req.getUrl().substring(prefixTrimLength);
    const query = new URLSearchParams(decodeURIComponent(req.getQuery()));

    const headers: Record<string, string> = {};
    req.forEach((key, value) => {
      headers[key] = value;
    });

    // new request object needs to be created, because socket
    // can only be accessed synchronously, after await it cannot be accessed
    const requestObj: UWebSocketsRequestObject = {
      headers,
      method,
      query,
      path,
    };

    const bodyResult = await readPostBody(method, res);

    // req is no longer available!

    const createContext = async function _(): Promise<
      inferRouterContext<TRouter>
    > {
      //res could be proxied here
      return await opts.createContext?.({ res, req: requestObj });
    };

    const fakeReqObject: HTTPRequest = {
      method,
      headers,
      query,
      body: bodyResult.ok ? bodyResult.data : undefined,
    };

    // TODO batching, onError options need implementation.
    // responseMeta is not applicable?
    const result = await resolveHTTPResponse({
      path,
      createContext,
      router: opts.router,
      req: fakeReqObject,
      error: bodyResult.ok ? null : bodyResult.error,
    });

    if ('status' in result) {
      res.writeStatus(result.status.toString()); //temp
    } else {
      // assume something went bad, should never happen?
      // there is no way to know from res object that something was send to the socket
      // can proxy it to detect res calls during createContext and resolve
      // then will need to exit from here

      res.cork(() => {
        res.writeStatus('500 INTERNAL SERVER ERROR');
        res.end();
      });
      return;
    }

    for (const [key, value] of Object.entries(result.headers ?? {})) {
      if (typeof value === 'undefined') {
        continue;
      }
      // FIX not sure why it could be an array. This code path is not tested
      if (Array.isArray(value))
        value.forEach((header) => {
          res.writeHeader(key, header);
        });
      else res.writeHeader(key, value);
    }

    res.cork(() => {
      if (result.body) res.write(result.body);
      res.end();
    });
  };

  uWsApp.any(pathPrefix + '/*', handler);
}

// Helpers

export function readPostBody(method: string, res: uWs.HttpResponse) {
  return new Promise<
    { ok: true; data: unknown } | { ok: false; error: TRPCError }
  >((resolve) => {
    if (method == 'GET') {
      // no body in get request
      resolve({
        ok: true,
        data: undefined,
      });
    }

    let buffer: Buffer;
    res.onData((ab, isLast) => {
      const chunk = Buffer.from(ab);

      if (isLast) {
        if (buffer) {
          // large request, with multiple chunks
          resolve({
            ok: true,
            data: buffer.toString(), // do i need utf8?
          });
        } else {
          // only a single chunk was recieved
          resolve({
            ok: true,
            data: chunk.toString(),
          });
        }
      } else {
        if (buffer) {
          buffer = Buffer.concat([buffer, chunk]);
        } else {
          buffer = Buffer.concat([chunk]);
        }
      }
    });

    res.onAborted(() => {
      resolve({
        ok: false,
        error: new TRPCError({ code: 'CLIENT_CLOSED_REQUEST' }),
      });
    });
  });
}
