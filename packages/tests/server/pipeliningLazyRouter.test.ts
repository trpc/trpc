import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import {
  experimental_nested,
  experimental_pipelining,
  httpBatchLink,
  httpBatchStreamLink,
} from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { lazy } from '@trpc/server/unstable-core-do-not-import';
import { z } from 'zod';

describe.each([
  { name: 'httpBatchLink', link: httpBatchLink },
  { name: 'httpBatchStreamLink', link: httpBatchStreamLink },
] as const)('$name', (scenario) => {
  test('a pipelined request retries a lazy router whose load failed, then reuses it', async () => {
    const t = initTRPC.create();
    const authorRouter = t.router({
      byId: t.procedure
        .input(z.object({ id: z.string() }))
        .query((opts) => ({ id: opts.input.id })),
    });
    const loader = vi.fn(async () => authorRouter);
    loader.mockRejectedValueOnce(new Error('Loading failed'));
    const router = t.router({
      post: {
        list: t.procedure.query(() => ({
          items: [{ authorId: 'ada' }, { authorId: 'bob' }],
        })),
      },
      // Only the calls the server fills in read it
      author: lazy(loader),
    });

    await using ctx = testServerAndClientResource(router, {
      server: { experimental_allowPipelining: true },
      client: (clientOpts) => ({
        links: [
          scenario.link({
            url: clientOpts.httpUrl,
            experimental_pipelining: experimental_pipelining(),
          }),
        ],
      }),
    });

    const load = () =>
      experimental_nested(ctx.client, (q) =>
        q.post.list.query().items.map((post) => ({
          author: q.author.byId.query({ id: post.authorId }),
        })),
      );

    await expect(load()).rejects.toThrow('Loading failed');
    expect(loader).toHaveBeenCalledTimes(1);

    const loaded = await load();
    expect(await Promise.all(loaded.map((it) => it.edges.author))).toEqual([
      { id: 'ada' },
      { id: 'bob' },
    ]);
    await load();
    expect(loader).toHaveBeenCalledTimes(2);
    // Each load was one pipelined request
    expect(
      ctx.onRequestSpy.mock.calls.map(([req]) => {
        const url = new URL(req.url!, 'http://localhost');
        return [url.pathname, url.searchParams.get('batch')];
      }),
    ).toEqual(
      Array.from({ length: 3 }, () => ['/post.list,author.byId', 'pipeline']),
    );
  });
});
