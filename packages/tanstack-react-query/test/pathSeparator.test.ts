import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { QueryClient } from '@tanstack/react-query';
import { httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { createTRPCOptionsProxy } from '../src';

describe('pathSeparator', () => {
  test('query keys keep their shape and URLs use the separator', async () => {
    const t = initTRPC.create({ pathSeparator: '/' });
    const router = t.router({
      post: {
        byId: t.procedure
          .input(z.object({ id: z.number() }))
          .query((opts) => opts.input),
        add: t.procedure.input(z.string()).mutation((opts) => opts.input),
      },
      'flat.key': t.procedure.query(() => 'flat'),
    });

    const urls: string[] = [];
    await using ctx = testServerAndClientResource(router, {
      client: ({ httpUrl }) => ({
        links: [
          httpLink({
            url: httpUrl,
            pathSeparator: '/',
            fetch: (url, init) => {
              urls.push(new URL(String(url)).pathname);
              return fetch(url, init as RequestInit);
            },
          }),
        ],
      }),
    });
    const queryClient = new QueryClient();
    const trpc = createTRPCOptionsProxy({ client: ctx.client, queryClient });

    expect(trpc.post.byId.queryKey({ id: 1 })).toEqual([
      ['post', 'byId'],
      { input: { id: 1 }, type: 'query' },
    ]);
    expect(trpc.post.add.mutationKey()).toEqual([['post', 'add']]);
    // A key containing `.` keys and routes like a nested one, as it always has
    expect(trpc['flat.key'].queryKey()).toEqual([
      ['flat', 'key'],
      { type: 'query' },
    ]);

    expect(
      await queryClient.fetchQuery(trpc.post.byId.queryOptions({ id: 1 })),
    ).toEqual({ id: 1 });
    expect(await queryClient.fetchQuery(trpc['flat.key'].queryOptions())).toBe(
      'flat',
    );
    expect(urls).toEqual(['/post/byId', '/flat/key']);
  });
});
