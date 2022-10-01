import { routerToServerAndClientNew } from '../___testHelpers';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { createTRPCReact } from '@trpc/react';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import React, { ReactNode } from 'react';
import { z } from 'zod';

describe('mutation override', () => {
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create();
      interface Post {
        title: string;
      }

      const posts: Post[] = [];

      const appRouter = t.router({
        list: t.procedure.query(() => posts),
        add: t.procedure.input(z.string()).mutation(({ input }) => {
          posts.push({
            title: input,
          });
        }),
      });
      const opts = routerToServerAndClientNew(appRouter);
      const trpc = createTRPCReact<typeof appRouter>({
        unstable_overrides: {
          useMutation: {
            async onSuccess(opts) {
              await opts.originalFn();
              await opts.queryClient.invalidateQueries();
            },
          },
        },
      });

      const queryClient = new QueryClient();

      function App(props: { children: ReactNode }) {
        return (
          <trpc.Provider {...{ queryClient, client: opts.client }}>
            <QueryClientProvider client={queryClient}>
              {props.children}
            </QueryClientProvider>
          </trpc.Provider>
        );
      }
      return {
        ...opts,
        App,
        trpc,
      };
    })
    .afterEach(async (opts) => {
      await opts?.close?.();
    })
    .done();

  test('clear cache on every mutation', async () => {
    const { trpc } = ctx;
    const nonce = `nonce-${Math.random()}`;
    function MyComp() {
      const listQuery = trpc.list.useQuery();
      const mutation = trpc.add.useMutation();

      return (
        <>
          <button onClick={() => mutation.mutate(nonce)} data-testid="add">
            add
          </button>
          <pre>{JSON.stringify(listQuery.data ?? null, null, 4)}</pre>
        </>
      );
    }

    const $ = render(
      <ctx.App>
        <MyComp />
      </ctx.App>,
    );

    $.getByTestId('add').click();

    await waitFor(() => {
      expect($.container).toHaveTextContent(nonce);
    });
  });
});
