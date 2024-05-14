import type { inferRouterOutputs } from '@trpc/server';
import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';
import type { ProcedureBuilder } from '@trpc/server/unstable-core-do-not-import';
import { z } from 'zod';

/**
 * See @sentry/node trpc middleware:
 * https://github.com/getsentry/sentry-javascript/blob/6d424571e3cd5e99991b711f4e23d773e321e294/packages/node/src/handlers.ts#L328
 */
interface TrpcMiddlewareArguments<T> {
  path: string;
  type: string;
  next: () => T;
}

/**
 * See @sentry/node trpc middleware:
 * https://github.com/getsentry/sentry-javascript/blob/6d424571e3cd5e99991b711f4e23d773e321e294/packages/node/src/handlers.ts#L328
 */
function sentryTrpcMiddleware(_options: any) {
  return function <T>({ path, type, next }: TrpcMiddlewareArguments<T>): T {
    path;
    type;
    next;

    // This function is effectively what @sentry/node does to provide its trpc middleware.
    return null as any as T;
  };
}

type Context = {
  some: 'prop';
};

describe('context inference w/ middlewares', () => {
  test('a base procedure using a generically constructed middleware should be extensible using another middleware', async () => {
    const t = initTRPC.context<Context>().create();

    const baseMiddleware = t.middleware(sentryTrpcMiddleware({ foo: 'bar' }));

    const someMiddleware = t.middleware(async (opts) => {
      return opts.next({
        ctx: {
          object: {
            a: 'b',
          },
        },
      });
    });

    const baseProcedure = t.procedure.use(baseMiddleware);
    const bazQuxProcedure = baseProcedure.use(someMiddleware);

    const appRouter = t.router({
      foo: bazQuxProcedure.input(z.string()).query(({ ctx }) => ctx),
    });
    type Output = inferRouterOutputs<typeof appRouter>['foo'];

    expectTypeOf<Output>().toEqualTypeOf<{
      object: { a: string };
      some: 'prop';
    }>();
  });

  test('using generically constructed tRPC instance should have correctly inferred context', () => {
    interface CreateInnerContextOptions
      extends Partial<CreateFastifyContextOptions> {}

    async function createInternalContext<T>(
      createContextInner: (opts?: CreateInnerContextOptions) => T,
      opts: any,
    ) {
      const contextInner = createContextInner();
      return {
        ...contextInner,
        req: opts.req,
        res: opts.res,
      };
    }

    type LocalContext<T> = Awaited<ReturnType<typeof createInternalContext<T>>>;

    type Context2<T> = T extends infer R ? LocalContext<R> : never;

    function makeTRPC<T extends object>(
      config?: Parameters<typeof initTRPC.create>[0],
    ) {
      const t = initTRPC.context<Context2<T>>().create({
        errorFormatter(error) {
          return config?.errorFormatter?.(error) ?? error.shape;
        },
      });

      function withAuth2<
        TContext extends {
          req?: any;
        },
        TMeta,
        TContextOverrides,
        TInputIn,
        TInputOut,
        TOutputIn,
        TOutputOut,
      >(
        builder: ProcedureBuilder<
          TContext,
          TMeta,
          TContextOverrides,
          TInputIn,
          TInputOut,
          TOutputIn,
          TOutputOut,
          false
        >,
      ) {
        return builder.use(async (opts) => {
          if (!opts.ctx.req) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'missing req object',
            });
          }
          try {
            return opts.next({
              ctx: {
                auth: {
                  stuff: 'here',
                },
              },
            });
          } catch (e) {
            throw new TRPCError({ code: 'UNAUTHORIZED' });
          }
        });
      }

      return {
        router: t.router,
        publicProcedure: t.procedure,
        createProtectedProcedure: () => {
          const decorated = withAuth2(t.procedure);
          return decorated;
        },
      };
    }

    const t = makeTRPC<{ mything: string }>();
    t.publicProcedure.query(({ ctx }) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        mything: string;
        req: any;
        res: any;
      }>();
    });
    t.createProtectedProcedure().query(({ ctx }) => {
      expectTypeOf(ctx).toEqualTypeOf<{
        mything: string;
        auth: {
          stuff: string;
        };
        req: any;
        res: any;
      }>();
    });
  });
});
