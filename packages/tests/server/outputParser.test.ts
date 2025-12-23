import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { initTRPC } from '@trpc/server';
import myzod from 'myzod';
import * as t from 'superstruct';
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

test('zod transform - resolver returns input type, client receives output type', async () => {
  // This test verifies that with output transforms:
  // - The resolver must return the INPUT type of the output schema (what the transform expects)
  // - The client receives the OUTPUT type (what the transform produces)

  const trpc = initTRPC.create();

  // Schema that transforms a bigint to a string (like a codec)
  const bigintToStringSchema = z.object({
    value: z.bigint().transform((val) => val.toString()),
  });

  // Verify the schema types
  type SchemaInput = z.input<typeof bigintToStringSchema>; // { value: bigint }
  type SchemaOutput = z.output<typeof bigintToStringSchema>; // { value: string }

  const router = trpc.router({
    q: trpc.procedure.output(bigintToStringSchema).query(() => {
      // The resolver returns the INPUT type (bigint)
      const result = { value: 123n };

      // Type assertion to verify the return type matches schema input
      expectTypeOf(result).toMatchTypeOf<SchemaInput>();

      return result;
    }),
  });

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query();

  // The client receives the OUTPUT type (string) after transform
  expectTypeOf(output.value).toBeString();
  expect(output).toEqual({ value: '123' });
});

test('zod preprocess - validates resolver returns schema input type', async () => {
  // Test with preprocess which also has different input/output types

  const trpc = initTRPC.create();

  // Schema that coerces strings to numbers
  const stringToNumberSchema = z.object({
    count: z.preprocess((val) => Number(val), z.number()),
  });

  const router = trpc.router({
    q: trpc.procedure.output(stringToNumberSchema).query(() => {
      // Resolver returns what the preprocess expects
      return { count: '42' as unknown };
    }),
  });

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query();

  // Client receives the final validated number
  expectTypeOf(output.count).toBeNumber();
  expect(output).toEqual({ count: 42 });
});

test('nested output transforms', async () => {
  // Test that nested transforms work correctly

  const trpc = initTRPC.create();

  // A schema with multiple levels of transformation
  const nestedTransformSchema = z.object({
    value: z
      .string()
      .transform((s) => s.length)
      .transform((n) => n * 2),
  });

  const router = trpc.router({
    q: trpc.procedure.output(nestedTransformSchema).query(() => {
      // Resolver returns the input type (string)
      return { value: 'hello' };
    }),
  });

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query();

  // After transforms: 'hello' -> 5 -> 10
  expectTypeOf(output.value).toBeNumber();
  expect(output).toEqual({ value: 10 });
});
