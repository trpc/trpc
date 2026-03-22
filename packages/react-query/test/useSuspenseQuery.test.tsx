import { getServerAndReactClient } from './__reactHelpers';
import { doNotExecute } from '@trpc/server/__tests__/suppressLogs';
import { QueryErrorResetBoundary, skipToken } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react';
import { isTRPCClientError } from '@trpc/client';
import { createTRPCDeclaredError, initTRPC } from '@trpc/server';
import { konn } from 'konn';
import React from 'react';
import { z } from 'zod';

const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.create();
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

    return getServerAndReactClient(appRouter);
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();
test('useSuspenseQuery()', async () => {
  const { client, App } = ctx;
  function MyComponent() {
    const [data, query1] = client.post.byId.useSuspenseQuery(
      {
        id: '1',
      },
      {
        trpc: {
          context: {
            test: true,
          },
        },
      },
    );
    expectTypeOf(data).toEqualTypeOf<'__result'>();

    type TData = typeof data;
    expectTypeOf<TData>().toMatchTypeOf<'__result'>();
    expect(data).toBe('__result');
    expect(query1.data).toBe('__result');

    return <>{query1.data}</>;
  }

  const utils = render(
    <App>
      <MyComponent />
    </App>,
  );
  await vi.waitFor(() => {
    expect(utils.container).toHaveTextContent(`__result`);
  });

  expect(ctx.spyLink.mock.calls[0]?.[0].context).toMatchObject({
    test: true,
  });
});

test('useSuspenseQuery shouldnt accept skipToken', async () => {
  // @ts-expect-error skip token not allowed in useSuspenseQuery
  doNotExecute(() => ctx.client.post.byId.useSuspenseQuery(skipToken));
});

test('useSuspenseQuery declared errors are handled in an error boundary', async () => {
  const BadPhoneError = createTRPCDeclaredError({
    code: 'UNAUTHORIZED',
    key: 'BAD_PHONE',
  })
    .data<{
      reason: 'BAD_PHONE';
    }>()
    .create({
      constants: {
        reason: 'BAD_PHONE' as const,
      },
    });

  class TestErrorBoundary extends React.Component<
    {
      children: React.ReactNode;
      fallbackRender: (opts: {
        error: unknown;
        resetErrorBoundary: () => void;
      }) => React.ReactNode;
      onReset?: () => void;
    },
    { error: unknown }
  > {
    public override state = {
      error: null as unknown,
    };

    public static getDerivedStateFromError(error: unknown) {
      return { error };
    }

    private readonly resetErrorBoundary = () => {
      this.props.onReset?.();
      this.setState({ error: null });
    };

    public override render() {
      if (this.state.error) {
        return this.props.fallbackRender({
          error: this.state.error,
          resetErrorBoundary: this.resetErrorBoundary,
        });
      }

      return this.props.children;
    }
  }

  let shouldFail = true;
  const t = initTRPC.create();
  const appRouter = t.router({
    registered: t.procedure.errors([BadPhoneError]).query(() => {
      if (shouldFail) {
        throw new BadPhoneError();
      }

      return 'ok' as const;
    }),
  });

  const suspenseCtx = getServerAndReactClient(appRouter);

  try {
    const { client, App } = suspenseCtx;
    const boundaryErrorCallback = vi.fn();

    function SuspenseQueryComponent() {
      const [data] = client.registered.useSuspenseQuery(undefined, {
        retry: false,
      });

      return <>{data}</>;
    }

    const utils = render(
      <App>
        <QueryErrorResetBoundary>
          {({ reset }) => (
            <TestErrorBoundary
              onReset={reset}
              fallbackRender={({ error, resetErrorBoundary }) => {
                boundaryErrorCallback(error);

                if (
                  isTRPCClientError<typeof appRouter>(error) &&
                  error.isDeclaredError('BAD_PHONE')
                ) {
                  expectTypeOf(error.data.reason).toEqualTypeOf<'BAD_PHONE'>();

                  return (
                    <button
                      onClick={() => {
                        shouldFail = false;
                        resetErrorBoundary();
                      }}
                      type="button"
                    >
                      retry:{error.data.reason}
                    </button>
                  );
                }

                return <div>unexpected-error</div>;
              }}
            >
              <React.Suspense fallback={<div>loading</div>}>
                <SuspenseQueryComponent />
              </React.Suspense>
            </TestErrorBoundary>
          )}
        </QueryErrorResetBoundary>
      </App>,
    );

    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('retry:BAD_PHONE');
      expect(boundaryErrorCallback).toHaveBeenCalled();
    });

    fireEvent.click(utils.getByRole('button', { name: 'retry:BAD_PHONE' }));

    await vi.waitFor(() => {
      expect(utils.container).toHaveTextContent('ok');
    });
  } finally {
    await suspenseCtx.close?.();
  }
});
