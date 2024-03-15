import { EventEmitter } from 'events';
import { routerToServerAndClientNew, waitError } from './___testHelpers';
import { waitFor } from '@testing-library/react';
import { getUntypedClient, TRPCClientError, wsLink } from '@trpc/client';
import type { inferProcedureOutput } from '@trpc/server';
import { initTRPC, TRPCError } from '@trpc/server';
import type { Unsubscribable } from '@trpc/server/observable';
import { observable } from '@trpc/server/observable';
import type {
  ProcedureBuilder,
  TypedTRPCError,
} from '@trpc/server/unstable-core-do-not-import';
import { trpcError } from '@trpc/server/unstable-core-do-not-import';
import { z } from 'zod';

const t = initTRPC
  .context<{
    foo?: 'bar';
    user?: {
      id: string;
    };
  }>()
  .create({
    errorFormatter({ shape }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          foo: 'bar' as const,
        },
      };
    },
  });
const { procedure } = t;

test('untyped client - happy path w/o input', async () => {
  const router = t.router({
    hello: procedure.query(() => 'world'),
  });

  const { client, close } = routerToServerAndClientNew(router);
  const untypedClient = getUntypedClient(client);

  // client is untyped
  const res = await untypedClient.query('hello');
  expect(res).toBe('world');
  expectTypeOf(res).toBeUnknown();
  await close();
});

test('untyped client - happy path with input', async () => {
  const router = t.router({
    greeting: procedure
      .input(z.string())
      .query(({ input }) => `hello ${input}`),
  });
  const { client, close } = routerToServerAndClientNew(router);
  const untypedClient = getUntypedClient(client);

  expect(await untypedClient.query('greeting', 'KATT')).toBe('hello KATT');
  await close();
});

test('very happy path', async () => {
  const greeting = t.procedure
    .input(z.string())
    .use(({ next }) => {
      return next();
    })
    .query(({ input }) => `hello ${input}`);
  const router = t.router({
    greeting,
  });

  {
    type TContext = inferProcedureOutput<typeof greeting>;
    expectTypeOf<TContext>().toMatchTypeOf<string>();
  }
  const { client, close } = routerToServerAndClientNew(router);
  expect(await client.greeting.query('KATT')).toBe('hello KATT');
  await close();
});

test('nested short-hand routes', async () => {
  const greeting = t.procedure
    .input(z.string())
    .use(({ next }) => {
      return next();
    })
    .query(({ input }) => `hello ${input}`);
  const router = t.router({
    deeply: {
      nested: {
        greeting,
      },
    },
  });

  const { client, close } = routerToServerAndClientNew(router);
  expect(await client.deeply.nested.greeting.query('KATT')).toBe('hello KATT');
  await close();
});

test('mixing short-hand routes and routers', async () => {
  const greeting = t.procedure
    .input(z.string())
    .use(({ next }) => {
      return next();
    })
    .query(({ input }) => `hello ${input}`);
  const router = t.router({
    deeply: {
      nested: {
        greeting,
        router: t.router({
          greeting,
        }),
      },
    },
  });

  const { client, close } = routerToServerAndClientNew(router);
  expect(await client.deeply.nested.greeting.query('KATT')).toBe('hello KATT');
  expect(await client.deeply.nested.router.greeting.query('KATT')).toBe(
    'hello KATT',
  );
  await close();
});

test('middleware', async () => {
  const router = t.router({
    greeting: procedure
      .use(({ next }) => {
        return next({
          ctx: {
            prefix: 'hello',
          },
        });
      })
      .use(({ next }) => {
        return next({
          ctx: {
            user: 'KATT',
          },
        });
      })
      .query(({ ctx }) => `${ctx.prefix} ${ctx.user}`),
  });
  const { client, close } = routerToServerAndClientNew(router);
  expect(await client.greeting.query()).toBe('hello KATT');
  await close();
});

test('sad path', async () => {
  const router = t.router({
    hello: procedure.query(() => 'world'),
  });
  const { client, close } = routerToServerAndClientNew(router);

  // @ts-expect-error this procedure does not exist
  const result = await waitError(client.not.found.query(), TRPCClientError);
  expect(result).toMatchInlineSnapshot(
    `[TRPCClientError: No "query"-procedure on path "not.found"]`,
  );
  await close();
});

test('call a mutation as a query', async () => {
  const router = t.router({
    hello: procedure.query(() => 'world'),
  });
  const { client, close } = routerToServerAndClientNew(router);

  await expect((client.hello as any).mutate()).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: No "mutation"-procedure on path "hello"]`,
  );

  await close();
});

test('flat router', async () => {
  const hello = procedure.query(() => 'world');
  const bye = procedure.query(() => 'bye');
  const child = t.router({
    bye,
  });

  const router1 = t.router({
    hello,
    child,
  });

  expect(router1.hello).toBe(hello);
  expect(router1.child.bye).toBe(bye);
  expectTypeOf(router1.hello).toMatchTypeOf(hello);
  expectTypeOf(router1.child.bye).toMatchTypeOf(bye);

  const router2 = t.router({
    router2hello: hello,
  });
  const merged = t.mergeRouters(router1, router2);

  expectTypeOf(merged.hello).toMatchTypeOf(hello);
  expectTypeOf(merged.child.bye).toMatchTypeOf(bye);

  expectTypeOf(merged.router2hello).toMatchTypeOf(hello);

  expect(merged.hello).toBe(hello);
  expect(merged.child.bye).toBe(bye);
});

test('subscriptions', async () => {
  const ee = new EventEmitter();

  const subscriptionMock = vi.fn();
  const onStartedMock = vi.fn();
  const onDataMock = vi.fn();
  const onCompleteMock = vi.fn();

  const router = t.router({
    onEvent: t.procedure.input(z.number()).subscription(({ input }) => {
      subscriptionMock(input);
      return observable<number>((emit) => {
        const onData = (data: number) => {
          emit.next(data + input);
        };
        ee.on('data', onData);
        return () => {
          ee.off('data', onData);
        };
      });
    }),
  });

  const { client, close } = routerToServerAndClientNew(router, {
    client: ({ wsClient }) => ({
      links: [wsLink({ client: wsClient })],
    }),
  });

  const subscription = client.onEvent.subscribe(10, {
    onStarted: onStartedMock,
    onData: (data) => {
      expectTypeOf(data).toMatchTypeOf<number>();
      onDataMock(data);
    },
    onComplete: onCompleteMock,
  });

  expectTypeOf(subscription).toMatchTypeOf<Unsubscribable>();
  await waitFor(() => {
    expect(onStartedMock).toBeCalledTimes(1);
  });
  await waitFor(() => {
    expect(subscriptionMock).toBeCalledTimes(1);
  });
  await waitFor(() => {
    expect(subscriptionMock).toHaveBeenNthCalledWith(1, 10);
  });

  ee.emit('data', 20);
  await waitFor(() => {
    expect(onDataMock).toBeCalledTimes(1);
  });
  await waitFor(() => {
    expect(onDataMock).toHaveBeenNthCalledWith(1, 30);
  });

  subscription.unsubscribe();
  await waitFor(() => {
    expect(onCompleteMock).toBeCalledTimes(1);
  });

  await close();
});

test('infer errors', async () => {
  type inferError<T> = T extends ProcedureBuilder<
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    any,
    infer U,
    any
  >
    ? U
    : never;

  const schema = z
    .object({
      foo: z.string(),
      deep: z.object({
        nested: z.object({
          thing: z.string(),
        }),
      }),
    })
    .optional();
  const res = schema.safeParse({});
  if (!res.success) {
    res.error.formErrors.fieldErrors.foo;
    res.error.formErrors.fieldErrors.foo;
    res.error.formErrors.fieldErrors.deep;
    const what = res.error.flatten();
  }
  const proc = procedure
    .experimental_inferErrors()
    .input(schema)
    .use((opts) => {
      // if (opts)
      if (opts.ctx.foo !== 'bar') {
        return trpcError({
          code: 'UNAUTHORIZED',
          foo: 'bar' as const,
        });
      }
      return opts.next();
    })
    .use((opts) => {
      if (opts.ctx.user?.id === '1') {
        return trpcError({
          code: 'FORBIDDEN',
          mw2: 'bar' as const,
        });
      }
      return opts.next();
    });

  type Err = inferError<typeof proc>;
  //   ^?

  expectTypeOf<Err>().toMatchTypeOf<
    | {
        code: 'UNAUTHORIZED';
        foo: 'bar';
      }
    | {
        code: 'FORBIDDEN';
        mw2: 'bar';
      }
  >();

  const router = t.router({
    q: proc.query(() => 'q'),
  });

  {
    const caller = router.createCaller({});
    const error = (await waitError(
      caller.q(),
      TRPCError,
    )) as TypedTRPCError<Err>;

    assert(error.code === 'UNAUTHORIZED');
    expect(error.code).toBe('UNAUTHORIZED');

    error;
    expect(error.foo).toBe('bar');
  }

  {
    const caller = router.createCaller({
      foo: 'bar',
    });
    expect(await caller.q()).toBe('q');
  }
});

test('experimental caller', async () => {
  const t = initTRPC.create();

  t.procedure.experimental_caller(async (opts) => {
    switch (opts._def.type) {
      case 'mutation': {
        /**
         * When you wrap an action with useFormState, it gets an extra argument as its first argument.
         * The submitted form data is therefore its second argument instead of its first as it would usually be.
         * The new first argument that gets added is the current state of the form.
         * @see https://react.dev/reference/react-dom/hooks/useFormState#my-action-can-no-longer-read-the-submitted-form-data
         */
        const input = opts.args.length === 1 ? opts.args[0] : opts.args[1];

        return opts.invoke({
          type: 'query',
          ctx: {},
          getRawInput: async () => input,
          path: '',
          input,
        });
      }
      case 'query': {
        const input = opts.args[0];
        return opts.invoke({
          type: 'query',
          ctx: {},
          getRawInput: async () => input,
          path: '',
          input,
        });
      }
      case 'subscription': {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Not implemented',
        });
      }
    }
  });
});
