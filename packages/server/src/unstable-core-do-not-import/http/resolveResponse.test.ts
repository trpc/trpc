import { describe, expect, test, vi } from 'vitest';
import { createTRPCDeclaredError } from '../error/TRPCDeclaredError';
import { initTRPC } from '../initTRPC';
import { resolveResponse } from './resolveResponse';

function createTestRequest(url: string, init?: RequestInit) {
  return new Request(url, {
    method: 'GET',
    ...init,
  });
}

describe(resolveResponse, () => {
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

  test('pre-procedure registered declared errors are propagated unchanged', async () => {
    const appRouter = t.router({
      registered: t.procedure.errors([BadPhoneError]).query(() => 'ok'),
    });

    const onError = vi.fn();
    const responseMeta = vi.fn(() => ({}));

    const response = await resolveResponse({
      router: appRouter,
      req: createTestRequest('http://localhost/registered'),
      path: 'registered',
      createContext: async () => ({}),
      error: new BadPhoneError(),
      onError,
      responseMeta,
    });

    const body = await response.json();

    expect(body.error).toEqual({
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
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'UNAUTHORIZED',
        }),
        path: 'registered',
        type: 'query',
      }),
    );
    expect(responseMeta).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: [
          expect.objectContaining({
            code: 'UNAUTHORIZED',
          }),
        ],
      }),
    );
  });

  test('pre-procedure unregistered declared errors are downgraded before propagation', async () => {
    const appRouter = t.router({
      unregistered: t.procedure.query(() => 'ok'),
    });

    const onError = vi.fn();
    const responseMeta = vi.fn(() => ({}));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      //
    });

    try {
      const response = await resolveResponse({
        router: appRouter,
        req: createTestRequest('http://localhost/unregistered'),
        path: 'unregistered',
        createContext: async () => ({}),
        error: new BadPhoneError(),
        onError,
        responseMeta,
      });

      const body = await response.json();

      expect(body.error).toMatchObject({
        code: -32603,
        message: 'An unrecognized error occurred',
        data: {
          code: 'INTERNAL_SERVER_ERROR',
          foo: 'bar',
          httpStatus: 500,
          path: 'unregistered',
        },
      });
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INTERNAL_SERVER_ERROR',
            cause: expect.any(BadPhoneError),
          }),
          path: 'unregistered',
          type: 'query',
        }),
      );
      expect(responseMeta).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: [
            expect.objectContaining({
              code: 'INTERNAL_SERVER_ERROR',
              cause: expect.any(BadPhoneError),
            }),
          ],
        }),
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('top-level request failures downgrade declared errors before propagation', async () => {
    const appRouter = t.router({
      hello: t.procedure.query(() => 'ok'),
    });

    const onError = vi.fn();
    const responseMeta = vi.fn(() => ({}));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      //
    });

    try {
      const response = await resolveResponse({
        router: appRouter,
        req: createTestRequest('http://localhost/hello'),
        path: 'hello',
        createContext: async () => {
          throw new BadPhoneError();
        },
        error: null,
        onError,
        responseMeta,
      });

      const body = await response.json();

      expect(body.error).toMatchObject({
        code: -32603,
        message: 'An unrecognized error occurred',
        data: {
          code: 'INTERNAL_SERVER_ERROR',
          foo: 'bar',
          httpStatus: 500,
          path: 'hello',
        },
      });
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INTERNAL_SERVER_ERROR',
            cause: expect.any(BadPhoneError),
          }),
          path: 'hello',
        }),
      );
      expect(responseMeta).toHaveBeenCalledWith(
        expect.objectContaining({
          errors: [
            expect.objectContaining({
              code: 'INTERNAL_SERVER_ERROR',
            }),
          ],
        }),
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('JSONL late registered declared errors are propagated unchanged', async () => {
    const appRouter = t.router({
      late: t.procedure.errors([BadPhoneError]).query(() => {
        return {
          later: Promise.reject(new BadPhoneError()),
        };
      }),
    });

    const onError = vi.fn();

    const response = await resolveResponse({
      router: appRouter,
      req: createTestRequest('http://localhost/late?batch=1', {
        headers: {
          accept: 'application/jsonl',
        },
      }),
      path: 'late',
      createContext: async () => ({}),
      error: null,
      onError,
    });

    const body = await response.text();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'UNAUTHORIZED',
        }),
        path: 'late',
        type: 'query',
      }),
    );
    expect(body).toContain('UNAUTHORIZED');
    expect(body).toContain('BAD_PHONE');
  });

  test('JSONL late unregistered declared errors are downgraded before propagation', async () => {
    const appRouter = t.router({
      late: t.procedure.query(() => {
        return {
          later: Promise.reject(new BadPhoneError()),
        };
      }),
    });

    const onError = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      //
    });

    try {
      const response = await resolveResponse({
        router: appRouter,
        req: createTestRequest('http://localhost/late?batch=1', {
          headers: {
            accept: 'application/jsonl',
          },
        }),
        path: 'late',
        createContext: async () => ({}),
        error: null,
        onError,
      });

      const body = await response.text();

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INTERNAL_SERVER_ERROR',
            cause: expect.any(BadPhoneError),
          }),
          path: 'late',
          type: 'query',
        }),
      );
      expect(body).toContain('INTERNAL_SERVER_ERROR');
      expect(body).toContain('An unrecognized error occurred');
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('SSE late registered declared errors are propagated unchanged', async () => {
    const appRouter = t.router({
      late: t.procedure
        .errors([BadPhoneError])
        .subscription(async function* () {
          yield 1;
          throw new BadPhoneError();
        }),
    });

    const onError = vi.fn();

    const response = await resolveResponse({
      router: appRouter,
      req: createTestRequest('http://localhost/late'),
      path: 'late',
      createContext: async () => ({}),
      error: null,
      onError,
    });

    const body = await response.text();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'UNAUTHORIZED',
        }),
        path: 'late',
        type: 'subscription',
      }),
    );
    expect(body).toContain('UNAUTHORIZED');
    expect(body).toContain('BAD_PHONE');
  });

  test('SSE late unregistered declared errors are downgraded before propagation', async () => {
    const appRouter = t.router({
      late: t.procedure.subscription(async function* () {
        yield 1;
        throw new BadPhoneError();
      }),
    });

    const onError = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      //
    });

    try {
      const response = await resolveResponse({
        router: appRouter,
        req: createTestRequest('http://localhost/late'),
        path: 'late',
        createContext: async () => ({}),
        error: null,
        onError,
      });

      const body = await response.text();

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INTERNAL_SERVER_ERROR',
            cause: expect.any(BadPhoneError),
          }),
          path: 'late',
          type: 'subscription',
        }),
      );
      expect(body).toContain('INTERNAL_SERVER_ERROR');
      expect(body).toContain('An unrecognized error occurred');
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
