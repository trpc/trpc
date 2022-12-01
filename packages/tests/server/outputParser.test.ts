import { routerToServerAndClientNew } from './___testHelpers';
import '@testing-library/jest-dom';
import { initTRPC } from '@trpc/server/src';
import { expectTypeOf } from 'expect-type';
import * as iots from 'io-ts';
import myzod from 'myzod';
import * as t from 'superstruct';
import * as yup from 'yup';
import { z } from 'zod';

test('zod', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(z.string().or(z.number()))
      .output(
        z.object({
          input: z.string(),
        }),
      )
      .query(({ input }) => {
        return { input: input as string };
      }),
  });
  const { proxy, close } = routerToServerAndClientNew(router);

  const output = await proxy.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(proxy.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  close();
});

test('zod async', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(z.string().or(z.number()))
      .output(
        z
          .object({
            input: z.string(),
          })
          .refine(async (value) => !!value),
      )
      .query(({ input }) => {
        return { input: input as string };
      }),
  });

  const { proxy, close } = routerToServerAndClientNew(router);

  const output = await proxy.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(proxy.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  close();
});

test('zod transform', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(z.string().or(z.number()))
      .output(
        z.object({
          input: z.string().transform((s) => s.length),
        }),
      )
      .query(({ input }) => {
        return { input: input as string };
      }),
  });

  const { proxy, close } = routerToServerAndClientNew(router);

  const output = await proxy.q.query('foobar');
  expectTypeOf(output.input).toBeNumber();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": 6,
    }
  `);

  await expect(proxy.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  close();
});

test('superstruct', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(t.union([t.string(), t.number()]))
      .output(
        t.object({
          input: t.string(),
        }),
      )
      .query(({ input }) => {
        return { input: input as string };
      }),
  });

  const { proxy, close } = routerToServerAndClientNew(router);

  const output = await proxy.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(proxy.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  close();
});

test('yup', async () => {
  const yupStringOrNumber = (value: unknown) => {
    switch (typeof value) {
      case 'number':
        return yup.number().required();
      case 'string':
        return yup.string().required();
      default:
        throw new Error('Fail');
    }
  };

  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(yup.lazy(yupStringOrNumber))
      .output(
        yup.object({
          input: yup.string().strict().required(),
        }),
      )
      .query(({ input }) => {
        return { input: input as string };
      }),
  });

  const { proxy, close } = routerToServerAndClientNew(router);

  const output = await proxy.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(proxy.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  close();
});

test('myzod', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(myzod.string().or(myzod.number()))
      .output(
        myzod.object({
          input: myzod.string(),
        }),
      )
      .query(({ input }) => {
        return { input: input as string };
      }),
  });

  const { proxy, close } = routerToServerAndClientNew(router);

  const output = await proxy.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(proxy.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  close();
});

test('validator fn', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input((value: unknown) => value as string | number)
      .output((value: unknown) => {
        if (typeof (value as any).input === 'string') {
          return value as { input: string };
        }
        throw new Error('Fail');
      })
      .query(({ input }) => {
        return { input: input as string };
      }),
  });

  const { proxy, close } = routerToServerAndClientNew(router);

  const output = await proxy.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(proxy.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  close();
});

test('async validator fn', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input((value: unknown) => value as string | number)
      .output(async (value: any): Promise<{ input: string }> => {
        if (value && typeof value.input === 'string') {
          return { input: value.input };
        }
        throw new Error('Fail');
      })
      .query(({ input }) => {
        return { input: input as string };
      }),
  });

  const { proxy, close } = routerToServerAndClientNew(router);

  const output = await proxy.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(proxy.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  close();
});

test('iots', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(iots.union([iots.string, iots.number]))
      .output(
        iots.type({
          input: iots.string,
        }),
      )
      .query(({ input }) => {
        return { input: input };
      }),
  });

  const { proxy, close } = routerToServerAndClientNew(router);

  const output = await proxy.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(proxy.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  close();
});
