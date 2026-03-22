import type { TRPCClientError } from '@trpc/client';
import { createTRPCDeclaredError, initTRPC } from '@trpc/server';
import { expectTypeOf, test } from 'vitest';
import { createTRPCNext } from '../src';

test('declared errors are inferred and can be discriminated', () => {
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

  const trpc = createTRPCNext<typeof appRouter>({
    ssr: false,
    config() {
      return {
        links: [],
      } as any;
    },
  });

  type AppError = TRPCClientError<typeof appRouter>;
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

  function MyComponent() {
    const registered = trpc.registered.useQuery();
    const unregistered = trpc.unregistered.useQuery();

    if (registered.error && unregistered.error) {
      if (registered.error.isDeclaredError('BAD_PHONE')) {
        expectTypeOf(registered.error.data.reason).toEqualTypeOf<'BAD_PHONE'>();
      }

      if (unregistered.error.isFormattedError()) {
        expectTypeOf(unregistered.error.data.foo).toEqualTypeOf<'bar'>();
      }
    }

    return null;
  }

  expectTypeOf(MyComponent).toBeFunction();
});
