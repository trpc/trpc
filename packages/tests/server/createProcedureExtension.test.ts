import {
  ProcedureBuilder,
  createProcedureExtension,
  initTRPC,
} from '@trpc/server/src';
import { z } from 'zod';

type NoAny<T> = any extends T ? never : T;

type ExactType<TActual, TExpected> = NoAny<TActual> extends NoAny<TExpected>
  ? NoAny<TExpected> extends NoAny<TActual>
    ? TActual
    : never
  : never;

function assertType<TExpected>() {
  return {
    is<TActual>(_t: ExactType<TActual, TExpected>) {
      //
    },
  };
}

test('complete example', async () => {
  const t = initTRPC.context<{ userId: string }>().create();

  const extension = createProcedureExtension((proc) => {
    return proc.input(z.object({ orgId: z.number() })).use(({ next }) => {
      return next({
        ctx: {
          orgPermitted: true,
        },
      });
    });
  });

  const subject = t.procedure
    .input(z.object({ name: z.string() }))
    .extend(extension)
    .input(z.object({ name2: z.string() }))
    .query((opts) => {
      assertType<string>().is(opts.input.name);
      assertType<number>().is(opts.input.orgId);
      assertType<string>().is(opts.input.name2);

      assertType<boolean>().is(opts.ctx.orgPermitted);
      assertType<string>().is(opts.ctx.userId);

      return {
        input: opts.input,
        ctx: opts.ctx,
      };
    });

  const result = await t
    .router({ subject })
    .createCaller({ userId: 'some-user' })
    .subject({
      name: 'name',
      name2: 'name2',
      orgId: 42,
    });

  expect(result).toEqual({
    input: {
      name: 'name',
      name2: 'name2',
      orgId: 42,
    },
    ctx: {
      userId: 'some-user',
      orgPermitted: true,
    },
  });
});

describe('input merging', () => {
  test('no existing object', async () => {
    const t = initTRPC.create();

    const extension = createProcedureExtension((proc) => {
      return proc.input(z.object({ orgId: z.number() }));
    });

    const subject = t.procedure
      .extend(extension)
      .input(z.object({ name2: z.string() }))
      .query((opts) => {
        assertType<number>().is(opts.input.orgId);
        assertType<string>().is(opts.input.name2);

        return {
          input: opts.input,
          ctx: opts.ctx,
        };
      });

    const result = await t.router({ subject }).createCaller({}).subject({
      name2: 'name2',
      orgId: 42,
    });

    expect(result).toEqual({
      input: {
        name2: 'name2',
        orgId: 42,
      },
      ctx: {},
    });
  });

  test('existing object', async () => {
    const t = initTRPC.create();

    const extension = createProcedureExtension((proc) => {
      return proc.input(z.object({ orgId: z.number() }));
    });

    const subject = t.procedure
      .input(z.object({ name: z.string() }))
      .extend(extension)
      .input(z.object({ name2: z.string() }))
      .query((opts) => {
        assertType<string>().is(opts.input.name);
        assertType<number>().is(opts.input.orgId);
        assertType<string>().is(opts.input.name2);

        return {
          input: opts.input,
          ctx: opts.ctx,
        };
      });

    const result = await t.router({ subject }).createCaller({}).subject({
      name: 'name',
      name2: 'name2',
      orgId: 42,
    });

    expect(result).toEqual({
      input: {
        name: 'name',
        name2: 'name2',
        orgId: 42,
      },
      ctx: {},
    });
  });

  test('merging object onto array is type error', async () => {
    const t = initTRPC.create();

    const extension = createProcedureExtension((proc) => {
      return proc.input(z.object({ orgId: z.number() }));
    });

    t.procedure
      .input(z.array(z.object({ name: z.string() })))
      // @ts-expect-error can't merge an object onto an array
      .extend(extension);
  });

  test('merging array onto object is type error', async () => {
    const t = initTRPC.create();

    const extension = createProcedureExtension((proc) => {
      return proc.input(z.array(z.object({ orgId: z.number() })));
    });

    t.procedure
      .input(z.object({ name: z.string() }))
      // @ts-expect-error can't merge an array onto an object
      .extend(extension);
  });

  test('merging arrays is type error', async () => {
    const t = initTRPC.create();

    const extension = createProcedureExtension((proc) => {
      return proc.input(z.array(z.object({ orgId: z.number() })));
    });

    t.procedure
      .input(z.array(z.object({ name: z.string() })))
      // @ts-expect-error can't merge an array onto an array
      .extend(extension);
  });
});

describe('context merging', () => {
  test('existing context', async () => {
    const t = initTRPC.context<{ userId: string }>().create();

    const extension = createProcedureExtension((proc) => {
      return proc.use(({ next }) => {
        return next({
          ctx: {
            orgPermitted: true,
          },
        });
      });
    });

    const subject = t.procedure.extend(extension).query((opts) => {
      assertType<string>().is(opts.ctx.userId);
      assertType<boolean>().is(opts.ctx.orgPermitted);

      return {
        input: opts.input,
        ctx: opts.ctx,
      };
    });

    const result = await t
      .router({ subject })
      .createCaller({ userId: 'some-user' })
      .subject();

    expect(result).toEqual({
      input: undefined,
      ctx: {
        userId: 'some-user',
        orgPermitted: true,
      },
    });
  });

  test('existing context and additional middleware', async () => {
    const t = initTRPC.context<{ userId: string }>().create();

    const extension = createProcedureExtension((proc) => {
      return proc.use(({ next }) => {
        return next({
          ctx: {
            orgPermitted: true,
          },
        });
      });
    });

    const subject = t.procedure
      .extend(extension)
      .use((opts) => {
        return opts.next({
          ctx: {
            anotherKey: 1,
          },
        });
      })
      .query((opts) => {
        assertType<string>().is(opts.ctx.userId);
        assertType<boolean>().is(opts.ctx.orgPermitted);
        assertType<number>().is(opts.ctx.anotherKey);

        return {
          input: opts.input,
          ctx: opts.ctx,
        };
      });

    const result = await t
      .router({ subject })
      .createCaller({ userId: 'some-user' })
      .subject();

    expect(result).toEqual({
      input: undefined,
      ctx: {
        userId: 'some-user',
        orgPermitted: true,
        anotherKey: 1,
      },
    });
  });

  test('no existing context', async () => {
    const t = initTRPC.create();

    const extension = createProcedureExtension((proc) => {
      return proc.use(({ next }) => {
        return next({
          ctx: {
            orgPermitted: true,
          },
        });
      });
    });

    const subject = t.procedure.extend(extension).query((opts) => {
      assertType<boolean>().is(opts.ctx.orgPermitted);

      return {
        input: opts.input,
        ctx: opts.ctx,
      };
    });

    const result = await t.router({ subject }).createCaller({}).subject();

    expect(result).toEqual({
      input: undefined,
      ctx: {
        orgPermitted: true,
      },
    });
  });

  test('no existing context and additional middleware', async () => {
    const t = initTRPC.create();

    const extension = createProcedureExtension((proc) => {
      return proc.use(({ next }) => {
        return next({
          ctx: {
            orgPermitted: true,
          },
        });
      });
    });

    const subject = t.procedure
      .extend(extension)
      .use((opts) => {
        return opts.next({
          ctx: {
            anotherKey: 1,
          },
        });
      })
      .query((opts) => {
        assertType<boolean>().is(opts.ctx.orgPermitted);
        assertType<number>().is(opts.ctx.anotherKey);

        return {
          input: opts.input,
          ctx: opts.ctx,
        };
      });

    const result = await t.router({ subject }).createCaller({}).subject();

    expect(result).toEqual({
      input: undefined,
      ctx: {
        orgPermitted: true,
        anotherKey: 1,
      },
    });
  });
});

describe('meta merging', () => {
  test("meta cannot be set because it's not known", async () => {
    createProcedureExtension((proc) => {
      // @ts-expect-error meta cannot be set because it's not known
      return proc.meta({ foo: 'bar' });
    });
  });
});

// TODO: should we retype the ProcedureBuilder to omit extra keys? Here's the proposal
describe('limited ProcedureBuilder', () => {
  test('the procedure builder does not have all keys available to it', () => {
    createProcedureExtension((proc) => {
      // @ts-expect-error not used intentionally
      function checks() {
        // Should exist
        proc.input(null as any);
        proc.use(null as any);

        // Should be omitted
        // @ts-expect-error shouldn't exist
        proc.extend(null as any);
        // @ts-expect-error shouldn't exist
        proc.query(null as any);
        // @ts-expect-error shouldn't exist
        proc.mutation(null as any);
        // @ts-expect-error shouldn't exist
        proc.subscription(null as any);
        // @ts-expect-error shouldn't exist
        proc.unstable_concat(null as any);
        // @ts-expect-error shouldn't exist
        proc.output(null as any);
        // @ts-expect-error shouldn't exist
        proc.meta(null as any);
        // @ts-expect-error shouldn't exist
        proc._def(null as any);
      }

      return proc;
    });
  });
});
