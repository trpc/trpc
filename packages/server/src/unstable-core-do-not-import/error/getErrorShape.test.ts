import { initTRPC } from '../initTRPC';
import { getErrorShape } from './getErrorShape';
import { createTRPCDeclaredError } from './TRPCDeclaredError';
import { TRPCError } from './TRPCError';
import {
  procedureErrorKeySymbol,
  TRPCProcedureError,
} from './TRPCProcedureError';

describe(getErrorShape, () => {
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

  test('declared errors bypass the formatter', () => {
    const shape = getErrorShape({
      config: t._config,
      error: new BadPhoneError(),
      type: 'query',
      path: 'registeredBadPhone',
      input: undefined,
      ctx: undefined,
    });

    expect(shape).toEqual({
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
  });

  test('procedure errors use their stored shape', () => {
    const procedureError = new TRPCProcedureError({
      code: -32600,
      message: 'BAD_REQUEST',
      '~': {
        kind: 'formatted',
      },
      data: {
        field: 'email',
      },
    });
    procedureError[procedureErrorKeySymbol] = 'validation_error';

    const shape = getErrorShape({
      config: t._config,
      error: new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        cause: procedureError,
      }),
      type: 'query',
      path: 'validationOnlyBadPhone',
      input: undefined,
      ctx: undefined,
    });

    expect(shape).toEqual({
      code: -32600,
      message: 'BAD_REQUEST',
      '~': {
        kind: 'formatted',
      },
      data: {
        field: 'email',
      },
    });
  });

  test('non-declared errors go through the formatter', () => {
    const shape = getErrorShape({
      config: t._config,
      error: new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'regular error',
      }),
      type: 'query',
      path: 'regularError',
      input: undefined,
      ctx: undefined,
    });

    expect(shape).toMatchObject({
      message: 'regular error',
      '~': {
        kind: 'formatted',
      },
      data: {
        foo: 'bar',
        path: 'regularError',
      },
    });
  });
});
