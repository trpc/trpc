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
    // Get procedure path and remove the leading slash, `/procedure -> procedure`
    // Use dummy hostname if one is not provided.
    const path = new URL(req.url!, 'http://127.0.0.1').pathname.slice(1);

    await nodeHTTPRequestHandler({
      ...opts,
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
  return http.createServer((req, res) => handler(req, res));
}
