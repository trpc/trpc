import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getUntypedClient } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';
import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import type { ReactNode } from 'react';
import React from 'react';
import { z } from 'zod';

describe('mutation override', () => {
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create();
      interface Post {
        title: string;
      }
      const onSuccessSpy = vi.fn();
      const onErrorSpy = vi.fn();
      const defaultOnErrorSpy = vi.fn();

      const posts: Post[] = [];

      const appRouter = t.router({
        list: t.procedure.query(() => posts),
        add: t.procedure.input(z.string()).mutation(({ input }) => {
          posts.push({
            title: input,
          });
        }),
        fail: t.procedure.input(z.string()).mutation(({ input }) => {
          throw new Error(input);
        }),
      });
      const opts = testServerAndClientResource(appRouter);
      const trpc = createTRPCReact<typeof appRouter>({
        overrides: {
          useMutation: {
            async onSuccess(opts) {
              if (!opts.meta['skipInvalidate']) {
                await opts.originalFn();
                await opts.queryClient.invalidateQueries();
              }
              onSuccessSpy(opts);
            },
            async onError(opts) {
              await opts.originalFn();
              onErrorSpy(opts);
            },
          },
        },
      });

      const queryClient = new QueryClient({
        defaultOptions: {
          mutations: {
            onError: defaultOnErrorSpy,
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
        onErrorSpy,
        defaultOnErrorSpy,
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

    await vi.waitFor(() => {
      expect($.container).toHaveTextContent(nonce);
    });
  });

  test('skip invalidate', async () => {
    const { trpc } = ctx;
    const nonce = `nonce-${Math.random()}`;
    function MyComp() {
      const listQuery = trpc.list.useQuery();
      const mutation = trpc.add.useMutation({
        meta: {
          skipInvalidate: true,
        },
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

    await vi.waitFor(() => {
      expect(ctx.onSuccessSpy).toHaveBeenCalledTimes(1);
    });

    expect(ctx.onSuccessSpy.mock.calls[0]![0]!.meta).toMatchInlineSnapshot(`
      Object {
        "skipInvalidate": true,
      }
    `);

    await vi.waitFor(() => {
      expect($.container).not.toHaveTextContent(nonce);
    });
  });

  test('local onError runs before the tRPC onError override', async () => {
    const { trpc } = ctx;
    const localOnErrorSpy = vi.fn();

    function MyComp() {
      const mutation = trpc.fail.useMutation({
        onError: (error) => {
          localOnErrorSpy(error);
        },
      });

      return (
        <button
          onClick={() => {
            mutation.mutate('boom');
          }}
          data-testid="fail"
        >
          fail
        </button>
      );
    }

    const $ = render(
      <ctx.App>
        <MyComp />
      </ctx.App>,
    );

    await userEvent.click($.getByTestId('fail'));

    await vi.waitFor(() => {
      expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
    });

    expect(localOnErrorSpy).toHaveBeenCalledTimes(1);
    expect(localOnErrorSpy).toHaveBeenCalledBefore(ctx.onErrorSpy);
  });

  test('local onError takes precedence over QueryClient default onError', async () => {
    const { trpc } = ctx;
    const localOnErrorSpy = vi.fn();

    function MyComp() {
      const mutation = trpc.fail.useMutation({
        onError: (error) => {
          localOnErrorSpy(error);
        },
      });

      return (
        <button
          onClick={() => {
            mutation.mutate('boom');
          }}
          data-testid="fail"
        >
          fail
        </button>
      );
    }

    const $ = render(
      <ctx.App>
        <MyComp />
      </ctx.App>,
    );

    await userEvent.click($.getByTestId('fail'));

    await vi.waitFor(() => {
      expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
    });

    expect(localOnErrorSpy).toHaveBeenCalledTimes(1);
    expect(ctx.defaultOnErrorSpy).not.toHaveBeenCalled();
    expect(localOnErrorSpy).toHaveBeenCalledBefore(ctx.onErrorSpy);
  });

  test('QueryClient default onError runs when no local onError is provided', async () => {
    const { trpc } = ctx;

    function MyComp() {
      const mutation = trpc.fail.useMutation();

      return (
        <button
          onClick={() => {
            mutation.mutate('boom');
          }}
          data-testid="fail"
        >
          fail
        </button>
      );
    }

    const $ = render(
      <ctx.App>
        <MyComp />
      </ctx.App>,
    );

    await userEvent.click($.getByTestId('fail'));

    await vi.waitFor(() => {
      expect(ctx.onErrorSpy).toHaveBeenCalledTimes(1);
    });

    expect(ctx.defaultOnErrorSpy).toHaveBeenCalledTimes(1);
    expect(ctx.defaultOnErrorSpy).toHaveBeenCalledBefore(ctx.onErrorSpy);
  });
});
