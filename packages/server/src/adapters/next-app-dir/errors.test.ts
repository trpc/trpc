import assert from 'node:assert';
import { beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest';
import {
  createTRPCDeclaredError,
  initTRPC,
  TRPCError,
} from '../../@trpc/server';
import { safe } from './errors';
import { nextAppDirCaller } from './nextAppDirCaller';
import { notFound } from './notFound';
import { redirect } from './redirect';

const nextNavigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    const error = new Error('NEXT_REDIRECT') as Error & { digest: string };
    error.digest = `NEXT_REDIRECT;replace;${url};307`;
    throw error;
  }),
  notFound: vi.fn(() => {
    const error = new Error('NEXT_NOT_FOUND') as Error & { digest: string };
    error.digest = 'NEXT_NOT_FOUND';
    throw error;
  }),
}));

vi.mock('next/navigation', () => nextNavigation);

describe('next-app-dir errors helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  test('safe returns typed result for success', async () => {
    const t = initTRPC.create();
    const base = t.procedure.experimental_caller(
      nextAppDirCaller({
        onError: () => {
          //
        },
      }),
    );

    const proc = base.query(async () => 'hello' as const);

    const [result, error] = await safe(proc());

    expectTypeOf(result).toEqualTypeOf<'hello' | undefined>();
    expectTypeOf(error).toEqualTypeOf<TRPCError | null>();
    expect(result).toBe('hello');
    expect(error).toBeNull();
  });

  test('safe returns typed declared error for registered declared errors', async () => {
    const onError = vi.fn();
    const t = initTRPC.create();
    const base = t.procedure.experimental_caller(
      nextAppDirCaller({
        onError,
      }),
    );

    const proc = base.errors([BadPhoneError]).query(() => {
      throw new BadPhoneError();
    });

    const [result, error] = await safe(proc());

    expect(result).toBeUndefined();
    assert(error);
    assert(error instanceof BadPhoneError);
    expectTypeOf(
      error.toShape()['~'].declaredErrorKey,
    ).toEqualTypeOf<'BAD_PHONE'>();
    expectTypeOf(error.reason).toEqualTypeOf<'BAD_PHONE'>();
    expectTypeOf(error.message).toEqualTypeOf<'UNAUTHORIZED'>();
    expect(error.toShape()).toEqual({
      code: -32001,
      message: 'UNAUTHORIZED',
      '~': {
        kind: 'declared',
        declaredErrorKey: 'BAD_PHONE',
      },
      data: {
        reason: 'BAD_PHONE',
      },
    });
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]?.error).toBe(error);
  });

  test('safe returns TRPCError for unregistered declared errors', async () => {
    const onError = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      // no-op
    });
    const t = initTRPC.create();
    const base = t.procedure.experimental_caller(
      nextAppDirCaller({
        onError,
      }),
    );

    const proc = base.query(() => {
      throw new BadPhoneError();
    });

    try {
      const [result, error] = await safe(proc());

      expectTypeOf(result).toEqualTypeOf<undefined>();
      expectTypeOf(error).toEqualTypeOf<TRPCError | null>();
      expect(result).toBeUndefined();
      assert(error instanceof TRPCError);
      expect(error).not.toBeInstanceOf(BadPhoneError);
      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(error.message).toBe('An unrecognized error occurred');
      assert(error.cause instanceof BadPhoneError);
      expect(error.cause.toShape()).toEqual({
        code: -32001,
        message: 'UNAUTHORIZED',
        '~': {
          kind: 'declared',
          declaredErrorKey: 'BAD_PHONE',
        },
        data: {
          reason: 'BAD_PHONE',
        },
      });
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0]?.[0]?.error).toBe(error);
      expect(warnSpy).toHaveBeenCalledOnce();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('safe rethrows redirect errors handled by Next.js', async () => {
    const t = initTRPC.create();
    const base = t.procedure.experimental_caller(
      nextAppDirCaller({
        onError: () => {
          //
        },
      }),
    );

    const proc = base.query(() => redirect('/dashboard'));

    await expect(safe(proc())).rejects.toMatchObject({
      digest: 'NEXT_REDIRECT;replace;/dashboard;307',
    });
    expect(nextNavigation.redirect).toHaveBeenCalledWith(
      '/dashboard',
      undefined,
    );
  });

  test('safe rethrows notFound errors handled by Next.js', async () => {
    const t = initTRPC.create();
    const base = t.procedure.experimental_caller(
      nextAppDirCaller({
        onError: () => {
          //
        },
      }),
    );

    const proc = base.query(() => notFound());

    await expect(safe(proc())).rejects.toMatchObject({
      digest: 'NEXT_NOT_FOUND',
    });
    expect(nextNavigation.notFound).toHaveBeenCalledOnce();
  });
});
