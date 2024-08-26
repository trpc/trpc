import { AsyncLocalStorage } from 'async_hooks';
import { routerToServerAndClientNew, waitError } from './___testHelpers';
import { initTRPC } from '@trpc/server';
import * as arktype from 'arktype';
import * as arktype2 from 'arktype2';
import myzod from 'myzod';
import * as T from 'runtypes';
import * as $ from 'scale-codec';
import * as st from 'superstruct';
import * as v from 'valibot';
import * as yup from 'yup';
import { z } from 'zod';

test('no validator', async () => {
  const t = initTRPC.create();

  const router = t.router({
    hello: t.procedure.query(({ input }) => {
      expectTypeOf(input).toBeUndefined();
      return 'test';
    }),
  });

  const { close, client } = routerToServerAndClientNew(router);
  const res = await client.hello.query();
  expect(res).toBe('test');
  await close();
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

  const { close, client } = routerToServerAndClientNew(router);
  const res = await client.num.query(123);

  await expect(client.num.query('123' as any)).rejects.toMatchInlineSnapshot(`
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

  const { close, client } = routerToServerAndClientNew(router);

  await expect(client.q.query('bar')).rejects.toMatchInlineSnapshot(`
            [TRPCClientError: [
              {
                "code": "custom",
                "message": "Invalid input",
                "path": []
              }
            ]]
          `);
  const res = await client.q.query('foo');
  expect(res).toMatchInlineSnapshot(`
      Object {
        "input": "foo",
      }
    `);
  await close();
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

  const { close, client } = routerToServerAndClientNew(router);

  await expect(client.num.query({ length: '123' })).resolves
    .toMatchInlineSnapshot(`
            Object {
              "input": Object {
                "length": 3,
              },
            }
          `);

  await expect(
    // @ts-expect-error this should only accept a string
    client.num.query({ length: 123 }),
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

test('valibot', async () => {
  const t = initTRPC.create();

  const router = t.router({
    num: t.procedure.input(v.parser(v.number())).query(({ input }) => {
      expectTypeOf(input).toBeNumber();
      return {
        input,
      };
    }),
  });

  const { close, client } = routerToServerAndClientNew(router);
  const res = await client.num.query(123);

  await expect(client.num.query('123' as any)).rejects.toMatchInlineSnapshot(
    '[TRPCClientError: Invalid type: Expected number but received "123"]',
  );
  expect(res.input).toBe(123);
  await close();
});

test('valibot async', async () => {
  const t = initTRPC.create();
  const input = v.parserAsync(
    v.pipeAsync(
      v.string(),
      v.checkAsync(async (value) => value === 'foo'),
    ),
  );

  const router = t.router({
    q: t.procedure.input(input).query(({ input }) => {
      expectTypeOf(input).toBeString();
      return {
        input,
      };
    }),
  });

  const { close, client } = routerToServerAndClientNew(router);

  await expect(client.q.query('bar')).rejects.toMatchInlineSnapshot(
    '[TRPCClientError: Invalid input: Received "bar"]',
  );
  const res = await client.q.query('foo');
  expect(res).toMatchInlineSnapshot(`
      Object {
        "input": "foo",
      }
    `);
  await close();
});

test('valibot transform mixed input/output', async () => {
  const t = initTRPC.create();
  const input = v.parser(
    v.object({
      length: v.pipe(
        v.string(),
        v.transform((s) => s.length),
      ),
    }),
  );

  const router = t.router({
    num: t.procedure.input(input).query(({ input }) => {
      expectTypeOf(input.length).toBeNumber();
      return {
        input,
      };
    }),
  });

  const { close, client } = routerToServerAndClientNew(router);

  await expect(client.num.query({ length: '123' })).resolves
    .toMatchInlineSnapshot(`
            Object {
              "input": Object {
                "length": 3,
              },
            }
          `);

  await expect(
    // @ts-expect-error this should only accept a string
    client.num.query({ length: 123 }),
  ).rejects.toMatchInlineSnapshot(
    '[TRPCClientError: Invalid type: Expected string but received 123]',
  );

  await close();
});

test('superstruct', async () => {
  const t = initTRPC.create();

  const router = t.router({
    num: t.procedure.input(st.number()).query(({ input }) => {
      expectTypeOf(input).toBeNumber();
      return {
        input,
      };
    }),
  });

  const { close, client } = routerToServerAndClientNew(router);
  const res = await client.num.query(123);

  // @ts-expect-error this only accepts a `number`
  await expect(client.num.query('123')).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Expected a number, but received: "123"]`,
  );
  expect(res.input).toBe(123);
  await close();
});

test('yup', async () => {
  const t = initTRPC.create();

  const router = t.router({
    num: t.procedure.input(yup.number().required()).query(({ input }) => {
      expectTypeOf(input).toMatchTypeOf<number>();
      return {
        input,
      };
    }),
  });

  const { close, client } = routerToServerAndClientNew(router);
  const res = await client.num.query(123);

  // @ts-expect-error this only accepts a `number`
  await expect(client.num.query('asd')).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: this must be a \`number\` type, but the final value was: \`NaN\` (cast from the value \`"asd"\`).]`,
  );
  expect(res.input).toBe(123);
  await close();
});

test('scale', async () => {
  const t = initTRPC.create();

  const router = t.router({
    num: t.procedure.input($.i8).query(({ input }) => {
      expectTypeOf(input).toMatchTypeOf<number>();
      return {
        input,
      };
    }),
  });

  const { close, client } = routerToServerAndClientNew(router);
  const res = await client.num.query(16);

  // @ts-expect-error this only accepts a `number`
  await expect(client.num.query('asd')).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: typeof value !== "number"]`,
  );
  expect(res.input).toBe(16);
  await close();
});

test('myzod', async () => {
  const t = initTRPC.create();

  const router = t.router({
    num: t.procedure.input(myzod.number()).query(({ input }) => {
      expectTypeOf(input).toMatchTypeOf<number>();
      return {
        input,
      };
    }),
  });

  const { close, client } = routerToServerAndClientNew(router);
  const res = await client.num.query(123);
  await expect(client.num.query('123' as any)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: expected type to be number but got string]`,
  );
  expect(res.input).toBe(123);
  await close();
});

test('arktype v1 schema', async () => {
  const t = initTRPC.create();

  const router = t.router({
    num: t.procedure
      .input(arktype.type({ text: 'string' }))
      .query(({ input }) => {
        expectTypeOf(input).toEqualTypeOf<{ text: string }>();
        return {
          input,
        };
      }),
  });

  const { close, client } = routerToServerAndClientNew(router);
  const res = await client.num.query({ text: '123' });
  expect(res.input).toMatchObject({ text: '123' });

  // @ts-expect-error this only accepts {text: string}
  await expect(client.num.query({ text: 123 })).rejects.toMatchInlineSnapshot(`
    [TRPCClientError: text must be a string (was number)]
  `);
  await close();
});

test('arktype v2 schema', async () => {
  const t = initTRPC.create();

  const router = t.router({
    num: t.procedure
      .input(arktype2.type({ text: 'string' }))
      .query(({ input }) => {
        expectTypeOf(input).toEqualTypeOf<{ text: string }>();
        return {
          input,
        };
      }),
  });

  const { close, client } = routerToServerAndClientNew(router);
  const res = await client.num.query({ text: '123' });
  expect(res.input).toMatchObject({ text: '123' });

  // @ts-expect-error this only accepts {text: string}
  await expect(client.num.query({ text: 123 })).rejects.toMatchInlineSnapshot(`
    [TRPCClientError: text must be a string (was a number)]
  `);
  await close();
});

test('arktype schema - using .assert', async () => {
  const t = initTRPC.create();

  const router = t.router({
    num: t.procedure
      .input(arktype.type({ text: 'string' }).assert)
      .query(({ input }) => {
        expectTypeOf(input).toEqualTypeOf<{ text: string }>();
        return {
          input,
        };
      }),
  });

  const { close, client } = routerToServerAndClientNew(router);
  const res = await client.num.query({ text: '123' });
  expect(res.input).toMatchObject({ text: '123' });

  // @ts-expect-error this only accepts {text: string}
  await expect(client.num.query({ text: 123 })).rejects.toMatchInlineSnapshot(`
    [TRPCClientError: text must be a string (was number)]
  `);
  await close();
});
test('runtypes', async () => {
  const t = initTRPC.create();

  const router = t.router({
    num: t.procedure.input(T.Record({ text: T.String })).query(({ input }) => {
      expectTypeOf(input).toMatchTypeOf<{ text: string }>();
      return {
        input,
      };
    }),
  });

  const { close, client } = routerToServerAndClientNew(router);
  const res = await client.num.query({ text: '123' });
  expect(res.input).toMatchObject({ text: '123' });

  // @ts-expect-error this only accepts a `number`
  await expect(client.num.query('13')).rejects.toMatchInlineSnapshot(`
  [TRPCClientError: Expected { text: string; }, but was string]
`);
  await close();
});

test('validator fn', async () => {
  const t = initTRPC.create();

  const numParser = (input: unknown) => {
    if (typeof input !== 'number') {
      throw new Error('Not a number');
    }
    return input;
  };

  const router = t.router({
    num: t.procedure.input(numParser).query(({ input }) => {
      expectTypeOf(input).toBeNumber();
      return {
        input,
      };
    }),
  });

  const { close, client } = routerToServerAndClientNew(router);
  const res = await client.num.query(123);
  await expect(client.num.query('123' as any)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Not a number]`,
  );
  expect(res.input).toBe(123);
  await close();
});

test('async validator fn', async () => {
  const t = initTRPC.create();
  async function numParser(input: unknown) {
    if (typeof input !== 'number') {
      throw new Error('Not a number');
    }
    return input;
  }

  const router = t.router({
    num: t.procedure.input(numParser).query(({ input }) => {
      expectTypeOf(input).toBeNumber();
      return {
        input,
      };
    }),
  });

  const { close, client } = routerToServerAndClientNew(router);
  const res = await client.num.query(123);
  await expect(client.num.query('123' as any)).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Not a number]`,
  );
  expect(res.input).toBe(123);
  await close();
});

test('recipe: summon context in input parser', async () => {
  type Context = {
    foo: string;
  };
  const t = initTRPC.context<Context>().create();

  // <initialize AsyncLocalStorage>
  const contextStorage = new AsyncLocalStorage<Context>();
  const getContext = () => {
    const ctx = contextStorage.getStore();
    if (!ctx) {
      throw new Error('No context found');
    }
    return ctx;
  };
  // </initialize AsyncLocalStorage>

  const procedureWithContext = t.procedure.use((opts) => {
    // this middleware adds a context that can be fetched by `getContext()`
    return contextStorage.run(opts.ctx, async () => {
      return await opts.next();
    });
  });

  const router = t.router({
    proc: procedureWithContext
      .input((input) => {
        // this input parser uses the context
        const ctx = getContext();
        expect(ctx.foo).toBe('bar');

        return z.string().parse(input);
      })
      .query((opts) => {
        expectTypeOf(opts.input).toBeString();
        return opts.input;
      }),
  });

  const ctx = routerToServerAndClientNew(router, {
    server: {
      createContext() {
        return { foo: 'bar' };
      },
    },
  });
  const res = await ctx.client.proc.query('123');

  expect(res).toMatchInlineSnapshot('"123"');

  const err = await waitError(
    ctx.client.proc.query(
      // @ts-expect-error this only accepts a `number`
      123,
    ),
  );
  expect(err).toMatchInlineSnapshot(`
    [TRPCClientError: [
      {
        "code": "invalid_type",
        "expected": "string",
        "received": "number",
        "path": [],
        "message": "Expected string, received number"
      }
    ]]
  `);

  await ctx.close();
});

// regerssion: TInputIn / TInputOut
test('zod default', () => {
  const t = initTRPC.create();
  const input = z.object({
    users: z.array(z.number()).optional().default([]),
  });

  const router = t.router({
    num: t.procedure
      .input(input)
      .use((opts) => {
        expectTypeOf(opts.input.users).toMatchTypeOf<number[]>();
        return opts.next();
      })
      .query((opts) => {
        expectTypeOf(opts.input.users).toMatchTypeOf<number[]>();
        return {
          input,
        };
      }),
  });
});
