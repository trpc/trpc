import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { TRPCClientError } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import myzod from 'myzod';
import * as t from 'superstruct';
import * as S from 'sury';
import * as v from 'valibot';
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
  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(ctx.client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );
});

test('multiple output parsers can be composed', async () => {
  const trpc = initTRPC.create();
  const pluginProc = trpc.procedure.output(
    z.object({
      additional: z.string(),
    }),
  );

  const router = trpc.router({
    q: trpc.procedure
      .unstable_concat(pluginProc)
      .output(
        z.object({
          regular: z.literal('output'),
        }),
      )
      .query(() => ({
        additional: 'context',
        regular: 'output',
      })),
  });

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query();
  expectTypeOf(output).toEqualTypeOf<{
    additional: string;
    regular: 'output';
  }>();
  expect(output).toEqual({
    additional: 'context',
    regular: 'output',
  });
});

test('output parsers keep middleware order and later outputs win conflicts', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .output(
        z.object({
          first: z.string(),
          shared: z.string().transform(() => 'middleware' as const),
        }),
      )
      .use(async ({ next }) => {
        const result = await next();
        if (!result.ok) {
          return result;
        }
        return {
          ...result,
          data: {
            ...(result.data as Record<string, unknown>),
            shared: 'changed by middleware',
          },
        };
      })
      .output(
        z.object({
          first: z.string(),
          second: z.string(),
          shared: z.literal('original').transform(() => 'original' as const),
        }),
      )
      .query(() => ({
        first: 'first',
        second: 'second',
        shared: 'original',
      })),
  });

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query();
  expectTypeOf(output).toEqualTypeOf<{
    first: string;
    second: string;
    shared: 'original';
  }>();
  expect(output).toEqual({
    first: 'first',
    second: 'second',
    shared: 'original',
  });
});

test('output parser errors retain their formatter scope', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .output(z.object({ first: z.string() }))
      .errors((opts) => ({
        ...opts.shape,
        data: { ...opts.shape.data, formatted: true },
      }))
      .output(z.object({ second: z.string() }))
      .query(
        () =>
          ({ first: 'first' }) as unknown as {
            first: string;
            second: string;
          },
      ),
  });

  await using ctx = testServerAndClientResource(router);
  const error = await waitError(ctx.client.q.query(), TRPCClientError);

  expect(error.data).toMatchObject({ formatted: true });
});

test('output parser composition enforces object outputs', () => {
  const trpc = initTRPC.create();
  const objectProcedure = trpc.procedure.output(
    z.object({ value: z.string() }),
  );

  // @ts-expect-error output parser composition requires object-like outputs
  trpc.procedure.output(z.string()).concat(trpc.procedure.output(z.number()));
  // @ts-expect-error output parser composition requires object-like outputs
  trpc.procedure.output(z.string()).concat(objectProcedure);

  const optionalProcedure = trpc.procedure.output(
    z.object({ optional: z.string() }).optional(),
  );
  optionalProcedure.output(z.object({ required: z.string() }));
  // @ts-expect-error cannot chain an optional parser to a required parser
  objectProcedure.output(z.object({ optional: z.string() }).optional());
});

test('later optional output parsers can return undefined', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .output(z.object({ first: z.string() }).optional())
      .output((_value: unknown): { second: string } | undefined => undefined)
      .query(
        () =>
          ({ first: 'first' }) as unknown as {
            first: string;
            second: string;
          },
      ),
  });

  await using ctx = testServerAndClientResource(router);
  const output = await ctx.client.q.query();

  expectTypeOf(output).toEqualTypeOf<
    { first: string; second: string } | undefined
  >();
  expect(output).toBeUndefined();
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

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(ctx.client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );
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

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query('foobar');
  expectTypeOf(output.input).toBeNumber();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": 6,
    }
  `);

  await expect(ctx.client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );
});

test('valibot', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(v.union([v.string(), v.number()]))
      .output(v.object({ input: v.string() }))
      .query(({ input }) => {
        return { input: input as string };
      }),
  });
  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(ctx.client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );
});

test('valibot async', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(v.parserAsync(v.unionAsync([v.string(), v.number()])))
      .output(
        v.parserAsync(
          v.pipeAsync(
            v.objectAsync({ input: v.string() }),
            v.checkAsync(async (value) => !!value),
          ),
        ),
      )
      .query(({ input }) => {
        return { input: input as string };
      }),
  });

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(ctx.client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );
});

test('valibot transform', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(v.union([v.string(), v.number()]))
      .output(
        v.object({
          input: v.pipe(
            v.string(),
            v.transform((s) => s.length),
          ),
        }),
      )
      .query(({ input }) => {
        return { input: input as string };
      }),
  });

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query('foobar');
  expectTypeOf(output.input).toBeNumber();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": 6,
    }
  `);

  await expect(ctx.client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );
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

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(ctx.client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );
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

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(ctx.client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );
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

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(ctx.client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );
});

test('sury', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(S.union([S.string, S.number]))
      .output(S.schema({ input: S.string }))
      .query(({ input }) => {
        return { input: input as string };
      }),
  });

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(ctx.client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );
});

test('sury async', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(S.union([S.string, S.number]))
      .output(
        S.schema({
          input: S.string.with(S.to, S.string, {
            decode: { async: async (value) => value },
            encode: 'auto',
          }),
        }),
      )
      .query(({ input }) => {
        return { input: input as string };
      }),
  });

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(ctx.client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );
});

test('sury transform', async () => {
  const trpc = initTRPC.create();
  const router = trpc.router({
    q: trpc.procedure
      .input(S.union([S.string, S.number]))
      .output(S.schema({ input: S.string.with(S.to, S.number) }))
      .query(({ input }) => {
        return { input: input as string };
      }),
  });

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query('1234');
  expectTypeOf(output.input).toBeNumber();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": 1234,
    }
  `);

  await expect(ctx.client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );
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

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(ctx.client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );
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

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query('foobar');
  expectTypeOf(output.input).toBeString();
  expect(output).toMatchInlineSnapshot(`
    Object {
      "input": "foobar",
    }
  `);

  await expect(ctx.client.q.query(1234)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Output validation failed]`,
  );
});
