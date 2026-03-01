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

test('zod v4 codec - bidirectional transform for output encoding', async () => {
  // This test verifies that Zod v4 codecs work with output parsing.
  // Codecs use `.encode()` for the reverse transformation (output → serialized).
  //
  // For output schemas with codecs:
  // - The resolver returns data that encode() will transform
  // - The codec encodes it to the serialized form for the client

  const trpc = initTRPC.create();

  // Create a Zod v4 codec that transforms between string and bigint
  // decode: string → bigint (for input parsing)
  // encode: bigint → string (for output encoding)
  const stringToBigint = z.codec(z.string(), z.bigint(), {
    decode: (str) => BigInt(str),
    encode: (big) => big.toString(),
  });

  const schema = z.object({ value: stringToBigint });

  const router = trpc.router({
    q: trpc.procedure.output(schema).query(() => {
      // For codec output encoding, we return what encode() expects (bigint)
      // and cast to satisfy the type system which expects the input type
      return { value: 123n } as unknown as { value: string };
    }),
  });

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query();

  // The client receives the ENCODED value (string) after encode
  // The codec's encode function transforms bigint → string
  expect(output.value).toBe('123');
  expect(output).toEqual({ value: '123' });
});

test('zod v4 codec - Date to ISO string encoding', async () => {
  // Realistic use case: encoding Date objects to ISO strings for JSON serialization

  const trpc = initTRPC.create();

  // Codec that transforms between ISO string and Date
  const isoDateCodec = z.codec(z.string(), z.date(), {
    decode: (str) => new Date(str),
    encode: (date) => date.toISOString(),
  });

  const schema = z.object({ createdAt: isoDateCodec });

  const router = trpc.router({
    q: trpc.procedure.output(schema).query(() => {
      // For codec output encoding, we return what encode() expects (Date)
      // and cast to satisfy the type system
      return { createdAt: new Date('2024-01-15T10:30:00.000Z') } as unknown as {
        createdAt: string;
      };
    }),
  });

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query();

  // Client receives ISO string (after encoding)
  expect(output.createdAt).toBe('2024-01-15T10:30:00.000Z');
  expect(output).toEqual({ createdAt: '2024-01-15T10:30:00.000Z' });
});

test('zod v4 codec - nested codec transforms', async () => {
  // Test that codecs work correctly when nested in objects

  const trpc = initTRPC.create();

  const stringToBigint = z.codec(z.string(), z.bigint(), {
    decode: (str) => BigInt(str),
    encode: (big) => big.toString(),
  });

  const schema = z.object({
    user: z.object({
      id: stringToBigint,
      balance: stringToBigint,
    }),
  });

  type SchemaInput = z.input<typeof schema>;

  const router = trpc.router({
    q: trpc.procedure.output(schema).query(() => {
      // For codec output encoding, we return what encode() expects (bigint values)
      // and cast to satisfy the type system
      return {
        user: {
          id: 123n,
          balance: 999999999999999999n,
        },
      } as unknown as SchemaInput;
    }),
  });

  await using ctx = testServerAndClientResource(router);

  const output = await ctx.client.q.query();

  // Both nested codec values should be encoded to strings
  expect(output.user.id).toBe('123');
  expect(output.user.balance).toBe('999999999999999999');
  expect(output).toEqual({
    user: {
      id: '123',
      balance: '999999999999999999',
    },
  });
});
