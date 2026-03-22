import { createTRPCDeclaredError, initTRPC } from '@trpc/server';
import { expectTypeOf, test } from 'vitest';
import { createTRPCNext } from '../src';

test('declared errors are inferred and can be discriminated', () => {
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

  const trpc = createTRPCNext<typeof appRouter>({
    ssr: false,
    config() {
      return {
        links: [],
      } as any;
    },
  });

  function MyComponent() {
    const registered = trpc.registered.useQuery();
    const unregistered = trpc.unregistered.useQuery();

    if (registered.error && unregistered.error) {
      if (
        registered.error.shape &&
        'reason' in registered.error.shape.data &&
        registered.error.shape.data.reason === 'BAD_PHONE'
      ) {
        expectTypeOf(
          registered.error.shape.data.reason,
        ).toEqualTypeOf<'BAD_PHONE'>();
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
    }

    return null;
  }

  expectTypeOf(MyComponent).toBeFunction();
});
