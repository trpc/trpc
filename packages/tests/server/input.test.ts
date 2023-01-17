import { routerToServerAndClientNew, waitError } from './___testHelpers';
import { TRPCClientError, createTRPCProxyClient } from '@trpc/client';
import {
  inferProcedureInput,
  inferProcedureParams,
  initTRPC,
} from '@trpc/server';
import { UnsetMarker } from '@trpc/server/core/internals/utils';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import { ZodError, z } from 'zod';

const ignoreErrors = async (fn: () => Promise<unknown> | unknown) => {
  try {
    await fn();
  } catch {
    // ignore
  }
};

describe('double input validator', () => {
  const t = initTRPC.create({
    errorFormatter({ shape, error }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          zod: error.cause instanceof ZodError ? error.cause.flatten() : null,
        },
      };
    },
  });
  const roomProcedure = t.procedure.input(
    z.object({
      roomId: z.string(),
    }),
  );
  const appRouter = t.router({
    sendMessage: roomProcedure
      .input(
        z.object({
          text: z.string(),
          optionalKey: z.string().optional(),
        }),
      )
      .mutation(({ input }) => {
        return input;
      }),

    sendMessage2: roomProcedure
      .input(
        z.object({
          text: z.string(),
        }),
      )
      .mutation(({ input }) => {
        //         ^?
        input.roomId;
        input.text;
        return input;
      }),
  });
  type AppRouter = typeof appRouter;
  const ctx = konn()
    .beforeEach(() => {
      const opts = routerToServerAndClientNew(appRouter);

      return opts;
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('happy path', async () => {
    type Input = inferProcedureInput<AppRouter['sendMessage']>;
    const data: Input = {
      roomId: '123',
      text: 'hello',
    };
    const result = await ctx.proxy.sendMessage.mutate(data);

    expect(result).toEqual(data);
    expectTypeOf(result).toMatchTypeOf(data);
  });

  test('sad path', async () => {
    type Input = inferProcedureInput<AppRouter['sendMessage']>;
    {
      // @ts-expect-error missing input params
      const input: Input = {
        roomId: '',
      };
      const error = await waitError<TRPCClientError<AppRouter>>(
        ctx.proxy.sendMessage.mutate(input),
        TRPCClientError,
      );
      expect(error.data).toHaveProperty('zod');
      expect(error.data!.zod!.fieldErrors).toMatchInlineSnapshot(`
        Object {
          "text": Array [
            "Required",
          ],
        }
      `);
    }
    {
      // @ts-expect-error missing input params
      const input: Input = {
        text: '',
      };

      const error = await waitError<TRPCClientError<AppRouter>>(
        ctx.proxy.sendMessage.mutate(input),
        TRPCClientError,
      );
      expect(error.data!.zod!.fieldErrors).toMatchInlineSnapshot(`
        Object {
          "roomId": Array [
            "Required",
          ],
        }
      `);
    }
  });
});

test('only allow double input validator for object-like inputs', () => {
  const t = initTRPC.create();

  try {
    t.procedure.input(z.literal('hello')).input(
      // @ts-expect-error first one wasn't an object-like thingy
      z.object({
        foo: z.string(),
      }),
    );
  } catch {
    // whatever
  }
  try {
    t.procedure
      .input(
        z.object({
          foo: z.string(),
        }),
      )
      .input(
        // @ts-expect-error second one wasn't an object-like thingy
        z.literal('bar'),
      );
  } catch {
    // whatever
  }
});

test('no input', async () => {
  const t = initTRPC.create();

  const proc = t.procedure.query(({ input }) => {
    expectTypeOf(input).toBeUndefined();
    expect(input).toBeUndefined();
    return input;
  });

  type ProcType = inferProcedureParams<typeof proc>;

  expectTypeOf<ProcType['_input_in']>().toEqualTypeOf<UnsetMarker>();
  expectTypeOf<ProcType['_input_out']>().toEqualTypeOf<UnsetMarker>();
  expectTypeOf<ProcType['_output_in']>().toBeUndefined();
  expectTypeOf<ProcType['_output_out']>().toBeUndefined();

  const router = t.router({
    proc,
  });

  const opts = routerToServerAndClientNew(router);

  await expect(opts.proxy.proc.query()).resolves.toBeUndefined();

  await opts.close();
});

test('zod default() string', async () => {
  const t = initTRPC.create();

  const proc = t.procedure
    .input(z.string().default('bar'))
    .query(({ input }) => {
      expectTypeOf(input).toBeString();
      return input;
    });

  type ProcType = inferProcedureParams<typeof proc>;

  expectTypeOf<ProcType['_input_in']>().toEqualTypeOf<string | undefined>();
  expectTypeOf<ProcType['_input_out']>().toEqualTypeOf<string>();

  const router = t.router({
    proc,
  });

  const opts = routerToServerAndClientNew(router);

  await expect(opts.proxy.proc.query()).resolves.toBe('bar');
  await expect(opts.proxy.proc.query('hello')).resolves.toBe('hello');

  await opts.close();
});

test('zod default() required object', async () => {
  const t = initTRPC.create();

  const proc = t.procedure
    .input(
      z.object({
        foo: z.string().optional().default('foo'),
      }),
    )
    .query(({ input }) => {
      expectTypeOf(input).toBeObject();
      return input;
    });

  type ProcType = inferProcedureParams<typeof proc>;

  expectTypeOf<ProcType['_input_in']>().toEqualTypeOf<{ foo?: string }>();
  expectTypeOf<ProcType['_input_out']>().toEqualTypeOf<{ foo: string }>();

  const router = t.router({
    proc,
  });

  const opts = routerToServerAndClientNew(router);

  await expect(opts.proxy.proc.query({ foo: 'bar' })).resolves.toEqual({
    foo: 'bar',
  });
  await expect(opts.proxy.proc.query({})).resolves.toEqual({ foo: 'foo' });

  await opts.close();
});

test('zod default() mixed default object', async () => {
  const t = initTRPC.create();

  const proc = t.procedure
    .input(
      z
        .object({
          foo: z.string(),
          bar: z.string().optional().default('barFoo'),
        })
        .optional()
        .default({ foo: 'fooBar' }),
    )
    .query(({ input }) => {
      expectTypeOf(input).toBeObject();
      return input;
    });

  type ProcType = inferProcedureParams<typeof proc>;

  expectTypeOf<ProcType['_input_in']>().toEqualTypeOf<
    { foo: string; bar?: string } | undefined
  >();
  expectTypeOf<ProcType['_input_out']>().toEqualTypeOf<{
    foo: string;
    bar: string;
  }>();

  const router = t.router({
    proc,
  });

  const opts = routerToServerAndClientNew(router);

  await expect(
    opts.proxy.proc.query({ foo: 'bar', bar: 'foo' }),
  ).resolves.toEqual({ foo: 'bar', bar: 'foo' });
  await expect(opts.proxy.proc.query({ foo: 'fooFoo' })).resolves.toEqual({
    foo: 'fooFoo',
    bar: 'barFoo',
  });
  await expect(opts.proxy.proc.query({ foo: 'bar' })).resolves.toEqual({
    foo: 'bar',
    bar: 'barFoo',
  });
  await expect(opts.proxy.proc.query(undefined)).resolves.toEqual({
    foo: 'fooBar',
    bar: 'barFoo',
  });

  await opts.close();
});

test('zod default() defaults within object', async () => {
  const t = initTRPC.create();

  const proc = t.procedure
    .input(
      z
        .object({
          foo: z.string().optional().default('defaultFoo'),
          bar: z.string().optional().default('defaultBar'),
        })
        .optional()
        .default({}),
    )
    .query(({ input }) => {
      expectTypeOf(input).toBeObject();
      return input;
    });

  type ProcType = inferProcedureParams<typeof proc>;

  expectTypeOf<ProcType['_input_in']>().toEqualTypeOf<
    { foo?: string; bar?: string } | undefined
  >();
  expectTypeOf<ProcType['_input_out']>().toEqualTypeOf<{
    foo: string;
    bar: string;
  }>();

  const router = t.router({
    proc,
  });

  const opts = routerToServerAndClientNew(router);

  await expect(
    opts.proxy.proc.query({ foo: 'bar', bar: 'foo' }),
  ).resolves.toEqual({ foo: 'bar', bar: 'foo' });
  await expect(opts.proxy.proc.query(undefined)).resolves.toEqual({
    foo: 'defaultFoo',
    bar: 'defaultBar',
  });

  await opts.close();
});

test('double validators with undefined', async () => {
  const t = initTRPC.create();

  {
    const roomProcedure = t.procedure.input(
      z.object({
        roomId: z.string(),
      }),
    );
    const proc = roomProcedure
      .input(
        z.object({
          optionalKey: z.string().optional(),
        }),
      )
      .mutation(({ input }) => {
        return input;
      });
    type Input = inferProcedureInput<typeof proc>;
    //    ^?

    const router = t.router({
      proc,
    });
    const client = createTRPCProxyClient<typeof router>({
      links: [],
    });

    await ignoreErrors(() =>
      client.proc.mutate({
        roomId: 'foo',
      }),
    );
  }

  {
    const roomProcedure = t.procedure.input(
      z.object({
        roomId: z.string().optional(),
      }),
    );
    const proc = roomProcedure
      .input(
        z.object({
          key: z.string(),
        }),
      )
      .mutation(({ input }) => {
        return input;
      });
    type Input = inferProcedureInput<typeof proc>;
    //    ^?

    const router = t.router({
      proc,
    });
    const client = createTRPCProxyClient<typeof router>({
      links: [],
    });

    await ignoreErrors(() =>
      client.proc.mutate({
        key: 'string',
      }),
    );
  }
});

test('merges optional with required property', async () => {
  const t = initTRPC.create();

  const router = t.router({
    proc: t.procedure
      .input(
        z.object({
          id: z.string(),
        }),
      )
      .input(
        z.object({
          id: z.string().optional(),
        }),
      )
      .query(() => 'hi'),
  });

  const client = createTRPCProxyClient<typeof router>({
    links: [],
  });

  await ignoreErrors(async () => {
    // @ts-expect-error id is not optional
    await client.proc.query({});
    await client.proc.query({ id: 'foo' });
  });
});
