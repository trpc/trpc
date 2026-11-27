// @vitest-environment node
import http from 'http';
import type { AddressInfo } from 'net';
import { initTRPC } from '@trpc/server';
import * as trpcExpress from '@trpc/server/adapters/express';
import { createHTTPServer } from '@trpc/server/adapters/standalone';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import';
import express from 'express';

// A middleware or a procedure can set cookies on `res` before tRPC answers.
// The cookies `responseMeta` returns must be added to them, not replace them.

function responseMeta() {
  return { headers: new Headers([['set-cookie', 'fromResponseMeta=1']]) };
}

async function listen(server: http.Server) {
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;

  return makeAsyncResource({ url: `http://localhost:${port}` }, () => {
    return new Promise<void>((resolve, reject) =>
      server.close((err) => {
        err ? reject(err) : resolve();
      }),
    );
  });
}

test('the standalone adapter keeps the cookies set before responseMeta', async () => {
  const t = initTRPC.context<{ res: http.ServerResponse }>().create();
  const router = t.router({
    hello: t.procedure.query((opts) => {
      opts.ctx.res.appendHeader('set-cookie', 'fromProcedure=1');
      return 'world';
    }),
  });

  await using $ = await listen(
    createHTTPServer({
      router,
      createContext: (opts) => ({ res: opts.res }),
      middleware: (_req, res, next) => {
        res.setHeader('set-cookie', 'fromMiddleware=1');
        next();
      },
      responseMeta,
    }),
  );

  const res = await fetch(`${$.url}/hello`);

  expect(res.status).toBe(200);
  expect(res.headers.getSetCookie()).toEqual([
    'fromMiddleware=1',
    'fromProcedure=1',
    'fromResponseMeta=1',
  ]);
});

test('the Express adapter keeps the cookies set before responseMeta', async () => {
  const t = initTRPC.context<{ res: express.Response }>().create();
  const router = t.router({
    hello: t.procedure.query((opts) => {
      opts.ctx.res.cookie('fromProcedure', '1');
      return 'world';
    }),
  });

  const app = express();
  app.use((_req, res, next) => {
    res.cookie('fromMiddleware', '1');
    next();
  });
  app.use(
    trpcExpress.createExpressMiddleware({
      router,
      createContext: (opts) => ({ res: opts.res }),
      responseMeta,
    }),
  );

  await using $ = await listen(http.createServer(app));

  const res = await fetch(`${$.url}/hello`);

  expect(res.status).toBe(200);
  expect(res.headers.getSetCookie()).toEqual([
    'fromMiddleware=1; Path=/',
    'fromProcedure=1; Path=/',
    'fromResponseMeta=1',
  ]);
});
