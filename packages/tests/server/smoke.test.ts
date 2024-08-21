import { EventEmitter } from 'events';
import { routerToServerAndClientNew, waitError } from './___testHelpers';
import { waitFor } from '@testing-library/react';
import { getUntypedClient, TRPCClientError, wsLink } from '@trpc/client';
import type { inferProcedureOutput } from '@trpc/server';
import { initTRPC } from '@trpc/server';
import type { Unsubscribable } from '@trpc/server/observable';
import { observable } from '@trpc/server/observable';
import { z } from 'zod';

const t = initTRPC
  .context<{
    foo?: 'bar';
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

test('very happy path - query', async () => {
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

test('very happy path - mutation', async () => {
  const greeting = t.procedure
    .input(z.string())
    .use(({ next }) => {
      return next();
    })
    .mutation(({ input }) => `hello ${input}`);
  const router = t.router({
    greeting,
  });

  {
    type TContext = inferProcedureOutput<typeof greeting>;
    expectTypeOf<TContext>().toMatchTypeOf<string>();
  }
  const { client, close } = routerToServerAndClientNew(router);
  expect(await client.greeting.mutate('KATT')).toBe('hello KATT');
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
    `[TRPCClientError: No procedure found on path "not.found"]`,
  );
  await close();
});

test('call a mutation as a query', async () => {
  const router = t.router({
    hello: procedure.query(() => 'world'),
  });
  const { client, close } = routerToServerAndClientNew(router);

  await expect((client.hello as any).mutate()).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: Unsupported POST-request to query procedure at path "hello"]`,
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
