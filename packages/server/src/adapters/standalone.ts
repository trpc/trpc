/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import http from 'http';
import url from 'url';
import {
  BaseOptions,
  CreateContextFn,
  CreateContextFnOptions,
  requestHandler,
} from '../http';
import { AnyRouter } from '../router';

export type CreateHttpContextOptions = CreateContextFnOptions<
  http.IncomingMessage,
  http.ServerResponse
>;

export type CreateHttpContextFn<TContext> = CreateContextFn<
  TContext,
  http.IncomingMessage,
  http.ServerResponse
>;

export interface CreateHttpHandlerOptions<
  TRouter extends AnyRouter<TContext>,
  TContext
> extends BaseOptions {
  createContext: CreateHttpContextFn<TContext>;
  router: TRouter;
}
export function createHttpHandler<
  TContext,
  TRouter extends AnyRouter<TContext>
>(opts: CreateHttpHandlerOptions<TRouter, TContext>) {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const endpoint = url.parse(req.url!).pathname!.substr(1);
    await requestHandler({
      ...opts,
      req,
      res,
      endpoint,
    });
  };
}

export function createHttpServer<TContext, TRouter extends AnyRouter<TContext>>(
  opts: CreateHttpHandlerOptions<TRouter, TContext>,
) {
  const handler = createHttpHandler(opts);
  const server = http.createServer((req, res) => handler(req, res));

  return {
    server,
    listen(port?: number) {
      server.listen(port);
      const actualPort = (server.address() as any).port as number;

      return {
        port: actualPort,
      };
    },
  };
}
