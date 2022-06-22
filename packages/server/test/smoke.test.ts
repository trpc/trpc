/* eslint-disable @typescript-eslint/ban-types */
import { routerToServerAndClientNew, waitError } from './___testHelpers';
import { TRPCClientError } from '@trpc/client';
import { z } from 'zod';
import { initTRPC } from '../src';

const trpc = initTRPC<{
  ctx: {};
}>()();
const { procedure } = trpc;

test('old client - happy path w/o input', async () => {
  const router = trpc.router({
    procedures: {
      hello: procedure.query(() => 'world'),
    },
  });
  const { client, close } = routerToServerAndClientNew(router);
  expect(await client.query('hello')).toBe('world');
  close();
});

test('old client - happy path with input', async () => {
  const router = trpc.router({
    procedures: {
      greeting: procedure
        .input(z.string())
        .query(({ input }) => `hello ${input}`),
    },
  });
  const { client, close } = routerToServerAndClientNew(router);
  expect(await client.query('greeting', 'KATT')).toBe('hello KATT');
  close();
});

test('very happy path', async () => {
  const router = trpc.router({
    procedures: {
      greeting: procedure
        .input(z.string())
        .query(({ input }) => `hello ${input}`),
    },
  });
  const { client, close } = routerToServerAndClientNew(router);
  expect(await client.greeting.query('KATT')).toBe('hello KATT');
  close();
});

test('middleware', async () => {
  const router = trpc.router({
    procedures: {
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
    },
  });
  const { client, close } = routerToServerAndClientNew(router);
  expect(await client.greeting.query()).toBe('hello KATT');
  close();
});

test('sad path', async () => {
  const router = trpc.router({
    procedures: {
      hello: procedure.query(() => 'world'),
    },
  });
  const { client, close } = routerToServerAndClientNew(router);

  // @ts-expect-error this procedure does not exist
  const result = await waitError(client.query('not-found'), TRPCClientError);
  expect(result).toMatchInlineSnapshot(
    `[TRPCClientError: No "query"-procedure on path "not-found"]`,
  );
  close();
});
