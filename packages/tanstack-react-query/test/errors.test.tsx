import { testReactResource } from './__helpers';
import { useQuery } from '@tanstack/react-query';
import '@testing-library/react';
import type { TRPCClientErrorLike } from '@trpc/client';
import { createTRPCDeclaredError, initTRPC } from '@trpc/server';
import * as React from 'react';
import { expect, expectTypeOf, test, vi } from 'vitest';

test('declared errors are inferred and can be discriminated', async () => {
  const BadPhoneError = createTRPCDeclaredError('UNAUTHORIZED')
    .data<{
      reason: 'BAD_PHONE';
    }>()
    .create({
      constants: {
        reason: 'BAD_PHONE' as const,
      },
    });

  const t = initTRPC.create({
    errorFormatter(opts) {
      return {
        ...opts.shape,
        data: {
          ...opts.shape.data,
          foo: 'bar' as const,
        },
      };
    },
  });

  const appRouter = t.router({
    registered: t.procedure.errors([BadPhoneError]).query(() => {
      throw new BadPhoneError();
    }),
    unregistered: t.procedure.query(() => {
      throw new BadPhoneError();
    }),
  });

  await using ctx = testReactResource(appRouter);
  type AppError = TRPCClientErrorLike<typeof appRouter>;
  type RegisteredData = Extract<
    NonNullable<AppError['shape']>['data'],
    { reason: string }
  >;

  expectTypeOf<RegisteredData['reason']>().toEqualTypeOf<'BAD_PHONE'>();

  const queryErrorCallback = vi.fn();
  const { useTRPC } = ctx;

  function MyComponent() {
    const trpc = useTRPC();
    const registered = useQuery(
      trpc.registered.queryOptions(undefined, {
        retry: false,
      }),
    );
    const unregistered = useQuery(
      trpc.unregistered.queryOptions(undefined, {
        retry: false,
      }),
    );

    if (!registered.error || !unregistered.error) {
      return <>...</>;
    }

    if (
      registered.error.shape &&
      'reason' in registered.error.shape.data &&
      registered.error.shape.data.reason === 'BAD_PHONE'
    ) {
      registered.error.shape.data.reason;
    }

    if (
      unregistered.error.data &&
      'code' in unregistered.error.data &&
      unregistered.error.data.code === 'INTERNAL_SERVER_ERROR'
    ) {
      expectTypeOf(unregistered.error.data.foo).toEqualTypeOf<'bar'>();
    }

    if (
      unregistered.error.shape &&
      'code' in unregistered.error.shape.data &&
      unregistered.error.shape.data.code === 'INTERNAL_SERVER_ERROR'
    ) {
      expectTypeOf(unregistered.error.shape.data.foo).toEqualTypeOf<'bar'>();
    }

    queryErrorCallback({
      registered: registered.error,
      unregistered: unregistered.error,
    });
    return <>done</>;
  }

  const utils = ctx.renderApp(<MyComponent />);
  await vi.waitFor(() => {
    expect(utils.container).toHaveTextContent('done');
    expect(queryErrorCallback).toHaveBeenCalledOnce();
  });
});
