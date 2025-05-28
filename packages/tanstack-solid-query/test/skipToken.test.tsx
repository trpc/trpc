import { testSolidResource } from './__helpers';
import { skipToken } from '@tanstack/solid-query';
import '@solidjs/testing-library';
import { initTRPC } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

const testContext = () => {
  let iterableDeferred = createDeferred<void>();
  const nextIterable = () => {
    iterableDeferred.resolve();
    iterableDeferred = createDeferred();
  };
  const t = initTRPC.create({});

  const appRouter = t.router({
    post: t.router({
      byId: t.procedure
        .input(
          z.object({
            id: z.string(),
          }),
        )
        .query(() => '__result' as const),
      list: t.procedure
        .input(
          z.object({
            cursor: z.string(),
          }),
        )
        .query(() => ['__result'] as const),
    }),
  });

  return {
    ...testSolidResource(appRouter),
    nextIterable,
  };
};

describe('skipToken', () => {
  test('various methods honour the skipToken', async () => {
    const ctx = testContext();
    try {
      const { useTRPC } = ctx;
      function MyComponent() {
        const trpc = useTRPC();

        const options = trpc.post.byId.queryOptions(skipToken);
        expect(options.queryFn).toBe(skipToken);

        const options2 = trpc.post.list.infiniteQueryOptions(skipToken);
        expect(options2.queryFn).toBe(skipToken);

        return <pre>OK</pre>;
      }

      const utils = ctx.renderApp(<MyComponent />);
      await vi.waitFor(() => {
        expect(utils.container).toHaveTextContent(`OK`);
      });
    } finally {
      await ctx[Symbol.asyncDispose]();
    }
  });
});
