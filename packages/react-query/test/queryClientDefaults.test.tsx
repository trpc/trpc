import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getUntypedClient } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import type { ReactNode } from 'react';
import React from 'react';
import { z } from 'zod';

describe('query client defaults', () => {
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create();
      interface Post {
        title: string;
      }
      const onSuccessSpy = vi.fn();

      const posts: Post[] = [];

      const appRouter = t.router({
        list: t.procedure.query(() => posts),
        add: t.procedure.input(z.string()).mutation(({ input }) => {
          posts.push({
            title: input,
          });
        }),
      });
      const opts = testServerAndClientResource(appRouter);
      const trpc = createTRPCReact<typeof appRouter>();

      const queryClient = new QueryClient({
        defaultOptions: {
          mutations: {
            onSuccess: async (opts) => {
              await queryClient.invalidateQueries();
              onSuccessSpy(opts);
            },
          },
        },
      });

      function App(props: { children: ReactNode }) {
        return (
          <trpc.Provider
            {...{ queryClient, client: getUntypedClient(opts.client) }}
          >
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
        onSuccessSpy,
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
          <button
            onClick={() => {
              mutation.mutate(nonce);
            }}
            data-testid="add"
          >
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

    await userEvent.click($.getByTestId('add'));

    await waitFor(() => {
      expect($.container).toHaveTextContent(nonce);
    });
  });

  test('skip invalidate', async () => {
    const { trpc } = ctx;
    const nonce = `nonce-${Math.random()}`;
    const onSuccessLocalSpy = vi.fn().mockReturnValue('something');

    function MyComp() {
      const listQuery = trpc.list.useQuery();
      const mutation = trpc.add.useMutation({
        onSuccess: () => onSuccessLocalSpy(),
      });

      return (
        <>
          <button
            onClick={() => {
              mutation.mutate(nonce);
            }}
            data-testid="add"
          >
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

    await userEvent.click($.getByTestId('add'));

    await waitFor(() => {
      expect(ctx.onSuccessSpy).not.toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(onSuccessLocalSpy).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect($.container).not.toHaveTextContent(nonce);
    });
  });
});
