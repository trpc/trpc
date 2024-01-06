import { routerToServerAndClientNew, waitMs } from '../___testHelpers';
import { httpBatchLink, httpLink } from '@trpc/client';
import { AbortControllerEsque } from '@trpc/client/internals/types';
import { initTRPC } from '@trpc/server/core';

const t = initTRPC.create();

const router = t.router({
  q: t.procedure.query(() => {
    throw 'hello';
  }),
});

function abortControllerSpy() {
  const abortSpy = vi.fn();
  const instanceSpy = vi.fn();
  const AC = function AbortControllerSpy() {
    instanceSpy();
    const ac = new AbortController();

    ac.abort = abortSpy;

    return ac;
  } as unknown as AbortControllerEsque;
  return {
    AC,
    abortSpy,
    instanceSpy,
  };
}

test('httpLink', async () => {
  const spy = abortControllerSpy();
  const { close, client } = routerToServerAndClientNew(router, {
    client({ httpUrl }) {
      return {
        links: [httpLink({ url: httpUrl, AbortController: spy.AC })],
      };
    },
  });

  await client.q.query(undefined).catch(() => {
    /// ..
  });

  expect(spy.instanceSpy).toHaveBeenCalledTimes(1);
  expect(spy.abortSpy).toHaveBeenCalledTimes(0);

  await close();
});

test('httpBatchLink', async () => {
  const spy = abortControllerSpy();
  const { close, client } = routerToServerAndClientNew(router, {
    client({ httpUrl }) {
      return {
        links: [httpBatchLink({ url: httpUrl, AbortController: spy.AC })],
      };
    },
  });

  await client.q.query(undefined).catch(() => {
    /// ..
  });

  expect(spy.instanceSpy).toHaveBeenCalledTimes(1);
  expect(spy.abortSpy).toHaveBeenCalledTimes(0);

  await close();
});
