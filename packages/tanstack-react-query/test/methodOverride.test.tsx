import { getServerAndReactClient } from './__helpers';
import { useQuery } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { initTRPC } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import { describe, expect, expectTypeOf, test } from 'vitest';
import { z } from 'zod';

const setupTest = (
  methods: Record<string, (...args: unknown[]) => unknown>,
) => {
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
      byIdWithSerializable: t.procedure
        .input(
          z.object({
            id: z.string(),
          }),
        )
        .query(() => ({
          id: 1,
          date: new Date(),
        })),
      iterable: t.procedure.query(async function* () {
        for (let i = 0; i < 3; i++) {
          await iterableDeferred.promise;
          yield i + 1;
        }
      }),
    }),
  });

  const testHelpers = getServerAndReactClient(appRouter, {
    methods: methods,
  });

  return {
    ...testHelpers,
    nextIterable,
    [Symbol.asyncDispose]: async () => {
      await testHelpers.close();
    },
  };
};

declare module '@trpc/tanstack-react-query' {
  interface DecorateQueryKeyable {
    myQueryKeyableMethod: (input: string) => string;
  }
}

describe('methodOverrides', () => {
  test('basic', async () => {
    await using testContext = setupTest({
      myQueryKeyableMethod: (options, ...methodInput) => {
        console.log('options', options);
        console.log('methodInput', methodInput);
        return 'xxx';
      },
    });

    const { useTRPC, App } = testContext;

    function MyComponent() {
      const trpc = useTRPC();
      const str = trpc.post.myQueryKeyableMethod('woohoo');

      expect(typeof str).toBe('string');
      expectTypeOf(str).toBeString();

      return null;
    }

    const $ = render(
      <App>
        <MyComponent />
      </App>,
    );
  });
});
