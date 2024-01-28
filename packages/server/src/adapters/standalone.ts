/* eslint-disable @typescript-eslint/no-non-null-assertion */
import http from 'http';
import type { AnyRouter } from '../core';
import { toURL } from '../http/toURL';
import type {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPHandlerOptions,
} from './node-http';
import { nodeHTTPRequestHandler } from './node-http';

export type CreateHTTPHandlerOptions<TRouter extends AnyRouter> =
  NodeHTTPHandlerOptions<TRouter, http.IncomingMessage, http.ServerResponse>;

export type CreateHTTPContextOptions = NodeHTTPCreateContextFnOptions<
  http.IncomingMessage,
  http.ServerResponse
>;

export function createHTTPHandler<TRouter extends AnyRouter>(
  opts: CreateHTTPHandlerOptions<TRouter>,
) {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = toURL(req.url!);

    // get procedure path and remove the leading slash
    // /procedure -> procedure
    const path = url.pathname.slice(1);

    await nodeHTTPRequestHandler({
      // FIXME: no typecasting should be needed here
      ...(opts as CreateHTTPHandlerOptions<AnyRouter>),
      req,
      res,
      path,
    });
  };
}

export function createHTTPServer<TRouter extends AnyRouter>(
  opts: CreateHTTPHandlerOptions<TRouter>,
) {
  const handler = createHTTPHandler(opts);
  const server = http.createServer((req, res) => handler(req, res));

  return {
    server,
    listen: (port?: number, hostname?: string) => {
      server.listen(port, hostname);
      const actualPort =
        port === 0 ? ((server.address() as any).port as number) : port;

      return {
        port: actualPort,
      };
    },
  };
}
