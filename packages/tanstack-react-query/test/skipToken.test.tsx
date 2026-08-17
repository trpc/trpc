import { testReactResource } from './__helpers';
import { skipToken } from '@tanstack/react-query';
import '@testing-library/react';
import { initTRPC } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import { describe, expect, test } from 'vitest';
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
    events: t.procedure
      .input(z.number())
      .subscription(async function* () {
        // stub — never called in these tests
        yield 0 as never;
      }),
  });

  return {
    ...testReactResource(appRouter),
    nextIterable,
  };
};

describe('skipToken', () => {
  test('various methods honour the skipToken', async () => {
    await using ctx = testContext();

    const { useTRPC } = ctx;
    function MyComponent() {
      const trpc = useTRPC();

      const options = trpc.post.byId.queryOptions(skipToken);
      expect(options.queryFn).toBe(skipToken);

      const options2 = trpc.post.list.infiniteQueryOptions(skipToken, {
        getNextPageParam() {
          return 'next';
        },
      });
      expect(options2.queryFn).toBe(skipToken);

      return <pre>OK</pre>;
    }

    const utils = ctx.renderApp(<MyComponent />);
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent(`OK`);
    });
  });

  test('subscriptionOptions(skipToken).enabled is false; normal input is enabled', async () => {
    // Regression test for https://github.com/trpc/trpc/issues/7373.
    // getQueryKeyInternal strips skipToken from the serialized queryKey args,
    // so reading `enabled` back from the queryKey was returning undefined (→ true).
    // The fix passes the raw `input` directly to trpcSubscriptionOptions instead.
    await using ctx = testContext();

    const { useTRPC } = ctx;
    function MyComponent() {
      const trpc = useTRPC();

      // skipToken case: must disable the subscription.
      const skipped = trpc.events.subscriptionOptions(skipToken, {});
      expect(skipped.enabled).toBe(false);

      // normal input case: must remain enabled (no explicit `enabled` override).
      const active = trpc.events.subscriptionOptions(42, {});
      expect(active.enabled).toBe(true);

      // explicit `enabled: false` override must still be respected.
      const forcedOff = trpc.events.subscriptionOptions(42, { enabled: false });
      expect(forcedOff.enabled).toBe(false);

      return <pre>OK</pre>;
    }

    const utils = ctx.renderApp(<MyComponent />);
    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent(`OK`);
    });
  });
});
