import { routerToServerAndClientNew, waitError } from './___testHelpers';
import { TRPCClientError } from '@trpc/client';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import { ZodError, z } from 'zod';
import { inferProcedureInput, initTRPC } from '../src/core';

describe('double input validator', () => {
  const t = initTRPC()({
    errorFormatter({ shape, error }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          zod: error.cause instanceof ZodError ? error.cause.flatten() : null,
        },
      };
    },
  });
  const roomQuery = t.procedure.input(
    z.object({
      roomId: z.string(),
    }),
  );
  const appRouter = t.router({
    sendMessage: roomQuery
      .input(
        z.object({
          text: z.string(),
        }),
      )
      .mutation(({ input }) => {
        return input;
      }),
  });
  type AppRouter = typeof appRouter;
  const ctx = konn()
    .beforeEach(() => {
      const opts = routerToServerAndClientNew(appRouter);

      return opts;
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('happy path', async () => {
    const data = {
      roomId: '123',
      text: 'hello',
    };
    const result = await ctx.proxy.sendMessage.mutate(data);

    expect(result).toEqual(data);
    expectTypeOf(result).toMatchTypeOf(data);
  });

  test('sad path', async () => {
    type Input = inferProcedureInput<AppRouter['sendMessage']>;
    {
      // @ts-expect-error missing input params
      const input: Input = {
        roomId: '',
      };
      const error = await waitError<TRPCClientError<AppRouter>>(
        ctx.proxy.sendMessage.mutate(input),
        TRPCClientError,
      );
      expect(error.data!.zod!.fieldErrors).toMatchInlineSnapshot(`
        Object {
          "text": Array [
            "Required",
          ],
        }
      `);
    }
    {
      // @ts-expect-error missing input params
      const input: Input = {
        text: '',
      };

      const error = await waitError<TRPCClientError<AppRouter>>(
        ctx.proxy.sendMessage.mutate(input),
        TRPCClientError,
      );
      expect(error.data!.zod!.fieldErrors).toMatchInlineSnapshot(`
        Object {
          "roomId": Array [
            "Required",
          ],
        }
      `);
    }
  });
});
