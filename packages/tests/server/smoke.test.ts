import { routerToServerAndClientNew, waitError } from './___testHelpers';
import { waitFor } from '@testing-library/react';
import { TRPCClientError, wsLink } from '@trpc/client/src';
import { inferProcedureParams, initTRPC } from '@trpc/server/src';
import { Unsubscribable, observable } from '@trpc/server/src/observable';
import { EventEmitter } from 'events';
import { expectTypeOf } from 'expect-type';
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

test('old client - happy path w/o input', async () => {
  const router = t.router({
    hello: procedure.query(() => 'world'),
  });
  const { client, close } = routerToServerAndClientNew(router);

  // @ts-expect-error cannot call new procedure with old client
  expect(await client.query('hello')).toBe('world');
  await close();
});

test('old client - happy path with input', async () => {
  const router = t.router({
    greeting: procedure
      .input(z.string())
      .query(({ input }) => `hello ${input}`),
  });
  const { client, close } = routerToServerAndClientNew(router);
  // @ts-expect-error cannot call new procedure with old client
  expect(await client.query('greeting', 'KATT')).toBe('hello KATT');
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
    type TContext = typeof greeting._def._config.$types.ctx;
    expectTypeOf<TContext>().toMatchTypeOf<{
      foo?: 'bar';
    }>();
  }
  {
    type TParams = inferProcedureParams<(typeof router)['greeting']>;
    type TConfig = TParams['_config'];
    type TContext = TConfig['$types']['ctx'];
    type TError = TConfig['$types']['errorShape'];
    expectTypeOf<NonNullable<TContext['foo']>>().toMatchTypeOf<'bar'>();
    expectTypeOf<TError['data']['foo']>().toMatchTypeOf<'bar'>();
  }
  const { proxy, close } = routerToServerAndClientNew(router);
  expect(await proxy.greeting.query('KATT')).toBe('hello KATT');
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
  const { proxy, close } = routerToServerAndClientNew(router);
  expect(await proxy.greeting.query()).toBe('hello KATT');
  await close();
});

test('sad path', async () => {
  const router = t.router({
    hello: procedure.query(() => 'world'),
  });
  const { proxy, close } = routerToServerAndClientNew(router);

  // @ts-expect-error this procedure does not exist
  const result = await waitError(proxy.not.found.query(), TRPCClientError);
  expect(result).toMatchInlineSnapshot(
    `[TRPCClientError: No "query"-procedure on path "not.found"]`,
  );
  await close();
});

test('call a mutation as a query', async () => {
  const router = t.router({
    hello: procedure.query(() => 'world'),
  });
  const { proxy, close } = routerToServerAndClientNew(router);

  await expect((proxy.hello as any).mutate()).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: No "mutation"-procedure on path "hello"]`,
  );

  await close();
});

test('flat router', async () => {
  const hello = procedure.query(() => 'world');
  const bye = procedure.query(() => 'bye');
  const router1 = t.router({
    hello,
    child: t.router({
      bye,
    }),
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
        const onData = (data: number) => emit.next(data + input);
        ee.on('data', onData);
        return () => {
          ee.off('data', onData);
        };
      });
    }),
  });

  const { proxy, close } = routerToServerAndClientNew(router, {
    client: ({ wsClient }) => ({
      links: [wsLink({ client: wsClient })],
    }),
  });

  const subscription = proxy.onEvent.subscribe(10, {
    onStarted: onStartedMock,
    onData: (data) => {
      expectTypeOf(data).toMatchTypeOf<number>();
      onDataMock(data);
    },
    onComplete: onCompleteMock,
  });

  expectTypeOf(subscription).toMatchTypeOf<Unsubscribable>();
  await waitFor(() => expect(onStartedMock).toBeCalledTimes(1));
  await waitFor(() => expect(subscriptionMock).toBeCalledTimes(1));
  await waitFor(() => expect(subscriptionMock).toHaveBeenNthCalledWith(1, 10));

  ee.emit('data', 20);
  await waitFor(() => expect(onDataMock).toBeCalledTimes(1));
  await waitFor(() => expect(onDataMock).toHaveBeenNthCalledWith(1, 30));

  subscription.unsubscribe();
  await waitFor(() => expect(onCompleteMock).toBeCalledTimes(1));

  await close();
});
