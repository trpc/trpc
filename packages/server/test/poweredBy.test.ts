import { routerToServerAndClientNew } from './___testHelpers';
import { initTRPC, router } from '../src';

test('with enabled header (default)', async () => {
  const t = initTRPC()({});

  const appRouter = t.router({ ping: t.procedure.query(() => 'pong') });
  const { httpUrl, close } = routerToServerAndClientNew(appRouter);

  const res = await fetch(`${httpUrl}/ping`);
  expect(res.headers.get('x-powered-by')?.includes('tRPC <trpc.io>')).toBe(
    true,
  );

  close();
});

test('with disabled header', async () => {
  const t = initTRPC()({ poweredByHeader: false });

  const appRouter = t.router({ ping: t.procedure.query(() => 'pong') });
  const { httpUrl, close } = routerToServerAndClientNew(appRouter);

  const res = await fetch(`${httpUrl}/ping`);
  expect(res.headers.get('x-powered-by')).toBe(null);

  close();
});

test('with merged routers', async () => {
  const t = initTRPC()({ poweredByHeader: false });

  const routerOne = t.router({ ping1: t.procedure.query(() => 'pong1') });
  const routerTwo = t.router({ ping2: t.procedure.query(() => 'pong2') });
  const appRouter = t.mergeRouters(routerOne, routerTwo);

  const { httpUrl, close } = routerToServerAndClientNew(appRouter);

  const res = await fetch(`${httpUrl}/ping`);
  expect(res.headers.get('x-powered-by')).toBe(null);

  close();
});

test('with interop router', async () => {
  const appRouter = router()
    .query('ping', { resolve: () => 'pong' })
    .interop();

  const { httpUrl, close } = routerToServerAndClientNew(appRouter);

  const res = await fetch(`${httpUrl}/ping`);
  expect(res.headers.get('x-powered-by')?.includes('tRPC <trpc.io>')).toBe(
    true,
  );

  close();
});
