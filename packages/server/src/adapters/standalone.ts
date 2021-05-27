/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-explicit-any */
import http from 'http';
import url from 'url';
import { BaseOptions, CreateContextFn, CreateContextFnOptions } from '../http';
import { requestHandler } from '../http';
import { AnyRouter } from '../router';

export type CreateHttpContextOptions = CreateContextFnOptions<
  http.IncomingMessage,
  http.ServerResponse
>;

export type CreateHttpContextFn<TRouter extends AnyRouter> = CreateContextFn<
  TRouter,
  http.IncomingMessage,
  http.ServerResponse
>;

export interface CreateHttpHandlerOptions<TRouter extends AnyRouter>
  extends BaseOptions<TRouter, http.IncomingMessage> {
  createContext: CreateHttpContextFn<TRouter>;
  router: TRouter;
}
export function createHttpHandler<TRouter extends AnyRouter>(
  opts: CreateHttpHandlerOptions<TRouter>,
) {
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const endpoint = url.parse(req.url!).pathname!.substr(1);
    await requestHandler({
      ...opts,
      req,
      res,
      path: endpoint,
    });
  };
}

export function createHttpServer<TRouter extends AnyRouter>(
  opts: CreateHttpHandlerOptions<TRouter>,
) {
  const handler = createHttpHandler(opts);
  const server = http.createServer((req, res) => handler(req, res));

  return {
    server,
    listen(port?: number) {
      server.listen(port);
      const actualPort =
        port === 0 ? ((server.address() as any).port as number) : port;

      return {
        port: actualPort,
      };
    },
  };
}
