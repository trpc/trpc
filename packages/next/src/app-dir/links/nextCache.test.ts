import assert from 'node:assert';
import { createTRPCClient, isTRPCClientError } from '@trpc/client';
import { createTRPCDeclaredError, initTRPC } from '@trpc/server';
import { expectTypeOf, test, vi } from 'vitest';
import { experimental_nextCacheLink } from './nextCache';

vi.mock('next/cache', () => {
  return {
    unstable_cache: ((fn: (...args: any[]) => Promise<unknown>) => fn) as any,
  };
});

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

test('nextCacheLink preserves declared error discrimination', async () => {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
    // no-op
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

  const client = createTRPCClient<typeof appRouter>({
    links: [
      experimental_nextCacheLink({
        router: appRouter,
        createContext: async () => ({}),
      }),
    ],
  });

  try {
    const registeredError = await client.registered
      .query()
      .catch((cause) => cause);
    const unregisteredError = await client.unregistered
      .query()
      .catch((cause) => cause);

    assert(isTRPCClientError<typeof appRouter>(registeredError));
    assert(isTRPCClientError<typeof appRouter>(unregisteredError));

    expect(registeredError.isDeclaredError('BAD_PHONE')).toBe(true);
    if (registeredError.isDeclaredError('BAD_PHONE')) {
      expectTypeOf(registeredError.data.reason).toEqualTypeOf<'BAD_PHONE'>();
    }
    expect(registeredError.shape?.['~']).toEqual({
      kind: 'declared',
      declaredErrorKey: 'BAD_PHONE',
    });
    expect(registeredError.data).toEqual({
      reason: 'BAD_PHONE',
    });

    expect(unregisteredError.isFormattedError()).toBe(true);
    if (unregisteredError.isFormattedError()) {
      expectTypeOf(unregisteredError.data.foo).toEqualTypeOf<'bar'>();
    }
    expect(unregisteredError.shape?.['~']).toEqual({
      kind: 'formatted',
    });
    expect(unregisteredError.data).toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      foo: 'bar',
      httpStatus: 500,
      path: 'unregistered',
    });
  } finally {
    warnSpy.mockRestore();
  }
});
