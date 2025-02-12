import { routerToServerAndClientNew, waitError } from './___testHelpers';
import { TRPCClientError } from '@trpc/client';
import { initTRPC } from '@trpc/server';

const t = initTRPC.create();

test('experimental_Response happy path', async () => {
  const router = t.router({
    hello: t.procedure.output('experimental_Response').query(() => {
      return new Response('hello', {
        headers: {
          'content-type': 'text/plain',
        },
      });
    }),
  });

  const ctx = routerToServerAndClientNew(router);
  const res = await ctx.client.hello.query(undefined, {
    context: {
      skipBatch: true,
    },
  });
  expect(res.ok).toBe(true);
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('text/plain');
  expect(await res.text()).toBe('hello');

  await ctx.close();
});

test('experimental_Response does not work with subscriptions', async () => {
  expect(() => {
    t.procedure.output('experimental_Response').subscription(() => {
      return new Response('hello', {
        headers: {
          'content-type': 'text/plain',
        },
      });
    });
  }).toThrowErrorMatchingInlineSnapshot(
    `[Error: Subscription procedures cannot be marked as experimental_Response]`,
  );
});

test('experimental_Response needs to return a Response', async () => {
  const router = t.router({
    hello: t.procedure
      .output('experimental_Response')
      // @ts-expect-error - this should not be allowed
      .query(() => {
        return 'foo';
      }),
  });

  const ctx = routerToServerAndClientNew(router);
  const res = await waitError(
    ctx.client.hello.query(undefined, {
      context: {
        skipBatch: true,
      },
    }),
    TRPCClientError,
  );
  expect(res).toMatchInlineSnapshot(
    `[TRPCClientError: Expected to receive a Response output]`,
  );
  await ctx.close();
});
