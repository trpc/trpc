/* eslint-disable @typescript-eslint/no-non-null-assertion */
import http from 'http';
import { AnyRouter } from '../core';
import {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPHandlerOptions,
  nodeHTTPRequestHandler,
} from './node-http';

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
    // if no hostname, set a dummy one
    const href = req.url!.startsWith('/')
      ? `http://127.0.0.1${req.url}`
      : req.url!;

    // get procedure path and remove the leading slash
    // /procedure -> procedure
    const path = new URL(href).pathname.slice(1);

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
