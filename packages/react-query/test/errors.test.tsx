import { getServerAndReactClient } from './__reactHelpers';
import { render } from '@testing-library/react';
import type { TRPCClientErrorLike } from '@trpc/client';
import { TRPCClientError } from '@trpc/client';
import { createTRPCDeclaredError, initTRPC } from '@trpc/server';
import type {
  DefaultErrorData,
  Maybe,
} from '@trpc/server/unstable-core-do-not-import';
import { konn } from 'konn';
import React from 'react';
import { z, ZodError } from 'zod';

describe('custom error formatter', () => {
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create({
        errorFormatter({ shape, error }) {
          return {
            ...shape,
            data: {
              ...shape.data,
              foo: 'bar' as const,
              zodError: error.cause instanceof ZodError ? error.cause : null,
            },
          };
        },
      });
      const appRouter = t.router({
        post: t.router({
          byId: t.procedure
            .input(
              z.object({
                // Minimum post id 1
                id: z.number().min(1),
              }),
            )
            .query(() => {
              return '__result' as const;
            }),
        }),
      });

      return getServerAndReactClient(appRouter);
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('query that fails', async () => {
    const { client, App, appRouter } = ctx;
    const queryErrorCallback = vi.fn();
    function MyComponent() {
      const query1 = client.post.byId.useQuery({
        id: 0,
      });

      if (query1.error) {
        expectTypeOf(query1.error.data?.foo).toMatchTypeOf<'bar' | undefined>();
        expectTypeOf(query1.error).toMatchTypeOf<
          TRPCClientErrorLike<typeof appRouter>
        >();
        expectTypeOf(query1.error).toEqualTypeOf<
          TRPCClientError<typeof appRouter>
        >();
        queryErrorCallback(query1.error);
        return (
          <>
            __ERROR_RESULT__:
            <pre>{JSON.stringify(query1.error, null, 4)}</pre>
          </>
        );
      }

      return <>....</>;
    }

    render(
      <App>
        <MyComponent />
      </App>,
    );
    await vi.waitFor(() => {
      expect(queryErrorCallback).toHaveBeenCalled();
    });

    const errorDataResult = queryErrorCallback.mock.calls[0]![0]!;

    expect(errorDataResult).toBeInstanceOf(TRPCClientError);
    expect(errorDataResult).toMatchInlineSnapshot(`
      [TRPCClientError: [
        {
          "code": "too_small",
          "minimum": 1,
          "type": "number",
          "inclusive": true,
          "exact": false,
          "message": "Number must be greater than or equal to 1",
          "path": [
            "id"
          ]
        }
      ]]
    `);
  });
});

describe('no custom formatter', () => {
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.create();
      const appRouter = t.router({
        post: t.router({
          byId: t.procedure
            .input(
              z.object({
                // Minimum post id 1
                id: z.number().min(1),
              }),
            )
            .query(() => {
              return '__result' as const;
            }),
        }),
      });

      return getServerAndReactClient(appRouter);
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('query that fails', async () => {
    const { client, App, appRouter } = ctx;
    const queryErrorCallback = vi.fn();
    function MyComponent() {
      const query1 = client.post.byId.useQuery({
        id: 0,
      });

      if (query1.error) {
        expectTypeOf(query1.error).toMatchTypeOf<
          TRPCClientErrorLike<typeof appRouter>
        >();
        expectTypeOf(query1.error).toEqualTypeOf<
          TRPCClientError<typeof appRouter>
        >();
        queryErrorCallback(query1.error);
        return (
          <>
            __ERROR_RESULT__:
            <pre>{JSON.stringify(query1.error, null, 4)}</pre>
          </>
        );
      }

      return <>....</>;
    }

    render(
      <App>
        <MyComponent />
      </App>,
    );
    await vi.waitFor(() => {
      expect(queryErrorCallback).toHaveBeenCalled();
    });

    const errorDataResult = queryErrorCallback.mock.calls[0]![0]!;

    expect(errorDataResult).toBeInstanceOf(TRPCClientError);
    expect(errorDataResult).toMatchInlineSnapshot(`
      [TRPCClientError: [
        {
          "code": "too_small",
          "minimum": 1,
          "type": "number",
          "inclusive": true,
          "exact": false,
          "message": "Number must be greater than or equal to 1",
          "path": [
            "id"
          ]
        }
      ]]
    `);
  });
});

describe('declared errors', () => {
  const ctx = konn()
    .beforeEach(() => {
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

      return getServerAndReactClient(appRouter);
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('query errors are inferred and can be discriminated', async () => {
    const { client, App, appRouter } = ctx;
    const queryErrorCallback = vi.fn();
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
      const registered = client.registered.useQuery();
      const unregistered = client.unregistered.useQuery();

      if (!registered.error || !unregistered.error) {
        return <>...</>;
      }

      if (registered.error.isDeclaredError()) {
        expect(registered.error.isDeclaredError()).toBe(true);
      }

      if (unregistered.error.isFormattedError()) {
        expect(unregistered.error.isFormattedError()).toBe(true);
      }

      queryErrorCallback({
        registered: registered.error,
        unregistered: unregistered.error,
      });
      return <>done</>;
    }

    render(
      <App>
        <MyComponent />
      </App>,
    );

    await vi.waitFor(() => {
      expect(queryErrorCallback).toHaveBeenCalledOnce();
    });
  });
});

test('types', async () => {
  const t = initTRPC.create();
  const appRouter = t.router({
    post: t.router({
      byId: t.procedure
        .input(
          z.object({
            // Minimum post id 1
            id: z.number().min(1),
          }),
        )
        .query(() => {
          return '__result' as const;
        }),
    }),
  });

  type TRouterError = TRPCClientError<typeof appRouter>;

  type TRouterError__data = TRouterError['data'];
  //      ^?

  expectTypeOf<TRouterError__data>().toMatchTypeOf<Maybe<DefaultErrorData>>();
});
