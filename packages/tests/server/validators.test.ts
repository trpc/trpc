/* eslint-disable @typescript-eslint/no-explicit-any */
import { routerToServerAndClientNew } from './___testHelpers';
import '@testing-library/jest-dom';
import { initTRPC } from '@trpc/server/src';
import { expectTypeOf } from 'expect-type';

test('no validator', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(({ input }) => {
      expectTypeOf(input).toBeSymbol();
      return 'test';
    }),
  });

  const { close, proxy } = routerToServerAndClientNew(router);
  const res = await proxy.hello.query();
  expect(res).toBe('test');
  close();
});
