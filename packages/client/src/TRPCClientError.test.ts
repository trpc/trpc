import assert from 'node:assert';
import { waitError } from '@trpc/server/__tests__/waitError';
import type { AnyRouter } from '@trpc/server';
import { createTRPCDeclaredError, initTRPC } from '@trpc/server';
import { createTRPCClient } from './createTRPCClient';
import { unstable_localLink, type LocalLinkOptions } from './links/localLink';
import { TRPCClientError } from './TRPCClientError';

function getClient<TRouter extends AnyRouter>(opts: LocalLinkOptions<TRouter>) {
  const onError = vi.fn<NonNullable<LocalLinkOptions<TRouter>['onError']>>();
  const client = createTRPCClient<TRouter>({
    links: [
      unstable_localLink({
        onError,
        ...opts,
      }),
    ],
  });

  return {
    client,
    onError,
  };
}

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

const PaymentError = createTRPCDeclaredError({
  code: 'PAYMENT_REQUIRED',
  key: 'PAYMENT_ERROR',
})
  .data<{
    reason: 'PAYMENT_ERROR';
  }>()
  .create({
    constants: {
      reason: 'PAYMENT_ERROR' as const,
    },
  });

function setup() {
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
    payment: t.procedure.errors([PaymentError]).query(() => {
      throw new PaymentError();
    }),
    unregistered: t.procedure.query(() => {
      throw new BadPhoneError();
    }),
  });

  const { client } = getClient<typeof appRouter>({
    router: appRouter,
    createContext: async () => ({}),
  });

  return {
    appRouter,
    client,
  };
}

async function createTestContext() {
  const { client, appRouter } = setup();

  const badPhone = await waitError<TRPCClientError<typeof appRouter>>(
    client.registered.query(),
  );
  const payment = await waitError<TRPCClientError<typeof appRouter>>(
    client.payment.query(),
  );
  const formatted = await waitError<TRPCClientError<typeof appRouter>>(
    client.unregistered.query(),
  );

  const cause = new Error('boom');
  const unknown = TRPCClientError.from<typeof appRouter>(cause);

  return {
    appRouter,
    errors: {
      badPhone,
      payment,
      formatted,
      unknown,
    },
    cause,
  };
}

type TestContext = Awaited<ReturnType<typeof createTestContext>>;

describe('TRPCClientError', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await createTestContext();
  });

  describe('discriminator', () => {
    test('returns an unknown discriminator for unknown errors', () => {
      expectTypeOf(ctx.errors.unknown.discriminator.kind).toEqualTypeOf<
        'declared' | 'formatted' | 'unknown'
      >();

      expect(ctx.errors.unknown.discriminator).toEqual({
        kind: 'unknown',
        shape: undefined,
        cause: ctx.cause,
      });

      expect(ctx.errors.unknown.shape).toBeUndefined();
      expect(ctx.errors.unknown.data).toBeUndefined();
    });

    test('returns a declared discriminator for BAD_PHONE errors', () => {
      const discriminator = ctx.errors.badPhone.discriminator;

      expect(discriminator).toMatchObject({
        kind: 'declared',
        key: 'BAD_PHONE',
        shape: ctx.errors.badPhone.shape,
      });
      expect(discriminator.cause).toBeInstanceOf(Error);

      if (discriminator.kind !== 'declared') {
        assert.fail('expected a declared discriminator');
      }
      if (discriminator.key !== 'BAD_PHONE') {
        assert.fail('expected BAD_PHONE discriminator key');
      }

      expectTypeOf(discriminator.key).toEqualTypeOf<'BAD_PHONE'>();
      expectTypeOf(discriminator.shape['~'].kind).toEqualTypeOf<'declared'>();
      expectTypeOf(
        discriminator.shape['~'].declaredErrorKey,
      ).toEqualTypeOf<'BAD_PHONE'>();
      expect(discriminator.shape.data).toEqual({
        reason: 'BAD_PHONE',
      });
    });

    test('returns a declared discriminator for PAYMENT_ERROR errors', () => {
      const discriminator = ctx.errors.payment.discriminator;

      expect(discriminator).toMatchObject({
        kind: 'declared',
        key: 'PAYMENT_ERROR',
        shape: ctx.errors.payment.shape,
      });
      expect(discriminator.cause).toBeInstanceOf(Error);

      if (discriminator.kind !== 'declared') {
        assert.fail('expected a declared discriminator');
      }
      if (discriminator.key !== 'PAYMENT_ERROR') {
        assert.fail('expected PAYMENT_ERROR discriminator key');
      }

      expectTypeOf(discriminator.key).toEqualTypeOf<'PAYMENT_ERROR'>();
      expectTypeOf(discriminator.shape['~'].kind).toEqualTypeOf<'declared'>();
      expectTypeOf(
        discriminator.shape['~'].declaredErrorKey,
      ).toEqualTypeOf<'PAYMENT_ERROR'>();
      expect(discriminator.shape.data).toEqual({
        reason: 'PAYMENT_ERROR',
      });
    });

    test('returns a formatted discriminator for formatted errors', () => {
      const discriminator = ctx.errors.formatted.discriminator;

      expect(discriminator).toMatchObject({
        kind: 'formatted',
        shape: ctx.errors.formatted.shape,
      });
      expect(discriminator.cause).toBeInstanceOf(Error);

      if (discriminator.kind !== 'formatted') {
        assert.fail('expected a formatted discriminator');
      }

      expectTypeOf(discriminator.shape['~'].kind).toEqualTypeOf<'formatted'>();
      expect(discriminator.shape.data).toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        foo: 'bar',
        httpStatus: 500,
        path: 'unregistered',
      });
    });
  });

  describe('guards', () => {
    test('isDeclaredError narrows declared BAD_PHONE errors', () => {
      expect(ctx.errors.badPhone.isDeclaredError()).toBe(true);

      if (!ctx.errors.badPhone.isDeclaredError()) {
        assert.fail('expected BAD_PHONE error to be declared');
      }

      expectTypeOf(
        ctx.errors.badPhone.discriminator.kind,
      ).toEqualTypeOf<'declared'>();
      expect(ctx.errors.badPhone.discriminator.key).toBe('BAD_PHONE');
    });

    test('isDeclaredError narrows declared PAYMENT_ERROR errors', () => {
      expect(ctx.errors.payment.isDeclaredError()).toBe(true);

      if (!ctx.errors.payment.isDeclaredError()) {
        assert.fail('expected PAYMENT_ERROR error to be declared');
      }

      expectTypeOf(
        ctx.errors.payment.discriminator.kind,
      ).toEqualTypeOf<'declared'>();
      expect(ctx.errors.payment.discriminator.key).toBe('PAYMENT_ERROR');
    });

    test('isDeclaredError(key) narrows BAD_PHONE to the specific key', () => {
      expect(ctx.errors.badPhone.isDeclaredError('BAD_PHONE')).toBe(true);
      expect(ctx.errors.badPhone.isDeclaredError('PAYMENT_ERROR')).toBe(false);

      if (!ctx.errors.badPhone.isDeclaredError('BAD_PHONE')) {
        assert.fail('expected BAD_PHONE error to match its declared key');
      }

      expectTypeOf(
        ctx.errors.badPhone.discriminator.key,
      ).toEqualTypeOf<'BAD_PHONE'>();
      expectTypeOf(
        ctx.errors.badPhone.shape['~'].declaredErrorKey,
      ).toEqualTypeOf<'BAD_PHONE'>();
      expectTypeOf(
        ctx.errors.badPhone.data.reason,
      ).toEqualTypeOf<'BAD_PHONE'>();
      expect(ctx.errors.badPhone.data.reason).toBe('BAD_PHONE');
    });

    test('isDeclaredError(key) narrows PAYMENT_ERROR to the specific key', () => {
      expect(ctx.errors.payment.isDeclaredError('PAYMENT_ERROR')).toBe(true);
      expect(ctx.errors.payment.isDeclaredError('BAD_PHONE')).toBe(false);

      if (!ctx.errors.payment.isDeclaredError('PAYMENT_ERROR')) {
        assert.fail('expected PAYMENT_ERROR error to match its declared key');
      }

      expectTypeOf(
        ctx.errors.payment.discriminator.key,
      ).toEqualTypeOf<'PAYMENT_ERROR'>();
      expectTypeOf(
        ctx.errors.payment.shape['~'].declaredErrorKey,
      ).toEqualTypeOf<'PAYMENT_ERROR'>();
      expectTypeOf(
        ctx.errors.payment.data.reason,
      ).toEqualTypeOf<'PAYMENT_ERROR'>();
      expect(ctx.errors.payment.data.reason).toBe('PAYMENT_ERROR');
    });

    test('isFormattedError narrows formatted errors', () => {
      expect(ctx.errors.formatted.isFormattedError()).toBe(true);

      if (!ctx.errors.formatted.isFormattedError()) {
        assert.fail('expected formatted error');
      }

      expectTypeOf(
        ctx.errors.formatted.discriminator.kind,
      ).toEqualTypeOf<'formatted'>();
      expect(ctx.errors.formatted.data.foo).toBe('bar');
      expectTypeOf(ctx.errors.formatted.data.foo).toEqualTypeOf<'bar'>();
    });

    test('declared and formatted guards reject unknown errors', () => {
      expect(ctx.errors.unknown.isDeclaredError()).toBe(false);
      expect(ctx.errors.unknown.isFormattedError()).toBe(false);
    });
  });

  describe('combined discrimination', () => {
    test('discriminator and guards agree for BAD_PHONE declared errors', () => {
      expect(ctx.errors.badPhone.isFormattedError()).toBe(false);
      expect(ctx.errors.badPhone.isDeclaredError()).toBe(true);
      expect(ctx.errors.badPhone.isDeclaredError('BAD_PHONE')).toBe(true);
      expect(ctx.errors.badPhone.isDeclaredError('PAYMENT_ERROR')).toBe(false);

      if (!ctx.errors.badPhone.isDeclaredError('BAD_PHONE')) {
        assert.fail('expected BAD_PHONE error to match declared guard');
      }

      const discriminator = ctx.errors.badPhone.discriminator;
      expect(discriminator.kind).toBe('declared');

      if (discriminator.kind !== 'declared') {
        assert.fail('expected declared discriminator');
      }

      expect(discriminator.key).toBe('BAD_PHONE');
    });

    test('discriminator and guards agree for PAYMENT_ERROR declared errors', () => {
      expect(ctx.errors.payment.isFormattedError()).toBe(false);
      expect(ctx.errors.payment.isDeclaredError()).toBe(true);
      expect(ctx.errors.payment.isDeclaredError('PAYMENT_ERROR')).toBe(true);

      if (!ctx.errors.payment.isDeclaredError('PAYMENT_ERROR')) {
        assert.fail('expected PAYMENT_ERROR error to match declared guard');
      }

      const discriminator = ctx.errors.payment.discriminator;
      expect(discriminator.kind).toBe('declared');

      if (discriminator.kind !== 'declared') {
        assert.fail('expected declared discriminator');
      }

      expect(discriminator.key).toBe('PAYMENT_ERROR');
    });

    test('discriminator and guards agree for formatted errors', () => {
      expect(ctx.errors.formatted.isDeclaredError()).toBe(false);
      expect(ctx.errors.formatted.isFormattedError()).toBe(true);

      if (!ctx.errors.formatted.isFormattedError()) {
        assert.fail('expected formatted error');
      }

      const discriminator = ctx.errors.formatted.discriminator;
      expect(discriminator.kind).toBe('formatted');
    });

    test('discriminator and guards agree for unknown errors', () => {
      expect(ctx.errors.unknown.isDeclaredError()).toBe(false);
      expect(ctx.errors.unknown.isFormattedError()).toBe(false);

      const discriminator = ctx.errors.unknown.discriminator;
      expectTypeOf(discriminator).toEqualTypeOf<
        typeof ctx.errors.unknown.discriminator
      >();
      expect(discriminator.kind).toBe('unknown');
      expect(discriminator.shape).toBeUndefined();
    });
  });
});
