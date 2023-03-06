import { routerToServerAndClientNew } from './___testHelpers';
import { TRPCError, initTRPC } from '@trpc/server/src';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';

type User = {
  id: string;
  name: string;
};
type Context = {
  user: User | null;
};
const mockUser: User = {
  id: '123',
  name: 'John Doe',
};
const ctx = konn()
  .beforeEach(() => {
    const t = initTRPC.context<Context>().create();

    const isAuthed = t.middleware(({ next, ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
        });
      }
      return next({
        ctx: {
          user: ctx.user,
        },
      });
    });

    const addFoo = t.middleware(({ next }) => {
      return next({
        ctx: {
          foo: 'bar' as const,
        },
      });
    });

    const proc1 = t.procedure.use(isAuthed);
    const proc2 = t.procedure.use(addFoo);
    const combined = t.procedure.unstable_concat(proc1).unstable_concat(proc2);

    const appRouter = t.router({
      getContext: combined.mutation(({ ctx }) => {
        return ctx;
      }),
    });

    const opts = routerToServerAndClientNew(appRouter, {
      server: {
        createContext() {
          return {
            user: mockUser,
          };
        },
      },
    });
    const client = opts.client;

    return {
      close: opts.close,
      client,
      proxy: opts.proxy,
    };
  })
  .afterEach(async (ctx) => {
    await ctx?.close?.();
  })
  .done();

test('decorate independently', async () => {
  const result = await ctx.proxy.getContext.mutate();

  expect(result).toEqual({
    user: mockUser,
    foo: 'bar',
  });

  expectTypeOf(result).toEqualTypeOf<{
    user: User | null;

    foo: 'bar';
  }>();
});
