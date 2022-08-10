import { getServerAndReactClient } from './__reactHelpers';
import { render, waitFor } from '@testing-library/react';
import { TRPCClientError } from '@trpc/client';
import { TRPCClientErrorLike } from '@trpc/client';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React from 'react';
import { ZodError, z } from 'zod';
import { initTRPC } from '../../src';

describe('custom error formatter', () => {
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC()({
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
        /**
         * @deprecated
         */
        deprecatedRouter: t.router({
          /**
           * @deprecated
           */
          deprecatedProcedure: t.procedure.query(() => '..'),
        }),
      });

      return getServerAndReactClient(appRouter);
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('query that fails', async () => {
    const { proxy, App, appRouter } = ctx;
    const queryErrorCallback = jest.fn();
    function MyComponent() {
      const query1 = proxy.post.byId.useQuery({
        id: 0,
      });

      if (query1.error) {
        expectTypeOf(query1.error['data'].foo).toMatchTypeOf<'bar'>();
        expectTypeOf(query1.error).toMatchTypeOf<
          TRPCClientErrorLike<typeof appRouter>
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
    await waitFor(() => {
      expect(queryErrorCallback).toHaveBeenCalled();
    });

    const errorDataResult = queryErrorCallback.mock.calls[0][0];

    expect(errorDataResult).toBeInstanceOf(TRPCClientError);
    expect(errorDataResult).toMatchInlineSnapshot(`
      [TRPCClientError: [
        {
          "code": "too_small",
          "minimum": 1,
          "type": "number",
          "inclusive": true,
          "message": "Number must be greater than or equal to 1",
          "path": [
            "id"
          ]
        }
      ]]
    `);
  });
});
