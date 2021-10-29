/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import '@testing-library/jest-dom';
import { expectTypeOf } from 'expect-type';
import myzod from 'myzod';
import * as yup from 'yup';
import * as t from 'superstruct';
import { z } from 'zod';
import * as trpc from '../src';
import { routerToServerAndClient } from './_testHelpers';

test('no validator', async () => {
  const router = trpc.router().query('hello', {
    resolve() {
      return 'test';
    },
  });
  const { client, close } = routerToServerAndClient(router);
  const res = await client.query('hello');
  expect(res).toBe('test');
  close();
});

test('zod', async () => {
  const router = trpc.router().query('num', {
    input: z.number(),
    resolve({ input }) {
      return {
        input,
      };
    },
  });
  const { client, close } = routerToServerAndClient(router);
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
  close();
});

test('zod async', async () => {
  const input = z.string().refine(async (value) => value === 'foo');

  const router = trpc.router().query('q', {
    input,
    resolve({ input }) {
      return {
        input,
      };
    },
  });
  const { client, close } = routerToServerAndClient(router);

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
  close();
});

test('zod transform mixed input/output', async () => {
  const input = z.string().transform((s) => s.length);
  const router = trpc.router().query('num', {
    input: input,
    resolve({ input }) {
      return {
        input,
      };
    },
  });
  const { client, close } = routerToServerAndClient(router);
  const res = await client.query('num', 123);

  await expect(client.query('num', '123')).resolves.toMatchInlineSnapshot();

  // @ts-expect-error
  await expect(client.query('num', 123)).rejects.toMatchInlineSnapshot();

  expect(res.input).toBe(123);
  close();
});

test('superstruct', async () => {
  const router = trpc.router().query('num', {
    input: t.number(),
    resolve({ input }) {
      return {
        input,
      };
    },
  });
  const { client, close } = routerToServerAndClient(router);
  const res = await client.query('num', 123);

  await expect(client.query('num', '123' as any)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Expected a number, but received: "123"]`,
  );
  expect(res.input).toBe(123);
  close();
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
  const { client, close } = routerToServerAndClient(router);
  const res = await client.query('num', 123);

  // @ts-expect-error
  await expect(client.query('num', 'asd')).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: this must be a \`number\` type, but the final value was: \`NaN\` (cast from the value \`"asd"\`).]`,
  );
  expect(res.input).toBe(123);
  close();
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
  const { client, close } = routerToServerAndClient(router);
  const res = await client.query('num', 123);
  await expect(client.query('num', '123' as any)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: expected type to be number but got string]`,
  );
  expect(res.input).toBe(123);
  close();
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
      return {
        input,
      };
    },
  });
  const { client, close } = routerToServerAndClient(router);
  const res = await client.query('num', 123);
  await expect(client.query('num', '123' as any)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Not a number]`,
  );
  expect(res.input).toBe(123);
  close();
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
      return {
        input,
      };
    },
  });
  const { client, close } = routerToServerAndClient(router);
  const res = await client.query('num', 123);
  await expect(client.query('num', '123' as any)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Not a number]`,
  );
  expect(res.input).toBe(123);
  close();
});
