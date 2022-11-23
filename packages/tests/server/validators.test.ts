/* eslint-disable @typescript-eslint/no-explicit-any */
import { routerToServerAndClientNew } from './___testHelpers';
import '@testing-library/jest-dom';
import { initTRPC } from '@trpc/server/src';
import { expectTypeOf } from 'expect-type';
import { z } from 'zod';

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

test('zod', async () => {
  const t = initTRPC.create();

  const router = t.router({
    num: t.procedure.input(z.number()).query(({ input }) => {
      expectTypeOf(input).toBeNumber();
      return {
        input,
      };
    }),
  });

  const { close, proxy } = routerToServerAndClientNew(router);
  const res = await proxy.num.query(123);

  await expect(proxy.num.query('123' as any)).rejects.toMatchInlineSnapshot(`
            [TRPCClientError: [
              {
                "code": "invalid_type",
                "expected": "number",
                "received": "string",
                "path": [],
                "message": "Expected number, received string"
              }
            ]]
          `);
  expect(res.input).toBe(123);
  close();
});

test('zod async', async () => {
  const t = initTRPC.create();
  const input = z.string().refine(async (value) => value === 'foo');

  const router = t.router({
    q: t.procedure.input(input).query(({ input }) => {
      expectTypeOf(input).toBeString();
      return {
        input,
      };
    }),
  });

  const { close, proxy } = routerToServerAndClientNew(router);

  await expect(proxy.q.query('bar')).rejects.toMatchInlineSnapshot(`
            [TRPCClientError: [
              {
                "code": "custom",
                "message": "Invalid input",
                "path": []
              }
            ]]
          `);
  const res = await proxy.q.query('foo');
  expect(res).toMatchInlineSnapshot(`
      Object {
        "input": "foo",
      }
    `);
  close();
});

test('zod transform mixed input/output', async () => {
  const t = initTRPC.create();
  const input = z.object({
    length: z.string().transform((s) => s.length),
  });

  const router = t.router({
    num: t.procedure.input(input).query(({ input }) => {
      expectTypeOf(input.length).toBeNumber();
      return {
        input,
      };
    }),
  });

  const { close, proxy } = routerToServerAndClientNew(router);

  await expect(proxy.num.query({ length: '123' })).resolves
    .toMatchInlineSnapshot(`
            Object {
              "input": Object {
                "length": 3,
              },
            }
          `);

  await expect(
    // @ts-expect-error this should only accept a string
    proxy.num.query({ length: 123 }),
  ).rejects.toMatchInlineSnapshot(`
            [TRPCClientError: [
              {
                "code": "invalid_type",
                "expected": "string",
                "received": "number",
                "path": [
                  "length"
                ],
                "message": "Expected string, received number"
              }
            ]]
          `);

  close();
});
