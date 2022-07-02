/* eslint-disable @typescript-eslint/ban-types */
import { routerToServerAndClientNew, waitError } from './___testHelpers';
import { TRPCClientError } from '@trpc/client';
import { expectTypeOf } from 'expect-type';
import { z } from 'zod';
import { initTRPC } from '../src';

const t = initTRPC<{
  ctx: {};
}>()();
const { procedure } = t;

test('old client - happy path w/o input', async () => {
  const router = t.router({
    hello: procedure.query(() => 'world'),
  });
  const { client, close } = routerToServerAndClientNew(router);
  expect(await client.query('hello')).toBe('world');
  close();
});

test('old client - happy path with input', async () => {
  const router = t.router({
    greeting: procedure
      .input(z.string())
      .query(({ input }) => `hello ${input}`),
  });
  const { client, close } = routerToServerAndClientNew(router);
  expect(await client.query('greeting', 'KATT')).toBe('hello KATT');
  close();
});

test('very happy path', async () => {
  const router = t.router({
    greeting: procedure
      .input(z.string())
      .query(({ input }) => `hello ${input}`),
  });
  const { client, close } = routerToServerAndClientNew(router);
  expect(await client.greeting.query('KATT')).toBe('hello KATT');
  close();
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
  close();
});

test('sad path', async () => {
  const router = t.router({
    hello: procedure.query(() => 'world'),
  });
  const { client, close } = routerToServerAndClientNew(router);

  // @ts-expect-error this procedure does not exist
  const result = await waitError(client.query('not-found'), TRPCClientError);
  expect(result).toMatchInlineSnapshot(
    `[TRPCClientError: No "query"-procedure on path "not-found"]`,
  );
  close();
});

test('call a mutation as a query', async () => {
  const router = t.router({
    hello: procedure.query(() => 'world'),
  });
  const { client, close } = routerToServerAndClientNew(router);

  await expect((client.hello as any).mutation()).rejects.toMatchInlineSnapshot(
    `[TRPCClientError: No "mutation"-procedure on path "hello"]`,
  );

  close();
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
