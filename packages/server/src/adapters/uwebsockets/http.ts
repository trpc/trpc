import { AnyRouter } from '../../core/router';
// import { HTTPRequest } from '@trpc/server/dist/index';
import type { HttpRequest, HttpResponse, TemplatedApp } from 'uWebSockets.js';
import { uWsHTTPRequestHandler } from './requestHandler';

import { uHTTPHandlerOptions, WrappedHTTPRequest } from './types';

export * from './types';

/**
 * @param uWsApp uWebsockets server instance
 * @param prefix The path to trpc without trailing slash (ex: "/trpc")
 * @param opts handler options
 */
export const createUWebSocketsHandler = <TRouter extends AnyRouter>(
  uWsApp: TemplatedApp,
  prefix: string,
  opts: uHTTPHandlerOptions<TRouter>
) => {
  const prefixTrimLength = prefix.length + 1; // remove /* from url

  const cors = (res: HttpResponse, req: HttpRequest) => {
    res.writeHeader(
      'Access-Control-Allow-Origin',
      req.getHeader('origin') || '*'
    );
    res.writeHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, OPTIONS'
    );
    res.writeHeader(
      'Access-Control-Allow-Headers',
      'origin, content-type, accept, authorization'
    );
    res.writeHeader('Access-Control-Allow-Credentials', 'true');
    res.writeHeader('Access-Control-Max-Age', '3600');
  };

  const handler = (res: HttpResponse, req: HttpRequest) => {
    cors(res, req);

    const method = req.getMethod().toUpperCase() as 'GET' | 'POST';
    const url = req.getUrl().substring(prefixTrimLength);
    const query = req.getQuery();

    const headers: Record<string, string> = {};
    req.forEach((key, value) => {
      // TODO handle headers with the same key, potential issue
      headers[key] = value;
    });

    // new request object needs to be created, because socket
    // can only be accessed synchronously, after await it cannot be accessed
    const wrappedReq: WrappedHTTPRequest = {
      headers,
      method,
      query,
      url,
    };

    uWsHTTPRequestHandler({
      req: wrappedReq,
      uRes: res,
      path: url,
      ...opts,
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
    });
  };
  uWsApp.options(`${prefix}/*`, (res, req) => {
    cors(res, req);
    res.end();
  });
  uWsApp.get(`${prefix}/*`, handler);
  uWsApp.post(`${prefix}/*`, handler);
};
