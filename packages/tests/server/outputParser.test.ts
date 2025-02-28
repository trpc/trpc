import { routerToServerAndClientNew } from './___testHelpers';
import { initTRPC } from '@trpc/server';
import myzod from 'myzod';
import * as t from 'superstruct';
import * as v0 from 'valibot0';
import * as v1 from 'valibot1';
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
      // @ts-expect-error mismatch between input and output
      .query((opts) => {
        return { input: opts.input };
      }),
  });
  const { client, close } = routerToServerAndClientNew(router);

  const output = await client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  await close();
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

  const { client, close } = routerToServerAndClientNew(router);

  const output = await client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  await close();
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

  const { client, close } = routerToServerAndClientNew(router);

  const output = await client.q.query('foobar');
  expectTypeOf(output.input).toBeNumber();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": 6,
    }
  `);

  await expect(client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  await close();
});

test('valibot v0', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(v0.parser(v0.union([v0.string(), v0.number()])))
      .output(v0.parser(v0.object({ input: v0.string() })))
      .query(({ input }) => {
        return { input: input as string };
      }),
  });
  const { client, close } = routerToServerAndClientNew(router);

  const output = await client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  await close();
});

test('valibot v0 async', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(v0.parserAsync(v0.unionAsync([v0.string(), v0.number()])))
      .output(
        v0.parserAsync(
          v0.pipeAsync(
            v0.objectAsync({ input: v0.string() }),
            v0.checkAsync(async (value) => !!value),
          ),
        ),
      )
      .query(({ input }) => {
        return { input: input as string };
      }),
  });

  const { client, close } = routerToServerAndClientNew(router);

  const output = await client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  await close();
});

test('valibot v0 transform', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(v0.parser(v0.union([v0.string(), v0.number()])))
      .output(
        v0.parser(
          v0.object({
            input: v0.pipe(
              v0.string(),
              v0.transform((s) => s.length),
            ),
          }),
        ),
      )
      .query(({ input }) => {
        return { input: input as string };
      }),
  });

  const { client, close } = routerToServerAndClientNew(router);

  const output = await client.q.query('foobar');
  expectTypeOf(output.input).toBeNumber();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": 6,
    }
  `);

  await expect(client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  await close();
});

test('valibot v1', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(v1.union([v1.string(), v1.number()]))
      .output(v1.object({ input: v1.string() }))
      .query(({ input }) => {
        return { input: input as string };
      }),
  });
  const { client, close } = routerToServerAndClientNew(router);

  const output = await client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  await close();
});

test('valibot v1 async', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(v1.parserAsync(v1.unionAsync([v1.string(), v1.number()])))
      .output(
        v1.parserAsync(
          v1.pipeAsync(
            v1.objectAsync({ input: v1.string() }),
            v1.checkAsync(async (value) => !!value),
          ),
        ),
      )
      .query(({ input }) => {
        return { input: input as string };
      }),
  });

  const { client, close } = routerToServerAndClientNew(router);

  const output = await client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  await close();
});

test('valibot v1 transform', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(v1.union([v1.string(), v1.number()]))
      .output(
        v1.object({
          input: v1.pipe(
            v1.string(),
            v1.transform((s) => s.length),
          ),
        }),
      )
      .query(({ input }) => {
        return { input: input as string };
      }),
  });

  const { client, close } = routerToServerAndClientNew(router);

  const output = await client.q.query('foobar');
  expectTypeOf(output.input).toBeNumber();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": 6,
    }
  `);

  await expect(client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  await close();
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

  const { client, close } = routerToServerAndClientNew(router);

  const output = await client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  await close();
});

test('yup', async () => {
  const yupStringOrNumber = (value: unknown) => {
    switch (typeof value) {
      case 'number':
        return yup.number().required();
      case 'string':
        return yup.string().required();
      case 'bigint': {
        throw new Error('Not implemented yet: "bigint" case');
      }
      case 'boolean': {
        throw new Error('Not implemented yet: "boolean" case');
      }
      case 'symbol': {
        throw new Error('Not implemented yet: "symbol" case');
      }
      case 'undefined': {
        throw new Error('Not implemented yet: "undefined" case');
      }
      case 'object': {
        throw new Error('Not implemented yet: "object" case');
      }
      case 'function': {
        throw new Error('Not implemented yet: "function" case');
      }
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

  const { client, close } = routerToServerAndClientNew(router);

  const output = await client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  await close();
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

  const { client, close } = routerToServerAndClientNew(router);

  const output = await client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  await close();
});

test('validator fn', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input((value: unknown) => value as number | string)
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

  const { client, close } = routerToServerAndClientNew(router);

  const output = await client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  await close();
});

test('async validator fn', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input((value: unknown) => value as number | string)
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

  const { client, close } = routerToServerAndClientNew(router);

  const output = await client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );

  await close();
});
