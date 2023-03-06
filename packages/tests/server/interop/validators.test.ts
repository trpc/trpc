import { legacyRouterToServerAndClient } from './__legacyRouterToServerAndClient';
import * as trpc from '@trpc/server/src';
import { expectTypeOf } from 'expect-type';
import myzod from 'myzod';
import * as t from 'superstruct';
import * as yup from 'yup';
import { z } from 'zod';

test('no validator', async () => {
  const router = trpc.router().query('hello', {
    resolve({ input }) {
      expectTypeOf(input).toBeUndefined();
      return 'test';
    },
  });
  const { client, close } = legacyRouterToServerAndClient(router);
  const res = await client.query('hello');
  expect(res).toBe('test');
  await close();
});

test('zod', async () => {
  const router = trpc.router().query('num', {
    input: z.number(),
    resolve({ input }) {
      expectTypeOf(input).toBeNumber();
      return {
        input,
      };
    },
  });
  const { client, close } = legacyRouterToServerAndClient(router);
  const res = await client.query('num', 123);

  await expect(client.query('num', '123' as any)).rejects
    .toMatchInlineSnapshot(`
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
  await close();
});

test('zod async', async () => {
  const input = z.string().refine(async (value) => value === 'foo');

  const router = trpc.router().query('q', {
    input,
    resolve({ input }) {
      expectTypeOf(input).toBeString();
      return {
        input,
      };
    },
  });
  const { client, close } = legacyRouterToServerAndClient(router);

  await expect(client.query('q', 'bar')).rejects.toMatchInlineSnapshot(`
          [TRPCClientError: [
            {
              "code": "custom",
              "message": "Invalid input",
              "path": []
            }
          ]]
        `);
  const res = await client.query('q', 'foo');
  expect(res).toMatchInlineSnapshot(`
    Object {
      "input": "foo",
    }
  `);
  await close();
});

test('zod transform mixed input/output', async () => {
  const input = z.object({
    length: z.string().transform((s) => s.length),
  });

  const router = trpc.router().query('num', {
    input: input,
    resolve({ input }) {
      expectTypeOf(input.length).toBeNumber();
      return {
        input,
      };
    },
  });
  const { client, close } = legacyRouterToServerAndClient(router);

  await expect(client.query('num', { length: '123' })).resolves
    .toMatchInlineSnapshot(`
          Object {
            "input": Object {
              "length": 3,
            },
          }
        `);

  await expect(
    // @ts-expect-error this should only accept a string
    client.query('num', { length: 123 }),
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

  await close();
});

test('superstruct', async () => {
  const router = trpc.router().query('num', {
    input: t.number(),
    resolve({ input }) {
      expectTypeOf(input).toBeNumber();
      return {
        input,
      };
    },
  });
  const { client, close } = legacyRouterToServerAndClient(router);
  const res = await client.query('num', 123);

  // @ts-expect-error this only accepts a `number`
  await expect(client.query('num', '123')).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Expected a number, but received: "123"]`,
  );
  expect(res.input).toBe(123);
  await close();
});

test('yup', async () => {
  const router = trpc.router().query('num', {
    input: yup.number().required(),
    resolve({ input }) {
      expectTypeOf(input).toMatchTypeOf<number>();
      return {
        input,
      };
    },
  });
  const { client, close } = legacyRouterToServerAndClient(router);
  const res = await client.query('num', 123);

  // @ts-expect-error this only accepts a `number`
  await expect(client.query('num', 'asd')).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: this must be a \`number\` type, but the final value was: \`NaN\` (cast from the value \`"asd"\`).]`,
  );
  expect(res.input).toBe(123);
  await close();
});

test('myzod', async () => {
  const router = trpc.router().query('num', {
    input: myzod.number(),
    resolve({ input }) {
      expectTypeOf(input).toMatchTypeOf<number>();
      return {
        input,
      };
    },
  });
  const { client, close } = legacyRouterToServerAndClient(router);
  const res = await client.query('num', 123);
  await expect(client.query('num', '123' as any)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: expected type to be number but got string]`,
  );
  expect(res.input).toBe(123);
  await close();
});

test('validator fn', async () => {
  function numParser(input: unknown) {
    if (typeof input !== 'number') {
      throw new Error('Not a number');
    }
    return input;
  }
  const router = trpc.router().query('num', {
    input: numParser,
    resolve({ input }) {
      expectTypeOf(input).toBeNumber();
      return {
        input,
      };
    },
  });
  const { client, close } = legacyRouterToServerAndClient(router);
  const res = await client.query('num', 123);
  await expect(client.query('num', '123' as any)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Not a number]`,
  );
  expect(res.input).toBe(123);
  await close();
});

test('async validator fn', async () => {
  async function numParser(input: unknown) {
    if (typeof input !== 'number') {
      throw new Error('Not a number');
    }
    return input;
  }
  const router = trpc.router().query('num', {
    input: numParser,
    resolve({ input }) {
      expectTypeOf(input).toBeNumber();
      return {
        input,
      };
    },
  });
  const { client, close } = legacyRouterToServerAndClient(router);
  const res = await client.query('num', 123);
  await expect(client.query('num', '123' as any)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Not a number]`,
  );
  expect(res.input).toBe(123);
  await close();
});
