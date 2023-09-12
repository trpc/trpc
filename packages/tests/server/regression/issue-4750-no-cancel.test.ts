import { routerToServerAndClientNew, waitMs } from '../___testHelpers';
import { httpBatchLink, httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server/src/core';

const t = initTRPC.create();

const router = t.router({
  q: t.procedure.query(() => {
    throw 'hello';
  }),
});

test('httpLink', async () => {
  const abortController = new AbortController();

  const { close, proxy } = routerToServerAndClientNew(router, {
    client({ httpUrl }) {
      return {
        links: [httpLink({ url: httpUrl })],
      };
    },
  });

  await proxy.q
    .query(undefined, {
      signal: abortController.signal,
    })
    .catch(() => {
      /// ..
    });

  expect(abortController.signal.aborted).toBe(false);

  await close();
});

test('httpBatchLink', async () => {
  const abortController = new AbortController();

  const { close, proxy } = routerToServerAndClientNew(router, {
    client({ httpUrl }) {
      return {
        links: [httpBatchLink({ url: httpUrl })],
      };
    },
  });

  await proxy.q
    .query(undefined, {
      signal: abortController.signal,
    })
    .catch(() => {
      /// ..
    });

  expect(abortController.signal.aborted).toBe(false);
  await close();
});
