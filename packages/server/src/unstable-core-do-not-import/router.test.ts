import { initTRPC } from '..';

const t = initTRPC.create();

describe('router', () => {
  test('is a reserved word', async () => {
    expect(() => {
      return t.router({
        then: t.procedure.query(() => 'hello'),
      });
    }).toThrowErrorMatchingInlineSnapshot(
      `[Error: Reserved words used in \`router({})\` call: then]`,
    );
  });

  // Regression https://github.com/trpc/trpc/pull/2562
  test('because it creates async fns that returns proxy objects', async () => {
    const appRouter = t.router({});
    const asyncFnThatReturnsCaller = async () => appRouter.createCaller({});

    await asyncFnThatReturnsCaller();
  });

  test('should not duplicate key', async () => {
    expect(() =>
      t.router({
        foo: t.router({
          '.bar': t.procedure.query(() => 'bar' as const),
        }),
        'foo.': t.router({
          bar: t.procedure.query(() => 'bar' as const),
        }),
      }),
    ).toThrow('Duplicate key: foo..bar');
  });
});

describe('RouterCaller', () => {
  describe('onError handler', () => {
    const router = t.router({
      thrower: t.procedure.query(() => {
        throw new Error('error');
      }),
    });

    const factoryHandler = vi.fn();
    const callerHandler = vi.fn();
    const ctx = {
      foo: 'bar',
    };

    const caller = t.createCallerFactory(router, { onError: factoryHandler })(
      ctx,
      { onError: callerHandler },
    );

    test('should call the onError handler when an error is thrown, rethrowing the error aftwards', async () => {
      await expect(caller.thrower()).rejects.toThrow('error');

      expect(factoryHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            cause: expect.objectContaining({
              message: 'error',
            }),
          }),
          ctx,
          path: 'thrower',
          type: 'query',
        }),
      );

      expect(callerHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            cause: expect.objectContaining({
              message: 'error',
            }),
          }),
          ctx,
          path: 'thrower',
          type: 'query',
        }),
      );
    });

    test('should not intercept errors thrown from the onError handler', async () => {
      callerHandler.mockImplementationOnce(() => {
        throw new Error('custom error');
      });

      await expect(caller.thrower()).rejects.toThrow('custom error');
    });
  });
});
