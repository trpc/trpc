import '@testing-library/jest-dom';
import { expectTypeOf } from 'expect-type';
import myzod from 'myzod';
import * as yup from 'yup';
import * as t from 'superstruct';
import { z } from 'zod';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';

test('zod', async () => {
  const router = trpc.router().query('q', {
    input: z.string().or(z.number()),
    output: z.object({
      input: z.string(),
    }),
    resolve({ input }) {
      return { input: input as string };
    },
  });
  const { client, close } = routerToServerAndClient(router);

  const output = await client.query('q', 'foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);
  await expect(client.query('q', 1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  close();
});

test('zod async', async () => {
  const router = trpc.router().query('q', {
    input: z.string().or(z.number()),
    output: z
      .object({
        input: z.string(),
      })
      .refine(async (value) => !!value),
    resolve({ input }) {
      return { input: input as string };
    },
  });
  const { client, close } = routerToServerAndClient(router);

  const output = await client.query('q', 'foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);
  await expect(client.query('q', 1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  close();
});

test('zod transform', async () => {
  const router = trpc.router().query('q', {
    input: z.string().or(z.number()),
    output: z.object({
      input: z.string().transform((s) => s.length),
    }),
    resolve({ input }) {
      return { input: input as string };
    },
  });
  const { client, close } = routerToServerAndClient(router);

  const output = await client.query('q', 'foobar');
  expectTypeOf(output.input).toBeNumber();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": 6,
    }
  `);
  await expect(client.query('q', 1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  close();
});

test('superstruct', async () => {
  const router = trpc.router().query('q', {
    input: t.union([t.string(), t.number()]),
    output: t.object({
      input: t.string(),
    }),
    resolve({ input }) {
      return { input: input as string };
    },
  });
  const { client, close } = routerToServerAndClient(router);

  const output = await client.query('q', 'foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);
  await expect(client.query('q', 1234)).rejects.toMatchInlineSnapshot(
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

  const router = trpc.router().query('q', {
    input: yup.lazy(yupStringOrNumber),
    output: yup.object({
      input: yup.string().strict().required(),
    }),
    resolve({ input }) {
      return { input: input as string };
    },
  });
  const { client, close } = routerToServerAndClient(router);

  const output = await client.query('q', 'foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);
  await expect(client.query('q', 1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  close();
});

test('myzod', async () => {
  const router = trpc.router().query('q', {
    input: myzod.string().or(myzod.number()),
    output: myzod.object({
      input: myzod.string(),
    }),
    resolve({ input }) {
      return { input: input as string };
    },
  });
  const { client, close } = routerToServerAndClient(router);

  const output = await client.query('q', 'foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);
  await expect(client.query('q', 1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  close();
});

test('validator fn', async () => {
  const router = trpc.router().query('q', {
    input: (value: unknown) => value as string | number,
    output: (value: unknown) => {
      if (typeof (value as any).input === 'string') {
        return value as { input: string };
      }
      throw new Error('Fail');
    },
    resolve({ input }) {
      return { input: input as string };
    },
  });
  const { client, close } = routerToServerAndClient(router);

  const output = await client.query('q', 'foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);
  await expect(client.query('q', 1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  close();
});

test('async validator fn', async () => {
  const router = trpc.router().query('q', {
    input: (value: unknown) => value as string | number,
    output: async (value: unknown): Promise<{ input: string }> => {
      if (typeof (value as any).input === 'string') {
        return value as any;
      }
      throw new Error('Fail');
    },
    resolve({ input }) {
      return { input: input as string };
    },
  });
  const { client, close } = routerToServerAndClient(router);

  const output = await client.query('q', 'foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);
  await expect(client.query('q', 1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  close();
});
