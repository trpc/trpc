import { vi } from 'vitest';
import { initTRPC } from '../initTRPC';
import { getErrorShape } from './getErrorShape';
import { createTRPCDeclaredError } from './TRPCDeclaredError';

describe(getErrorShape, () => {
  const BadPhoneError = createTRPCDeclaredError('UNAUTHORIZED')
    .data<{
      reason: 'BAD_PHONE';
    }>()
    .create({
      constants: {
        reason: 'BAD_PHONE' as const,
      },
    });

  const ValidationError = createTRPCDeclaredError('BAD_REQUEST')
    .data<{
      field: string;
    }>()
    .create();

  const t = initTRPC.create({
    errorFormatter({ shape }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          foo: 'bar' as const,
        },
      };
    },
  });

  test('registered declared errors bypass the formatter', () => {
    const shape = getErrorShape({
      config: t._config,
      error: new BadPhoneError(),
      type: 'query',
      path: 'registeredBadPhone',
      input: undefined,
      ctx: undefined,
      declaredErrors: [BadPhoneError],
    });

    expect(shape).toEqual({
      code: -32001,
      message: 'UNAUTHORIZED',
      data: {
        reason: 'BAD_PHONE',
      },
    });
  });

  test('unregistered declared errors become internal server errors, go through the formatter, and warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      //
    });

    try {
      const shape = getErrorShape({
        config: t._config,
        error: new BadPhoneError(),
        type: 'query',
        path: 'unregisteredBadPhone',
        input: undefined,
        ctx: undefined,
        declaredErrors: [],
      });

      expect(shape).toMatchObject({
        code: -32603,
        message: 'An unrecognized error occured',
        data: {
          code: 'INTERNAL_SERVER_ERROR',
          foo: 'bar',
          httpStatus: 500,
          path: 'unregisteredBadPhone',
        },
      });
      expect(shape.data).not.toHaveProperty('reason');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0]?.[0]).toContain(
        'Unregistered declared error',
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('registration is checked against the current procedure chain', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      //
    });

    try {
      const shape = getErrorShape({
        config: t._config,
        error: new BadPhoneError(),
        type: 'query',
        path: 'validationOnlyBadPhone',
        input: undefined,
        ctx: undefined,
        declaredErrors: [ValidationError],
      });

      expect(shape).toMatchObject({
        code: -32603,
        data: {
          code: 'INTERNAL_SERVER_ERROR',
          foo: 'bar',
          httpStatus: 500,
          path: 'validationOnlyBadPhone',
        },
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
