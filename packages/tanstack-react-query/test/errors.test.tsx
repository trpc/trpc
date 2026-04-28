import { testReactResource } from './__helpers';
import {
  QueryErrorResetBoundary,
  useQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { isTRPCClientError, type TRPCClientErrorLike } from '@trpc/client';
import { createTRPCDeclaredError, initTRPC } from '@trpc/server';
import * as React from 'react';
import { expect, expectTypeOf, test, vi } from 'vitest';
import { z } from 'zod';

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

test('declared errors are inferred and can be discriminated', async () => {
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
  type RegisteredShape = Extract<
    NonNullable<AppError['shape']>,
    { '~': { declaredErrorKey: 'BAD_PHONE' } }
  >;
  type FormattedShape = Extract<
    NonNullable<AppError['shape']>,
    { '~': { kind: 'formatted' } }
  >;

  expectTypeOf<
    RegisteredShape['data']['reason']
  >().toEqualTypeOf<'BAD_PHONE'>();
  expectTypeOf<FormattedShape['data']['foo']>().toEqualTypeOf<'bar'>();

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

    if (registered.error.isDeclaredError('BAD_PHONE')) {
      expectTypeOf(registered.error.data.reason).toEqualTypeOf<'BAD_PHONE'>();
    }

    if (unregistered.error.isFormattedError()) {
      expectTypeOf(unregistered.error.data.foo).toEqualTypeOf<'bar'>();
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

  const errors = queryErrorCallback.mock.calls[0]?.[0];

  expect(errors?.registered.shape?.['~']).toEqual({
    kind: 'declared',
    declaredErrorKey: 'BAD_PHONE',
  });
  expect(errors?.registered.data).toEqual({
    reason: 'BAD_PHONE',
  });

  expect(errors?.unregistered.shape?.['~']).toEqual({
    kind: 'formatted',
  });
  expect(errors?.unregistered.data).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    foo: 'bar',
    httpStatus: 500,
    path: 'unregistered',
  });
});

test('TanStack query errors should narrow per procedure with duplicate declared-error keys/shapes', async () => {
  const PhoneContactInvalidError = createTRPCDeclaredError({
    code: 'BAD_REQUEST',
    key: 'CONTACT_INVALID',
  })
    .data<{
      channel: 'phone';
      phoneNumber: string;
    }>()
    .create();

  const EmailContactInvalidError = createTRPCDeclaredError({
    code: 'BAD_REQUEST',
    key: 'CONTACT_INVALID',
  })
    .data<{
      channel: 'email';
      emailAddress: string;
    }>()
    .create();

  type EmailContactInvalidData = {
    channel: 'email';
    emailAddress: string;
  };

  type PhoneContactInvalidData = {
    channel: 'phone';
    phoneNumber: string;
  };

  const t = initTRPC.create();

  const appRouter = t.router({
    duplicateKeySameProcedure: t.procedure
      .errors([PhoneContactInvalidError, EmailContactInvalidError])
      .input(
        z.object({
          channel: z.enum(['phone', 'email']),
        }),
      )
      .query(({ input }) => {
        if (input.channel === 'phone') {
          throw new PhoneContactInvalidError({
            channel: 'phone',
            phoneNumber: '+441234567890',
          });
        }

        throw new EmailContactInvalidError({
          channel: 'email',
          emailAddress: 'bad@example.com',
        });
      }),
    duplicateKeyPhoneProcedure: t.procedure
      .errors([PhoneContactInvalidError])
      .query(() => {
        throw new PhoneContactInvalidError({
          channel: 'phone',
          phoneNumber: '+441234567890',
        });
      }),
    duplicateKeyEmailProcedure: t.procedure
      .errors([EmailContactInvalidError])
      .query(() => {
        throw new EmailContactInvalidError({
          channel: 'email',
          emailAddress: 'bad@example.com',
        });
      }),
  });

  await using ctx = testReactResource(appRouter);
  const queryErrorCallback = vi.fn();
  const { useTRPC } = ctx;

  function MyComponent() {
    const trpc = useTRPC();
    const sameProcedure = useQuery(
      trpc.duplicateKeySameProcedure.queryOptions(
        { channel: 'phone' },
        { retry: false },
      ),
    );
    const phone = useQuery(
      trpc.duplicateKeyPhoneProcedure.queryOptions(undefined, {
        retry: false,
      }),
    );
    const email = useQuery(
      trpc.duplicateKeyEmailProcedure.queryOptions(undefined, {
        retry: false,
      }),
    );

    if (!sameProcedure.error || !phone.error || !email.error) {
      return <>...</>;
    }

    if (sameProcedure.error.isDeclaredError('CONTACT_INVALID')) {
      expectTypeOf(sameProcedure.error.data).toEqualTypeOf<
        EmailContactInvalidData | PhoneContactInvalidData
      >();
    }

    if (phone.error.isDeclaredError('CONTACT_INVALID')) {
      expectTypeOf(phone.error.data).toEqualTypeOf<{
        channel: 'phone';
        phoneNumber: string;
      }>();
    }

    if (email.error.isDeclaredError('CONTACT_INVALID')) {
      expectTypeOf(email.error.data).toEqualTypeOf<{
        channel: 'email';
        emailAddress: string;
      }>();
    }

    queryErrorCallback({
      sameProcedure: sameProcedure.error,
      phone: phone.error,
      email: email.error,
    });
    return <>done</>;
  }

  const utils = ctx.renderApp(<MyComponent />);
  await vi.waitFor(() => {
    expect(utils.container).toHaveTextContent('done');
    expect(queryErrorCallback).toHaveBeenCalledOnce();
  });

  const errors = queryErrorCallback.mock.calls[0]?.[0];

  expect(errors?.sameProcedure.shape?.['~']).toEqual({
    kind: 'declared',
    declaredErrorKey: 'CONTACT_INVALID',
  });
  expect(errors?.sameProcedure.data).toEqual({
    channel: 'phone',
    phoneNumber: '+441234567890',
  });

  expect(errors?.phone.shape?.['~']).toEqual({
    kind: 'declared',
    declaredErrorKey: 'CONTACT_INVALID',
  });
  expect(errors?.phone.data).toEqual({
    channel: 'phone',
    phoneNumber: '+441234567890',
  });

  expect(errors?.email.shape?.['~']).toEqual({
    kind: 'declared',
    declaredErrorKey: 'CONTACT_INVALID',
  });
  expect(errors?.email.data).toEqual({
    channel: 'email',
    emailAddress: 'bad@example.com',
  });
});

test('TanStack suspense query declared errors are handled in an error boundary', async () => {
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

  await using ctx = testReactResource(appRouter);
  const boundaryErrorCallback = vi.fn();
  const { useTRPC } = ctx;

  function SuspenseQueryComponent() {
    const trpc = useTRPC();
    const { data } = useSuspenseQuery(
      trpc.registered.queryOptions(undefined, {
        retry: false,
      }),
    );

    return <>{data}</>;
  }

  const utils = ctx.renderApp(
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
    </QueryErrorResetBoundary>,
  );

  await vi.waitFor(() => {
    expect(utils.container).toHaveTextContent('retry:BAD_PHONE');
    expect(boundaryErrorCallback).toHaveBeenCalled();
  });

  fireEvent.click(utils.getByRole('button', { name: 'retry:BAD_PHONE' }));

  await vi.waitFor(() => {
    expect(utils.container).toHaveTextContent('ok');
  });
});
