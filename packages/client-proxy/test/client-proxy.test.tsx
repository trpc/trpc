import { testReactResource } from './__helpers';
import { waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initTRPC } from '@trpc/server';
import { createDeferred } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { createTRPCClientProxy } from '../src';

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
    }),
  });

  return {
    ...testReactResource(appRouter),
    nextIterable,
  };
};

describe('client-proxy factory', () => {
  test('custom proxy', async () => {
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
        create: t.procedure
          .input(
            z.object({
              name: z.string(),
            }),
          )
          .mutation(() => '__result' as const),
      }),
    });

    const proxy = createTRPCClientProxy({
      router: appRouter,
      ctx: () => ({}),
    })({
      queries: {
        query(opts) {
          // opts.path
          // opts.call()
          return () => opts.path;
        },
      },
      mutations: {
        mutate(opts) {
          return () => opts.path;
        },
      },
    });

    proxy.post.byId.query();
    //              ^?
    proxy.post.create.mutate();
    //              ^?

    // proxy.post.byId
  });
  // test('fetch and use the client', async () => {
  //   await using ctx = testContext();
  //   const { useTRPCClient } = ctx;
  //   function MyComponent() {
  //     const vanillaClient = useTRPCClient();
  //     const [fetchedState, setFetchedState] = React.useState('');
  //     async function fetch() {
  //       const state = await vanillaClient.post.byId.query({ id: '1' });
  //       expectTypeOf<'__result'>(state);
  //       setFetchedState(state);
  //     }
  //     return (
  //       <>
  //         <button data-testid="fetch" onClick={fetch}>
  //           fetch
  //         </button>
  //         <pre>Fetched: {fetchedState}</pre>
  //       </>
  //     );
  //   }
  //   const utils = ctx.renderApp(<MyComponent />);
  //   await userEvent.click(utils.getByTestId('fetch'));
  //   await waitFor(() => {
  //     expect(utils.container).toHaveTextContent(`Fetched: __result`);
  //   });
  // });
});
