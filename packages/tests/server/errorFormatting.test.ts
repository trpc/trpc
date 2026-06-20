import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { isTRPCClientError, TRPCClientError } from '@trpc/client';
import type { AnyRouter, inferRouterError } from '@trpc/server';
import {
  createTRPCDeclaredError,
  initTRPC,
  StandardSchemaV1Error,
  TRPCError,
} from '@trpc/server';
import type {
  DefaultErrorData,
  DefaultErrorShape,
} from '@trpc/server/unstable-core-do-not-import';
import { konn } from 'konn';
import * as v from 'valibot';
import { vi } from 'vitest';
import { z, ZodError } from 'zod';

describe('no custom error formatter', () => {
  const t = initTRPC.create();

  const appRouter = t.router({
    greeting: t.procedure.query(() => {
      if (Math.random() >= 0) {
        // always fails
        throw new Error('Fails');
      }
      return 'never';
    }),
  });

  test('infer errors with type guard', async () => {
    await using ctx = testServerAndClientResource(appRouter);
    const err = await waitError(ctx.client.greeting.query());

    if (!isTRPCClientError<typeof appRouter>(err)) {
      throw new Error('Bad');
    }
    expectTypeOf(err.data).not.toBeAny();
    expectTypeOf(err.shape).not.toBeAny();
    expectTypeOf(err.data!).toMatchTypeOf<DefaultErrorData>();
    expectTypeOf(err.shape!).toMatchTypeOf<DefaultErrorShape>();
  });
});

describe('with custom error formatter', () => {
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

  const appRouter = t.router({
    greeting: t.procedure.query(() => {
      if (Math.random() >= 0) {
        // always fails
        throw new Error('Fails');
      }
      return 'never';
    }),
  });

  test('infer errors with type guard', async () => {
    await using ctx = testServerAndClientResource(appRouter);
    const err = await waitError(ctx.client.greeting.query());

    if (!isTRPCClientError<typeof appRouter>(err)) {
      throw new Error('Bad');
    }
    expectTypeOf(err.data).not.toBeAny();
    expectTypeOf(err.shape).not.toBeAny();
    expectTypeOf(err.data!).toMatchTypeOf<DefaultErrorData>();
    expectTypeOf(err.shape!).toMatchTypeOf<DefaultErrorShape>();
    expectTypeOf(err.data!.foo).toEqualTypeOf<'bar'>();

    err.data!.stack = '[redacted]';

    expect(err.data).toMatchInlineSnapshot(`
      Object {
        "code": "INTERNAL_SERVER_ERROR",
        "foo": "bar",
        "httpStatus": 500,
        "path": "greeting",
        "stack": "[redacted]",
      }
    `);
    expect(err.shape).toMatchInlineSnapshot(`
      Object {
        "code": -32603,
        "data": Object {
          "code": "INTERNAL_SERVER_ERROR",
          "foo": "bar",
          "httpStatus": 500,
          "path": "greeting",
          "stack": "[redacted]",
        },
        "message": "Fails",
        "~": Object {
          "kind": "formatted",
        },
      }
    `);
  });
});

describe('with per-procedure declared errors', () => {
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

  const ValidationError = createTRPCDeclaredError({
    code: 'BAD_REQUEST',
    key: 'VALIDATION_ERROR',
  })
    .data<{
      field: string;
    }>()
    .create();

  type GlobalFormattedShape = DefaultErrorShape & {
    data: DefaultErrorData & {
      foo: 'bar';
    };
  };

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

  const chainedErrorsProcedure = t.procedure
    .errors([BadPhoneError])
    .input(
      z.object({
        source: z.enum(['middleware', 'resolver']),
      }),
    )
    .use((opts) => {
      if (opts.input.source === 'middleware') {
        throw new BadPhoneError();
      }
      return opts.next();
    })
    .errors([ValidationError])
    .query(({ input }) => {
      throw new ValidationError({ field: input.source });
    });

  const appRouter = t.router({
    registeredBadPhone: t.procedure.errors([BadPhoneError]).query(() => {
      throw new BadPhoneError();
    }),
    unregisteredBadPhone: t.procedure.query(() => {
      throw new BadPhoneError();
    }),
    validationOnlyBadPhone: t.procedure.errors([ValidationError]).query(() => {
      throw new BadPhoneError();
    }),
    chainedErrors: chainedErrorsProcedure,
    regularError: t.procedure.query(() => {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Something broke',
      });
    }),
  });

  test('declared errors bypass formatter and infer as router union', async () => {
    expectTypeOf<inferRouterError<typeof appRouter>>().not.toBeAny();

    await using ctx = testServerAndClientResource(appRouter);
    const error = await waitError(ctx.client.registeredBadPhone.query());
    assert(isTRPCClientError<typeof appRouter>(error));

    expectTypeOf(error.shape).not.toBeAny();
    expectTypeOf(error.data).not.toBeAny();
    expect(error.shape).toMatchInlineSnapshot(`
      Object {
        "code": -32001,
        "data": Object {
          "reason": "BAD_PHONE",
        },
        "message": "UNAUTHORIZED",
        "~": Object {
          "declaredErrorKey": "BAD_PHONE",
          "kind": "declared",
        },
      }
    `);
  });

  test('unregistered declared errors become internal server errors, use the formatter, and warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      //
    });
    try {
      await using ctx = testServerAndClientResource(appRouter);

      const unregisteredErr = await waitError(
        ctx.client.unregisteredBadPhone.query(),
      );
      const wrongChainErr = await waitError(
        ctx.client.validationOnlyBadPhone.query(),
      );

      assert(isTRPCClientError<typeof appRouter>(unregisteredErr));
      assert(isTRPCClientError<typeof appRouter>(wrongChainErr));

      expect(unregisteredErr.shape?.code).toBe(-32603);
      expect(unregisteredErr.data).toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        foo: 'bar',
        httpStatus: 500,
        path: 'unregisteredBadPhone',
      });

      expect(wrongChainErr.shape?.code).toBe(-32603);
      expect(wrongChainErr.data).toMatchObject({
        code: 'INTERNAL_SERVER_ERROR',
        foo: 'bar',
        httpStatus: 500,
        path: 'validationOnlyBadPhone',
      });

      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy.mock.calls[0]?.[0]).toContain(
        'Unregistered declared error',
      );
      expect(warnSpy.mock.calls[1]?.[0]).toContain(
        'Unregistered declared error',
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('regular errors still go through formatter', async () => {
    await using ctx = testServerAndClientResource(appRouter);
    const err = await waitError(ctx.client.regularError.query());
    assert(isTRPCClientError<typeof appRouter>(err));

    // Regular errors go through the formatter (has foo: 'bar')
    const data = err.data as GlobalFormattedShape['data'];
    expect(data?.foo).toBe('bar');
    expect(data?.path).toBe('regularError');
  });

  test('procedureBuilder stores registrations per procedure', () => {
    expect(
      appRouter._def.procedures.registeredBadPhone._def.declaredErrors,
    ).toEqual([BadPhoneError]);
    expect(
      appRouter._def.procedures.validationOnlyBadPhone._def.declaredErrors,
    ).toEqual([ValidationError]);
    expect(
      appRouter._def.procedures.unregisteredBadPhone._def.declaredErrors,
    ).toEqual([]);
  });

  test('chained .errors() accrues registrations instead of squashing', async () => {
    expect(appRouter._def.procedures.chainedErrors._def.declaredErrors).toEqual(
      [BadPhoneError, ValidationError],
    );

    await using ctx = testServerAndClientResource(appRouter);

    const middlewareErr = await waitError(
      ctx.client.chainedErrors.query({ source: 'middleware' }),
    );
    const resolverErr = await waitError(
      ctx.client.chainedErrors.query({ source: 'resolver' }),
    );

    assert(isTRPCClientError<typeof appRouter>(middlewareErr));
    assert(isTRPCClientError<typeof appRouter>(resolverErr));

    expect(middlewareErr.shape).toEqual({
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
    expect(resolverErr.shape).toEqual({
      code: -32600,
      message: 'BAD_REQUEST',
      '~': {
        kind: 'declared',
        declaredErrorKey: 'VALIDATION_ERROR',
      },
      data: {
        field: 'resolver',
      },
    });
  });

  test('declared errors work with instanceof', () => {
    const err = new BadPhoneError();
    expect(err instanceof TRPCError).toBe(true);
    expect(err instanceof BadPhoneError).toBe(true);
    expect(err instanceof Error).toBe(true);
    expect(err.reason).toBe('BAD_PHONE');
    expect(err.code).toBe('UNAUTHORIZED');
  });
});

test('custom error formatter with standard schema v1 (valibot)', async () => {
  const t = initTRPC.create({
    errorFormatter(opts) {
      return {
        ...opts.shape,
        data: {
          ...opts.shape.data,
          standardSchemaV1Error:
            opts.error.cause instanceof StandardSchemaV1Error
              ? {
                  issues: opts.error.cause.issues,
                }
              : null,
        },
      };
    },
  });

  const appRouter = t.router({
    greeting: t.procedure.input(v.number()).query((opts) => opts.input),
  });

  await using ctx = testServerAndClientResource(appRouter);

  const err = await waitError(
    ctx.client.greeting.query(
      // @ts-expect-error this should only accept a number
      '123',
    ),
    TRPCClientError<typeof appRouter>,
  );

  assert(err.data?.standardSchemaV1Error);
  expect(err.data.standardSchemaV1Error).toMatchInlineSnapshot(`
    Object {
      "issues": Array [
        Object {
          "expected": "number",
          "input": "123",
          "kind": "schema",
          "message": "Invalid type: Expected number but received "123"",
          "received": ""123"",
          "type": "number",
        },
      ],
    }
  `);
});

describe('custom error sub-classes', () => {
  class MyCustomAuthError extends TRPCError {
    public readonly reason;
    public constructor(opts: {
      message?: string;
      reason: 'BAD_PHONE' | 'INVALID_AREA_CODE';
      cause?: unknown;
    }) {
      super({
        ...opts,
        code: 'UNAUTHORIZED',
        message: opts.message ?? opts.reason,
      });

      this.reason = opts.reason;
    }
  }
  const t = initTRPC.create({
    errorFormatter(opts) {
      return {
        ...opts.shape,
        data: {
          ...opts.shape.data,
          reason:
            opts.error instanceof MyCustomAuthError ? opts.error.reason : null,
        },
      };
    },
  });

  const appRouter = t.router({
    greeting: t.procedure.query(() => {
      if (Math.random() >= 0) {
        // always fails
        throw new MyCustomAuthError({
          reason: 'BAD_PHONE',
        });
      }
      return 'never';
    }),
  });
  test('infer errors with type guard', async () => {
    await using ctx = testServerAndClientResource(appRouter);
    const err = await waitError(ctx.client.greeting.query());

    if (!isTRPCClientError<typeof appRouter>(err)) {
      throw new Error('Bad');
    }
    expectTypeOf(err.data).not.toBeAny();
    expectTypeOf(err.shape).not.toBeAny();
    expectTypeOf(err.data!).toMatchTypeOf<DefaultErrorData>();
    expectTypeOf(err.shape!).toMatchTypeOf<DefaultErrorShape>();
    expectTypeOf(err.data!.reason).toEqualTypeOf<
      'BAD_PHONE' | 'INVALID_AREA_CODE' | null
    >();

    err.data!.stack = '[redacted]';

    expect(err.shape!.data.httpStatus).toBe(401);
    expect(err.shape!.data.reason).toBe('BAD_PHONE');

    expect(err.shape).toMatchInlineSnapshot(`
      Object {
        "code": -32001,
        "data": Object {
          "code": "UNAUTHORIZED",
          "httpStatus": 401,
          "path": "greeting",
          "reason": "BAD_PHONE",
          "stack": "[redacted]",
        },
        "message": "BAD_PHONE",
        "~": Object {
          "kind": "formatted",
        },
      }
    `);
  });
});

describe('zod errors according to docs', () => {
  const t = initTRPC.create({
    errorFormatter(opts) {
      const { shape, error } = opts;
      return {
        ...shape,
        data: {
          ...shape.data,
          zodError:
            error.code === 'BAD_REQUEST' && error.cause instanceof ZodError
              ? error.cause.flatten()
              : null,
        },
      };
    },
  });

  const appRouter = t.router({
    greeting: t.procedure.input(z.number().min(10)).query((opts) => opts.input),
  });
  test('zod errors according to docs', async () => {
    await using ctx = testServerAndClientResource(appRouter);
    // bad query
    const err = await waitError(ctx.client.greeting.query(5));
    assert(isTRPCClientError<typeof appRouter>(err));
    assert(err.data);
    assert(err.data.zodError);

    expectTypeOf(err.data.zodError).toMatchTypeOf<
      z.core.$ZodFlattenedError<any>
    >();
    expect(err.data?.zodError).toMatchInlineSnapshot(`
      Object {
        "fieldErrors": Object {},
        "formErrors": Array [
          "Too small: expected number to be >=10",
        ],
      }
    `);

    // good
    expect(await ctx.client.greeting.query(10)).toBe(10);
  });
});

describe('declared error key narrowing', () => {
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

  type ContactInvalidData =
    | {
        channel: 'phone';
        phoneNumber: string;
      }
    | {
        channel: 'email';
        emailAddress: string;
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

  test('isTRPCClientError narrows same-key declared errors on one procedure to the matching union', async () => {
    await using ctx = testServerAndClientResource(appRouter);

    const err = await waitError(
      ctx.client.duplicateKeySameProcedure.query({
        channel: 'phone',
      }),
    );

    assert(isTRPCClientError<typeof appRouter>(err));
    assert(err.isDeclaredError('CONTACT_INVALID'));

    expectTypeOf(err.data).toEqualTypeOf<ContactInvalidData>();
    expect(err.data).toEqual({
      channel: 'phone',
      phoneNumber: '+441234567890',
    });
  });

  test('isTRPCClientError narrows same-key declared errors across procedures to the matching router union', async () => {
    await using ctx = testServerAndClientResource(appRouter);

    const phoneErr = await waitError(
      ctx.client.duplicateKeyPhoneProcedure.query(),
    );
    const emailErr = await waitError(
      ctx.client.duplicateKeyEmailProcedure.query(),
    );

    assert(isTRPCClientError<typeof appRouter>(phoneErr));
    assert(isTRPCClientError<typeof appRouter>(emailErr));
    assert(phoneErr.isDeclaredError('CONTACT_INVALID'));
    assert(emailErr.isDeclaredError('CONTACT_INVALID'));

    expectTypeOf(phoneErr.data).toEqualTypeOf<ContactInvalidData>();
    expectTypeOf(emailErr.data).toEqualTypeOf<ContactInvalidData>();

    expect(phoneErr.data).toEqual({
      channel: 'phone',
      phoneNumber: '+441234567890',
    });
    expect(emailErr.data).toEqual({
      channel: 'email',
      emailAddress: 'bad@example.com',
    });
  });
});
